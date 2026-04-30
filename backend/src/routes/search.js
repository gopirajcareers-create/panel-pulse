const express = require('express');
const router = express.Router();
const { searchBM25, searchHybrid } = require('../services/searchService');
const { searchVector } = require('../services/vectorSearchService');
const { rerankWithLLM } = require('../services/llmRerankService');
const { summarizeResults } = require('../services/llmSummarizeService');

/**
 * GET /api/v1/search/bm25
 * Full-text search using MongoDB Atlas BM25
 * Query params: q (required), field_type (optional), job_id (optional), limit, skip
 */
router.get('/bm25', async (req, res) => {
  try {
    const { q, field_type, job_id, limit = '10', skip = '0' } = req.query;

    // Validate required query parameter
    if (!q) {
      return res.status(400).json({
        error: 'Missing required query parameter',
        details: 'q parameter is required for search'
      });
    }

    // Validate pagination parameters
    const limitNum = parseInt(limit, 10);
    const skipNum = parseInt(skip, 10);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Invalid limit parameter',
        details: 'limit must be a number between 1 and 100'
      });
    }

    if (isNaN(skipNum) || skipNum < 0) {
      return res.status(400).json({
        error: 'Invalid skip parameter',
        details: 'skip must be a non-negative number'
      });
    }

    // Execute search
    console.log(`[BM25] Searching for: "${q}" (limit: ${limitNum}, skip: ${skipNum})`);
    
    const searchOptions = {
      limit: limitNum,
      skip: skipNum
    };

    if (field_type) {
      searchOptions.fieldType = field_type;
    }

    if (job_id) {
      searchOptions.jobInterviewId = job_id;
    }

    const results = await searchBM25(q, searchOptions);

    console.log(`[BM25] Found ${results.total} results`);

    res.json({
      success: true,
      query: q,
      filters: {
        field_type: field_type || null,
        job_interview_id: job_id || null
      },
      pagination: {
        total: results.total,
        limit: results.limit,
        skip: results.skip,
        pages: Math.ceil(results.total / results.limit)
      },
      results: results.results,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[BM25] Search error:', err.message);

    // Handle specific errors
    if (err.message.includes('BM25 search index not configured')) {
      return res.status(503).json({
        error: 'Search service unavailable',
        details: err.message,
        code: 'SEARCH_INDEX_NOT_FOUND'
      });
    }

    if (err.message.includes('query is required')) {
      return res.status(400).json({
        error: 'Invalid search query',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Search operation failed',
      details: err.message
    });
  }
});

/**
 * GET /api/v1/search/vector
 * Semantic search using vector embeddings and cosine similarity
 * Query params: q (required), field_type (optional), job_id (optional), min_score, limit, skip
 */
router.get('/vector', async (req, res) => {
  try {
    const { q, field_type, job_id, min_score = '0.5', limit = '10', skip = '0' } = req.query;

    // Validate required query parameter
    if (!q) {
      return res.status(400).json({
        error: 'Missing required query parameter',
        details: 'q parameter is required for search'
      });
    }

    // Validate pagination parameters
    const limitNum = parseInt(limit, 10);
    const skipNum = parseInt(skip, 10);
    const minScoreNum = parseFloat(min_score);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Invalid limit parameter',
        details: 'limit must be a number between 1 and 100'
      });
    }

    if (isNaN(skipNum) || skipNum < 0) {
      return res.status(400).json({
        error: 'Invalid skip parameter',
        details: 'skip must be a non-negative number'
      });
    }

    if (isNaN(minScoreNum) || minScoreNum < 0 || minScoreNum > 1) {
      return res.status(400).json({
        error: 'Invalid min_score parameter',
        details: 'min_score must be a number between 0 and 1'
      });
    }

    // Execute vector search
    console.log(`[Vector Search] Query: "${q}" (limit: ${limitNum}, min_score: ${minScoreNum})`);
    
    const searchOptions = {
      limit: limitNum,
      skip: skipNum,
      minScore: minScoreNum
    };

    if (field_type) {
      searchOptions.fieldType = field_type;
    }

    if (job_id) {
      searchOptions.jobInterviewId = job_id;
    }

    const results = await searchVector(q, searchOptions);

    console.log(`[Vector Search] Found ${results.total} semantically similar results`);

    res.json({
      success: true,
      search_type: 'semantic_vector',
      query: q,
      filters: {
        field_type: field_type || null,
        job_interview_id: job_id || null,
        min_score: minScoreNum
      },
      pagination: {
        total: results.total,
        limit: results.limit,
        skip: results.skip,
        pages: Math.ceil(results.total / results.limit)
      },
      results: results.results,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Vector Search] Error:', err.message);

    if (err.message.includes('Failed to embed')) {
      return res.status(503).json({
        error: 'Embedding service unavailable',
        details: err.message,
        code: 'EMBEDDING_FAILED'
      });
    }

    if (err.message.includes('query is required')) {
      return res.status(400).json({
        error: 'Invalid search query',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Vector search failed',
      details: err.message
    });
  }
});

