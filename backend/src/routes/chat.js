const express = require('express');
const router = express.Router();
const { getDb } = require('../services/mongoClient');
const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';
// Ollama (local) — preferred when OLLAMA_BASE_URL is set
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || GROQ_MODEL;

const CHAT_SYSTEM_PROMPT = `You are PanelPulse AI Assistant — an expert HR analytics and data science consultant for the PanelPulse platform.

Your mission is to provide EXTREMELY DETAILED, ANALYTICAL, and DETERMINISTIC explanations based on the provided interview evaluation data.

CORE RESPONSIBILITIES:
- Perform deep-dive analysis into panel efficiency scores, dimension breakdowns, and qualitative feedback.
- Provide expert recommendations for interview panels based on historical performance and domain expertise.
- Identify subtle patterns in candidate rejection, probing depth, and alignment with recruitment goals.
- Answer user queries with high precision, citing specific evidence and L2 validation details.

DATA MATCHING & FIDELITY LOGIC:
1. DIRECT MATCH VERIFICATION: If a user asks for a specific skill (e.g., "Python"), check if the keyword exists in the provided JD, Role, or Transcripts.
2. HANDLING ZERO DIRECT MATCHES: If no direct match is found for the primary keyword, you MUST explicitly state: "No direct matching evaluation records found for [Keyword] in the current dataset."
3. RELATED MATCH SUGGESTIONS: After stating no direct match, identify and suggest the most "related" records based on domain (e.g., if "Python" is missing, suggest "Java" or "Backend" records). Clearly label these as "Related Alternatives."
4. CALCULATION ACCURACY: When identifying the "best" or "top" panel member, calculate the average **Panel Efficiency Score** (0.0-10.0) across all relevant records for that individual.

RESPONSE DETERMINISM & STRUCTURE:
To ensure consistent, easy-to-read answers, you must adhere to this EXACT structure:
1. ## MATCH STATUS
   - State if direct or related matches were found.
2. ## TOP RECOMMENDATION
   - Clear identification of the best panel member or candidate based on the data.
3. ## KEY EVIDENCE
   - Bulleted list of specific reasons, metrics (**SCORE: X.X/10**), and transcript highlights that support the recommendation.
4. ## CONSULTANT ADVICE
   - Tactical advice or next steps for the user based on the findings.

RESPONSE GUIDELINES:
- BE VERBOSE AND ANALYTICAL. Provide a "perfect" and "correct" analysis of the underlying data.
- STRUCTURE your response using professional markdown as defined above.
- ALWAYS cite data points: specifically mention Job Interview IDs, Panel Names, and exact dimension scores.
- EXPLAIN THE "WHY": Don't just state a score; explain the evidence that led to that score.
- AVOID conversational filler. Start directly with the analysis.
- Maintain a highly professional, senior consultant tone. 

PANEL SCORING DIMENSIONS (Target Metrics):
- Mandatory Skill Coverage: 2.0 (Core JD alignment)
- Technical Depth: 2.0 (Depth of probing/follow-ups)
- Rejection Validation Alignment: 2.0 (L1/L2 consistency)
- Scenario/Risk Evaluation: 1.0 (Real-world problem solving)
- Framework Knowledge: 1.0 (Specific tech stack mastery)
- Hands-on Validation: 1.0 (Live coding/scripting assessment)
- Leadership Evaluation: 0.5 (Mentorship/Project lead potential)
- Behavioral Assessment: 0.5 (Soft skills/Team fit)
- Total Max Score: 10.0

INTERPRETATION RANGE:
- 0.0–4.9: POOR (Needs significant improvement in paneling or candidate quality)
- 5.0–7.9: MODERATE (Standard performance with some gaps identified)
- 8.0–10.0: GOOD (Exceptional evaluation quality and alignment)`;

/**
 * Call LLM for chat completion — uses Ollama (local) when OLLAMA_BASE_URL is set, otherwise GROQ
 */
