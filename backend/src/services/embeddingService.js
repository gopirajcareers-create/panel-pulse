const https = require('https');

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/embeddings';
const MODEL = 'mistral-embed';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

if (!MISTRAL_API_KEY) {
  console.warn('⚠️  MISTRAL_API_KEY not set in .env');
}

/**
 * Call Mistral Embeddings API with retry logic
 * @param {string[]} texts - Array of text to embed
 * @returns {Promise<number[][]>} Array of embeddings (1024D vectors)
 */
async function embedTexts(texts) {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('texts must be a non-empty array');
  }

  // Validate text lengths (Mistral limit ~8192 chars)
  for (const text of texts) {
    if (typeof text !== 'string') {
      throw new Error('All texts must be strings');
    }
    if (text.length < 10) {
      throw new Error('Text too short (minimum 10 characters)');
    }
    if (text.length > 8192) {
      throw new Error(`Text too long (maximum 8192 characters, got ${text.length})`);
    }
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _callMistralAPI(texts);
    } catch (err) {
      lastError = err;
      console.warn(`Embedding API attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }

  throw new Error(`Embedding API failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

async function _callMistralAPI(texts) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: MODEL,
      input: texts
    });

    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Mistral API ${res.statusCode}: ${body}`));
        }

        try {
          const response = JSON.parse(body);
          const embeddings = response.data.map(item => item.embedding);
          resolve(embeddings);
        } catch (err) {
          reject(new Error(`Failed to parse Mistral response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.abort();
      reject(new Error('Mistral API request timeout'));
    });

    req.setTimeout(30000); // 30s timeout
    req.write(payload);
    req.end();
  });
}

module.exports = { embedTexts };
