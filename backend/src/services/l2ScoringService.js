/**
 * L2 Scoring Service — Stage 3
 *
 * Evaluates L2 interview panel efficiency across 8 dimensions (total = 10.0 pts).
 * Also runs Interview Moderation on the transcript.
 *
 * ── Dimensions ────────────────────────────────────────────────────────
 *  Mandatory Skill Coverage     2.0  — JD-listed mandatory tech/skills
 *  Technical Depth              2.0  — System design, scalability, depth probing
 *  Resume Screening & Handoff   2.0  — Resume verification & L1 handoff probing
 *  Scenario / Risk Evaluation   1.0  — Failure modes, concurrency, scaling scenarios
 *  Framework Knowledge          1.0  — Advanced framework patterns & internals
 *  Hands-on Validation          1.0  — Coding, testing, deployment & tools validation
 *  Leadership Evaluation        0.5  — Mentorship, design ownership, technical roadmap
 *  Behavioral Assessment        0.5  — Adaptability, collaboration, conflict resolution
 *                               ───
 *  TOTAL L2 SCORE              10.0
 * ──────────────────────────────────────────────────────────────────────
 */

'use strict';

const { callLLM } = require('./llmClient');
const { analyzeInterviewModeration } = require('./moderationService');

// ─── Dimension Config ────────────────────────────────────────────────────────

const L2_DIMENSIONS = {
  'Mandatory Skill Coverage':   { max: 2.0, focus: 'Verification of high-level mandatory requirements from the JD.' },
  'Technical Depth':            { max: 2.0, focus: 'System design, design patterns, scalability, and latency probing.' },
  'Resume Screening & Handoff': { max: 2.0, focus: 'Did the L2 panel check the unverified gaps passed in L1? Probing specific resume claims.' },
  'Scenario / Risk Evaluation': { max: 1.0, focus: 'Real-world architecture failure, scaling, and recovery scenarios.' },
  'Framework Knowledge':        { max: 1.0, focus: 'Advanced framework patterns (concurrency, lifecycle, hooks).' },
  'Hands-on Validation':        { max: 1.0, focus: 'Validation of real-world implementation and deployments.' },
  'Leadership Evaluation':      { max: 0.5, focus: 'Team leadership, mentoring, and strategic ownership.' },
  'Behavioral Assessment':      { max: 0.5, focus: 'Conflict resolution, communication, and adaptability.' },
};

const MAX_L2_SCORE = Object.values(L2_DIMENSIONS).reduce((s, d) => s + d.max, 0); // 10.0

// ─── System Prompts ──────────────────────────────────────────────────────────

