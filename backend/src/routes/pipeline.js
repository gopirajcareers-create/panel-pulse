const express = require('express');
const router = express.Router();
const { getDb } = require('../services/mongoClient');
const { performPanelEvaluation } = require('../services/panelEvaluationService');
const { runL1Evaluation } = require('../services/l1ScoringService');   // NEW Stage-2 service
const { runL2Evaluation } = require('../services/l2ScoringService');   // NEW Stage-3 service
const { runScreening, appendScreeningHistory } = require('../services/screeningService');
const { gradeOf, GRADE_CREDIT } = require('../services/skillMatchScoring');
const { callLLM, checkOllamaHealth } = require('../services/llmClient');
const {
  IDENTITY_COLLATION, normalizeIdentity, identityFilter,
  findPipelineRecord, findRecordsForJob, hasUsableScreening,
} = require('../services/pipelineIdentity');
const { randomUUID } = require('crypto');

// In-memory job store for async pipeline evaluation jobs (cleaned up after 30 min)
const jobStore = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobStore.entries()) {
    if (job.createdAt < cutoff) jobStore.delete(id);
  }
}, 5 * 60 * 1000);

/**
 * Reject a scoring request up front when the on-prem model is unavailable.
 *
 * Without this, the route returns 202 and the frontend polls for minutes before
 * surfacing a failure — the user only learns the engine was down after the wait.
 * The probe is cheap (/api/tags, no inference) and cached, so it costs ~nothing
 * on the happy path.
 *
 * @returns {Promise<boolean>} true if the caller should continue
 */
async function ensureScoringEngineAvailable(res, stage) {
  const health = await checkOllamaHealth();
  if (health.ok) return true;

  console.error(`[${stage}] Refused — scoring engine unavailable: ${health.error}`);
  res.status(503).json({
    success: false,
    error: health.reachable
      ? `Scoring model not available: ${health.error}`
      : 'The on-prem scoring engine (Ollama) is currently unreachable. Scoring has not started — please retry in a few minutes.',
    code: health.reachable ? 'MODEL_NOT_FOUND' : 'SCORING_ENGINE_UNAVAILABLE',
    retryable: true,
    details: { provider: 'ollama', base: health.base, model: health.model, reachable: health.reachable },
  });
  return false;
}

/**
 * Load the screening a transcript stage must build on, or refuse with a message that
 * names the record the caller probably meant.
 *
 * ── Why stages 2 and 3 must refuse rather than upsert ─────────────────────────
 * Both used to run `updateOne(filter, ..., { upsert: true })` without first checking
 * that the record existed. When the typed name differed from the stored one by case
 * or spacing, the exact-match filter found nothing and Mongo INSERTED a second
 * document holding only that stage — splitting one candidate's pipeline across two
 * records, one with the screening and one with the score. Stage 3 then read
 * `stage1.jdText` off the half without a screening and reported "JD Not Found", and
 * the JD and resume looked "missing" because the row being viewed never had them.
 *
 * Matching is now case-insensitive (services/pipelineIdentity), which removes the
 * cause. This guard removes the failure MODE: with no prior screening there is no JD
 * to score a transcript against, so a new record must not be conjured to hold the
 * result. Writes below use upsert:false for the same reason — after this check the
 * record exists, and if it somehow does not, doing nothing beats orphaning a score.
 *
 * @returns {Promise<object|null>} the record, or null once a response has been sent
 */
async function requireScreenedRecord(res, col, identity, stage) {
  const { jobId, candidateName } = normalizeIdentity(identity);
  const record = await findPipelineRecord(col, identity);

  if (record && hasUsableScreening(record)) return record;

  // Name the sibling records under this JD. When a pipeline has already been split by
  // the old upsert behaviour, or the name was simply typed differently, the record the
  // user wants is in this list — and saying so is what makes the error actionable
  // instead of "JD Not Found" against a record that never had one.
  const siblings = (await findRecordsForJob(col, { jobId }))
    .filter(d => d.candidateName !== candidateName);
  const screened = siblings.filter(d => (d.completedStages || []).includes('stage1'));

  const hint = screened.length
    ? ` The following candidate(s) under JD "${jobId}" do have a completed screening: ` +
      `${screened.map(d => `"${d.candidateName}"`).join(', ')}. ` +
      `If one of those is this candidate, re-enter the name exactly as shown.`
    : ` No candidate under JD "${jobId}" has a completed Stage 1 screening yet.`;

  const reason = !record
    ? `No record exists for candidate "${candidateName}" under JD "${jobId}".`
    : `Stage 1 screening is incomplete for "${candidateName}" — the stored record has no JD text.`;

  console.error(`[${stage}] Refused — ${reason}`);
  res.status(409).json({
    success: false,
    error: `${reason} ${stage} scores the transcript against the JD stored in Stage 1, ` +
      `so Stage 1 must be completed first.${hint}`,
    code: 'SCREENING_REQUIRED',
    retryable: false,
    details: { jobId, candidateName, screenedCandidatesForJob: screened.map(d => d.candidateName) },
  });
  return null;
}

/**
 * Render screening skill rows as tier-annotated lines for a downstream prompt.
 *
 * Stage 4's audit used to split these on the `matched` boolean, which now reads true
 * for both STRONG and PARTIAL. Collapsing those into one "Matched" list would tell the
 * auditor a skill evidenced only by a bare mention in a skills list was verified to
 * the same standard as one backed by three years on a named project — flattening the
 * distinction the tiers exist to preserve.
 *
 * Handles pre-v2 records, where rows carry only `matched`: those become STRONG/NONE,
 * which is what the boolean meant at the time.
 *
 * PARTIAL rows are annotated with the credit their grade earns. "PARTIAL" alone spans
 * everything from a skill named on a three-year project that the model merely hedged on,
 * to one whose name never appears in the resume — telling an auditor only "PARTIAL"
 * invites them to read the second as the first.
 */
function formatSkillTiers(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '  (none)';
  return rows.map(r => {
    const tier = r.tier || (r.matched ? 'STRONG' : 'NONE');
    const grade = gradeOf(r);
    const label = tier === 'PARTIAL' ? `PARTIAL ${GRADE_CREDIT[grade]}` : tier;
    const evidence = String(r.evidence || '').replace(/\s+/g, ' ').slice(0, 200);
    return `  - [${label}] ${r.skill}: ${evidence}`;
  }).join('\n');
}

/**
 * Helper to parse JSON safely from LLM response.
 *
 * Still used by the Stage 4 audit and the L1 question generator, whose outputs are
 * prose-in-JSON rather than verbatim transcript quotes. The scoring paths (Stage 1/2/3)
 * use services/jsonRepair instead — they ask the model to quote source text verbatim,
 * so a quote containing a double quote is expected there and needs real repair.
 */
