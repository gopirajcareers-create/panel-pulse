/**
 * Panel Evaluation Service
 * 
 * LLM-based panel evaluation scoring for interview candidates.
 * Generates scores across multiple dimensions and validates L2 rejection reasons.
 */

const axios = require('axios');

// Panel scoring configuration — max scores per dimension; final score = SUM of all
// Weighted: Mandatory (25%) + Technical Depth (25%) = 50%; remaining 6 dims share 50%
const PANEL_DIMENSIONS = {
  'Mandatory Skill Coverage': { max: 2.0 },
  'Technical Depth': { max: 2.0 },
  'Rejection Validation Alignment': { max: 2.0 }, // Added based on user feedback
  'Scenario / Risk Evaluation': { max: 1.0 },
  'Framework Knowledge': { max: 1.0 },
  'Hands-on Validation': { max: 1.0 },
  'Leadership Evaluation': { max: 0.5 },
  'Behavioral Assessment': { max: 0.5 }
};
// Maximum possible panel score (sum of all dimension maxes) = 10.0
const MAX_PANEL_SCORE = Object.values(PANEL_DIMENSIONS).reduce((s, d) => s + d.max, 0);

// System prompts
const PANEL_SCORING_SYSTEM_PROMPT = `You are an expert panel evaluator assessing interview candidates. 
Your task is to score candidates across multiple dimensions using the provided transcripts and job description.
Return ONLY valid JSON matching the exact schema provided. No additional text.`;

const JD_REFINE_SYSTEM_PROMPT = `You are a Senior Recruitment Manager.
Extract ONLY the specific names of technical skills from the JD.

Format:
Key Skills:
- Skill Name 1
- Skill Name 2

Mandatory Skills:
- Skill Name 1

Good To Have Skills:
- Skill Name 1

RULES:
1. ONLY output these three specific categories: Key Skills, Mandatory Skills, and Good To Have Skills.
2. DO NOT repeat the same skill in more than one category.
3. ONLY output the names of the skills (e.g. "Java", "React", "SQL").
4. ALWAYS use a markdown bulleted list (starting with - ) for skills. One skill per line.
5. NO explanations, NO justifications, NO commas between skills on the same line.
6. NO conversational filler. NO thinking process.
7. Return ONLY the bulleted list. No intro or outro text.`;


const PANEL_SUMMARY_SYSTEM_PROMPT = `You are a Senior HR Manager reviewing a panel interview evaluation report.
Write a detailed, professional assessment of the interview panel's performance.

CRITICAL FORMAT RULES — follow EXACTLY:
1. Output FOUR sections only, each starting with an exact header followed by a colon. 
   Use this exact format for each section (no ** stars, no markdown bold):

   Panel Member Behavior: <detailed analysis of interviewer professionalism and technical preparedness>
   
   Interview Process: <detailed analysis of technical depth, scenario probing, and all 8 dimensions>
   
   Rejection Reason Validation: <detailed analysis of how well the panel validated the candidate's actual L2 rejection reasons>
   
   Identified Gaps: <detailed analysis of specific probing gaps found in this interview>

2. Write 3-4 detailed, professional points for each section.
3. DO NOT use **bold**, *italic*, or any markdown formatting. Plain text only.
4. Use highly formal, definitive business English.
5. NOISE ROBUSTNESS: Ignore small talk, audio drops, or irrelevant tangents. Evaluate ONLY technical probing quality.
6. Tone by Score:
   - Score >= 8.0 or DEEP_PROBING verdict: Highly positive, praise technical depth.
   - Score < 8.0 or SURFACE/NO_PROBING: Direct and constructive, naming specific missed areas.
7. Make every section specific to the actual JD skills and transcript content — no generic filler.`;

const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a Quality Assurance Specialist for interview panels. 
Your task is to write a short "Gap Analysis" summary based on the L2 Rejection Reasons and the panel's scoring gaps.

Analyze:
1. Did the panel fail to ask enough questions in the areas where the candidate was rejected?
2. Did they accept surface-level answers for critical mandatory skills?
3. What specifically should the panel have probed deeper on to confirm the rejection earlier?

