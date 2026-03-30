const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';
// Ollama (local) settings — if OLLAMA_BASE_URL is set, prefer Ollama over GROQ
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
 * LLM-based Re-ranking Service
 * Uses GROQ LLM to intelligently re-rank search results based on relevance
 */

/**
 * Re-rank search results using LLM evaluation
 * @param {string} query - Original search query
 * @param {Array} results - Search results to re-rank
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Re-ranked results with explanations
 */
async function rerankWithLLM(query, results, options = {}) {
  const {
    topK = 5,
    includeExplanations = true,
    evaluationFocus = 'relevance' // 'relevance', 'expertise_match', 'interview_quality'
  } = options;

  if (!GROQ_API_KEY && !OLLAMA_BASE) {
    throw new Error('No LLM provider configured (set GROQ_API_KEY or OLLAMA_BASE_URL)');
  }

  if (!query || query.trim().length === 0) {
    throw new Error('Query is required for re-ranking');
  }

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Results array cannot be empty');
  }

  if (topK < 1 || topK > 50) {
    throw new Error('topK must be between 1 and 50');
  }

  // Prepare results for LLM evaluation
  const resultsForEvaluation = results.slice(0, 10).map((doc, index) => ({
    rank: index + 1,
    id: doc.id || doc._id?.toString() || '',
    job_interview_id: doc.job_interview_id || '',
    candidate_name: doc.candidate_name || '',
    panel_member_name: doc.panel_member_name || '',
    field_type: doc.field_type || '',
    preview: (doc.preview || doc.text || doc.Transcript || '').substring(0, 300),
    original_score: doc.hybrid_score || doc.similarity || doc.score || 0
  }));

  // Create evaluation prompt
  const prompt = _buildEvaluationPrompt(
    query,
    resultsForEvaluation,
    evaluationFocus,
    includeExplanations
  );

  console.log('[LLMRerank] Evaluating', results.length, 'results for query:', query);

  // Call LLM for re-ranking
  let rankedResults;
  try {
    rankedResults = await _callGroqAPI(prompt, evaluationFocus);
  } catch (err) {
    console.error('[LLMRerank] LLM evaluation failed:', err.message);
    throw new Error(`LLM re-ranking failed: ${err.message}`);
  }

  // Map LLM ranking back to original results
  const rerankMap = new Map();
  rankedResults.forEach((item, index) => {
    rerankMap.set(item.id, {
      llm_rank: index + 1,
      llm_score: item.score || 0,
      explanation: item.explanation || '',
      relevance_reason: item.reason || ''
    });
  });

  // Apply LLM rankings to original results
  const processedResults = results.map((doc, index) => ({
    ...doc,
    original_rank: index + 1,
    original_score: doc.hybrid_score || doc.similarity || doc.score || 0,
    llm_metadata: rerankMap.get(doc.id) || {
      llm_rank: results.length,
      llm_score: 0,
      explanation: 'Not evaluated by LLM',
      relevance_reason: ''
    }
  }));

  // Sort by LLM ranking
  processedResults.sort((a, b) => {
    const rankA = a.llm_metadata.llm_rank || results.length + 1;
    const rankB = b.llm_metadata.llm_rank || results.length + 1;
    return rankA - rankB;
  });

  // Return top K results
  return {
    total_evaluated: results.length,
    top_k: topK,
    evaluation_focus: evaluationFocus,
    results: processedResults.slice(0, topK),
    timestamp: new Date().toISOString()
  };
}

/**
 * Build evaluation prompt for LLM
 */
function _buildEvaluationPrompt(query, results, focus, includeExplanations) {
  const focusInstructions = {
    relevance: `Rank the results by how well they answer or relate to the query. Consider:
    - Keyword match quality
    - Semantic relevance to the query
    - Overall usefulness for answering the query`,
    
    expertise_match: `Rank the candidates/content by expertise level match. Consider:
    - Skills mentioned in preview
    - Technical depth demonstrated
    - Relevance to required expertise
    - Interview quality indicators`,
    
    interview_quality: `Rank by interview quality and assessment depth. Consider:
    - Quality of questioning shown in transcript
    - Panel member expertise
    - Coverage of required skills
    - Probing depth and follow-ups`
  };

  const resultsJSON = results.map(r => `
  ${r.rank}. [${r.id}]
     Candidate: ${r.candidate_name}
     Panel: ${r.panel_member_name}
     Type: ${r.field_type}
     Original Score: ${r.original_score.toFixed(2)}
     Preview: "${r.preview}"
  `).join('\n');

  const explanationRequirement = includeExplanations 
    ? 'Provide a brief explanation for each ranking decision (max 50 words).'
    : 'No explanations needed, just ranking.';

  return `You are an expert evaluator of interview panels and candidate assessments.

TASK: Re-rank the following search results for maximum relevance.

QUERY: "${query}"

EVALUATION CRITERIA: ${focusInstructions[focus] || focusInstructions.relevance}

RESULTS TO RANK:
${resultsJSON}

${explanationRequirement}

IMPORTANT:
- Return ONLY a valid JSON array
- Use this exact format: [{"id":"...", "score": 9, "reason": "..."}, ...]
- score should be 1-10 (10 = best match)
- Include all original IDs in your ranking
- Do NOT include any text outside the JSON array

JSON Array (no other text):`;
}

