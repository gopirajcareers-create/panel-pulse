const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';
// Ollama (local) — preferred when OLLAMA_BASE_URL is set
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || GROQ_MODEL;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

if (!GROQ_API_KEY && !OLLAMA_BASE) {
  console.warn('⚠️  No LLM provider configured: set GROQ_API_KEY or OLLAMA_BASE_URL');
} else if (OLLAMA_BASE) {
  console.log(`🤖 LLM provider: Ollama (${OLLAMA_BASE}) model=${OLLAMA_MODEL}`);
}

/**
 * LLM-based Summarization Service
 * Uses GROQ LLM to generate concise summaries of search results
 */

/**
 * Summarize search results or individual documents
 * @param {string} query - Original search query
 * @param {Array|string} input - Search results array or single text
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Summarized content with metadata
 */
async function summarizeResults(query, input, options = {}) {
  const {
    summaryType = 'brief', // 'brief', 'detailed', 'executive'
    summaryLength = 'medium', // 'short', 'medium', 'long'
    includeKeyPoints = true,
    includeRecommendations = false,
    combinedSummary = true, // Single summary for all results
    maxResults = 5
  } = options;

  if (!GROQ_API_KEY && !OLLAMA_BASE) {
    throw new Error('No LLM provider configured (set GROQ_API_KEY or OLLAMA_BASE_URL)');
  }

  if (!query || query.trim().length === 0) {
    throw new Error('Query is required for summarization');
  }

  // Handle both array and string inputs
  let resultsToSummarize = [];
  
  if (typeof input === 'string') {
    // Single text to summarize
    resultsToSummarize = [{ id: '1', text: input, preview: input }];
  } else if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new Error('Results array cannot be empty');
    }
    // Results array
    resultsToSummarize = input.slice(0, maxResults).map((doc, index) => ({
      id: doc.id || index,
      text: doc.Transcript || doc.text || doc.preview || '',
      preview: doc.preview || doc.text || '',
      title: doc.candidate_name || doc.panel_member_name || `Result ${index + 1}`
    }));
  } else {
    throw new Error('Input must be a string or array of results');
  }

  // Validate summary options
  const validTypes = ['brief', 'detailed', 'executive'];
  if (!validTypes.includes(summaryType)) {
    throw new Error(`summaryType must be one of: ${validTypes.join(', ')}`);
  }

  const validLengths = ['short', 'medium', 'long'];
  if (!validLengths.includes(summaryLength)) {
    throw new Error(`summaryLength must be one of: ${validLengths.join(', ')}`);
  }

  console.log('[LLMSummarize] Summarizing', resultsToSummarize.length, 'results for query:', query);

  let summaries;
  if (combinedSummary && resultsToSummarize.length > 1) {
    // Generate single combined summary
    summaries = await _generateCombinedSummary(
      query,
      resultsToSummarize,
      summaryType,
      summaryLength,
      includeKeyPoints,
      includeRecommendations
    );
  } else {
    // Generate individual summaries
    summaries = await Promise.all(
      resultsToSummarize.map((result, index) =>
        _generateIndividualSummary(
          query,
          result,
          summaryType,
          summaryLength,
          includeKeyPoints,
          includeRecommendations,
          index
        )
      )
    );
  }

  return {
    query: query,
    summary_config: {
      type: summaryType,
      length: summaryLength,
      include_key_points: includeKeyPoints,
      include_recommendations: includeRecommendations,
      combined_summary: combinedSummary && resultsToSummarize.length > 1,
      results_summarized: resultsToSummarize.length
    },
    summaries: Array.isArray(summaries) ? summaries : [summaries],
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate individual summaries for each result
 */
async function _generateIndividualSummary(
  query,
  result,
  summaryType,
  summaryLength,
  includeKeyPoints,
  includeRecommendations,
  index
) {
  const prompt = _buildIndividualSummaryPrompt(
    query,
    result.text || result.preview,
    summaryType,
    summaryLength,
    includeKeyPoints,
    includeRecommendations
  );

  const summary = await _callGroqAPI(prompt);

  return {
    result_id: result.id,
    result_title: result.title || `Result ${index + 1}`,
    summary: summary,
    length_estimate: _estimateLength(summary),
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate combined summary for multiple results
 */
async function _generateCombinedSummary(
  query,
  results,
  summaryType,
  summaryLength,
  includeKeyPoints,
  includeRecommendations
) {
  // Combine all texts
  const combinedText = results
    .map(r => `[${r.title}]\n${r.text || r.preview}`)
    .join('\n\n---\n\n');

  const prompt = _buildCombinedSummaryPrompt(
    query,
    combinedText,
    results.length,
    summaryType,
    summaryLength,
    includeKeyPoints,
    includeRecommendations
  );

  const summary = await _callGroqAPI(prompt);

  return {
    combined_summary: true,
    results_count: results.length,
    result_ids: results.map(r => r.id),
    summary: summary,
    length_estimate: _estimateLength(summary),
    timestamp: new Date().toISOString()
  };
}

/**
 * Build prompt for individual summary
 */
function _buildIndividualSummaryPrompt(query, text, type, length, keyPoints, recommendations) {
  const lengthInstructions = {
    short: '(max 100 words)',
    medium: '(max 200 words)',
    long: '(max 400 words)'
  };

  const typeInstructions = {
    brief: 'Provide a concise summary',
    detailed: 'Provide a detailed summary with all key information',
    executive: 'Provide an executive summary suitable for decision makers'
  };

  const keyPointsSection = keyPoints ? '\n- Include 3-5 key points in bullet format' : '';
  const recommendationsSection = recommendations ? '\n- Include 2-3 actionable recommendations if applicable' : '';

  return `You are a professional content summarizer.

TASK: Summarize the following content in response to the search query.

SEARCH QUERY: "${query}"

SUMMARY STYLE: ${typeInstructions[type]}
LENGTH: ${lengthInstructions[length]}
${keyPointsSection}
${recommendationsSection}

CONTENT TO SUMMARIZE:
${text}

IMPORTANT:
- Focus on relevance to the search query
- Be concise and clear
- Use professional language
- Highlight only the most important information

Provide the summary directly without any preamble:`;
}

/**
 * Build prompt for combined summary
 */
function _buildCombinedSummaryPrompt(query, text, count, type, length, keyPoints, recommendations) {
  const lengthInstructions = {
    short: '(max 150 words)',
    medium: '(max 300 words)',
    long: '(max 600 words)'
  };

  const typeInstructions = {
    brief: 'Provide a concise overview',
    detailed: 'Provide a detailed synthesis',
    executive: 'Provide an executive overview for decision makers'
  };

  const keyPointsSection = keyPoints ? '\n- Include 5-7 key points across all results in bullet format' : '';
  const recommendationsSection = recommendations ? '\n- Include 3-5 actionable recommendations if applicable' : '';

  return `You are a professional content synthesizer.

TASK: Synthesize the following ${count} results into a cohesive summary.

SEARCH QUERY: "${query}"

SUMMARY STYLE: ${typeInstructions[type]}
OVERALL LENGTH: ${lengthInstructions[length]}
${keyPointsSection}
${recommendationsSection}

CONTENT TO SYNTHESIZE:
${text}

IMPORTANT:
- Synthesize across all ${count} results, not just the first one
- Avoid repetition
- Highlight consensus and divergent viewpoints
- Focus on relevance to the search query
- Use professional language
- Show relationships between results

Provide the synthesized summary directly without any preamble:`;
}

/**
 * Estimate summary length
 */
function _estimateLength(text) {
  const words = text.trim().split(/\s+/).length;
  if (words < 100) return 'short';
  if (words < 250) return 'medium';
  return 'long';
}

/**
 * Call LLM API with retry logic (Ollama preferred, GROQ fallback)
 */
async function _callGroqAPI(prompt) {
  if (OLLAMA_BASE) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await _makeOllamaRequest(prompt);
      } catch (err) {
        lastError = err;
        console.warn(`[LLMSummarize] Ollama attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
      }
    }
    throw new Error(`Ollama failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _makeGroqRequest(prompt);
    } catch (err) {
      lastError = err;
      console.warn(`[LLMSummarize] GROQ attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }

  throw new Error(`GROQ API failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Make HTTP request to GROQ API
 */
function _makeGroqRequest(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a professional summarizer and content synthesizer. Provide clear, concise, well-structured summaries.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 2000,
      top_p: 0.9
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GROQ API ${res.statusCode}: ${body}`));
        }

        try {
          const response = JSON.parse(body);

          if (!response.choices || !response.choices[0] || !response.choices[0].message) {
            return reject(new Error('Invalid GROQ response structure'));
          }

          const content = response.choices[0].message.content.trim();
          resolve(content);
        } catch (err) {
          reject(new Error(`Failed to parse GROQ response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);

    req.on('timeout', () => {
      req.abort();
      reject(new Error('GROQ API request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Make HTTP request to local Ollama server (OpenAI-compatible endpoint)
 */
function _makeOllamaRequest(prompt) {
  return new Promise((resolve, reject) => {
    const httpLib = OLLAMA_BASE.startsWith('https://') ? require('https') : require('http');
    // Use /api/chat (native, all Ollama versions) instead of /v1/chat/completions
    const url = new URL(OLLAMA_BASE + '/api/chat');
    const payload = JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'You are a professional summarizer and content synthesizer. Provide clear, concise, well-structured summaries.' },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: { temperature: 0.5, num_predict: 2000 }
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 180000
    };

    const req = httpLib.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Ollama ${res.statusCode}: ${body}`));
        try {
          const response = JSON.parse(body);
          // /api/chat returns { message: { content: '...' } }
          // deepseek-r1 style models may put thinking in message.thinking; fall back to it
          const rawContent = response.message?.content || response.message?.thinking || '';
          // Strip chain-of-thought <think> blocks before returning
          const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          if (!content) return reject(new Error('Empty Ollama response'));
          resolve(content);
        } catch (err) {
          reject(new Error(`Failed to parse Ollama response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama request timeout')); });
    req.write(payload);
    req.end();
  });
}

module.exports = { summarizeResults };
