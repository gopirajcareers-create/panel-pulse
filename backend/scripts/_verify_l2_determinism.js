/**
 * Verification (temporary): run the REAL runL2Evaluation N times on the real
 * stored record and confirm identical scores. Reads MongoDB; writes nothing.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { runL2Evaluation, L2_DIMENSIONS } = require('../src/services/l2ScoringService');

const N = parseInt(process.argv[2] || '3', 10);

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'panel_db');
  const doc = await db.collection('pipeline_evaluations').findOne({ 'stage3.completed': true });
  await client.close();

  const base = {
    jobId: doc.jobId,
    candidateName: doc.candidateName,
    jd: doc.stage1?.jdText || 'General Software Engineering Job Description',
    resumeText: doc.stage1?.resumeText || '',
    l1Transcript: doc.stage2?.l1Transcript || '',
    l2Transcript: doc.stage3?.l2Transcript || '',
  };

  console.log(`\n─── TEST 1: determinism (${N} identical runs, status=Rejected) ───`);
  const totals = [];
  for (let i = 0; i < N; i++) {
    const r = await runL2Evaluation({ ...base, candidateStatus: 'Rejected' });
    const ev = r.evaluation;
    totals.push(ev.score);
    console.log(`  run ${i + 1}: score=${ev.score} cat=${ev.score_category} model=${ev.scoring_meta.model} ` +
      `seed=${ev.scoring_meta.seed} temp=${ev.scoring_meta.temperature} l1ctx=${ev.scoring_meta.l1_context_available}`);
    console.log(`     ${Object.entries(ev.categories).map(([k, v]) => `${k.split(' ')[0].slice(0, 5)}=${v}`).join(' ')}`);
    if (ev.scoring_warnings?.snapped_to_grid?.length) console.log(`     snapped: ${ev.scoring_warnings.snapped_to_grid.join(', ')}`);
  }
  const unique = [...new Set(totals)];
  console.log(`  => ${unique.length === 1 ? '✅ DETERMINISTIC' : '❌ STILL VARYING'}: values=[${totals.join(', ')}] spread=${(Math.max(...totals) - Math.min(...totals)).toFixed(1)}`);

  console.log(`\n─── TEST 2: reject-status contamination (Rejected vs Selected) ───`);
  const a = (await runL2Evaluation({ ...base, candidateStatus: 'Rejected' })).evaluation;
  const b = (await runL2Evaluation({ ...base, candidateStatus: 'Selected' })).evaluation;
  console.log(`  Rejected: ${a.score}   Selected: ${b.score}   delta=${(b.score - a.score).toFixed(2)}`);
  console.log(`  => ${a.score === b.score ? '✅ NO CONTAMINATION (panel score independent of candidate verdict)' : '❌ still biased'}`);
  console.log(`  candidate_status still recorded for reporting: Rejected="${a.candidate_status}" Selected="${b.candidate_status}"`);

  console.log(`\n─── TEST 3: grid compliance ───`);
  let allOnGrid = true;
  for (const [dim, cfg] of Object.entries(L2_DIMENSIONS)) {
    const v = a.categories[dim];
    const ok = cfg.steps.includes(v);
    if (!ok) allOnGrid = false;
    console.log(`  ${dim.padEnd(28)} = ${String(v).padEnd(5)} allowed=[${cfg.steps.join(',')}] ${ok ? '✓' : '✗ OFF-GRID'}`);
  }
  console.log(`  => ${allOnGrid ? '✅ ALL ON GRID' : '❌ off-grid values remain'}`);

  console.log(`\n─── TEST 4: missing L1 context is capped + flagged ───`);
  const noL1 = (await runL2Evaluation({ ...base, l1Transcript: '', candidateStatus: 'Rejected' })).evaluation;
  console.log(`  with L1:    total=${a.score}  handoff=${a.categories['Resume Screening & Handoff']}`);
  console.log(`  without L1: total=${noL1.score}  handoff=${noL1.categories['Resume Screening & Handoff']}  l1ctx_flag=${noL1.scoring_meta.l1_context_available}`);
  console.log(`  capped: ${JSON.stringify(noL1.scoring_warnings.capped_dimensions)}`);
  const handoffOk = noL1.categories['Resume Screening & Handoff'] <= 1.0;
  console.log(`  => handoff capped at 1.0: ${handoffOk ? '✅' : '❌'} ; inflation now ${(noL1.score - a.score).toFixed(1)} pts (was +1.2)`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
