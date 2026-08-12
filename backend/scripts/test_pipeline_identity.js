/**
 * Regression test for the split-pipeline bug — the escalation where Stage 3 reported
 * "JD Not Found", the JD and resume looked missing from Stage 1, and one candidate
 * appeared twice: once with the screening and once with the L1 score.
 *
 *   node scripts/test_pipeline_identity.js
 *
 * ── Why a stub instead of a live database ────────────────────────────────────
 * The only MongoDB URI configured for this project is the shared remote one, and a test
 * that creates and deletes candidate records must never point at it. The stub below
 * implements just enough of the driver to make the ONE distinction this bug turned on:
 * `findOne`/`updateOne` compare strings byte-for-byte by default, and fold case only
 * when passed a collation. That is the semantic the old code got wrong, so it is the
 * semantic worth pinning — everything else about Mongo is irrelevant here.
 *
 * The stub is deliberately strict: it throws if a filter contains a non-string value, so
 * a future change that starts keying on ObjectIds or regexes fails loudly here rather
 * than quietly passing a test that no longer models the real query.
 */
'use strict';

const {
  IDENTITY_COLLATION, normalizeIdentity, identityFilter,
  findPipelineRecord, findRecordsForJob, hasUsableScreening,
} = require('../src/services/pipelineIdentity');

// ── Minimal collection stub ──────────────────────────────────────────────────

function matches(doc, filter, collation) {
  return Object.entries(filter).every(([k, v]) => {
    if (typeof v !== 'string') throw new Error(`stub: non-string filter value for "${k}"`);
    const actual = doc[k];
    if (typeof actual !== 'string') return false;
    // strength:2 == case-insensitive, accent-sensitive. Mongo does NOT trim or collapse
    // whitespace, which is exactly why normalizeIdentity must do so before querying.
    return collation ? actual.toLowerCase() === v.toLowerCase() : actual === v;
  });
}

