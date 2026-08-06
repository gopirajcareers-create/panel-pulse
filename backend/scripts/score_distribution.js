/**
 * Report the L1/L2 score distribution across every stored evaluation, re-derived
 * under the CURRENT rubric.
 *
 *   node scripts/score_distribution.js
 *   node scripts/score_distribution.js --stage l2
 *   node scripts/score_distribution.js --top 10      (list the highest scorers)
 *
 * Read-only: nothing is written.
 *
 * Why this exists separately from rescore.js: rescore.js re-runs the MODEL for one
 * candidate, which is the right tool for "did the evidence change?" but far too slow
 * to answer "how often does the rubric hand out full marks?" — the question that
 * actually catches a miscalibration. Because scores are derived from stored evidence
 * in code, re-deriving needs no LLM call at all, so the whole collection can be
 * measured in one pass.
 *
 * The stored score is compared against the freshly derived one, so a rubric change
 * shows up as a per-record delta AND as a movement in how many records sit at the
 * ceiling. A rubric where most panels score full marks is not measuring anything.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { scoreFromEvidence, coerceEvidenceItems } = require('../src/services/evidenceTierScoring');
const { L1_DIMENSIONS } = require('../src/services/l1ScoringService');
const { L2_DIMENSIONS, HANDOFF_DIMENSION, HANDOFF_CAP_WITHOUT_L1 } = require('../src/services/l2ScoringService');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const STAGE = String(arg('stage', 'l1')).toLowerCase();
const TOP = parseInt(arg('top', '0'), 10);

const STAGES = {
  l1: { label: 'L1', dims: L1_DIMENSIONS, at: 'stage2', max: 10.0 },
  l2: { label: 'L2', dims: L2_DIMENSIONS, at: 'stage3', max: 10.0 },
};
const cfg = STAGES[STAGE];
if (!cfg) {
  console.error(`Unknown --stage "${STAGE}" — expected l1 or l2.`);
  process.exit(1);
}

/** Re-derive a stored evaluation's score from the evidence it already carries. */
function rederive(evaluation, hasL1) {
  const evidenceDetail = {};
  for (const dim of Object.keys(cfg.dims)) {
    evidenceDetail[dim] = coerceEvidenceItems(
      evaluation.evidence_detail?.[dim] ?? evaluation.evidence?.[dim]
    );
  }
  const { scores, audit } = scoreFromEvidence({ dimensions: cfg.dims, evidenceDetail });

  // L2 caps the handoff dimension when no L1 round exists — mirror it here or the
  // distribution would report scores the pipeline would never actually produce.
  if (STAGE === 'l2' && !hasL1 && scores[HANDOFF_DIMENSION] > HANDOFF_CAP_WITHOUT_L1) {
    scores[HANDOFF_DIMENSION] = HANDOFF_CAP_WITHOUT_L1;
  }

  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  return { total: Math.round(total * 10) / 10, scores, audit };
}

