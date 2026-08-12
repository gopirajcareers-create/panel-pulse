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

FORMATTING RULES — these decide whether your answer can be read at all:
5. Write ONE skill per line, each starting with "- ". Never put several skills on one
   line separated by commas, and never wrap a section in square brackets.
6. Keep each skill to a short noun phrase (1-8 words). Name the skill, do not describe
   it: write "Stakeholder Management", not "Ability to manage multiple stakeholders and
   competing priorities across the business".
7. If a section has no skills, write exactly "- None" under it. Never omit the header.

Output Format (when JD is valid) — reproduce these headers EXACTLY:
Mandatory Skills:
- <skill>
- <skill>

Good To Have Skills:
- <skill>

AI Suggested Skills:
- <skill>

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

// ─── Response parsing ────────────────────────────────────────────────────────
//
// The model is asked for one skill per line under three fixed headers, and MOSTLY
// obliges. It is not contractually bound to, and the parser used to treat the
// happy shape as the only shape: headers had to end in a literal colon, and each
// section body was split on newlines ONLY.
//
// That made Stage 1 fail outright on real JDs. Measured against JD.csv row 1
// (Account Manager, 2146 chars) on qwen3:latest at seed 42 / temperature 0 — so
// this is the DETERMINISTIC result for that JD, not an unlucky sample:
//
//   Mandatory Skills:
//   [Client Relationship Management, Account Growth & Business Development, ...]
//
// One bracketed, comma-joined line. Newline-splitting yielded a single 600-char
// "skill", which screeningService.cleanSkillList then discarded twice over — as a
// bracketed template placeholder, and as over-80-chars — leaving zero skills in
// all three buckets and throwing "No skills could be extracted from the JD".
//
// That is the reported bug: it hits "few records only" because whether the model
// answers in lines or in one comma-joined list varies BY JD, and is stable per JD.
// A JD that fails, fails every retry — the seed guarantees it.
//
// So the shapes below are tolerated deliberately. Each was observed or is a near
// neighbour of one that was; none of them mean the JD lacks skills.

/**
 * Header spellings for one section, tolerant of markdown and missing colons.
 *
 * Note the end-of-input assertion: `(?![\s\S])`, not `$`. Under the `m` flag `$` matches
 * the end of EVERY line, so a lazy body combined with `|$` stopped at the first newline
 * and captured the empty string — every section parsed as empty and every JD looked
 * skill-less. JS has no `\z`, so the negative lookahead is the way to say "really the end".
 */
