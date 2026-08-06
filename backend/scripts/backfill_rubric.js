/**
 * Re-derive stored L1/L2 scores under the CURRENT rubric and write them back.
 *
 *   node scripts/backfill_rubric.js --stage l1              # dry run (default)
 *   node scripts/backfill_rubric.js --stage l1 --write
 *   node scripts/backfill_rubric.js --stage l2 --write
 *   node scripts/backfill_rubric.js --stage both --write
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * A rubric change re-calibrates scores from the moment it deploys, but every record
 * already in the collection keeps the number the OLD rubric gave it. The dashboard
 * then renders both in one column against one set of colour thresholds, so the same
 * panel quality shows up as 7.8 or 5.0 depending only on when it was submitted. That
 * reads as scoring instability, and it is really two rubrics sharing a column.
 *
 * Recalibrations measured across commit 94de15e: a typical dimension lost 25-50%
 * (3 subjects + 2 how-questions went 2.0 -> 1.0), so pre-change totals sit roughly
 * 2-3 points above post-change ones for identical evidence.
 *
 * ── Why no LLM call ──────────────────────────────────────────────────────────
 * Scores derive from stored evidence IN CODE, so re-deriving needs no model. That is
 * what makes backfilling the whole collection viable: rescore.js re-runs the model
 * for one candidate (minutes each, and the evidence itself may shift), whereas this
 * replays the same tier arithmetic the pipeline would apply to the evidence already
 * on the record. The evidence is treated as the input of record and is never
 * rewritten — only the numbers derived FROM it move.
 *
 * The consequence worth knowing: this corrects for rubric changes, NOT for changes to
 * evidence EXTRACTION (prompt edits, model swaps). A record whose evidence was
 * under-reported by an older prompt stays under-reported; it needs rescore.js.
 *
 * ── What it preserves ────────────────────────────────────────────────────────
 * The prior score, its rubric_version and its model provenance are appended to a
 * bounded history array before the overwrite, following the convention
 * appendScreeningHistory already established for Stage 1: "the score changed" is the
 * complaint this pipeline exists to answer, and it cannot be answered after
 * overwriting the number being complained about.
 *
 * Idempotent: a record already at the current rubric_version whose score does not
 * move is left untouched, so re-running writes nothing and appends no history.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { scoreFromEvidence, coerceEvidenceItems } = require('../src/services/evidenceTierScoring');
const { L1_DIMENSIONS, MAX_L1_SCORE } = require('../src/services/l1ScoringService');
const {
  L2_DIMENSIONS, MAX_L2_SCORE, HANDOFF_DIMENSION, HANDOFF_CAP_WITHOUT_L1,
} = require('../src/services/l2ScoringService');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const STAGE = String(arg('stage', 'l1')).toLowerCase();
const WRITE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');

// Matches HISTORY_LIMIT in screeningService — one convention for prior scores.
const HISTORY_LIMIT = 10;

// The rubric each stage now applies. A record carrying this version whose score does
// not move is already current; anything else is re-derived.
const STAGES = {
  l1: {
    label: 'L1',
    at: 'stage2',
    dims: L1_DIMENSIONS,
    max: MAX_L1_SCORE,
    rubric: 'l1-v5-evidence-tier',
  },
  l2: {
    label: 'L2',
    at: 'stage3',
    dims: L2_DIMENSIONS,
    max: MAX_L2_SCORE,
    rubric: 'l2-v5-evidence-tier',
  },
};

const selected = STAGE === 'both' ? ['l1', 'l2'] : [STAGE];
for (const s of selected) {
  if (!STAGES[s]) {
    console.error(`Unknown --stage "${STAGE}" — expected l1, l2 or both.`);
    process.exit(1);
  }
}

/**
 * Re-derive one stored evaluation from the evidence it already carries.
 *
 * Mirrors _clampScores in the scoring services, including the L2 handoff cap: a
 * backfill that skipped the cap would write totals the live pipeline could never
 * produce, which is worse than the drift it set out to fix.
 *
 * @returns {{total:number, scores:object, audit:object, category:string, percent:number}}
 */
