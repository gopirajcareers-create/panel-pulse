/**
 * Screening Service — Stage 1
 *
 * Matches a candidate's resume against a JD's skills and produces a match score,
 * per-skill evidence, and an eligibility status.
 *
 * ── Why this is a service and not route code ─────────────────────────────────
 * It used to live inline in routes/pipeline.js, which meant it could not be
 * re-scored or determinism-tested the way L1 and L2 can (scripts/rescore.js,
 * scripts/verify_determinism.js). A scorer that cannot be re-run against a stored
 * record cannot be shown to have been fixed. Same shape as l1ScoringService now.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Stage 1 never got the treatment L1 and L2 received, and drifted between runs of
 * the identical record for four independent reasons, all fixed here:
 *
 *   1. Skill extraction ran at temperature 0.7 with no seed. It decides WHICH
 *      skills are evaluated, so its output changed the denominator of the score —
 *      the same resume scored differently because the skill list moved underneath
 *      it. Now seeded at temperature 0.
 *   2. Neither call passed `seed`, so llmClient skipped the warm-up (it only warms
 *      seeded calls). Stage 1 was fully exposed to the cold-start divergence that
 *      moved a stored L2 record between 8.0 and 9.0 — see llmClient._ensureWarm.
 *      Both calls are seeded now, so both are warmed.
 *   3. The model computed matchScore itself from a formula written in prose, and
 *      the only validation was `typeof === 'number'`. Now computed in code by
 *      skillMatchScoring from the evidence, so the score cannot disagree with the
 *      checkmarks beside it.
 *   4. Borderline evidence flipped a boolean, moving the total by 70/N. Now graded
 *      STRONG / PARTIAL / NONE, so a borderline skill moves the score by half that
 *      and lands in the tier that describes it.
 *
 * ── Skill provenance ─────────────────────────────────────────────────────────
 * jdAnalyzerService only reports mandatory skills when the JD literally contains
 * "mandatory" / "required" / "must have" / "essential" / "must". Most real JDs
 * don't, so the empty case is the COMMON case, and Stage 1 used to paper over it
 * with hardcoded literals — 'Communication', 'Technical Adaptability',
 * 'Problem Solving' — presented indistinguishably from JD-sourced skills. A
 * screening decision was being made against invented criteria.
 *
 * Every skill now carries a `source`, and the AI-suggested skills the analyzer
 * already produces (and Stage 1 previously discarded) are used instead of generic
 * literals. `skillsProvenance` tells the UI to say so out loud.
 */

'use strict';

const { callLLMWithMeta, promptCharBudget, NUM_CTX } = require('./llmClient');
const { parseLLMJSON } = require('./jsonRepair');
const { analyzeJD } = require('./jdAnalyzerService');
const {
  computeMatchScore,
  reconcileRows,
  findSummaryContradictions,
  coverageSentence,
} = require('./skillMatchScoring');

// ─── Determinism ─────────────────────────────────────────────────────────────
// Same rationale and default as L1/L2, so all three stages are reproducible on the
// same footing.
const SCORING_SEED = parseInt(process.env.SCREENING_SEED || '42', 10);
const SCORING_TEMPERATURE = 0;

// ─── Input Limits ────────────────────────────────────────────────────────────
//
// DERIVED from the context window, not hand-written. The old literals — 4000 for the
// JD and 5000 for the resume — were unrelated to the real budget, and l1ScoringService
// records what that costs: a limit derived from a budget by hand goes stale silently
// the moment the budget moves.
//
// Truncation here is worse than elsewhere, because a skill in the dropped tail reads
// as "Not found in resume" — a false negative that lowers the score for a reason that
// has nothing to do with the candidate. So the caps are set as large as the window
// allows, and how much was dropped is recorded in scoring_meta.
const MAX_OUTPUT_TOKENS = 3000;

