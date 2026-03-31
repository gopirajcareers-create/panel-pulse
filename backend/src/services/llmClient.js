/**
 * Shared LLM client — priority: Ollama → GROQ → Mistral
 *
 * All services should use callLLM() from this module instead of
 * building their own HTTP calls. Provider selection is automatic:
 *   1. OLLAMA_BASE_URL is set  → local Ollama (data stays on-prem)
 *   2. GROQ_API_KEY is set     → GROQ cloud
 *   3. MISTRAL_API_KEY is set  → Mistral cloud
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
} else if (PROVIDER === 'ollama') {
  console.log(`🤖 LLM provider: Ollama (${OLLAMA_BASE}) model=${OLLAMA_MODEL}`);
} else if (PROVIDER === 'groq') {
  console.log(`🤖 LLM provider: GROQ model=${GROQ_MODEL}`);
} else if (PROVIDER === 'mistral') {
  console.log(`🤖 LLM provider: Mistral model=${MISTRAL_MODEL}`);
}

/**
 * Call the configured LLM provider.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts]
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.maxTokens=2000]
 * @returns {Promise<string>} Cleaned response text (<think> blocks stripped)
 */
async function callLLM(messages, { temperature = 0.2, maxTokens = 2000 } = {}) {
  const provider = _getProvider();

  if (!provider) {
    throw new Error('No LLM provider configured. Set OLLAMA_BASE_URL, GROQ_API_KEY, or MISTRAL_API_KEY.');
  }

  let apiUrl, model, headers, body, timeout;

  if (provider === 'ollama') {
    apiUrl  = `${OLLAMA_BASE}/api/chat`;
    model   = OLLAMA_MODEL;
    headers = { 'Content-Type': 'application/json' };
    body    = { model, messages, stream: false, options: { temperature, num_predict: maxTokens } };
    timeout = 180000;
  } else if (provider === 'groq') {
    apiUrl  = 'https://api.groq.com/openai/v1/chat/completions';
    model   = GROQ_MODEL;
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` };
    body    = { model, messages, temperature, max_tokens: maxTokens, top_p: 1, stream: false };
    timeout = 30000;
  } else { // mistral
    apiUrl  = 'https://api.mistral.ai/v1/chat/completions';
    model   = MISTRAL_MODEL;
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_API_KEY}` };
    body    = { model, messages, temperature, max_tokens: maxTokens, stream: false };
    timeout = 30000;
  }

  const response = await axios.post(apiUrl, body, { headers, timeout });

  const rawContent = provider === 'ollama'
    ? (response.data?.message?.content || response.data?.message?.thinking || '')
    : response.data?.choices?.[0]?.message?.content;

  const content = (rawContent || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!content) throw new Error(`Invalid response format from ${provider} API`);

  return content;
}

module.exports = { callLLM, getProvider: _getProvider, PROVIDER };
