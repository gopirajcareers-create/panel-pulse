/**
 * Recover a JSON object from a model response that is *nearly* JSON.
 *
 * Shared by l1ScoringService and l2ScoringService, which both ask the model to quote
 * the transcript verbatim inside JSON strings. That is the whole problem: a panelist
 * who says  You mentioned the "N+1 problem"  produces an evidence string containing a
 * raw double quote, and an 8B model escapes it only most of the time. When it doesn't,
 * the string terminates early and everything after it is a syntax error —
 *
 *     "quote": "asked about the "N+1 problem" here", "topic": "depth"
 *                                  ^ string ends here, so `N+1` is parsed as a key
 *
 * which surfaces as `Expected ':' after property name`. A whole evaluation used to fail
 * on that, and because scoring pins seed and temperature 0, retrying returns the
 * byte-identical broken response — a retry loop cannot help. Repair is the only
 * recovery available.
 *
 * Every candidate repair below is validated by JSON.parse rather than trusted: the
 * function returns parsed objects, never patched text, so a repair that "looks right"
 * but doesn't parse is discarded instead of propagated.
 */
'use strict';

/** True if `ch` can legitimately begin a JSON value or key. */
function _startsValue(ch) {
  return ch === '"' || ch === '{' || ch === '[' || ch === '-' || (ch >= '0' && ch <= '9');
}

/**
 * Escape the quote characters the model left raw inside strings.
 *
 * Walks the text tracking string state. On a `"` while inside a string, decide whether
 * it really closes that string by looking at what follows: a closing quote is followed
 * by `:` `,` `}` `]` or end-of-input. The `,` case is the ambiguous one — in
 *
 *     "he said "yes", and left"
 *
 * the quote after `yes` is followed by a comma yet is NOT a terminator. So for `,` we
 * additionally require that what comes after it can start a value or key; ` and left"`
 * begins with `a`, which cannot, so that quote is treated as embedded.
 *
 * Raw newlines and tabs inside strings are escaped in the same pass — the prompt
 * forbids them, which means they show up occasionally.
 */
function _escapeStrayQuotes(src) {
  let out = '';
  let inStr = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (!inStr) {
      out += ch;
      if (ch === '"') inStr = true;
      continue;
    }

    if (ch === '\\') {                       // already-escaped pair: copy both
      out += ch + (src[i + 1] || '');
      i++;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      const next = src[j];

      let terminates;
      if (next === undefined || next === ':' || next === '}' || next === ']') {
        terminates = true;
      } else if (next === ',') {
        let k = j + 1;
        while (k < src.length && /\s/.test(src[k])) k++;
        // A `,` straight before `}` or `]` is a trailing comma — another fault the model
        // makes, and one that still means this quote closed the string. Reading it as an
        // embedded quote instead leaves the string open and corrupts the whole rest of
        // the document, so the two faults have to be recognised together.
        terminates = src[k] === '}' || src[k] === ']' ||
          // `true` / `false` / `null` can follow a comma too, though not in these schemas.
          _startsValue(src[k]) || /^(true|false|null)/.test(src.slice(k, k + 5));
      } else {
        terminates = false;                  // e.g. `"N+1 problem"` mid-sentence
      }

      if (terminates) { out += ch; inStr = false; } else { out += '\\"'; }
      continue;
    }

    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') { continue; }
    if (ch === '\t') { out += '\\t'; continue; }
    out += ch;
  }

  return out;
}

/** Drop `,` that sits immediately before `}` or `]`, outside of strings. */
function _stripTrailingCommas(src) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') { out += src[i + 1] || ''; i++; }
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === ',') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '}' || src[j] === ']') continue;   // trailing comma — drop it
    }
    out += ch;
  }
  return out;
}

/**
 * Slice the outermost balanced `{...}`, ignoring braces inside strings.
 * Returns null when no complete object is present (a response cut off mid-object).
 */
function _braceSlice(str) {
  const start = str.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return str.slice(start, i + 1);
  }
  return null;
}

/**
 * Parse a model response into an object.
 *
 * Returns `{ value, method, error }`. `value` is null when nothing parsed, and `method`
 * names which strategy succeeded so callers can log that a repair was needed — a silent
 * repair hides a prompt that has started drifting. `error` carries the *original*
 * JSON.parse message (position included), which the old parser threw away and left
 * nobody able to tell a stray quote from a truncated response.
 */
function parseLLMJSON(text) {
  const str = String(text || '');
  const candidates = [];

  const block = str.match(/```json\s*([\s\S]*?)```/i);
  if (block) candidates.push(['markdown-block', block[1].trim()]);

  const sliced = _braceSlice(str);
  if (sliced) candidates.push(['brace-scan', sliced]);
  // A truncated response has no balanced object; still worth trying the raw remainder
  // so the error message reports where it actually broke.
  if (!sliced) {
    const from = str.indexOf('{');
    if (from > -1) candidates.push(['raw-tail', str.slice(from)]);
  }

  let firstError = null;

  for (const [name, raw] of candidates) {
    // Ordered cheapest-first: clean parse, then each repair, then both combined.
    const attempts = [
      [name, raw],
      [`${name}+escaped-quotes`, _escapeStrayQuotes(raw)],
      [`${name}+trailing-commas`, _stripTrailingCommas(raw)],
      [`${name}+escaped-quotes+trailing-commas`, _stripTrailingCommas(_escapeStrayQuotes(raw))],
    ];
    for (const [method, candidate] of attempts) {
      try {
        const value = JSON.parse(candidate);
        // Guard against a bare string or number parsing "successfully".
        if (value && typeof value === 'object') return { value, method, error: null };
      } catch (e) {
        if (!firstError) firstError = e.message;
      }
    }
  }

  return { value: null, method: null, error: firstError };
}

module.exports = { parseLLMJSON, _escapeStrayQuotes, _stripTrailingCommas, _braceSlice };
