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

const { callLLMWithMeta, callLLM } = require('./llmClient');
const { analyzeInterviewModeration } = require('./moderationService');

// ─── Determinism ─────────────────────────────────────────────────────────────
// Scoring must be reproducible: identical input => identical score. Ollama is
// seeded and run at temperature 0. Without this, the same transcript drifted
// across runs and the drift was indistinguishable from a real scoring change.
const SCORING_SEED = parseInt(process.env.L2_SCORING_SEED || '42', 10);
const SCORING_TEMPERATURE = 0;

// ─── Dimension Config ────────────────────────────────────────────────────────
//
// `steps` is the set of scores the model is ALLOWED to award for a dimension.
// Every dimension resolves to 5 rubric bands (0/25/50/75/100%), but a 0.5-max
// dimension would put those bands at 0.125 increments — finer than an LLM
// reproduces reliably, so it used to emit arbitrary off-grid values (0.2, 0.3)
// that never matched the stated rubric. Coarse dimensions get a coarse grid.

const L2_DIMENSIONS = {
  'Mandatory Skill Coverage':   { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Verification of high-level mandatory requirements from the JD.' },
  'Technical Depth':            { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'System design, design patterns, scalability, and latency probing.' },
  'Resume Screening & Handoff': { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Did the L2 panel check the unverified gaps passed in L1? Probing specific resume claims.' },
  'Scenario / Risk Evaluation': { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Real-world architecture failure, scaling, and recovery scenarios.' },
  'Framework Knowledge':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Advanced framework patterns (concurrency, lifecycle, hooks).' },
  'Hands-on Validation':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Validation of real-world implementation and deployments.' },
  'Leadership Evaluation':      { max: 0.5, steps: [0, 0.25, 0.5],            focus: 'Team leadership, mentoring, and strategic ownership.' },
  'Behavioral Assessment':      { max: 0.5, steps: [0, 0.25, 0.5],            focus: 'Conflict resolution, communication, and adaptability.' },
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
6. Do NOT artificially deflate scores — if the panelist did a thorough job, award full marks.
7. You are scoring the QUALITY OF THE PANEL'S QUESTIONS, never the quality of the
   candidate's answers. A panel that asked excellent questions scores full marks even
   if the candidate answered everything badly. A panel that asked nothing scores 0 even
   if the candidate was outstanding. Whether the candidate was ultimately hired or
   rejected is irrelevant to every dimension and must not influence any score.
8. Award each dimension ONLY a value from that dimension's allowed score list. Never
   interpolate between the allowed values.`;

// ─── Core Scoring Function ───────────────────────────────────────────────────

/**
 * Build the scoring user prompt.
 *
 * NOTE: the candidate's Selected/Rejected verdict is deliberately NOT included.
 * It is not an input to any dimension, and including it measurably biased the
 * PANEL's score (a rejected candidate dragged the panel's score down ~0.4 pts
 * for an identical transcript). See L2_SCORING_SYSTEM_PROMPT rule 7.
 */
function _buildScoringPrompt(jobId, jd, resumeText, l1Transcript, l2Transcript) {
  const MAX_CHARS = 10000;
  const safeL2Transcript = l2Transcript.length > MAX_CHARS
    ? l2Transcript.substring(0, MAX_CHARS) + '\n[... transcript truncated ...]'
    : l2Transcript;

  // L1 context materially drives the "Resume Screening & Handoff" dimension.
  // When it is absent the model has nothing to check handoff against and inflates
  // the score by ~1.2 pts, so the absence is stated LOUDLY rather than implied by
  // a bare "Not available." line the model can gloss over.
  const L1_MAX_CHARS = 8000;
  const hasL1 = Boolean(l1Transcript && l1Transcript.trim());
  const safeL1Transcript = !hasL1
    ? 'NOT AVAILABLE — the L1 interview transcript was not supplied for this candidate.'
    : (l1Transcript.length > L1_MAX_CHARS
      ? l1Transcript.substring(0, L1_MAX_CHARS) + '\n[... L1 transcript truncated ...]'
      : l1Transcript);

  const l1Guidance = hasL1
    ? 'The L1 transcript IS available above. Score "Resume Screening & Handoff" on whether the L2 panel followed up on the gaps L1 left unverified.'
    : 'The L1 transcript is NOT available. You therefore CANNOT verify handoff follow-up. ' +
      'For "Resume Screening & Handoff", score ONLY on whether the L2 panel verified the candidate\'s ' +
      'resume claims directly, and cap that dimension at 1.0. Do NOT award credit for handoff you cannot observe.';

  const dimensionTable = Object.entries(L2_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name} (max ${cfg.max}, allowed scores: ${cfg.steps.join(' / ')}): ${cfg.focus}`)
    .join('\n');

  const gridTable = Object.entries(L2_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name}: choose exactly one of ${cfg.steps.join(' / ')}`)
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

=== SCORING DIMENSIONS ===
${dimensionTable}

=== L1 CONTEXT AVAILABILITY ===
${l1Guidance}

=== SCORING INSTRUCTIONS ===
For EACH L2 dimension:
1. Identify ALL questions asked by the L2 INTERVIEWER/PANEL that relate to this dimension.
2. Assess how deep, specific, and technically relevant those questions were. L2 interviews are senior-level interviews; questions should focus on depth, system design, scalability, scenarios, and leadership rather than basic coding syntax.
3. Assign a score from that dimension's allowed score list (see ALLOWED SCORE VALUES below).
4. Extract 1–3 direct quotes from the L2 INTERVIEWER proving the score.

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
Do not lower any dimension because the candidate performed poorly or was rejected.

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
    "Mandatory Skill Coverage":   <one of 0 / 0.5 / 1 / 1.5 / 2>,
    "Technical Depth":            <one of 0 / 0.5 / 1 / 1.5 / 2>,
    "Resume Screening & Handoff": <one of 0 / 0.5 / 1 / 1.5 / 2>,
    "Scenario / Risk Evaluation": <one of 0 / 0.25 / 0.5 / 0.75 / 1>,
    "Framework Knowledge":        <one of 0 / 0.25 / 0.5 / 0.75 / 1>,
    "Hands-on Validation":        <one of 0 / 0.25 / 0.5 / 0.75 / 1>,
    "Leadership Evaluation":      <one of 0 / 0.25 / 0.5>,
    "Behavioral Assessment":      <one of 0 / 0.25 / 0.5>
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

/** Snap a raw score to the nearest allowed step for its dimension. */
function _snapToStep(raw, cfg) {
  return cfg.steps.reduce((best, step) =>
    Math.abs(step - raw) < Math.abs(best - raw) ? step : best, cfg.steps[0]);
}

/**
 * Clamp, snap to the rubric grid, and recompute the total.
 *
 * The LLM's own `score` field is always discarded — it got the arithmetic wrong
 * in every observed run. The total is recomputed from the snapped categories.
 *
 * @param {object} parsed
 * @param {boolean} hasL1  — when false, "Resume Screening & Handoff" is capped at
 *                           1.0 because handoff follow-up cannot be observed.
 */
function _clampScores(parsed, hasL1 = true) {
  if (!parsed || !parsed.categories) throw new Error('Missing categories in LLM response');

  const missing = [];
  const offGrid = [];
  const capped = [];
  let sum = 0;

  for (const [dim, cfg] of Object.entries(L2_DIMENSIONS)) {
    const provided = parsed.categories[dim];
    if (provided === undefined || provided === null || provided === '') missing.push(dim);

    const raw = parseFloat(provided ?? 0);
    let value = Number.isFinite(raw) ? Math.min(Math.max(0, raw), cfg.max) : 0;

    // Cap the handoff dimension when there is no L1 transcript to check against.
    if (!hasL1 && dim === 'Resume Screening & Handoff' && value > 1.0) {
      capped.push(`${dim} ${value}->1.0`);
      value = 1.0;
    }

    const snapped = _snapToStep(value, cfg);
    if (Math.abs(snapped - value) > 1e-9) offGrid.push(`${dim} ${value}->${snapped}`);

    parsed.categories[dim] = snapped;
    sum += snapped;
  }

  const unrecognised = Object.keys(parsed.categories).filter(k => !L2_DIMENSIONS[k]);
  for (const k of unrecognised) delete parsed.categories[k];

  if (missing.length)      console.warn(`[L2Scoring] LLM omitted dimensions (scored 0): ${missing.join(', ')}`);
  if (offGrid.length)      console.log(`[L2Scoring] Snapped off-grid scores: ${offGrid.join(', ')}`);
  if (capped.length)       console.warn(`[L2Scoring] Capped (no L1 context): ${capped.join(', ')}`);
  if (unrecognised.length) console.warn(`[L2Scoring] Dropped unrecognised categories: ${unrecognised.join(', ')}`);

  parsed.score = Math.round(sum * 10) / 10;
  parsed.score_percent = Math.round((parsed.score / MAX_L2_SCORE) * 100);
  parsed.score_category = parsed.score >= 8.0 ? 'Good' : parsed.score >= 5.0 ? 'Moderate' : 'Poor';

  // Surface data-quality problems to the caller instead of hiding them.
  parsed.scoring_warnings = {
    missing_dimensions: missing,
    snapped_to_grid: offGrid,
    capped_dimensions: capped,
    dropped_categories: unrecognised,
  };

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
      { temperature: SCORING_TEMPERATURE, maxTokens: 800, think: false, seed: SCORING_SEED }
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

  const hasL1 = Boolean(l1Transcript && l1Transcript.trim());
  if (!hasL1) {
    // Not fatal — L2 can still be scored — but it changes the scoring regime, so
    // it must be visible in the logs and recorded on the result.
    console.warn(`[L2Scoring] No L1 transcript for jobId=${jobId} candidate="${candidateName}". ` +
      `"Resume Screening & Handoff" will be scored on resume verification only and capped at 1.0. ` +
      `Run Stage 2 first for a fully comparable L2 score.`);
  }

  console.log(`[L2Scoring] Starting evaluation — jobId=${jobId} candidate="${candidateName}" ` +
    `L2transcriptLen=${l2Transcript.length} l1Present=${hasL1} l1Len=${l1Transcript.length} seed=${SCORING_SEED}`);

  // ── Step 1: Score the transcript ──────────────────────────────────────────
  // Deterministic: temperature 0 + fixed seed, so identical input => identical score.
  const scoringPrompt = _buildScoringPrompt(jobId, jd, resumeText, l1Transcript, l2Transcript);
  const llmResult = await callLLMWithMeta(
    [
      { role: 'system', content: L2_SCORING_SYSTEM_PROMPT },
      { role: 'user', content: scoringPrompt }
    ],
    { temperature: SCORING_TEMPERATURE, maxTokens: 2500, think: false, seed: SCORING_SEED }
  );

  const parsedScore = _parseJSON(llmResult.content);
  if (!parsedScore) throw new Error('L2 scoring LLM returned invalid JSON');
  _clampScores(parsedScore, hasL1);
  console.log(`[L2Scoring] Score=${parsedScore.score}/${MAX_L2_SCORE} Category=${parsedScore.score_category} ` +
    `model=${llmResult.model}@${llmResult.modelDigest || 'unknown'} ` +
    `promptTokens=${llmResult.promptTokens} outputTokens=${llmResult.outputTokens}`);

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
  // Recorded for reporting only — deliberately NOT fed into the scoring prompt.
  parsedScore.candidate_status = candidateStatus;

  // Scoring provenance — makes a score reproducible and lets you tell at a glance
  // which model/regime produced it when comparing records.
  parsedScore.scoring_meta = {
    provider: llmResult.provider,
    model: llmResult.model,
    // The tag is mutable (':latest' can be re-pulled); the digest is not. Two scores
    // are only strictly comparable when model_digest AND rubric_version both match.
    model_digest: llmResult.modelDigest || null,
    model_parameter_size: llmResult.modelParameterSize || null,
    model_quantization: llmResult.modelQuantization || null,
    seed: llmResult.seed,
    temperature: SCORING_TEMPERATURE,
    num_ctx: llmResult.numCtx,
    prompt_tokens: llmResult.promptTokens,
    output_tokens: llmResult.outputTokens,
    done_reason: llmResult.doneReason,
    l1_context_available: hasL1,
    l1_transcript_chars: l1Transcript.length,
    l2_transcript_chars: l2Transcript.length,
    rubric_version: 'l2-v2-grid',
  };

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
