/**
 * Re-score one stored L1 evaluation and diff it against the score on record.
 *
 * Read-only by default: it prints the comparison and writes nothing, so a rubric
 * change can be measured before deciding whether to persist it. Pass --write to
 * store the new evaluation.
 *
 *   node scripts/rescore_l1.js --job jd1005 --candidate Mathews
 *   node scripts/rescore_l1.js --job jd1005 --candidate Mathews --write
 *
 * Matching is case-insensitive and anchored, because candidate names in the
 * collection carry inconsistent casing ("mathew" vs "Mathews").
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { runL1Evaluation } = require('../src/services/l1ScoringService');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const JOB_ID = arg('job');
const CANDIDATE = arg('candidate');
const WRITE = process.argv.includes('--write');

if (!JOB_ID || !CANDIDATE) {
  console.error('Usage: node scripts/rescore_l1.js --job <jobId> --candidate <name> [--write]');
  process.exit(1);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const col = client.db(process.env.MONGODB_DB || 'panel_db').collection('pipeline_evaluations');

  const doc = await col.findOne({
    jobId: new RegExp(`^${esc(JOB_ID)}$`, 'i'),
    candidateName: new RegExp(`^${esc(CANDIDATE)}$`, 'i'),
  });

  if (!doc) {
    console.error(`No record for jobId="${JOB_ID}" candidate="${CANDIDATE}".`);
    await client.close();
    process.exit(1);
  }

  const s2 = doc.stage2 || {};
  const transcript = s2.transcript || s2.l1Transcript || '';
  if (!transcript) {
    console.error('Record has no stage2 transcript — nothing to re-score.');
    await client.close();
    process.exit(1);
  }

  const old = s2.evaluation || {};
  const jd = doc.stage1?.jdText || doc.jdText || s2.jdText || '';
  const resumeText = doc.stage1?.resumeText || '';

  console.log(`\nRecord: jobId="${doc.jobId}" candidate="${doc.candidateName}"`);
  console.log(`  transcript=${transcript.length} chars  jd=${jd.length} chars  resume=${resumeText.length} chars`);
  console.log(`  stored rubric_version=${old.scoring_meta?.rubric_version || '(none)'}`);
  if (!jd) console.warn('  ⚠️  No JD text on this record — JD-relative dimensions will score low regardless of the panel.');

  console.log('\nRe-scoring...');
  const startedAt = Date.now();
  // runL1Evaluation returns { success, evaluation, moderation } — the score object
  // is nested under .evaluation, matching how it is persisted.
  const result = await runL1Evaluation({
    jobId: doc.jobId, candidateName: doc.candidateName, jd, resumeText, transcript,
  });
  const fresh = result.evaluation;
  console.log(`Done in ${Math.round((Date.now() - startedAt) / 1000)}s\n`);

  const dims = new Set([
    ...Object.keys(old.categories || {}),
    ...Object.keys(fresh.categories || {}),
  ]);

  console.log('Dimension'.padEnd(34) + 'OLD'.padStart(7) + 'NEW'.padStart(7) + '   Δ    evidence');
  console.log('-'.repeat(80));
  for (const d of dims) {
    const o = old.categories?.[d];
    const n = fresh.categories?.[d];
    const delta = (typeof o === 'number' && typeof n === 'number')
      ? (n - o > 0 ? `+${(n - o).toFixed(1)}` : (n - o).toFixed(1))
      : '?';
    const ev = (fresh.evidence?.[d] || []).length;
    const evOld = (old.evidence?.[d] || []).length;
    console.log(d.padEnd(34) + String(o ?? '-').padStart(7) + String(n ?? '-').padStart(7) +
      delta.padStart(6) + `    ${evOld} -> ${ev} quote(s)`);
  }
  console.log('-'.repeat(80));
  const dTotal = (typeof old.score === 'number' && typeof fresh.score === 'number')
    ? (fresh.score - old.score > 0 ? `+${(fresh.score - old.score).toFixed(1)}` : (fresh.score - old.score).toFixed(1))
    : '?';
  console.log('TOTAL'.padEnd(34) + String(old.score ?? '-').padStart(7) +
    String(fresh.score ?? '-').padStart(7) + dTotal.padStart(6));
  console.log('CATEGORY'.padEnd(34) + String(old.score_category ?? '-').padStart(7) +
    String(fresh.score_category ?? '-').padStart(7));

  const m = fresh.scoring_meta || {};
  console.log(`\nNormalisation: ${m.transcript_breaks_inserted} turn boundaries inserted`);
  console.log(`Speakers: ${(m.transcript_speakers || []).join(', ') || '(none detected)'}`);
  console.log(`Question turns by speaker: ${JSON.stringify(m.question_turns_by_speaker || {})}`);
  console.log(`Chars dropped at cap: ${m.transcript_chars_dropped}`);
  const thin = fresh.scoring_warnings?.thin_evidence || [];
  if (thin.length) console.log(`Thin evidence: ${thin.join('; ')}`);

  console.log(`\n--- NEW SUMMARY ---\n${fresh.panel_summary || fresh.summary || '(none)'}`);

  if (WRITE) {
    await col.updateOne({ _id: doc._id }, { $set: { 'stage2.evaluation': fresh } });
    console.log('\n✅ Written to stage2.evaluation.');
  } else {
    console.log('\n(dry run — nothing written; pass --write to persist)');
  }

  await client.close();
})().catch(e => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