// Prompt template + system prompt + JSON skeleton + the enumerated skill lists.
//
// MEASURED, not guessed: scripts/test_context_budget.js builds this prompt with every
// input at its cap and 24 skills at cleanSkillList's 80-char ceiling, and reports
// 7941 chars of template plus 1103 of system prompt. A first estimate of 7000 failed
// that check by 639 tokens — the skill lists are enumerated TWICE (numbered list, then
// JSON row skeleton), so 24 long skills cost ~4000 chars on their own.
//
// 12000 = 9044 measured + ~2400 (750 tokens) of headroom for future prompt edits.
// Underestimating is a hard pre-flight failure; overestimating only costs input tail.
const PROMPT_RESERVE_CHARS = 12000;

// The resume is what is being examined, so it gets the larger share; the JD is context
// for judging relevance, and its skills have already been extracted by this point.
const RESUME_SHARE = 0.6;

const _budget = promptCharBudget(MAX_OUTPUT_TOKENS, { reserveChars: PROMPT_RESERVE_CHARS });
const _envInt = (name) => parseInt(process.env[name] || '0', 10);

/** An explicit override wins, but is clamped to its share of the real window. */
function _cap(envName, share) {
  const allowed = Math.floor(_budget * share);
  const requested = _envInt(envName);
  if (requested > allowed) {
    console.warn(`[Screening] ${envName}=${requested} exceeds its share of num_ctx=${NUM_CTX} ` +
      `(${allowed} chars) — clamped. Raise OLLAMA_NUM_CTX; the model supports 40960.`);
    return allowed;
  }
  return requested > 0 ? requested : allowed;
}

const MAX_RESUME_CHARS = _cap('SCREENING_MAX_RESUME_CHARS', RESUME_SHARE);
const MAX_JD_CHARS = _cap('SCREENING_MAX_JD_CHARS', 1 - RESUME_SHARE);

console.log(`[Screening] Input caps resume=${MAX_RESUME_CHARS} jd=${MAX_JD_CHARS} chars ` +
  `(num_ctx=${NUM_CTX}, num_predict=${MAX_OUTPUT_TOKENS}, reserve=${PROMPT_RESERVE_CHARS})`);

// Cap the skill list so a JD that yields dozens of skills cannot push the prompt past
// the window, and so one row per skill fits in the output budget.
const MAX_SKILLS_PER_BUCKET = 12;

// ─── Skill provenance ────────────────────────────────────────────────────────

const SOURCE_JD = 'jd';                     // explicitly labelled in the JD
const SOURCE_AI = 'ai-suggested';           // inferred by the model from the role

/**
 * Strip the artefacts jdAnalyzerService's line-splitting parser lets through.
 *
 * That parser keeps every non-empty line, so template headers ("[List mandatory
 * skills]"), bullet glyphs and stray reasoning prose arrive as "skills". The frontend
 * grew a 40-entry blacklist to scrub this downstream (JdSkillsCard.SKILL_NOISE), but
 * that component is not the one Stage 1 renders — so Stage 1 displayed the noise and,
 * worse, SCORED against it: a junk entry is a skill the resume can never match, and
 * every one of them dragged the percentage down.
 *
 * Cleaning belongs here, before the value is scored and stored, not in one of several
 * views that may or may not remember to do it.
 *
 * @param {string[]} skills
 * @returns {string[]}
 */
