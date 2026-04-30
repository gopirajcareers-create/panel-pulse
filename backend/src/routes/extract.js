const express = require('express');
const router = express.Router();
const multer = require('multer');
const extractionService = require('../services/extractionService');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * POST /api/v1/extract/jd
 */
router.post('/jd', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ success: false, error: 'Job ID is required' });

    const text = await extractionService.extractTextFromBuffer(req.file.buffer, req.file.mimetype);
    const data = await extractionService.extractJD(text, jobId);

    res.json({ success: true, data });
  } catch (error) {
    console.error('JD Extraction Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/extract/l1
 */
router.post('/l1', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ success: false, error: 'Job ID is required' });

    const text = await extractionService.extractTextFromBuffer(req.file.buffer, req.file.mimetype);
    const { panelName, candidateName, panelMemberId, panelMemberEmail, jdText } = req.body;
    const data = await extractionService.extractL1(text, jobId, panelName, candidateName, panelMemberId, panelMemberEmail, jdText);

    res.json({ success: true, data });
  } catch (error) {
    console.error('L1 Extraction Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/extract/l2
 */
router.post('/l2', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const { jobId, panelName, candidateName, panelMemberId, panelMemberEmail, jdText } = req.body;
    if (!jobId) return res.status(400).json({ success: false, error: 'Job ID is required' });

    const text = await extractionService.extractTextFromBuffer(req.file.buffer, req.file.mimetype);
    const data = await extractionService.extractL2(text, jobId, panelName, candidateName, panelMemberId, panelMemberEmail, jdText);



    res.json({ success: true, data });
  } catch (error) {
    console.error('L2 Extraction Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
