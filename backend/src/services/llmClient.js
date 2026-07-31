/**
 * Shared LLM client — Ollama (local / on-prem) ONLY.
 *
 * There is deliberately NO cloud fallback to GROQ or Mistral. Two reasons:
 *   1. Data must stay on-prem.
 *   2. Scoring must be reproducible. Silently switching to a different model
 *      mid-run produced different score distributions for identical input,
 *      which is indistinguishable from a scoring bug when reading results.
 *
 * A failed Ollama call is therefore a HARD ERROR, never a quiet downgrade.
 *
 * Determinism: pass `seed` (and temperature 0) for reproducible scoring. Seed and
 * temperature alone are NOT sufficient — the first generation after a model load
 * diverges from every later one, so seeded calls are preceded by a throwaway
 * warm-up generation. See _ensureWarm for the measurement.
 * Context safety: num_ctx is always set explicitly. Ollama silently drops the
 * FRONT of an over-long prompt (JD / resume / transcript context) rather than
 * erroring, so we pre-flight the token estimate and refuse instead.
 *
 * Availability: the on-prem host reboots / goes offline periodically. Transient
 * faults (connection reset, 5xx, 429, model still loading) are retried with
 * exponential backoff inside a total time budget. Deterministic faults (prompt
 * too large, model not found, truncation) are NOT retried — retrying them just
 * burns the budget and delays the error the caller needs to see.
 *
 * Retrying is safe for scoring precisely because seed + temperature 0 make the
 * call idempotent: attempt 2 returns what attempt 1 would have.
 */
const axios = require('axios');
const http  = require('http');
const https = require('https');

const OLLAMA_BASE  = (process.env.OLLAMA_BASE_URL  || '').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || 'qwen3:latest';
// 32768: real L1 interviews run to 36k+ chars, and at 16384 the transcript cap landed
// at ~25600 chars — a 36085-char interview lost 29% of its tail, which reads to the
// scorer as questions the panel never asked. Measured on the on-prem host (10.10.160.51,
// qwen3 8.2B Q4_K_M): 40960 loads fully into VRAM at 9.22 GB with no CPU offload, so
// 32768 is comfortably within reach and leaves room for a second resident model.
// The model's own maximum is 40960; going past it makes Ollama silently clamp.
const NUM_CTX      = parseInt(process.env.OLLAMA_NUM_CTX || '32768', 10);
const TIMEOUT_MS   = parseInt(process.env.OLLAMA_TIMEOUT_MS || '180000', 10);

// ── Retry policy ──
const MAX_ATTEMPTS    = parseInt(process.env.OLLAMA_MAX_ATTEMPTS || '3', 10);
const RETRY_BASE_MS   = parseInt(process.env.OLLAMA_RETRY_BASE_MS || '2000', 10);
// Ceiling on ALL attempts combined. Must stay under the frontend's polling
// window (150 polls x 4s = 600s) or the browser gives up before we do.
const RETRY_BUDGET_MS = parseInt(process.env.OLLAMA_RETRY_BUDGET_MS || '480000', 10);

// ── Cold-start warm-up ──
// Spends one throwaway generation so a seeded call is never the first after a model
// load — see _ensureWarm for the measurement behind this. Escape hatch only; leaving
// it off makes scores depend on whether the model happened to be loaded.
const WARMUP_ENABLED = process.env.OLLAMA_WARMUP !== 'false';

// ── Health probe ──
const HEALTH_TIMEOUT_MS = parseInt(process.env.OLLAMA_HEALTH_TIMEOUT_MS || '4000', 10);
// Cache a health verdict briefly so a burst of submissions doesn't re-probe per request.
const HEALTH_TTL_MS = parseInt(process.env.OLLAMA_HEALTH_TTL_MS || '15000', 10);

// Conservative estimate for mixed English prose + JSON scaffolding.
const CHARS_PER_TOKEN = 3.2;