const L2_SCORING_SYSTEM_PROMPT = `You are a senior HR quality-assurance expert with 15+ years of technical interview assessment experience.
Your task is to evaluate how effectively the L2 (second-round) interviewer/panel probed the candidate.
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
 */
function _buildScoringPrompt(jobId, jd, resumeText, l1Transcript, l2Transcript, candidateStatus) {
  const MAX_CHARS = 10000;
  const safeL2Transcript = l2Transcript.length > MAX_CHARS
    ? l2Transcript.substring(0, MAX_CHARS) + '\n[... transcript truncated ...]'
    : l2Transcript;

  const safeL1Transcript = l1Transcript && l1Transcript.length > 5000
    ? l1Transcript.substring(0, 5000) + '\n[... L1 transcript truncated ...]'
    : (l1Transcript || 'Not available.');

  const dimensionTable = Object.entries(L2_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name} (max ${cfg.max}): ${cfg.focus}`)
    .join('\n');

  return `/no_think

=== YOUR EVALUATION TASK ===
Evaluate the INTERVIEWER's (L2 panel's) probing quality in the L2 interview transcript below.
You are NOT scoring the candidate — you are scoring how well the L2 PANELIST covered each dimension.

=== JOB ID ===
${jobId}

=== JOB DESCRIPTION ===
${jd.substring(0, 3000)}

=== CANDIDATE RESUME (from Stage 1 screening) ===
${resumeText ? resumeText.substring(0, 2000) : 'Resume not available.'}

=== L1 INTERVIEW TRANSCRIPT CONTEXT (for Handoff evaluation) ===
${safeL1Transcript}

=== L2 INTERVIEW TRANSCRIPT (To be evaluated) ===
${safeL2Transcript}

=== CANDIDATE STATUS DECISION BY PANEL ===
${candidateStatus}

=== SCORING DIMENSIONS ===
${dimensionTable}

=== SCORING INSTRUCTIONS ===
For EACH L2 dimension:
1. Identify ALL questions asked by the L2 INTERVIEWER/PANEL that relate to this dimension.
2. Assess how deep, specific, and technically relevant those questions were. L2 interviews are senior-level interviews; questions should focus on depth, system design, scalability, scenarios, and leadership rather than basic coding syntax.
3. Assign a score between 0 and the dimension maximum.
4. Extract 1–3 direct quotes from the L2 INTERVIEWER proving the score.

Score thresholds per dimension:
  - MAX score: Exhaustive probing; every sub-area covered with follow-ups.
  - 75% max: Strong coverage; only minor gaps.
  - 50% max: Basic probing; surface-level questions without follow-ups.
  - 25% max: Very brief or incidental mention only.
  - 0:        Dimension entirely absent from the interview.

NOISE ROBUSTNESS: Ignore small-talk, audio issues, and off-topic conversation.
RESUME SCREENING & HANDOFF: Evaluate if the L2 panel checked the unverified gaps or probed deeper into specific details that the L1 transcript/panel touched upon or missed, and verified key resume credentials.

=== REQUIRED OUTPUT FORMAT ===
Return ONLY this exact JSON structure:
{
  "job_id": "${jobId}",
  "score": <exact sum of all 8 category scores, rounded to 1 decimal>,
  "score_percent": <score as percentage of 10.0, integer>,
  "score_category": "Good|Moderate|Poor",
  "confidence": <0.0–1.0>,
  "categories": {
    "Mandatory Skill Coverage":   <0.0–2.0>,
    "Technical Depth":            <0.0–2.0>,
    "Resume Screening & Handoff": <0.0–2.0>,
    "Scenario / Risk Evaluation": <0.0–1.0>,
    "Framework Knowledge":        <0.0–1.0>,
    "Hands-on Validation":        <0.0–1.0>,
    "Leadership Evaluation":      <0.0–0.5>,
    "Behavioral Assessment":      <0.0–0.5>
  },
  "evidence": {
    "Mandatory Skill Coverage":   ["<exact interviewer question>"],
    "Technical Depth":            ["<exact interviewer question>"],
    "Resume Screening & Handoff": ["<exact interviewer question>"],
    "Scenario / Risk Evaluation": ["<exact interviewer question>"],
    "Framework Knowledge":        ["<exact interviewer question>"],
    "Hands-on Validation":        ["<exact interviewer question>"],
    "Leadership Evaluation":      ["<exact interviewer question>"],
    "Behavioral Assessment":      ["<exact interviewer question>"]
  },
  "dimension_summaries": {
    "Mandatory Skill Coverage":   "<one sentence verdict>",
    "Technical Depth":            "<one sentence verdict>",
    "Resume Screening & Handoff": "<one sentence verdict>",
    "Scenario / Risk Evaluation": "<one sentence verdict>",
    "Framework Knowledge":        "<one sentence verdict>",
    "Hands-on Validation":        "<one sentence verdict>",
    "Leadership Evaluation":      "<one sentence verdict>",
    "Behavioral Assessment":      "<one sentence verdict>"
  },
  "overall_verdict": "<2–3 sentence professional summary of the panel's L2 performance>",
  "recommendations": ["<actionable improvement point 1>", "<actionable improvement point 2>", "<actionable improvement point 3>"]
}`;
}

// ─── JSON Parser ─────────────────────────────────────────────────────────────

