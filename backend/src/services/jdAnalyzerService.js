/**
 * JD Analyzer Service
 *
 * Analyzes Job Descriptions using LLM to extract and classify required skills.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * This call is seeded and run at temperature 0, because its output DECIDES WHAT
 * GETS SCORED downstream. It ran at temperature 0.7 with no seed, and that was the
 * largest single source of Stage 1's run-to-run score drift: the match formula is
 * matched/total, so a skill list that changed length between runs changed the
 * denominator, and the same resume scored differently for reasons that had nothing
 * to do with the resume. Rewording a skill ("CI/CD" vs "CI/CD Pipelines") moved the
 * result too, since a differently-spelled skill is matched against different resume
 * text.
 *
 * Seeding also buys the cold-start warm-up: llmClient only warms SEEDED calls, so an
 * unseeded call here was additionally exposed to the first-generation-after-load
 * divergence documented in llmClient._ensureWarm.
 */

const axios = require('axios');

// Same default as L1/L2/screening so every stage is reproducible on one footing.
const ANALYZER_SEED = parseInt(process.env.JD_ANALYZER_SEED || '42', 10);
const ANALYZER_TEMPERATURE = 0;

// System prompt for JD analysis
const SYSTEM_PROMPT = `You are a Senior Recruitment Manager preparing to take an interview.

Your task is to read through the JD and generate the list of skills that needs to be evaluated as part of the interview.

You must classify the skills as:
- Mandatory Skills - Skills EXPLICITLY labeled as mandatory/required in the JD; non-negotiable
- Good to have Skills - Skills EXPLICITLY labeled as nice-to-have, preferred, or a plus
- AI Suggested Skills - Top 5 skills YOU recommend as mandatory based on the job title and role context, even if not explicitly stated in the JD

CRITICAL RULES:
1. Mandatory Skills: ONLY include skills that the JD EXPLICITLY marks with the exact words "mandatory", "required", "must have", "essential", or "must". If the JD does NOT use any of these exact words, Mandatory Skills MUST be empty. DO NOT infer or assume.
2. Only put skills in Good to have Skills if the JD explicitly labels them as preferred/nice-to-have/plus
3. AI Suggested Skills must NOT duplicate anything already in Mandatory Skills
4. Do NOT assume intent beyond what is written

If the JD is insufficient, return ONLY: "JD is very short, need more info on the JD"

Output Format (when JD is valid):
Mandatory Skills:
[List mandatory skills]

Good To Have Skills:
[List nice-to-have skills]

AI Suggested Skills:
[List top 5 AI-recommended mandatory skills]

No extra text. No explanations. No assumptions.`;

/**
 * Analyze JD and extract skill classifications
 * 
 * @param {string} jdContent - The Job Description text to analyze
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Analyzed JD with skill classifications
 */
