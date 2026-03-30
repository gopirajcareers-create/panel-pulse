/**
 * Panel Evaluation Routes
 * 
 * Endpoints for panel scoring and L2 validation
 */

const express = require('express');
const router = express.Router();
const { performPanelEvaluation, validateL2Rejection, PANEL_DIMENSIONS } = require('../services/panelEvaluationService');

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

    // No existing evaluation, proceed with LLM call
    // Perform evaluation
    const result = await performPanelEvaluation({
      job_id,
      panel_name,
      candidate_name,
      jd,
      l1_transcripts,
      l2_rejection_reasons,
      panel_member_id,
      panel_member_email
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
      full_evaluation: result.evaluation,
      timestamp: result.timestamp
    });
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

    return res.status(200).json({
      success: true,
      data: {
        jobId: evaluation['Job Interview ID'],
        panelName: evaluation['Panel Name'],
        candidateName: evaluation['Candidate Name'],
        score: evaluation.score,
        confidence: evaluation.confidence,
        categories: evaluation.categories,
        evidence: evaluation.evidence,
        l2Validation: evaluation.l2_validation,
        l2RejectionReasons: evaluation.l2_rejection_reasons || [],
        l1Transcript: evaluation.l1_transcript || '',
        refinedJd: evaluation.refined_jd || null,
        panelSummary: evaluation.panel_summary || null,
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
 */
router.get('/insights/profile/:name', async (req, res) => {
  try {
    const panelName = req.params.name;
    const { getDb } = require('../services/mongoClient');
    const db = await getDb();
    const evalCollection = db.collection('panel_evaluations');

    const evaluations = await evalCollection
      .find({ 'Panel Name': panelName })
      .sort({ created_at: 1 }) // Chronological for line charts
      .toArray();

    if (evaluations.length === 0) {
      return res.status(404).json({ success: false, error: 'Panelist not found' });
    }

    // Averages
    let totalScore = 0;
    const categorySums = {};
    const categoryCounts = {};

    const history = evaluations.map(doc => {
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

    const averageScore = Math.round((totalScore / evaluations.length) * 10) / 10;
    
    // Calculate dimension averages
    const dimensionAverages = {};
    for (const key of Object.keys(categorySums)) {
      dimensionAverages[key] = Math.round((categorySums[key] / categoryCounts[key]) * 100) / 100;
    }

    // Get Panel Details from MongoDB evaluation records
    let employeeId = 'N/A';
    let email = 'N/A';
    try {
      const { getDb } = require('../services/mongoClient');
      const db = await getDb();
      const evalCollection = db.collection('panel_evaluations');
      
      // Find the most recent evaluation for this panel that has ID or Email
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
    } catch (e) {
      console.warn("Failed to fetch panel details from DB:", e);
    }
    
    return res.status(200).json({
      success: true,
      data: {
        panelName,
        employeeId,
        email,
        totalEvaluations: evaluations.length,
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

module.exports = router;
