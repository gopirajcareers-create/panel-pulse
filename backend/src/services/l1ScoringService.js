/**
 * L1 Scoring Service — Stage 2
 *
 * Evaluates L1 interview panel efficiency across 6 dimensions (total = 10.0 pts).
 * Also runs Interview Moderation on the transcript.
 *
 * ── Dimensions ────────────────────────────────────────────────────────
 *  Mandatory Skill Coverage     2.0  — JD-listed mandatory tech probed
 *  Technical Depth              2.0  — follow-up depth ("how" / "why")
 *  Resume Initial Screening     2.0  — resume claims verified in session
 *  Scenario / Risk Evaluation   2.0  — real-world coding / problem scenarios
 *  Framework Knowledge          1.0  — JD-specific frameworks probed
 *  Hands-on Validation          1.0  — coding / tools / scripting probing
 *                               ───
 *  TOTAL L1 SCORE              10.0
 * ──────────────────────────────────────────────────────────────────────
 */

'use strict';

const { callLLM } = require('./llmClient');
const { analyzeInterviewModeration } = require('./moderationService');

// ─── Dimension Config ────────────────────────────────────────────────────────

const L1_DIMENSIONS = {
  'Mandatory Skill Coverage':   { max: 2.0, focus: 'Probing mandatory technologies explicitly listed in the JD.' },
  'Technical Depth':            { max: 2.0, focus: 'Quality of follow-up questions ("how" and "why").' },
  'Resume Initial Screening':   { max: 2.0, focus: 'Did L1 verify the specific experience and project claims written in the resume?' },
  'Scenario / Risk Evaluation': { max: 2.0, focus: 'Presenting real-world coding / problem-solving scenarios.' },
  'Framework Knowledge':        { max: 1.0, focus: 'Probing specific frameworks mentioned in the JD.' },
  'Hands-on Validation':        { max: 1.0, focus: 'Probing actual coding, tools, and scripting practices.' },
};

const MAX_L1_SCORE = Object.values(L1_DIMENSIONS).reduce((s, d) => s + d.max, 0); // 10.0

// ─── System Prompts ──────────────────────────────────────────────────────────

const L1_SCORING_SYSTEM_PROMPT = `You are a senior HR quality-assurance expert with 15+ years of technical interview assessment experience.
Your task is to evaluate how effectively the L1 (first-round) interviewer probed the candidate.
You are judging the PANEL's performance — not the candidate's.

CRITICAL RULES:
1. Return ONLY a valid JSON object. No markdown, no explanation, no preamble.
2. All string values must be JSON-safe (no raw newlines).
3. Evidence MUST only quote lines spoken by the INTERVIEWER / PANEL — never the candidate.
4. Score MAXIMUM points when the panelist genuinely did an excellent job on that dimension.
5. Score 0 when the dimension was entirely absent from the interview.
6. Do NOT artificially deflate scores — if the panelist did a thorough job, award full marks.`;

// ─── Core Scoring Function ───────────────────────────────────────────────────

/**
 * Build the scoring user prompt.
 * @param {string} jobId
 * @param {string} jd      — Job Description text
 * @param {string} resumeText — Candidate resume text (from Stage 1)
 * @param {string} transcript — L1 interview transcript
 */
function _buildScoringPrompt(jobId, jd, resumeText, transcript) {
  const MAX_CHARS = 12000;
  const safeTranscript = transcript.length > MAX_CHARS
    ? transcript.substring(0, MAX_CHARS) + '\n[... transcript truncated ...]'
    : transcript;

  const dimensionTable = Object.entries(L1_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name} (max ${cfg.max}): ${cfg.focus}`)
    .join('\n');

  return `/no_think

=== YOUR EVALUATION TASK ===
Evaluate the INTERVIEWER's (L1 panel's) probing quality in the interview transcript below.
You are NOT scoring the candidate — you are scoring how well the PANELIST covered each dimension.

=== JOB ID ===
${jobId}

=== JOB DESCRIPTION ===
${jd.substring(0, 3000)}

=== CANDIDATE RESUME (from Stage 1 screening) ===
${resumeText ? resumeText.substring(0, 2000) : 'Resume not available.'}

=== L1 INTERVIEW TRANSCRIPT ===
${safeTranscript}

=== SCORING DIMENSIONS ===
${dimensionTable}

