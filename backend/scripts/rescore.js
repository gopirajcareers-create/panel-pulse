/**
 * Re-score one stored evaluation (screening, L1 or L2) and diff it against the score
 * on record.
 *
 * Read-only by default: it prints the comparison and writes nothing, so a rubric
 * change can be measured before deciding whether to persist it. Pass --write to
 * store the new evaluation.
 *
 *   node scripts/rescore.js --job jd1005 --candidate Mathews
 *   node scripts/rescore.js --job jd1005 --candidate Mathews --audit
 *   node scripts/rescore.js --job jd1005 --candidate Mathews --stage l2 --write
 *   node scripts/rescore.js --job jd1005 --candidate Mathews --stage screening --audit
 *
 * Screening is here because a match score that drifts is a complaint you have to be
 * able to reproduce, and until Stage 1 became a service there was no way to re-run it
 * against a stored record — the only way to see a second number was to re-upload the
 * files through the UI, which changes the input.
 *
 * Matching is case-insensitive and anchored, because candidate names in the
 * collection carry inconsistent casing ("mathew" vs "Mathews").
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { runScreening, appendScreeningHistory } = require('../src/services/screeningService');
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
  screening: {
    label: 'Screening',
    storedAt: 'stage1.analysis',
    // No transcript exists at Stage 1 — the inputs are the two uploaded documents,
    // which the record already carries.
    needsTranscript: false,
    read: (doc) => ({
      transcript: '',
      old: doc.stage1?.analysis || {},
    }),
    run: (doc, { jd, resumeText }) => runScreening({
      jobId: doc.jobId, candidateName: doc.candidateName, jdText: jd, resumeText,
    }),
    // runScreening returns { success, analysis }, not { evaluation }.
    result: (r) => r.analysis,
    report: reportScreening,
    // --write must not be the one path that drops the score being compared against.
    history: { at: 'stage1.history', append: (doc) => appendScreeningHistory(doc.stage1) },
  },
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
  console.error(`Unknown --stage "${STAGE}" — expected screening, l1 or l2.`);
  process.exit(1);
}

/**
 * Screening diff. Deliberately per-skill rather than per-dimension: a match score is a
 * weighted count over skills, so a moved total is only interpretable next to WHICH
 * skill's tier moved and WHETHER the skill list itself changed underneath it. The skill
 * list changing is the more serious finding of the two — it means the score's
 * denominator moved, which is what made Stage 1 drift in the first place.
 */
function reportScreening(old, fresh) {
  const rows = (a) => [...(a.mandatorySkillsMatch || []), ...(a.additionalSkillsMatch || [])];
  const tierOf = (r) => r.tier || (r.matched ? 'STRONG' : 'NONE');
  const byName = (a) => new Map(rows(a).map(r => [r.skill.toLowerCase(), r]));
  const oldRows = byName(old);
  const newRows = byName(fresh);

  const names = [...new Set([...oldRows.keys(), ...newRows.keys()])];

  console.log('Skill'.padEnd(38) + 'OLD'.padStart(9) + 'NEW'.padStart(9) + '   source');
  console.log('-'.repeat(80));
  for (const n of names) {
    const o = oldRows.get(n);
    const f = newRows.get(n);
    const label = (f || o).skill.slice(0, 37);
    // A skill present in one run and absent from the other is the drift signature the
    // whole revamp targets, so it is called out rather than shown as a blank cell.
    const mark = !o ? '  ← NEW SKILL' : !f ? '  ← GONE' : '';
    console.log(label.padEnd(38) +
      (o ? tierOf(o) : '-').padStart(9) +
      (f ? tierOf(f) : '-').padStart(9) +
      `   ${f?.source || o?.source || '?'}${mark}`);
  }
  console.log('-'.repeat(80));

  const d = (typeof old.matchScore === 'number' && typeof fresh.matchScore === 'number')
    ? (fresh.matchScore - old.matchScore > 0 ? `+${fresh.matchScore - old.matchScore}` : String(fresh.matchScore - old.matchScore))
    : '?';
  console.log('MATCH SCORE'.padEnd(38) + String(old.matchScore ?? '-').padStart(9) +
    String(fresh.matchScore ?? '-').padStart(9) + d.padStart(6));
  console.log('STATUS'.padEnd(38) + String(old.status ?? '-').padStart(9) +
    String(fresh.status ?? '-').padStart(9));

  const p = fresh.skillsProvenance || {};
  console.log(`\nDerivation:  ${fresh.scoreBreakdown?.formula || '(none recorded)'}`);
  console.log(`Skill source: mandatory=${p.mandatorySource} good-to-have=${p.goodToHaveSource} ` +
    `(JD stated ${p.jdStatedMandatoryCount} mandatory, ${p.jdStatedGoodToHaveCount} good-to-have)`);
  if (p.mandatoryInferred) {
    console.log('  ⚠️  Mandatory skills were INFERRED by AI — the JD names none. ' +
      'This score is not a JD-stated criteria match.');
  }
  if (p.analyzerError) console.log(`  ⚠️  JD analyzer error: ${p.analyzerError}`);

  const rec = fresh.reconciliation || {};
  if (rec.mandatoryMissing?.length || rec.goodToHaveMissing?.length) {
    console.log(`Model omitted (scored NONE): ${[...(rec.mandatoryMissing || []), ...(rec.goodToHaveMissing || [])].join(', ')}`);
  }
  if (rec.mandatoryExtra?.length || rec.goodToHaveExtra?.length) {
    console.log(`Model invented (discarded): ${[...(rec.mandatoryExtra || []), ...(rec.goodToHaveExtra || [])].join(', ')}`);
  }

  const demoted = rows(fresh).filter(r => r.audit?.demoted);
  if (demoted.length) {
    console.log(`\nDemotions (${demoted.length}) — the model's claim was cut down by the resume text:`);
    for (const r of demoted) {
      console.log(`  ${r.skill}: ${r.audit.claimed_tier} → ${r.tier} — ${r.audit.demotion_reasons.join('; ')}`);
    }
  }

  // Promotions are model FALSE NEGATIVES. Worth reading closely: a run with several means
  // the model was answering the skill list badly, not that the candidate improved.
  const promoted = rows(fresh).filter(r => r.audit?.promoted);
  if (promoted.length) {
    console.log(`\nPromotions (${promoted.length}) — the model said absent, the resume disagrees:`);
    for (const r of promoted) {
      console.log(`  ${r.skill}: NONE → ${r.tier} — ${r.audit.demotion_reasons.join('; ')}`);
    }
  }

  const conflicts = fresh.summaryContradictions || [];
  if (conflicts.length) {
    console.log(`\n⚠️  Summary contradicts the evidence (${conflicts.length}) — the prose claims ` +
      `skills scored NONE in the same run:`);
    for (const c of conflicts) {
      console.log(`  ${c.skill}: "${c.sentence}"`);
    }
  }

  if (fresh.coverageSummary) console.log(`\nCoverage (derived from tiers): ${fresh.coverageSummary}`);

  if (AUDIT) {
    console.log('\n=== EVIDENCE AUDIT (what each tier was derived from) ===');
    for (const r of rows(fresh)) {
      console.log(`\n${r.skill} [${r.tier}] credit=${r.credit} source=${r.source}`);
      console.log(`  evidence: ${String(r.evidence || '').replace(/\s+/g, ' ').slice(0, 160)}`);
      const a = r.audit || {};
      console.log(`  claimed=${a.claimed_tier} grounding=${a.grounding_ratio} ` +
        `named_in_resume=${a.skill_named_in_resume} phrase_in_resume=${a.skill_phrase_in_resume} ` +
        `context_markers=${a.has_context_markers} bare_list=${a.looks_like_skills_list}`);
    }
  }

  const m = fresh.scoring_meta || {};
  console.log(`\nNew rubric_version: ${m.rubric_version} (was ${old.scoring_meta?.rubric_version || 'unversioned'})`);
  console.log(`Seed=${m.seed} temp=${m.temperature} warmed=${m.warmed_up} (${m.warmup_note})`);
  console.log(`Resume chars dropped at cap: ${m.resume_chars_dropped}  JD: ${m.jd_chars_dropped}`);
  console.log(`\n--- NEW SUMMARY ---\n${fresh.screeningSummary || '(none)'}`);
  console.log(`\n--- EXPERIENCE ---\n${fresh.experienceMatch || '(none)'}`);
}