function cleanSkillList(skills) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(skills) ? skills : []) {
    let s = String(raw || '').trim();

    // Leading bullets / numbering the parser left behind.
    s = s.replace(/^[-*•▪·]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    // Bracketed template placeholders: "[List mandatory skills]".
    if (/^[[(].*[\])]$/.test(s)) continue;
    // Trailing punctuation.
    s = s.replace(/[.,;:]+$/, '').trim();

    if (s.length < 2 || s.length > 80) continue;

    const lower = s.toLowerCase();
    // A section header echoed as a list item.
    if (/^(mandatory|good\s*to\s*have|ai\s*suggested|key)\s*skills?\s*:?$/.test(lower)) continue;
    // Reasoning prose rather than a skill name. A real skill is a noun phrase; these
    // openers mark the model narrating instead of answering.
    if (/^(wait|hmm|okay|so|but|however|actually|let me|i need|i think|the (jd|role|candidate|user)|this is|note that)\b/.test(lower)) continue;
    // A sentence, not a skill: many words AND a verb-ish tail.
    if (s.split(/\s+/).length > 8) continue;
    // Must contain a letter — "5+", "---" are not skills.
    if (!/[a-z]/i.test(s)) continue;

    const key = lower.replace(/[^a-z0-9+#]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out;
}

/**
 * Resolve which skills this screening evaluates, and where each came from.
 *
 * When the JD names no mandatory skills, the AI-suggested list is promoted rather
 * than substituting generic literals. Those suggestions are role-derived and were
 * already being generated and thrown away; using them means the screening evaluates
 * something plausibly relevant instead of 'Communication' on a QA automation role.
 *
 * The promotion is always LABELLED. An AI-inferred mandatory list is a materially
 * weaker basis for an eligibility decision than a JD-stated one, and a recruiter
 * reading "Eligible — 85%" has to be able to see which they are looking at.
 *
 * @param {string} jdText
 * @returns {Promise<{mandatory: Array<{skill,source}>, goodToHave: Array<{skill,source}>,
 *                    keySkills: string[], provenance: object}>}
 */
async function resolveSkills(jdText) {
  let jdMandatory = [];
  let jdGoodToHave = [];
  let aiSuggested = [];
  let analyzerError = null;

  if (String(jdText || '').trim()) {
    try {
      // Seeded and temperature 0 inside jdAnalyzerService now — this call chooses the
      // skills, so its instability was the single largest source of score drift.
      const analysis = await analyzeJD(jdText);
      if (analysis.success && analysis.parsed_analysis) {
        jdMandatory   = cleanSkillList(analysis.parsed_analysis.mandatory_skills);
        jdGoodToHave  = cleanSkillList(analysis.parsed_analysis.good_to_have_skills);
        aiSuggested   = cleanSkillList(analysis.parsed_analysis.key_skills);
      } else if (!analysis.success) {
        analyzerError = analysis.error || 'JD analysis returned no result';
      }
    } catch (err) {
      analyzerError = err.message;
      console.error('[Screening] JD analysis failed:', err.message);
    }
  }

  const usedAiForMandatory = jdMandatory.length === 0 && aiSuggested.length > 0;
  const mandatoryNames = usedAiForMandatory ? aiSuggested.slice(0, 5) : jdMandatory;

  const mandatory = mandatoryNames.slice(0, MAX_SKILLS_PER_BUCKET).map(skill => ({
    skill,
    source: usedAiForMandatory ? SOURCE_AI : SOURCE_JD,
  }));
  const goodToHave = jdGoodToHave.slice(0, MAX_SKILLS_PER_BUCKET).map(skill => ({
    skill,
    source: SOURCE_JD,
  }));

  const provenance = {
    mandatorySource: mandatory.length === 0 ? 'none' : (usedAiForMandatory ? SOURCE_AI : SOURCE_JD),
    goodToHaveSource: goodToHave.length === 0 ? 'none' : SOURCE_JD,
    jdStatedMandatoryCount: jdMandatory.length,
    jdStatedGoodToHaveCount: jdGoodToHave.length,
    aiSuggestedCount: aiSuggested.length,
    analyzerError,
    // The single field a view needs to decide whether to show the caveat banner.
    mandatoryInferred: usedAiForMandatory,
    notice: mandatory.length === 0
      ? 'The JD names no mandatory skills and no AI suggestions were produced — this screening has no criteria to evaluate.'
      : (usedAiForMandatory
        ? 'The JD does not explicitly label any mandatory skills. These were inferred by AI from the role and are NOT stated in the JD — confirm with the recruitment team before acting on this score.'
        : null),
    goodToHaveNotice: goodToHave.length === 0
      ? 'The JD labels no skills as good-to-have, so the full weight is applied to mandatory skills.'
      : null,
  };

  console.log(`[Screening] Skills resolved — mandatory: ${mandatory.length} (${provenance.mandatorySource}), ` +
    `good-to-have: ${goodToHave.length}, ai-suggested available: ${aiSuggested.length}`);
  if (usedAiForMandatory) {
    console.warn('[Screening] JD stated NO mandatory skills — scoring against AI-suggested skills, labelled as inferred.');
  }

  return { mandatory, goodToHave, keySkills: aiSuggested, provenance };
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SCREENING_SYSTEM_PROMPT = `You are a senior technical recruiter with 15+ years of experience performing resume-to-JD skill verification.

Your ONLY job is to report EVIDENCE. You do not compute scores, percentages, or eligibility — those are calculated separately from the evidence you report.

Rules you must follow:
1. Quote the resume VERBATIM. Copy the actual words from the resume text. Never write a sentence the resume does not contain.
2. If a skill is genuinely absent, say so. A missing skill correctly reported is more useful than an invented match.
3. Assign a tier to every skill:
   - "STRONG"  — the resume names the skill AND shows it being used: a duration, a project, an action, or a measurable outcome.
   - "PARTIAL" — the skill appears but thinly: only inside a skills list, or only implied by related work.
   - "NONE"    — the skill does not appear in the resume.
4. Report one row for EVERY skill you are given, in the order given. Never omit a skill.

Return ONLY a valid JSON object. No markdown fences, no commentary outside the JSON.
All string values must be JSON-safe: no raw newlines inside strings.`;

/**
 * Build the screening prompt.
 *
 * Note what is NOT here any more: the scoring formula, the status thresholds, and the
 * instruction to round to an integer. Asking the model for a number it derives from
 * its own judgement stacked two sources of variance on one field, and the number could
 * contradict the evidence printed beside it. It reports evidence; code does arithmetic.
 *
 * @param {string} jdText
 * @param {string} resumeText
 * @param {Array<{skill,source}>} mandatory
 * @param {Array<{skill,source}>} goodToHave
 * @returns {string}
 */
function _buildScreeningPrompt(jdText, resumeText, mandatory, goodToHave) {
  const list = (rows) => rows.length
    ? rows.map((r, i) => `${i + 1}. ${r.skill}`).join('\n')
    : '(none)';

  const rowSkeleton = (rows) => rows.length
    ? rows.map(r => `    { "skill": ${JSON.stringify(r.skill)}, "tier": "<STRONG|PARTIAL|NONE>", "evidence": "<verbatim resume quote, or 'Not found in resume.'>" }`).join(',\n')
    : '';

  return `/no_think

=== JOB DESCRIPTION ===
${String(jdText || '').substring(0, MAX_JD_CHARS)}

=== CANDIDATE RESUME ===
${String(resumeText || '').substring(0, MAX_RESUME_CHARS)}

=== MANDATORY SKILLS TO VERIFY (${mandatory.length}) ===
${list(mandatory)}

=== GOOD-TO-HAVE SKILLS TO VERIFY (${goodToHave.length}) ===
${list(goodToHave)}

=== YOUR TASK ===
For EACH skill listed above, in the order listed:
  - Search the resume for it.
  - Assign "tier": STRONG, PARTIAL, or NONE (definitions in your instructions).
  - Set "evidence" to the VERBATIM resume text that proves your tier. Copy the words
    from the resume. For NONE, write exactly: Not found in resume.

Then write:
  - "experienceMatch": how the candidate's total years of experience compares to what
    the JD asks for. Quote the resume for the years figure. If the resume does not
    state total experience, say so rather than estimating.
  - "screeningSummary": 2-3 sentences on the candidate's overall fit, referring only to
    evidence you reported above. Do NOT state a percentage or an eligibility verdict.

Return exactly this JSON structure:
{
  "mandatorySkillsMatch": [
${rowSkeleton(mandatory) || '    /* no mandatory skills supplied — return an empty array */'}
  ],
  "additionalSkillsMatch": [
${rowSkeleton(goodToHave) || '    /* no good-to-have skills supplied — return an empty array */'}
  ],
  "experienceMatch": "<comparison of the candidate's experience against the JD>",
  "screeningSummary": "<2-3 sentence overall fit summary, no percentage, no verdict>"
}`;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Screen a resume against a JD.
 *
 * Throws on failure rather than returning a degraded record. The previous behaviour
 * caught every error and stored a placeholder reading "Resume or JD text not
 * extracted — please re-upload." with matchScore 0 and status 'Partially Eligible' —
 * a message that was false (the text extracted fine, the model failed), a score and
 * status that contradicted each other, and a record still marked completed. A user
 * following that instruction could never fix it. The caller now surfaces the real
 * failure and stores nothing.
 *
 * @param {object} input
 * @param {string} input.jobId
 * @param {string} input.candidateName
 * @param {string} input.jdText
 * @param {string} input.resumeText
 * @returns {Promise<{success: boolean, analysis: object}>}
 */
async function runScreening({ jobId, candidateName = '', jdText = '', resumeText = '' }) {
  if (!jobId) throw new Error('runScreening: jobId is required');

  const jd = String(jdText || '').trim();
  const resume = String(resumeText || '').trim();

  // Refuse rather than screen against nothing. Both documents are required to say
  // anything at all about a match, and a record written without them is noise that
  // looks like a result.
  if (!jd || !resume) {
    const missing = [!jd && 'JD', !resume && 'resume'].filter(Boolean).join(' and ');
    throw new Error(
      `Cannot screen without both documents — ${missing} text is empty. ` +
      `The uploaded file may be a scanned image or an unsupported format. ` +
      `Re-upload a text-based PDF or DOCX.`
    );
  }

  console.log(`[Screening] Starting — jobId=${jobId} candidate="${candidateName}" ` +
    `jdLen=${jd.length} resumeLen=${resume.length} seed=${SCORING_SEED}`);

  // ── Step 1: Which skills are we evaluating, and on whose authority? ────────
  const { mandatory, goodToHave, keySkills, provenance } = await resolveSkills(jd);

  if (mandatory.length === 0 && goodToHave.length === 0) {
    throw new Error(
      'No skills could be extracted from the JD, and no AI suggestions were produced. ' +
      'There is nothing to screen against. Check that the uploaded JD contains a ' +
      'requirements or skills section.' +
      (provenance.analyzerError ? ` (JD analyzer error: ${provenance.analyzerError})` : '')
    );
  }

  // ── Step 2: Ask the model for evidence — only evidence ────────────────────
  const prompt = _buildScreeningPrompt(jd, resume, mandatory, goodToHave);
  const llmResult = await callLLMWithMeta(
    [
      { role: 'system', content: SCREENING_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    { temperature: SCORING_TEMPERATURE, maxTokens: MAX_OUTPUT_TOKENS, think: false, seed: SCORING_SEED }
  );

  // Shared repair, not a local regex. Evidence strings quote the resume verbatim, so
  // a resume containing a double quote breaks the JSON — the exact fault jsonRepair
  // was written for, and one a pinned seed makes un-retryable: attempt 2 returns the
  // byte-identical broken response.
  const parsed = parseLLMJSON(llmResult.content);
  if (parsed.value && parsed.method !== 'brace-scan' && parsed.method !== 'markdown-block') {
    console.warn(`[Screening] Response needed JSON repair (${parsed.method}) — the model emitted ` +
      `slightly invalid JSON. Screening continued on the repaired object.`);
  }
  if (!parsed.value) {
    const tail = String(llmResult.content || '').slice(-300);
    throw new Error(
      `Screening LLM returned unparseable JSON (done_reason=${llmResult.doneReason}, ` +
      `${llmResult.outputTokens} output tokens of ${MAX_OUTPUT_TOKENS} allowed). ` +
      (llmResult.doneReason === 'length'
        ? 'The response was CUT OFF mid-JSON — raise maxTokens or reduce the skill count. '
        : '') +
      `Parse error: ${parsed.error || 'no JSON object found in the response'}. ` +
      `Response tail: ...${tail}`
    );
  }
  const raw = parsed.value;

  // ── Step 3: Reconcile and grade against the FULL resume ──────────────────
  // Verification uses the untruncated resume on purpose: a quote from beyond the
  // prompt cap is still legitimate evidence, and failing it as "not in the resume"
  // would punish the candidate for our truncation.
  const mandatoryResult  = reconcileRows(mandatory,  raw.mandatorySkillsMatch,  resume);
  const goodToHaveResult = reconcileRows(goodToHave, raw.additionalSkillsMatch, resume);

  for (const [bucket, result] of [['mandatory', mandatoryResult], ['good-to-have', goodToHaveResult]]) {
    if (result.missing.length) {
      console.warn(`[Screening] Model omitted ${result.missing.length} ${bucket} skill(s) — ` +
        `scored NONE: ${result.missing.join(', ')}`);
    }
    if (result.extra.length) {
      console.warn(`[Screening] Model invented ${result.extra.length} ${bucket} skill(s) not asked ` +
        `about — discarded: ${result.extra.join(', ')}`);
    }
    const demoted = result.rows.filter(r => r.audit.demoted);
    for (const row of demoted) {
      console.log(`[Screening] "${row.skill}" demoted ${row.audit.claimed_tier} → ${row.tier}: ` +
        `${row.audit.demotion_reasons.join('; ')}`);
    }
    // Logged as loudly as demotions: a promotion means the model returned a false
    // negative, which is the failure mode that had a resume headed "Cypress" scored
    // as having no Cypress.
    for (const row of result.rows.filter(r => r.audit.promoted)) {
      console.warn(`[Screening] "${row.skill}" PROMOTED NONE → ${row.tier}: ` +
        `${row.audit.demotion_reasons.join('; ')}`);
    }
  }

  // ── Step 4: Compute the score in code ────────────────────────────────────
  const { matchScore, status, breakdown } = computeMatchScore({
    mandatoryRows: mandatoryResult.rows,
    goodToHaveRows: goodToHaveResult.rows,
  });

  console.log(`[Screening] Complete — matchScore=${matchScore}% status=${status} ` +
    `(${breakdown.formula}) model=${llmResult.model}@${llmResult.modelDigest || 'unknown'} ` +
    `promptTokens=${llmResult.promptTokens} outputTokens=${llmResult.outputTokens}`);

  // ── Step 5: Does the model's prose agree with the tiers it reported? ──────
  // The summary is free text generated in the same response as the rows, and nothing
  // reconciled the two — so the page could show "strong experience with Cypress" above
  // a Cypress row reading "Not found in resume". Flagged, not rewritten: the reader is
  // told which sentence conflicts with the evidence rather than having the prose
  // silently edited on their behalf.
  const allRows = [...mandatoryResult.rows, ...goodToHaveResult.rows];
  const summaryText = String(raw.screeningSummary || '').trim() || 'No summary was produced.';
  const contradictions = findSummaryContradictions(summaryText, allRows);
  for (const c of contradictions) {
    console.warn(`[Screening] Summary contradicts the evidence for "${c.skill}" ` +
      `(scored NONE): "${c.sentence}"`);
  }

  const analysis = {
    // Skill names, kept flat because generate-l1-questions and Stage 4's audit prompt
    // already read these keys.
    mandatorySkills: mandatory.map(m => m.skill),
    goodToHaveSkills: goodToHave.map(g => g.skill),
    keySkills,

    mandatorySkillsMatch: mandatoryResult.rows,
    additionalSkillsMatch: goodToHaveResult.rows,

    screeningSummary: summaryText,
    experienceMatch: String(raw.experienceMatch || '').trim() || 'Experience comparison was not reported.',

    // Derived from the tiers, so this line can never disagree with the skill rows no
    // matter what the model's prose says. The UI leads with it.
    coverageSummary: coverageSentence(breakdown),
    // Sentences of screeningSummary that assert a skill scored NONE. Empty on a
    // consistent run; the UI warns when it is not.
    summaryContradictions: contradictions,

    matchScore,
    status,
    scoreBreakdown: breakdown,
    skillsProvenance: provenance,

    reconciliation: {
      mandatoryMissing: mandatoryResult.missing,
      mandatoryExtra: mandatoryResult.extra,
      goodToHaveMissing: goodToHaveResult.missing,
      goodToHaveExtra: goodToHaveResult.extra,
    },

    // Provenance, matching L1/L2's scoring_meta. Stage 1 previously stored none, so two
    // divergent runs of the same record could not be told apart — sampling noise was
    // indistinguishable from a model re-pull.
    scoring_meta: {
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
      // A run whose warm-up FAILED may not be reproducible — worth knowing when two
      // supposedly identical screenings disagree. See llmClient._ensureWarm.
      warmed_up: llmResult.warmedUp,
      warmup_note: llmResult.warmupNote,
      jd_chars: jd.length,
      jd_chars_scored: Math.min(jd.length, MAX_JD_CHARS),
      jd_chars_dropped: Math.max(0, jd.length - MAX_JD_CHARS),
      resume_chars: resume.length,
      resume_chars_scored: Math.min(resume.length, MAX_RESUME_CHARS),
      // Persisted because a skill in the dropped tail reads as "Not found in resume",
      // which lowers the score for a reason unrelated to the candidate.
      resume_chars_dropped: Math.max(0, resume.length - MAX_RESUME_CHARS),
      scoring_method: 'skill-match-tier',
      rubric_version: 'screening-v2-tiered',
    },

    screenedAt: new Date().toISOString(),
  };

  return { success: true, analysis };
}

/** Keep at most this many prior screenings, so a re-run record cannot grow unbounded. */
const HISTORY_LIMIT = 5;

/**
 * Append the screening being replaced to the record's history.
 *
 * A plain $set overwrote the prior analysis, which destroyed the one artefact that makes
 * "the score changed between runs" checkable after the fact — the score being complained
 * about. Both writers (routes/pipeline.js on re-screen, scripts/rescore.js --write) call
 * this, so neither can be the path that silently loses it.
 *
 * @param {object|null} existingStage1 - the stage1 sub-document currently stored
 * @returns {Array<object>} the new bounded history array
 */
function appendScreeningHistory(existingStage1) {
  const history = Array.isArray(existingStage1?.history) ? [...existingStage1.history] : [];
  const prior = existingStage1?.analysis;
  if (prior) {
    // Scores and provenance only — the evidence rows are large and the diff that matters
    // is the number, its derivation, and which model produced it.
    history.push({
      screenedAt: prior.screenedAt || existingStage1.completedAt || null,
      matchScore: prior.matchScore ?? null,
      status: prior.status ?? null,
      formula: prior.scoreBreakdown?.formula ?? null,
      scoring_meta: prior.scoring_meta ?? null,
    });
  }
  return history.slice(-HISTORY_LIMIT);
}

module.exports = {
  runScreening,
  resolveSkills,
  cleanSkillList,
  appendScreeningHistory,
  HISTORY_LIMIT,
  // Exported for scripts/test_context_budget.js, which builds a worst-case prompt and
  // asserts it fits the window — a measured reserve needs a test that re-measures it.
  _buildScreeningPrompt,
  SCREENING_SYSTEM_PROMPT,
  MAX_RESUME_CHARS,
  MAX_JD_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_SKILLS_PER_BUCKET,
  PROMPT_RESERVE_CHARS,
  SCORING_SEED,
  SOURCE_JD,
  SOURCE_AI,
};