=== SCORING INSTRUCTIONS ===
For EACH dimension:
1. Identify ALL questions asked by the INTERVIEWER that relate to this dimension.
2. Assess how deep, specific, and technically relevant those questions were.
3. Assign a score between 0 and the dimension maximum.
4. Extract 1–3 direct quotes from the INTERVIEWER proving the score.

Score thresholds per dimension:
  - MAX score: Exhaustive probing; every sub-area covered with follow-ups.
  - 75% max: Strong coverage; only minor gaps.
  - 50% max: Basic probing; surface-level questions without follow-ups.
  - 25% max: Very brief or incidental mention only.
  - 0:        Dimension entirely absent from the interview.

NOISE ROBUSTNESS: Ignore small-talk, audio issues, and off-topic conversation.
RESUME SCREENING: For "Resume Initial Screening" — check if the interviewer explicitly asked about or verified claims made in the resume (projects, tools, years of experience, certifications).

=== REQUIRED OUTPUT FORMAT ===
Return ONLY this exact JSON structure:
{
  "job_id": "${jobId}",
  "score": <exact sum of all 6 category scores, rounded to 1 decimal>,
  "score_percent": <score as percentage of 10.0, integer>,
  "score_category": "Good|Moderate|Poor",
  "confidence": <0.0–1.0>,
  "categories": {
    "Mandatory Skill Coverage":   <0.0–2.0>,
    "Technical Depth":            <0.0–2.0>,
    "Resume Initial Screening":   <0.0–2.0>,
    "Scenario / Risk Evaluation": <0.0–2.0>,
    "Framework Knowledge":        <0.0–1.0>,
    "Hands-on Validation":        <0.0–1.0>
  },
  "evidence": {
    "Mandatory Skill Coverage":   ["<exact interviewer question>"],
    "Technical Depth":            ["<exact interviewer follow-up>"],
    "Resume Initial Screening":   ["<exact interviewer question verifying resume claim>"],
    "Scenario / Risk Evaluation": ["<exact scenario question>"],
    "Framework Knowledge":        ["<exact framework question>"],
    "Hands-on Validation":        ["<exact coding/tools question>"]
  },
  "dimension_summaries": {
    "Mandatory Skill Coverage":   "<one sentence verdict>",
    "Technical Depth":            "<one sentence verdict>",
    "Resume Initial Screening":   "<one sentence verdict>",
    "Scenario / Risk Evaluation": "<one sentence verdict>",
    "Framework Knowledge":        "<one sentence verdict>",
    "Hands-on Validation":        "<one sentence verdict>"
  },
  "overall_verdict": "<2–3 sentence professional summary of the panel's L1 performance>",
  "recommendations": ["<actionable improvement point 1>", "<actionable improvement point 2>", "<actionable improvement point 3>"]
}`;
}

// ─── JSON Parser ─────────────────────────────────────────────────────────────

function _parseJSON(text) {
  const str = String(text || '');
  // Try markdown code block first
  const block = str.match(/```json\s*([\s\S]*?)```/i);
  if (block) {
    try { return JSON.parse(block[1].trim()); } catch (_) { /* fall through */ }
  }
  // Balanced brace scan
  const start = str.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end === -1) return null;
  try { return JSON.parse(str.slice(start, end + 1)); } catch (_) { return null; }
}

// ─── Clamp & Validate Scores ─────────────────────────────────────────────────

function _clampScores(parsed) {
  if (!parsed || !parsed.categories) throw new Error('Missing categories in LLM response');
  let sum = 0;
  for (const [dim, cfg] of Object.entries(L1_DIMENSIONS)) {
    const raw = parseFloat(parsed.categories[dim] ?? 0);
    parsed.categories[dim] = Math.min(Math.max(0, raw), cfg.max);
    sum += parsed.categories[dim];
  }
  parsed.score = Math.round(sum * 10) / 10;
  parsed.score_percent = Math.round((parsed.score / MAX_L1_SCORE) * 100);
  parsed.score_category = parsed.score >= 8.0 ? 'Good' : parsed.score >= 5.0 ? 'Moderate' : 'Poor';
  // Ensure all evidence arrays exist
  for (const dim of Object.keys(L1_DIMENSIONS)) {
    if (!Array.isArray(parsed.evidence?.[dim])) {
      parsed.evidence = parsed.evidence || {};
      parsed.evidence[dim] = [];
    }
  }
  return parsed;
}

// ─── Panel Summary Generator ─────────────────────────────────────────────────

const PANEL_SUMMARY_SYSTEM = `You are a Senior HR Manager writing a professional panel performance report.
Write in clear formal English. No markdown bold/italic. No bullet points — use full sentences.
Structure your response in exactly 3 paragraphs:
1. Panel behavior & professionalism
2. Interview process quality (technical depth, scenario coverage)
3. Recommendations for improvement`;

async function _generatePanelSummary(scoringResult, jd) {
  const catLines = Object.entries(scoringResult.categories || {})
    .map(([dim, sc]) => `  ${dim}: ${sc}/${L1_DIMENSIONS[dim]?.max ?? 1}`)
    .join('\n');

  const prompt = `/no_think
