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

const { callLLMWithMeta, callLLM } = require('./llmClient');
const { normalizeTranscript, questionCountsBySpeaker, hasTurnLabels } = require('./transcriptNormalizer');
const { analyzeInterviewModeration } = require('./moderationService');

// ─── Determinism ─────────────────────────────────────────────────────────────
// Same rationale as L2: identical input must produce an identical score.
const SCORING_SEED = parseInt(process.env.L1_SCORING_SEED || '42', 10);
const SCORING_TEMPERATURE = 0;

// ─── Dimension Config ────────────────────────────────────────────────────────

// `steps` = the only scores allowed per dimension (see l2ScoringService for the
// full rationale). L1 already tended to land on this grid; making it explicit
// keeps L1 and L2 on the same footing and prevents interpolated values.
const L1_DIMENSIONS = {
  'Mandatory Skill Coverage':   { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Probing mandatory technologies explicitly listed in the JD.' },
  'Technical Depth':            { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Quality of follow-up questions ("how" and "why").' },
  'Resume Initial Screening':   { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Did L1 verify the specific experience and project claims written in the resume?' },
  'Scenario / Risk Evaluation': { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Presenting real-world coding / problem-solving scenarios.' },
  'Framework Knowledge':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Probing specific frameworks mentioned in the JD.' },
  'Hands-on Validation':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Probing actual coding, tools, and scripting practices.' },
};

const MAX_L1_SCORE = Object.values(L1_DIMENSIONS).reduce((s, d) => s + d.max, 0); // 10.0

// ─── Input Limits ────────────────────────────────────────────────────────────
//
// Derived from the context budget, not picked by feel. The old 12000 discarded
// 67% of a real 36k-char interview (JD45/SATHISH) — every question in the back
// two-thirds was invisible to the scorer, which is indistinguishable from a panel
// that never asked them.
//
// Budget at num_ctx=16384 and num_predict=3000: 13384 tokens. At the observed
// ~3.0 chars/token (worse than llmClient's 3.2 estimate, measured on real
// transcripts) that is ~40000 chars, minus ~8500 for instructions + JD + resume
// + the JSON skeleton => ~31500 available. 28000 leaves deliberate slack, since
// exceeding the budget is a hard failure at llmClient's pre-flight guard.
//
// Raise OLLAMA_NUM_CTX (the model supports 40960) before raising this further.
const MAX_TRANSCRIPT_CHARS = parseInt(process.env.L1_MAX_TRANSCRIPT_CHARS || '28000', 10);
const MAX_JD_CHARS = 3000;
const MAX_RESUME_CHARS = 2000;

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
6. Do NOT artificially deflate scores — if the panelist did a thorough job, award full marks.
7. You are scoring the QUALITY OF THE PANEL'S QUESTIONS, never the quality of the
   candidate's answers. A panel that asked excellent questions scores full marks even
   if the candidate answered everything badly, and vice versa.
8. Award each dimension ONLY a value from that dimension's allowed score list. Never
   interpolate between the allowed values.`;

// ─── Core Scoring Function ───────────────────────────────────────────────────

/**
 * Build the scoring user prompt.
 * @param {string} jobId
 * @param {string} jd      — Job Description text
 * @param {string} resumeText — Candidate resume text (from Stage 1)
 * @param {string} transcript — L1 interview transcript
 */
function _buildScoringPrompt(jobId, jd, resumeText, transcript) {
  // Truncation is loud: a score computed from a partial interview must never look
  // like a score computed from the whole one.
  const droppedChars = Math.max(0, transcript.length - MAX_TRANSCRIPT_CHARS);
  if (droppedChars > 0) {
    console.warn(`[L1Scoring] TRANSCRIPT TRUNCATED — ${droppedChars} of ${transcript.length} chars ` +
      `(${Math.round((droppedChars / transcript.length) * 100)}%) discarded at the ${MAX_TRANSCRIPT_CHARS}-char cap. ` +
      `Questions asked in the dropped tail are invisible to the scorer and will read as "never asked". ` +
      `Raise OLLAMA_NUM_CTX and L1_MAX_TRANSCRIPT_CHARS together to score the full interview.`);
  }
  const safeTranscript = droppedChars > 0
    ? transcript.substring(0, MAX_TRANSCRIPT_CHARS) + '\n[... transcript truncated ...]'
    : transcript;

  // Only claim a line format the transcript actually has — see hasTurnLabels().
  const formatNote = hasTurnLabels(safeTranscript)
    ? 'Each line is one speaker turn, formatted "Speaker Name H:MM: utterance". The\n' +
      'INTERVIEWER / PANELIST is whoever asks the questions; the CANDIDATE is whoever\n' +
      'answers them. Attribute every question to the speaker whose line it appears on.\n'
    : '';

  const dimensionTable = Object.entries(L1_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name} (max ${cfg.max}, allowed scores: ${cfg.steps.join(' / ')}): ${cfg.focus}`)
    .join('\n');

  const gridTable = Object.entries(L1_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name}: choose exactly one of ${cfg.steps.join(' / ')}`)
    .join('\n');

  return `/no_think

=== YOUR EVALUATION TASK ===
Evaluate the INTERVIEWER's (L1 panel's) probing quality in the interview transcript below.
You are NOT scoring the candidate — you are scoring how well the PANELIST covered each dimension.

=== JOB ID ===
${jobId}

=== JOB DESCRIPTION ===
${jd.substring(0, MAX_JD_CHARS)}

=== CANDIDATE RESUME (from Stage 1 screening) ===
${resumeText ? resumeText.substring(0, MAX_RESUME_CHARS) : 'Resume not available.'}

=== L1 INTERVIEW TRANSCRIPT ===
${formatNote}${safeTranscript}

=== SCORING DIMENSIONS ===
${dimensionTable}

=== SCORING INSTRUCTIONS ===
For EACH dimension:
1. Identify ALL questions asked by the INTERVIEWER that relate to this dimension.
2. Assess how deep, specific, and technically relevant those questions were.
3. Assign a score between 0 and the dimension maximum.
4. Quote EVERY distinct interviewer question you counted in step 1 — up to 6 per
   dimension. The evidence must justify the score on its own: a reader comparing
   your quotes to the transcript must not find a relevant question you left out.
   If the panel raised several named technologies or topics, quote the question for
   EACH one rather than a single representative example.

Score thresholds per dimension:
  - MAX score: Exhaustive probing; every sub-area covered with follow-ups.
  - 75% max: Strong coverage; only minor gaps.
  - 50% max: Basic probing; surface-level questions without follow-ups.
  - 25% max: Very brief or incidental mention only.
  - 0:        Dimension entirely absent from the interview.

=== ALLOWED SCORE VALUES (MANDATORY) ===
Each dimension accepts ONLY these exact values. Any other number is invalid:
${gridTable}
Pick the single closest allowed value. Do NOT output values in between (no 0.2, 0.3, 0.6, 1.2, 1.8).

SCORE THE QUESTIONS, NOT THE ANSWERS: a weak candidate does not make a weak panel.

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
    "Mandatory Skill Coverage":   <one of 0 / 0.5 / 1 / 1.5 / 2>,
    "Technical Depth":            <one of 0 / 0.5 / 1 / 1.5 / 2>,
    "Resume Initial Screening":   <one of 0 / 0.5 / 1 / 1.5 / 2>,
    "Scenario / Risk Evaluation": <one of 0 / 0.5 / 1 / 1.5 / 2>,
    "Framework Knowledge":        <one of 0 / 0.25 / 0.5 / 0.75 / 1>,
    "Hands-on Validation":        <one of 0 / 0.25 / 0.5 / 0.75 / 1>
  },
  "evidence": {
    "Mandatory Skill Coverage":   ["<every interviewer question about a JD-mandatory technology, one per technology raised>"],
    "Technical Depth":            ["<every interviewer follow-up probing how/why>"],
    "Resume Initial Screening":   ["<every interviewer question verifying a resume claim>"],
    "Scenario / Risk Evaluation": ["<every scenario question>"],
    "Framework Knowledge":        ["<every framework question>"],
    "Hands-on Validation":        ["<every coding/tools question>"]
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

/** Snap a raw score to the nearest allowed step for its dimension. */
function _snapToStep(raw, cfg) {
  return cfg.steps.reduce((best, step) =>
    Math.abs(step - raw) < Math.abs(best - raw) ? step : best, cfg.steps[0]);
}

function _clampScores(parsed) {
  if (!parsed || !parsed.categories) throw new Error('Missing categories in LLM response');
  const missing = [];
  const offGrid = [];
  let sum = 0;
  for (const [dim, cfg] of Object.entries(L1_DIMENSIONS)) {
    const provided = parsed.categories[dim];
    if (provided === undefined || provided === null || provided === '') missing.push(dim);
    const raw = parseFloat(provided ?? 0);
    const clamped = Number.isFinite(raw) ? Math.min(Math.max(0, raw), cfg.max) : 0;
    const snapped = _snapToStep(clamped, cfg);
    if (Math.abs(snapped - clamped) > 1e-9) offGrid.push(`${dim} ${clamped}->${snapped}`);
    parsed.categories[dim] = snapped;
    sum += snapped;
  }

  const unrecognised = Object.keys(parsed.categories).filter(k => !L1_DIMENSIONS[k]);
  for (const k of unrecognised) delete parsed.categories[k];

  if (missing.length)      console.warn(`[L1Scoring] LLM omitted dimensions (scored 0): ${missing.join(', ')}`);
  if (offGrid.length)      console.log(`[L1Scoring] Snapped off-grid scores: ${offGrid.join(', ')}`);
  if (unrecognised.length) console.warn(`[L1Scoring] Dropped unrecognised categories: ${unrecognised.join(', ')}`);

  parsed.scoring_warnings = {
    missing_dimensions: missing,
    snapped_to_grid: offGrid,
    dropped_categories: unrecognised,
  };

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

  // A non-zero score with a single quote (or none) is unauditable: the reader cannot
  // tell whether the panel asked one thing or six. Surfacing it beats a silent gap —
  // this is how a score that looked unjustified ("panel never asked about X") turned
  // out to be a reporting problem rather than a scoring one.
  const thinEvidence = Object.keys(L1_DIMENSIONS)
    .filter(dim => parsed.categories[dim] > 0 && parsed.evidence[dim].length < 2)
    .map(dim => `${dim} (${parsed.evidence[dim].length} quote(s), scored ${parsed.categories[dim]})`);
  if (thinEvidence.length) {
    console.warn(`[L1Scoring] Thin evidence — score may look unjustified: ${thinEvidence.join('; ')}`);
  }
  parsed.scoring_warnings.thin_evidence = thinEvidence;

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
      { temperature: SCORING_TEMPERATURE, maxTokens: 800, think: false, seed: SCORING_SEED }
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

  // Raw meeting exports often carry no line break between turns, leaving speaker
  // labels mid-sentence ("...so far. Panelist 6:28Do you know Dynatrace?"). The
  // rubric forbids quoting the candidate, so when the model cannot see where a turn
  // starts it silently under-credits the panel — on a real record it found 3 of ~16
  // questions and called the interview shallow.
  const norm = normalizeTranscript(transcript);
  const transcriptText = norm.text;
  const panelQuestionCounts = questionCountsBySpeaker(transcriptText);

  console.log(`[L1Scoring] Starting evaluation — jobId=${jobId} candidate="${candidateName}" ` +
    `transcriptLen=${transcript.length} seed=${SCORING_SEED}`);
  if (!norm.alreadyStructured) {
    console.log(`[L1Scoring] Normalised transcript — inserted ${norm.insertedBreaks} turn boundaries ` +
      `across ${norm.speakers.length} speaker(s): ${norm.speakers.join(', ')}. ` +
      `Question-marked turns per speaker: ${JSON.stringify(panelQuestionCounts)}`);
  }

  // ── Step 1: Score the transcript ──────────────────────────────────────────
  // Deterministic: temperature 0 + fixed seed, so identical input => identical score.
  const scoringPrompt = _buildScoringPrompt(jobId, jd, resumeText, transcriptText);
  const llmResult = await callLLMWithMeta(
    [
      { role: 'system', content: L1_SCORING_SYSTEM_PROMPT },
      { role: 'user', content: scoringPrompt }
    ],
    // 3000, not 2000: quoting every relevant question (up to 6 per dimension across
    // 6 dimensions) roughly triples the evidence payload. Too low and Ollama stops
    // mid-JSON with done_reason=length and the response fails to parse.
    { temperature: SCORING_TEMPERATURE, maxTokens: 3000, think: false, seed: SCORING_SEED }
  );

  const parsedScore = _parseJSON(llmResult.content);
  if (!parsedScore) throw new Error('L1 scoring LLM returned invalid JSON');
  _clampScores(parsedScore);
  console.log(`[L1Scoring] Score=${parsedScore.score}/${MAX_L1_SCORE} Category=${parsedScore.score_category} ` +
    `model=${llmResult.model}@${llmResult.modelDigest || 'unknown'} ` +
    `promptTokens=${llmResult.promptTokens} outputTokens=${llmResult.outputTokens}`);

  // ── Step 2: Panel summary + Moderation run in parallel ───────────────────
  const [panelSummary, moderationResult] = await Promise.all([
    _generatePanelSummary(parsedScore, jd),
    (async () => {
      try {
        const modRes = await analyzeInterviewModeration({ l1_transcript: transcriptText, job_id: jobId });
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

  // Scoring provenance — see l2ScoringService for rationale.
  parsedScore.scoring_meta = {
    provider: llmResult.provider,
    model: llmResult.model,
    model_digest: llmResult.modelDigest || null,
    model_parameter_size: llmResult.modelParameterSize || null,
    model_quantization: llmResult.modelQuantization || null,
    seed: llmResult.seed,
    temperature: SCORING_TEMPERATURE,
    num_ctx: llmResult.numCtx,
    prompt_tokens: llmResult.promptTokens,
    output_tokens: llmResult.outputTokens,
    done_reason: llmResult.doneReason,
    transcript_chars: transcript.length,
    // Persisted so an audit can tell a low score caused by a weak panel from one
    // caused by an unscored tail, without re-deriving the cap from code history.
    transcript_chars_scored: Math.min(transcriptText.length, MAX_TRANSCRIPT_CHARS),
    transcript_chars_dropped: Math.max(0, transcriptText.length - MAX_TRANSCRIPT_CHARS),
    // Turn-boundary repair applied before scoring. insertedBreaks > 0 means the raw
    // export had no line breaks between turns, which suppresses panel attribution.
    transcript_breaks_inserted: norm.insertedBreaks,
    transcript_speakers: norm.speakers,
    question_turns_by_speaker: panelQuestionCounts,
    rubric_version: 'l1-v4-turns',
  };

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
