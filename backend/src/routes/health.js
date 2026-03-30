const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const { ping, getMongoClient } = require('../services/mongoClient');

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
 * Checks Ollama connectivity and lists available models.
 * Useful for diagnosing 404 / model-not-found errors.
 */
router.get('/llm', async (req, res) => {
  const ollamaBase = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
  const configuredModel = process.env.OLLAMA_MODEL_NAME || '(not set)';
  const groqConfigured = !!process.env.GROQ_API_KEY;

  if (!ollamaBase) {
    return res.json({
      provider: groqConfigured ? 'groq' : 'none',
      groq_configured: groqConfigured,
      ollama_configured: false,
      timestamp: new Date().toISOString()
    });
  }

  // Probe Ollama /api/tags to list installed models
  try {
    const tagsUrl = new URL(ollamaBase + '/api/tags');
    const httpLib = tagsUrl.protocol === 'https:' ? https : http;
    const result = await new Promise((resolve, reject) => {
      const req2 = httpLib.get({
        hostname: tagsUrl.hostname,
        port: tagsUrl.port || (tagsUrl.protocol === 'https:' ? 443 : 80),
        path: tagsUrl.pathname,
        timeout: 5000
      }, (r) => {
        let body = '';
        r.on('data', c => { body += c; });
        r.on('end', () => resolve({ status: r.statusCode, body }));
      });
      req2.on('error', reject);
      req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
    });

    let models = [];
    try { models = JSON.parse(result.body).models || []; } catch (_) {}
    const modelNames = models.map(m => m.name || m.model);
    const modelFound = modelNames.some(n => n === configuredModel || n.startsWith(configuredModel.split(':')[0]));

    return res.json({
      provider: 'ollama',
      ollama_base: ollamaBase,
      ollama_reachable: result.status === 200,
      ollama_status: result.status,
      configured_model: configuredModel,
      model_found: modelFound,
      available_models: modelNames,
      hint: !modelFound ? `Model '${configuredModel}' not found. Set OLLAMA_MODEL_NAME to one of the available_models.` : 'OK',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      provider: 'ollama',
      ollama_base: ollamaBase,
      ollama_reachable: false,
      error: err.message,
      configured_model: configuredModel,
      hint: 'Cannot reach Ollama server. Check OLLAMA_BASE_URL and network connectivity.',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
