/**
 * Re-score one stored evaluation (L1 or L2) and diff it against the score on record.
 *
 * Read-only by default: it prints the comparison and writes nothing, so a rubric
 * change can be measured before deciding whether to persist it. Pass --write to
 * store the new evaluation.
 *
 *   node scripts/rescore.js --job jd1005 --candidate Mathews
 *   node scripts/rescore.js --job jd1005 --candidate Mathews --audit
 *   node scripts/rescore.js --job jd1005 --candidate Mathews --stage l2 --write
 *
 * Matching is case-insensitive and anchored, because candidate names in the
 * collection carry inconsistent casing ("mathew" vs "Mathews").
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { runL1Evaluation } = require('../src/services/l1ScoringService');
const { runL2Evaluation } = require('../src/services/l2ScoringService');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const JOB_ID = arg('job');
const CANDIDATE = arg('candidate');
const STAGE = String(arg('stage', 'l1')).toLowerCase();
const WRITE = process.argv.includes('--write');
const AUDIT = process.argv.includes('--audit');

if (!JOB_ID || !CANDIDATE) {
  console.error('Usage: node scripts/rescore.js --job <jobId> --candidate <name> [--stage l1|l2] [--audit] [--write]');
  process.exit(1);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Per-stage wiring. Kept as data so the diff and audit reporting below is written
 * once: L1 and L2 now share a rubric, so they should share the harness that
 * measures it.
 */
const STAGES = {
  l1: {
    label: 'L1',
    storedAt: 'stage2.evaluation',
    // Transcript field names drifted across pipeline versions, so read whichever
    // key this record happens to carry.
    read: (doc) => ({
      transcript: doc.stage2?.transcript || doc.stage2?.l1Transcript || '',
      old: doc.stage2?.evaluation || {},
    }),
    run: (doc, { jd, resumeText, transcript }) => runL1Evaluation({
      jobId: doc.jobId, candidateName: doc.candidateName, jd, resumeText, transcript,
    }),
  },
  l2: {
    label: 'L2',
    storedAt: 'stage3.evaluation',
    read: (doc) => ({
      transcript: doc.stage3?.l2Transcript || doc.stage3?.transcript || '',
      old: doc.stage3?.evaluation || {},
      // L2 scores "Resume Screening & Handoff" against the L1 round and caps that
      // dimension when L1 is absent, so its presence changes the scoring regime and
      // is reported explicitly rather than left to be inferred from the score.
      l1Transcript: doc.stage2?.l1Transcript || doc.stage2?.transcript || '',
    }),
    run: (doc, { jd, resumeText, transcript, l1Transcript }) => runL2Evaluation({
      jobId: doc.jobId, candidateName: doc.candidateName, jd, resumeText,
      l1Transcript, l2Transcript: transcript,
      // Recorded on the result for reporting; never fed to the scoring prompt.
      candidateStatus: doc.stage3?.evaluation?.candidate_status || 'Selected',
    }),
  },
};

const cfg = STAGES[STAGE];
if (!cfg) {
  console.error(`Unknown --stage "${STAGE}" — expected l1 or l2.`);
  process.exit(1);
}

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

  const { transcript, old, l1Transcript = '' } = cfg.read(doc);
  if (!transcript) {
    console.error(`Record has no ${cfg.label} transcript — nothing to re-score.`);
    await client.close();
    process.exit(1);
  }

  const jd = doc.stage1?.jdText || doc.jdText || doc.stage2?.jdText || '';
  const resumeText = doc.stage1?.resumeText || '';

  console.log(`\n${cfg.label} record: jobId="${doc.jobId}" candidate="${doc.candidateName}"`);
  console.log(`  transcript=${transcript.length} chars  jd=${jd.length} chars  resume=${resumeText.length} chars`);
  if (STAGE === 'l2') {
    console.log(`  L1 context=${l1Transcript.length} chars` +
      (l1Transcript ? '' : '  ⚠️  absent — handoff dimension will be capped'));
  }
  console.log(`  stored rubric_version=${old.scoring_meta?.rubric_version || '(none)'}`);
  if (!jd) console.warn('  ⚠️  No JD text on this record — JD-relative dimensions will score low regardless of the panel.');

  console.log('\nRe-scoring...');
  const startedAt = Date.now();
  // The run* functions return { success, evaluation, moderation } — the score object
  // is nested under .evaluation, matching how it is persisted.
  const result = await cfg.run(doc, { jd, resumeText, transcript, l1Transcript });
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

  if (AUDIT) {
    console.log('\n=== EVIDENCE AUDIT (how each score was derived) ===');
    for (const [dim, a] of Object.entries(fresh.evidence_audit || {})) {
      console.log(`\n${dim}: ${a.derived_score} (tier ${a.tier_index}/4, scored on ${a.scored_on}=${a.units})`);
      if (a.capped_to !== undefined) console.log(`  CAPPED to ${a.capped_to}: ${a.cap_reason}`);
      if (a.top_tier_denial_reason) console.log(`  full marks withheld: ${a.top_tier_denial_reason}`);
      console.log(`  topics(${a.distinct_topics}): ${a.topics.join(' | ') || '(none)'}`);
      console.log(`  depth-probing subjects=${a.depth_probing_topics} chains=${a.follow_up_chains} ` +
        `quotes=${a.quotes} untagged=${a.untagged_quotes}`);
      for (const it of fresh.evidence_detail?.[dim] || []) {
        console.log(`    (${it.topic || 'UNTAGGED'}) ${it.quote.slice(0, 90)}`);
      }
    }
  }

  const m = fresh.scoring_meta || {};
  console.log(`\nNew rubric_version: ${m.rubric_version}`);
  console.log(`Normalisation: ${m.transcript_breaks_inserted} turn boundaries inserted`);
  console.log(`Speakers: ${(m.transcript_speakers || []).join(', ') || '(none detected)'}`);
  console.log(`Question turns by speaker: ${JSON.stringify(m.question_turns_by_speaker || {})}`);
  // L1 and L2 name this field differently, since L2 tracks two transcripts.
  console.log(`Chars dropped at cap: ${m.transcript_chars_dropped ?? m.l2_transcript_chars_dropped}`);

  const w = fresh.scoring_warnings || {};
  if (w.dimensions_without_evidence?.length) console.log(`No evidence: ${w.dimensions_without_evidence.join(', ')}`);
  if (w.capped_dimensions?.length)            console.log(`Capped: ${w.capped_dimensions.join(', ')}`);
  if (w.untagged_evidence?.length)            console.log(`Untagged evidence: ${w.untagged_evidence.join('; ')}`);
  if (w.full_marks_denied?.length)            console.log(`Full marks withheld:\n  ${w.full_marks_denied.join('\n  ')}`);

  console.log(`\n--- NEW SUMMARY ---\n${fresh.panel_summary || fresh.summary || '(none)'}`);

  if (WRITE) {
    await col.updateOne({ _id: doc._id }, { $set: { [cfg.storedAt]: fresh } });
    console.log(`\n✅ Written to ${cfg.storedAt}.`);
  } else {
    console.log('\n(dry run — nothing written; pass --write to persist)');
  }

  await client.close();
})().catch(e => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