function parseJSONSafely(text) {
  try {
    const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
    let jsonText = jsonBlock ? jsonBlock[1].trim() : text.trim();

    jsonText = jsonText.replace(/: \s*"([\s\S]*?)"/g, (match, content) => {
      const sanitized = content.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      return `: "${sanitized}"`;
    });

    try {
      return JSON.parse(jsonText);
    } catch (e) {
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        let snippet = jsonText.slice(firstBrace, lastBrace + 1);
        snippet = snippet.replace(/: \s*"([\s\S]*?)"/g, (match, content) => {
          const sanitized = content.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          return `: "${sanitized}"`;
        });
        return JSON.parse(snippet);
      }
      throw e;
    }
  } catch (e) {
    console.error('[Pipeline JSON Parse Error]:', e.message);
    throw new Error('LLM failed to return a valid JSON structure.');
  }
}

/**
 * POST /api/v1/pipeline/stage1
 * Screen the resume against the JD and store the result.
 *
 * The screening itself lives in services/screeningService so it can be re-run against
 * a stored record by scripts/rescore.js and scripts/verify_determinism.js, exactly as
 * L1 and L2 can. Inline route logic could not be, which is why Stage 1's drift went
 * unmeasured for so long.
 *
 * Stays synchronous (unlike stage2/stage3): one seeded skill-extraction call plus one
 * seeded screening call is seconds, not the minutes a transcript evaluation takes, so
 * there is nothing to gain from the async job store and its polling.
 */