/**
 * GET /api/v1/search/hybrid
 * Hybrid search combining BM25 (keyword) and Vector (semantic) search
 * Query params: q (required), bm25_weight, vector_weight, vector_min_score, field_type, job_id, limit, skip
 */
router.get('/hybrid', async (req, res) => {
  try {
    const { 
      q, 
      field_type, 
      job_id, 
      bm25_weight = '0.5', 
      vector_weight = '0.5',
      vector_min_score = '0.3',
      limit = '10', 
      skip = '0' 
    } = req.query;

    // Validate required query parameter
    if (!q) {
      return res.status(400).json({
        error: 'Missing required query parameter',
        details: 'q parameter is required for search'
      });
    }

    // Validate pagination parameters
    const limitNum = parseInt(limit, 10);
    const skipNum = parseInt(skip, 10);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Invalid limit parameter',
        details: 'limit must be a number between 1 and 100'
      });
    }

    if (isNaN(skipNum) || skipNum < 0) {
      return res.status(400).json({
        error: 'Invalid skip parameter',
        details: 'skip must be a non-negative number'
      });
    }

    // Validate weight parameters
    const bm25WeightNum = parseFloat(bm25_weight);
    const vectorWeightNum = parseFloat(vector_weight);
    const vectorMinScoreNum = parseFloat(vector_min_score);

    if (isNaN(bm25WeightNum) || bm25WeightNum < 0 || bm25WeightNum > 1) {
      return res.status(400).json({
        error: 'Invalid bm25_weight parameter',
        details: 'bm25_weight must be a number between 0 and 1'
      });
    }

    if (isNaN(vectorWeightNum) || vectorWeightNum < 0 || vectorWeightNum > 1) {
      return res.status(400).json({
        error: 'Invalid vector_weight parameter',
        details: 'vector_weight must be a number between 0 and 1'
      });
    }

    if (isNaN(vectorMinScoreNum) || vectorMinScoreNum < 0 || vectorMinScoreNum > 1) {
      return res.status(400).json({
        error: 'Invalid vector_min_score parameter',
        details: 'vector_min_score must be a number between 0 and 1'
      });
    }

    // Execute hybrid search
    console.log(`[Hybrid Search] Query: "${q}" (bm25_weight: ${bm25WeightNum}, vector_weight: ${vectorWeightNum})`);
    
    const searchOptions = {
      limit: limitNum,
      skip: skipNum,
      bm25Weight: bm25WeightNum,
      vectorWeight: vectorWeightNum,
      vectorMinScore: vectorMinScoreNum
    };

    if (field_type) {
      searchOptions.fieldType = field_type;
    }

    if (job_id) {
      searchOptions.jobInterviewId = job_id;
    }

    const results = await searchHybrid(q, searchOptions);

    console.log(`[Hybrid Search] Found ${results.total} combined results`);

    res.json({
      success: true,
      search_type: 'hybrid',
      query: q,
      search_weights: {
        bm25_weight: bm25WeightNum,
        vector_weight: vectorWeightNum
      },
      filters: {
        field_type: field_type || null,
        job_interview_id: job_id || null,
        vector_min_score: vectorMinScoreNum
      },
      pagination: {
        total: results.total,
        limit: results.limit,
        skip: results.skip,
        pages: Math.ceil(results.total / results.limit)
      },
      results: results.results,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Hybrid Search] Error:', err.message);

    if (err.message.includes('Failed to embed')) {
      return res.status(503).json({
        error: 'Embedding service unavailable',
        details: err.message,
        code: 'EMBEDDING_FAILED'
      });
    }

    if (err.message.includes('query is required')) {
      return res.status(400).json({
        error: 'Invalid search query',
        details: err.message
      });
    }

    if (err.message.includes('Weight') || err.message.includes('weight')) {
      return res.status(400).json({
        error: 'Invalid weight parameter',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Hybrid search failed',
      details: err.message
    });
  }
});

/**
 * POST /api/v1/search/rerank
 * Re-rank search results using LLM evaluation
 * Body: { results, query, top_k, evaluation_focus, include_explanations }
 */
