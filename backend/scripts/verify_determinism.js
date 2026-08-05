/**
 * Live determinism check for screening, L1 and L2. Reads MongoDB and calls the real
 * model; writes nothing.
 *
 *   node scripts/verify_determinism.js                  # all stages, cold + warm
 *   node scripts/verify_determinism.js --stage l2
 *   node scripts/verify_determinism.js --stage screening
 *   node scripts/verify_determinism.js --runs 3         # extra warm repeats
 *
 * Replaces _verify_l2_determinism.js, which asserted on the pre-v5 warning keys
 * (snapped_to_grid) that the evidence-tier rubric removed.
 *
 * The COLD case is the point of this script. Seed + temperature 0 are not enough on
 * their own: the first generation after a model load diverges from every later one,
 * which moved a real L2 record between 8.0 and 9.0 depending only on whether the
 * model happened to be loaded. llmClient warms the model before every seeded call to
 * remove that; this verifies the guarantee end to end, against the real host,
 * because it cannot be tested offline.
 *
 * Screening is verified here because run-to-run drift in the Stage 1 match score is
 * what the user reported, and it is the stage with the most to prove: it makes TWO
 * seeded calls (skill extraction, then evidence), and the first decides the score's
 * denominator. A stable total with an unstable skill list is not determinism, so the
 * fingerprint below covers the skill list as well as the tiers.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { runScreening } = require('../src/services/screeningService');
const { runL1Evaluation } = require('../src/services/l1ScoringService');
const { runL2Evaluation, L2_DIMENSIONS } = require('../src/services/l2ScoringService');
const { L1_DIMENSIONS } = require('../src/services/l1ScoringService');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ONLY = arg('stage');
const WARM_RUNS = parseInt(arg('runs', '2'), 10);

// A typo'd --stage used to run nothing and exit 0 — a determinism check that verifies
// nothing must not report success.
if (ONLY && !['screening', 'l1', 'l2'].includes(ONLY)) {
  console.error(`Unknown --stage "${ONLY}" — expected screening, l1 or l2.`);
  process.exit(1);
}

const BASE = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
const MODEL = process.env.OLLAMA_MODEL_NAME || 'qwen3:latest';

/** Evict the model so the next call is a genuine cold start. */
async function unloadModel() {
  await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: '', keep_alive: 0 }),
  });
  // Eviction is not synchronous with the response; without this pause /api/ps can
  // still report the model resident and the "cold" run is not actually cold.
  await new Promise(r => setTimeout(r, 4000));
}

const fingerprint = (ev) => JSON.stringify(ev.categories);
const summarise = (ev) => Object.entries(ev.categories)
  .map(([k, v]) => `${k.slice(0, 6)}=${v}`).join(' ');

/** Screening rows, both buckets, in the order they were scored. */
const screeningRows = (a) => [...(a.mandatorySkillsMatch || []), ...(a.additionalSkillsMatch || [])];

// Covers the SKILL NAMES, not only the tiers. Stage 1's largest drift source was the
// skill list changing between runs — that changes matched/total's denominator, so two
// runs could agree on every tier and still disagree on the score.
const screeningFingerprint = (a) =>
  JSON.stringify(screeningRows(a).map(r => [r.skill, r.tier]));
const screeningSummarise = (a) =>
  screeningRows(a).map(r => `${r.skill.slice(0, 10)}=${r.tier[0]}`).join(' ');

let failures = 0;
function assert(label, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
}

/**
 * Run a stage cold, warm N times, then cold again, and assert every run agrees.
 *
 * Parameterised over how a stage names its result, its total, and its fingerprint, so
 * screening's skill rows and L1/L2's dimension grid share one harness. `checks` holds
 * the assertions that are specific to one stage's output shape.
 */
async function verifyStage({
  label, run, base,
  result = (r) => r.evaluation,
  total = (ev) => ev.score,
  print = fingerprint,
  show = summarise,
  unit = 'per-dimension scores',
  checks = () => {},
}) {
  console.log(`\n═══ ${label} ═══`);
  const results = [];

  const once = async (tag) => {
    const ev = result(await run(base));
    results.push({ label: tag, ev });
    console.log(`  ${tag.padEnd(6)} total=${total(ev)} outTok=${ev.scoring_meta.output_tokens} ` +
      `warmed=${ev.scoring_meta.warmed_up} (${ev.scoring_meta.warmup_note})`);
    console.log(`         ${show(ev)}`);
    return ev;
  };

  // Cold first: this is the case that used to disagree.
  await unloadModel();
  const cold = await once('cold');

  for (let i = 1; i <= WARM_RUNS; i++) await once(`warm${i}`);

  // A second cold run: proves the cold result is itself repeatable, not merely
  // equal to the warm one by luck on a single sample.
  await unloadModel();
  await once('cold2');

  const prints = new Set(results.map(r => print(r.ev)));
  const totals = results.map(r => total(r.ev)).filter(t => typeof t === 'number');
  const spread = totals.length ? (Math.max(...totals) - Math.min(...totals)).toFixed(1) : 'n/a';
  assert(`identical ${unit} across cold and warm ` +
    `(totals=[${results.map(r => total(r.ev)).join(', ')}] spread=${spread})`,
    prints.size === 1);
  if (prints.size > 1) {
    for (const r of results) console.log(`     ${r.label.padEnd(6)} ${print(r.ev)}`);
  }

  checks(cold, results);
  return cold;
}

