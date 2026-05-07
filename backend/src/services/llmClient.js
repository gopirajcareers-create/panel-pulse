/**
 * Shared LLM client — priority: Ollama → GROQ → Mistral (with automatic fallback)
 *
 * All services should use callLLM() from this module instead of
 * building their own HTTP calls. Provider selection is automatic:
 *   1. OLLAMA_BASE_URL is set  → local Ollama (data stays on-prem)
 *   2. GROQ_API_KEY is set     → GROQ cloud
 *   3. MISTRAL_API_KEY is set  → Mistral cloud
 *
 * Automatic fallback: If Ollama fails (connection error), automatically
 * falls back to GROQ → Mistral without throwing an error.
 */
const axios = require('axios');

const OLLAMA_BASE  = (process.env.OLLAMA_BASE_URL  || '').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || 'llama-3.3-70b-versatile';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = process.env.GROQ_MODEL_NAME   || 'llama-3.3-70b-versatile';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL   = process.env.MISTRAL_MODEL_NAME || 'mistral-large-latest';

function _getProvider() {
  if (OLLAMA_BASE)    return 'ollama';
  if (GROQ_API_KEY)   return 'groq';
  if (MISTRAL_API_KEY) return 'mistral';
  return null;
}

const PROVIDER = _getProvider();

if (!PROVIDER) {
  console.warn('⚠️  No LLM provider configured: set OLLAMA_BASE_URL, GROQ_API_KEY, or MISTRAL_API_KEY');
} else {
  const fallbacks = [];
  if (PROVIDER === 'ollama') {
    console.log(`🤖 Primary LLM provider: Ollama (${OLLAMA_BASE}) model=${OLLAMA_MODEL}`);
    if (GROQ_API_KEY) fallbacks.push('GROQ');
    if (MISTRAL_API_KEY) fallbacks.push('Mistral');
  } else if (PROVIDER === 'groq') {
    console.log(`🤖 Primary LLM provider: GROQ model=${GROQ_MODEL}`);
    if (MISTRAL_API_KEY) fallbacks.push('Mistral');
  } else if (PROVIDER === 'mistral') {
    console.log(`🤖 Primary LLM provider: Mistral model=${MISTRAL_MODEL}`);
  }

  if (fallbacks.length > 0) {
    console.log(`   ↳ Automatic fallback available: ${fallbacks.join(' → ')}`);
  }
}

/**
 * Call the configured LLM provider with automatic fallback.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts]
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.maxTokens=2000]
 * @param {boolean} [opts.think=true]
 * @returns {Promise<string>} Cleaned response text (<think> blocks stripped)
 */
async function callLLM(messages, { temperature = 0.2, maxTokens = 2000, think = true } = {}) {
  const provider = _getProvider();

  if (!provider) {
    throw new Error('No LLM provider configured. Set OLLAMA_BASE_URL, GROQ_API_KEY, or MISTRAL_API_KEY.');
  }

  // Try Ollama first, then fallback to GROQ/Mistral if it fails
  const providers = [];
  if (OLLAMA_BASE) providers.push('ollama');
  if (GROQ_API_KEY) providers.push('groq');
  if (MISTRAL_API_KEY) providers.push('mistral');

  let lastError = null;

  for (const currentProvider of providers) {
    try {
      let apiUrl, model, headers, body, timeout;

      if (currentProvider === 'ollama') {
        apiUrl  = `${OLLAMA_BASE}/api/chat`;
        model   = OLLAMA_MODEL;
        headers = { 'Content-Type': 'application/json' };
        body    = { model, messages, stream: false, options: { temperature, num_predict: maxTokens }, think };
        timeout = 180000;
      } else if (currentProvider === 'groq') {
        apiUrl  = 'https://api.groq.com/openai/v1/chat/completions';
        model   = GROQ_MODEL;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` };
        body    = { model, messages, temperature, max_tokens: maxTokens, top_p: 1, stream: false };
        timeout = 90000;
      } else { // mistral
        apiUrl  = 'https://api.mistral.ai/v1/chat/completions';
        model   = MISTRAL_MODEL;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_API_KEY}` };
        body    = { model, messages, temperature, max_tokens: maxTokens, stream: false };
        timeout = 90000;
      }

      const response = await axios.post(apiUrl, body, { headers, timeout });

      const rawContent = currentProvider === 'ollama'
        ? (response.data?.message?.content || response.data?.message?.thinking || '')
        : response.data?.choices?.[0]?.message?.content;

      const content = (rawContent || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!content) throw new Error(`Invalid response format from ${currentProvider} API`);

      // If we're using a fallback provider, log it
      if (currentProvider !== provider) {
        console.warn(`⚠️  Primary provider (${provider}) failed, using fallback: ${currentProvider}`);
      }

      return content;

    } catch (error) {
      lastError = error;
      const isConnectionError = error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';

      // Log the failure and try next provider
      if (isConnectionError) {
        console.warn(`⚠️  ${currentProvider} connection failed (${error.code}), trying next provider...`);
      } else {
        console.error(`❌ ${currentProvider} request failed:`, error.message);
      }

      // Continue to next provider
      continue;
    }
  }

  // All providers failed
  throw new Error(`All LLM providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

module.exports = { callLLM, getProvider: _getProvider, PROVIDER };
