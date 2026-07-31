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
const { normalizeTranscript, questionCountsBySpeaker, hasTurnLabels } = require('./transcriptNormalizer');
const { scoreFromEvidence, coerceEvidenceItems } = require('./evidenceTierScoring');
const { analyzeInterviewModeration } = require('./moderationService');

// ─── Determinism ─────────────────────────────────────────────────────────────
// Scoring must be reproducible: identical input => identical score. Ollama is
// seeded and run at temperature 0. Without this, the same transcript drifted
// across runs and the drift was indistinguishable from a real scoring change.
const SCORING_SEED = parseInt(process.env.L2_SCORING_SEED || '42', 10);
const SCORING_TEMPERATURE = 0;

// ─── Dimension Config ────────────────────────────────────────────────────────
//
// `steps` is the set of scores a dimension can resolve to. Every dimension has 5
// rubric tiers (0/25/50/75/100%), but a 0.5-max dimension would put those tiers at
// 0.125 increments — finer than this rubric is meaningful at — so the coarse
// dimensions get a coarse grid and evidenceTierScoring maps tiers onto it by index.
// On the 3-step grid that makes tiers 1–2 share 0.25 and tiers 3–4 share 0.5:
// lossy, but monotonic, which multiplying the max and snapping was not.
//
// `depthDimension` switches the evidence unit from "distinct topics probed" to
// "topics probed with a how/why question". Only Technical Depth carries it, for the
// same reason as L1: it is DEFINED as explanation-seeking, so counting yes/no
// coverage there would award 75% for three existence checks on the one dimension
// that exists to measure depth. Scenario / Risk is deliberately NOT a depth
// dimension — posing a failure scenario is the evidence, and requiring how/why
// phrasing on top would double-count the same requirement.