/** L1/L2: the evidence-tier rubric's own guarantees. */
function evaluationChecks(dimensions) {
  return (cold) => {
    assert('every score lands on its dimension grid',
      Object.entries(cold.categories).every(([d, v]) => dimensions[d].steps.includes(v)));
    assert('every dimension score is backed by the evidence it was derived from',
      Object.entries(cold.categories).every(([d, v]) =>
        v === 0 || (cold.evidence?.[d] || []).length > 0));
    assert(`rubric_version recorded (${cold.scoring_meta.rubric_version})`,
      String(cold.scoring_meta.rubric_version || '').includes('evidence-tier'));
  };
}

(async () => {
  if (!BASE) {
    console.error('OLLAMA_BASE_URL is not set — nothing to verify against.');
    process.exit(1);
  }

  // --stage screening only needs the two uploaded documents, so it must not require a
  // fully interviewed candidate; demanding stage3 would make Stage 1 unverifiable on any
  // pipeline that has not reached L2 yet.
  const needsTranscripts = ONLY !== 'screening';
  const query = needsTranscripts ? { 'stage3.completed': true } : { 'stage1.completed': true };

  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const doc = await client.db(process.env.MONGODB_DB || 'panel_db')
    .collection('pipeline_evaluations').findOne(query);
  await client.close();

  if (!doc) {
    console.error(`No record matching ${JSON.stringify(query)} — cannot verify against real input.`);
    process.exit(1);
  }

  const shared = {
    jobId: doc.jobId,
    candidateName: doc.candidateName,
    jd: doc.stage1?.jdText || '',
    resumeText: doc.stage1?.resumeText || '',
  };
  const l1Transcript = doc.stage2?.l1Transcript || doc.stage2?.transcript || '';
  const l2Transcript = doc.stage3?.l2Transcript || '';

  console.log(`Record: ${doc.jobId} / ${doc.candidateName}  l1=${l1Transcript.length} l2=${l2Transcript.length} chars`);
  console.log(`Model:  ${MODEL} @ ${BASE}`);

  if (!ONLY || ONLY === 'screening') {
    if (!shared.jd || !shared.resumeText) {
      console.error('\n═══ Screening ═══\n  ⚠️  SKIPPED — the record carries no ' +
        `${[!shared.jd && 'jdText', !shared.resumeText && 'resumeText'].filter(Boolean).join(' / ')}, ` +
        'and screening refuses to run without both.');
      failures++;
    } else {
      const cold = await verifyStage({
        label: 'Screening (Stage 1)',
        run: runScreening,
        base: { jobId: shared.jobId, candidateName: shared.candidateName, jdText: shared.jd, resumeText: shared.resumeText },
        result: (r) => r.analysis,
        total: (a) => a.matchScore,
        print: screeningFingerprint,
        show: screeningSummarise,
        unit: 'skill list and per-skill tiers',
        checks: (a) => {
          // The score must be reproducible BY HAND from the tiers shown next to it.
          // The model used to return the number itself, so it could contradict its own
          // checkmarks; recomputing the formula here is what proves it no longer can.
          const credit = (rows) => rows.reduce((s, r) => s + r.credit, 0);
          const mRows = a.mandatorySkillsMatch || [];
          const gRows = a.additionalSkillsMatch || [];
          const b = a.scoreBreakdown || {};
          const expected = Math.round(
            (mRows.length ? (credit(mRows) / mRows.length) * b.mandatory.weight : 0) +
            (gRows.length ? (credit(gRows) / gRows.length) * b.goodToHave.weight : 0));
          assert(`match score recomputes from the displayed tiers ` +
            `(${b.formula} -> ${expected}, stored ${a.matchScore})`,
            expected === a.matchScore);

          assert('every skill carries a tier and a credit',
            screeningRows(a).every(r =>
              ['STRONG', 'PARTIAL', 'NONE'].includes(r.tier) && typeof r.credit === 'number'));

          // A NONE row with no explanation is the "Not found in resume" that the old
          // silent-truncation path produced, and it is indistinguishable from a real gap.
          assert('every skill carries evidence explaining its tier',
            screeningRows(a).every(r => String(r.evidence || '').trim().length > 0));

          assert('no requested skill was silently dropped',
            (a.reconciliation?.mandatoryMissing?.length || 0) === 0 &&
            (a.reconciliation?.goodToHaveMissing?.length || 0) === 0);

          assert(`rubric_version recorded (${a.scoring_meta.rubric_version})`,
            String(a.scoring_meta.rubric_version || '').includes('screening-v2'));

          // The self-contradiction check. A NONE row for a skill the resume names verbatim
          // is exactly what produced "strong experience with Cypress" above a Cypress row
          // reading "Not found in resume" — the promotion in deriveTier should have caught
          // it, so any survivor here is a hole in that logic.
          const falseNegatives = screeningRows(a)
            .filter(r => r.tier === 'NONE' && r.audit?.skill_phrase_in_resume);
          assert('no skill scored NONE while named verbatim in the resume' +
            (falseNegatives.length ? ` — ${falseNegatives.map(r => r.skill).join(', ')}` : ''),
            falseNegatives.length === 0);

          // The summary is model prose written in the same response as the tiers. It has
          // no bearing on the score, so a conflict is a warning rather than a failure —
          // but it is the thing a reader sees first, so it must not pass unremarked.
          const conflicts = a.summaryContradictions || [];
          if (conflicts.length) {
            console.log(`  ⚠️  summary contradicts the evidence for ` +
              `${conflicts.map(c => c.skill).join(', ')} — prose claims a skill scored NONE`);
          }

          assert('a derived coverage line is stored',
            String(a.coverageSummary || '').trim().length > 0);

          // Promotions are deterministic string operations, so a cold/warm mismatch in the
          // count would mean the underlying tiers moved — already caught by the
          // fingerprint, but reported so the log explains WHY a score differs from a
          // stored one that predates this check.
          const promoted = screeningRows(a).filter(r => r.audit?.promoted);
          if (promoted.length) {
            console.log(`  ⚠️  ${promoted.length} model false negative(s) corrected upward: ` +
              promoted.map(r => r.skill).join(', '));
          }

          // Truncation is silent in the output but changes it: a skill in the dropped
          // tail reads as absent. Surfaced as a warning, not a failure — a long resume
          // is legitimate, an unrecorded truncation is not.
          const m = a.scoring_meta;
          if (m.resume_chars_dropped > 0) {
            console.log(`  ⚠️  ${m.resume_chars_dropped} resume chars dropped at the cap — ` +
              'skills in the tail read as absent. Raise OLLAMA_NUM_CTX.');
          }
          const p = a.skillsProvenance || {};
          console.log(`  skills: mandatory=${p.mandatorySource} good-to-have=${p.goodToHaveSource}` +
            (p.mandatoryInferred ? '  ⚠️  mandatory skills are AI-INFERRED, not JD-stated' : ''));
        },
      });

      // The determinism claim above is worthless if the skill list itself is unstable,
      // so confirm the extraction call — a separate seeded LLM call — is what pinned it.
      console.log(`  skill list (${cold.mandatorySkills.length} mandatory, ` +
        `${cold.goodToHaveSkills.length} good-to-have): ${cold.mandatorySkills.join(', ')}`);
    }
  }

  if (!ONLY || ONLY === 'l1') {
    await verifyStage({
      label: 'L1',
      run: runL1Evaluation,
      base: { ...shared, transcript: l1Transcript },
      checks: evaluationChecks(L1_DIMENSIONS),
    });
  }

  let l2Cold;
  if (!ONLY || ONLY === 'l2') {
    l2Cold = await verifyStage({
      label: 'L2',
      run: runL2Evaluation,
      base: { ...shared, l1Transcript, l2Transcript },
      checks: evaluationChecks(L2_DIMENSIONS),
    });

    // The candidate's verdict is recorded for reporting but deliberately kept out of
    // the scoring prompt: including it dragged an identical transcript's panel score
    // down ~0.4 pts when the candidate was rejected.
    console.log('\n═══ L2: candidate verdict must not leak into the panel score ═══');
    const rejected = (await runL2Evaluation({ ...shared, l1Transcript, l2Transcript, candidateStatus: 'Rejected' })).evaluation;
    const selected = (await runL2Evaluation({ ...shared, l1Transcript, l2Transcript, candidateStatus: 'Selected' })).evaluation;
    console.log(`  Rejected=${rejected.score}  Selected=${selected.score}  delta=${(selected.score - rejected.score).toFixed(2)}`);
    assert('panel score independent of candidate verdict', fingerprint(rejected) === fingerprint(selected));
    assert('candidate_status still recorded for reporting',
      rejected.candidate_status === 'Rejected' && selected.candidate_status === 'Selected');

    // Handoff cannot be observed without L1, so it is capped rather than inflated.
    console.log('\n═══ L2: missing L1 context is capped and flagged ═══');
    const noL1 = (await runL2Evaluation({ ...shared, l1Transcript: '', l2Transcript })).evaluation;
    const dim = 'Resume Screening & Handoff';
    console.log(`  with L1: ${l2Cold.categories[dim]}   without L1: ${noL1.categories[dim]}   ` +
      `total ${l2Cold.score} -> ${noL1.score}`);
    console.log(`  capped: ${JSON.stringify(noL1.scoring_warnings.capped_dimensions)}`);
    assert('handoff capped at 1.0 without L1', noL1.categories[dim] <= 1.0);
    assert('l1_context_available recorded false', noL1.scoring_meta.l1_context_available === false);
    assert('no-L1 total does not exceed the with-L1 total', noL1.score <= l2Cold.score);
  }

  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