async function analyzeJD(jdContent, options = {}) {
  try {
    // Validate input
    if (!jdContent || typeof jdContent !== 'string') {
      throw new Error('JD content must be a non-empty string');
    }

    if (jdContent.trim().length < 50) {
      return {
        success: false,
        analysis: 'JD is very short, need more info on the JD',
        raw_jd: jdContent,
        is_valid_jd: false
      };
    }

    // Build the analysis prompt
    const userPrompt = `Please analyze the following Job Description and classify the required skills:

Job Description:
${jdContent}

Provide the skill classifications as per the specified format.`;

    const llmResponse = await _callLLMWithRetry(userPrompt);

    // Parse the response
    const parsedAnalysis = _parseAnalysisResponse(llmResponse);

    return {
      success: true,
      analysis: llmResponse,
      parsed_analysis: parsedAnalysis,
      raw_jd: jdContent,
      is_valid_jd: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error analyzing JD:', error.message);
    return {
      success: false,
      error: error.message,
      raw_jd: jdContent,
      is_valid_jd: false
    };
  }
}

/**
 * Call the LLM with retry logic — uses the shared llmClient (Ollama only).
 *
 * Seeded at temperature 0: see the file header for why this call in particular must
 * be reproducible. llmClient already retries transient faults inside its own budget,
 * so the loop here is a thin outer guard and safe to keep — a seeded call at
 * temperature 0 is idempotent, so attempt 2 returns what attempt 1 would have.
 *
 * @private
 * @param {string} userPrompt - The prompt to send to the LLM
 * @returns {Promise<string>} LLM response text
 */
async function _callLLMWithRetry(userPrompt) {
  const { callLLM } = require('./llmClient');
  const maxAttempts = 3;
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callLLM(messages, {
        temperature: ANALYZER_TEMPERATURE,
        maxTokens: 1000,
        seed: ANALYZER_SEED,
        // qwen3's reasoning tokens are what produced the "Wait, hmm, I need to..."
        // fragments that reached the UI as skills. The parser splits on lines and
        // keeps every non-empty one, so thinking output became skill entries.
        think: false,
      });
    } catch (error) {
      lastError = error;
      console.error(`[JDAnalyzer] LLM attempt ${attempt}/${maxAttempts} failed:`, error.message);
      if (attempt === maxAttempts) throw new Error(`Failed after ${maxAttempts} attempts: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
  throw lastError;
}

/**
 * Parse the LLM response into structured format
 * 
 * @private
 * @param {string} response - Raw LLM response
 * @returns {Object} Parsed skill classifications
 */
function _parseAnalysisResponse(response) {
  try {
    const mandatorySkillsMatch = response.match(/Mandatory Skills:\s*([\s\S]*?)(?=Good\s*To\s*Have\s*Skills:|AI Suggested Skills:|$)/i);
    const goodToHaveMatch = response.match(/Good\s*To\s*Have\s*Skills:\s*([\s\S]*?)(?=AI Suggested Skills:|$)/i);
    const aiSuggestedMatch = response.match(/AI Suggested Skills:\s*([\s\S]*?)$/i);

    const parseSkills = (text) => {
      if (!text) return [];
      return text
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 0);
    };

    return {
      mandatory_skills: parseSkills(mandatorySkillsMatch ? mandatorySkillsMatch[1] : ''),
      good_to_have_skills: parseSkills(goodToHaveMatch ? goodToHaveMatch[1] : ''),
      key_skills: parseSkills(aiSuggestedMatch ? aiSuggestedMatch[1] : '')
    };
  } catch (error) {
    console.error('Error parsing analysis response:', error.message);
    return {
      mandatory_skills: [],
      good_to_have_skills: [],
      key_skills: [],
      parse_error: error.message
    };
  }
}

/**
 * Build the fine-tuned JD object
 * 
 * @param {string} jdContent - Original JD content
 * @param {Object} analysis - Analysis result
 * @returns {Object} Fine-tuned JD object
 */
function _buildFineTunedJD(jdContent, analysis) {
  return {
    original_jd: jdContent,
    analysis_result: analysis.analysis,
    parsed_analysis: analysis.parsed_analysis,
    is_valid: analysis.is_valid_jd,
    timestamp: new Date().toISOString(),
    summary: {
      total_key_skills: analysis.parsed_analysis?.key_skills?.length || 0,
      total_mandatory_skills: analysis.parsed_analysis?.mandatory_skills?.length || 0,
      total_good_to_have: analysis.parsed_analysis?.good_to_have_skills?.length || 0
    }
  };
}

/**
 * Analyze multiple JDs in batch
 * 
 * @param {Array<string>} jdContents - Array of JD contents to analyze
 * @returns {Promise<Array<Object>>} Array of analysis results
 */
async function analyzeJDBatch(jdContents) {
  try {
    if (!Array.isArray(jdContents)) {
      throw new Error('jdContents must be an array');
    }

    const results = [];
    for (const jdContent of jdContents) {
      const result = await analyzeJD(jdContent);
      results.push(result);
    }

    return {
      success: true,
      total_processed: results.length,
      results: results,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in batch JD analysis:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  analyzeJD,
  analyzeJDBatch
};