/**
 * How many prompt CHARACTERS fit alongside a given output budget.
 *
 * Exported so callers size their own truncation caps against the real context
 * window instead of hard-coding a number derived from it by hand. Those two used to
 * be independent constants and silently disagreed: raising num_predict from 3000 to
 * 4000 for the tier-scoring evidence objects shrank the input budget by 1000 tokens,
 * but the 28000-char transcript cap stayed put, so a 36k-char transcript failed
 * pre-flight with "~12653 estimated tokens but only 12384 available" — a hard error
 * on a real interview, from a change made elsewhere in the file.
 *
 * @param {number} maxTokens — the num_predict the caller will request
 * @param {object} [opts]
 * @param {number} [opts.numCtx=NUM_CTX]
 * @param {number} [opts.reserveChars=0] — prompt template, system prompt, JSON
 *        skeleton: everything the caller sends that is not the truncated payload.
 * @returns {number} characters available for payload, never negative
 */
function promptCharBudget(maxTokens, { numCtx = NUM_CTX, reserveChars = 0 } = {}) {
  const tokenBudget = numCtx - maxTokens;
  // Match _estimateTokens' rounding direction so a cap computed here cannot produce
  // an estimate that trips the pre-flight guard below.
  const chars = Math.floor(tokenBudget * CHARS_PER_TOKEN) - reserveChars;
  return Math.max(0, chars);
}

const CONN_ERRORS = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNABORTED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN'];

if (!OLLAMA_BASE) {
  console.warn('⚠️  No LLM provider configured: set OLLAMA_BASE_URL (Ollama is the only supported provider)');
} else {
  console.log(`🤖 LLM provider: Ollama (${OLLAMA_BASE}) model=${OLLAMA_MODEL} num_ctx=${NUM_CTX}`);
  console.log('   ↳ No cloud fallback — failures are surfaced, not silently rerouted.');
}

function _getProvider() {
  return OLLAMA_BASE ? 'ollama' : null;
}

function _estimateTokens(messages) {
  const chars = messages.reduce((sum, m) => sum + String(m?.content || '').length, 0);
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Shorten a model digest for storage/logs, git-style.
 * Ollama reports it as either 'sha256:ab12...' or bare hex depending on version, so
 * strip any algorithm prefix first — otherwise 7 of the kept characters are constant.
 */
function _shortDigest(raw) {
  if (!raw) return null;
  const hex = String(raw).replace(/^[a-z0-9]+:/i, '');
  return hex.slice(0, 12) || null;
}

/**
 * Minimal JSON request against Ollama's control endpoints (/api/tags, /api/show).
 * Deliberately not axios: these are health/metadata probes that must fail fast and
 * never inherit the long inference timeout.
 */
function _controlRequest(pathname, { method = 'GET', body = null, timeout = HEALTH_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(OLLAMA_BASE + pathname);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method,
      timeout,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {},
    }, (r) => {
      let buf = '';
      r.on('data', c => { buf += c; });
      r.on('end', () => {
        if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode}`));
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error(`unparseable response from ${pathname}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`no response within ${timeout}ms`)); });
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Classify a failed request. Only transient faults are worth retrying.
 * @returns {{transient: boolean, reason: string}}
 */
function _classifyError(error) {
  if (CONN_ERRORS.includes(error.code)) {
    return { transient: true, reason: `connection ${error.code}` };
  }
  const status = error.response?.status;
  const body = typeof error.response?.data === 'string'
    ? error.response.data
    : JSON.stringify(error.response?.data || '');

  // 404 = model not installed on this host. A retry cannot fix that.
  if (status === 404) return { transient: false, reason: 'model not found' };
  // Ollama returns 500 with "loading model" while a cold model is paged in.
  if (/loading model|model is being loaded|server busy/i.test(body)) {
    return { transient: true, reason: 'model loading' };
  }
  if (status === 429) return { transient: true, reason: 'rate limited' };
  if (status >= 500) return { transient: true, reason: `upstream ${status}` };
  if (status >= 400) return { transient: false, reason: `request rejected (${status})` };
  return { transient: true, reason: error.code || 'unknown' };
}