function makeCol(docs = []) {
  let nextId = 1;
  const col = {
    docs,
    async findOne(filter, opts = {}) {
      return this.docs.find(d => matches(d, filter, opts.collation)) || null;
    },
    find(filter, opts = {}) {
      const out = this.docs.filter(d => matches(d, filter, opts.collation));
      return { toArray: async () => (opts.limit ? out.slice(0, opts.limit) : out) };
    },
    async updateOne(filter, update, opts = {}) {
      const doc = this.docs.find(d => matches(d, filter, opts.collation));
      if (!doc) {
        if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        const created = { _id: `id${nextId++}`, ...filter };
        applyUpdate(created, update, true);
        this.docs.push(created);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      applyUpdate(doc, update, false);
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  };
  return col;
}

function applyUpdate(doc, update, isInsert) {
  Object.assign(doc, update.$set || {});
  if (isInsert) Object.assign(doc, update.$setOnInsert || {});
  for (const [k, v] of Object.entries(update.$addToSet || {})) {
    doc[k] = Array.isArray(doc[k]) ? doc[k] : [];
    if (!doc[k].includes(v)) doc[k].push(v);
  }
}

// ── Harness ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  PASS  ${msg}`); }
  else { failed++; console.log(`  FAIL  ${msg}`); }
}
function section(t) { console.log(`\n${t}`); }

const JD = 'NTC-QA Automation';
const STORED = 'Dhanapalan C';
const VARIANTS = ['dhanapalan c', 'DHANAPALAN C', '  Dhanapalan C  ', 'Dhanapalan  C'];

function screenedCol() {
  return makeCol([{
    _id: 'id0', jobId: JD, candidateName: STORED,
    completedStages: ['stage1'],
    stage1: { completed: true, jdText: 'REAL JD TEXT', resumeText: 'RESUME TEXT' },
  }]);
}

(async () => {
  section('normalizeIdentity folds whitespace but preserves display casing');
  ok(normalizeIdentity({ jobId: '  NT-ETL ', candidateName: 'A  B ' }).jobId === 'NT-ETL',
    'trims the jobId');
  ok(normalizeIdentity({ candidateName: 'Chaitanya   Andhe  Dibbaiah' }).candidateName
    === 'Chaitanya Andhe Dibbaiah', 'collapses internal whitespace runs');
  ok(normalizeIdentity({ candidateName: 'Dhanapalan C' }).candidateName === 'Dhanapalan C',
    'does NOT lowercase (display spelling is preserved)');
  ok(normalizeIdentity({}).candidateName === '', 'missing fields normalize to empty string');
  ok(normalizeIdentity({ jobId: 123 }).jobId === '123', 'coerces non-strings');

  section('THE BUG: exact match misses, and upsert splits the pipeline');
  {
    const col = screenedCol();
    // What Stage 2 used to do: exact-match filter on a re-typed name.
    const found = await col.findOne({ jobId: JD, candidateName: 'dhanapalan c' });
    ok(found === null, 'exact match finds nothing for a differently-cased name');

    await col.updateOne(
      { jobId: JD, candidateName: 'dhanapalan c' },
      { $set: { stage2: { completed: true, evaluation: { score: 7 } } },
        $addToSet: { completedStages: 'stage2' } },
      { upsert: true });

    ok(col.docs.length === 2, 'upsert:true INSERTED a second record — the split');
    const orphan = col.docs.find(d => d.candidateName === 'dhanapalan c');
    ok(!orphan.stage1, 'the new record has no stage1 — the row whose JD/Resume look missing');
    ok((orphan.stage1?.jdText || '') === '',
      'Stage 3 reading stage1.jdText off it gets nothing — the reported "JD Not Found"');
    ok(col.docs.filter(d => d.stage1).length === 1 && col.docs.filter(d => d.stage2).length === 1,
      'screening and L1 score now live on DIFFERENT records');
  }

  section('THE FIX: collation resolves every variant to the one screened record');
  for (const v of VARIANTS) {
    const col = screenedCol();
    const rec = await findPipelineRecord(col, { jobId: JD, candidateName: v });
    ok(rec !== null && rec.candidateName === STORED, `"${v}" -> "${rec?.candidateName}"`);
  }
  {
    const col = screenedCol();
    ok(await findPipelineRecord(col, { jobId: 'ntc-qa automation', candidateName: STORED }) !== null,
      'jobId is matched case-insensitively too');
    ok(await findPipelineRecord(col, { jobId: JD, candidateName: 'Dhanapàlan C' }) === null,
      'accents remain significant — a different person stays a different record');
    ok(await findPipelineRecord(col, { jobId: 'NT-ETL', candidateName: STORED }) === null,
      'same name under a different JD is a different record');
  }

  section('THE FIX: Stage 2/3 update in place with upsert:false');
  {
    const col = screenedCol();
    const rec = await findPipelineRecord(col, { jobId: JD, candidateName: 'dhanapalan  c' });
    const w = await col.updateOne(
      { jobId: rec.jobId, candidateName: rec.candidateName },
      { $set: { stage2: { completed: true, evaluation: { score: 7 } } },
        $addToSet: { completedStages: 'stage2' } },
      { upsert: false, collation: IDENTITY_COLLATION });

    ok(w.matchedCount === 1 && w.upsertedCount === 0, 'updated the existing record, inserted nothing');
    ok(col.docs.length === 1, 'still exactly one record');
    ok(col.docs[0].stage1.jdText === 'REAL JD TEXT' && col.docs[0].stage2.completed,
      'one record carries BOTH the screening and the L1 score');
    ok(col.docs[0].candidateName === STORED, 'canonical spelling not overwritten by the typed casing');
    ok(col.docs[0].completedStages.join(',') === 'stage1,stage2', 'completedStages shows both stages');
  }

  section('THE FIX: a vanished record is reported, never re-created');
  {
    const col = makeCol([]);
    const w = await col.updateOne(
      { jobId: JD, candidateName: STORED },
      { $set: { stage3: { completed: true } } },
      { upsert: false, collation: IDENTITY_COLLATION });
    ok(w.matchedCount === 0 && col.docs.length === 0,
      'upsert:false writes nothing when the record is gone (route reports RECORD_VANISHED)');
  }

  section('hasUsableScreening requires JD text, not just the completed flag');
  ok(hasUsableScreening({ stage1: { completed: true, jdText: 'JD' } }), 'completed + JD text');
  ok(!hasUsableScreening({ stage1: { completed: true, jdText: '   ' } }),
    'whitespace-only JD is not usable (Stage 3 would have used a placeholder JD)');
  ok(!hasUsableScreening({ stage1: { completed: true } }), 'no jdText field');
  ok(!hasUsableScreening({ stage1: { completed: false, jdText: 'JD' } }), 'not completed');
  ok(!hasUsableScreening({}), 'no stage1 at all — the orphan record');
  ok(!hasUsableScreening(null), 'null record');

  section('findRecordsForJob names the siblings that make a 409 actionable');
  {
    const col = makeCol([
      { _id: 'a', jobId: JD, candidateName: 'Dhanapalan C', completedStages: ['stage1'] },
      { _id: 'b', jobId: JD, candidateName: 'Someone Else', completedStages: [] },
      { _id: 'c', jobId: 'NT-ETL', candidateName: 'Chaitanya', completedStages: ['stage1'] },
    ]);
    const rows = await findRecordsForJob(col, { jobId: 'ntc-qa automation' });
    ok(rows.length === 2, 'returns only candidates under the requested JD, case-insensitively');
    const screened = rows.filter(r => r.completedStages.includes('stage1')).map(r => r.candidateName);
    ok(screened.length === 1 && screened[0] === 'Dhanapalan C',
      'identifies the screened sibling the user most likely meant');
    ok((await findRecordsForJob(col, { jobId: '' })).length === 0, 'empty jobId matches nothing');
  }

  section('identityFilter yields a filter safe to pass straight to Mongo');
  {
    const f = identityFilter({ jobId: ' NT-ETL ', candidateName: 'A  B' });
    ok(Object.keys(f).sort().join(',') === 'candidateName,jobId', 'exactly the two key fields');
    ok(f.jobId === 'NT-ETL' && f.candidateName === 'A B', 'values are normalized');
  }

  console.log(`\n${'─'.repeat(60)}\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
