/**
 * Live determinism check for L1 and L2. Reads MongoDB and calls the real model;
 * writes nothing.
 *
 *   node scripts/verify_determinism.js            # both stages, cold + warm
 *   node scripts/verify_determinism.js --stage l2
 *   node scripts/verify_determinism.js --runs 3   # extra warm repeats
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
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { runL1Evaluation } = require('../src/services/l1ScoringService');
const { runL2Evaluation, L2_DIMENSIONS } = require('../src/services/l2ScoringService');
const { L1_DIMENSIONS } = require('../src/services/l1ScoringService');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ONLY = arg('stage');
const WARM_RUNS = parseInt(arg('runs', '2'), 10);

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

let failures = 0;
function assert(label, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
}

async function verifyStage({ label, run, base, dimensions }) {
  console.log(`\n═══ ${label} ═══`);
  const results = [];

  // Cold first: this is the case that used to disagree.
  await unloadModel();
  const cold = (await run(base)).evaluation;
  results.push({ label: 'cold', ev: cold });
  console.log(`  cold   total=${cold.score} outTok=${cold.scoring_meta.output_tokens} ` +
    `warmed=${cold.scoring_meta.warmed_up} (${cold.scoring_meta.warmup_note})`);
  console.log(`         ${summarise(cold)}`);

  for (let i = 1; i <= WARM_RUNS; i++) {
    const ev = (await run(base)).evaluation;
    results.push({ label: `warm${i}`, ev });
    console.log(`  warm${i}  total=${ev.score} outTok=${ev.scoring_meta.output_tokens} ` +
      `warmed=${ev.scoring_meta.warmed_up} (${ev.scoring_meta.warmup_note})`);
    console.log(`         ${summarise(ev)}`);
  }

  // A second cold run: proves the cold result is itself repeatable, not merely
  // equal to the warm one by luck on a single sample.
  await unloadModel();
  const cold2 = (await run(base)).evaluation;
  results.push({ label: 'cold2', ev: cold2 });
  console.log(`  cold2  total=${cold2.score} outTok=${cold2.scoring_meta.output_tokens}`);
  console.log(`         ${summarise(cold2)}`);

  const prints = new Set(results.map(r => fingerprint(r.ev)));
  const totals = results.map(r => r.ev.score);
  assert(`identical per-dimension scores across cold and warm ` +
    `(totals=[${totals.join(', ')}] spread=${(Math.max(...totals) - Math.min(...totals)).toFixed(1)})`,
    prints.size === 1);
  if (prints.size > 1) {
    for (const r of results) console.log(`     ${r.label.padEnd(6)} ${fingerprint(r.ev)}`);
  }

  assert('every score lands on its dimension grid',
    Object.entries(cold.categories).every(([d, v]) => dimensions[d].steps.includes(v)));
  assert('every dimension score is backed by the evidence it was derived from',
    Object.entries(cold.categories).every(([d, v]) =>
      v === 0 || (cold.evidence?.[d] || []).length > 0));
  assert(`rubric_version recorded (${cold.scoring_meta.rubric_version})`,
    String(cold.scoring_meta.rubric_version || '').includes('evidence-tier'));

  return cold;
}

(async () => {
  if (!BASE) {
    console.error('OLLAMA_BASE_URL is not set — nothing to verify against.');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const doc = await client.db(process.env.MONGODB_DB || 'panel_db')
    .collection('pipeline_evaluations').findOne({ 'stage3.completed': true });
  await client.close();

  if (!doc) {
    console.error('No record with stage3.completed=true — cannot verify against real input.');
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

  if (!ONLY || ONLY === 'l1') {
    await verifyStage({
      label: 'L1',
      run: runL1Evaluation,
      base: { ...shared, transcript: l1Transcript },
      dimensions: L1_DIMENSIONS,
    });
  }

  let l2Cold;
  if (!ONLY || ONLY === 'l2') {
    l2Cold = await verifyStage({
      label: 'L2',
      run: runL2Evaluation,
      base: { ...shared, l1Transcript, l2Transcript },
      dimensions: L2_DIMENSIONS,
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