function _sectionRegex(headerPattern, followers) {
  // Leading  ###/**/-  · trailing **/: optional · then the body up to the next header.
  const head = `^[ \\t]*(?:[#>*_-]+[ \\t]*)*${headerPattern}[ \\t]*:?[ \\t]*\\**[ \\t]*$`;
  const END = '(?![\\s\\S])';
  const stop = followers.length
    ? `(?=${followers.map(f => `^[ \\t]*(?:[#>*_-]+[ \\t]*)*\\**[ \\t]*${f}`).join('|')}|${END})`
    : `(?=${END})`;
  return new RegExp(`${head}([\\s\\S]*?)${stop}`, 'im');
}

const H_MANDATORY  = 'Mandatory\\s*Skills';
const H_GOODTOHAVE = 'Good\\s*[-]?\\s*To\\s*[-]?\\s*Have\\s*Skills';
// The model alternates between "AI Suggested" and "AI-Suggested".
const H_AI         = 'AI\\s*[-]?\\s*Suggested\\s*Skills';

const SECTION_MANDATORY  = _sectionRegex(H_MANDATORY,  [H_GOODTOHAVE, H_AI]);
const SECTION_GOODTOHAVE = _sectionRegex(H_GOODTOHAVE, [H_AI]);
const SECTION_AI         = _sectionRegex(H_AI,         []);

/** Values that mean "this section is empty", not "this is a skill". */
const EMPTY_MARKERS = new Set(['', 'none', 'n/a', 'na', 'nil', 'not specified', 'not applicable', 'not mentioned', '-', '--']);

/**
 * Is this line the template placeholder echoed back rather than a real answer?
 * Kept narrow on purpose: "[List mandatory skills]" is noise, but "[Java, SQL]" is
 * a real answer that merely arrived wrapped in brackets, and the old blanket
 * "starts with [ and ends with ]" rule threw both away.
 */
function _isPlaceholder(s) {
  return /^\[?\s*list\b/i.test(s) || /^\[?\s*(insert|add|e\.?g\.?)\b/i.test(s);
}

/**
 * Split one section body into individual skills.
 *
 * ── Why a bullet is authoritative ────────────────────────────────────────────
 * Two shapes have to be handled, and they want OPPOSITE treatment of commas:
 *
 *   - Operational, Hiring and Delivery Management        ← ONE skill, comma is internal
 *   [Client Relationship Management, Account Growth]     ← TWO skills, comma delimits
 *
 * So the rule is: if the model delimited the line itself — with a bullet or a number —
 * that delimiter is respected and the line is ONE skill. Only an undelimited line is
 * comma-split, which is the only case where a comma can be carrying that job.
 *
 * Splitting bulleted lines on commas too was tried first and was worse than the bug it
 * fixed: "Proficiency in preparing proposals, RFX responses, and presentations" became
 * three rows, one of them the bare word "presentations", and each junk row is a skill
 * the resume can never match, pulling the match percentage down. One clumsy-but-whole
 * skill scores more honestly than three fragments.
 *
 * @private
 */
function _splitSkills(text) {
  if (!text) return [];
  const out = [];

  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    line = line.replace(/^\*\*(.*)\*\*$/, '$1').trim();          // **bold** line
    if (_isPlaceholder(line)) continue;

    // Did the MODEL delimit this line? Record it before stripping the marker.
    const bulleted = /^(?:[-*•▪·]+\s*|\d+[.)]\s*)/.test(line);
    line = line.replace(/^[-*•▪·]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();

    // A bracket or brace wrapping the WHOLE line is packaging, not content.
    line = line.replace(/^[[({]\s*/, '').replace(/\s*[\])}]$/, '').trim();
    if (!line || _isPlaceholder(line)) continue;

    // Pipes always delimit — no skill name contains one.
    const segments = bulleted
      ? line.split(/\s+\|\s+/)
      : line.split(/[,;]|\s+\|\s+/);

    for (const part of segments) {
      const s = part.trim()
        .replace(/^[-*•▪·]+\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/^(?:and|or|as well as)\s+/i, '')     // artefact of comma-splitting
        .replace(/[.,;:]+$/, '')
        .trim();
      if (!s || EMPTY_MARKERS.has(s.toLowerCase())) continue;
      if (_isPlaceholder(s)) continue;
      out.push(s);
    }
  }

  return out;
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
    const text = String(response || '');
    const section = (re) => {
      const m = text.match(re);
      return m ? m[1] : '';
    };

    const parsed = {
      mandatory_skills: _splitSkills(section(SECTION_MANDATORY)),
      good_to_have_skills: _splitSkills(section(SECTION_GOODTOHAVE)),
      key_skills: _splitSkills(section(SECTION_AI)),
    };

    // A response that matched no header at all is a different failure from a JD with no
    // skills, and the caller can only report it honestly if it can tell them apart.
    if (!SECTION_MANDATORY.test(text) && !SECTION_GOODTOHAVE.test(text) && !SECTION_AI.test(text)) {
      // The system prompt DEFINES this sentence as the answer for a JD too thin to
      // analyse, so it is the model complying, not misbehaving. The length pre-check in
      // analyzeJD only catches <50 chars; a 300-char JD of pure culture blurb reaches the
      // model and comes back here. Flagging it as a malformed response would tell the user
      // to retry a call that will deterministically return the same thing.
      if (/need more info on the JD/i.test(text)) {
        parsed.insufficient_jd = true;
        console.warn('[JDAnalyzer] Model judged the JD too thin to analyse: ' +
          `"${text.trim().slice(0, 120)}"`);
      } else {
        parsed.unstructured_response = true;
        console.warn('[JDAnalyzer] Response contained none of the three expected section headers — ' +
          `no skills could be parsed. First 200 chars: ${text.slice(0, 200)}`);
      }
    }

    return parsed;
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
  analyzeJDBatch,
  // Exported for scripts/test_jd_skill_parse.js. The parse step is where Stage 1's
  // "No skills could be extracted from the JD" originated, and it could not be tested
  // without running a live model against a specific JD to reproduce the answer shape.
  _parseAnalysisResponse,
};