router.post('/stage1', async (req, res) => {
  try {
    const {
      panelName = '', panelEmail = '', panelId = '',
      jdText = '', resumeText = ''
    } = req.body;

    // Normalize once, here, and use the result for both the screening and the write.
    // Storing the raw value let trailing whitespace and double spaces into the primary
    // key, where they were invisible on screen but decisive to an exact-match filter.
    const { jobId, candidateName } = normalizeIdentity(req.body);

    if (!jobId || !candidateName) {
      return res.status(400).json({
        success: false,
        error: 'jobId and candidateName are required'
      });
    }

    // Fail fast while the caller is still on the request. Stage 1 previously had no
    // health gate, so with Ollama down it stored a completed record whose text read
    // "please re-upload" — blaming the user's files for an engine outage.
    if (!(await ensureScoringEngineAvailable(res, 'Stage1'))) return;

    let screeningAnalysis;
    try {
      const result = await runScreening({ jobId, candidateName, jdText, resumeText });
      screeningAnalysis = result.analysis;
    } catch (err) {
      // Report the real failure and store NOTHING. The previous handler swallowed
      // every error and persisted a placeholder with matchScore 0 and status
      // 'Partially Eligible' — a self-contradicting record, marked completed, whose
      // advice to re-upload could never fix it because the files were never the
      // problem. A screening that did not happen must not look like one that did.
      console.error('[Stage1] Screening failed:', err.message);
      return res.status(422).json({
        success: false,
        error: err.message,
        code: 'SCREENING_FAILED',
        retryable: true,
      });
    }

    // ─── Store / Upsert in MongoDB ────────────────────────────────────────
    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');
    const filter = identityFilter({ jobId, candidateName });

    // Keep the previous screening rather than discarding it. $set overwrote the prior
    // analysis, so a re-run destroyed the score it should be compared against — the
    // one artefact that makes a drift complaint checkable after the fact. Shared with
    // scripts/rescore.js --write so both writers preserve it identically.
    const existing = await findPipelineRecord(pipelineCol, filter);
    const history = appendScreeningHistory(existing?.stage1);

    // Re-screening an existing candidate must not rename them. The collation makes
    // "dhanapalan c" match the stored "Dhanapalan C", so without this the $set would
    // quietly rewrite the canonical spelling to whatever casing was typed last and the
    // dashboard row would appear to change identity.
    const canonical = {
      jobId: existing?.jobId || jobId,
      candidateName: existing?.candidateName || candidateName,
    };

    await pipelineCol.updateOne(filter, {
      $set: {
        jobId: canonical.jobId,
        candidateName: canonical.candidateName,
        panelName: panelName || '',
        panelEmail: panelEmail || '',
        panelId: panelId || '',
        stage1: {
          completed: true,
          completedAt: new Date().toISOString(),
          jdText,
          resumeText,
          analysis: screeningAnalysis,
          history,
        },
        updatedAt: new Date()
      },
      // $addToSet, not $setOnInsert: on a re-screen the document already exists, so
      // $setOnInsert never fires and a record whose completedStages had been cleared
      // (restart-stage) stayed marked incomplete despite holding a fresh screening.
      $addToSet: { completedStages: 'stage1' },
      $setOnInsert: { createdAt: new Date() }
    }, {
      // Stage 1 is the only stage that may CREATE a record. The collation is what makes
      // that safe: without it, re-screening under different casing inserted a duplicate
      // instead of updating the existing candidate.
      upsert: true,
      collation: IDENTITY_COLLATION,
    });

    console.log(`[Stage1] Saved to MongoDB — jobId=${canonical.jobId} candidate="${canonical.candidateName}"`);

    return res.status(200).json({
      success: true,
      data: { screeningAnalysis }
    });
  } catch (error) {
    console.error('[Stage1] Endpoint error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pipeline/stage2
 * L1 Scoring using the new l1ScoringService (6 dimensions, 10 pts total)
 */
router.post('/stage2', async (req, res) => {
  try {
    const {
      panelName = '', panelEmail = '', panelId = '',
      l1Transcript
    } = req.body;

    const { jobId, candidateName } = normalizeIdentity(req.body);

    if (!jobId || !candidateName || !l1Transcript) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jobId, candidateName, l1Transcript'
      });
    }

    console.log(`[Stage2] jobId=${jobId} candidate="${candidateName}" transcriptLen=${l1Transcript.length}`);

    // Fail fast while the caller is still on the request, not 4 minutes into polling.
    if (!(await ensureScoringEngineAvailable(res, 'Stage2'))) return;

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');

    // Refuse before starting a job rather than upserting an orphan record. Scoring an
    // L1 transcript needs the JD from Stage 1, so with no screening there is nothing to
    // score against — see requireScreenedRecord.
    const existing = await requireScreenedRecord(res, pipelineCol, { jobId, candidateName }, 'Stage2');
    if (!existing) return;

    // Write back under the identity ALREADY on the record, so a differently-cased
    // submission updates that candidate instead of creating a second one.
    const identity = { jobId: existing.jobId, candidateName: existing.candidateName };

    // Pull JD + resume from Stage 1 record
    const jdText     = existing.stage1.jdText;
    const resumeText = existing.stage1.resumeText || '';

    // Start async job immediately — return jobId to frontend
    const asyncJobId = randomUUID();
    jobStore.set(asyncJobId, { status: 'processing', createdAt: Date.now() });

    // Fire and forget — run full L1 evaluation in background
    runL1Evaluation({
      jobId,
      candidateName: existing.candidateName,
      panelName:  panelName  || existing?.panelName  || '',
      panelEmail: panelEmail || existing?.panelEmail || '',
      panelId:    panelId    || existing?.panelId    || '',
      jd:         jdText,
      resumeText,
      transcript: l1Transcript,
    })
      .then(async (result) => {
        if (!result.success) {
          jobStore.set(asyncJobId, { status: 'failed', error: result.error || 'L1 evaluation failed', createdAt: Date.now() });
          return;
        }

        // Persist to pipeline_evaluations.stage2
        const write = await pipelineCol.updateOne(
          identity,
          {
            $set: {
              panelName:  panelName  || existing?.panelName  || '',
              panelEmail: panelEmail || existing?.panelEmail || '',
              panelId:    panelId    || existing?.panelId    || '',
              stage2: {
                completed: true,
                completedAt: new Date().toISOString(),
                l1Transcript,
                evaluation: result.evaluation,
                moderation: result.moderation,
              },
              updatedAt: new Date()
            },
            $addToSet: { completedStages: 'stage2' }
          },
          // upsert:false — the record was verified to exist before the job started. If it
          // has since been deleted (restart), inserting a screening-less record holding
          // only a score is exactly the split this fix removes; report it instead.
          { upsert: false, collation: IDENTITY_COLLATION }
        );

        if (write.matchedCount === 0) {
          const error = `L1 scoring finished but the record for "${identity.candidateName}" ` +
            `under JD "${identity.jobId}" no longer exists, so the score could not be saved. ` +
            `It was most likely restarted or deleted while scoring was running — re-run Stage 1, then Stage 2.`;
          console.error(`[Stage2] ${error}`);
          jobStore.set(asyncJobId, {
            status: 'failed', error, code: 'RECORD_VANISHED', retryable: true, createdAt: Date.now(),
          });
          return;
        }

        jobStore.set(asyncJobId, {
          status: 'complete',
          createdAt: Date.now(),
          data: { success: true, evaluation: result.evaluation }
        });

        console.log(`[Stage2] Saved to MongoDB — jobId=${jobId} score=${result.evaluation.score}`);
      })
      .catch(err => {
        // Log the stack, not just the message. The scoring errors this catches are
        // multi-sentence diagnostics (parse error + response tail + which knob to
        // turn), and knowing whether the throw came from scoring or from the Mongo
        // write that follows it decides where to look.
        console.error(`[Stage2] Evaluation error — jobId=${jobId} candidate="${candidateName}":`, err.stack || err.message);
        jobStore.set(asyncJobId, {
          status: 'failed',
          error: err.message,
          code: err.code || 'STAGE2_FAILED',
          retryable: err.retryable !== false,
          createdAt: Date.now(),
        });
      });

    return res.status(202).json({ success: true, async_job_id: asyncJobId, status: 'processing' });
  } catch (error) {
    console.error('[Stage2] Endpoint error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pipeline/stage3
 * Scoring L2 Transcript (async job)
 */
router.post('/stage3', async (req, res) => {
  try {
    const { panelName, panelEmail, panelId, l2Transcript, candidateStatus = 'Selected' } = req.body;

    const { jobId, candidateName } = normalizeIdentity(req.body);

    if (!jobId || !candidateName || !l2Transcript) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: jobId, candidateName, l2Transcript'
      });
    }

    // Fail fast while the caller is still on the request, not 4 minutes into polling.
    if (!(await ensureScoringEngineAvailable(res, 'Stage3'))) return;

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');

    // This is where the escalation surfaced. The old code read `stage1.jdText` off
    // whatever `findOne` returned and, when that was a record created by Stage 2's
    // upsert (or nothing at all), substituted the literal
    // 'General Software Engineering Job Description' — scoring a real candidate against
    // a placeholder JD and returning a confident number for it. Refuse instead, and say
    // which record actually holds the screening.
    const existing = await requireScreenedRecord(res, pipelineCol, { jobId, candidateName }, 'Stage3');
    if (!existing) return;

    const identity = { jobId: existing.jobId, candidateName: existing.candidateName };

    const jdText = existing.stage1.jdText;
    const resumeText = existing.stage1.resumeText || '';
    const l1Transcript = existing?.stage2?.l1Transcript || '';

    // The L1 transcript materially changes how "Resume Screening & Handoff" is
    // scored (its absence inflated L2 totals by ~1.2 pts and could flip the
    // verdict Moderate -> Good). Scoring still proceeds, but the caller is told,
    // so an L2 score is never silently compared against one from the other regime.
    const l1ContextAvailable = Boolean(l1Transcript && l1Transcript.trim());
    if (!l1ContextAvailable) {
      console.warn(`[Stage3] No Stage 2 (L1) transcript for jobId=${jobId} candidate="${candidateName}" — ` +
        `L2 handoff scoring will be limited. Run Stage 2 first for a fully comparable score.`);
    }

    const asyncJobId = randomUUID();
    jobStore.set(asyncJobId, { status: 'processing', createdAt: Date.now() });

    runL2Evaluation({
      jobId,
      candidateName: existing.candidateName,
      panelName: panelName || existing?.panelName || 'L2 Panel',
      panelEmail: panelEmail || existing?.panelEmail || '',
      panelId: panelId || existing?.panelId || '',
      jd: jdText,
      resumeText,
      l1Transcript,
      l2Transcript,
      candidateStatus
    })
      .then(async (result) => {
        if (!result.success) {
          jobStore.set(asyncJobId, { status: 'failed', error: result.error || 'L2 evaluation failed', createdAt: Date.now() });
          return;
        }

        // Save result in MongoDB stage3
        const write = await pipelineCol.updateOne(
          identity,
          {
            $set: {
              panelName: panelName || existing?.panelName || 'L2 Panel',
              panelEmail: panelEmail || existing?.panelEmail || '',
              panelId: panelId || existing?.panelId || '',
              stage3: {
                completed: true,
                completedAt: new Date().toISOString(),
                l2Transcript,
                candidateStatus,
                l1ContextAvailable,
                evaluation: result.evaluation,
                moderation: result.moderation
              },
              updatedAt: new Date()
            },
            $addToSet: { completedStages: 'stage3' }
          },
          // upsert:false — same reasoning as Stage 2: never conjure a record to hold a
          // score whose screening is gone.
          { upsert: false, collation: IDENTITY_COLLATION }
        );

        if (write.matchedCount === 0) {
          const error = `L2 scoring finished but the record for "${identity.candidateName}" ` +
            `under JD "${identity.jobId}" no longer exists, so the score could not be saved. ` +
            `It was most likely restarted or deleted while scoring was running — re-run the earlier stages, then Stage 3.`;
          console.error(`[Stage3] ${error}`);
          jobStore.set(asyncJobId, {
            status: 'failed', error, code: 'RECORD_VANISHED', retryable: true, createdAt: Date.now(),
          });
          return;
        }

        jobStore.set(asyncJobId, {
          status: 'complete',
          createdAt: Date.now(),
          data: {
            success: true,
            evaluation: result.evaluation,
            l1ContextAvailable
          }
        });
      })
      .catch(err => {
        console.error(`[Stage3] Evaluation error — jobId=${jobId} candidate="${candidateName}":`, err.stack || err.message);
        jobStore.set(asyncJobId, {
          status: 'failed',
          error: err.message,
          code: err.code || 'STAGE3_FAILED',
          retryable: err.retryable !== false,
          createdAt: Date.now(),
        });
      });

    return res.status(202).json({ success: true, async_job_id: asyncJobId, status: 'processing' });
  } catch (error) {
    console.error('Error in stage3 pipeline endpoint:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pipeline/stage4
 * Comprehensive Client Audit — holistic cross-artifact quality audit:
 *   - Resume & JD alignment
 *   - L1 probing level & panel summary
 *   - L2 probing level & panel summary
 *   - Rejection reason validation
 *   - Leakage verdict + actionable recommendations
 */
router.post('/stage4', async (req, res) => {
  try {
    const { feedbackText, feedbackFileName = '' } = req.body;

    const { jobId, candidateName } = normalizeIdentity(req.body);

    if (!jobId || !candidateName || !feedbackText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: jobId, candidateName, feedbackText'
      });
    }

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');
    const existing = await findPipelineRecord(pipelineCol, { jobId, candidateName });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Candidate pipeline not found. Please complete previous stages first.'
      });
    }

    // ── Identity Confirmation — check JD ID & Candidate name in filename + content ─
    const normalizedJobId   = jobId.trim().toLowerCase();
    const normalizedCandidate = candidateName.trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizedFileName  = feedbackFileName.trim().toLowerCase();
    const normalizedContent   = feedbackText.toLowerCase();

    const candidateFirstName  = normalizedCandidate.split(' ')[0];
    const candidateLastName   = normalizedCandidate.split(' ').slice(-1)[0];

    const jobIdInFilename   = normalizedFileName.includes(normalizedJobId);
    const jobIdInContent    = normalizedContent.includes(normalizedJobId);
    const candidateInFilename = (
      normalizedFileName.includes(normalizedCandidate) ||
      normalizedFileName.includes(candidateFirstName) ||
      normalizedFileName.includes(candidateLastName)
    );
    const candidateInContent = (
      normalizedContent.includes(normalizedCandidate) ||
      normalizedContent.includes(candidateFirstName) ||
      normalizedContent.includes(candidateLastName)
    );

    const identityConfirmation = {
      jobIdFoundInFilename:   jobIdInFilename,
      jobIdFoundInContent:    jobIdInContent,
      candidateFoundInFilename: candidateInFilename,
      candidateFoundInContent:  candidateInContent,
      fileName: feedbackFileName || 'Unknown',
      confirmationStatus: 'Unconfirmed',
      confirmationNote: ''
    };

    const isSpreadsheet = normalizedFileName.endsWith('.xlsx') || normalizedFileName.endsWith('.xls') || normalizedFileName.endsWith('.csv');
    const matchedInFilename = jobIdInFilename && candidateInFilename;
    const matchedInContent = jobIdInContent && candidateInContent;

    if (matchedInFilename && matchedInContent) {
      identityConfirmation.confirmationStatus = 'Confirmed';
      identityConfirmation.confirmationNote = `Rejection document confirmed: Job ID "${jobId}" and Candidate "${candidateName}" found in both the filename and the ${isSpreadsheet ? 'spreadsheet' : 'document'} text content.`;
    } else if (matchedInFilename) {
      identityConfirmation.confirmationStatus = 'Confirmed';
      identityConfirmation.confirmationNote = `Rejection document confirmed: Job ID "${jobId}" and Candidate "${candidateName}" both matched in the filename (${feedbackFileName}).`;
    } else if (matchedInContent) {
      identityConfirmation.confirmationStatus = 'Confirmed';
      identityConfirmation.confirmationNote = `Rejection document confirmed: Job ID "${jobId}" and Candidate "${candidateName}" both matched inside the ${isSpreadsheet ? 'spreadsheet' : 'document'} text content.`;
    } else {
      // Partial or cross-location match
      const anyJobId = jobIdInFilename || jobIdInContent;
      const anyCandidate = candidateInFilename || candidateInContent;
      if (anyJobId && anyCandidate) {
        identityConfirmation.confirmationStatus = 'Confirmed';
        const locJob = jobIdInFilename ? 'filename' : 'content';
        const locCand = candidateInFilename ? 'filename' : 'content';
        identityConfirmation.confirmationNote = `Rejection document confirmed: Job ID found in ${locJob} and Candidate name found in ${locCand}.`;
      } else if (anyCandidate) {
        identityConfirmation.confirmationStatus = 'Partially Confirmed';
        identityConfirmation.confirmationNote = `Candidate name "${candidateName}" was identified in the ${candidateInFilename ? 'filename' : 'document content'}, but the Job ID "${jobId}" was not found.`;
      } else if (anyJobId) {
        identityConfirmation.confirmationStatus = 'Partially Confirmed';
        identityConfirmation.confirmationNote = `Job ID "${jobId}" was identified in the ${jobIdInFilename ? 'filename' : 'document content'}, but the Candidate "${candidateName}" was not found.`;
      } else {
        identityConfirmation.confirmationStatus = 'Unconfirmed';
        identityConfirmation.confirmationNote = `Neither Job ID "${jobId}" nor Candidate "${candidateName}" could be found in the filename or document content. Please verify if the uploaded file is correct.`;
      }
    }

    console.log(`[Stage4] Identity check: status=${identityConfirmation.confirmationStatus} jobIdInContent=${jobIdInContent} candidateInContent=${candidateInContent}`);

    // ── Gather all pipeline artifacts ───────────────────────────────────────
    const jdText       = existing?.stage1?.jdText       || '';
    const resumeText   = existing?.stage1?.resumeText   || '';
    const s1Analysis   = existing?.stage1?.analysis     || {};

    const l1Transcript = existing?.stage2?.l1Transcript || '';
    const l1Eval       = existing?.stage2?.evaluation   || {};
    const l1Categories = l1Eval.categories || {};
    const l1Score      = l1Eval.score ?? 'N/A';
    const l1Summary    = l1Eval.panel_summary || 'Not available.';
    const l1DimSummaries = l1Eval.dimension_summaries || {};
    const l1Moderation = existing?.stage2?.moderation  || {};
    const l1Recommendations = l1Eval.recommendations || [];

    const l2Transcript = existing?.stage3?.l2Transcript || '';
    const l2Eval       = existing?.stage3?.evaluation   || {};
    const l2Categories = l2Eval.categories || {};
    const l2Score      = l2Eval.score ?? 'N/A';
    const l2Summary    = l2Eval.panel_summary || 'Not available.';
    const l2DimSummaries = l2Eval.dimension_summaries || {};
    const l2Moderation = existing?.stage3?.moderation  || {};
    const l2Recommendations = l2Eval.recommendations || [];
    const candidateStatus = existing?.stage3?.candidateStatus || 'Not Set';

    // ── Build powerful comprehensive LLM prompt ─────────────────────────────
    const systemPrompt = `You are a world-class Senior Quality Auditor and HR Compliance Specialist with 20+ years of experience auditing technical recruitment pipelines.

YOUR MISSION: Conduct a COMPREHENSIVE, ACCURATE, and CONSISTENT holistic audit of the entire recruitment pipeline for one candidate. You have access to ALL artifacts: the Job Description, Candidate Resume, Stage 1 Screening output, L1 Interview transcript and scores, L2 Interview transcript and scores, and the Client Rejection Feedback.

AUDIT PHILOSOPHY:
- You are not just finding "leakage" — you are quality-auditing every stage of the hiring funnel.
- Every finding must be EVIDENCE-BASED and traceable to a specific artifact.
- Be consistent: if L1 probed a skill deeply, say so clearly. Do not be vague.
- Be fair: if the client's rejection reason is vague or unfounded, call it out as "Invalid" or "Unjustified Rejection".
- Focus on WHAT THE PANEL DID OR DIDN'T DO, not just what the candidate said.

PROBING LEVEL DEFINITIONS (apply strictly):
- Excellent (9-10): Panel asked 3+ deep follow-up questions per critical area; covered all JD mandatory skills at depth.
- Good (7-8): Panel asked meaningful questions on most areas; minor gaps only.
- Adequate (5-6): Basic probing; surfaced skills but lacked follow-up depth.
- Weak (3-4): Only surface-level or shallow questions; multiple mandatory areas missed.
- Poor (0-2): Critical areas entirely absent; minimal technical probing.

REJECTION REASON VALIDITY:
- Valid: Client's stated reason directly matches documented weak performance in L1 or L2 transcripts.
- Partially Valid: Client's reason partially aligns with interview evidence, but some aspects are subjective or unclear.
- Invalid: Client's reason is unsupported, contradicted by interview evidence, or the candidate performed adequately in the cited area.

LEAKAGE VERDICTS:
- "L1 Leakage": L1 panel missed probing critical areas that client flagged; L2 was not at fault.
- "L2 Leakage": L2 panel missed probing critical areas; L1 was adequate.
- "Joint Failure": Both L1 and L2 failed to probe critical areas.
- "No Leakage": Both panels probed adequately; client rejection is due to subjective fit or requirements not in JD.
- "Unjustified Rejection": The client's stated reason is not supported by actual evidence from any artifact.

CRITICAL OUTPUT RULES:
- Return ONLY a valid JSON object. Absolutely no markdown, no explanation outside JSON.
- All string values must be JSON-safe (no raw newlines, no control characters).
- Every summary, note, and gap must be a COMPLETE professional sentence — not a fragment.
- crossArtifactEvidence: List at least 5 specific, cited points referencing exact artifacts.
- All arrays must have at least 1 item.`;

    const userPrompt = `/no_think

=== CANDIDATE IDENTITY CONFIRMED ===
Job ID: ${jobId}
Candidate Name: ${candidateName}
Rejection Document Identity Confirmation: ${identityConfirmation.confirmationStatus}
Note: ${identityConfirmation.confirmationNote}
File Name: ${feedbackFileName || 'Not provided'}

=== STAGE 1 — RESUME SCREENING RESULTS ===
JD (first 2500 chars):
${jdText.substring(0, 2500)}

Candidate Resume (first 2500 chars):
${resumeText.substring(0, 2500)}

Screening Match Score: ${s1Analysis.matchScore ?? 'N/A'}%
Screening Status: ${s1Analysis.status ?? 'N/A'}
Score Derivation: ${s1Analysis.scoreBreakdown?.formula || 'Not recorded (screened before tiered scoring).'}
${s1Analysis.skillsProvenance?.mandatoryInferred
  ? 'IMPORTANT: The JD stated NO mandatory skills. The mandatory skills below were INFERRED BY AI from the role, not taken from the JD. Weigh screening accuracy accordingly — a gap against an inferred skill is weaker evidence of a screening failure than a gap against a JD-stated one.'
  : 'Mandatory skills below were explicitly stated in the JD.'}

Mandatory Skills by evidence tier. STRONG = named and demonstrated with context. NONE = absent
from the resume. PARTIAL carries the credit it earned out of 1.0: 1.0 = the resume fully backs it
and only the screening model hedged; 0.75 = named but only named, no project or duration behind
it; 0.5 = the skill's own name is absent and the match was inferred from nearby text. A 0.5 is
the weakest evidence on this list — treat it as unverified rather than as a confirmed match:
${formatSkillTiers(s1Analysis.mandatorySkillsMatch)}

Good-to-Have Skills by evidence tier:
${formatSkillTiers(s1Analysis.additionalSkillsMatch)}
${(s1Analysis.reconciliation?.mandatoryMissing || []).length
  ? `NOTE: the screening model failed to report ${s1Analysis.reconciliation.mandatoryMissing.length} mandatory skill(s) and they were scored NONE by default: ${s1Analysis.reconciliation.mandatoryMissing.join(', ')}. Treat these as unexamined rather than as confirmed gaps.`
  : ''}
Screening Summary: ${s1Analysis.screeningSummary || 'Not available.'}
Experience Match: ${s1Analysis.experienceMatch || 'Not available.'}

=== STAGE 2 — L1 INTERVIEW EVALUATION ===
L1 Panel Score: ${l1Score}/10
L1 Panel Summary: ${l1Summary}
L1 Moderation Status: ${l1Moderation?.verdict || 'N/A'}
L1 Moderation Note: ${l1Moderation?.summary || 'N/A'}
L1 Category Scores (JSON): ${JSON.stringify(l1Categories, null, 2)}
L1 Dimension Summaries:
${Object.entries(l1DimSummaries).map(([k, v]) => `  - ${k}: ${v}`).join('\n') || 'Not available.'}
L1 Panel Recommendations:
${Array.isArray(l1Recommendations) ? l1Recommendations.map((r, i) => `  ${i+1}. ${r}`).join('\n') : 'Not available.'}

L1 Transcript (first 4000 chars):
${l1Transcript ? l1Transcript.substring(0, 4000) : 'Not available.'}

=== STAGE 3 — L2 INTERVIEW EVALUATION ===
L2 Panel Score: ${l2Score}/10
L2 Panel Summary: ${l2Summary}
L2 Moderation Status: ${l2Moderation?.verdict || 'N/A'}
L2 Moderation Note: ${l2Moderation?.summary || 'N/A'}
L2 Category Scores (JSON): ${JSON.stringify(l2Categories, null, 2)}
L2 Dimension Summaries:
${Object.entries(l2DimSummaries).map(([k, v]) => `  - ${k}: ${v}`).join('\n') || 'Not available.'}
L2 Panel Recommendations:
${Array.isArray(l2Recommendations) ? l2Recommendations.map((r, i) => `  ${i+1}. ${r}`).join('\n') : 'Not available.'}
Candidate Decision by L2 Panel: ${candidateStatus}

L2 Transcript (first 4500 chars):
${l2Transcript ? l2Transcript.substring(0, 4500) : 'Not available.'}

=== STAGE 4 — CLIENT REJECTION FEEDBACK ===
Filename: ${feedbackFileName || 'Not provided'}
${feedbackText.substring(0, 5000)}

=== YOUR AUDIT TASKS — Answer ALL of these ===

TASK 1 — SCREENING QUALITY: Was Stage 1 screening accurate for this JD and candidate? Did the screening correctly identify mandatory skill gaps or did it miss misalignments that led to client rejection?

TASK 2 — L1 PANEL PROBING QUALITY: Using the L1 transcript, assess how deeply the L1 panel probed each mandatory JD skill. Which areas were covered well and which were missed? Quote specific questions or lack thereof.

TASK 3 — L2 PANEL PROBING QUALITY: Using the L2 transcript, assess how deeply the L2 panel probed mandatory JD skills, system design, leadership, and advanced scenarios. Which areas were covered well and which were missed?

TASK 4 — PANEL SUMMARY ACCURACY: Were the L1 and L2 panel summaries accurate representations of what actually happened in the transcripts?

TASK 5 — REJECTION REASON VALIDATION: Based on ALL evidence (resume, JD, L1 and L2 transcripts, panel scores), is the client's stated rejection reason Valid, Partially Valid, or Invalid? Did the candidate actually demonstrate weakness in the areas cited?

TASK 6 — LEAKAGE VERDICT: Based on ALL evidence, what is the leakage verdict?

TASK 7 — CROSS-ARTIFACT EVIDENCE: List at least 5-7 specific evidence points, each referencing a specific artifact.

TASK 8 — RECOMMENDATIONS: Give precise, actionable recommendations for each stage.

Return ONLY this exact JSON structure (no markdown, no text outside JSON):
{
  "leakageVerdict": "<L1 Leakage|L2 Leakage|Joint Failure|No Leakage|Unjustified Rejection>",
  "overallAuditSummary": "<4-5 sentence comprehensive professional audit summary covering all pipeline stages, candidate performance, and client feedback validity>",

  "screeningAudit": {
    "verdict": "<Accurate|Missed Gaps|Over-screened>",
    "summary": "<2-3 sentence analysis of screening quality>",
    "gaps": ["<specific gap 1>", "<specific gap 2>"]
  },

  "l1Audit": {
    "probingLevel": "<Excellent|Good|Adequate|Weak|Poor>",
    "probingLevelScore": <0-10 integer>,
    "summary": "<3-4 sentence professional analysis of L1 panel probing quality, referencing specific parts of the transcript>",
    "strengths": ["<specific strength 1>", "<specific strength 2>"],
    "gaps": ["<specific gap 1>", "<specific gap 2>"],
    "panelSummaryAccuracy": "<Accurate|Partially Accurate|Inaccurate>",
    "panelSummaryNote": "<one complete sentence on whether the L1 panel summary accurately reflects what happened in the L1 transcript>"
  },

  "l2Audit": {
    "probingLevel": "<Excellent|Good|Adequate|Weak|Poor>",
    "probingLevelScore": <0-10 integer>,
    "summary": "<3-4 sentence professional analysis of L2 panel probing quality, referencing specific parts of the transcript>",
    "strengths": ["<specific strength 1>", "<specific strength 2>"],
    "gaps": ["<specific gap 1>", "<specific gap 2>"],
    "panelSummaryAccuracy": "<Accurate|Partially Accurate|Inaccurate>",
    "panelSummaryNote": "<one complete sentence on whether the L2 panel summary accurately reflects what happened in the L2 transcript>"
  },

  "rejectionReasonValidity": "<Valid|Partially Valid|Invalid>",
  "rejectionReasonAnalysis": "<3-4 sentence professional verdict on whether the client's rejection reason is well-grounded, referencing specific evidence from transcripts and JD>",

  "crossArtifactEvidence": [
    "<Evidence point 1 — [Artifact: JD/Resume/L1 Transcript/L2 Transcript/Client Feedback] specific observation>",
    "<Evidence point 2 — [Artifact: ...] specific observation>",
    "<Evidence point 3 — [Artifact: ...] specific observation>",
    "<Evidence point 4 — [Artifact: ...] specific observation>",
    "<Evidence point 5 — [Artifact: ...] specific observation>",
    "<Evidence point 6 — [Artifact: ...] specific observation>"
  ],

  "recommendations": {
    "screening": "<Specific actionable recommendation for Stage 1 screening improvement>",
    "l1Panel": "<Specific actionable recommendation for L1 panel probing improvement>",
    "l2Panel": "<Specific actionable recommendation for L2 panel probing improvement>",
    "process": "<Overall pipeline process improvement recommendation>"
  }
}`;

    let auditAnalysis = {
      leakageVerdict: 'No Leakage',
      overallAuditSummary: 'Client feedback reviewed. Audit could not be fully completed due to a processing error.',
      screeningAudit: { verdict: 'Accurate', summary: 'Screening data not available.', gaps: [] },
      l1Audit: { probingLevel: 'Adequate', probingLevelScore: 5, summary: 'L1 data not available.', strengths: [], gaps: [], panelSummaryAccuracy: 'Accurate', panelSummaryNote: 'N/A' },
      l2Audit: { probingLevel: 'Adequate', probingLevelScore: 5, summary: 'L2 data not available.', strengths: [], gaps: [], panelSummaryAccuracy: 'Accurate', panelSummaryNote: 'N/A' },
      rejectionReasonValidity: 'Partially Valid',
      rejectionReasonAnalysis: 'Rejection reason analysis could not be completed.',
      crossArtifactEvidence: ['Full audit data not available — please retry.'],
      recommendations: { screening: 'N/A', l1Panel: 'N/A', l2Panel: 'N/A', process: 'N/A' }
    };

    try {
      console.log(`[Stage4] Running comprehensive audit for jobId=${jobId} candidate="${candidateName}" identityStatus=${identityConfirmation.confirmationStatus}`);
      const llmResponse = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.1, maxTokens: 3000, think: false });
      const parsed = parseJSONSafely(llmResponse);
      if (parsed && parsed.leakageVerdict) {
        auditAnalysis = parsed;
        console.log(`[Stage4] Audit complete — verdict=${parsed.leakageVerdict} rejectionValid=${parsed.rejectionReasonValidity}`);
      } else {
        console.warn('[Stage4] LLM returned invalid structure, using fallback');
      }
    } catch (err) {
      console.error('[Stage4] LLM audit failed:', err.message);
    }

    // Written under the STORED spelling, with no upsert: whatever the user typed, this
    // updates the record the audit was actually built from and cannot conjure a second.
    const write = await pipelineCol.updateOne(
      { jobId: existing.jobId, candidateName: existing.candidateName },
      {
        $set: {
          stage4: {
            completed: true,
            completedAt: new Date().toISOString(),
            feedbackText,
            feedbackFileName,
            identityConfirmation,
            analysis: auditAnalysis
          },
          updatedAt: new Date()
        },
        $addToSet: { completedStages: 'stage4' }
      },
      { upsert: false, collation: IDENTITY_COLLATION }
    );

    // The audit runs for minutes; the record can be restarted or deleted in the meantime.
    // Reporting success on a write that stored nothing left the user looking at an audit
    // the database does not have, with no way to tell it had been dropped.
    if (write.matchedCount === 0) {
      console.error(`[Stage4] Record vanished mid-audit — jobId=${existing.jobId} candidate="${existing.candidateName}"`);
      return res.status(409).json({
        success: false,
        error: `The pipeline record for "${existing.candidateName}" was removed or restarted while the ` +
          `Stage 4 audit was running, so the result could not be saved. Re-run Stage 4.`,
        code: 'RECORD_VANISHED',
        retryable: false,
      });
    }

    return res.status(200).json({
      success: true,
      data: { auditAnalysis, identityConfirmation }
    });
  } catch (error) {
    console.error('[Stage4] Endpoint error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});



/**
 * POST /api/v1/pipeline/generate-l1-questions
 * Generate AI-recommended L1 interview questions based on JD + Resume
 */
router.post('/generate-l1-questions', async (req, res) => {
  try {
    const { jobId, candidateName } = req.body;

    if (!jobId || !candidateName) {
      return res.status(400).json({ success: false, error: 'jobId and candidateName are required' });
    }

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');
    const existing = await findPipelineRecord(pipelineCol, req.body);

    if (!existing?.stage1?.completed) {
      return res.status(400).json({ success: false, error: 'Stage 1 must be completed before generating L1 questions.' });
    }

    const jdText     = existing.stage1.jdText     || '';
    const resumeText = existing.stage1.resumeText  || '';
    const s1 = existing.stage1.analysis || {};
    const mandatorySkills = s1.mandatorySkills || [];
    const goodToHaveSkills = s1.goodToHaveSkills || [];

    // Skills the screening could not verify are the ones an L1 panel most needs to
    // probe — a STRONG match is already evidenced, a PARTIAL or NONE is an open
    // question. Passing the tiers turns generic coverage questions into questions
    // aimed at this candidate's actual gaps.
    //
    // A PARTIAL_HIGH belongs on this list despite earning full credit: full credit means
    // the resume backs the claim, not that anyone verified the depth. The grade goes with
    // it so the questions can be pitched at how thin the evidence actually is.
    const unverified = [...(s1.mandatorySkillsMatch || []), ...(s1.additionalSkillsMatch || [])]
      .filter(r => (r.tier || (r.matched ? 'STRONG' : 'NONE')) !== 'STRONG')
      .map(r => {
        const grade = gradeOf(r);
        // Same annotation the Stage 4 audit prompt uses, so one vocabulary covers both.
        return grade === 'NONE'
          ? `${r.skill} (NONE — no resume evidence)`
          : `${r.skill} (PARTIAL, credited ${GRADE_CREDIT[grade]} of 1.0)`;
      });

    const systemPrompt = `You are a world-class Senior Technical Recruiter and L1 Interview Coach with 15+ years of experience conducting structured technical interviews.

Your role is to generate highly targeted, professional interview questions for an L1 (first-round technical screening) interview. The questions must:
1. Be grounded STRICTLY in the candidate's actual resume skills and the JD's requirements
2. Progress from basic verification to depth-probing
3. Test both breadth (did the candidate do this?) and depth (how deeply do they understand it?)
4. Include scenario-based questions to reveal practical problem-solving ability
5. Be professional, open-ended, and non-leading

Return ONLY a valid JSON object. No markdown, no explanation outside JSON.`;

    const userPrompt = `/no_think

=== JOB DESCRIPTION (Key Requirements) ===
${jdText.substring(0, 3000)}

=== MANDATORY SKILLS ===
${mandatorySkills.join(', ')}${s1.skillsProvenance?.mandatoryInferred
  ? '\n(NOTE: the JD did not state mandatory skills — these were inferred by AI from the role. Prefer questions grounded in the resume and the JD text over questions that assume these skills are hard requirements.)'
  : ''}

=== SKILLS THE SCREENING COULD NOT FULLY VERIFY (probe these hardest) ===
${unverified.length ? unverified.join(', ') : '(none — every skill was strongly evidenced in the resume)'}

=== GOOD-TO-HAVE SKILLS ===
${goodToHaveSkills.join(', ')}

=== CANDIDATE RESUME ===
${resumeText.substring(0, 4000)}

=== YOUR TASK ===
Generate exactly 3 categories of questions, totaling 12-15 questions. Each question must be specific to THIS candidate's resume and THIS JD.

Category 1: "Mandatory Skill Verification" (5-6 questions)
- One focused question per mandatory skill listed in the JD
- Should verify the candidate's resume claims about each skill
- Example frame: "Your resume mentions [specific claim from resume] — can you walk me through..."

Category 2: "Technical Depth & Scenarios" (4-5 questions)
- Scenario-based and problem-solving questions
- Should expose how deeply the candidate can think through real-world challenges
- Must relate to the actual role requirements and the candidate's claimed experience
- Example frame: "If you encountered [real-world scenario relevant to their claimed work]..."

Category 3: "Resume Verification & Behavioral" (3-4 questions)
- Questions that probe specific projects, achievements, and claims from the resume
- Should encourage the candidate to narrate concrete experiences
- Example frame: "You mentioned [specific project/role from resume] — tell me about..."

For each question, provide a "rationale" explaining why this question is important for evaluating this specific candidate against this JD.

Return this exact JSON schema:
{
  "categories": [
    {
      "title": "Mandatory Skill Verification",
      "icon": "shield",
      "questions": [
        {
          "q": "<Full interview question text>",
          "rationale": "<Why this question matters for this specific candidate/role>"
        }
      ]
    },
    {
      "title": "Technical Depth & Scenarios",
      "icon": "zap",
      "questions": [
        {
          "q": "<Full interview question text>",
          "rationale": "<Why this question matters for this specific candidate/role>"
        }
      ]
    },
    {
      "title": "Resume Verification & Behavioral",
      "icon": "user",
      "questions": [
        {
          "q": "<Full interview question text>",
          "rationale": "<Why this question matters for this specific candidate/role>"
        }
      ]
    }
  ]
}`;

    console.log(`[GenerateL1Qs] jobId=${jobId} candidate="${candidateName}"`);

    const llmResponse = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.3, maxTokens: 2500, think: false });

    const parsed = parseJSONSafely(llmResponse);

    if (!parsed?.categories || !Array.isArray(parsed.categories)) {
      return res.status(500).json({ success: false, error: 'LLM returned invalid question structure.' });
    }

    console.log(`[GenerateL1Qs] Generated ${parsed.categories.reduce((acc, c) => acc + c.questions.length, 0)} questions`);

    return res.status(200).json({ success: true, data: parsed });
  } catch (error) {
    console.error('[GenerateL1Qs] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/pipeline/score/job/:jobId
 * Poll for async stage2/3 jobs
 *
 * A FAILED job is reported as 200 with status:'failed', not 5xx. The poll itself
 * succeeded — it is answering "how is the job doing?" and the answer is "it failed",
 * which is not a transport error. That distinction is not pedantic: returning 500
 * here made axios reject, so pipeline.api.ts never reached its own
 * `status === 'failed'` branch and the real diagnostic in `job.error` was replaced by
 * axios's generic "Request failed with status code 500", while the response
 * interceptor showed "Server error. Please try again later.".
 *
 * l1ScoringService goes to real trouble to say WHY a run failed — done_reason=length
 * vs a JSON syntax error vs prose instead of JSON, each with a different fix, plus the
 * response tail. All of it was being discarded at this line, which is why the same
 * failure kept coming back: nobody could see what it was.
 */
router.get('/score/job/:jobId', (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  if (job.status === 'processing') return res.status(202).json({ success: true, status: 'processing' });
  if (job.status === 'failed') {
    return res.status(200).json({
      success: false,
      status: 'failed',
      error: job.error,
      code: job.code || 'STAGE_FAILED',
      retryable: job.retryable !== false,
    });
  }
  return res.status(200).json({ ...job.data, status: 'complete' });
});

/**
 * GET /api/v1/pipeline/candidates
 * Fetch all candidates in the 4-stage pipeline
 */
router.get('/candidates', async (req, res) => {
  try {
    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');

    const list = await pipelineCol.find({})
      .sort({ updatedAt: -1 })
      .toArray();

    // Records already split by the old upsert behaviour are still in the collection, and
    // the fix above stops new ones without healing existing ones. Group by the folded
    // identity so the two halves of one candidate can be marked as such in the UI
    // instead of reading as two separate people with contradictory progress.
    const foldedCounts = new Map();
    for (const doc of list) {
      const key = `${String(doc.jobId || '').trim().toLowerCase()}__` +
        `${String(doc.candidateName || '').trim().replace(/\s+/g, ' ').toLowerCase()}`;
      foldedCounts.set(key, (foldedCounts.get(key) || 0) + 1);
    }

    const formatted = list.map(doc => {
      // Calculate latest/average scores if available
      let latestScore = null;
      if (doc.stage3?.completed && doc.stage3?.evaluation?.score) {
        latestScore = doc.stage3.evaluation.score;
      } else if (doc.stage2?.completed && doc.stage2?.evaluation?.score) {
        latestScore = doc.stage2.evaluation.score;
      }

      const foldedKey = `${String(doc.jobId || '').trim().toLowerCase()}__` +
        `${String(doc.candidateName || '').trim().replace(/\s+/g, ' ').toLowerCase()}`;

      return {
        id: doc._id.toString(),
        jobId: doc.jobId,
        candidateName: doc.candidateName,
        panelName: doc.panelName || 'N/A',
        panelEmail: doc.panelEmail || 'N/A',
        panelId: doc.panelId || 'N/A',
        completedStages: doc.completedStages || [],
        latestScore,
        updatedAt: doc.updatedAt,
        stage1Status: doc.stage1?.completed ? 'completed' : 'pending',
        stage2Status: doc.stage2?.completed ? 'completed' : 'pending',
        stage3Status: doc.stage3?.completed ? 'completed' : 'pending',
        stage4Status: doc.stage4?.completed ? 'completed' : 'pending',
        // true when another record exists for the same candidate under the same JD,
        // differing only in case or spacing — i.e. this row is one half of a split
        // pipeline and its missing stages are on the sibling row.
        duplicateIdentity: (foldedCounts.get(foldedKey) || 0) > 1
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Error listing pipeline candidates:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/pipeline/candidate
 * Fetch full details for a candidate in the pipeline
 */
router.get('/candidate', async (req, res) => {
  try {
    const { jobId, candidateName } = req.query;

    if (!jobId || !candidateName) {
      return res.status(400).json({
        success: false,
        error: 'Missing query parameters: jobId, candidateName'
      });
    }

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');

    // Case-insensitive, so the detail view resolves the same record the frontend's own
    // case-folded cache believes it is showing.
    const candidate = await findPipelineRecord(pipelineCol, { jobId, candidateName });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found in pipeline'
      });
    }

    return res.status(200).json({
      success: true,
      data: candidate
    });
  } catch (error) {
    console.error('Error fetching pipeline candidate:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pipeline/restart
 * Restart entire candidate evaluation (delete all data)
 */
router.post('/restart', async (req, res) => {
  try {
    const { jobId, candidateName } = req.body;

    if (!jobId || !candidateName) {
      return res.status(400).json({
        success: false,
        error: 'jobId and candidateName are required'
      });
    }

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');

    // deleteOne, not deleteMany: matching case-insensitively could now span more than
    // one legacy document, and a restart must not silently take out a record the user
    // cannot see. Run scripts/merge_split_pipelines.js to consolidate those first.
    const result = await pipelineCol.deleteOne(
      identityFilter({ jobId, candidateName }),
      { collation: IDENTITY_COLLATION }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found in pipeline'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Candidate evaluation restarted successfully'
    });
  } catch (error) {
    console.error('Error restarting candidate:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pipeline/restart-stage
 * Restart from a specific stage (delete data from that stage onwards)
 */
router.post('/restart-stage', async (req, res) => {
  try {
    const { jobId, candidateName, stageId } = req.body;

    if (!jobId || !candidateName || !stageId) {
      return res.status(400).json({
        success: false,
        error: 'jobId, candidateName, and stageId are required'
      });
    }

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');

    // Map stage IDs to fields to unset
    const stageFieldsMap = {
      stage1: ['stage1', 'stage2', 'stage3', 'stage4'],
      stage2: ['stage2', 'stage3', 'stage4'],
      stage3: ['stage3', 'stage4'],
      stage4: ['stage4']
    };

    const fieldsToUnset = stageFieldsMap[stageId];
    if (!fieldsToUnset) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stageId. Must be one of: stage1, stage2, stage3, stage4'
      });
    }

    // Build the $unset operation
    const unsetOperation = {};
    fieldsToUnset.forEach(field => {
      unsetOperation[field] = '';
    });

    // Also update completedStages array
    const result = await pipelineCol.updateOne(
      identityFilter({ jobId, candidateName }),
      {
        $unset: unsetOperation,
        $pull: {
          completedStages: { $in: fieldsToUnset }
        },
        $set: {
          updatedAt: new Date()
        }
      },
      { collation: IDENTITY_COLLATION }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found in pipeline'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully restarted from ${stageId}`
    });
  } catch (error) {
    console.error('Error restarting from stage:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