Rules:
1. Be direct and constructive.
2. Focus ONLY on the gaps in the panel member's probing behavior.
3. Format as a bulleted markdown list. No intro/outro.`;

const L2_VALIDATION_SYSTEM_PROMPT = `You are an L2 validation expert reviewing rejection reasons.
Classify the probing depth and validate evidence from transcripts.
CRITICAL RULE: "evidence" MUST ONLY contain quotes from the INTERVIEWER/PANEL, NOT the candidate. You are judging the Panel's ability to probe.
For each rejection reason, you MUST provide:
1. A clear one-line "summary" explaining where/how the panel probed this area and the result.
2. 1-2 short, specific "points" of evidence based ONLY on the transcript (quoting the panelist).
Return ONLY valid JSON. No additional text.`;

/**
 * Perform panel evaluation scoring
 * 
 * @param {Object} input - Evaluation input
 * @param {string} input.job_id - Job/Interview ID
 * @param {string} input.panel_name - Panel name (optional)
 * @param {string} input.candidate_name - Candidate name (optional)
 * @param {string} input.jd - Job Description
 * @param {Array<string>} input.l1_transcripts - L1 interview transcripts
 * @param {Array<string>} input.l2_rejection_reasons - L2 rejection reasons (optional)
 * @returns {Promise<Object>} Panel evaluation result
 */
async function performPanelEvaluation(input) {
  try {
    const { job_id, panel_name = '', candidate_name = '', jd, l1_transcripts, l2_rejection_reasons = [], panel_member_id = '', panel_member_email = '' } = input;

    // Validate inputs
    if (!job_id || !jd || !l1_transcripts || l1_transcripts.length === 0) {
      throw new Error('Missing required parameters: job_id, jd, l1_transcripts (non-empty array)');
    }

    if (!Array.isArray(l1_transcripts)) {
      throw new Error('l1_transcripts must be an array of strings');
    }

    let forcedL2Verdict = '';
    
    // Enforce Probing Depth Locking: Run L2 Validation first to determine the exact verdict
    if (l2_rejection_reasons && l2_rejection_reasons.length > 0 && l2_rejection_reasons[0] && l2_rejection_reasons[0] !== 'N/A') {
      try {
        const l2Res = await validateL2Rejection({ job_id, l2_reason: l2_rejection_reasons[0], l1_transcripts });
        if (l2Res && l2Res.success && l2Res.validation && l2Res.validation.probing_verdict) {
          forcedL2Verdict = l2Res.validation.probing_verdict;
        }
      } catch (err) {
        console.warn('Could not pre-calculate L2 validation for scoring alignment:', err.message);
      }
    }

    // Build the evaluation prompt, injecting the strict verdict
    const userPrompt = _buildPanelScoringPrompt(job_id, jd, l1_transcripts, l2_rejection_reasons, forcedL2Verdict);

    // Call LLM
    const groqResponse = await _callGroqWithRetry(userPrompt, PANEL_SCORING_SYSTEM_PROMPT);

    // Parse and validate response
    const evaluation = _parseAndValidatePanelScore(groqResponse, job_id);

    // 5 & 6. Generate Gap Analysis first (as it's used in the main summary)
    const gapAnalysis = await _generateGapAnalysis(evaluation, jd, l2_rejection_reasons);

    // Generate refined JD and detailed panel summary in parallel
    const [refinedJd, panelSummary] = await Promise.all([
      _generateRefinedJD(jd),
      _generatePanelSummary(evaluation, jd, l2_rejection_reasons, gapAnalysis),
    ]);

    evaluation.panel_summary = panelSummary;
    evaluation.gap_analysis = gapAnalysis;
    evaluation.refined_jd = refinedJd;

    // 7. Store in DB
    await _storeEvaluationInDB({
      ...evaluation,
      panel_name,
      candidate_name,
      l2_rejection_reasons,
      l1_transcript: l1_transcripts.join('\n\n'),
      refined_jd: refinedJd,
      panel_summary: panelSummary,
      gap_analysis: gapAnalysis,
      panel_member_id,
      panel_member_email
    });

    return {
      success: true,
      evaluation: evaluation,
      refined_jd: refinedJd,
      panel_summary: panelSummary,
      gap_analysis: gapAnalysis,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in panel evaluation:', error.message);
    const isRateLimit = /rate limit|429/i.test(error.message || '');
    return {
      success: false,
      error: error.message,
      error_code: isRateLimit ? 429 : 500,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Validate L2 rejection reasons
 * 
 * @param {Object} input - Validation input
 * @param {string} input.job_id - Job/Interview ID
 * @param {string} input.l2_reason - L2 rejection reason
 * @param {Array<string>} input.l1_transcripts - L1 transcripts for evidence
 * @returns {Promise<Object>} L2 validation result
 */
async function validateL2Rejection(input) {
  try {
    const { job_id, l2_reason, l1_transcripts } = input;

    // Validate inputs
    if (!job_id || !l2_reason || !l1_transcripts) {
      throw new Error('Missing required parameters: job_id, l2_reason, l1_transcripts');
    }

    if (!Array.isArray(l1_transcripts) || l1_transcripts.length === 0) {
      throw new Error('l1_transcripts must be a non-empty array');
    }

    // Build validation prompt
    const userPrompt = _buildL2ValidationPrompt(job_id, l2_reason, l1_transcripts);

    // Call LLM
    const groqResponse = await _callGroqWithRetry(userPrompt, L2_VALIDATION_SYSTEM_PROMPT);

    // Parse response
    const validation = _parseL2ValidationResponse(groqResponse);

    return {
      success: true,
      validation: validation,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in L2 validation:', error.message);
    const isRateLimit = /rate limit|429/i.test(error.message || '');
    return {
      success: false,
      error: error.message,
      error_code: isRateLimit ? 429 : 500,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Build panel scoring prompt
 * 
 * @private
 */
function _buildPanelScoringPrompt(job_id, jd, l1_transcripts, l2_rejection_reasons, forcedL2Verdict = '') {
  const transcriptText = l1_transcripts.map((t, i) => `Transcript ${i + 1}:\n${t}`).join('\n\n');
  const reasonsText = l2_rejection_reasons.length > 0
    ? `\n\nL2 Rejection Reasons:\n${l2_rejection_reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const alignmentRuleIntro = forcedL2Verdict 
    ? `CRITICAL SCORING RULE:\nAn independent AI analysis has established the Probing Depth verdict for this interview is: **${forcedL2Verdict}**.\nYou MUST assign the "Rejection Validation Alignment" score in exact accordance with this verdict:`
    : reasonsText.length === 0 
      ? `For "Rejection Validation Alignment": Since this candidate was SELECTED (no rejection reasons), score this dimension based on how thoroughly the panel member validated the candidate's key strengths and mandatory skills to confirm they are indeed a top-tier hire.`
      : `For "Rejection Validation Alignment", assign a precise decimal score based on the Probing Depth verdict:`;

  return `You are evaluating PANEL EFFICIENCY — how well the INTERVIEWER/PANEL probed the candidate.
Focus on the INTERVIEWER's questions and probing depth, NOT the candidate's answers.

Job ID: ${job_id}

Job Description:
${jd}

${transcriptText}${reasonsText}

Score each dimension based on how thoroughly the PANEL covered it through their questions.
CRITICAL SCORING MANDATE: You MUST award MAXIMUM points (e.g., 2.0/2.0, 1.0/1.0) if the panelist exhaustively satisfies the requirement. Do NOT artificially lower scores (e.g., giving 1.6 instead of 2.0) if the panelist did a perfect or highly professional job.
NOISE ROBUSTNESS RULE: Ignore conversational noise, tangents, small talk, technical difficulties (audio/video dropouts), and interruptions (dogs barking, deliveries). Evaluate ONLY the depth and quality of the TECHNICAL PROBING. Do NOT penalize "time management" or "flow" if the actual technical questions asked were excellent.
BEHAVIORAL/LEADERSHIP RULE: Do NOT score generic architecture or project background questions under Behavioral Assessment. Behavioral Assessment is ONLY for conflict resolution, teamwork, or cultural fit. Leadership is ONLY for mentoring, team size, or strategic direction. If the question is about technical architecture, put it under Technical Depth or Scenario Evaluation.
${alignmentRuleIntro}
- If DEEP_PROBING: Score 2.0 for exhaustive and flawless probing. Score 1.8-1.9 for strong but slightly incomplete probing.
- If SURFACE_PROBING: Score between 0.5 and 1.4 (e.g., 1.0 for basic probing, 1.4 for decent but not deep).
- If NO_PROBING: Score between 0.0 and 0.4 (e.g., 0.0 for missing it entirely, 0.2 for a very faint, incidental mention).
Do not just give round numbers; evaluate the exact quality of the alignment.
Each dimension has its own maximum score — score within that range ONLY.

Return ONLY a valid JSON object (no extra text):
{
  "job_id": "${job_id}",
  "score": <sum of all category scores>,
  "confidence": <0-1>,
  "categories": {
    "Mandatory Skill Coverage": <0 to 2.0>,
    "Technical Depth": <0 to 2.0>,
    "Rejection Validation Alignment": <0 to 2.0>,
    "Scenario / Risk Evaluation": <0 to 1.0>,
    "Framework Knowledge": <0 to 1.0>,
    "Hands-on Validation": <0 to 1.0>,
    "Leadership Evaluation": <0 to 0.5>,
    "Behavioral Assessment": <0 to 0.5>
  },
  "evidence": {
    "Mandatory Skill Coverage": ["Interviewer question or probing statement that covered this dimension"],
    "Technical Depth": ["Interviewer question or probing statement"],
    "Rejection Validation Alignment": ["Interviewer question or probing statement targeting the specific rejection reasons"],
    "Scenario / Risk Evaluation": ["Interviewer question or probing statement"],
    "Framework Knowledge": ["Interviewer question or probing statement"],
    "Hands-on Validation": ["Interviewer question or probing statement"],
    "Leadership Evaluation": ["Interviewer question or probing statement"],
    "Behavioral Assessment": ["Interviewer question or probing statement"]
  },
  "probing_verdict": "NO_PROBING|SURFACE_PROBING|DEEP_PROBING",
  "l2_validation": {
    "matches_evidence": true,
    "notes": "brief notes"
  }
}

IMPORTANT:
- Evidence must only quote the INTERVIEWER/PANEL lines (lines starting with 'Interviewer:' or 'Panel:' or specific interviewer names like 'Sarah:')
- If a dimension was NOT covered by the panel, set its score to 0 and evidence array to []
- The top-level "score" MUST equal the exact sum of all category scores`;
}