const L2_DIMENSIONS = {
  'Mandatory Skill Coverage':   { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Verification of high-level mandatory requirements from the JD.' },
  'Technical Depth':            { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], depthDimension: true, focus: 'System design, design patterns, scalability, and latency probing.' },
  'Resume Screening & Handoff': { max: 2.0, steps: [0, 0.5, 1.0, 1.5, 2.0], focus: 'Did the L2 panel check the unverified gaps passed in L1? Probing specific resume claims.' },
  'Scenario / Risk Evaluation': { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Real-world architecture failure, scaling, and recovery scenarios.' },
  'Framework Knowledge':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Advanced framework patterns (concurrency, lifecycle, hooks).' },
  'Hands-on Validation':        { max: 1.0, steps: [0, 0.25, 0.5, 0.75, 1.0], focus: 'Validation of real-world implementation and deployments.' },
  'Leadership Evaluation':      { max: 0.5, steps: [0, 0.25, 0.5],            focus: 'Team leadership, mentoring, and strategic ownership.' },
  'Behavioral Assessment':      { max: 0.5, steps: [0, 0.25, 0.5],            focus: 'Conflict resolution, communication, and adaptability.' },
};

// Without an L1 transcript there is nothing to check handoff against, so this
// dimension is capped after derivation — see _clampScores.
const HANDOFF_DIMENSION = 'Resume Screening & Handoff';
const HANDOFF_CAP_WITHOUT_L1 = 1.0;

const MAX_L2_SCORE = Object.values(L2_DIMENSIONS).reduce((s, d) => s + d.max, 0); // 10.0

// ─── Input Limits ────────────────────────────────────────────────────────────
//
// Derived from the context budget — see l1ScoringService for the full derivation.
// L2 is tighter than L1 because it carries TWO transcripts plus a larger output
// budget (8 dimensions of evidence): 16384 - 4000 = 12384 tokens ≈ 37000 chars at
// the observed ~3.0 chars/token, minus ~8500 overhead => ~28500 to split.
//
// The L2 transcript is what is being scored, so it gets the larger share; L1 is
// supporting context for one dimension (Resume Screening & Handoff). The old
// 10000/8000 discarded 43% of a real 17k-char L2 interview.
const MAX_L2_TRANSCRIPT_CHARS = parseInt(process.env.L2_MAX_TRANSCRIPT_CHARS || '18000', 10);
const MAX_L1_CONTEXT_CHARS = parseInt(process.env.L2_MAX_L1_CONTEXT_CHARS || '10000', 10);
const MAX_JD_CHARS = 3000;
const MAX_RESUME_CHARS = 2000;

// ─── System Prompts ──────────────────────────────────────────────────────────

const L2_SCORING_SYSTEM_PROMPT = `You are a senior HR quality-assurance expert with 15+ years of technical interview assessment experience.
Your task is to evaluate how effectively the L2 (second-round) interviewer/panel probed the candidate.
You are judging the PANEL's performance — not the candidate's.

CRITICAL RULES:
1. Return ONLY a valid JSON object. No markdown, no explanation, no preamble.
2. All string values must be JSON-safe (no raw newlines).
3. Evidence MUST only quote lines spoken by the INTERVIEWER / PANEL — never the candidate.
4. You do NOT choose the numeric scores. They are computed from the evidence you
   report, so your task is to report that evidence completely and accurately.
   Omitting a question the panel really asked lowers their score for no reason.
5. Report NO evidence for a dimension only when it was genuinely absent from the
   interview.
6. You are reporting the PANEL'S QUESTIONS, never the quality of the candidate's
   answers. A question the candidate fumbled is still a question the panel asked,
   and must still be reported. Whether the candidate was ultimately hired or
   rejected is irrelevant and must not influence what you report.
7. Never invent a question. Every quote must appear in the transcript.`;

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
  // Truncation is loud: a score from a partial interview must never look like a
  // score from the whole one.
  const droppedL2 = Math.max(0, l2Transcript.length - MAX_L2_TRANSCRIPT_CHARS);
  if (droppedL2 > 0) {
    console.warn(`[L2Scoring] TRANSCRIPT TRUNCATED — ${droppedL2} of ${l2Transcript.length} chars ` +
      `(${Math.round((droppedL2 / l2Transcript.length) * 100)}%) discarded at the ${MAX_L2_TRANSCRIPT_CHARS}-char cap. ` +
      `Questions in the dropped tail are invisible to the scorer and will read as "never asked". ` +
      `Raise OLLAMA_NUM_CTX and L2_MAX_TRANSCRIPT_CHARS together to score the full interview.`);
  }
  const safeL2Transcript = droppedL2 > 0
    ? l2Transcript.substring(0, MAX_L2_TRANSCRIPT_CHARS) + '\n[... transcript truncated ...]'
    : l2Transcript;

  // L1 context materially drives the "Resume Screening & Handoff" dimension.
  // When it is absent the model has nothing to check handoff against and inflates
  // the score by ~1.2 pts, so the absence is stated LOUDLY rather than implied by
  // a bare "Not available." line the model can gloss over.
  const hasL1 = Boolean(l1Transcript && l1Transcript.trim());
  const safeL1Transcript = !hasL1
    ? 'NOT AVAILABLE — the L1 interview transcript was not supplied for this candidate.'
    : (l1Transcript.length > MAX_L1_CONTEXT_CHARS
      ? l1Transcript.substring(0, MAX_L1_CONTEXT_CHARS) + '\n[... L1 transcript truncated ...]'
      : l1Transcript);

  const l1Guidance = hasL1
    ? 'The L1 transcript IS available above. For "Resume Screening & Handoff", report the ' +
      'questions where the L2 panel followed up on gaps L1 left unverified, as well as ' +
      'those verifying resume claims directly.'
    : 'The L1 transcript is NOT available, so handoff follow-up cannot be observed. ' +
      'For "Resume Screening & Handoff", report ONLY questions where the L2 panel verified ' +
      `the candidate's resume claims directly. That dimension is capped at ` +
      `${HANDOFF_CAP_WITHOUT_L1} automatically — do not report handoff evidence you cannot see.`;

  // Only claim a line format the transcript actually has — see hasTurnLabels().
  const formatNote = hasTurnLabels(safeL2Transcript)
    ? 'Each line is one speaker turn, formatted "Speaker Name H:MM: utterance". The\n' +
      'INTERVIEWER / PANELIST is whoever asks the questions; the CANDIDATE is whoever\n' +
      'answers them. Attribute every question to the speaker whose line it appears on.\n'
    : '';

  // Max is shown for context (it signals relative weight) but not the step grid:
  // the model does not pick the score, so listing the steps would only invite it to try.
  const dimensionTable = Object.entries(L2_DIMENSIONS)
    .map(([name, cfg]) => `  • ${name} (weight ${cfg.max}): ${cfg.focus}`)
    .join('\n');

  // Built from L2_DIMENSIONS rather than hand-listed, so adding a dimension cannot
  // leave the required-output skeleton silently missing a key.
  const evidenceSkeleton = Object.keys(L2_DIMENSIONS)
    .map(name => `    "${name}": [{"quote": "<interviewer's words>", "topic": "<subject probed>", "probes_depth": false, "follows_up": false}]`)
    .join(',\n');
  const summarySkeleton = Object.keys(L2_DIMENSIONS)
    .map(name => `    "${name}": "<one sentence verdict>"`)
    .join(',\n');

  return `/no_think

=== YOUR EVALUATION TASK ===
Evaluate the INTERVIEWER's (L2 panel's) probing quality in the L2 interview transcript below.
You are NOT scoring the candidate — you are scoring how well the L2 PANELIST covered each dimension.

=== JOB ID ===
${jobId}

=== JOB DESCRIPTION ===
${jd.substring(0, MAX_JD_CHARS)}

=== CANDIDATE RESUME (from Stage 1 screening) ===
${resumeText ? resumeText.substring(0, MAX_RESUME_CHARS) : 'Resume not available.'}

=== L1 INTERVIEW TRANSCRIPT CONTEXT (for Handoff evaluation) ===
${safeL1Transcript}

=== L2 INTERVIEW TRANSCRIPT (To be evaluated) ===
${formatNote}${safeL2Transcript}

=== SCORING DIMENSIONS ===
${dimensionTable}

=== L1 CONTEXT AVAILABILITY ===
${l1Guidance}

=== YOUR JOB: REPORT THE EVIDENCE, NOT THE SCORE ===
The numeric score is computed mechanically from the evidence you report, so your
only task is to report that evidence COMPLETELY and HONESTLY. Under-reporting a
question the panel really asked lowers their score for no reason; inventing one
they did not ask inflates it. Both are failures.

For EACH dimension:
1. Find EVERY question the L2 INTERVIEWER asked that relates to this dimension.
2. Record each one as an evidence item with four fields:
     "quote"        — the interviewer's actual words (trimmed, JSON-safe)
     "topic"        — the specific subject probed, 1-4 words (e.g. "Kafka
                      partitioning", "cache invalidation", "team mentoring").
                      Use the SAME topic string when several questions probe the
                      same subject, and DIFFERENT strings for different subjects.
                      This is what breadth is measured from, so it must be accurate.
     "probes_depth" — true if the question asks HOW, WHY, or WHAT IF, or otherwise
                      demands explanation. False for existence checks answerable
                      with yes/no ("Have you used Kafka?", "Do you know Redis?").
     "follows_up"   — true ONLY if this question builds on the candidate's
                      PREVIOUS ANSWER — drilling further into something they just
                      said. False when it opens a new subject.
3. List up to 8 evidence items per dimension. If the panel probed 5 different
   JD technologies, report 5 items with 5 different topics — never one
   representative example.

L2 is a senior-level round, so weight your reading of "related to this dimension"
toward design, scalability, trade-offs, scenarios, and ownership rather than basic
syntax. But report what was actually asked — do not withhold a question because it
was more junior than you expected of an L2 panel.

How the score follows from your evidence (for your understanding — do not compute it):
  - 1 subject probed        -> 25% of the dimension max
  - 2 subjects              -> 50%
  - more than 2 subjects    -> 75%
  - that, plus a genuine follow-up chain -> 100%
For "Technical Depth" only questions with probes_depth=true are counted, because
that dimension measures explanation-seeking rather than coverage.

=== DEPTH CLAIM ===
For each dimension set "depth_demonstrated" to true ONLY when the panel drilled
into the area with genuine follow-ups ("how did you scale that?", "why that
approach?", "what happens when the primary fails?"). Set it to false for
surface-level coverage. Do not set it true on every dimension out of politeness — a
dimension covered only by yes/no questions is false. Full marks additionally require
a real follow-up chain to be visible in the evidence you reported, so an unsupported
claim here will not raise the score.

REPORT THE QUESTIONS, NOT THE ANSWERS: a weak candidate does not make a weak panel.
Do not omit evidence because the candidate performed poorly or was rejected.

NOISE ROBUSTNESS: Ignore small-talk, audio issues, and off-topic conversation.
RESUME SCREENING & HANDOFF: Report questions where the L2 panel checked unverified gaps, probed deeper into details the L1 transcript touched on or missed, or verified key resume credentials.

=== REQUIRED OUTPUT FORMAT ===
Return ONLY this exact JSON structure. Every dimension key must be present in
evidence_detail and depth_demonstrated, even when the array is empty.
{
  "job_id": "${jobId}",
  "confidence": <0.0–1.0>,
  "evidence_detail": {
${evidenceSkeleton}
  },
  "depth_demonstrated": {
${Object.keys(L2_DIMENSIONS).map(n => `    "${n}": <true|false>`).join(',\n')}
  },
  "dimension_summaries": {
${summarySkeleton}
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

// ─── Derive Scores From Evidence ──────────────────────────────────────────────
//
// No _snapToStep here any more: evidenceTierScoring maps a tier directly onto the
// dimension's `steps` array, so an off-grid value cannot be produced in the first
// place and there is nothing to snap. That mattered most at L2, which is the only
// scorer with 3-step grids — 75% of a 0.5 max is 0.375, equidistant between 0.25
// and 0.5, so snapping sent tier 3 DOWN onto tier 1 and a panel that probed three
// leadership subjects scored the same as one that probed a single subject.

/**
 * Derive every dimension score from the reported evidence.
 *
 * The model no longer picks the numbers — see evidenceTierScoring for why. It is
 * still asked for `categories` by older stored responses, so a large model-vs-derived
 * gap is logged as a signal that evidence was under-reported.
 *
 * @param {object} parsed
 * @param {boolean} hasL1  — when false, "Resume Screening & Handoff" is capped
 *                           because handoff follow-up cannot be observed at all.
 */
function _clampScores(parsed, hasL1 = true) {
  if (!parsed) throw new Error('Empty LLM response');

  // ── Normalise the evidence into tagged items ──
  const evidenceDetail = {};
  const emptyDims = [];
  for (const dim of Object.keys(L2_DIMENSIONS)) {
    const items = coerceEvidenceItems(
      parsed.evidence_detail?.[dim] ?? parsed.evidence?.[dim]
    );
    evidenceDetail[dim] = items;
    if (!items.length) emptyDims.push(dim);
  }

  const depthClaims = {};
  const modelScores = {};
  for (const dim of Object.keys(L2_DIMENSIONS)) {
    depthClaims[dim] = parsed.depth_demonstrated?.[dim] === true;
    const raw = parseFloat(parsed.categories?.[dim]);
    if (Number.isFinite(raw)) modelScores[dim] = raw;
  }

  // ── Derive the scores ──
  const { scores, audit, divergences } = scoreFromEvidence({
    dimensions: L2_DIMENSIONS, evidenceDetail, depthClaims, modelScores,
  });

  // Cap handoff when there is no L1 transcript to check against. Applied AFTER
  // derivation, because the evidence can legitimately show three verified resume
  // claims — the cap reflects what cannot be observed, not weak probing.
  const capped = [];
  if (!hasL1 && scores[HANDOFF_DIMENSION] > HANDOFF_CAP_WITHOUT_L1) {
    capped.push(`${HANDOFF_DIMENSION} ${scores[HANDOFF_DIMENSION]}->${HANDOFF_CAP_WITHOUT_L1}`);
    scores[HANDOFF_DIMENSION] = HANDOFF_CAP_WITHOUT_L1;
    audit[HANDOFF_DIMENSION].capped_to = HANDOFF_CAP_WITHOUT_L1;
    audit[HANDOFF_DIMENSION].cap_reason = 'no L1 transcript — handoff follow-up unobservable';
  }

  parsed.categories = scores;
  parsed.evidence_audit = audit;

  // Keep `evidence` as Record<string, string[]> — the frontend reads that shape, and
  // the quotes are now derived from the same items the score came from, so they
  // cannot disagree.
  parsed.evidence = {};
  parsed.evidence_detail = evidenceDetail;
  for (const dim of Object.keys(L2_DIMENSIONS)) {
    parsed.evidence[dim] = evidenceDetail[dim].map(it => it.quote);
  }

  const unrecognised = Object.keys(parsed.evidence_detail || {}).filter(k => !L2_DIMENSIONS[k]);
  for (const k of unrecognised) delete parsed.evidence_detail[k];

  if (emptyDims.length)    console.warn(`[L2Scoring] No evidence reported (scored 0): ${emptyDims.join(', ')}`);
  if (capped.length)       console.warn(`[L2Scoring] Capped (no L1 context): ${capped.join(', ')}`);
  if (divergences.length)  console.warn(`[L2Scoring] Model score diverged from evidence — likely under-reported evidence: ${divergences.join('; ')}`);
  if (unrecognised.length) console.warn(`[L2Scoring] Dropped unrecognised dimensions: ${unrecognised.join(', ')}`);

  const sum = Object.values(scores).reduce((s, v) => s + v, 0);
  parsed.score = Math.round(sum * 10) / 10;
  parsed.score_percent = Math.round((parsed.score / MAX_L2_SCORE) * 100);
  parsed.score_category = parsed.score >= 8.0 ? 'Good' : parsed.score >= 5.0 ? 'Moderate' : 'Poor';

  // "We went deep — why not full marks?" is the most likely panel query, so record
  // exactly which requirement was missed rather than leaving it to be inferred.
  const fullMarksDenied = Object.entries(audit)
    .filter(([, a]) => a.top_tier_denied)
    .map(([dim, a]) => `${dim}: ${a.top_tier_denial_reason} ` +
      `(${a.units} ${a.scored_on.replace(/_/g, ' ')}, ${a.follow_up_chains} chain(s))`);
  if (fullMarksDenied.length) {
    console.log(`[L2Scoring] Full marks withheld — ${fullMarksDenied.join('; ')}`);
  }

  const untagged = Object.entries(audit)
    .filter(([, a]) => a.untagged_quotes > 0)
    .map(([dim, a]) => `${dim} (${a.untagged_quotes}/${a.quotes})`);
  if (untagged.length) {
    console.warn(`[L2Scoring] Evidence missing topic tags — breadth may be undercounted: ${untagged.join('; ')}`);
  }

  parsed.scoring_warnings = {
    dimensions_without_evidence: emptyDims,
    capped_dimensions: capped,
    model_score_divergences: divergences,
    dropped_categories: unrecognised,
    full_marks_denied: fullMarksDenied,
    untagged_evidence: untagged,
  };

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

  // Restore turn boundaries before scoring — see l1ScoringService for why an export
  // without line breaks makes the panel's questions unattributable.
  const normL2 = normalizeTranscript(l2Transcript);
  const normL1 = normalizeTranscript(l1Transcript);
  const l2Text = normL2.text;
  const l1Text = normL1.text;
  const panelQuestionCounts = questionCountsBySpeaker(l2Text);

  console.log(`[L2Scoring] Starting evaluation — jobId=${jobId} candidate="${candidateName}" ` +
    `L2transcriptLen=${l2Transcript.length} l1Present=${hasL1} l1Len=${l1Transcript.length} seed=${SCORING_SEED}`);
  if (!normL2.alreadyStructured) {
    console.log(`[L2Scoring] Normalised L2 transcript — inserted ${normL2.insertedBreaks} turn boundaries ` +
      `across ${normL2.speakers.length} speaker(s): ${normL2.speakers.join(', ')}. ` +
      `Question-marked turns per speaker: ${JSON.stringify(panelQuestionCounts)}`);
  }

  // ── Step 1: Score the transcript ──────────────────────────────────────────
  // Deterministic: temperature 0 + fixed seed, so identical input => identical score.
  const scoringPrompt = _buildScoringPrompt(jobId, jd, resumeText, l1Text, l2Text);
  const llmResult = await callLLMWithMeta(
    [
      { role: 'system', content: L2_SCORING_SYSTEM_PROMPT },
      { role: 'user', content: scoringPrompt }
    ],
    // 4000: 8 dimensions × up to 8 evidence items, each now an object with
    // quote + topic + probes_depth + follows_up rather than a bare string. Too low
    // and Ollama stops mid-JSON with done_reason=length and the response fails to
    // parse. Not raised further because num_ctx is shared with two transcripts —
    // see the Input Limits derivation above.
    { temperature: SCORING_TEMPERATURE, maxTokens: 4000, think: false, seed: SCORING_SEED }
  );

  const parsedScore = _parseJSON(llmResult.content);
  if (!parsedScore) throw new Error('L2 scoring LLM returned invalid JSON');
  // The score is derived from evidence, so a response carrying neither evidence key
  // would silently score 0.0 across the board and look like a catastrophic panel
  // rather than a malformed response. Fail loudly instead.
  if (!parsedScore.evidence_detail && !parsedScore.evidence) {
    throw new Error('L2 scoring LLM returned no evidence_detail — cannot derive a score from absent evidence');
  }
  _clampScores(parsedScore, hasL1);
  console.log(`[L2Scoring] Score=${parsedScore.score}/${MAX_L2_SCORE} Category=${parsedScore.score_category} ` +
    `model=${llmResult.model}@${llmResult.modelDigest || 'unknown'} ` +
    `promptTokens=${llmResult.promptTokens} outputTokens=${llmResult.outputTokens}`);

  // ── Step 2: Panel summary + Moderation run in parallel ───────────────────
  const [panelSummary, moderationResult] = await Promise.all([
    _generatePanelSummary(parsedScore, jd),
    (async () => {
      try {
        const modRes = await analyzeInterviewModeration({ l1_transcript: l2Text, job_id: jobId });
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
    // Seed + temperature 0 are not sufficient on their own: the first generation
    // after a model load diverges from every later one, which moved this very
    // record's score between 8.0 and 9.0. Recorded so a disagreement between two
    // supposedly identical scores can be traced to a failed warm-up.
    warmed_up: llmResult.warmedUp,
    warmup_note: llmResult.warmupNote,
    l1_context_available: hasL1,
    l1_transcript_chars: l1Transcript.length,
    l2_transcript_chars: l2Transcript.length,
    // Persisted so an audit can tell a low score caused by a weak panel from one
    // caused by an unscored tail, without re-deriving the cap from code history.
    l2_transcript_chars_scored: Math.min(l2Text.length, MAX_L2_TRANSCRIPT_CHARS),
    l2_transcript_chars_dropped: Math.max(0, l2Text.length - MAX_L2_TRANSCRIPT_CHARS),
    l1_context_chars_dropped: Math.max(0, l1Text.length - MAX_L1_CONTEXT_CHARS),
    // Turn-boundary repair applied before scoring — see l1ScoringService.
    transcript_breaks_inserted: normL2.insertedBreaks,
    transcript_speakers: normL2.speakers,
    question_turns_by_speaker: panelQuestionCounts,
    // v5: dimension scores are DERIVED IN CODE from tiered evidence counts rather
    // than chosen by the model. Scores are not comparable with earlier versions.
    scoring_method: 'evidence-tier',
    rubric_version: 'l2-v5-evidence-tier',
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
  HANDOFF_DIMENSION,
  HANDOFF_CAP_WITHOUT_L1,
  // Exported for scripts/test_l2_tiers.js. The handoff cap is the only scoring rule
  // that lives here rather than in evidenceTierScoring, so it is the one piece that
  // the shared tier tests cannot reach; exercising it needs no LLM call.
  _deriveScores: _clampScores,
};