/**
 * Call GROQ API with retry logic
 */
async function _callGroqAPI(prompt, focus) {
  // Provider switch: prefer Ollama when OLLAMA_BASE is configured
  if (OLLAMA_BASE) {
    return await _callOllamaAPI(prompt);
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _makeGroqRequest(prompt);
    } catch (err) {
      lastError = err;
      console.warn(`[LLMRerank] GROQ attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }

  throw new Error(`GROQ API failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}


/**
 * Call Ollama (local) and return validated ranking array identical to GROQ path
 */
async function _callOllamaAPI(prompt) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _makeOllamaRequest(prompt);
    } catch (err) {
      lastError = err;
      console.warn(`[LLMRerank] Ollama attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, RETRY_DELAY * attempt));
    }
  }
  throw new Error(`Ollama API failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
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
          content: 'You are a JSON-generating ranking service. Return only valid JSON arrays.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
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
          // Extract JSON from response (handle code blocks)
          const jsonStr = _extractJsonFromModelResponse(content);
          const rankedResults = JSON.parse(jsonStr);

          if (!Array.isArray(rankedResults)) {
            throw new Error('LLM response must be a JSON array');
          }

          // Validate and normalize results
          const validated = rankedResults.map((item, index) => ({
            id: item.id || item.document_id || '',
            score: Math.min(10, Math.max(1, item.score || item.rank || (10 - index))),
            reason: item.reason || item.explanation || '',
            explanation: item.explanation || item.reason || ''
          }));

          resolve(validated);
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
 * Extract JSON array string from model text response (handles ```json blocks and plain JSON)
 */
function _extractJsonFromModelResponse(content) {
  if (!content) throw new Error('Empty model response');
  let jsonStr = content;
  if (content.includes('```json')) {
    jsonStr = content.split('```json')[1].split('```')[0].trim();
  } else if (content.includes('```')) {
    // take content inside first fenced block
    jsonStr = content.split('```')[1].split('```')[0].trim();
  } else {
    // Try to find first '[' ... ']' block
    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) jsonStr = content.slice(start, end + 1).trim();
  }
  return jsonStr;
}

/**
 * Make HTTP request to local Ollama (OpenAI-compatible endpoint) and return validated ranking array
 */
function _makeOllamaRequest(prompt) {
  return new Promise((resolve, reject) => {
    try {
      const httpLib = OLLAMA_BASE.startsWith('https://') ? require('https') : require('http');
      // Use /api/chat (native, all Ollama versions); /v1/chat/completions requires Ollama >= 0.1.24
      const url = new URL(OLLAMA_BASE + '/api/chat');
      const payload = JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: 'You are a JSON-generating ranking service. Return only valid JSON arrays.' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 2000 }
      });

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 180000,
      };

      const req = httpLib.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) return reject(new Error(`Ollama ${res.statusCode}: ${body}`));
          try {
            const response = JSON.parse(body);
            // /api/chat returns { message: { content: '...' } }
            // deepseek-r1 style models may put thinking in message.thinking; fall back to it
            const rawContent = response.message?.content || response.message?.thinking || '';
            // Strip chain-of-thought <think> blocks before JSON extraction
            const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (!content) return reject(new Error('Empty Ollama response'));
            const jsonStr = _extractJsonFromModelResponse(content);
            const rankedResults = JSON.parse(jsonStr);
            if (!Array.isArray(rankedResults)) return reject(new Error('Ollama response must be a JSON array'));
            const validated = rankedResults.map((item, index) => ({
              id: item.id || item.document_id || '',
              score: Math.min(10, Math.max(1, item.score || item.rank || (10 - index))),
              reason: item.reason || item.explanation || '',
              explanation: item.explanation || item.reason || ''
            }));
            resolve(validated);
          } catch (err) {
            reject(new Error(`Failed to parse Ollama response: ${err.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama request timeout')); });
      req.write(payload);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { rerankWithLLM };