/**
 * Resolve the mutable model TAG to the immutable weights actually loaded.
 *
 * `qwen3:latest` is a moving target: anyone re-pulling on a shared host swaps the
 * weights underneath us and scores shift with nothing in the logs to explain it.
 * Recording the digest makes a score traceable to specific weights, so two records
 * can be compared honestly (or flagged as incomparable) even across a re-pull.
 *
 * Best-effort by design: a failure here must never block scoring, so we return
 * nulls and let the score be written with unknown provenance rather than fail.
 *
 * Cached process-wide — the digest only changes on a re-pull, which means a
 * restart-worthy event anyway.
 *
 * @returns {Promise<{digest:string|null, parameterSize:string|null,
 *                    quantization:string|null, family:string|null, contextLength:number|null}>}
 */
let _modelIdCache = null;
async function resolveModelIdentity({ force = false } = {}) {
  if (!force && _modelIdCache) return _modelIdCache;
  if (!OLLAMA_BASE) return { digest: null, parameterSize: null, quantization: null, family: null, contextLength: null };

  let identity = { digest: null, parameterSize: null, quantization: null, family: null, contextLength: null };
  try {
    // /api/show carries the richer detail (quantization, param count, ctx length)...
    const show = await _controlRequest('/api/show', { method: 'POST', body: { model: OLLAMA_MODEL } });
    const details = show.details || {};
    identity.parameterSize = details.parameter_size || null;
    identity.quantization  = details.quantization_level || null;
    identity.family        = details.family || null;

    const info = show.model_info || {};
    const ctxKey = Object.keys(info).find(k => k.endsWith('.context_length'));
    if (ctxKey) identity.contextLength = info[ctxKey];

    // ...but only /api/tags exposes the digest, so cross-reference by name.
    try {
      const tags = await _controlRequest('/api/tags');
      const base = OLLAMA_MODEL.split(':')[0];
      const entry = (tags.models || []).find(m => (m.name || m.model) === OLLAMA_MODEL)
        || (tags.models || []).find(m => String(m.name || m.model).split(':')[0] === base);
      identity.digest = _shortDigest(entry?.digest);
    } catch (_) { /* digest is a nice-to-have; keep the /api/show detail */ }

    // Only cache a COMPLETE identity. Caching a digest-less partial (e.g. /api/tags
    // blipped) would poison provenance for the whole process lifetime.
    if (identity.digest) _modelIdCache = identity;

    console.log(`🔒 Model identity: ${OLLAMA_MODEL} digest=${identity.digest || 'unknown'} ` +
      `params=${identity.parameterSize || '?'} quant=${identity.quantization || '?'} ctx=${identity.contextLength || '?'}`);
    if (OLLAMA_MODEL.endsWith(':latest')) {
      console.warn(`⚠️  OLLAMA_MODEL_NAME='${OLLAMA_MODEL}' uses the mutable ':latest' tag — a re-pull ` +
        `silently changes scoring. Pin an explicit tag (e.g. qwen3:8b-q4_K_M) for reproducible scores.`);
    }
  } catch (err) {
    // Do not cache a failure: the host may simply have been mid-restart.
    console.warn(`⚠️  Could not resolve model identity for '${OLLAMA_MODEL}': ${err.message}. ` +
      `Scores will record digest=null (provenance unknown).`);
  }
  return identity;
}

/**
 * Is Ollama up and is the configured model actually installed?
 *
 * Cheap (hits /api/tags, no inference) and cached for HEALTH_TTL_MS. Use this to
 * reject a scoring request up front instead of failing minutes into an async job.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] — bypass the cache
 * @returns {Promise<{ok:boolean, reachable:boolean, modelFound:boolean|null,
 *                    models:string[], base:string, model:string, error:string|null, cached:boolean}>}
 */