/** L1/L2 dimension diff — one rubric, so one report. */
function reportEvaluation(old, fresh) {
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
  if (cfg.needsTranscript !== false && !transcript) {
    console.error(`Record has no ${cfg.label} transcript — nothing to re-score.`);
    await client.close();
    process.exit(1);
  }

  const jd = doc.stage1?.jdText || doc.jdText || doc.stage2?.jdText || '';
  const resumeText = doc.stage1?.resumeText || '';

  // Screening needs BOTH documents and refuses without them, so fail here with the
  // record named rather than letting runScreening throw a generic message.
  if (STAGE === 'screening' && (!jd || !resumeText)) {
    console.error(`Record is missing ${[!jd && 'jdText', !resumeText && 'resumeText'].filter(Boolean).join(' and ')} ` +
      `— screening cannot be re-run against it.`);
    await client.close();
    process.exit(1);
  }

  console.log(`\n${cfg.label} record: jobId="${doc.jobId}" candidate="${doc.candidateName}"`);
  console.log(`  ${cfg.needsTranscript === false ? '' : `transcript=${transcript.length} chars  `}` +
    `jd=${jd.length} chars  resume=${resumeText.length} chars`);
  if (STAGE === 'l2') {
    console.log(`  L1 context=${l1Transcript.length} chars` +
      (l1Transcript ? '' : '  ⚠️  absent — handoff dimension will be capped'));
  }
  console.log(`  stored rubric_version=${old.scoring_meta?.rubric_version || '(none — scored before provenance was recorded)'}`);
  if (!jd) console.warn('  ⚠️  No JD text on this record — JD-relative dimensions will score low regardless of the panel.');

  console.log('\nRe-scoring...');
  const startedAt = Date.now();
  const result = await cfg.run(doc, { jd, resumeText, transcript, l1Transcript });
  // L1/L2 return { success, evaluation, moderation }; screening returns
  // { success, analysis } — each stage names its own result key.
  const fresh = (cfg.result || ((r) => r.evaluation))(result);
  console.log(`Done in ${Math.round((Date.now() - startedAt) / 1000)}s\n`);

  (cfg.report || reportEvaluation)(old, fresh);

  if (WRITE) {
    const update = { $set: { [cfg.storedAt]: fresh } };
    // Screening keeps a bounded history of prior scores, because "the score changed"
    // is the complaint this stage exists to answer and you cannot answer it after
    // overwriting the number being complained about. routes/pipeline.js does the same
    // on re-screen; a --write here must not be the one path that loses it.
    if (cfg.history) update.$set[cfg.history.at] = cfg.history.append(doc);
    await col.updateOne({ _id: doc._id }, update);
    console.log(`\n✅ Written to ${cfg.storedAt}.` +
      (cfg.history ? ` Prior score kept at ${cfg.history.at}.` : ''));
  } else {
    console.log('\n(dry run — nothing written; pass --write to persist)');
  }

  await client.close();
})().catch(e => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
