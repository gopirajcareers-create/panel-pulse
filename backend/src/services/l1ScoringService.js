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

const { callLLMWithMeta, callLLM, promptCharBudget, NUM_CTX } = require('./llmClient');
const { parseLLMJSON } = require('./jsonRepair');
const { normalizeTranscript, questionCountsBySpeaker, hasTurnLabels } = require('./transcriptNormalizer');
const { scoreFromEvidence, coerceEvidenceItems } = require('./evidenceTierScoring');
const { analyzeInterviewModeration } = require('./moderationService');

// ─── Determinism ─────────────────────────────────────────────────────────────
// Same rationale as L2: identical input must produce an identical score.
const SCORING_SEED = parseInt(process.env.L1_SCORING_SEED || '42', 10);
const SCORING_TEMPERATURE = 0;

// ─── Dimension Config ────────────────────────────────────────────────────────

// `steps` = the only scores allowed per dimension (see l2ScoringService for the
// full rationale). L1 already tended to land on this grid; making it explicit
// keeps L1 and L2 on the same footing and prevents interpolated values.
// `depthDimension` switches the evidence unit from "distinct topics probed" to
// "topics probed with a how/why question". Technical Depth is DEFINED as
// explanation-seeking, so counting every question there would award 75% for three
// yes/no questions on the one dimension that exists to measure depth.
const L1_DIMENSIONS = {
  'Mandatory Skill Coverage':   { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Probing mandatory technologies explicitly listed in the JD.' },
  'Technical Depth':            { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], depthDimension: true, focus: 'Quality of follow-up questions ("how" and "why").' },
  'Resume Initial Screening':   { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Did L1 verify the specific experience and project claims written in the resume?' },
  'Scenario / Risk Evaluation': { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Presenting real-world coding / problem-solving scenarios.' },
  'Framework Knowledge':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Probing specific frameworks mentioned in the JD.' },
  'Hands-on Validation':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Probing actual coding, tools, and scripting practices.' },
};

const MAX_L1_SCORE = Object.values(L1_DIMENSIONS).reduce((s, d) => s + d.max, 0); // 10.0

// ─── Input Limits ────────────────────────────────────────────────────────────
//
// The transcript cap is COMPUTED from the context window, not hard-coded. It used
// to be a literal 28000 derived by hand from num_ctx and num_predict, which broke
// the moment num_predict rose from 3000 to 4000 for the tier-scoring evidence
// objects: the input budget shrank by 1000 tokens, the cap did not move, and a real
// 36k-char interview started failing pre-flight with
// "~12653 estimated tokens but only 12384 available". A limit derived from a budget
// must be derived IN CODE from that budget, or it silently goes stale.
//
// Truncating at all is already the lossy path — the old 12000 discarded 67% of a
// real 36k-char interview (JD45/SATHISH), and every question in the dropped tail
// reads to the scorer as one the panel never asked. So the cap is set as large as
// the window allows rather than to a comfortable round number.
const MAX_OUTPUT_TOKENS = 4000;
const MAX_JD_CHARS = 3000;
const MAX_RESUME_CHARS = 2000;

// Everything sent that is NOT the truncated transcript: the prompt template, system
// prompt, JSON skeleton, JD and resume. The template measures ~7500 chars; the reserve
// is set well above it because underestimating is a hard pre-flight failure while
// overestimating only costs transcript tail. scripts/test_context_budget.js re-measures
// the real overhead and fails if this stops leaving ~750 tokens of slack.
const PROMPT_RESERVE_CHARS = 12000 + MAX_JD_CHARS + MAX_RESUME_CHARS;

// An explicit L1_MAX_TRANSCRIPT_CHARS still wins, but is clamped to what the window
// can actually hold — an operator raising it past the budget would otherwise turn
// every long interview into a hard error.
const _budget = promptCharBudget(MAX_OUTPUT_TOKENS, { reserveChars: PROMPT_RESERVE_CHARS });
const _requested = parseInt(process.env.L1_MAX_TRANSCRIPT_CHARS || '0', 10);
const MAX_TRANSCRIPT_CHARS = _requested > 0 ? Math.min(_requested, _budget) : _budget;

if (_requested > _budget) {
  console.warn(`[L1Scoring] L1_MAX_TRANSCRIPT_CHARS=${_requested} exceeds what num_ctx=${NUM_CTX} ` +
    `can hold (${_budget} chars) — clamped. Raise OLLAMA_NUM_CTX to score longer transcripts; ` +
    `the model supports 40960.`);
}
console.log(`[L1Scoring] Transcript cap ${MAX_TRANSCRIPT_CHARS} chars (num_ctx=${NUM_CTX}, ` +
  `num_predict=${MAX_OUTPUT_TOKENS}, reserve=${PROMPT_RESERVE_CHARS})`);

// ─── System Prompts ──────────────────────────────────────────────────────────

const L1_SCORING_SYSTEM_PROMPT = `You are a senior HR quality-assurance expert with 15+ years of technical interview assessment experience.
Your task is to evaluate how effectively the L1 (first-round) interviewer probed the candidate.
You are judging the PANEL's performance — not the candidate's.

CRITICAL RULES:
1. Return ONLY a valid JSON object. No markdown, no explanation, no preamble.
2. All string values must be JSON-safe: no raw newlines, and any double quote INSIDE a
   quoted value must be escaped with a backslash. Transcript lines often contain quoted
   phrases, so a panelist asking about the "N+1 problem" must be reported as
   "asked about the \\"N+1 problem\\"" — NOT as "asked about the "N+1 problem"", which
   ends the string early and makes the whole response unparseable.
   Prefer rewording to avoid inner quotes entirely.
3. Evidence MUST only quote lines spoken by the INTERVIEWER / PANEL — never the candidate.
4. You do NOT choose the numeric scores. They are computed from the evidence you
   report, so your task is to report that evidence completely and accurately.
   Omitting a question the panel really asked lowers their score for no reason.
5. Report NO evidence for a dimension only when it was genuinely absent from the
   interview.
6. You are reporting the PANEL'S QUESTIONS, never the quality of the candidate's
   answers. A question the candidate fumbled is still a question the panel asked,
   and must still be reported.
7. Never invent a question. Every quote must appear in the transcript.`;

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
      `The cap follows num_ctx automatically — raise OLLAMA_NUM_CTX (model supports 40960) to score the full interview.`);
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

  // Max is shown for context (it signals relative weight) but not the step grid.
  const dimensionTable = Object.entries(L1_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name} (weight ${cfg.max}): ${cfg.focus}`)
    .join('\n');

  // No allowed-values grid in the prompt any more: the model does not pick the
  // score, so listing the steps would only invite it to try.

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

=== YOUR JOB: REPORT THE EVIDENCE, NOT THE SCORE ===
The numeric score is computed mechanically from the evidence you report, so your
only task is to report that evidence COMPLETELY and HONESTLY. Under-reporting a
question the panel really asked lowers their score for no reason; inventing one
they did not ask inflates it. Both are failures.

For EACH dimension:
1. Find EVERY question the INTERVIEWER asked that relates to this dimension.
2. Record each one as an evidence item with four fields:
     "quote"        — the interviewer's actual words (trimmed, JSON-safe)
     "topic"        — the specific subject probed, 1-4 words (e.g. "JMeter",
                      "Grafana dashboards", "connection pooling"). Use the SAME
                      topic string when several questions probe the same subject,
                      and DIFFERENT strings for different subjects. This is what
                      breadth is measured from, so it must be accurate.
                      Do NOT give every question its own topic. Two questions about
                      the same technology share one topic even when they ask
                      different things about it: "How do you structure Express
                      routes?" and "And why keep controllers separate?" are both
                      topic "Express structure". Inventing a distinct topic per
                      question misreports a panel that drilled into one subject as
                      a panel that skimmed several.
     "probes_depth" — true if the question asks HOW, WHY, or WHAT IF, or otherwise
                      demands explanation. False for existence checks answerable
                      with yes/no ("Have you worked with AWS?", "Do you know
                      Docker?").
     "follows_up"   — true ONLY if this question builds on the candidate's
                      PREVIOUS ANSWER — drilling further into something they just
                      said. False when it opens a new subject.
3. List up to 8 evidence items per dimension. If the panel probed 5 different
   JD technologies, report 5 items with 5 different topics — never one
   representative example.
4. 8 is a CEILING, not a target. Never repeat a question to fill the list: if the
   panel asked one question relevant to a dimension, report exactly one item. The
   same sentence listed twice is not two questions, and padding a thin dimension
   makes a panel that asked one thing look like a panel that asked eight.

How the score follows from your evidence (for your understanding — do not compute it):
  - 1-2 subjects probed     -> 25% of the dimension max
  - 3-4 subjects            -> 50%
  - more than 4 subjects    -> 75%
  - that, plus sustained depth -> 100% (deliberately rare): either how/why
    probing on 5+ subjects, or on 3+ subjects with one of them revisited
    for a deeper follow-up
For "Technical Depth" only questions with probes_depth=true are counted, because
that dimension measures explanation-seeking rather than coverage.

=== DEPTH CLAIM ===
For each dimension set "depth_demonstrated" to true ONLY when the panel drilled
into the area with genuine follow-ups ("how did you do that?", "why that
approach?", "what would you do if..."). Set it to false for surface-level
coverage. Do not set it true on every dimension out of politeness — a dimension
covered only by yes/no questions is false. Full marks additionally require a real
follow-up chain to be visible in the evidence you reported, so an unsupported
claim here will not raise the score.

SCORE THE QUESTIONS, NOT THE ANSWERS: a weak candidate does not make a weak panel.
A panel that asked about Grafana still gets Grafana evidence even if the candidate
answered "I have only heard the name". Judge what was ASKED.

NOISE ROBUSTNESS: Ignore small-talk, audio issues, and off-topic conversation.
RESUME SCREENING: For "Resume Initial Screening" — check if the interviewer explicitly asked about or verified claims made in the resume (projects, tools, years of experience, certifications).

=== REQUIRED OUTPUT FORMAT ===
Return ONLY this exact JSON structure. Every dimension key must be present in
evidence_detail and depth_demonstrated, even when the array is empty.
{
  "job_id": "${jobId}",
  "confidence": <0.0–1.0>,
  "evidence_detail": {
    "Mandatory Skill Coverage":   [{"quote": "<interviewer's words>", "topic": "<subject probed>", "probes_depth": false, "follows_up": false}],
    "Technical Depth":            [{"quote": "<interviewer's words>", "topic": "<subject probed>", "probes_depth": true, "follows_up": true}],
    "Resume Initial Screening":   [{"quote": "<interviewer's words>", "topic": "<resume claim probed>", "probes_depth": false, "follows_up": false}],
    "Scenario / Risk Evaluation": [{"quote": "<interviewer's words>", "topic": "<scenario posed>", "probes_depth": true, "follows_up": false}],
    "Framework Knowledge":        [{"quote": "<interviewer's words>", "topic": "<framework probed>", "probes_depth": false, "follows_up": false}],
    "Hands-on Validation":        [{"quote": "<interviewer's words>", "topic": "<tool or practice probed>", "probes_depth": false, "follows_up": false}]
  },
  "depth_demonstrated": {
    "Mandatory Skill Coverage":   <true|false>,
    "Technical Depth":            <true|false>,
    "Resume Initial Screening":   <true|false>,
    "Scenario / Risk Evaluation": <true|false>,
    "Framework Knowledge":        <true|false>,
    "Hands-on Validation":        <true|false>
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

// ─── JSON Parsing ────────────────────────────────────────────────────────────
// Lives in jsonRepair.js, shared with L2. It does more than JSON.parse because
// this prompt asks the model to quote the transcript verbatim inside JSON strings: a
// panelist who says  the "N+1 problem"  yields a string with a raw double quote, which an
// 8B model escapes only most of the time. See jsonRepair.js for why retrying cannot help.

// ─── Derive Scores From Evidence ──────────────────────────────────────────────
//
// No _snapToStep here any more: evidenceTierScoring maps a tier directly onto the
// dimension's `steps` array, so an off-grid value cannot be produced in the first
// place and there is nothing to snap.

/**
 * Derive every dimension score from the reported evidence.
 *
 * The model no longer picks the numbers — see evidenceTierScoring for why. It is
 * still asked for `categories`, but only so a large model-vs-derived gap can be
 * logged as a signal that evidence was under-reported.
 */
function _clampScores(parsed) {
  if (!parsed) throw new Error('Empty LLM response');

  // ── Normalise the evidence into tagged items ──
  // coerceEvidenceItems collapses repeats of the same question. Asked for "up to 8
  // items", the model pads a thin dimension by quoting one question eight times under
  // eight different topics, which reads as eight subjects probed. The drop is recorded
  // per dimension because it is the signal that the interview was thinner than the
  // evidence list looked.
  const evidenceDetail = {};
  const emptyDims = [];
  const repeated = [];
  for (const dim of Object.keys(L1_DIMENSIONS)) {
    const rawItems = parsed.evidence_detail?.[dim] ?? parsed.evidence?.[dim];
    const items = coerceEvidenceItems(rawItems);
    const rawCount = Array.isArray(rawItems) ? rawItems.length : 0;
    evidenceDetail[dim] = items;
    if (!items.length) emptyDims.push(dim);
    if (rawCount > items.length) repeated.push(`${dim} (${rawCount} → ${items.length})`);
  }

  const depthClaims = {};
  for (const dim of Object.keys(L1_DIMENSIONS)) {
    depthClaims[dim] = parsed.depth_demonstrated?.[dim] === true;
  }

  const modelScores = {};
  for (const dim of Object.keys(L1_DIMENSIONS)) {
    const raw = parseFloat(parsed.categories?.[dim]);
    if (Number.isFinite(raw)) modelScores[dim] = raw;
  }

  // ── Derive the scores ──
  const { scores, audit, divergences } = scoreFromEvidence({
    dimensions: L1_DIMENSIONS, evidenceDetail, depthClaims, modelScores,
  });

  parsed.categories = scores;
  parsed.evidence_audit = audit;

  // Keep `evidence` as Record<string, string[]> — the frontend (DimensionCard,
  // EvidenceSection, ExportButton) reads that shape, and the quotes are now
  // derived from the same items the score came from, so they cannot disagree.
  parsed.evidence = {};
  parsed.evidence_detail = evidenceDetail;
  for (const dim of Object.keys(L1_DIMENSIONS)) {
    parsed.evidence[dim] = evidenceDetail[dim].map(it => it.quote);
  }

  const unrecognised = Object.keys(parsed.evidence_detail || {}).filter(k => !L1_DIMENSIONS[k]);
  for (const k of unrecognised) delete parsed.evidence_detail[k];

  if (emptyDims.length)    console.warn(`[L1Scoring] No evidence reported (scored 0): ${emptyDims.join(', ')}`);
  if (divergences.length)  console.warn(`[L1Scoring] Model score diverged from evidence — likely under-reported evidence: ${divergences.join('; ')}`);
  if (unrecognised.length) console.warn(`[L1Scoring] Dropped unrecognised dimensions: ${unrecognised.join(', ')}`);

  const sum = Object.values(scores).reduce((s, v) => s + v, 0);
  parsed.score = Math.round(sum * 10) / 10;
  parsed.score_percent = Math.round((parsed.score / MAX_L1_SCORE) * 100);
  parsed.score_category = parsed.score >= 8.0 ? 'Good' : parsed.score >= 5.0 ? 'Moderate' : 'Poor';

  // "We went deep — why not 2/2?" is the most likely panel query, so record exactly
  // which requirement was missed rather than leaving it to be inferred.
  const fullMarksDenied = Object.entries(audit)
    .filter(([, a]) => a.top_tier_denied)
    .map(([dim, a]) => `${dim}: ${a.top_tier_denial_reason} ` +
      `(${a.units} ${a.scored_on.replace(/_/g, ' ')}, ${a.follow_up_chains} chain(s))`);
  if (fullMarksDenied.length) {
    console.log(`[L1Scoring] Full marks withheld — ${fullMarksDenied.join('; ')}`);
  }

  const untagged = Object.entries(audit)
    .filter(([, a]) => a.untagged_quotes > 0)
    .map(([dim, a]) => `${dim} (${a.untagged_quotes}/${a.quotes})`);
  if (untagged.length) {
    console.warn(`[L1Scoring] Evidence missing topic tags — breadth may be undercounted: ${untagged.join('; ')}`);
  }

  if (repeated.length) {
    console.warn(`[L1Scoring] Repeated or empty evidence collapsed — the panel asked less than the list suggested: ${repeated.join('; ')}`);
  }

  parsed.scoring_warnings = {
    dimensions_without_evidence: emptyDims,
    model_score_divergences: divergences,
    dropped_categories: unrecognised,
    full_marks_denied: fullMarksDenied,
    untagged_evidence: untagged,
    collapsed_evidence: repeated,
  };

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
    // MAX_OUTPUT_TOKENS (4000): each evidence item is now an object with quote + topic
    // + follows_up rather than a bare string, across up to 8 items x 6 dimensions. Too
    // low and Ollama stops mid-JSON with done_reason=length and the response fails to
    // parse. It is the same constant the transcript cap is derived from, so the two
    // halves of the context budget cannot drift apart again.
    { temperature: SCORING_TEMPERATURE, maxTokens: MAX_OUTPUT_TOKENS, think: false, seed: SCORING_SEED }
  );

  const parsed = parseLLMJSON(llmResult.content);
  const parsedScore = parsed.value;
  // A repair that succeeds silently hides a prompt that has begun drifting, so say so.
  if (parsedScore && parsed.method !== 'brace-scan' && parsed.method !== 'markdown-block') {
    console.warn(`[L1Scoring] Response needed JSON repair (${parsed.method}) — the model emitted ` +
      `slightly invalid JSON. Scoring continued on the repaired object.`);
  }
  if (!parsedScore) {
    // Three different faults arrive as "unparseable", with three different fixes:
    // done_reason=length means the evidence objects overran num_predict; a syntax error
    // at a position means the model broke its own JSON; no '{' at all means it answered
    // in prose. Only reporting the parse error and the tail together tells them apart.
    const tail = String(llmResult.content || '').slice(-300);
    throw new Error(
      `L1 scoring LLM returned unparseable JSON (done_reason=${llmResult.doneReason}, ` +
      `${llmResult.outputTokens} output tokens of ${MAX_OUTPUT_TOKENS} allowed). ` +
      (llmResult.doneReason === 'length'
        ? 'The response was CUT OFF mid-JSON — raise maxTokens or reduce evidence items per dimension. '
        : '') +
      `Parse error: ${parsed.error || 'no JSON object found in the response'}. ` +
      `Response tail: ...${tail}`);
  }
  // The score is derived from evidence, so a response carrying neither evidence key
  // would silently score 0.0 across the board and look like a catastrophic panel
  // rather than a malformed response. Fail loudly instead.
  if (!parsedScore.evidence_detail && !parsedScore.evidence) {
    throw new Error('L1 scoring LLM returned no evidence_detail — cannot derive a score from absent evidence');
  }
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
    // See l2ScoringService: seed + temperature 0 alone do not make a score
    // reproducible, because the first generation after a model load diverges.
    warmed_up: llmResult.warmedUp,
    warmup_note: llmResult.warmupNote,
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
    // v5: dimension scores are DERIVED IN CODE from tiered evidence counts rather
    // than chosen by the model. Scores are not comparable with earlier versions.
    // v6: repeated quotes are collapsed before counting, so a dimension padded with
    // eight copies of one question counts one subject. A v5 record with padded
    // evidence scores higher than the same evidence under v6 — hence the bump, so a
    // 7.8 and a 4.3 for one transcript are distinguishable rather than mysterious.
    scoring_method: 'evidence-tier',
    rubric_version: 'l1-v6-evidence-tier',
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
  // Exported for scripts/test_context_budget.js, which builds a worst-case prompt and
  // asserts it fits the window. PROMPT_RESERVE_CHARS is a measured number, and a
  // measured number needs a test that re-measures it — a prompt edit that grows the
  // template is otherwise invisible until a long transcript fails in production.
  MAX_TRANSCRIPT_CHARS,
  MAX_JD_CHARS,
  MAX_RESUME_CHARS,
  MAX_OUTPUT_TOKENS,
  L1_SCORING_SYSTEM_PROMPT,
  _buildScoringPrompt,
};