/**
 * Build L2 validation prompt
 * 
 * @private
 */
function _buildL2ValidationPrompt(job_id, l2_reason, l1_transcripts) {
  const transcriptText = l1_transcripts.map((t, i) => `Transcript ${i + 1}:\n${t}`).join('\n\n');

  return `Validate this L2 rejection reason against L1 transcripts.

Job ID: ${job_id}
L2 Rejection Reason: ${l2_reason}

${transcriptText}

Return a JSON object with:
{
  "job_id": "${job_id}",
  "probing_verdict": "NO_PROBING|SURFACE_PROBING|DEEP_PROBING",
  "evidence": [
    {
      "quote": "supporting quote from transcript",
      "source": "transcript_1:line_range"
    }
  ],
  "justifications": {
    "${String(l2_reason).split(',')[0].trim()}": {
      "summary": "One-line justification of where/how the panel member probed this area.",
      "points": ["Specific transcript point 1", "Specific transcript point 2"]
    }
  },
  "confidence": <0-1>,
  "notes": "brief validation verdict"
}`;
}

/**
 * Call LLM API with retry logic — prefers local Ollama, falls back to GROQ
 *
 * @private
 */
async function _callGroqWithRetry(userPrompt, systemPrompt) {
  const ollamaBase = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
  const ollamaModel = process.env.OLLAMA_MODEL_NAME || process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';
  const groqApiKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';

  if (!ollamaBase && !groqApiKey) {
    throw new Error('No LLM provider configured (set OLLAMA_BASE_URL or GROQ_API_KEY)');
  }

  // Use Ollama when OLLAMA_BASE_URL is configured, otherwise fall back to GROQ
  // Ollama native /api/chat works on all versions; /v1/chat/completions requires Ollama >= 0.1.24
  const apiUrl = ollamaBase
    ? `${ollamaBase}/api/chat`
    : 'https://api.groq.com/openai/v1/chat/completions';
  const model = ollamaBase ? ollamaModel : groqModel;
  const headers = { 'Content-Type': 'application/json' };
  if (!ollamaBase) headers['Authorization'] = `Bearer ${groqApiKey}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const body = ollamaBase
      ? { model, messages, stream: false, options: { temperature: 0.2, num_predict: 2000 } }
      : { model, messages, temperature: 0.2, max_tokens: 2000, top_p: 1, stream: false };

    const response = await axios.post(apiUrl, body, { headers, timeout: ollamaBase ? 180000 : 30000 });

    const rawContent = ollamaBase
      ? (response.data?.message?.content || response.data?.message?.thinking || '')
      : response.data?.choices?.[0]?.message?.content;

    // Strip chain-of-thought <think> blocks emitted by deepseek-r1 style models
    const content = (rawContent || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    if (!content) throw new Error('Invalid response format from LLM API');
    return content;
  } catch (error) {
    const provider = ollamaBase ? 'Ollama' : 'GROQ';
    // Log the full response body when available to help diagnose model-not-found 404s
    const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error(`[PanelEval] ${provider} request failed:`, detail);

    if (error.response && error.response.status === 429) {
      throw new Error(`${provider} rate limit (429) — validation temporarily unavailable. Please try again later.`);
    }
    if (error.response && error.response.status === 404) {
      throw new Error(`${provider} 404 — model not found or endpoint unavailable. Check OLLAMA_MODEL_NAME (run GET /api/v1/health/llm to see available models). Detail: ${detail}`);
    }

    throw new Error(`${provider} request failed: ${detail}`);
  }
}

/**
 * Parse and validate panel score response
 * 
 * @private
 */
function _parseAndValidatePanelScore(response, job_id) {
  try {
    // Robust JSON extraction: handle markdown code blocks, then balanced-brace scan
    const text = String(response || '');
    let jsonText = null;

    // 1. Try explicit ```json ... ``` block
    const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
    if (jsonBlock) {
      jsonText = jsonBlock[1].trim();
    } else {
      // 2. Balanced-brace scan for first complete JSON object
      const firstBrace = text.indexOf('{');
      if (firstBrace !== -1) {
        let idx = firstBrace, depth = 0, inString = false, escape = false, endIdx = -1;
        while (idx < text.length) {
          const ch = text[idx];
          if (escape) { escape = false; }
          else if (ch === '\\') { escape = true; }
          else if (ch === '"') { inString = !inString; }
          else if (!inString) {
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) { endIdx = idx; break; } }
          }
          idx++;
        }
        if (endIdx !== -1) jsonText = text.slice(firstBrace, endIdx + 1);
      }
    }

    if (!jsonText) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonText);

    // Ensure job_id matches
    if (!parsed.job_id) {
      parsed.job_id = job_id;
    }

    // Recalculate score as SUM of category scores (authoritative)
    if (parsed.categories) {
      let sum = 0;
      for (const [dim, config] of Object.entries(PANEL_DIMENSIONS)) {
        const catScore = parsed.categories[dim] || 0;
        // Clamp each dimension score to its maximum
        parsed.categories[dim] = Math.min(parseFloat(catScore.toFixed(2)), config.max);
        sum += parsed.categories[dim];
      }
      parsed.score = Math.round(sum * 10) / 10;
    }

    // Ensure confidence is present
    if (!parsed.confidence) {
      parsed.confidence = 0.7; // Default confidence
    }

    // Helper to unescape HTML entities that LLMs sometimes generate
    const unescapeHtml = (str) => {
      if (typeof str !== 'string') return str;
      return str.replace(/&#039;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
    };

    // Recursively clean strings in the parsed object
    const cleanObjectStrings = (obj) => {
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          if (typeof obj[i] === 'string') obj[i] = unescapeHtml(obj[i]);
          else if (typeof obj[i] === 'object' && obj[i] !== null) cleanObjectStrings(obj[i]);
        }
      } else if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (typeof obj[key] === 'string') obj[key] = unescapeHtml(obj[key]);
          else if (typeof obj[key] === 'object' && obj[key] !== null) cleanObjectStrings(obj[key]);
        }
      }
    };
    
    cleanObjectStrings(parsed);

    // Validate structure
    _validatePanelStructure(parsed);

    return parsed;
  } catch (error) {
    console.error('Error parsing panel score:', error.message);
    throw error;
  }
}

/**
 * Parse L2 validation response
 * 
 * @private
 */
function _parseL2ValidationResponse(response) {
  try {
    // Robustly extract the first balanced JSON object from the response text
    const text = String(response || '');
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) {
      throw new Error('No JSON object start found in response');
    }

    let idx = firstBrace;
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

    while (idx < text.length) {
      const ch = text[idx];

      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = !inString;
      } else if (!inString) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            endIdx = idx;
            break;
          }
        }
      }

      idx++;
    }

    if (endIdx === -1) {
      throw new Error('No balanced JSON object found in response');
    }

    const jsonText = text.slice(firstBrace, endIdx + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      // Provide a helpful error including a snippet
      throw new Error(`Failed to parse JSON extracted from response: ${e.message}`);
    }

    // Normalize the probing_verdict field - convert underscores to spaces then uppercase
    if (parsed && parsed.probing_verdict) {
      parsed.probing_verdict = String(parsed.probing_verdict).replace(/_/g, ' ').toUpperCase();
    }

    return parsed;
  } catch (error) {
    console.error('Error parsing L2 validation:', error.message);
    throw error;
  }
}

/**
 * Validate panel evaluation structure
 *
 * @private
 */
function _validatePanelStructure(obj) {
  // Validate required fields
  if (!obj.job_id || typeof obj.job_id !== 'string') {
    throw new Error('Invalid or missing job_id');
  }

  if (typeof obj.score !== 'number' || obj.score < 0 || obj.score > MAX_PANEL_SCORE + 0.5) {
    throw new Error(`Score must be between 0 and ${MAX_PANEL_SCORE}`);
  }

  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    throw new Error('Confidence must be between 0 and 1');
  }

  if (!obj.categories || typeof obj.categories !== 'object') {
    throw new Error('Invalid categories object');
  }

  // Accept both array (legacy) and object (per-dimension) evidence formats
  if (!obj.evidence || (typeof obj.evidence !== 'object')) {
    obj.evidence = {};
  }

  if (!['NO_PROBING', 'SURFACE_PROBING', 'DEEP_PROBING'].includes(obj.probing_verdict)) {
    obj.probing_verdict = 'SURFACE_PROBING'; // Default
  }

  if (!obj.l2_validation || typeof obj.l2_validation !== 'object') {
    obj.l2_validation = { matches_evidence: false, notes: 'Not validated' };
  }
}

/**
 * Generate a refined JD skill classification using the ICEO prompt
 * @private
 */
async function _generateRefinedJD(jd) {
  try {
    const userPrompt = `Analyse this Job Description and list ONLY the core skill names into Key, Mandatory, and Good To Have lists:\n\nJob Description:\n${jd}`;
    const rawContent = await _callGroqWithRetry(userPrompt, JD_REFINE_SYSTEM_PROMPT);
    
    // Extra safety: strip any reasoning that leaked outside think blocks
    let clean = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Strip common AI filler if it leaked
    clean = clean.split('\n').filter(line => {
      const l = line.toLowerCase();
      return !l.includes('wait,') && !l.includes('the user said') && !l.includes('inference') && !l.includes('thinking about');
    }).join('\n');

    const parsed = { key_skills: [], mandatory_skills: [], good_to_have_skills: [], raw: clean };
    
    // Flexible regexes to handle markdown stars, hashtags, and casing
    const keyMatch = clean.match(/(?:[#*]*\s*)?Key\s+Skills\s*[:*]*\s*([\s\S]*?)(?=(?:[#*]*\s*)?(?:Mandatory|Good\s+To\s+Have|Good\s+To\s+Have\s+Skills)\s+Skills|Good\s+To\s+Have|$)/i);
    const mandatoryMatch = clean.match(/(?:[#*]*\s*)?Mandatory\s+Skills\s*[:*]*\s*([\s\S]*?)(?=(?:[#*]*\s*)?(?:Key|Good\s+To\s+Have|Good\s+To\s+Have\s+Skills)\s+Skills|Good\s+To\s+Have|$)/i);
    const goodMatch = clean.match(/(?:[#*]*\s*)?(?:Good\s+To\s+Have\s+Skills|Good\s+To\s+Have)\s*[:*]*\s*([\s\S]*?)(?=(?:[#*]*\s*)?(?:Key|Mandatory)\s+Skills|$)/i);

    // Noise words that appear in AI reasoning but never in real skill names
    const NOISE_PHRASES = [
      'wait,', 'hmm,', 'i need', 'the user', 'so that', 'maybe', 'perhaps',
      'actually', 'however', 'but the', 'deep understanding', 'experience with',
      'the mention', 'this is', 'might struggle', 'another key', 'for the role',
      'the candidate', 'the jd', 'the role', 'the panel', 'specific database',
      'it is', 'it\'s', 'which', 'that is', 'let me', 'need to check',
      'the rules', 'the example', 'inference', 'thinking about', 'i\'m', 'i think'
    ];

    const seenSkills = new Set();
    function extractLines(block) {
      if (!block) return [];
      
      // Split by newline first
      let lines = block.trim().split('\n');
      
      // If we only have one line but it has commas/semicolons, it might be a single-line list
      if (lines.length === 1 && (lines[0].includes(',') || lines[0].includes(';'))) {
        lines = lines[0].split(/[,;]/);
      }

      return lines
        .map(l => l.replace(/^[*•\-]\s*/, '').replace(/^\d+\.\s*/, '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim())
        .filter(l => {
          const lower = l.toLowerCase();
          if (lower.length <= 1) return false;
          
          // De-duplication check
          if (seenSkills.has(lower)) return false;
          
          // Technical skill names are usually 1-4 words. Anything > 8 words is likely noise.
          const wordCount = l.split(/\s+/).length;
          if (wordCount > 8) return false;
          
          // Reject lines that contain AI-reasoning noise phrases
          if (NOISE_PHRASES.some(p => lower.includes(p))) return false;
          
          // Specific case for things like ", and" or "and "
          if (lower === 'and' || lower === '&') return false;

          seenSkills.add(lower);
          return true;
        })
        .map(l => {
          // Strip trailing punctuation and filler words like "and"
          return l.replace(/[.,;:]+$/, '').replace(/^and\s+/i, '').replace(/\s+and$/i, '').trim();
        })
        .filter(l => l.length > 1);
    }

    parsed.key_skills = extractLines(keyMatch?.[1]);
    parsed.mandatory_skills = extractLines(mandatoryMatch?.[1]);
    parsed.good_to_have_skills = extractLines(goodMatch?.[1]);
    return parsed;
  } catch (err) {
    console.error('_generateRefinedJD error:', err.message);
    return null;
  }
}


/**
 * Generate a natural-language panel summary paragraph
 * @private
 */
async function _generatePanelSummary(evaluation, jd, l2_rejection_reasons = [], gapAnalysis = null) {
  try {
    // Derive score category from percentage of MAX_PANEL_SCORE
    const scorePct = evaluation.score / MAX_PANEL_SCORE;
    const scoreCategory = evaluation.score_category ||
      (scorePct >= 0.8 ? 'Good' : scorePct >= 0.5 ? 'Moderate' : 'Poor');

    // Label each dimension ACCEPTABLE (>=50% of its max) or WEAK (<50%)
    const catLines = Object.entries(evaluation.categories || {})
      .map(([dim, score]) => {
        const max = PANEL_DIMENSIONS[dim]?.max ?? 1;
        const label = score >= max * 0.5 ? 'ACCEPTABLE' : 'WEAK';
        return `  - ${dim}: ${score}/${max} — ${label}`;
      })
      .join('\n');

    const rejectionContext = l2_rejection_reasons.length > 0
      ? `\nCandidate Rejection Reasons:\n${l2_rejection_reasons.map(r => `- ${r}`).join('\n')}`
      : '';

    const gapContext = gapAnalysis
      ? `\nTop Identified Gaps Point:\n${gapAnalysis.split('\n')[0]}`
      : '';

    const userPrompt = `Panel Evaluation Results:
- Overall Score: ${evaluation.score} / ${MAX_PANEL_SCORE}
- Score Category: ${scoreCategory}
- Dimensions:
${catLines}${rejectionContext}${gapContext}

Job Description Context:
${String(jd || '').substring(0, 400)}

Generate a detailed, multi-point bulleted summary covering panel behavior, interview process quality, rejection validation effectiveness, and at least one identification gap.`;

    const summary = await _callGroqWithRetry(userPrompt, PANEL_SUMMARY_SYSTEM_PROMPT);
    return summary.trim();
  } catch (err) {
    console.error('_generatePanelSummary error:', err.message);
    return null;
  }
}

/**
 * Generate a specialized gap analysis summary
 * @private
 */
async function _generateGapAnalysis(evaluation, jd, l2_rejection_reasons) {
  try {
    if (!l2_rejection_reasons || l2_rejection_reasons.length === 0) {
      return null;
    }

    const catLines = Object.entries(evaluation.categories || {})
      .map(([dim, score]) => {
        const max = PANEL_DIMENSIONS[dim]?.max ?? 1;
        return `  - ${dim}: ${score}/${max}`;
      })
      .join('\n');

    const userPrompt = `Analyse the GAPS in the panel member's interview probing.
    
Rejection Reasons Provided:
${l2_rejection_reasons.map(r => `- ${r}`).join('\n')}

Panel Scoring Gaps:
${catLines}

Job Description Context:
${String(jd || '').substring(0, 500)}

Evidence of Panel Questioning:
${JSON.stringify(evaluation.evidence || {}, null, 2)}

Provide a bulleted list analyzing why the panel failed to probe deep enough to catch these rejection reasons earlier, and identifying the specific "probing gaps".`;

    const summary = await _callGroqWithRetry(userPrompt, GAP_ANALYSIS_SYSTEM_PROMPT);
    return summary.trim();
  } catch (err) {
    console.error('_generateGapAnalysis error:', err.message);
    return null;
  }
}

/**
 * Store evaluation result in MongoDB
 * @private
 */
async function _storeEvaluationInDB(evaluationData) {
  try {
    const { getDb } = require('./mongoClient');
    const db = await getDb();
    const collection = db.collection('panel_evaluations');

    const document = {
      'Job Interview ID': evaluationData.job_id,
      'Panel Name': evaluationData.panel_name,
      'Candidate Name': evaluationData.candidate_name,
      score: evaluationData.score,
      confidence: evaluationData.confidence,
      categories: evaluationData.categories,
      evidence: evaluationData.evidence,
      l2_validation: evaluationData.l2_validation,
      l2_rejection_reasons: evaluationData.l2_rejection_reasons || [],
      l1_transcript: evaluationData.l1_transcript || '',
      refined_jd: evaluationData.refined_jd || null,
      panel_summary: evaluationData.panel_summary || null,
      gap_analysis: evaluationData.gap_analysis || null,
      panel_member_id: evaluationData.panel_member_id || '',
      panel_member_email: evaluationData.panel_member_email || '',
      evaluated_at: new Date().toISOString(),
      created_at: new Date()
    };

    await collection.insertOne(document);
    console.log(`Stored evaluation for Job Interview ID: ${evaluationData.job_id}`);
  } catch (error) {
    console.error('Error storing evaluation in DB:', error.message);
    // Don't throw - evaluation was successful, just log the storage error
  }
}

module.exports = {
  performPanelEvaluation,
  validateL2Rejection,
  PANEL_DIMENSIONS
};