router.post('/rerank', async (req, res) => {
  try {
    const { 
      results = [], 
      query, 
      top_k = 5,
      evaluation_focus = 'relevance',
      include_explanations = true
    } = req.body;

    // Validate required parameters
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing required parameter',
        details: 'query parameter is required'
      });
    }

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({
        error: 'Invalid results parameter',
        details: 'results must be a non-empty array'
      });
    }

    // Validate top_k parameter
    const topKNum = parseInt(top_k, 10);
    if (isNaN(topKNum) || topKNum < 1 || topKNum > 50) {
      return res.status(400).json({
        error: 'Invalid top_k parameter',
        details: 'top_k must be a number between 1 and 50'
      });
    }

    // Validate evaluation_focus
    const validFocus = ['relevance', 'expertise_match', 'interview_quality'];
    if (!validFocus.includes(evaluation_focus)) {
      return res.status(400).json({
        error: 'Invalid evaluation_focus parameter',
        details: `evaluation_focus must be one of: ${validFocus.join(', ')}`
      });
    }

    console.log(`[LLM Rerank] Re-ranking ${results.length} results for query: "${query}"`);
    console.log(`[LLM Rerank] Focus: ${evaluation_focus}, Top K: ${topKNum}`);

    const rerankOptions = {
      topK: topKNum,
      includeExplanations: include_explanations === true || include_explanations === 'true',
      evaluationFocus: evaluation_focus
    };

    const rankedResults = await rerankWithLLM(query, results, rerankOptions);

    console.log(`[LLM Rerank] Successfully re-ranked results`);

    res.json({
      success: true,
      search_type: 'rerank_llm',
      query: query,
      rerank_config: {
        top_k: topKNum,
        evaluation_focus: evaluation_focus,
        include_explanations: include_explanations
      },
      evaluation_summary: {
        total_results: rankedResults.total_evaluated,
        returned_results: rankedResults.results.length,
        focus: rankedResults.evaluation_focus
      },
      results: rankedResults.results.map(doc => ({
        id: doc.id,
        job_interview_id: doc.job_interview_id,
        candidate_name: doc.candidate_name,
        panel_member_name: doc.panel_member_name,
        field_type: doc.field_type,
        // Original scores
        original_rank: doc.original_rank,
        original_score: Number(doc.original_score.toFixed(4)),
        // LLM re-ranking
        llm_rank: doc.llm_metadata.llm_rank,
        llm_score: Number(doc.llm_metadata.llm_score.toFixed(2)),
        llm_explanation: doc.llm_metadata.explanation,
        relevance_reason: doc.llm_metadata.relevance_reason,
        // Content
        preview: doc.preview,
        rank_change: (doc.original_rank - doc.llm_metadata.llm_rank)
      })),
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[LLM Rerank] Error:', err.message);

    if (err.message.includes('GROQ_API_KEY')) {
      return res.status(503).json({
        error: 'LLM service unavailable',
        details: err.message,
        code: 'LLM_NOT_CONFIGURED'
      });
    }

    if (err.message.includes('GROQ API')) {
      return res.status(503).json({
        error: 'LLM service error',
        details: err.message,
        code: 'LLM_API_ERROR'
      });
    }

    if (err.message.includes('query is required') || err.message.includes('Results array')) {
      return res.status(400).json({
        error: 'Invalid request',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Re-ranking operation failed',
      details: err.message
    });
  }
});

/**
 * POST /api/v1/search/summarize
 * Summarize search results using LLM
 * Body: { results, query, summary_type, summary_length, include_key_points, combined_summary }
 */
router.post('/summarize', async (req, res) => {
  try {
    const {
      results = [],
      query,
      summary_type = 'brief',
      summary_length = 'medium',
      include_key_points = true,
      include_recommendations = false,
      combined_summary = true
    } = req.body;

    // Validate required parameters
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing required parameter',
        details: 'query parameter is required'
      });
    }

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({
        error: 'Invalid results parameter',
        details: 'results must be a non-empty array'
      });
    }

    // Validate summary_type
    const validTypes = ['brief', 'detailed', 'executive'];
    if (!validTypes.includes(summary_type)) {
      return res.status(400).json({
        error: 'Invalid summary_type parameter',
        details: `summary_type must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate summary_length
    const validLengths = ['short', 'medium', 'long'];
    if (!validLengths.includes(summary_length)) {
      return res.status(400).json({
        error: 'Invalid summary_length parameter',
        details: `summary_length must be one of: ${validLengths.join(', ')}`
      });
    }

    console.log(`[LLM Summarize] Summarizing ${results.length} results for query: "${query}"`);
    console.log(`[LLM Summarize] Type: ${summary_type}, Length: ${summary_length}`);

    const summaryOptions = {
      summaryType: summary_type,
      summaryLength: summary_length,
      includeKeyPoints: include_key_points === true || include_key_points === 'true',
      includeRecommendations: include_recommendations === true || include_recommendations === 'true',
      combinedSummary: combined_summary === true || combined_summary === 'true',
      maxResults: 10
    };

    const summarized = await summarizeResults(query, results, summaryOptions);

    console.log(`[LLM Summarize] Successfully summarized results`);

    res.json({
      success: true,
      search_type: 'summarize',
      query: query,
      summarization_config: {
        summary_type: summary_type,
        summary_length: summary_length,
        include_key_points: include_key_points,
        include_recommendations: include_recommendations,
        combined_summary: combined_summary && results.length > 1,
        results_summarized: results.length
      },
      summary_info: summarized.summary_config,
      summaries: summarized.summaries,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[LLM Summarize] Error:', err.message);

    if (err.message.includes('GROQ_API_KEY')) {
      return res.status(503).json({
        error: 'LLM service unavailable',
        details: err.message,
        code: 'LLM_NOT_CONFIGURED'
      });
    }

    if (err.message.includes('GROQ API')) {
      return res.status(503).json({
        error: 'LLM service error',
        details: err.message,
        code: 'LLM_API_ERROR'
      });
    }

    if (err.message.includes('query is required') || err.message.includes('Results array')) {
      return res.status(400).json({
        error: 'Invalid request',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Summarization operation failed',
      details: err.message
    });
  }
});

module.exports = router;