let _healthCache = null;   // { at: number, result: object }
async function checkOllamaHealth({ force = false } = {}) {
  if (!OLLAMA_BASE) {
    return {
      ok: false, reachable: false, modelFound: null, models: [], digest: null,
      base: '', model: OLLAMA_MODEL, cached: false,
      error: 'OLLAMA_BASE_URL is not set. Ollama is the only supported provider; there is no cloud fallback.',
    };
  }

  if (!force && _healthCache && (Date.now() - _healthCache.at) < HEALTH_TTL_MS) {
    return { ..._healthCache.result, cached: true };
  }

  let result;
  try {
    const tags = await _controlRequest('/api/tags');
    const entries = tags.models || [];
    const models = entries.map(m => m.name || m.model).filter(Boolean);
    // Tolerate tag drift: qwen3:latest and qwen3:8b-q4_K_M share the base name.
    const base = OLLAMA_MODEL.split(':')[0];
    const match = entries.find(m => (m.name || m.model) === OLLAMA_MODEL)
      || entries.find(m => String(m.name || m.model).split(':')[0] === base);
    const modelFound = Boolean(match);

    result = {
      ok: modelFound, reachable: true, modelFound, models,
      digest: _shortDigest(match?.digest),
      base: OLLAMA_BASE, model: OLLAMA_MODEL, cached: false,
      error: modelFound ? null : `Model '${OLLAMA_MODEL}' is not installed on ${OLLAMA_BASE}. Available: ${models.join(', ') || '(none)'}`,
    };
  } catch (err) {
    result = {
      ok: false, reachable: false, modelFound: null, models: [], digest: null,
      base: OLLAMA_BASE, model: OLLAMA_MODEL, cached: false,
      error: `Ollama unreachable at ${OLLAMA_BASE} (${err.message}).`,
    };
  }

  _healthCache = { at: Date.now(), result };
  return result;
}

/**
 * Ensure the model has already generated at least once at this num_ctx before a
 * seeded call runs.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * The FIRST generation after a model load is not reproducible, even at
 * temperature 0 with a fixed seed. Measured directly against /api/chat on
 * qwen3:latest with an identical ~3200-token prompt: the first response after a
 * load returned eval_count=1443 and one body, every subsequent response
 * eval_count=1484 and a different, thereafter stable body.
 *
 * That surfaced as a real scoring change, not a curiosity: the same stored L2
 * record scored 8.0 on a cold model and 9.0 on a warm one, because the cold run
 * reported fewer evidence items and two dimensions dropped a tier. Whether a
 * panel scores 8 or 9 must not depend on whether they were the first submission
 * after a VM restart.
 *
 * A throwaway generation absorbs the anomaly, so the scoring call always runs in
 * the stable regime.
 *
 * The warm-up runs UNCONDITIONALLY, even when /api/ps already reports the model
 * loaded. Skipping it when loaded was tried and was not enough: L1 then scored 8.8
 * cold and 9.0 warm on the same record, because what matters is not merely "has it
 * generated once" but that the same fixed prompt immediately precedes the scoring
 * call every time. Always prepending the identical warm-up prompt makes the
 * preceding state identical in both cases, which is what actually made cold and
 * warm agree. The /api/ps probe is kept only to log WHY a warm-up was needed.
 *
 * num_ctx MUST match the real call: Ollama reloads the model when it changes,
 * which would put the scoring call right back in the cold slot it just paid to
 * avoid.
 *
 * Cost is one ~8-token generation per seeded call, against a scoring call of
 * several thousand — cheap next to a score that moves by a full point.
 *
 * Best-effort throughout — a failed warm-up is logged and never fatal, since a
 * possibly-nondeterministic score beats no score at all. It also cannot be
 * airtight: another client can trigger a reload between the warm-up and the call.
 * It removes the systematic cold-start divergence, not every theoretical race.
 *
 * @param {number} numCtx — the context size the real call will use
 * @returns {Promise<{warmed: boolean, reason: string}>}
 */