function _parseJSON(text) {
  const str = String(text || '');
  const block = str.match(/```json\s*([\s\S]*?)```/i);
  if (block) {
    try { return JSON.parse(block[1].trim()); } catch (_) { /* fall through */ }
  }
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
  for (const [dim, cfg] of Object.entries(L2_DIMENSIONS)) {
    const raw = parseFloat(parsed.categories[dim] ?? 0);
    parsed.categories[dim] = Math.min(Math.max(0, raw), cfg.max);
    sum += parsed.categories[dim];
  }
  parsed.score = Math.round(sum * 10) / 10;
  parsed.score_percent = Math.round((parsed.score / MAX_L2_SCORE) * 100);
  parsed.score_category = parsed.score >= 8.0 ? 'Good' : parsed.score >= 5.0 ? 'Moderate' : 'Poor';
  // Ensure all evidence arrays exist
  for (const dim of Object.keys(L2_DIMENSIONS)) {
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
1. Panel behavior & professionalism during L2
2. Interview process quality (depth, leadership evaluation, system design coverage)
3. Recommendations for improvement`;

async function _generatePanelSummary(scoringResult, jd) {
  const catLines = Object.entries(scoringResult.categories || {})
    .map(([dim, sc]) => `  ${dim}: ${sc}/${L2_DIMENSIONS[dim]?.max ?? 1}`)
    .join('\n');

  const prompt = `/no_think
Panel L2 Evaluation Results:
- Overall Score: ${scoringResult.score} / ${MAX_L2_SCORE} (${scoringResult.score_percent}%)
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
    console.error('[L2Scoring] Panel summary generation failed:', err.message);
    return scoringResult.overall_verdict || 'Panel summary not available.';
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Run full L2 evaluation: scoring + moderation.
 */
async function runL2Evaluation(input) {
  const {
    jobId, candidateName = '', panelName = '', panelEmail = '', panelId = '',
    jd = '', resumeText = '', l1Transcript = '', l2Transcript, candidateStatus = 'Selected'
  } = input;

  if (!jobId || !l2Transcript) {
    throw new Error('runL2Evaluation: jobId and l2Transcript are required');
  }

  console.log(`[L2Scoring] Starting evaluation — jobId=${jobId} candidate="${candidateName}" L2transcriptLen=${l2Transcript.length}`);

  // ── Step 1: Score the transcript ──────────────────────────────────────────
  const scoringPrompt = _buildScoringPrompt(jobId, jd, resumeText, l1Transcript, l2Transcript, candidateStatus);
  const llmRaw = await callLLM(
    [
      { role: 'system', content: L2_SCORING_SYSTEM_PROMPT },
      { role: 'user', content: scoringPrompt }
    ],
    { temperature: 0.1, maxTokens: 2500, think: false }
  );

  const parsedScore = _parseJSON(llmRaw);
  if (!parsedScore) throw new Error('L2 scoring LLM returned invalid JSON');
  _clampScores(parsedScore);
  console.log(`[L2Scoring] Score=${parsedScore.score}/${MAX_L2_SCORE} Category=${parsedScore.score_category}`);

  // ── Step 2: Panel summary + Moderation run in parallel ───────────────────
  const [panelSummary, moderationResult] = await Promise.all([
    _generatePanelSummary(parsedScore, jd),
    (async () => {
      try {
        const modRes = await analyzeInterviewModeration({ l1_transcript: l2Transcript, job_id: jobId });
        return modRes.success ? modRes.moderation : null;
      } catch (e) {
        console.error('[L2Scoring] Moderation failed (non-fatal):', e.message);
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
  parsedScore.candidate_status = candidateStatus;

  console.log(`[L2Scoring] Evaluation complete — jobId=${jobId}`);

  return {
    success: true,
    evaluation: parsedScore,
    moderation: moderationResult,
  };
}

module.exports = {
  runL2Evaluation,
  L2_DIMENSIONS,
  MAX_L2_SCORE,
};
