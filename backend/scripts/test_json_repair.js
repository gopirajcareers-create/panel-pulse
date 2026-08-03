/**
 * Pin the JSON repair layer.
 *
 *   node scripts/test_json_repair.js
 *
 * No model, no database — pure functions over fixtures, so it runs instantly.
 *
 * These fixtures are not invented. The scoring prompts ask the model to quote the
 * transcript verbatim inside JSON strings, so a panelist saying  the "N+1 problem"
 * yields a string containing a raw double quote that an 8B model escapes only most of
 * the time. When it doesn't, the string ends early and the rest is a syntax error —
 * that failed a whole real evaluation with `done_reason=stop` and a response that
 * *looked* complete. Because scoring pins seed and temperature 0, the retry returns
 * byte-identical broken output, so repair is the only recovery.
 *
 * The critical cases are the NEGATIVE ones: repair must not "fix" a valid document into
 * a different one. A repair that changes correct output is worse than a failed parse,
 * because it scores silently.
 */
'use strict';

const { parseLLMJSON, _escapeStrayQuotes, _stripTrailingCommas } = require('../src/services/jsonRepair');

let failures = 0;
function assert(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(label, ok, ok ? '' : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}

// ─── Valid input must survive untouched ──────────────────────────────────────
console.log('═══ valid JSON is never altered ═══');
{
  const doc = {
    score: 8.5,
    categories: { 'Framework Knowledge': 1.5, 'Hands-on Validation': 0 },
    evidence_detail: {
      'Framework Knowledge': [
        { quote: 'How do you structure your backend using Express?', topic: 'express', follows_up: false },
      ],
    },
    recommendations: ['ask deeper questions', 'verify resume claims'],
    overall_verdict: 'Solid coverage with gaps in hands-on validation.',
  };
  const text = JSON.stringify(doc, null, 2);
  const r = parseLLMJSON(text);
  eq('round-trips exactly', r.value, doc);
  assert('reports no repair was needed', r.method === 'brace-scan', `method=${r.method}`);
}
{
  // Properly escaped quotes are the common case and must not be double-escaped.
  const doc = { quote: 'he called it "eventual consistency" in passing' };
  const r = parseLLMJSON(JSON.stringify(doc));
  eq('already-escaped quotes are preserved verbatim', r.value, doc);
}
{
  // Escaped backslash before a quote: `path\\` then a real terminator.
  const doc = { path: 'C:\\temp\\', next: 1 };
  eq('escaped backslashes survive', parseLLMJSON(JSON.stringify(doc)).value, doc);
}
{
  const doc = { note: 'line one\nline two\ttabbed' };
  eq('escaped newlines/tabs survive', parseLLMJSON(JSON.stringify(doc)).value, doc);
}
{
  // Punctuation that the quote-terminator heuristic inspects, appearing legitimately.
  const doc = { a: 'ends with a colon:', b: 'has, commas, inside', c: 'braces } and ] here' };
  eq('strings containing : , } ] survive', parseLLMJSON(JSON.stringify(doc)).value, doc);
}
{
  const r = parseLLMJSON('```json\n{"score": 7}\n```');
  eq('markdown-fenced JSON parses', r.value, { score: 7 });
}

// ─── The reported failure ────────────────────────────────────────────────────
console.log('\n═══ raw quotes inside evidence strings (the real bug) ═══');
{
  // Exactly the shape from the production error: a mid-sentence quoted phrase.
  const broken = '{"quote": "You mentioned the "N+1 problem" earlier — walk me through it", "topic": "perf"}';
  const r = parseLLMJSON(broken);
  assert('recovers a mid-sentence quoted phrase', r.value !== null, r.error || '');
  eq('keeps the full sentence including the inner quotes', r.value, {
    quote: 'You mentioned the "N+1 problem" earlier — walk me through it',
    topic: 'perf',
  });
  assert('reports that a repair was used', /escaped-quotes/.test(r.method || ''), `method=${r.method}`);
}
{
  // The prior failure context: `"probes, "probes_depth"` — the quote before the comma
  // is embedded, so the comma heuristic must not treat it as a terminator.
  const broken = '{"quote": "the panel said "probes, then moved on", "topic": "depth"}';
  const r = parseLLMJSON(broken);
  eq('a quote followed by a comma mid-sentence is embedded, not terminal', r.value, {
    quote: 'the panel said "probes, then moved on',
    topic: 'depth',
  });
}
{
  // A quote followed by `,` that IS a terminator, because a new value follows.
  const broken = '{"a": "said "yes", "b": "next"}';
  const r = parseLLMJSON(broken);
  assert('recovers when the comma genuinely terminates', r.value !== null, r.error || '');
  assert('b is preserved as its own key', r.value && r.value.b === 'next', JSON.stringify(r.value));
}
{
  const broken = '{"quote": "he asked "why?" and "how?" repeatedly", "n": 2}';
  const r = parseLLMJSON(broken);
  eq('multiple embedded quoted phrases', r.value,
    { quote: 'he asked "why?" and "how?" repeatedly', n: 2 });
}
{
  // Nested structure, quotes deep inside an array of evidence objects.
  const broken = '{"evidence_detail": {"Framework Knowledge": ' +
    '[{"quote": "explain "useMemo" vs "useCallback"", "topic": "hooks", "follows_up": false}]}}';
  const r = parseLLMJSON(broken);
  assert('repairs quotes nested in arrays of objects', r.value !== null, r.error || '');
  const item = r.value && r.value.evidence_detail['Framework Knowledge'][0];
  eq('the repaired evidence item is intact', item,
    { quote: 'explain "useMemo" vs "useCallback"', topic: 'hooks', follows_up: false });
}

// ─── Other model slips ───────────────────────────────────────────────────────
console.log('\n═══ trailing commas and raw newlines ═══');
eq('trailing comma in an object', parseLLMJSON('{"a": 1, "b": 2,}').value, { a: 1, b: 2 });
eq('trailing comma in an array', parseLLMJSON('{"a": [1, 2, 3,]}').value, { a: [1, 2, 3] });
eq('a raw newline inside a string is escaped',
  parseLLMJSON('{"verdict": "first line\nsecond line"}').value,
  { verdict: 'first line\nsecond line' });
eq('both faults at once',
  parseLLMJSON('{"q": "he said "hi"\nthen left",}').value,
  { q: 'he said "hi"\nthen left' });

// ─── Preamble / trailing prose ───────────────────────────────────────────────
console.log('\n═══ surrounding prose ═══');
eq('leading preamble is skipped',
  parseLLMJSON('Here is the evaluation:\n{"score": 6}').value, { score: 6 });
eq('trailing prose is ignored',
  parseLLMJSON('{"score": 6}\nHope that helps!').value, { score: 6 });

// ─── Genuine failures must still fail ────────────────────────────────────────
console.log('\n═══ unrecoverable input still fails (and says why) ═══');
{
  // Truncation: done_reason=length. There is no balanced object; repair must NOT
  // fabricate one, because a half-parsed evaluation scores against partial evidence.
  const cut = '{"score": 8, "evidence_detail": {"Framework Knowledge": [{"quote": "how do you';
  const r = parseLLMJSON(cut);
  assert('a truncated response does not parse', r.value === null, `got ${JSON.stringify(r.value)}`);
  assert('the original parse error is reported', !!r.error, `error=${r.error}`);
}
{
  const r = parseLLMJSON('I cannot evaluate this transcript.');
  assert('prose with no JSON returns null', r.value === null);
}
{
  const r = parseLLMJSON('');
  assert('empty input returns null', r.value === null);
}
{
  // A bare JSON scalar is valid JSON but not an object — must not be accepted.
  const r = parseLLMJSON('{}\u0000'.slice(0, 0) + '"just a string"');
  assert('a bare string is not accepted as a result', r.value === null, JSON.stringify(r.value));
}

// ─── Helper-level invariants ─────────────────────────────────────────────────
console.log('\n═══ helpers are idempotent on clean input ═══');
{
  const clean = '{"a": "plain", "b": [1, 2], "c": {"d": "x"}}';
  assert('_escapeStrayQuotes leaves clean JSON byte-identical',
    _escapeStrayQuotes(clean) === clean);
  assert('_stripTrailingCommas leaves clean JSON byte-identical',
    _stripTrailingCommas(clean) === clean);
  assert('_escapeStrayQuotes is idempotent',
    _escapeStrayQuotes(_escapeStrayQuotes(clean)) === _escapeStrayQuotes(clean));
}

console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