async function _ensureWarm(numCtx) {
  try {
    const ps = await _controlRequest('/api/ps');
    const base = OLLAMA_MODEL.split(':')[0];
    const loaded = (ps.models || []).find(m => {
      const name = String(m.name || m.model || '');
      return name === OLLAMA_MODEL || name.split(':')[0] === base;
    });

    const why = !loaded
      ? 'model not loaded'
      : (loaded.context_length && loaded.context_length !== numCtx
        ? `loaded at num_ctx=${loaded.context_length}, need ${numCtx}`
        : 'already loaded');

    console.log(`🔥 Warming ${OLLAMA_MODEL} at num_ctx=${numCtx} (${why}) — a fixed throwaway ` +
      `generation runs before every seeded call so the preceding state is identical each time.`);

    await axios.post(
      `${OLLAMA_BASE}/api/chat`,
      {
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        stream: false,
        think: false,
        // Same num_ctx as the real call, or this warm-up causes the very reload it
        // exists to get ahead of. num_predict stays tiny: only the load and the
        // first generation matter, not what it says.
        options: { temperature: 0, num_predict: 8, num_ctx: numCtx },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS }
    );
    return { warmed: true, reason: why };
  } catch (err) {
    // Never fatal: the real call is about to run anyway and will report its own
    // failure with far better context than this probe can.
    console.warn(`⚠️  Warm-up failed (${err.message}) — proceeding, but this score may ` +
      `differ from a warm-model run of the same input.`);
    return { warmed: false, reason: `failed: ${err.message}` };
  }
}

/**
 * Call Ollama and return the response text plus run metadata.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts]
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.maxTokens=2000]
 * @param {boolean} [opts.think=true]
 * @param {number} [opts.seed]      — set for reproducible output
 * @param {number} [opts.numCtx]    — override context window
 * @returns {Promise<{content:string, provider:string, model:string, modelDigest:string|null,
 *                    modelParameterSize:string|null, modelQuantization:string|null,
 *                    modelContextLength:number|null, seed:number|undefined, numCtx:number,
 *                    promptTokens:number, outputTokens:number, doneReason:string, attempts:number,
 *                    warmedUp:boolean, warmupNote:string}>}
 */