function rederive(cfg, evaluation, hasL1) {
  const evidenceDetail = {};
  for (const dim of Object.keys(cfg.dims)) {
    evidenceDetail[dim] = coerceEvidenceItems(
      evaluation.evidence_detail?.[dim] ?? evaluation.evidence?.[dim]
    );
  }

  const depthClaims = {};
  for (const dim of Object.keys(cfg.dims)) {
    depthClaims[dim] = evaluation.depth_demonstrated?.[dim] === true;
  }

  const { scores, audit } = scoreFromEvidence({
    dimensions: cfg.dims, evidenceDetail, depthClaims,
  });

  if (cfg.at === 'stage3' && !hasL1 && scores[HANDOFF_DIMENSION] > HANDOFF_CAP_WITHOUT_L1) {
    scores[HANDOFF_DIMENSION] = HANDOFF_CAP_WITHOUT_L1;
    audit[HANDOFF_DIMENSION].capped_to = HANDOFF_CAP_WITHOUT_L1;
    audit[HANDOFF_DIMENSION].cap_reason = 'no L1 transcript — handoff follow-up unobservable';
  }

  const sum = Object.values(scores).reduce((s, v) => s + v, 0);
  const total = Math.round(sum * 10) / 10;
  return {
    total,
    scores,
    audit,
    percent: Math.round((total / cfg.max) * 100),
    category: total >= 8.0 ? 'Good' : total >= 5.0 ? 'Moderate' : 'Poor',
  };
}

/**
 * Append the prior score to the stage's bounded history before it is overwritten.
 * Scores and provenance only — the evidence rows are large and are not being changed.
 */
function appendHistory(stage, prior) {
  const history = Array.isArray(stage?.history) ? [...stage.history] : [];
  if (prior) {
    history.push({
      evaluatedAt: prior.evaluated_at || stage?.completedAt || null,
      score: prior.score ?? null,
      score_category: prior.score_category ?? null,
      categories: prior.categories ?? null,
      scoring_meta: prior.scoring_meta ?? null,
      // Named so a later reader knows the number moved without the model re-running,
      // which rules out evidence drift as the cause.
      superseded_by: 'backfill_rubric.js (re-derived from stored evidence)',
    });
  }
  return history.slice(-HISTORY_LIMIT);
}

