const express = require('express');
const router = express.Router();
const { ping, getMongoClient } = require('../services/mongoClient');
const { checkOllamaHealth, OLLAMA_MODEL, NUM_CTX, MAX_ATTEMPTS } = require('../services/llmClient');

router.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(), 
    timestamp: new Date().toISOString() 
  });
});

router.get('/db', async (req, res) => {
  try {
    await ping();
    res.json({ dbStatus: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ 
      dbStatus: 'disconnected', 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/health/llm
 * Reports whether the on-prem scoring engine is usable. Uses the same probe the
 * stage2/stage3 health-gate uses, so a dashboard can never disagree with what
 * the scoring routes will actually do.
 *
 * ?force=1 bypasses the short-lived cache.
 * Returns 503 when scoring would be refused — safe for an uptime monitor.
 */
router.get('/llm', async (req, res) => {
  const health = await checkOllamaHealth({ force: req.query.force === '1' });

  if (!health.base) {
    return res.status(503).json({
      provider: 'none',
      scoring_available: false,
      ollama_configured: false,
      error: health.error,
      hint: 'Set OLLAMA_BASE_URL. Ollama is the only supported LLM provider; there is no cloud fallback.',
      timestamp: new Date().toISOString()
    });
  }

  const payload = {
    provider: 'ollama',
    scoring_available: health.ok,
    ollama_base: health.base,
    ollama_reachable: health.reachable,
    configured_model: health.model,
    model_found: health.modelFound,
    model_digest: health.digest,
    // ':latest' is mutable — a re-pull silently changes scoring output.
    model_tag_pinned: !/:latest$/.test(health.model),
    available_models: health.models,
    num_ctx: NUM_CTX,
    max_attempts: MAX_ATTEMPTS,
    cached: health.cached,
    error: health.error,
    hint: health.ok
      ? 'OK'
      : health.reachable
        ? `Model '${OLLAMA_MODEL}' not installed. Run: ollama pull ${OLLAMA_MODEL} — or set OLLAMA_MODEL_NAME to one of available_models.`
        : 'Cannot reach Ollama. Check OLLAMA_BASE_URL, the host, and network connectivity. Scoring requests will be refused with 503 until it returns.',
    timestamp: new Date().toISOString()
  };

  return res.status(health.ok ? 200 : 503).json(payload);
});

module.exports = router;
