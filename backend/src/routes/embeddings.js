const express = require('express');
const { embedTexts } = require('../services/embeddingService');
const { getDb } = require('../services/mongoClient');

const router = express.Router();

const VALID_FIELD_TYPES = ['jd', 'l1_transcript', 'panel_notes', 'l2_rejection'];

/**
 * POST /api/v1/embeddings
 * Generate and store vector embeddings for interview documents
 */
router.post('/', async (req, res) => {
  try {
    const { documents } = req.body;

    // Validate input
    if (!Array.isArray(documents)) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: 'documents must be an array'
      });
    }

    if (documents.length === 0) {
      return res.status(400).json({
        error: 'Empty documents array',
        details: 'At least one document required'
      });
    }

    if (documents.length > 100) {
      return res.status(400).json({
        error: 'Too many documents',
        details: 'Maximum 100 documents per request'
      });
    }

    // Validate each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      if (!doc.job_interview_id) {
        return res.status(400).json({
          error: 'Missing field',
          details: `documents[${i}].job_interview_id is required`
        });
      }

      if (!doc.text || typeof doc.text !== 'string') {
        return res.status(400).json({
          error: 'Invalid text field',
          details: `documents[${i}].text must be a non-empty string`
        });
      }

      if (!doc.field_type || !VALID_FIELD_TYPES.includes(doc.field_type)) {
        return res.status(400).json({
          error: 'Invalid field_type',
          details: `documents[${i}].field_type must be one of: ${VALID_FIELD_TYPES.join(', ')}`
        });
      }
    }

    // Extract texts for embedding
    const texts = documents.map(d => d.text);

    // Call Mistral API
    console.log(`[Embeddings] Embedding ${texts.length} documents...`);
    const embeddings = await embedTexts(texts);

    // Prepare documents for MongoDB storage
    const db = await getDb();
    const collection = db.collection('panel_collection');
    const timestamp = new Date();

    const bulkOps = documents.map((doc, idx) => ({
      updateOne: {
        filter: {
          job_interview_id: doc.job_interview_id,
          field_type: doc.field_type
        },
        update: {
          $set: {
            job_interview_id: doc.job_interview_id,
            field_type: doc.field_type,
            text: doc.text,
            embedding: embeddings[idx],
            vector_dimension: embeddings[idx].length,
            embedded_at: timestamp,
            model: 'mistral-embed'
          }
        },
        upsert: true
      }
    }));

    // Execute bulk write
    await collection.bulkWrite(bulkOps);

    console.log(`[Embeddings] Successfully embedded and stored ${documents.length} documents`);

    res.json({
      success: true,
      embedded_count: documents.length,
      documents: documents.map((doc, idx) => ({
        job_interview_id: doc.job_interview_id,
        field_type: doc.field_type,
        vector_dimension: embeddings[idx].length,
        stored: true
      })),
      timestamp: timestamp.toISOString()
    });

  } catch (err) {
    console.error('[Embeddings] Error:', err.message);

    if (err.message.includes('MISTRAL_API_KEY')) {
      return res.status(401).json({
        error: 'Mistral API key not configured',
        code: 'MISTRAL_KEY_MISSING'
      });
    }

    if (err.message.includes('Mistral API') || err.message.includes('timeout')) {
      return res.status(503).json({
        error: 'Embedding service unavailable',
        reason: err.message
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

module.exports = router;
