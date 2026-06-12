const express = require('express');
const router = express.Router();
const { getDb } = require('../services/mongoClient');
const { performPanelEvaluation } = require('../services/panelEvaluationService');
const { runL1Evaluation } = require('../services/l1ScoringService');   // NEW Stage-2 service
const { runL2Evaluation } = require('../services/l2ScoringService');   // NEW Stage-3 service
const { analyzeJD } = require('../services/jdAnalyzerService');
const { callLLM } = require('../services/llmClient');
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
 * Helper to parse JSON safely from LLM response
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
 * Save Stage 1 and analyze resume against JD
 */
router.post('/stage1', async (req, res) => {
  try {
    const {
      jobId, candidateName,
      panelName = '', panelEmail = '', panelId = '',
      jdText = '', resumeText = ''
    } = req.body;

    if (!jobId || !candidateName) {
      return res.status(400).json({
        success: false,
        error: 'jobId and candidateName are required'
      });
    }

    console.log(`[Stage1] jobId=${jobId} candidate="${candidateName}" jdLen=${jdText.length} resumeLen=${resumeText.length}`);

    // ─── Step 1: Extract JD Skills ─────────────────────────────────────────
    let mandatorySkills = [];
    let goodToHaveSkills = [];
    let keySkills = [];

    if (jdText.trim()) {
      try {
        const jdAnalysis = await analyzeJD(jdText);
        if (jdAnalysis.success && jdAnalysis.parsed_analysis) {
          mandatorySkills = jdAnalysis.parsed_analysis.mandatory_skills || [];
          goodToHaveSkills = jdAnalysis.parsed_analysis.good_to_have_skills || [];
          keySkills = jdAnalysis.parsed_analysis.key_skills || [];
        }
        console.log(`[Stage1] JD skills extracted — mandatory: ${mandatorySkills.length}, good-to-have: ${goodToHaveSkills.length}`);
      } catch (err) {
        console.error('[Stage1] JD analysis failed:', err.message);
      }
    }

    // Fallback skills if JD analysis returned nothing
    if (mandatorySkills.length === 0) mandatorySkills = ['Communication', 'Technical Adaptability', 'Problem Solving'];
    if (goodToHaveSkills.length === 0) goodToHaveSkills = ['Agile / Scrum', 'Documentation'];

    // ─── Step 2: LLM Resume vs JD Screening ────────────────────────────────
    // Default: if no texts, store a "pending extraction" placeholder
    let screeningAnalysis = {
      mandatorySkillsMatch: mandatorySkills.map(s => ({
        skill: s, matched: false, evidence: 'Resume or JD text not extracted — please re-upload.'
      })),
      additionalSkillsMatch: goodToHaveSkills.map(s => ({
        skill: s, matched: false, evidence: 'Resume or JD text not extracted — please re-upload.'
      })),
      screeningSummary: 'Document text could not be extracted. Please re-upload valid PDF or DOCX files.',
      matchScore: 0,
      experienceMatch: 'Unable to determine — document extraction failed.',
      status: 'Partially Eligible'
    };

    if (jdText.trim() && resumeText.trim()) {
      // ── Improved LLM Prompt ──────────────────────────────────────────────
      const systemPrompt = `You are a senior technical recruiter with 15+ years of experience. 
Your task is to perform a precise resume-to-JD skills matching evaluation.
You MUST read the actual resume content carefully and identify real evidence.
Return ONLY a valid JSON object. No markdown, no explanations outside JSON.
All string values must be JSON-safe (no raw newlines).`;

      const userPrompt = `/no_think

=== JOB DESCRIPTION ===
${jdText.substring(0, 4000)}

=== MANDATORY SKILLS TO EVALUATE ===
${mandatorySkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}

=== GOOD-TO-HAVE SKILLS TO EVALUATE ===
${goodToHaveSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}

=== CANDIDATE RESUME ===
${resumeText.substring(0, 5000)}

=== YOUR TASK ===
1. For EACH mandatory skill: read the resume carefully and determine if the candidate has this skill.
   - Set "matched": true only if there is CLEAR evidence in the resume.
   - Write a brief "evidence" quoting or paraphrasing the specific resume line that proves it.
   - If not found, set "matched": false and write "Not found in resume."

2. For EACH good-to-have skill: same approach.

3. Calculate matchScore (0-100):
   - Formula: (mandatoryMatched / totalMandatory * 70) + (goodToHaveMatched / totalGoodToHave * 30)
   - Round to nearest integer.

4. Determine status:
   - "Eligible" if matchScore >= 70
   - "Partially Eligible" if matchScore >= 40
   - "Ineligible" if matchScore < 40

5. Write a screeningSummary (2-3 sentences) summarising the candidate's overall fit.
6. Write experienceMatch describing how their total years of experience compares to JD requirements.

Return this exact JSON structure:
{
  "mandatorySkillsMatch": [
    { "skill": "<skill name>", "matched": true, "evidence": "<specific resume evidence>" }
  ],
  "additionalSkillsMatch": [
    { "skill": "<skill name>", "matched": false, "evidence": "Not found in resume." }
  ],
  "screeningSummary": "<2-3 sentence overall summary>",
  "matchScore": <integer 0-100>,
  "experienceMatch": "<experience comparison sentence>",
  "status": "Eligible"
}`;

      try {
        console.log('[Stage1] Calling LLM for screening analysis...');
        const llmResponse = await callLLM([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], { temperature: 0.1, maxTokens: 1500, think: false });

        console.log('[Stage1] LLM response received, parsing JSON...');
        const parsed = parseJSONSafely(llmResponse);
        if (parsed && typeof parsed.matchScore === 'number') {
          screeningAnalysis = parsed;
          console.log(`[Stage1] Screening complete — matchScore=${parsed.matchScore} status=${parsed.status}`);
        } else {
          console.warn('[Stage1] LLM returned invalid structure, using fallback');
        }
      } catch (err) {
        console.error('[Stage1] LLM screening failed:', err.message);
      }
    } else {
      console.warn(`[Stage1] Skipping LLM — jdText empty: ${!jdText.trim()}, resumeText empty: ${!resumeText.trim()}`);
    }

    // ─── Step 3: Store / Upsert in MongoDB ─────────────────────────────────
    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');
    const filter = { jobId, candidateName };

    await pipelineCol.updateOne(filter, {
      $set: {
        jobId,
        candidateName,
        panelName: panelName || '',
        panelEmail: panelEmail || '',
        panelId: panelId || '',
        stage1: {
          completed: true,
          completedAt: new Date().toISOString(),
          jdText,
          resumeText,
          analysis: {
            mandatorySkills,
            goodToHaveSkills,
            keySkills,
            ...screeningAnalysis
          }
        },
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date(),
        completedStages: ['stage1']
      }
    }, { upsert: true });

    // Ensure completedStages includes 'stage1'
    const doc = await pipelineCol.findOne(filter);
    if (doc && !doc.completedStages.includes('stage1')) {
      await pipelineCol.updateOne(filter, { $addToSet: { completedStages: 'stage1' } });
    }

    console.log(`[Stage1] Saved to MongoDB — jobId=${jobId} candidate="${candidateName}"`);

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
      jobId, candidateName,
      panelName = '', panelEmail = '', panelId = '',
      l1Transcript
    } = req.body;

    if (!jobId || !candidateName || !l1Transcript) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jobId, candidateName, l1Transcript'
      });
    }

    console.log(`[Stage2] jobId=${jobId} candidate="${candidateName}" transcriptLen=${l1Transcript.length}`);

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');
    const existing = await pipelineCol.findOne({ jobId, candidateName });

    // Pull JD + resume from Stage 1 record
    const jdText     = existing?.stage1?.jdText     || '';
    const resumeText = existing?.stage1?.resumeText  || '';

    // Start async job immediately — return jobId to frontend
    const asyncJobId = randomUUID();
    jobStore.set(asyncJobId, { status: 'processing', createdAt: Date.now() });

    // Fire and forget — run full L1 evaluation in background
    runL1Evaluation({
      jobId,
      candidateName,
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
        await pipelineCol.updateOne(
          { jobId, candidateName },
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
          { upsert: true }
        );

        jobStore.set(asyncJobId, {
          status: 'complete',
          createdAt: Date.now(),
          data: { success: true, evaluation: result.evaluation }
        });

        console.log(`[Stage2] Saved to MongoDB — jobId=${jobId} score=${result.evaluation.score}`);
      })
      .catch(err => {
        console.error('[Stage2] Evaluation error:', err.message);
        jobStore.set(asyncJobId, { status: 'failed', error: err.message, createdAt: Date.now() });
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
    const { jobId, candidateName, panelName, panelEmail, panelId, l2Transcript, candidateStatus = 'Selected' } = req.body;

    if (!jobId || !candidateName || !l2Transcript) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: jobId, candidateName, l2Transcript'
      });
    }

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');
    const existing = await pipelineCol.findOne({ jobId, candidateName });

    const jdText = existing?.stage1?.jdText || 'General Software Engineering Job Description';
    const resumeText = existing?.stage1?.resumeText || '';
    const l1Transcript = existing?.stage2?.l1Transcript || '';

    const asyncJobId = randomUUID();
    jobStore.set(asyncJobId, { status: 'processing', createdAt: Date.now() });

    runL2Evaluation({
      jobId,
      candidateName,
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
        await pipelineCol.updateOne(
          { jobId, candidateName },
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
                evaluation: result.evaluation,
                moderation: result.moderation
              },
              updatedAt: new Date()
            },
            $addToSet: { completedStages: 'stage3' }
          },
          { upsert: true }
        );

        jobStore.set(asyncJobId, {
          status: 'complete',
          createdAt: Date.now(),
          data: {
            success: true,
            evaluation: result.evaluation
          }
        });
      })
      .catch(err => {
        console.error('[Stage3] Evaluation error:', err.message);
        jobStore.set(asyncJobId, { status: 'failed', error: err.message, createdAt: Date.now() });
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
    const { jobId, candidateName, feedbackText, feedbackFileName = '' } = req.body;

    if (!jobId || !candidateName || !feedbackText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: jobId, candidateName, feedbackText'
      });
    }

    const db = await getDb();
    const pipelineCol = db.collection('pipeline_evaluations');
    const existing = await pipelineCol.findOne({ jobId, candidateName });

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
Mandatory Skills Matched: ${(s1Analysis.mandatorySkillsMatch || []).filter(s => s.matched).map(s => s.skill).join(', ') || 'None identified'}
Mandatory Skills Missed: ${(s1Analysis.mandatorySkillsMatch || []).filter(s => !s.matched).map(s => s.skill).join(', ') || 'None'}
Good-to-Have Skills Matched: ${(s1Analysis.additionalSkillsMatch || []).filter(s => s.matched).map(s => s.skill).join(', ') || 'None'}
Good-to-Have Skills Missed: ${(s1Analysis.additionalSkillsMatch || []).filter(s => !s.matched).map(s => s.skill).join(', ') || 'None'}
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

    await pipelineCol.updateOne(
      { jobId, candidateName },
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
      }
    );

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
    const existing = await pipelineCol.findOne({ jobId, candidateName });

    if (!existing?.stage1?.completed) {
      return res.status(400).json({ success: false, error: 'Stage 1 must be completed before generating L1 questions.' });
    }

    const jdText     = existing.stage1.jdText     || '';
    const resumeText = existing.stage1.resumeText  || '';
    const mandatorySkills = existing.stage1.analysis?.mandatorySkills || [];
    const goodToHaveSkills = existing.stage1.analysis?.goodToHaveSkills || [];

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
${mandatorySkills.join(', ')}

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
 */
router.get('/score/job/:jobId', (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  if (job.status === 'processing') return res.status(202).json({ success: true, status: 'processing' });
  if (job.status === 'failed') return res.status(500).json({ success: false, status: 'failed', error: job.error });
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

    const formatted = list.map(doc => {
      // Calculate latest/average scores if available
      let latestScore = null;
      if (doc.stage3?.completed && doc.stage3?.evaluation?.score) {
        latestScore = doc.stage3.evaluation.score;
      } else if (doc.stage2?.completed && doc.stage2?.evaluation?.score) {
        latestScore = doc.stage2.evaluation.score;
      }

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
        stage4Status: doc.stage4?.completed ? 'completed' : 'pending'
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

    const candidate = await pipelineCol.findOne({
      jobId: jobId.trim(),
      candidateName: candidateName.trim()
    });

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

module.exports = router;
