/**
 * Extraction Service
 * 
 * Handles parsing of .docx and .pdf files and uses LLM to extract structured data
 * matching JD, L1, and L2 CSV schemas.
 */

const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const axios = require('axios');
const XLSX = require('xlsx');

// Configuration constants for LLM
const MAX_TOKENS = 2000;
const TEMPERATURE = 0.1;

/**
 * Core text extraction from buffer (PDF, DOCX, XLSX)
 */
async function extractTextFromBuffer(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const data = await pdf(buffer);
    return data.text;
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel'
  ) {
    // Excel support
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let fullText = '';
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      // Convert sheet to CSV string representation for the LLM
      const csv = XLSX.utils.sheet_to_csv(sheet);
      fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
    });
    return fullText;
  } else if (mimetype === 'text/plain' || mimetype === 'text/csv') {
    return buffer.toString('utf-8');
  }
  return '';
}


/**
 * Call LLM to extract structured data
 * Reuses the logic from panelEvaluationService.js
 */
async function callLLM(userPrompt, systemPrompt) {
  const ollamaBase = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
  const ollamaModel = process.env.OLLAMA_MODEL_NAME || process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';
  const groqApiKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';

  const apiUrl = ollamaBase
    ? `${ollamaBase}/api/chat`
    : 'https://api.groq.com/openai/v1/chat/completions';
  const model = ollamaBase ? ollamaModel : groqModel;
  const headers = { 'Content-Type': 'application/json' };
  if (!ollamaBase) headers['Authorization'] = `Bearer ${groqApiKey}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const body = ollamaBase
    ? { model, messages, stream: false, options: { temperature: 0.1, num_predict: 2000 } }
    : { model, messages, temperature: 0.1, max_tokens: 2000, stream: false };

  const response = await axios.post(apiUrl, body, { 
    headers, 
    timeout: ollamaBase ? 180000 : 30000 
  });

  const rawContent = ollamaBase
    ? (response.data?.message?.content || '')
    : response.data?.choices?.[0]?.message?.content;

  return (rawContent || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Extract JD data
 */
async function extractJD(text, jobId) {
  const systemPrompt = "You are a JD parser. Return ONLY valid JSON. Ensure all strings are JSON-safe (no raw newlines inside values; use \\n instead).";
  const userPrompt = `Extract the full Job Description text from the content below.
Return a JSON object with: { "Job Interview ID": "${jobId}", "JD": "extracted full text" }

Content:
${text}`;

  const response = await callLLM(userPrompt, systemPrompt);
  return parseJSONSafely(response);
}

/**
 * Extract L1 Transcript data
 */
async function extractL1(text, jobId, panelName = '', candidateName = '', panelMemberId = '', panelMemberEmail = '') {
  const systemPrompt = "You are an interview transcript parser. Return ONLY valid JSON. Ensure all strings are JSON-safe (no raw newlines inside values; use \\n instead).";
  const context = `
PANEL NAME TO LOOK FOR: ${panelName || 'any'}
CANDIDATE NAME TO LOOK FOR: ${candidateName || 'any'}
PANEL MEMBER ID: ${panelMemberId || 'N/A'}
PANEL MEMBER EMAIL: ${panelMemberEmail || 'N/A'}
`;

  const userPrompt = `Extract interview metadata from the transcript below.
Return a JSON object exactly matching this schema:
  "Candidate Name": "${candidateName || 'extract from text'}",
  "role": "extract role if mentioned, else N/A",
  "panel_member_id": "${panelMemberId || 'extract if mentioned, else N/A'}",
  "Panel Name": "${panelName || 'extract interviewer name(s)'}",
  "panel_member_email": "${panelMemberEmail || 'extract if mentioned, else N/A'}",
  "JD": "extract original JD if present in transcript, else leave empty",
  "L1_decision": "extract 'Selected' or 'Rejected' if mentioned, else N/A"
}



${context}
Content (first 30000 chars):
${text.substring(0, 30000)}`;



  console.log(`[Extraction] Calling LLM for L1 metadata (JobId: ${jobId})...`);
  const response = await callLLM(userPrompt, systemPrompt);
  console.log(`[Extraction] LLM Response:`, response);
  
  const metadata = parseJSONSafely(response);
  return {
    "Job Interview ID": jobId,
    ...metadata,
    "L1 Transcript": text // Append full text here instead of asking LLM to re-emit it
  };
}

/**
 * Extract L2 Rejection data
 */
async function extractL2(text, jobId, panelName = '', candidateName = '', panelMemberId = '', panelMemberEmail = '') {
  const systemPrompt = "You are an L2 rejection reason parser. Return ONLY valid JSON. Ensure all strings are JSON-safe (no raw newlines inside values; use \\n instead).";
  const userPrompt = `From the document below, extract the rejection details ONLY for the candidate: "${candidateName || 'the relevant candidate'}".
Note: The source document likely has a column named "L2 Feedback" — extract its content into the "L2 Rejected Reason" field.

Return a JSON object exactly matching this schema:
{
  "Job Interview ID": "${jobId}",
  "candidate_name": "${candidateName || 'extract if mentioned, else N/A'}",
  "role": "extract if mentioned, else N/A",
  "panel_member_id": "${panelMemberId || 'extract if mentioned, else N/A'}",
  "panel_member_name": "${panelName || 'extract if mentioned, else N/A'}",
  "JD": "extract if mentioned, else leave empty",
  "l2_decision": "extract decision (e.g. Rejected)",
  "L2 Rejected Reason": "EXTRACT THE CONTENT FROM THE 'L2 Feedback' COLUMN FOR ${candidateName || 'THE CANDIDATE'} AND INCLUDE ANY L1 FEEDBACK MENTIONS HERE."
}




Content (first 8000 chars):
${text.substring(0, 8000)}`;

  console.log(`[Extraction] Calling LLM for L2 specific extraction (JobId: ${jobId}, Candidate: ${candidateName})...`);
  const response = await callLLM(userPrompt, systemPrompt);
  console.log(`[Extraction] LLM Response:`, response);

  const metadata = parseJSONSafely(response);
  return {
    "Job Interview ID": jobId,
    ...metadata
  };
}


function parseJSONSafely(text) {
  try {
    console.log('[Extraction] Parsing JSON from LLM response...');
    // 1. Try to find JSON block in markdown
    const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
    let jsonText = jsonBlock ? jsonBlock[1].trim() : text.trim();

    // 2. Pre-process to handle common LLM JSON errors (raw newlines in strings)
    // We attempt to find values between quotes and escape any raw newlines
    jsonText = jsonText.replace(/: \s*"([\s\S]*?)"/g, (match, content) => {
      const sanitized = content.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      return `: "${sanitized}"`;
    });

    // 3. Try parsing
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      // Fallback: search for braces if parsing failed
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        let snippet = jsonText.slice(firstBrace, lastBrace + 1);
        // Apply the same sanitization to the snippet just in case
        snippet = snippet.replace(/: \s*"([\s\S]*?)"/g, (match, content) => {
          const sanitized = content.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          return `: "${sanitized}"`;
        });
        return JSON.parse(snippet);
      }
      throw e;
    }
  } catch (e) {
    console.error('[Extraction] JSON Parse Error:', e.message);
    console.error('[Extraction] Problematic Text:', text.substring(0, 500) + '...');
    throw new Error('LLM returned invalid JSON for extraction. Please try again.');
  }
}



module.exports = {
  extractTextFromBuffer,
  extractJD,
  extractL1,
  extractL2
};
