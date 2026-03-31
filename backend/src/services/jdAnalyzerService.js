/**
 * JD Analyzer Service
 * 
 * Analyzes Job Descriptions using LLM to extract and classify required skills.
 * Uses GROQ API with retry logic for robust skill classification.
 */

const axios = require('axios');

// System prompt for JD analysis
const SYSTEM_PROMPT = `You are a Senior Recruitment Manager preparing to take an interview.

Your task is to read through the JD and generate the list of key skills that needs to be evaluated as part of the interview.

You must classify the skills as:
- Key Skills - Core technical skills that define the role
- Mandatory Skills - Non-negotiable skills; reject candidates lacking these
- Good to have Skills - Nice-to-have but not critical for role success

CRITICAL RULES:
1. Do NOT assume intent
2. Do NOT infer requirements
3. Do NOT expand scope

If the JD is insufficient, return ONLY: "JD is very short, need more info on the JD"

Output Format (when JD is valid):
Key Skills:
[List key skills with brief explanation]

Mandatory Skills:
[List mandatory skills with brief explanation]

Good To Have Skills:
[List nice-to-have skills with brief explanation]

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

    // Call GROQ LLM with retry logic
    const groqResponse = await _callGroqWithRetry(userPrompt);

    // Parse the response
    const parsedAnalysis = _parseAnalysisResponse(groqResponse);

    return {
      success: true,
      analysis: groqResponse,
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
 * Call LLM API with retry logic — uses shared llmClient (Ollama → GROQ → Mistral)
 *
 * @private
 * @param {string} userPrompt - The prompt to send to the LLM
 * @returns {Promise<string>} LLM response text
 */
async function _callGroqWithRetry(userPrompt) {
  const { callLLM } = require('./llmClient');
  const maxAttempts = 3;
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callLLM(messages, { temperature: 0.7, maxTokens: 1000 });
    } catch (error) {
      lastError = error;
      console.error(`[JDAnalyzer] LLM attempt ${attempt}/${maxAttempts} failed:`, error.message);
      if (attempt === maxAttempts) throw new Error(`Failed after ${maxAttempts} attempts: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
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
    const keySkillsMatch = response.match(/Key Skills:\s*([\s\S]*?)(?=Mandatory Skills:|$)/i);
    const mandatorySkillsMatch = response.match(/Mandatory Skills:\s*([\s\S]*?)(?=Good To Have Skills:|Good to have Skills:|$)/i);
    const goodToHaveMatch = response.match(/Good To Have Skills:|Good to have Skills:\s*([\s\S]*?)$/i);

    const parseSkills = (text) => {
      if (!text) return [];
      return text
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 0);
    };

    return {
      key_skills: parseSkills(keySkillsMatch ? keySkillsMatch[1] : ''),
      mandatory_skills: parseSkills(mandatorySkillsMatch ? mandatorySkillsMatch[1] : ''),
      good_to_have_skills: parseSkills(goodToHaveMatch ? goodToHaveMatch[1] : '')
    };
  } catch (error) {
    console.error('Error parsing analysis response:', error.message);
    return {
      key_skills: [],
      mandatory_skills: [],
      good_to_have_skills: [],
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