/** ASCII histogram over 0..10 in 1-point buckets. */
function histogram(values, label) {
  console.log(`\n${label} (n=${values.length})`);
  if (!values.length) return;
  const buckets = Array.from({ length: 11 }, () => 0);
  for (const v of values) buckets[Math.min(10, Math.max(0, Math.floor(v)))]++;
  const widest = Math.max(...buckets);
  buckets.forEach((n, i) => {
    const range = i === 10 ? '10.0' : `${i}–${i + 1}`;
    const bar = '█'.repeat(widest ? Math.round((n / widest) * 44) : 0);
    console.log(`  ${range.padStart(5)} │ ${bar}${bar ? ' ' : ''}${n || ''}`);
  });
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const perfect = values.filter(v => v >= 10).length;
  const nearPerfect = values.filter(v => v >= 9).length;
  console.log(`  mean=${mean.toFixed(2)}  median=${median.toFixed(1)}  ` +
    `min=${sorted[0].toFixed(1)}  max=${sorted[sorted.length - 1].toFixed(1)}`);
  console.log(`  10.0/10: ${perfect} (${Math.round((perfect / values.length) * 100)}%)   ` +
    `>=9.0: ${nearPerfect} (${Math.round((nearPerfect / values.length) * 100)}%)`);
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const col = client.db(process.env.MONGODB_DB || 'panel_db').collection('pipeline_evaluations');

  const docs = await col.find({ [`${cfg.at}.evaluation`]: { $exists: true } }).toArray();
  console.log(`\n${cfg.label}: ${docs.length} stored evaluation(s)`);

  const stored = [];
  const fresh = [];
  const rows = [];
  let noEvidence = 0;

  for (const doc of docs) {
    const ev = doc[cfg.at]?.evaluation || {};
    // A record with no evidence at all cannot be re-derived — its stored score came
    // from a pre-tier rubric. Counted and excluded rather than shown as a 0.
    const hasEvidence = Object.keys(cfg.dims).some(d =>
      (ev.evidence_detail?.[d]?.length || ev.evidence?.[d]?.length));
    if (!hasEvidence) { noEvidence++; continue; }

    const hasL1 = Boolean(doc.stage2?.l1Transcript || doc.stage2?.transcript);
    const r = rederive(ev, hasL1);
    if (typeof ev.score === 'number') stored.push(ev.score);
    fresh.push(r.total);
    rows.push({
      job: doc.jobId, cand: doc.candidateName,
      old: typeof ev.score === 'number' ? ev.score : null,
      neu: r.total, scores: r.scores,
    });
  }

  if (noEvidence) {
    console.log(`(${noEvidence} record(s) carry no tagged evidence — scored under an ` +
      `earlier rubric and excluded from the re-derivation)`);
  }

  if (!rows.length) {
    console.log('\nNothing to measure.');
    await client.close();
    return;
  }

  histogram(stored, 'STORED scores (as recorded)');
  histogram(fresh, 'RE-DERIVED under the current rubric');

  const moved = rows.filter(r => r.old !== null && Math.abs(r.old - r.neu) >= 0.05);
  console.log(`\nRecords whose score moved: ${moved.length}/${rows.length}`);
  const drops = moved.filter(r => r.neu < r.old);
  if (drops.length) {
    const avg = drops.reduce((s, r) => s + (r.old - r.neu), 0) / drops.length;
    console.log(`  ${drops.length} dropped, average -${avg.toFixed(1)} point(s)`);
  }
  const rises = moved.filter(r => r.neu > r.old);
  if (rises.length) {
    const avg = rises.reduce((s, r) => s + (r.neu - r.old), 0) / rises.length;
    console.log(`  ${rises.length} rose, average +${avg.toFixed(1)} point(s)`);
  }

  if (TOP > 0) {
    console.log(`\nHighest ${TOP} under the current rubric:`);
    console.log('  ' + 'Job'.padEnd(12) + 'Candidate'.padEnd(24) + 'OLD'.padStart(6) + 'NEW'.padStart(6));
    for (const r of [...rows].sort((a, b) => b.neu - a.neu).slice(0, TOP)) {
      console.log('  ' + String(r.job).slice(0, 11).padEnd(12) +
        String(r.cand).slice(0, 23).padEnd(24) +
        String(r.old ?? '-').padStart(6) + String(r.neu).padStart(6));
    }
  }

  // Which dimension hands out full marks most often: the one to look at first if the
  // ceiling still feels too crowded.
  console.log('\nFull marks by dimension (how often each dimension maxes out):');
  for (const [dim, dcfg] of Object.entries(cfg.dims)) {
    const n = rows.filter(r => r.scores[dim] >= dcfg.max).length;
    const pct = Math.round((n / rows.length) * 100);
    console.log(`  ${dim.padEnd(30)} ${String(n).padStart(4)}/${rows.length} (${String(pct).padStart(3)}%) ` +
      '▇'.repeat(Math.round(pct / 4)));
  }

  await client.close();
})().catch(e => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