async function callLLMWithMeta(messages, {
  temperature = 0.2, maxTokens = 2000, think = true, seed, numCtx = NUM_CTX,
} = {}) {
  if (!OLLAMA_BASE) {
    throw new Error('No LLM provider configured. Set OLLAMA_BASE_URL to your on-prem Ollama endpoint.');
  }

  // ── Pre-flight: refuse rather than let Ollama silently truncate the prompt ──
  const estimated = _estimateTokens(messages);
  const budget = numCtx - maxTokens;
  if (estimated > budget) {
    throw new Error(
      `Prompt too large for context window: ~${estimated} estimated tokens but only ${budget} available ` +
      `(num_ctx=${numCtx} minus num_predict=${maxTokens}). Ollama would silently discard the START of the ` +
      `prompt (JD / resume / transcript context) and score against partial input. ` +
      `Shorten the input or raise OLLAMA_NUM_CTX.`
    );
  }

  const options = { temperature, num_predict: maxTokens, num_ctx: numCtx };
  if (seed !== undefined) options.seed = seed;

  // Resolve which weights we're about to use, concurrently with the call itself so
  // it costs no extra wall-clock. Cached after the first call, and never fatal.
  const identityPromise = resolveModelIdentity().catch(() => ({
    digest: null, parameterSize: null, quantization: null, family: null, contextLength: null,
  }));

  // A seeded call is a promise of reproducibility, and the first generation after a
  // model load breaks that promise — see _ensureWarm. Only seeded callers pay the
  // warm-up cost; an unseeded call is not reproducible regardless, so making it
  // wait would buy nothing.
  const warmth = seed !== undefined && WARMUP_ENABLED
    ? await _ensureWarm(numCtx)
    : { warmed: false, reason: seed === undefined ? 'unseeded call' : 'warm-up disabled' };

  // ── Bounded retry: the on-prem host restarts, and a cold model can 500 while
  //    it pages in. Safe to retry because seed + temperature 0 make this call
  //    idempotent — attempt 2 returns what attempt 1 would have.
  const startedAt = Date.now();
  let response, lastError, attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      response = await axios.post(
        `${OLLAMA_BASE}/api/chat`,
        { model: OLLAMA_MODEL, messages, stream: false, options, think },
        { headers: { 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS }
      );
      if (attempt > 1) console.log(`✅ Ollama recovered on attempt ${attempt}/${MAX_ATTEMPTS}.`);
      break;
    } catch (error) {
      lastError = error;
      const { transient, reason } = _classifyError(error);
      const elapsed = Date.now() - startedAt;

      if (!transient) {
        const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        throw new Error(`Ollama request failed — ${reason} (model=${OLLAMA_MODEL}): ${detail}`);
      }
      if (attempt >= MAX_ATTEMPTS) break;

      // Exponential backoff: 2s, 4s, 8s...
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      if (elapsed + backoff + TIMEOUT_MS > RETRY_BUDGET_MS) {
        console.warn(`⚠️  Ollama ${reason}; retry budget exhausted after ${Math.round(elapsed / 1000)}s — giving up.`);
        break;
      }
      console.warn(`⚠️  Ollama ${reason} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${backoff / 1000}s...`);
      await _sleep(backoff);
    }
  }

  if (!response) {
    const { reason } = _classifyError(lastError);
    const secs = Math.round((Date.now() - startedAt) / 1000);
    // A real outage — invalidate the cached health verdict so the next request re-probes.
    _healthCache = null;
    throw new Error(
      `Ollama unavailable at ${OLLAMA_BASE} after ${attempt} attempt(s) over ${secs}s — ${reason}. ` +
      `No cloud fallback is configured by design; the on-prem model is the only scoring engine.`
    );
  }

  const data = response.data || {};
  const rawContent = data.message?.content || data.message?.thinking || '';
  const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  if (!content) {
    throw new Error(`Ollama returned an empty response (model=${OLLAMA_MODEL}, done_reason=${data.done_reason}).`);
  }

  // ── Post-flight: detect the truncation our estimate may have missed ──
  const promptTokens = data.prompt_eval_count;
  if (promptTokens != null && promptTokens >= numCtx) {
    throw new Error(
      `Prompt was truncated by Ollama: prompt_eval_count=${promptTokens} hit num_ctx=${numCtx}. ` +
      `The start of the prompt was discarded, so this result is not trustworthy. Raise OLLAMA_NUM_CTX or shorten the input.`
    );
  }
  if (data.done_reason && data.done_reason !== 'stop') {
    console.warn(`⚠️  Ollama stopped early: done_reason=${data.done_reason} (output may be incomplete/unparseable). ` +
      `Consider raising maxTokens (current num_predict=${maxTokens}).`);
  }

  const identity = await identityPromise;

  return {
    content,
    provider: 'ollama',
    model: OLLAMA_MODEL,
    modelDigest: identity.digest,
    modelParameterSize: identity.parameterSize,
    modelQuantization: identity.quantization,
    modelContextLength: identity.contextLength,
    seed,
    numCtx,
    promptTokens,
    outputTokens: data.eval_count,
    doneReason: data.done_reason,
    attempts: attempt,
    // Whether this call was preceded by a warm-up. Persisted with scores because a
    // run where warm-up FAILED may not be reproducible, and that is worth knowing
    // when two supposedly identical scores disagree.
    warmedUp: warmth.warmed,
    warmupNote: warmth.reason,
  };
}

/**
 * Call Ollama and return just the cleaned response text.
 * @returns {Promise<string>}
 */
async function callLLM(messages, opts) {
  return (await callLLMWithMeta(messages, opts)).content;
}

module.exports = {
  callLLM,
  callLLMWithMeta,
  checkOllamaHealth,
  resolveModelIdentity,
  promptCharBudget,
  getProvider: _getProvider,
  PROVIDER: _getProvider(),
  OLLAMA_MODEL,
  NUM_CTX,
  CHARS_PER_TOKEN,
  MAX_ATTEMPTS,
};
