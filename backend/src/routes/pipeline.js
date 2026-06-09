const express = require('express');
const router = express.Router();
const { getDb } = require('../services/mongoClient');
const { performPanelEvaluation } = require('../services/panelEvaluationService');
const { runL1Evaluation } = require('../services/l1ScoringService');   // NEW Stage-2 service
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
    const { jobId, candidateName, panelName, panelEmail, panelId, l2Transcript } = req.body;

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
    // Use Stage 2 transcript or default empty
    const l1Transcript = existing?.stage2?.l1Transcript || '';

    const asyncJobId = randomUUID();
    jobStore.set(asyncJobId, { status: 'processing', createdAt: Date.now() });

    performPanelEvaluation({
      job_id: jobId,
      panel_name: panelName || existing?.panelName || 'L2 Panel',
      candidate_name: candidateName,
      jd: jdText,
      // For Stage 3, the L2 Rejection/Transcript plays the role of the validation alignment check.
      // To run L2 scoring correctly, we treat it as an L2 validation evaluation.
      l1_transcripts: [l1Transcript || l2Transcript],
      l2_rejection_reasons: [l2Transcript],
      panel_member_id: panelId || existing?.panelId || '',
      panel_member_email: panelEmail || existing?.panelEmail || ''
    })
      .then(async (result) => {
        if (!result.success) {
          jobStore.set(asyncJobId, { status: 'failed', error: result.error, createdAt: Date.now() });
          return;
        }

        // Save result in MongoDB stage3
        await pipelineCol.updateOne(
          { jobId, candidateName },
          {
            $set: {
              stage3: {
                completed: true,
                completedAt: new Date().toISOString(),
                l2Transcript,
                evaluation: result.evaluation
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
 * Save Stage 4 and audit leakage
 */
router.post('/stage4', async (req, res) => {
  try {
    const { jobId, candidateName, feedbackText } = req.body;

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

    const stage2Eval = existing?.stage2?.evaluation || {};
    const stage3Eval = existing?.stage3?.evaluation || {};

    const systemPrompt = `You are a Senior Technical Recruiter and Quality Auditor. Match client feedback against the L1 (Stage 2) and L2 (Stage 3) interview scores to audit for leakage. Return ONLY a valid JSON object matching the exact schema. Ensure all strings are JSON-safe.`;
    const userPrompt = `/no_think
Audit the L1 and L2 evaluations against client feedback to determine if there was interview leakage.

L1 (Stage 2) Evaluation summary:
Score: ${stage2Eval.score || 'N/A'}/10
Categories: ${JSON.stringify(stage2Eval.categories || {})}
Summary: ${stage2Eval.panel_summary || 'No L1 evaluation details available.'}

L2 (Stage 3) Evaluation summary:
Score: ${stage3Eval.score || 'N/A'}/10
Categories: ${JSON.stringify(stage3Eval.categories || {})}
Summary: ${stage3Eval.panel_summary || 'No L2 evaluation details available.'}

Client Feedback / Audit text:
${feedbackText.substring(0, 8000)}

Determine:
1. Leakage Verdict:
   - "L1 Leakage" (if L1 missed checking or failed to probe critical technical areas mentioned in client feedback)
   - "L2 Leakage" (if L2 missed checking or failed to probe critical technical areas mentioned in client feedback)
   - "Joint Failure" (if both L1 & L2 failed to probe/evaluate these areas properly)
   - "No Leakage" (if both probed properly and the client's rejection was due to subjective differences or new requirements)
2. Detailed audit explanation.
3. Specific evidence quotes or bullet points comparing feedback to transcripts/evaluations.

Return JSON matching this schema:
{
  "leakageVerdict": "L1 Leakage" | "L2 Leakage" | "Joint Failure" | "No Leakage",
  "leakageSummary": "Provide a detailed summary auditing the panel members' performance against client feedback.",
  "evidence": [
    "Evidence quote/point 1",
    "Evidence quote/point 2"
  ]
}
`;

    let auditAnalysis = {
      leakageVerdict: 'No Leakage',
      leakageSummary: 'Client feedback reviewed and matching L1/L2 details.',
      evidence: ['Feedback aligned with stage evaluation findings.']
    };

    try {
      const llmResponse = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.1, maxTokens: 1000 });
      const parsed = parseJSONSafely(llmResponse);
      if (parsed) auditAnalysis = parsed;
    } catch (err) {
      console.error('LLM Stage 4 audit failed:', err.message);
    }

    await pipelineCol.updateOne(
      { jobId, candidateName },
      {
        $set: {
          stage4: {
            completed: true,
            completedAt: new Date().toISOString(),
            feedbackText,
            analysis: auditAnalysis
          },
          updatedAt: new Date()
        },
        $addToSet: { completedStages: 'stage4' }
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        auditAnalysis
      }
    });
  } catch (error) {
    console.error('Error in stage4 pipeline endpoint:', error);
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
