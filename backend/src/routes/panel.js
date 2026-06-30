/**
 * Panel Evaluation Routes
 * 
 * Endpoints for panel scoring and L2 validation
 */

const express = require('express');
const router = express.Router();
const { performPanelEvaluation, validateL2Rejection, PANEL_DIMENSIONS } = require('../services/panelEvaluationService');
const { randomUUID } = require('crypto');

// In-memory job store for async evaluation jobs (cleaned up after 30 min)
const jobStore = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobStore.entries()) {
    if (job.createdAt < cutoff) jobStore.delete(id);
  }
}, 5 * 60 * 1000);

/**
 * GET /api/v1/panel/check-existing
 * 
 * Check if an evaluation already exists for the given Job Interview ID + Panel Name + Candidate Name
 * Query params: job_id, panel_name, candidate_name
 */
router.get('/check-existing', async (req, res) => {
  try {
    const { job_id, panel_name, candidate_name } = req.query;

    if (!job_id || !panel_name || !candidate_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: job_id, panel_name, candidate_name',
        timestamp: new Date().toISOString()
      });
    }

    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const existingEval = await evalCollection.findOne({
      'Job Interview ID': job_id,
      'Panel Name': panel_name,
      'Candidate Name': candidate_name
    });

    return res.status(200).json({
      success: true,
      exists: !!existingEval,
      evaluation: existingEval ? {
        _id: existingEval._id.toString(),
        jobId: existingEval['Job Interview ID'],
        panelName: existingEval['Panel Name'],
        candidateName: existingEval['Candidate Name'],
        score: existingEval.score,
        confidence: existingEval.confidence,
        categories: existingEval.categories,
        evidence: existingEval.evidence,
        evaluatedAt: existingEval.evaluated_at
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to check existing evaluation',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/v1/panel/score
 * 
 * Perform panel evaluation scoring based on transcripts and JD
 */
router.post('/score', async (req, res) => {
  try {
    const { job_id, panel_name, candidate_name, jd, l1_transcripts, l2_rejection_reasons, panel_member_id, panel_member_email } = req.body;

    // Validate required parameters
    if (!job_id || !jd || !l1_transcripts) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: job_id, jd, l1_transcripts',
        timestamp: new Date().toISOString()
      });
    }

    if (!Array.isArray(l1_transcripts) || l1_transcripts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'l1_transcripts must be a non-empty array of strings',
        timestamp: new Date().toISOString()
      });
    }

    // Check if this evaluation already exists (DUPLICATE CHECK)
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const existingEval = await evalCollection.findOne({
      'Job Interview ID': job_id,
      'Panel Name': panel_name,
      'Candidate Name': candidate_name
    });

    // If already evaluated, return cached result without calling LLM
    if (existingEval) {
      return res.status(200).json({
        success: true,
        job_id,
        is_cached: true,
        cached_message: 'This interview has already been evaluated. Showing cached result.',
        panel_score: existingEval.score,
        confidence: existingEval.confidence,
        category_scores: existingEval.categories,
        probing_verdict: existingEval.probing_verdict || 'CACHED',
        evidence_count: (existingEval.evidence || []).length,
        l2_validation: existingEval.l2_validation,
        full_evaluation: {
          score: existingEval.score,
          confidence: existingEval.confidence,
          categories: existingEval.categories,
          evidence: existingEval.evidence,
          probing_verdict: existingEval.probing_verdict || 'CACHED',
          l2_validation: existingEval.l2_validation
        },
        timestamp: existingEval.evaluated_at || new Date().toISOString()
      });
    }

    // Kick off async evaluation and return a job ID immediately
    const asyncJobId = randomUUID();
    jobStore.set(asyncJobId, { status: 'processing', createdAt: Date.now() });

    performPanelEvaluation({ job_id, panel_name, candidate_name, jd, l1_transcripts, l2_rejection_reasons, panel_member_id, panel_member_email })
      .then(result => {
        if (!result.success) {
          jobStore.set(asyncJobId, { status: 'failed', error: result.error, error_code: result.error_code, createdAt: Date.now() });
          return;
        }
        jobStore.set(asyncJobId, {
          status: 'complete',
          createdAt: Date.now(),
          data: {
            success: true,
            job_id,
            is_cached: false,
            panel_score: result.evaluation.score,
            confidence: result.evaluation.confidence,
            category_scores: result.evaluation.categories,
            probing_verdict: result.evaluation.probing_verdict,
            evidence_count: result.evaluation.evidence.length,
            l2_validation: result.evaluation.l2_validation,
            refined_jd: result.refined_jd,
            panel_summary: result.panel_summary,
            gap_analysis: result.gap_analysis,
            moderation: result.moderation,
            full_evaluation: result.evaluation,
            timestamp: result.timestamp
          }
        });
      })
      .catch(err => {
        jobStore.set(asyncJobId, { status: 'failed', error: err.message, createdAt: Date.now() });
      });

    return res.status(202).json({ success: true, async_job_id: asyncJobId, status: 'processing' });
  } catch (error) {
    console.error('Error in /score endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during panel scoring',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/score/job/:jobId
 * Poll for async evaluation result
 */
router.get('/score/job/:jobId', (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  if (job.status === 'processing') return res.status(202).json({ success: true, status: 'processing' });
  if (job.status === 'failed') {
    return res.status(job.error_code === 429 ? 429 : 503).json({ success: false, status: 'failed', error: job.error });
  }
  return res.status(200).json({ ...job.data, status: 'complete' });
});

/**
 * POST /api/v1/panel/validate-l2
 * 
 * Validate L2 rejection reasons against L1 transcripts
 */
router.post('/validate-l2', async (req, res) => {
  try {
    const { job_id, l2_reason, l1_transcripts } = req.body;

    // Validate required parameters
    if (!job_id || !l2_reason || !l1_transcripts) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: job_id, l2_reason, l1_transcripts',
        timestamp: new Date().toISOString()
      });
    }

    if (!Array.isArray(l1_transcripts) || l1_transcripts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'l1_transcripts must be a non-empty array',
        timestamp: new Date().toISOString()
      });
    }

    // Perform validation
    const result = await validateL2Rejection({
      job_id,
      l2_reason,
      l1_transcripts
    });

    if (!result.success) {
      if (result.error_code === 429) {
        return res.status(429).json(result);
      }
      return res.status(503).json(result);
    }

    return res.status(200).json({
      success: true,
      job_id,
      l2_reason,
      probing_verdict: result.validation.probing_verdict,
      confidence: result.validation.confidence,
      evidence_found: result.validation.evidence?.length || 0,
      validation_notes: result.validation.notes,
      full_validation: result.validation,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Error in /validate-l2 endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during L2 validation',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/dimensions
 * 
 * Get panel scoring dimensions and weights
 */
router.get('/dimensions', (req, res) => {
  try {
    const dimensions = {};
    for (const [name, config] of Object.entries(PANEL_DIMENSIONS)) {
      dimensions[name] = {
        max_score: config.max,
        weight: config.weight,
        weight_percentage: `${Math.round(config.weight * 100)}%`
      };
    }

    return res.status(200).json({
      success: true,
      dimensions: dimensions,
      total_weight: Object.values(PANEL_DIMENSIONS).reduce((sum, d) => sum + d.weight, 0),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve dimensions',
      details: error.message
    });
  }
});

/**
 * GET /api/v1/panel/health
 * 
 * Health check for panel evaluation service
 */
router.get('/health', (req, res) => {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL_NAME;

    return res.status(200).json({
      success: true,
      service: 'panel-evaluator',
      status: 'healthy',
      configuration: {
        groq_configured: !!groqApiKey,
        groq_model: groqModel || 'not configured',
        dimensions_loaded: Object.keys(PANEL_DIMENSIONS).length,
        schema_validated: true
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

/**
 * GET /api/v1/panel/debug/sample
 * 
 * Get a sample document from panel_collection for debugging
 */
router.get('/debug/sample', async (req, res) => {
  try {
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const collection = db.collection('panel_collection');

    const sample = await collection.findOne();
    const totalDocs = await collection.countDocuments();
    const docsWithScore = await collection.countDocuments({ score: { $exists: true, $ne: null } });

    return res.status(200).json({
      success: true,
      total_documents: totalDocs,
      documents_with_score: docsWithScore,
      sample_document: sample,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to get sample',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/stats
 * 
 * Get dashboard statistics (unique evaluations count, average score, etc.)
 * Now counts unique combinations of Job Interview ID + Panel Name + Candidate Name
 */
router.get('/stats', async (req, res) => {
  try {
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    // Get all evaluations with distinct job_id, panel_name, candidate_name combinations
    const allEvaluations = await evalCollection.find({}).toArray();
    
    // Create a set of unique combinations
    const uniqueCombinations = new Set();
    let totalScore = 0;
    let scoreCount = 0;
    let mostRecentDate = null;

    for (const doc of allEvaluations) {
      const key = `${doc['Job Interview ID']}|${doc['Panel Name']}|${doc['Candidate Name']}`;
      uniqueCombinations.add(key);
      
      if (doc.score) {
        totalScore += doc.score;
        scoreCount++;
      }

      const docDate = doc.evaluated_at ? new Date(doc.evaluated_at) : null;
      if (docDate && (!mostRecentDate || docDate > mostRecentDate)) {
        mostRecentDate = docDate;
      }
    }

    const totalEvaluations = allEvaluations.length;
    const averageScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0;
    const lastEvaluationDate = mostRecentDate 
      ? mostRecentDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    // Get evaluations from this week
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const thisWeekEvals = await evalCollection.find({
      evaluated_at: { $gte: sevenDaysAgo }
    }).toArray();

    const thisWeekCombinations = new Set();
    for (const doc of thisWeekEvals) {
      const key = `${doc['Job Interview ID']}|${doc['Panel Name']}|${doc['Candidate Name']}`;
      thisWeekCombinations.add(key);
    }
    const evaluationsThisWeek = thisWeekCombinations.size;

    // Score distribution based on actual scores
    const scores = allEvaluations.map(e => e.score).filter(s => s !== undefined && s !== null);
    const distribution = [
      { range: '0-5', count: scores.filter(s => s >= 0 && s < 5).length },
      { range: '5-8', count: scores.filter(s => s >= 5 && s < 8).length },
      { range: '8-10', count: scores.filter(s => s >= 8 && s <= 10).length }
    ];

    return res.status(200).json({
      success: true,
      data: {
        totalEvaluations,
        totalDocuments: allEvaluations.length,
        averageScore,
        lastEvaluationDate,
        evaluationsThisWeek,
        scoreDistribution: distribution,
        dimensionTrends: [],
        recentEvaluations: []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/search
 * 
 * Search and filter evaluations by Job Interview ID, panel name, or candidate name
 * Query params: job_interview_id, panel_name, candidate_name, limit, skip
 */
router.get('/search', async (req, res) => {
  try {
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const { job_interview_id, panel_name, candidate_name, limit = '50', skip = '0', sort_by = 'created_at', order = 'desc', score_filter = 'all' } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const skipNum = Math.max(parseInt(skip, 10) || 0, 0);

    // Build filter query
    const filter = {};
    if (job_interview_id) {
      filter['Job Interview ID'] = { $regex: job_interview_id, $options: 'i' };
    }
    if (panel_name) {
      filter['Panel Name'] = { $regex: panel_name, $options: 'i' };
    }
    if (candidate_name) {
      filter['Candidate Name'] = { $regex: candidate_name, $options: 'i' };
    }

    // Add score range filtering
    if (score_filter === 'good') {
      filter['score'] = { $gte: 8 };
    } else if (score_filter === 'moderate') {
      filter['score'] = { $gte: 5, $lt: 8 };
    } else if (score_filter === 'low' || score_filter === 'poor') {
      filter['score'] = { $lt: 5 };
    }

    // Map frontend sort keys to database field names
    let sortField = sort_by;
    if (sort_by === 'jobInterviewId') sortField = 'Job Interview ID';
    if (sort_by === 'averageScore') sortField = 'score';
    
    const sortOrder = order === 'asc' ? 1 : -1;

    // Get total matching records
    const total = await evalCollection.countDocuments(filter);

    // Get filtered documents
    const results = await evalCollection.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skipNum)
      .limit(limitNum)
      .toArray();

    // Map results to evaluation format with proper field names
    const evaluations = results.map(doc => ({
      jobInterviewId: doc['Job Interview ID'] || 'N/A',
      panelName: doc['Panel Name'] || '',
      candidateName: doc['Candidate Name'] || '',
      evaluationCount: 1,
      averageScore: doc.score || 0,
      lastEvaluationDate: doc.evaluated_at 
        ? new Date(doc.evaluated_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      _id: doc._id.toString() // Store MongoDB ObjectID for results page navigation
    }));

    // Calculate stats for filtered results
    const scores = results.map(r => r.score || 0);
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;

    // Score distribution for filtered results
    const distribution = [];
    const ranges = [
      { min: 0, max: 5, label: '0-5' },
      { min: 5, max: 8, label: '5-8' },
      { min: 8, max: 10, label: '8-10' }
    ];

    for (const range of ranges) {
      const count = scores.filter(s => s >= range.min && (range.max === 10 ? s <= range.max : s < range.max)).length;
      distribution.push({ range: range.label, count });
    }

    return res.status(200).json({
      success: true,
      data: {
        evaluations,
        totalEvaluations: evaluations.length,
        averageScore: parseFloat(avgScore),
        scoreDistribution: distribution,
        pagination: {
          total,
          limit: limitNum,
          skip: skipNum,
          pages: Math.ceil(total / limitNum)
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/efficiency
 * 
 * Get panel efficiency scores grouped by panel name
 */
router.get('/efficiency', async (req, res) => {
  try {
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    // Get all evaluations grouped by panel name
    const panelStats = await evalCollection.aggregate([
      {
        $group: {
          _id: '$Panel Name',
          averageScore: { $avg: '$score' },
          evaluationCount: { $sum: 1 },
          maxScore: { $max: '$score' },
          minScore: { $min: '$score' }
        }
      },
      { $sort: { averageScore: -1 } }
    ]).toArray();

    // Map to readable format
    const panelEfficiency = panelStats.map(stat => ({
      panelName: stat._id || 'Unknown',
      averageScore: Math.round(stat.averageScore * 10) / 10,
      evaluationCount: stat.evaluationCount,
      maxScore: stat.maxScore,
      minScore: stat.minScore,
      scoreRange: `${stat.minScore}-${stat.maxScore}`
    }));

    // Calculate overall stats
    const totalPanels = panelEfficiency.length;
    const overallAverage = panelStats.length > 0 
      ? Math.round((panelStats.reduce((sum, p) => sum + p.averageScore, 0) / panelStats.length) * 10) / 10
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        panels: panelEfficiency,
        totalPanels,
        overallAverage,
        totalEvaluations: panelStats.reduce((sum, p) => sum + p.evaluationCount, 0)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch panel efficiency',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/evaluation/:id
 * 
 * Get a single evaluation by MongoDB ObjectID (for cached results view)
 */
router.get('/evaluation/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    // Try ObjectId lookup first; fallback to Job Interview ID string match
    let evaluation = null;
    if (ObjectId.isValid(req.params.id)) {
      evaluation = await evalCollection.findOne({ _id: new ObjectId(req.params.id) });
    }
    // Fallback: search by Job Interview ID (most recent match)
    if (!evaluation) {
      evaluation = await evalCollection
        .find({ 'Job Interview ID': req.params.id })
        .sort({ created_at: -1 })
        .limit(1)
        .next();
    }

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        error: 'Evaluation not found',
        timestamp: new Date().toISOString()
      });
    }

    const unescapeHtml = (str) => {
      if (typeof str !== 'string') return str;
      return str
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    };

    const cleanEvidence = (ev) => {
      if (!ev || typeof ev !== 'object') return ev;
      const result = {};
      for (const [k, v] of Object.entries(ev)) {
        result[k] = Array.isArray(v) ? v.map(unescapeHtml) : unescapeHtml(v);
      }
      return result;
    };

    return res.status(200).json({
      success: true,
      data: {
        jobId: evaluation['Job Interview ID'],
        panelName: evaluation['Panel Name'],
        candidateName: evaluation['Candidate Name'],
        score: evaluation.score,
        confidence: evaluation.confidence,
        categories: evaluation.categories,
        evidence: cleanEvidence(evaluation.evidence),
        l2Validation: evaluation.l2_validation,
        l2DetailedValidation: evaluation.l2_detailed_validation || null,
        l2RejectionReasons: evaluation.l2_rejection_reasons || [],
        l1Transcript: evaluation.l1_transcript || '',
        refinedJd: evaluation.refined_jd || null,
        panelSummary: evaluation.panel_summary || null,
        gapAnalysis: evaluation.gap_analysis || null,
        moderation: evaluation.moderation || null,
        evaluatedAt: evaluation.evaluated_at
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch evaluation',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/refined-jd/:jobId
 * Fetch the refined JD skills classification for a given Job ID
 */
router.get('/refined-jd/:jobId', async (req, res) => {
  try {
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const evaluation = await evalCollection
      .find({ 'Job Interview ID': req.params.jobId })
      .sort({ created_at: -1 })
      .limit(1)
      .next();

    if (!evaluation) {
      return res.status(404).json({ success: false, error: 'No evaluation found for this Job ID' });
    }

    return res.status(200).json({
      success: true,
      jobId: req.params.jobId,
      refinedJd: evaluation.refined_jd || null,
      panelSummary: evaluation.panel_summary || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/panel/insights/directory
 * 
 * Get panelist directory stats: total evaluations, average score, last eval date
 */
router.get('/insights/directory', async (req, res) => {
  try {
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const directory = await evalCollection.aggregate([
      {
        $match: { 'Panel Name': { $exists: true, $ne: null, $ne: '' } }
      },
      {
        $group: {
          _id: '$Panel Name',
          totalEvaluations: { $sum: 1 },
          averageScore: { $avg: '$score' },
          lastEvaluationDate: { $max: '$evaluated_at' }
        }
      },
      { $sort: { totalEvaluations: -1 } }
    ]).toArray();

    const formattedDirectory = directory.map(d => ({
      panelName: d._id,
      totalEvaluations: d.totalEvaluations,
      averageScore: Math.round(d.averageScore * 10) / 10,
      lastEvaluationDate: d.lastEvaluationDate 
        ? new Date(d.lastEvaluationDate).toISOString().split('T')[0]
        : 'N/A'
    }));

    return res.status(200).json({
      success: true,
      data: formattedDirectory,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch panel directory',
      details: error.message
    });
  }
});

/**
 * GET /api/v1/panel/insights/profile/:name
 *
 * Get detailed history and dimension averages for a specific panelist
 * Now includes both old panel_evaluations and new pipeline_evaluations
 */
router.get('/insights/profile/:name', async (req, res) => {
  try {
    const panelName = req.params.name;
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');
    const pipelineCollection = db.collection('pipeline_evaluations');

    // Fetch OLD evaluations
    const oldEvaluations = await evalCollection
      .find({ 'Panel Name': panelName })
      .sort({ created_at: 1 })
      .toArray();

    // Fetch NEW pipeline evaluations
    const pipelineDocs = await pipelineCollection
      .find({ panelName: panelName })
      .sort({ updatedAt: 1 })
      .toArray();

    // Check if any data exists
    if (oldEvaluations.length === 0 && pipelineDocs.length === 0) {
      return res.status(404).json({ success: false, error: 'Panelist not found' });
    }

    // Process OLD evaluations
    let totalScore = 0;
    const categorySums = {};
    const categoryCounts = {};

    const oldHistory = oldEvaluations.map(doc => {
      totalScore += (doc.score || 0);

      if (doc.categories) {
        for (const [key, val] of Object.entries(doc.categories)) {
          categorySums[key] = (categorySums[key] || 0) + val;
          categoryCounts[key] = (categoryCounts[key] || 0) + 1;
        }
      }
      return {
        id: doc._id.toString(),
        jobId: doc['Job Interview ID'],
        candidateName: doc['Candidate Name'],
        score: doc.score,
        date: doc.evaluated_at ? new Date(doc.evaluated_at).toISOString().split('T')[0] : 'N/A'
      };
    });

    // Process NEW pipeline evaluations
    const pipelineHistory = pipelineDocs.map(doc => {
      // Find latest completed stage with score
      let latestScore = null;
      let latestDate = doc.updatedAt;

      if (doc.completedStages?.includes('stage3') && doc.stage3?.evaluation?.score) {
        latestScore = doc.stage3.evaluation.score;
        latestDate = doc.stage3.completedAt;

        // Add stage3 categories to averages
        if (doc.stage3.evaluation.categories) {
          for (const [key, val] of Object.entries(doc.stage3.evaluation.categories)) {
            categorySums[key] = (categorySums[key] || 0) + val;
            categoryCounts[key] = (categoryCounts[key] || 0) + 1;
          }
        }
      } else if (doc.completedStages?.includes('stage2') && doc.stage2?.evaluation?.score) {
        latestScore = doc.stage2.evaluation.score;
        latestDate = doc.stage2.completedAt;

        // Add stage2 categories to averages
        if (doc.stage2.evaluation.categories) {
          for (const [key, val] of Object.entries(doc.stage2.evaluation.categories)) {
            categorySums[key] = (categorySums[key] || 0) + val;
            categoryCounts[key] = (categoryCounts[key] || 0) + 1;
          }
        }
      }

      if (latestScore !== null) {
        totalScore += latestScore;
      }

      return {
        id: doc._id.toString(),
        jobId: doc.jobId,
        candidateName: doc.candidateName,
        score: latestScore,
        date: latestDate ? new Date(latestDate).toISOString().split('T')[0] : 'N/A',
        isPipeline: true // Flag to indicate this is a pipeline evaluation
      };
    }).filter(item => item.score !== null); // Only include items with scores

    // Merge and sort history by date
    const history = [...oldHistory, ...pipelineHistory].sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });

    const totalEvaluations = oldEvaluations.length + pipelineHistory.length;
    const averageScore = totalEvaluations > 0 ? Math.round((totalScore / totalEvaluations) * 10) / 10 : 0;
    
    // Calculate dimension averages
    const dimensionAverages = {};
    for (const key of Object.keys(categorySums)) {
      dimensionAverages[key] = Math.round((categorySums[key] / categoryCounts[key]) * 100) / 100;
    }

    // Get Panel Details from MongoDB evaluation records
    let employeeId = 'N/A';
    let email = 'N/A';
    try {
      // Try old evaluations first
      const latestWithInfo = await evalCollection.findOne(
        {
          'Panel Name': panelName,
          $or: [
            { panel_member_id: { $ne: '', $exists: true } },
            { panel_member_email: { $ne: '', $exists: true } }
          ]
        },
        { sort: { evaluated_at: -1 } }
      );

      if (latestWithInfo) {
        employeeId = latestWithInfo.panel_member_id || 'N/A';
        email = latestWithInfo.panel_member_email || 'N/A';
      }

      // If not found, try pipeline evaluations
      if (employeeId === 'N/A' && email === 'N/A') {
        const pipelineWithInfo = await pipelineCollection.findOne(
          {
            panelName: panelName,
            $or: [
              { panelId: { $ne: '', $exists: true } },
              { panelEmail: { $ne: '', $exists: true } }
            ]
          },
          { sort: { updatedAt: -1 } }
        );

        if (pipelineWithInfo) {
          employeeId = pipelineWithInfo.panelId || 'N/A';
          email = pipelineWithInfo.panelEmail || 'N/A';
        }
      }
    } catch (e) {
      console.warn("Failed to fetch panel details from DB:", e);
    }
    
    return res.status(200).json({
      success: true,
      data: {
        panelName,
        employeeId,
        email,
        totalEvaluations,
        averageScore,
        dimensionAverages,
        history
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch panel profile',
      details: error.message
    });
  }
});

/**
 * GET /api/v1/panel/insights/evaluations
 *
 * Get individual panel evaluation records with stage information
 * Query params: stage (optional: 'all', 'L1', 'L2'), sort_by, order
 * Now includes both old panel_evaluations and new pipeline_evaluations
 */
router.get('/insights/evaluations', async (req, res) => {
  try {
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');
    const pipelineCollection = db.collection('pipeline_evaluations');

    const { stage = 'all', sort_by = 'evaluated_at', order = 'desc' } = req.query;

    // ── Fetch OLD panel_evaluations ──
    const filter = {
      'Panel Name': { $exists: true, $ne: null, $ne: '' },
      'Candidate Name': { $exists: true, $ne: null, $ne: '' }
    };

    if (stage === 'L1') {
      filter['score'] = { $exists: true, $ne: null };
      filter['l2_rejection_reasons'] = { $exists: false };
    } else if (stage === 'L2') {
      filter['l2_rejection_reasons'] = { $exists: true, $ne: [] };
    }

    let sortField = sort_by;
    if (sort_by === 'panelName') sortField = 'Panel Name';
    if (sort_by === 'candidateName') sortField = 'Candidate Name';
    if (sort_by === 'score') sortField = 'score';
    if (sort_by === 'stage') sortField = 'l2_rejection_reasons';
    if (sort_by === 'evaluated_at') sortField = 'evaluated_at';

    const sortOrder = order === 'asc' ? 1 : -1;

    const evaluations = await evalCollection
      .find(filter)
      .sort({ [sortField]: sortOrder })
      .toArray();

    const formattedOldEvaluations = evaluations.map(doc => {
      const stageInfo = _determineEvaluationStage(doc);
      const stageLabel = (stageInfo.stage === 'l2_scoring' || stageInfo.stage === 'client_audit') ? 'L2' : 'L1';

      return {
        evaluationId: doc._id.toString(),
        jobInterviewId: doc['Job Interview ID'] || 'N/A',
        panelName: doc['Panel Name'] || 'Unknown',
        candidateName: doc['Candidate Name'] || 'Unknown',
        panelScore: doc.score || 0,
        stage: stageLabel,
        evaluatedAt: doc.evaluated_at
          ? new Date(doc.evaluated_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
      };
    });

    // ── Fetch NEW pipeline_evaluations ──
    const pipelineDocs = await pipelineCollection
      .find({
        panelName: { $exists: true, $ne: null, $ne: '' },
        candidateName: { $exists: true, $ne: null, $ne: '' }
      })
      .toArray();

    const formattedPipelineEvaluations = pipelineDocs
      .map(doc => {
        // Find the latest completed stage
        const completedStages = doc.completedStages || [];
        if (completedStages.length === 0) return null; // Skip if no stages completed

        let latestStage = null;
        let latestScore = null;
        let stageLabel = 'L1';

        // Check stages in reverse order (stage4 -> stage3 -> stage2 -> stage1)
        if (completedStages.includes('stage4') && doc.stage4?.completed) {
          latestStage = doc.stage4;
          stageLabel = 'L2'; // Stage 4 is client audit (after L2)
        } else if (completedStages.includes('stage3') && doc.stage3?.completed) {
          latestStage = doc.stage3;
          latestScore = doc.stage3.evaluation?.score || null;
          stageLabel = 'L2';
        } else if (completedStages.includes('stage2') && doc.stage2?.completed) {
          latestStage = doc.stage2;
          latestScore = doc.stage2.evaluation?.score || null;
          stageLabel = 'L1';
        } else if (completedStages.includes('stage1') && doc.stage1?.completed) {
          latestStage = doc.stage1;
          stageLabel = 'L1'; // Stage 1 is screening
        }

        if (!latestStage) return null;

        // Apply stage filter
        if (stage === 'L1' && stageLabel !== 'L1') return null;
        if (stage === 'L2' && stageLabel !== 'L2') return null;

        return {
          evaluationId: doc._id.toString(),
          jobInterviewId: doc.jobId || 'N/A',
          panelName: doc.panelName || 'Unknown',
          candidateName: doc.candidateName || 'Unknown',
          panelScore: latestScore || 0,
          stage: stageLabel,
          evaluatedAt: latestStage.completedAt
            ? new Date(latestStage.completedAt).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0]
        };
      })
      .filter(Boolean); // Remove nulls

    // ── Merge and sort ──
    const allEvaluations = [...formattedOldEvaluations, ...formattedPipelineEvaluations];

    // Sort by the requested field
    allEvaluations.sort((a, b) => {
      let aVal = a[sort_by] || '';
      let bVal = b[sort_by] || '';

      if (sort_by === 'evaluated_at') {
        aVal = new Date(a.evaluatedAt);
        bVal = new Date(b.evaluatedAt);
      } else if (sort_by === 'score' || sort_by === 'panelScore') {
        aVal = a.panelScore;
        bVal = b.panelScore;
      }

      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return res.status(200).json({
      success: true,
      data: allEvaluations,
      total: allEvaluations.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching panel evaluations:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch panel evaluations',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * DELETE /api/v1/panel/restart/all
 *
 * Dashboard-level restart: Deletes ALL evaluation data
 * Restricted to: gopiraj.k@indium.tech
 */
router.delete('/restart/all', async (req, res) => {
  try {
    const userEmail = req.user?.email || req.headers['x-user-email'];

    // Authorization check
    if (userEmail !== 'gopiraj.k@indium.tech') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: This operation is restricted to authorized users only.',
        timestamp: new Date().toISOString()
      });
    }

    const { getDb } = require('../services/mongoClient');
    const db = await getDb();

    // Delete from both collections
    const evalResult = await db.collection('panel_evaluations').deleteMany({});
    const collResult = await db.collection('panel_collection').deleteMany({});

    return res.status(200).json({
      success: true,
      message: 'All evaluation data deleted successfully',
      deletedCounts: {
        evaluations: evalResult.deletedCount,
        panelCollection: collResult.deletedCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in restart/all:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete evaluation data',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/panel/stage-info/:evaluationId
 *
 * Get stage information for a specific evaluation to determine:
 * - Current stage
 * - Whether it's the last completed stage
 * - What can be restarted
 */
router.get('/stage-info/:evaluationId', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const evaluationId = req.params.evaluationId;

    // Validate ObjectId
    if (!ObjectId.isValid(evaluationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid evaluation ID format',
        timestamp: new Date().toISOString()
      });
    }

    const evaluation = await evalCollection.findOne({ _id: new ObjectId(evaluationId) });

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        error: 'Evaluation not found',
        timestamp: new Date().toISOString()
      });
    }

    // Determine current stage based on what data exists
    const stageInfo = _determineEvaluationStage(evaluation);

    // Find if there are any later stages for this job/panel/candidate
    const laterEvaluations = await evalCollection.find({
      'Job Interview ID': evaluation['Job Interview ID'],
      'Panel Name': evaluation['Panel Name'],
      'Candidate Name': evaluation['Candidate Name'],
      created_at: { $gt: evaluation.created_at }
    }).toArray();

    const isLastStage = laterEvaluations.length === 0;

    return res.status(200).json({
      success: true,
      data: {
        evaluationId: evaluationId,
        currentStage: stageInfo.stage,
        stageLabel: stageInfo.label,
        isLastStage: isLastStage,
        canRestart: isLastStage,
        jobId: evaluation['Job Interview ID'],
        panelName: evaluation['Panel Name'],
        candidateName: evaluation['Candidate Name']
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in stage-info:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve stage information',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * DELETE /api/v1/panel/restart/stage/:evaluationId
 *
 * Stage-level restart: Reverse cascade deletion
 * - Only works if this is the last completed stage
 * - Deletes this stage and all subsequent stages
 * Restricted to: gopiraj.k@indium.tech
 */
router.delete('/restart/stage/:evaluationId', async (req, res) => {
  try {
    const userEmail = req.user?.email || req.headers['x-user-email'];

    // Authorization check
    if (userEmail !== 'gopiraj.k@indium.tech') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: This operation is restricted to authorized users only.',
        timestamp: new Date().toISOString()
      });
    }

    const { ObjectId } = require('mongodb');
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const evaluationId = req.params.evaluationId;

    if (!ObjectId.isValid(evaluationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid evaluation ID format',
        timestamp: new Date().toISOString()
      });
    }

    const evaluation = await evalCollection.findOne({ _id: new ObjectId(evaluationId) });

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        error: 'Evaluation not found',
        timestamp: new Date().toISOString()
      });
    }

    // Check if this is the last stage
    const laterEvaluations = await evalCollection.find({
      'Job Interview ID': evaluation['Job Interview ID'],
      'Panel Name': evaluation['Panel Name'],
      'Candidate Name': evaluation['Candidate Name'],
      created_at: { $gt: evaluation.created_at }
    }).toArray();

    if (laterEvaluations.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot restart: This is not the last completed stage. Only the most recent stage can be restarted.',
        timestamp: new Date().toISOString()
      });
    }

    // Perform cascade deletion: delete this evaluation and all with same or later timestamp
    const deleteResult = await evalCollection.deleteMany({
      'Job Interview ID': evaluation['Job Interview ID'],
      'Panel Name': evaluation['Panel Name'],
      'Candidate Name': evaluation['Candidate Name'],
      created_at: { $gte: evaluation.created_at }
    });

    // Also clean up from panel_collection if needed
    const collResult = await db.collection('panel_collection').deleteMany({
      job_interview_id: evaluation['Job Interview ID'],
      panel_name: evaluation['Panel Name'],
      candidate_name: evaluation['Candidate Name']
    });

    const stageInfo = _determineEvaluationStage(evaluation);

    return res.status(200).json({
      success: true,
      message: `Successfully restarted from ${stageInfo.label}`,
      deletedCounts: {
        evaluations: deleteResult.deletedCount,
        panelCollection: collResult.deletedCount
      },
      stage: stageInfo.stage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in restart/stage:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to restart stage',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Helper function to determine evaluation stage
 * @private
 */
function _determineEvaluationStage(evaluation) {
  // Stage 4: Client Audit (has everything including L2 detailed validation)
  if (evaluation.l2_detailed_validation && evaluation.l2_rejection_reasons && evaluation.l2_rejection_reasons.length > 0) {
    return { stage: 'client_audit', label: 'Client Audit' };
  }

  // Stage 3: L2 Scoring (has L2 rejection reasons)
  if (evaluation.l2_rejection_reasons && evaluation.l2_rejection_reasons.length > 0) {
    return { stage: 'l2_scoring', label: 'L2 Scoring' };
  }

  // Stage 2: L1 Scoring (has score and evaluated)
  if (evaluation.score !== null && evaluation.score !== undefined) {
    return { stage: 'l1_scoring', label: 'L1 Scoring' };
  }

  // Stage 1: Initial Screening (data exists but not evaluated)
  return { stage: 'initial_screening', label: 'Initial Screening' };
}

module.exports = router;
