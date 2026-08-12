/**
 * Pipeline record identity — the one place that decides which stored record a
 * (jobId, candidateName) pair refers to.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `pipeline_evaluations` is keyed by the PAIR (jobId, candidateName), but until now
 * every route spelled that key out by hand and each one normalized it differently:
 *
 *   stage1 / stage2 / stage3 / stage4   { jobId, candidateName }          (raw)
 *   GET /candidate, /restart, ...       { jobId.trim(), ... .trim() }     (trimmed)
 *   frontend localStorage (buildKey)    trim + toLowerCase                (folded)
 *
 * Three definitions of "the same candidate" for one primary key. Mongo matches
 * strings exactly, so "Dhanapalan C" and "dhanapalan c" were two different records
 * to the backend and one record to the frontend — and that disagreement is what
 * split a candidate's pipeline in half:
 *
 *   1. Stage 1 is submitted and stored as "Dhanapalan C".
 *   2. The name is later re-typed with different casing or spacing ("dhanapalan c",
 *      "Dhanapalan  C"). The frontend folds the case, finds its cached Stage 1, and
 *      renders "✓ Auto-filled from Stage 1" — so every precondition looks satisfied.
 *   3. Stage 2 writes with `upsert: true` under the NEW spelling. Exact match finds
 *      nothing, so instead of failing it INSERTS a second document holding only
 *      stage2 — no jdText, no resumeText, no screening.
 *   4. Stage 3 reads stage1.jdText off that second document, finds nothing, and
 *      reports "JD Not Found" — correctly, for the record it is standing on.
 *   5. The dashboard now lists two rows: one with S1 and no L1, one with L1 and no
 *      S1. Nothing was deleted; the halves were written to different documents.
 *
 * That is why the escalation reproduced on "only select records" — it needs the
 * typed spelling to differ from the stored one, which never happens when the user
 * arrives by clicking through from the dashboard (those links carry exact values).
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * Identity is compared case-insensitively, with surrounding whitespace trimmed and
 * internal runs collapsed. Two candidates under one JD whose names differ only by
 * case or spacing are the same person; treating them as two is never the useful
 * reading, and doing so costs a split pipeline.
 *
 * Display casing is NOT normalized away: the form the record was created with is
 * kept as the canonical spelling, so re-screening under a different casing does not
 * make the name flip around in the dashboard.
 */

'use strict';

/**
 * Case-insensitive, accent-sensitive comparison.
 *
 * strength:2 folds case but keeps accents, so "Jose" and "José" stay distinct
 * while "dhanapalan c" and "Dhanapalan C" match. Every read, write and delete
 * against pipeline_evaluations must pass this, or it will disagree with the others
 * about which document it is addressing — the bug this module exists to close.
 */
const IDENTITY_COLLATION = { locale: 'en', strength: 2 };

/** Trim, and collapse internal whitespace runs to single spaces. */
function normalizeIdentityValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeIdentity(identity) {
  return {
    jobId: normalizeIdentityValue(identity?.jobId),
    candidateName: normalizeIdentityValue(identity?.candidateName),
  };
}

/** The Mongo filter for a pipeline record. Always pair with IDENTITY_COLLATION. */
function identityFilter(identity) {
  return normalizeIdentity(identity);
}

/**
 * Find the one record for this identity, case- and whitespace-insensitively.
 *
 * @returns {Promise<object|null>}
 */
async function findPipelineRecord(col, identity) {
  return col.findOne(identityFilter(identity), { collation: IDENTITY_COLLATION });
}

/**
 * Other candidates stored under the same JD ID.
 *
 * Used to turn "no screening found" into a message the user can act on. When a
 * pipeline has already been split, or the name was typed differently from how it
 * was first stored, the record they meant is almost always in this list — and
 * naming it is the difference between "JD Not Found" and "you screened this
 * candidate as 'Dhanapalan C'".
 */
async function findRecordsForJob(col, identity, limit = 10) {
  const { jobId } = normalizeIdentity(identity);
  if (!jobId) return [];
  return col
    .find({ jobId }, {
      collation: IDENTITY_COLLATION,
      projection: { candidateName: 1, completedStages: 1 },
      limit,
    })
    .toArray();
}

/**
 * Whether a record carries a screening that downstream stages can actually build on.
 *
 * `completed: true` alone is not enough: Stage 2 and Stage 3 do not just need the
 * flag, they need the JD text that Stage 1 stored, because that is what the
 * transcript is scored against. Stage 3 used to substitute the literal
 * 'General Software Engineering Job Description' when it was missing, which scored a
 * real candidate against invented criteria and returned a plausible number for it.
 * Refusing is the honest answer.
 */
function hasUsableScreening(record) {
  return Boolean(record?.stage1?.completed && String(record.stage1.jdText || '').trim());
}

module.exports = {
  IDENTITY_COLLATION,
  normalizeIdentityValue,
  normalizeIdentity,
  identityFilter,
  findPipelineRecord,
  findRecordsForJob,
  hasUsableScreening,
};
