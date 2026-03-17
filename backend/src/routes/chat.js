const express = require('express');
const router = express.Router();
const { getDb } = require('../services/mongoClient');
const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';

const CHAT_SYSTEM_PROMPT = `You are PanelPulse AI Assistant — an expert HR analytics chatbot for the PanelPulse platform.

Your role is to help the HR TAG (Talent Acquisition Group) team by:
- Answering questions about panel efficiency scores, dimensions, and evaluations
- Recommending suitable interview panels for specific technology domains
- Identifying patterns in candidate rejection vs probing depth
- Summarizing evaluation trends across panels and candidates
- Providing actionable insights from panel interview data

You have access to STRUCTURED panel evaluation records fetched directly from the PanelPulse database. Each record contains the full evaluation result including overall score, per-dimension scores, evidence points, panel summary, and L2 validation details.

RESPONSE GUIDELINES:
- Be concise but thorough. Use highly exact, professional business English.
- NEVER start your response with conversational filler like "Based on the provided PANEL EVALUATION DATA...". Start immediately with the answer.
- NEVER include disclaimers or concluding paragraphs like "Please note that this assessment is based on a single evaluation window...". Just stop writing after the final point.
- When asked to list, rank, or compare (e.g., "who is the best panel member"), ALWAYS format the response as a numbered markdown list.
- For each item in a ranking/list, use bold headings and follow this exact structure:
  **1) [Panel Member Name] (ID: [Job Interview ID])**
  - **Score:** [Overall Score]/10.0
  - **Why:** [Concise explanation citing specific dimension scores and evidence]
- When data is not available in the context, concisely state "No data available." rather than hallucinating.
- Format scores as X.X/10. For dimension scores, show achieved/max (e.g., 2.1/2.5).
- Keep a professional but approachable tone suited for HR teams. Do not use conversational filler or vague words like "somewhat" or "kind of".
- Always prioritize data from the "PANEL EVALUATION DATA" section.
- Use the Panel Summary field to give descriptive answers about evaluation quality.
- Use Evidence points to support specific claims about what was or wasn't covered.

PANEL SCORING DIMENSIONS (max scores):
- Mandatory Skill Coverage: 2.0
- Technical Depth: 2.0
- Rejection Validation Alignment: 2.0
- Scenario/Risk Evaluation: 1.0
- Framework Knowledge: 1.0
- Hands-on Validation: 1.0
- Leadership Evaluation: 0.5
- Behavioral Assessment: 0.5
Total max score: 10.0

Score interpretation: 0–4.9 = Poor, 5.0–7.9 = Moderate, 8.0–10.0 = Good
Confidence levels: High / Medium / Low (reflects how certain the AI is about the score)`;

/**
 * Call GROQ API for chat completion
 */
async function callGroqChat(messages) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) {
      return reject(new Error('GROQ_API_KEY not configured'));
    }

    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 1024,
      top_p: 0.9,
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message || 'GROQ API error'));
          }
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) return reject(new Error('Empty response from GROQ'));
          resolve(content);
        } catch (e) {
          reject(new Error('Failed to parse GROQ response'));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`GROQ request failed: ${e.message}`)));
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

    // ── evidence (top 3) ─────────────────────────────────────────────────
    if (Array.isArray(doc.evidence) && doc.evidence.length > 0) {
      lines.push('Key Evidence     :');
      doc.evidence.slice(0, 3).forEach((ev) => {
        const text = typeof ev === 'string' ? ev : (ev?.text || ev?.description || JSON.stringify(ev));
        lines.push(`  • ${String(text).substring(0, 150)}`);
      });
    }

    // ── panel summary ─────────────────────────────────────────────────────
    if (doc.panel_summary) {
      lines.push(`Panel Summary    : ${doc.panel_summary.substring(0, 600)}`);
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

    // Step 4: Call GROQ for AI response
    console.log(`[Chat] Calling GROQ with ${groqMessages.length} messages`);
    const reply = await callGroqChat(groqMessages);
    console.log(`[Chat] GROQ reply length: ${reply.length} chars`);

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

    if (err.message.includes('GROQ_API_KEY')) {
      return res.status(503).json({
        error: 'AI service not configured',
        details: 'GROQ API key is missing',
      });
    }

    if (err.message.includes('GROQ')) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable',
        details: err.message,
      });
    }

    res.status(500).json({
      error: 'Chat request failed',
      details: err.message,
    });
  }
});

module.exports = router;
