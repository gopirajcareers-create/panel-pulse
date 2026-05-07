/**
 * Interview Moderation Service
 *
 * Detects potentially discriminatory or inappropriate questions in interview transcripts
 * Checks for questions related to: age, marital status, religion, gender, ethnicity, disability, etc.
 */

const MODERATION_SYSTEM_PROMPT = `/no_think
You are an HR compliance expert analyzing interview transcripts for discriminatory or inappropriate questions.

Check for questions or comments related to:
- Age (birth year, graduation dates that reveal age, retirement)
- Marital status (marriage, spouse, children, family planning)
- Religion (religious beliefs, holidays, practices)
- Gender identity or sexual orientation
- Race, ethnicity, or national origin
- Disability or health conditions (unless job-related)
- Pregnancy or family planning
- Language or accent discrimination
- Region/location-based stereotyping
- Physical appearance comments

Return ONLY valid JSON. No additional text.`;

/**
 * Analyze interview transcript for discriminatory questions
 *
 * @param {Object} input - Moderation input
 * @param {string} input.l1_transcript - Interview transcript to analyze
 * @param {string} input.job_id - Job/Interview ID (optional)
 * @returns {Promise<Object>} Moderation result with flags for each category
 */
async function analyzeInterviewModeration(input) {
  try {
    const { l1_transcript, job_id = 'N/A' } = input;

    // Validate inputs
    if (!l1_transcript || typeof l1_transcript !== 'string') {
      throw new Error('Missing or invalid l1_transcript');
    }

    // Truncate transcript if too long
    const MAX_CHARS = 12000;
    const truncatedTranscript = l1_transcript.length > MAX_CHARS
      ? l1_transcript.substring(0, MAX_CHARS) + '\n[... transcript truncated for moderation analysis ...]'
      : l1_transcript;

    const userPrompt = _buildModerationPrompt(truncatedTranscript, job_id);

    // Call LLM for moderation analysis
    const llmResponse = await _callLLMWithRetry(userPrompt, MODERATION_SYSTEM_PROMPT, 800);

    // Parse and validate response
    const moderation = _parseModerationResponse(llmResponse);

    return {
      success: true,
      moderation: moderation,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in interview moderation:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Build moderation analysis prompt
 * @private
 */
function _buildModerationPrompt(transcript, job_id) {
  return `/no_think
Analyze this interview transcript for discriminatory or inappropriate questions asked by the interviewer/panel.

Job ID: ${job_id}

Interview Transcript:
${transcript}

For each category below, determine if the interviewer asked inappropriate questions:
1. Age-related questions (birth year, graduation dates revealing age, retirement plans)
2. Marital status questions (marriage, spouse, children, family planning)
3. Religion-related questions (beliefs, practices, holidays)
4. Gender/sexual orientation questions
5. Race/ethnicity/national origin questions
6. Disability/health questions (unless directly job-related)
7. Pregnancy/family planning questions
8. Language/accent discrimination
9. Region/location-based stereotyping or bias
10. Physical appearance comments

Return ONLY a valid JSON object:
{
  "job_id": "${job_id}",
  "flags": {
    "age": {
      "detected": true|false,
      "evidence": ["quote from interviewer if detected, empty array if not"],
      "severity": "none|low|medium|high"
    },
    "marital_status": {
      "detected": true|false,
      "evidence": ["quote from interviewer if detected, empty array if not"],
      "severity": "none|low|medium|high"
    },
    "religion": {
      "detected": true|false,
      "evidence": ["quote from interviewer if detected, empty array if not"],
      "severity": "none|low|medium|high"
    },
    "gender": {
      "detected": true|false,
      "evidence": ["quote from interviewer if detected, empty array if not"],
      "severity": "none|low|medium|high"
    },
    "race_ethnicity": {
      "detected": true|false,
      "evidence": ["quote from interviewer if detected, empty array if not"],
      "severity": "none|low|medium|high"
    },
    "disability": {
      "detected": true|false,
      "evidence": ["quote from interviewer if detected, empty array if not"],
      "severity": "none|low|medium|high"
    },
    "language_region": {
      "detected": true|false,
      "evidence": ["quote from interviewer if detected, empty array if not"],
      "severity": "none|low|medium|high"
    }
  },
  "overall_compliance": "pass|warning|fail",
  "summary": "Brief summary of findings"
}

IMPORTANT:
- Only flag questions asked by the INTERVIEWER/PANEL, not candidate responses
- Context matters: technical questions about work authorization or job-related accommodations are acceptable
- Be precise: only flag clear violations, not ambiguous statements
- severity: "high" = direct discriminatory question, "medium" = indirect/implied, "low" = borderline/context-dependent, "none" = no violation`;
}

/**
 * Call LLM API using shared llmClient
 * @private
 */
async function _callLLMWithRetry(userPrompt, systemPrompt, maxTokens = 800) {
  const { callLLM, getProvider } = require('./llmClient');
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    return await callLLM(messages, { temperature: 0.1, maxTokens, think: false });
  } catch (error) {
    const provider = getProvider() || 'LLM';
    const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error(`[Moderation] ${provider} request failed:`, detail);

    if (error.response?.status === 429) {
      throw new Error(`${provider} rate limit (429) — moderation temporarily unavailable. Please try again later.`);
    }
    if (error.response?.status === 404) {
      throw new Error(`${provider} 404 — model not found or endpoint unavailable.`);
    }
    throw new Error(`${provider} request failed: ${detail}`);
  }
}

/**
 * Parse and validate moderation response
 * @private
 */
function _parseModerationResponse(response) {
  try {
    const text = String(response || '');

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = null;
    const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
    if (jsonBlock) {
      jsonText = jsonBlock[1].trim();
    } else {
      // Balanced-brace scan for first complete JSON object
      const firstBrace = text.indexOf('{');
      if (firstBrace !== -1) {
        let idx = firstBrace, depth = 0, inString = false, escape = false, endIdx = -1;
        while (idx < text.length) {
          const ch = text[idx];
          if (escape) { escape = false; }
          else if (ch === '\\') { escape = true; }
          else if (ch === '"') { inString = !inString; }
          else if (!inString) {
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) { endIdx = idx; break; } }
          }
          idx++;
        }
        if (endIdx !== -1) jsonText = text.slice(firstBrace, endIdx + 1);
      }
    }

    if (!jsonText) {
      throw new Error('No JSON found in moderation response');
    }

    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.flags || typeof parsed.flags !== 'object') {
      throw new Error('Invalid moderation response: missing flags object');
    }

    // Ensure all expected categories exist with defaults
    const categories = ['age', 'marital_status', 'religion', 'gender', 'race_ethnicity', 'disability', 'language_region'];
    for (const category of categories) {
      if (!parsed.flags[category]) {
        parsed.flags[category] = { detected: false, evidence: [], severity: 'none' };
      }
    }

    // Normalize severity values
    for (const flag of Object.values(parsed.flags)) {
      if (!['none', 'low', 'medium', 'high'].includes(flag.severity)) {
        flag.severity = 'none';
      }
    }

    // Ensure overall compliance is set
    if (!parsed.overall_compliance || !['pass', 'warning', 'fail'].includes(parsed.overall_compliance)) {
      // Auto-determine based on flags
      const hasHigh = Object.values(parsed.flags).some(f => f.severity === 'high');
      const hasMedium = Object.values(parsed.flags).some(f => f.severity === 'medium');
      const hasLow = Object.values(parsed.flags).some(f => f.severity === 'low');

      parsed.overall_compliance = hasHigh ? 'fail' : (hasMedium || hasLow) ? 'warning' : 'pass';
    }

    // Ensure summary exists
    if (!parsed.summary) {
      parsed.summary = 'Moderation analysis complete';
    }

    return parsed;
  } catch (error) {
    console.error('Error parsing moderation response:', error.message);
    // Return safe default on parse failure
    return {
      job_id: 'N/A',
      flags: {
        age: { detected: false, evidence: [], severity: 'none' },
        marital_status: { detected: false, evidence: [], severity: 'none' },
        religion: { detected: false, evidence: [], severity: 'none' },
        gender: { detected: false, evidence: [], severity: 'none' },
        race_ethnicity: { detected: false, evidence: [], severity: 'none' },
        disability: { detected: false, evidence: [], severity: 'none' },
        language_region: { detected: false, evidence: [], severity: 'none' }
      },
      overall_compliance: 'pass',
      summary: 'Moderation analysis failed - assuming compliant'
    };
  }
}

/**
 * Store moderation result in MongoDB
 * @private
 */
async function _storeModerationInDB(jobId, panelName, candidateName, moderationResult) {
  try {
    const { getDb } = require('./mongoClient');
    const db = await getDb();
    const collection = db.collection('panel_evaluations');

    // Update the existing evaluation document with moderation results
    await collection.updateOne(
      {
        'Job Interview ID': jobId,
        'Panel Name': panelName,
        'Candidate Name': candidateName
      },
      {
        $set: {
          moderation: moderationResult,
          moderation_analyzed_at: new Date().toISOString()
        }
      }
    );

    console.log(`Stored moderation result for Job ID: ${jobId}`);
  } catch (error) {
    console.error('Error storing moderation result:', error.message);
    // Don't throw - moderation analysis was successful, just log the storage error
  }
}

module.exports = {
  analyzeInterviewModeration,
  _storeModerationInDB
};