async function callGroqChat(messages) {
  return new Promise((resolve, reject) => {
    if (!OLLAMA_BASE && !GROQ_API_KEY) {
      return reject(new Error('No LLM provider configured (set GROQ_API_KEY or OLLAMA_BASE_URL)'));
    }

    const model = OLLAMA_BASE ? OLLAMA_MODEL : GROQ_MODEL;
    // Build provider-specific body: Ollama uses options:{} for params; GROQ uses top-level fields
    const body = OLLAMA_BASE
      ? JSON.stringify({ model, messages, stream: false, options: { temperature: 0.0, num_predict: 1536 } })
      : JSON.stringify({ model, messages, temperature: 0.0, max_tokens: 1536, top_p: 1.0, stream: false });

    let reqOptions;
    let httpLib;
    if (OLLAMA_BASE) {
      // Use /api/chat (native, all Ollama versions) instead of /v1/chat/completions
      const url = new URL(OLLAMA_BASE + '/api/chat');
      httpLib = url.protocol === 'https:' ? https : require('http');
      reqOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 180000
      };
    } else {
      httpLib = https;
      reqOptions = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000
      };
    }

    const req = httpLib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message || 'LLM API error'));
          }
          // /api/chat (Ollama native) returns { message: { content } }
          // /openai/v1/chat/completions (GROQ) returns { choices: [{ message: { content } }] }
          const content = OLLAMA_BASE
            ? parsed.message?.content
            : parsed.choices?.[0]?.message?.content;
          if (!content) return reject(new Error('Empty response from LLM'));
          resolve(content);
        } catch (e) {
          reject(new Error('Failed to parse LLM response'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LLM request timed out — model may be loading, please retry'));
    });
    req.on('error', (e) => reject(new Error(`LLM request failed: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

/**
 * Search panel_evaluations collection directly using keyword regex.
 * Falls back to most-recent evaluations if no keyword match is found.
 *
 * @param {string} query     - User's chat message / search terms
 * @param {object} options
 * @param {number} options.limit       - Max docs to return (default 10)
 * @param {boolean} options.strictMode - If true, skip l1_transcript scan (faster)
 */
async function searchPanelEvaluations(query, options = {}) {
  const { limit = 10, strictMode = false } = options;

  const db = await getDb();
  const collection = db.collection('panel_evaluations');

  // ── keyword extraction ──────────────────────────────────────────────────
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'about', 'what', 'how', 'are', 'was',
    'were', 'has', 'have', 'did', 'does', 'can', 'could', 'would', 'should',
    'all', 'any', 'who', 'which', 'that', 'this', 'they', 'their', 'from',
    'show', 'tell', 'give', 'list', 'get', 'find', 'best', 'top', 'good',
    'bad', 'high', 'low', 'score', 'scores', 'panel', 'panels', 'candidate',
    'candidates', 'evaluation', 'evaluations', 'interview', 'interviews',
  ]);

  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  let results = [];

  if (keywords.length > 0) {
    const regexPattern = keywords.join('|');
    const anyKeyword = new RegExp(regexPattern, 'i');

    const orClauses = [
      { 'Job Interview ID': anyKeyword },
      { 'Panel Name': anyKeyword },
      { 'Candidate Name': anyKeyword },
      { role: anyKeyword },
      { JD: anyKeyword },
      { panel_summary: anyKeyword },
    ];

    // Include transcript scan only in non-strict (hybrid/vector) modes
    if (!strictMode) {
      orClauses.push({ l1_transcript: anyKeyword });
    }

    results = await collection
      .find({ $or: orClauses })
      .sort({ score: -1, evaluated_at: -1 })
      .limit(limit)
      .toArray();

    console.log(`[Chat] panel_evaluations keyword search → ${results.length} results for keywords: [${keywords.join(', ')}]`);
  }

  // ── fallback: return recent evaluations as general context ───────────────
  if (results.length === 0) {
    results = await collection
      .find({})
      .sort({ evaluated_at: -1, score: -1 })
      .limit(limit)
      .toArray();
    console.log(`[Chat] panel_evaluations fallback (no keyword match) → ${results.length} recent records`);
  }

  return results;
}

/**
 * Format panel_evaluations documents into rich, structured LLM-readable context.
 * Each record includes score, dimension breakdown, evidence, panel summary, L2 data.
 */
function formatContextFromEvaluations(docs) {
  if (!docs || docs.length === 0) {
    return 'No panel evaluation records found for this query.';
  }

  return docs.slice(0, 8).map((doc, i) => {
    const lines = [
      `--- Evaluation Record ${i + 1} ---`,
      `Job Interview ID : ${doc['Job Interview ID'] || 'N/A'}`,
      `Panel Member     : ${doc['Panel Name'] || 'N/A'}`,
      `Candidate        : ${doc['Candidate Name'] || 'N/A'}`,
      `Overall Score    : ${doc.score !== undefined ? `${doc.score}/10` : 'N/A'}${doc.confidence ? ` (Confidence: ${doc.confidence})` : ''}`,
    ];

    if (doc.probing_verdict) {
      lines.push(`Probing Verdict  : ${doc.probing_verdict}`);
    }

    // ── dimension scores ──────────────────────────────────────────────────
    if (doc.categories && typeof doc.categories === 'object') {
      const entries = Object.entries(doc.categories);
      if (entries.length > 0) {
        lines.push('Dimension Scores :');
        for (const [dim, data] of entries) {
          const dimScore = data?.score !== undefined ? data.score : (typeof data === 'number' ? data : '?');
          const dimMax   = data?.max  !== undefined ? data.max   : '';
          lines.push(`  • ${dim}: ${dimScore}${dimMax ? `/${dimMax}` : ''}`);
        }
      }
    }

    // ── evidence (expanded) ───────────────────────────────────────────────
    if (Array.isArray(doc.evidence) && doc.evidence.length > 0) {
      lines.push('Detailed Evidence Points:');
      doc.evidence.slice(0, 6).forEach((ev) => {
        const text = typeof ev === 'string' ? ev : (ev?.text || ev?.description || JSON.stringify(ev));
        lines.push(`  • ${String(text)}`);
      });
    }

    // ── panel summary (expanded) ──────────────────────────────────────────
    if (doc.panel_summary) {
      lines.push(`Full Panel Summary Analysis: ${doc.panel_summary.substring(0, 1200)}`);
    }

    // ── L2 validation ─────────────────────────────────────────────────────
    if (doc.l2_validation) {
      const l2 = doc.l2_validation;
      if (l2.verdict)          lines.push(`L2 Verdict       : ${l2.verdict}`);
      if (l2.probing_verdict)  lines.push(`L2 Probing       : ${l2.probing_verdict}`);
      if (l2.comments)         lines.push(`L2 Comments      : ${String(l2.comments).substring(0, 200)}`);
    }

    if (Array.isArray(doc.l2_rejection_reasons) && doc.l2_rejection_reasons.length > 0) {
      lines.push(`L2 Rejection     : ${doc.l2_rejection_reasons.slice(0, 2).join('; ')}`);
    }

    if (doc.evaluated_at) {
      lines.push(`Evaluated At     : ${new Date(doc.evaluated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`);
    }

    return lines.filter(Boolean).join('\n');
  }).join('\n\n');
}

/**
 * POST /api/v1/chat
 * Conversational AI endpoint backed by hybrid search + GROQ LLM
 * Body: { message: string, history: Array<{role: 'user'|'assistant', content: string}> }
 */
router.post('/', async (req, res) => {
  try {
    const {
      message,
      history = [],
      searchMode = 'hybrid',    // 'hybrid' | 'bm25' | 'vector'
      bm25Weight = 0.4,
      vectorWeight = 0.6,
    } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing required field',
        details: 'message is required and must be a non-empty string',
      });
    }

    if (!Array.isArray(history)) {
      return res.status(400).json({
        error: 'Invalid field',
        details: 'history must be an array',
      });
    }

    // Clamp weights to valid range (kept for UI compatibility, not used for DB query)
    const safeB = Math.max(0, Math.min(1, Number(bm25Weight) || 0.4));
    const safeV = Math.max(0, Math.min(1, Number(vectorWeight) || 0.6));
    const validMode = ['hybrid', 'bm25', 'vector'].includes(searchMode) ? searchMode : 'hybrid';

    const trimmedMessage = message.trim();
    console.log(`[Chat] mode=${validMode} bm25=${safeB} vector=${safeV} msg="${trimmedMessage.substring(0, 80)}"`);

    // Step 1: Query panel_evaluations directly for rich structured evaluation data.
    //   • 'bm25'   → strict mode (structured fields only: ID, Panel Name, Candidate Name)
    //   • 'hybrid' → standard mode (structured fields + panel_summary + transcript)
    //   • 'vector' → standard mode with larger result set for broader coverage
    let searchResults = [];
    let searchQuery = trimmedMessage;
    let sources = [];

    try {
      const isStrict = (validMode === 'bm25');
      const limit    = (validMode === 'vector') ? 12 : 10;

      searchResults = await searchPanelEvaluations(trimmedMessage, {
        limit,
        strictMode: isStrict,
      });

      sources = searchResults.slice(0, 6).map((doc) => ({
        job_interview_id : doc['Job Interview ID'] || null,
        candidate_name   : doc['Candidate Name']   || null,
        panel_member_name: doc['Panel Name']        || null,
        score            : doc.score               ?? null,
        confidence       : doc.confidence          || null,
        evaluated_at     : doc.evaluated_at        || null,
      }));

      console.log(`[Chat] panel_evaluations search returned ${searchResults.length} evaluation records`);

    } catch (searchErr) {
      console.warn('[Chat] panel_evaluations search failed:', searchErr.message);
      // Continue with empty context — LLM will answer from general knowledge
    }

    // Step 2: Format rich evaluation context for the LLM
    const contextBlock = formatContextFromEvaluations(searchResults);
    const modeLabel = validMode === 'bm25' ? 'structured field search' : validMode === 'vector' ? 'broad keyword search' : 'keyword + summary search';

    // Step 3: Build message array for GROQ
    // Keep last 10 turns of history to stay within token limits
    const recentHistory = history.slice(-10);

    const groqMessages = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `PANEL EVALUATION DATA (from panel_evaluations collection — ${modeLabel}):\n${contextBlock}`,
      },
      {
        role: 'assistant',
        content: 'I have reviewed the relevant panel evaluation data. I am ready to answer your question.',
      },
      // Inject conversation history
      ...recentHistory.map((turn) => ({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: turn.content,
      })),
      // Current user message
      { role: 'user', content: trimmedMessage },
    ];

    // Step 4: Call LLM for AI response (Ollama or GROQ)
    const provider = OLLAMA_BASE ? 'Ollama' : 'GROQ';
    console.log(`[Chat] Calling ${provider} with ${groqMessages.length} messages`);
    const reply = await callGroqChat(groqMessages);
    console.log(`[Chat] ${provider} reply length: ${reply.length} chars`);

    return res.status(200).json({
      success: true,
      reply,
      sources,
      searchQuery,
      searchMode: validMode,
      resultCount: searchResults.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Chat] Error:', err.message);

    if (err.message.includes('GROQ_API_KEY') || err.message.includes('No LLM provider')) {
      return res.status(503).json({
        error: 'AI service not configured',
        details: 'No LLM provider configured (set OLLAMA_BASE_URL or GROQ_API_KEY)',
      });
    }

    if (err.message.includes('LLM') || err.message.includes('GROQ') || err.message.includes('timed out')) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable',
        details: err.message,
        hint: err.message.includes('timed out') ? 'The model is loading or busy — please wait a moment and retry.' : undefined,
      });
    }

    res.status(500).json({
      error: 'Chat request failed',
      details: err.message,
    });
  }
});

module.exports = router;