Panel L1 Evaluation Results:
- Overall Score: ${scoringResult.score} / ${MAX_L1_SCORE} (${scoringResult.score_percent}%)
- Category: ${scoringResult.score_category}
- Dimension Scores:
${catLines}

Dimension Summaries:
${JSON.stringify(scoringResult.dimension_summaries || {}, null, 2)}

JD Context (first 400 chars):
${String(jd || '').substring(0, 400)}

Write the professional panel performance summary in exactly 3 paragraphs (no bullet points, no markdown).`;

  try {
    const response = await callLLM(
      [{ role: 'system', content: PANEL_SUMMARY_SYSTEM }, { role: 'user', content: prompt }],
      { temperature: 0.2, maxTokens: 800, think: false }
    );
    return response.trim();
  } catch (err) {
    console.error('[L1Scoring] Panel summary generation failed:', err.message);
    return scoringResult.overall_verdict || 'Panel summary not available.';
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Run full L1 evaluation: scoring + moderation.
 *
 * @param {object} input
 * @param {string} input.jobId
 * @param {string} input.candidateName
 * @param {string} input.panelName
 * @param {string} input.panelEmail
 * @param {string} input.panelId
 * @param {string} input.jd           — from Stage 1
 * @param {string} input.resumeText   — from Stage 1
 * @param {string} input.transcript   — L1 interview transcript text
 * @returns {Promise<{success: boolean, evaluation: object, moderation: object|null}>}
 */
async function runL1Evaluation(input) {
  const {
    jobId, candidateName = '', panelName = '', panelEmail = '', panelId = '',
    jd = '', resumeText = '', transcript
  } = input;

  if (!jobId || !transcript) {
    throw new Error('runL1Evaluation: jobId and transcript are required');
  }

  console.log(`[L1Scoring] Starting evaluation — jobId=${jobId} candidate="${candidateName}" transcriptLen=${transcript.length}`);

  // ── Step 1: Score the transcript ──────────────────────────────────────────
  const scoringPrompt = _buildScoringPrompt(jobId, jd, resumeText, transcript);
  const llmRaw = await callLLM(
    [
      { role: 'system', content: L1_SCORING_SYSTEM_PROMPT },
      { role: 'user', content: scoringPrompt }
    ],
    { temperature: 0.1, maxTokens: 2000, think: false }
  );

  const parsedScore = _parseJSON(llmRaw);
  if (!parsedScore) throw new Error('L1 scoring LLM returned invalid JSON');
  _clampScores(parsedScore);
  console.log(`[L1Scoring] Score=${parsedScore.score}/${MAX_L1_SCORE} Category=${parsedScore.score_category}`);

  // ── Step 2: Panel summary + Moderation run in parallel ───────────────────
  const [panelSummary, moderationResult] = await Promise.all([
    _generatePanelSummary(parsedScore, jd),
    (async () => {
      try {
        const modRes = await analyzeInterviewModeration({ l1_transcript: transcript, job_id: jobId });
        return modRes.success ? modRes.moderation : null;
      } catch (e) {
        console.error('[L1Scoring] Moderation failed (non-fatal):', e.message);
        return null;
      }
    })()
  ]);

  parsedScore.panel_summary = panelSummary;
  parsedScore.moderation = moderationResult;

  // Attach metadata
  parsedScore.job_id        = jobId;
  parsedScore.candidate_name = candidateName;
  parsedScore.panel_name    = panelName;
  parsedScore.evaluated_at  = new Date().toISOString();

  console.log(`[L1Scoring] Evaluation complete — jobId=${jobId}`);

  return {
    success: true,
    evaluation: parsedScore,
    moderation: moderationResult,
  };
}

module.exports = {
  runL1Evaluation,
  L1_DIMENSIONS,
  MAX_L1_SCORE,
};
