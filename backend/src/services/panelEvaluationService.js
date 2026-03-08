/**
 * Panel Evaluation Service
 * 
 * LLM-based panel evaluation scoring for interview candidates.
 * Generates scores across multiple dimensions and validates L2 rejection reasons.
 */

const axios = require('axios');

// Panel scoring configuration — max scores per dimension; final score = SUM of all
const PANEL_DIMENSIONS = {
  'Mandatory Skill Coverage': { max: 2.0 },
  'Technical Depth':          { max: 1.5 },
  'Scenario / Risk Evaluation':{ max: 1.0 },
  'Framework Knowledge':      { max: 1.0 },
  'Hands-on Validation':      { max: 1.0 },
  'Leadership Evaluation':    { max: 1.0 },
  'Behavioral Assessment':    { max: 1.0 },
  'Interview Structure':      { max: 1.5 }
};
// Maximum possible panel score (sum of all dimension maxes)
const MAX_PANEL_SCORE = Object.values(PANEL_DIMENSIONS).reduce((s, d) => s + d.max, 0); // 11.0

// System prompts
const PANEL_SCORING_SYSTEM_PROMPT = `You are an expert panel evaluator assessing interview candidates. 
Your task is to score candidates across multiple dimensions using the provided transcripts and job description.
Return ONLY valid JSON matching the exact schema provided. No additional text.`;

const L2_VALIDATION_SYSTEM_PROMPT = `You are an L2 validation expert reviewing rejection reasons.
Classify the probing depth and validate evidence from transcripts.
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
    const { job_id, panel_name = '', candidate_name = '', jd, l1_transcripts, l2_rejection_reasons = [] } = input;

    // Validate inputs
    if (!job_id || !jd || !l1_transcripts || l1_transcripts.length === 0) {
      throw new Error('Missing required parameters: job_id, jd, l1_transcripts (non-empty array)');
    }

    if (!Array.isArray(l1_transcripts)) {
      throw new Error('l1_transcripts must be an array of strings');
    }

    // Build the evaluation prompt
    const userPrompt = _buildPanelScoringPrompt(job_id, jd, l1_transcripts, l2_rejection_reasons);

    // Call GROQ LLM
    const groqResponse = await _callGroqWithRetry(userPrompt, PANEL_SCORING_SYSTEM_PROMPT);

    // Parse and validate response
    const evaluation = _parseAndValidatePanelScore(groqResponse, job_id);

    // Store evaluation in MongoDB
    await _storeEvaluationInDB({
      job_id,
      panel_name,
      candidate_name,
      score: evaluation.score,
      categories: evaluation.categories,
      confidence: evaluation.confidence,
      evidence: evaluation.evidence,
      l2_validation: evaluation.l2_validation,
      l2_rejection_reasons
    });

    return {
      success: true,
      evaluation: evaluation,
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

    // Call GROQ LLM
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
function _buildPanelScoringPrompt(job_id, jd, l1_transcripts, l2_rejection_reasons) {
  const transcriptText = l1_transcripts.map((t, i) => `Transcript ${i + 1}:\n${t}`).join('\n\n');
  const reasonsText = l2_rejection_reasons.length > 0 
    ? `\n\nL2 Rejection Reasons:\n${l2_rejection_reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  return `You are evaluating PANEL EFFICIENCY — how well the INTERVIEWER/PANEL probed the candidate.
Focus on the INTERVIEWER's questions and probing depth, NOT the candidate's answers.

Job ID: ${job_id}

Job Description:
${jd}

${transcriptText}${reasonsText}

Score each dimension based on how thoroughly the PANEL covered it through their questions.
Each dimension has its own maximum score — score within that range ONLY.

Return ONLY a valid JSON object (no extra text):
{
  "job_id": "${job_id}",
  "score": <sum of all category scores>,
  "confidence": <0-1>,
  "categories": {
    "Mandatory Skill Coverage": <0 to 2.0>,
    "Technical Depth": <0 to 1.5>,
    "Scenario / Risk Evaluation": <0 to 1.0>,
    "Framework Knowledge": <0 to 1.0>,
    "Hands-on Validation": <0 to 1.0>,
    "Leadership Evaluation": <0 to 1.0>,
    "Behavioral Assessment": <0 to 1.0>,
    "Interview Structure": <0 to 1.5>
  },
  "evidence": {
    "Mandatory Skill Coverage": ["Interviewer question or probing statement that covered this dimension"],
    "Technical Depth": ["Interviewer question or probing statement"],
    "Scenario / Risk Evaluation": ["Interviewer question or probing statement"],
    "Framework Knowledge": ["Interviewer question or probing statement"],
    "Hands-on Validation": ["Interviewer question or probing statement"],
    "Leadership Evaluation": ["Interviewer question or probing statement"],
    "Behavioral Assessment": ["Interviewer question or probing statement"],
    "Interview Structure": ["Interviewer question or probing statement"]
  },
  "probing_verdict": "NO_PROBING|SURFACE_PROBING|DEEP_PROBING",
  "l2_validation": {
    "matches_evidence": true,
    "notes": "brief notes"
  }
}

IMPORTANT:
- Evidence must only quote the INTERVIEWER/PANEL lines (lines starting with 'Interviewer:' or 'Panel:')
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
  "confidence": <0-1>,
  "notes": "brief validation verdict"
}`;
}

/**
 * Call GROQ API with retry logic
 * 
 * @private
 */
async function _callGroqWithRetry(userPrompt, systemPrompt) {
  const groqApiKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';

  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not configured in environment');
  }

  // Perform a single request to the LLM service (no automatic retries)
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: groqModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        top_p: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content;
    }

    throw new Error('Invalid response format from GROQ API');
  } catch (error) {
    console.error('GROQ request failed:', error.message);

    // Surface a clear error for rate-limiting without retrying
    if (error.response && error.response.status === 429) {
      throw new Error('GROQ rate limit (429) — validation temporarily unavailable. Please try again later.');
    }

    throw new Error(`GROQ request failed: ${error.message}`);
  }
}

/**
 * Parse and validate panel score response
 * 
 * @private
 */
function _parseAndValidatePanelScore(response, job_id) {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

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

  if (!obj.evidence || !Array.isArray(obj.evidence)) {
    obj.evidence = [];
  }

  if (!['NO_PROBING', 'SURFACE_PROBING', 'DEEP_PROBING'].includes(obj.probing_verdict)) {
    obj.probing_verdict = 'SURFACE_PROBING'; // Default
  }

  if (!obj.l2_validation || typeof obj.l2_validation !== 'object') {
    obj.l2_validation = { matches_evidence: false, notes: 'Not validated' };
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
