const { getDb } = require('./mongoClient');
const { embedTexts } = require('./embeddingService');

/**
 * Vector Semantic Search Service
 * Performs similarity search using vector embeddings and cosine distance
 */

/**
 * Search for semantically similar documents using vector embeddings
 * @param {string} query - Query text to embed and search
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Vector search results with scores
 */
async function searchVector(query, options = {}) {
  const {
    fieldType = null,
    jobInterviewId = null,
    limit = 10,
    skip = 0,
    minScore = 0.5
  } = options;

  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required and must not be empty');
  }

  if (limit < 1 || limit > 100) {
    throw new Error('Limit must be between 1 and 100');
  }

  if (minScore < 0 || minScore > 1) {
    throw new Error('minScore must be between 0 and 1');
  }

  // Step 1: Embed the query
  console.log('[VectorSearch] Embedding query...');
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

  // Step 2: Search using vector similarity
  const db = await getDb();
  const collection = db.collection('panel_collection');

  // Build aggregation pipeline for vector search
  const pipeline = [
    // Stage 1: Add field to compute cosine similarity
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
                    1.0 // Assume query vector is normalized
                  ]
                }
              ]
            },
            0
          ]
        }
      }
    },
    // Stage 2: Filter by minimum similarity score
    {
      $match: {
        similarity: { $gte: minScore }
      }
    },
    // Stage 3: Apply optional filters
    {
      $match: buildMatchStage(fieldType, jobInterviewId)
    },
    // Stage 4: Project results
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
    // Stage 5: Sort by similarity descending
    {
      $sort: { similarity: -1 }
    },
    // Stage 6: Pagination
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
        similarity: Number(doc.similarity.toFixed(4)),
        preview: (doc.Transcript || doc.text || '').substring(0, 200),
        embedded_at: doc.embedded_at
      }))
    };
  } catch (err) {
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
    match.Job_Interview_ID = jobInterviewId;
  }

  return Object.keys(match).length > 0 ? match : {};
}

module.exports = { searchVector };
