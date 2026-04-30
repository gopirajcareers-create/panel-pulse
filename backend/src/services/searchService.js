const { getDb } = require('./mongoClient');

/**
 * BM25 Full-Text Search Service
 * Requires MongoDB Atlas Search index configured with BM25 on relevant fields
 */

/**
 * Execute BM25 search across interview documents
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of ranked search results
 */
async function searchBM25(query, options = {}) {
  const {
    fieldType = null,
    jobInterviewId = null,
    limit = 10,
    skip = 0
  } = options;

  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required and must not be empty');
  }

  if (limit < 1 || limit > 100) {
    throw new Error('Limit must be between 1 and 100');
  }

  const db = await getDb();
  const collection = db.collection('panel_collection');

  // Build aggregation pipeline for BM25 search
  const pipeline = [
    // Stage 1: Text search using Atlas Search index
    {
      $search: {
        index: 'bm25_index',
        text: {
          query: query,
          path: ['Transcript', 'text', 'L2 Rejected Reason', 'JD', 'panel_notes'],
          fuzzy: {
            maxEdits: 2
          }
        }
      }
    },
    // Stage 2: Project relevance score
    {
      $project: {
        _id: 1,
        Job_Interview_ID: 1,
        job_interview_id: 1,
        field_type: 1,
        text: 1,
        Transcript: 1,
        candidate_name: 1,
        panel_member_name: 1,
        score: { $meta: 'searchScore' },
        highlights: { $meta: 'searchHighlights' }
      }
    },
    // Stage 3: Apply optional filters
    {
      $match: buildMatchStage(fieldType, jobInterviewId)
    },
    // Stage 4: Sort by relevance score descending
    {
      $sort: { score: -1 }
    },
    // Stage 5: Pagination
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        results: [
          { $skip: skip },
          { $limit: limit }
        ]
      }
    }
  ];

  try {
    const results = await collection.aggregate(pipeline).toArray();

    if (results.length === 0) {
      return { total: 0, results: [] };
    }

    const metadata = results[0].metadata[0] || { total: 0 };
    const docs = results[0].results || [];

    return {
      total: metadata.total,
      limit,
      skip,
      results: docs.map(doc => ({
        id: doc._id.toString(),
        job_interview_id: doc.Job_Interview_ID || doc.job_interview_id,
        candidate_name: doc.candidate_name,
        panel_member_name: doc.panel_member_name,
        field_type: doc.field_type || 'interview',
        score: Number(doc.score.toFixed(4)),
        highlights: doc.highlights || [],
        preview: (doc.Transcript || doc.text || doc['L2 Rejected Reason'] || '').substring(0, 200)
      }))
    };
  } catch (err) {
    if (err.message.includes('cannot search')) {
      throw new Error('BM25 search index not configured. Please create Atlas Search index "bm25_index"');
    }
    throw err;
  }
}

/**
 * Build MongoDB match stage for optional filtering
 */
function buildMatchStage(fieldType, jobInterviewId) {
  const match = {};

  if (fieldType && ['jd', 'l1_transcript', 'panel_notes', 'l2_rejection'].includes(fieldType)) {
    match.field_type = fieldType;
  }

  if (jobInterviewId) {
    match.job_interview_id = jobInterviewId;
  }

  return Object.keys(match).length > 0 ? match : {};
}

/**
 * Hybrid search combining BM25 (keyword) and Vector (semantic) search
 * @param {string} query - Search query
 * @param {Object} options - Search options including weights
 * @returns {Promise<Object>} Hybrid search results with combined scores
 */
