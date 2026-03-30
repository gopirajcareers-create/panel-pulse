/**
 * JD Routes
 * 
 * Endpoints for Job Description analysis and fine-tuning
 */

const express = require('express');
const router = express.Router();
const { analyzeJD, analyzeJDBatch } = require('../services/jdAnalyzerService');

/**
 * POST /api/v1/jd/analyze
 * 
 * Analyze a Job Description and extract skill classifications
 * 
 * Request body:
 * {
 *   "jd_content": "string (required) - Job Description text to analyze",
 *   "job_id": "string (optional) - Job/Interview ID for reference"
 * }
 * 
 * Response:
 * {
 *   "success": boolean,
 *   "jd_analysis": {
 *     "original_jd": "string - Original JD",
 *     "analysis_result": "string - Raw LLM analysis",
 *     "parsed_analysis": {
 *       "key_skills": ["array of key skills"],
 *       "mandatory_skills": ["array of mandatory skills"],
 *       "good_to_have_skills": ["array of good to have skills"]
 *     },
 *     "is_valid": boolean,
 *     "summary": {
 *       "total_key_skills": number,
 *       "total_mandatory_skills": number,
 *       "total_good_to_have": number
 *     }
 *   },
 *   "timestamp": "ISO string"
 * }
 */
router.post('/analyze', async (req, res) => {
  try {
    const { jd_content, job_id } = req.body;

    // Validate required parameters
    if (!jd_content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: jd_content',
        timestamp: new Date().toISOString()
      });
    }

    if (typeof jd_content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'jd_content must be a string',
        timestamp: new Date().toISOString()
      });
    }

    // Call JD analyzer service
    const analysis = await analyzeJD(jd_content);

    // Handle invalid JD
    if (!analysis.success && !analysis.is_valid_jd) {
      return res.status(400).json({
        success: false,
        error: analysis.analysis || analysis.error || 'Invalid JD',
        job_id: job_id || null,
        timestamp: new Date().toISOString()
      });
    }

    // Return analysis result
    return res.status(200).json({
      success: true,
      job_id: job_id || null,
      jd_analysis: {
        original_jd: analysis.raw_jd,
        analysis_result: analysis.analysis,
        parsed_analysis: analysis.parsed_analysis,
        is_valid: analysis.is_valid_jd,
        summary: {
          total_key_skills: analysis.parsed_analysis?.key_skills?.length || 0,
          total_mandatory_skills: analysis.parsed_analysis?.mandatory_skills?.length || 0,
          total_good_to_have: analysis.parsed_analysis?.good_to_have_skills?.length || 0
        }
      },
      timestamp: analysis.timestamp || new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /analyze endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during JD analysis',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/v1/jd/analyze-batch
 * 
 * Analyze multiple Job Descriptions in batch
 * 
 * Request body:
 * {
 *   "jd_contents": [
 *     {
 *       "jd_content": "string - Job Description text",
 *       "job_id": "string (optional) - Job/Interview ID"
 *     }
 *   ]
 * }
 * 
 * Response:
 * {
 *   "success": boolean,
 *   "total_processed": number,
 *   "results": [
 *     {
 *       "job_id": "string or null",
 *       "success": boolean,
 *       "analysis": {...}
 *     }
 *   ],
 *   "timestamp": "ISO string"
 * }
 */
router.post('/analyze-batch', async (req, res) => {
  try {
    const { jd_contents } = req.body;

    // Validate required parameters
    if (!jd_contents) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: jd_contents',
        timestamp: new Date().toISOString()
      });
    }

    if (!Array.isArray(jd_contents)) {
      return res.status(400).json({
        success: false,
        error: 'jd_contents must be an array',
        timestamp: new Date().toISOString()
      });
    }

    if (jd_contents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'jd_contents array cannot be empty',
        timestamp: new Date().toISOString()
      });
    }

    if (jd_contents.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 JDs allowed per batch request',
        timestamp: new Date().toISOString()
      });
    }

    // Process each JD
    const results = [];
    for (const item of jd_contents) {
      const { jd_content, job_id } = item;

      if (!jd_content || typeof jd_content !== 'string') {
        results.push({
          job_id: job_id || null,
          success: false,
          error: 'Invalid or missing jd_content'
        });
        continue;
      }

      const analysis = await analyzeJD(jd_content);
      results.push({
        job_id: job_id || null,
        success: analysis.success && analysis.is_valid_jd,
        analysis: analysis
      });
    }

    return res.status(200).json({
      success: true,
      total_processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /analyze-batch endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during batch JD analysis',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/jd/health
 * 
 * Health check for JD analyzer service
 */
router.get('/health', (req, res) => {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL_NAME;

    return res.status(200).json({
      success: true,
      service: 'jd-analyzer',
      status: 'healthy',
      configuration: {
        groq_configured: !!groqApiKey,
        groq_model: groqModel || 'not configured',
        system_prompt_loaded: true
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

module.exports = router;