async function backfillStage(col, cfg) {
  const docs = await col.find({ [`${cfg.at}.evaluation`]: { $exists: true } }).toArray();
  console.log(`\n${'='.repeat(78)}\n${cfg.label}: ${docs.length} stored evaluation(s) — target rubric ${cfg.rubric}\n${'='.repeat(78)}`);

  const moved = [];
  const unchanged = [];
  const skipped = [];

  for (const doc of docs) {
    const ev = doc[cfg.at]?.evaluation || {};
    const label = `${doc.jobId}/${doc.candidateName}`;

    // A record with no tagged evidence cannot be re-derived — its score came from a
    // pre-tier rubric that stored no evidence to replay. Re-deriving would write 0.0
    // and read as a catastrophic panel rather than an unbackfillable record.
    const hasEvidence = Object.keys(cfg.dims).some(d =>
      (ev.evidence_detail?.[d]?.length || ev.evidence?.[d]?.length));
    if (!hasEvidence) {
      skipped.push({ label, why: 'no tagged evidence (pre-tier record)' });
      continue;
    }

    const hasL1 = Boolean(doc.stage2?.l1Transcript || doc.stage2?.transcript);
    const fresh = rederive(cfg, ev, hasL1);
    const old = typeof ev.score === 'number' ? ev.score : null;
    const oldRubric = ev.scoring_meta?.rubric_version || '(unversioned)';

    const delta = old === null ? null : Math.round((fresh.total - old) * 10) / 10;
    const scoreMoved = delta === null || Math.abs(delta) >= 0.05;
    const rubricStale = oldRubric !== cfg.rubric;

    if (!scoreMoved && !rubricStale) {
      unchanged.push({ label, score: fresh.total });
      continue;
    }

    moved.push({ _id: doc._id, label, old, oldRubric, delta, fresh, doc });
  }

  // ── Report ──
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} record(s) that carry no replayable evidence:`);
    for (const s of skipped) console.log(`  ${s.label.padEnd(40)} ${s.why}`);
    console.log('  → these need scripts/rescore.js (re-runs the model) to get a current score.');
  }

  if (unchanged.length) {
    console.log(`\nAlready current: ${unchanged.length} record(s) — no write needed.`);
    if (VERBOSE) for (const u of unchanged) console.log(`  ${u.label.padEnd(40)} ${u.score}`);
  }

  if (!moved.length) {
    console.log(`\nNothing to backfill for ${cfg.label}.`);
    return { moved: 0, written: 0 };
  }

  console.log(`\n${moved.length} record(s) to re-derive:\n`);
  console.log('  ' + 'Job/Candidate'.padEnd(40) + 'OLD'.padStart(6) + 'NEW'.padStart(7) +
    '     Δ'.padStart(8) + '   stored rubric');
  console.log('  ' + '-'.repeat(88));
  for (const m of [...moved].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))) {
    const d = m.delta === null ? '  new' : (m.delta > 0 ? `+${m.delta.toFixed(1)}` : m.delta.toFixed(1));
    console.log('  ' + m.label.slice(0, 39).padEnd(40) +
      String(m.old ?? '-').padStart(6) + String(m.fresh.total).padStart(7) + d.padStart(8) +
      `   ${m.oldRubric}`);
  }

  const drops = moved.filter(m => m.delta !== null && m.delta < 0);
  const rises = moved.filter(m => m.delta !== null && m.delta > 0);
  if (drops.length) {
    const avg = drops.reduce((s, m) => s + Math.abs(m.delta), 0) / drops.length;
    console.log(`\n  ${drops.length} dropped, average -${avg.toFixed(1)} point(s)`);
  }
  if (rises.length) {
    const avg = rises.reduce((s, m) => s + m.delta, 0) / rises.length;
    console.log(`  ${rises.length} rose, average +${avg.toFixed(1)} point(s)`);
  }

  // A backfill that moves a record across the Good/Moderate/Poor boundary changes what
  // a reviewer concludes, not merely the digits, so those are called out separately.
  const recategorised = moved.filter(m =>
    m.doc[cfg.at]?.evaluation?.score_category &&
    m.doc[cfg.at].evaluation.score_category !== m.fresh.category);
  if (recategorised.length) {
    console.log(`\n  ${recategorised.length} record(s) change category:`);
    for (const m of recategorised) {
      console.log(`    ${m.label.padEnd(40)} ${m.doc[cfg.at].evaluation.score_category} → ${m.fresh.category}`);
    }
  }

  if (!WRITE) {
    console.log('\n(dry run — nothing written; pass --write to persist)');
    return { moved: moved.length, written: 0 };
  }

  // ── Write ──
  let written = 0;
  for (const m of moved) {
    const stage = m.doc[cfg.at] || {};
    const prior = stage.evaluation || {};
    const history = appendHistory(stage, prior);

    await col.updateOne({ _id: m._id }, {
      $set: {
        [`${cfg.at}.evaluation.score`]: m.fresh.total,
        [`${cfg.at}.evaluation.score_percent`]: m.fresh.percent,
        [`${cfg.at}.evaluation.score_category`]: m.fresh.category,
        [`${cfg.at}.evaluation.categories`]: m.fresh.scores,
        [`${cfg.at}.evaluation.evidence_audit`]: m.fresh.audit,
        [`${cfg.at}.evaluation.scoring_meta.rubric_version`]: cfg.rubric,
        // The scoring_meta model fields still describe the run that produced the
        // EVIDENCE, which is correct — the model did produce it. Only the rubric that
        // turned that evidence into a number changed, and this records when.
        [`${cfg.at}.evaluation.scoring_meta.rubric_backfilled_at`]: new Date().toISOString(),
        [`${cfg.at}.evaluation.scoring_meta.rubric_backfilled_from`]: m.oldRubric,
        [`${cfg.at}.history`]: history,
      },
    });
    written++;
  }

  console.log(`\n✅ ${cfg.label}: ${written} record(s) re-derived to ${cfg.rubric}. ` +
    `Prior scores kept at ${cfg.at}.history.`);
  return { moved: moved.length, written };
}

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set — point .env at the database you intend to backfill.');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const dbName = process.env.MONGODB_DB || 'panel_db';
  const col = client.db(dbName).collection('pipeline_evaluations');

  // Which database is being written is the one thing worth stating loudly: prod and
  // dev carry the same collection name and the same script writes either.
  const host = String(process.env.MONGODB_URI).replace(/\/\/[^@]*@/, '//<redacted>@');
  console.log(`Database: ${dbName} at ${host}`);
  console.log(`Mode: ${WRITE ? '*** WRITE ***' : 'dry run'}`);

  let totalMoved = 0, totalWritten = 0;
  for (const s of selected) {
    const r = await backfillStage(col, STAGES[s]);
    totalMoved += r.moved;
    totalWritten += r.written;
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`Total: ${totalMoved} record(s) needed re-derivation, ${totalWritten} written.`);
  if (totalMoved && !WRITE) console.log('Re-run with --write to persist.');

  await client.close();
})().catch(e => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