async function searchHybrid(query, options = {}) {
  const {
    fieldType = null,
    jobInterviewId = null,
    limit = 10,
    skip = 0,
    bm25Weight = 0.5,
    vectorWeight = 0.5,
    vectorMinScore = 0.3
  } = options;

  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required and must not be empty');
  }

  if (limit < 1 || limit > 100) {
    throw new Error('Limit must be between 1 and 100');
  }

  if (bm25Weight < 0 || bm25Weight > 1) {
    throw new Error('bm25Weight must be between 0 and 1');
  }

  if (vectorWeight < 0 || vectorWeight > 1) {
    throw new Error('vectorWeight must be between 0 and 1');
  }

  if (vectorMinScore < 0 || vectorMinScore > 1) {
    throw new Error('vectorMinScore must be between 0 and 1');
  }

  // Normalize weights to ensure they sum to 1
  const totalWeight = bm25Weight + vectorWeight;
  const normalizedBM25Weight = bm25Weight / totalWeight;
  const normalizedVectorWeight = vectorWeight / totalWeight;

  const { embedTexts } = require('./embeddingService');
  const db = await getDb();
  const collection = db.collection('panel_collection');

  // Step 1: Get BM25 results
  console.log('[Hybrid Search] Fetching BM25 results...');
  const bm25Options = { limit: 100, skip: 0, fieldType, jobInterviewId };
  let bm25Results = [];
  let bm25Map = {};

  try {
    const bm25Data = await searchBM25(query, bm25Options);
    bm25Results = bm25Data.results;
    
    // Store BM25 scores in map for lookup
    bm25Results.forEach((doc, index) => {
      bm25Map[doc.id] = {
        score: doc.score,
        rank: index
      };
    });
  } catch (err) {
    console.warn('[Hybrid Search] BM25 search failed:', err.message);
    // Continue with vector-only search if BM25 fails
  }

  // Step 2: Get vector search results
  console.log('[Hybrid Search] Embedding query and fetching vector results...');
  let queryEmbedding;
  try {
    const embeddings = await embedTexts([query]);
    queryEmbedding = embeddings[0];
  } catch (err) {
    throw new Error(`Failed to embed query: ${err.message}`);
  }

  if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1024) {
    throw new Error('Invalid embedding dimension');
  }

  // Vector search pipeline
  const vectorPipeline = [
    {
      $addFields: {
        similarity: {
          $cond: [
            { $eq: [{ $type: '$embedding' }, 'array'] },
            {
              $divide: [
                {
                  $reduce: {
                    input: { $range: [0, { $size: '$embedding' }] },
                    initialValue: 0,
                    in: {
                      $add: [
                        '$$value',
                        {
                          $multiply: [
                            { $arrayElemAt: ['$embedding', '$$this'] },
                            { $arrayElemAt: [queryEmbedding, '$$this'] }
                          ]
                        }
                      ]
                    }
                  }
                },
                {
                  $multiply: [
                    {
                      $sqrt: {
                        $reduce: {
                          input: { $range: [0, { $size: '$embedding' }] },
                          initialValue: 0,
                          in: {
                            $add: [
                              '$$value',
                              {
                                $pow: [
                                  { $arrayElemAt: ['$embedding', '$$this'] },
                                  2
                                ]
                              }
                            ]
                          }
                        }
                      }
                    },
                    1.0
                  ]
                }
              ]
            },
            0
          ]
        }
      }
    },
    {
      $match: {
        similarity: { $gte: vectorMinScore }
      }
    },
    {
      $match: buildMatchStage(fieldType, jobInterviewId)
    },
    {
      $project: {
        _id: 1,
        Job_Interview_ID: 1,
        job_interview_id: 1,
        field_type: 1,
        text: 1,
        Transcript: 1,
        candidate_name: 1,
        panel_member_name: 1,
        similarity: 1,
        embedded_at: 1
      }
    },
    {
      $limit: 100
    }
  ];

  let vectorResults = [];
  let vectorMap = {};

  try {
    vectorResults = await collection.aggregate(vectorPipeline).toArray();
    
    vectorResults.forEach((doc, index) => {
      vectorMap[doc._id.toString()] = {
        score: doc.similarity,
        rank: index
      };
    });
  } catch (err) {
    console.warn('[Hybrid Search] Vector search failed:', err.message);
    // Continue with BM25-only results if vector search fails
  }

  // Step 3: Merge and re-rank results
  console.log('[Hybrid Search] Merging results from both methods...');
  const mergedMap = new Map();

  // Process BM25 results
  bm25Results.forEach(doc => {
    const vectorData = vectorMap[doc.id];
    mergedMap.set(doc.id, {
      id: doc.id,
      job_interview_id: doc.job_interview_id,
      candidate_name: doc.candidate_name,
      panel_member_name: doc.panel_member_name,
      field_type: doc.field_type,
      preview: doc.preview,
      bm25_score: doc.score,
      vector_score: vectorData ? vectorData.score : 0,
      bm25_rank: bm25Map[doc.id].rank,
      vector_rank: vectorData ? vectorData.rank : vectorResults.length
    });
  });

  // Process vector results not in BM25
  vectorResults.forEach((doc, index) => {
    const docId = doc._id.toString();
    if (!mergedMap.has(docId)) {
      mergedMap.set(docId, {
        id: docId,
        job_interview_id: doc.Job_Interview_ID || doc.job_interview_id,
        candidate_name: doc.candidate_name,
        panel_member_name: doc.panel_member_name,
        field_type: doc.field_type || 'interview',
        preview: (doc.Transcript || doc.text || '').substring(0, 200),
        bm25_score: 0,
        vector_score: doc.similarity,
        bm25_rank: bm25Results.length,
        vector_rank: index
      });
    }
  });

  // Step 4: Calculate hybrid scores
  const mergedResults = Array.from(mergedMap.values());

  // Normalize BM25 scores to 0-1 range using percentile
  const bm25Scores = mergedResults.map(r => r.bm25_score).filter(s => s > 0);
  const maxBM25 = bm25Scores.length > 0 ? Math.max(...bm25Scores) : 1;
  
  mergedResults.forEach(result => {
    const bm25Normalized = maxBM25 > 0 ? result.bm25_score / maxBM25 : 0;
    const vectorScore = result.vector_score || 0;
    
    result.score_breakdown = {
      bm25_normalized: Number(bm25Normalized.toFixed(4)),
      vector_similarity: Number(vectorScore.toFixed(4))
    };
    
    result.hybrid_score = Number(
      (bm25Normalized * normalizedBM25Weight + vectorScore * normalizedVectorWeight).toFixed(4)
    );
  });

  // Step 5: Sort by hybrid score and apply pagination
  const sortedResults = mergedResults
    .sort((a, b) => b.hybrid_score - a.hybrid_score)
    .slice(skip, skip + limit);

  const total = mergedResults.length;

  return {
    total,
    limit,
    skip,
    results: sortedResults.map(doc => ({
      id: doc.id,
      job_interview_id: doc.job_interview_id,
      candidate_name: doc.candidate_name,
      panel_member_name: doc.panel_member_name,
      field_type: doc.field_type,
      hybrid_score: doc.hybrid_score,
      bm25_score: Number(doc.bm25_score.toFixed(4)),
      vector_score: Number(doc.vector_score.toFixed(4)),
      preview: doc.preview,
      score_breakdown: doc.score_breakdown
    }))
  };
}

module.exports = { searchBM25, searchHybrid };
