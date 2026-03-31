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

const MAX_TOKENS = 2000;
const TEMPERATURE = 0.1;
const EXCEL_CELL_LIMIT = 30000; // Target under Excel's 32,767 to leave safety margin

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
  const llmClient = require('./llmClient');
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  return llmClient.callLLM(messages, { temperature: 0.1, maxTokens: 2000 });
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
async function extractL1(text, jobId, panelName = '', candidateName = '', panelMemberId = '', panelMemberEmail = '', jdText = '') {
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

  // Compress transcript to fit within Excel cell limit
  let transcript = text;
  if (text.length > EXCEL_CELL_LIMIT) {
    console.log(`[Extraction] Transcript is ${text.length} chars — compressing to fit Excel limit...`);
    transcript = await compressTranscript(text);
    console.log(`[Extraction] Compressed transcript: ${text.length} → ${transcript.length} chars`);
  }

  return {
    "Job Interview ID": jobId,
    ...metadata,
    "JD": jdText || metadata["JD"] || '',
    "L1 Transcript": transcript
  };
}

/**
 * Extract L2 Rejection data
 */
async function extractL2(text, jobId, panelName = '', candidateName = '', panelMemberId = '', panelMemberEmail = '', jdText = '') {
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
    ...metadata,
    "JD": jdText || metadata["JD"] || ''
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


/**
 * Rule-based transcript compression (Pass 1 only).
 * Removes metadata, timestamps, filler-only lines, and collapses same-speaker.
 * Preserves ALL actual spoken content.
 */
async function compressTranscript(text) {
  let str = text;

  // 1. Remove header/metadata lines
  //    "L1 Interview-...-Meeting Recording"
  str = str.replace(/L[12]\s+Interview[^\n]*Meeting\s+Recording[^\n]*/gi, '');
  //    "March 4, 2026, 10:52AM"
  str = str.replace(/\w+\s+\d{1,2},\s+\d{4},?\s+\d{1,2}:\d{2}\s*(AM|PM)[^\n]*/gi, '');
  //    "50m 32s"
  str = str.replace(/\n?\d+m\s+\d+s\s*/gi, '');

  // 2. Remove "started transcription" lines
  str = str.replace(/[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+started\s+transcription[^\n]*/gi, '');

  // 3. Strip timestamps from speaker labels
  //    "Ramkumar Subramanyan   0:03" -> "Ramkumar Subramanyan:"
  str = str.replace(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\s+\d{1,2}:\d{2}/g, '$1:');

  // 4. Remove pure filler-only lines (lines that ONLY contain filler words, nothing else)
  const lines = str.split('\n');
  const FILLER_ONLY = /^\s*(?:yeah|yes|okay|ok|mm|um|uh|hmm|oh|ah|yep|sure|right)\s*[.,!?]*\s*$/i;
  const SHORT_JUNK = /^\s*[A-Za-z.,!?]{1,3}\s*$/;  // "M.", "P.", "It.", "You."
  const filtered = lines.filter(l => {
    const t = l.trim();
    if (!t) return false; // remove blank lines
    if (SHORT_JUNK.test(t)) return false;
    if (FILLER_ONLY.test(t)) return false;
    return true;
  });

  // 5. Collapse consecutive same-speaker labels
  const merged = [];
  let lastSpeaker = '';
  for (const line of filtered) {
    const speakerMatch = line.match(/^\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+):\s*$/);
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim();
      if (speaker === lastSpeaker) {
        // Same speaker consecutive — skip duplicate label
        continue;
      }
      lastSpeaker = speaker;
    } else if (line.trim()) {
      // Reset speaker tracking on content lines
      // (don't reset — keep tracking for merging)
    }
    merged.push(line);
  }

  // 6. Collapse whitespace
  str = merged.join('\n');
  str = str.replace(/\n{2,}/g, '\n');
  str = str.replace(/  +/g, ' ');
  str = str.trim();

  console.log(`[Compression] Pass 1: ${text.length} -> ${str.length} chars (saved ${text.length - str.length})`);
  return str;
}


module.exports = {
  extractTextFromBuffer,
  extractJD,
  extractL1,
  extractL2
};
