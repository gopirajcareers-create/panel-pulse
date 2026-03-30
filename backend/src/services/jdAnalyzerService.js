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
 * Call LLM API with retry logic (Ollama preferred, GROQ fallback)
 *
 * @private
 * @param {string} userPrompt - The prompt to send to the LLM
 * @returns {Promise<string>} LLM response text
 */
async function _callGroqWithRetry(userPrompt) {
  const maxAttempts = 3;
  const ollamaBase = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
  const ollamaModel = process.env.OLLAMA_MODEL_NAME || process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';
  const groqApiKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';

  if (!ollamaBase && !groqApiKey) {
    throw new Error('No LLM provider configured (set GROQ_API_KEY or OLLAMA_BASE_URL)');
  }

  // Use Ollama when OLLAMA_BASE_URL is configured, otherwise fall back to GROQ
  // Ollama native /api/chat works on all versions; /v1/chat/completions requires Ollama >= 0.1.24
  const apiUrl = ollamaBase
    ? `${ollamaBase}/api/chat`
    : 'https://api.groq.com/openai/v1/chat/completions';
  const model = ollamaBase ? ollamaModel : groqModel;
  const headers = { 'Content-Type': 'application/json' };
  if (!ollamaBase) headers['Authorization'] = `Bearer ${groqApiKey}`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = ollamaBase
        ? { model, messages, stream: false, options: { temperature: 0.7, num_predict: 1000 } }
        : { model, messages, temperature: 0.7, max_tokens: 1000, top_p: 1, stream: false };

      const response = await axios.post(apiUrl, body, { headers, timeout: ollamaBase ? 180000 : 30000 });

      const rawContent = ollamaBase
        ? (response.data?.message?.content || response.data?.message?.thinking || '')
        : response.data?.choices?.[0]?.message?.content;

      // Strip chain-of-thought <think> blocks emitted by deepseek-r1 style models
      const content = (rawContent || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      if (!content) throw new Error('Invalid response format from LLM API');
      return content;
    } catch (error) {
      const provider = ollamaBase ? 'Ollama' : 'GROQ';
      console.error(`[JDAnalyzer] ${provider} attempt ${attempt}/${maxAttempts} failed:`, error.message);

      if (attempt === maxAttempts) {
        throw new Error(`Failed after ${maxAttempts} attempts: ${error.message}`);
      }

      // Exponential backoff: 1s, 2s
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
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
