/**
 * Skill-match tier scoring — derive a screening match score from resume evidence.
 *
 * This is to Stage 1 what evidenceTierScoring is to L1/L2, and it exists for the
 * same reason: the model used to both find the evidence AND compute the number.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Stage 1 used to hand the model a formula in prose —
 *
 *     (mandatoryMatched / totalMandatory * 70) + (goodToHaveMatched / totalGoodToHave * 30)
 *
 * — and trust the integer that came back, validated only by `typeof === 'number'`.
 * An 8B model doing arithmetic on its own judgement is two independent sources of
 * drift stacked on one field, and nothing reconciled the number against the
 * checkmarks rendered beside it. The score and the evidence could simply disagree.
 *
 * Here the model reports evidence per skill; every number is computed in code from
 * that evidence. An auditor can re-read the quotes and reproduce the percentage by
 * hand, which is the point.
 *
 * ── Tiers and grades ─────────────────────────────────────────────────────────
 * Three TIERS decide the shape of the verdict — STRONG / PARTIAL / NONE — and they
 * are what the UI colours, the report prints and Stage 4's audit prompt reads.
 *
 * Three tiers rather than a boolean because a boolean is a coin flip on borderline
 * evidence. "Listed under Skills, no project" is genuinely between yes and no, and
 * forcing it to a side moved the whole score by 80/N between runs of the same
 * record — the single largest contributor to the instability this module fixes.
 *
 * But PARTIAL then covered too much ground to be one number. A skill named in the
 * resume, in a project, with a duration, that the model merely declined to call
 * STRONG scored 0.5 — identical to a skill whose name appears nowhere and was
 * inferred from surrounding prose. Those are not the same candidate. So the PARTIAL
 * tier carries a GRADE, and the credit comes from the grade:
 *
 *   STRONG        1.00  — claimed strong, and the resume backs every check.
 *   PARTIAL_HIGH  1.00  — the model hedged, the resume did not: named, with
 *                         duration / project / action / outcome behind it. Full
 *                         credit, because the evidence is a STRONG match and only
 *                         the model's own caution held it back.
 *   PARTIAL_MID   0.75  — named in the resume, but only named: a bare skills-list
 *                         mention with no context. Familiarity, not demonstrated use.
 *   PARTIAL_LOW   0.50  — the skill's own name is absent; the match is inferred from
 *                         surrounding evidence. Also where a skill the model never
 *                         reported on lands, since an unexamined skill is not a
 *                         verified one.
 *   NONE          0     — absent from the resume, or the quote is not in it.
 *
 * Note what is NOT a grade boundary: `looks_like_skills_list`. It is computed as
 * "list-shaped AND no context markers", so it can only ever fire alongside the
 * no-context check and never decides a grade by itself. It stays a demotion REASON,
 * because it is the clearest way to say why a row is only mid-graded.
 *
 * ── Why nothing here trusts the model's tier outright ────────────────────────
 * Same lesson as evidenceTierScoring, whose header records model flags coming back
 * true for all six dimensions on one run and false for four on the next. So the
 * claimed tier is a CEILING, not the verdict: every claim is checked against the
 * resume text and demoted when the text does not support it. Checks are pure
 * string operations, so they are identical on every run by construction.
 *
 * Negatives are trusted as-is. A model declining to find evidence is not inflating
 * anything, and re-litigating a NONE would mean searching the resume ourselves —
 * which is the model's job, not this module's.
 */

'use strict';

// Credit awarded per GRADE, as a fraction of one skill's worth of the bucket.
// See the header for what each grade means and why HIGH is paid in full.
const GRADE_CREDIT = {
  STRONG: 1.0,
  PARTIAL_HIGH: 1.0,
  PARTIAL_MID: 0.75,
  PARTIAL_LOW: 0.5,
  NONE: 0,
};

// Ordered weakest → strongest, so a demotion is `min(claimed, allowed)` by index.
const TIER_ORDER = ['NONE', 'PARTIAL', 'STRONG'];
const GRADE_ORDER = ['NONE', 'PARTIAL_LOW', 'PARTIAL_MID', 'PARTIAL_HIGH', 'STRONG'];

// Bucket weights. Mandatory skills carry the score; a good-to-have skill is by
// definition not disqualifying, and 20 points is about one status band of headroom —
// enough to separate two candidates with identical mandatory coverage, not enough to
// carry either of them across a threshold on good-to-have evidence alone. It was 30,
// which let 3-of-5 mandatory plus a full good-to-have list reach 72% and read
// "Eligible" with two must-have skills unevidenced.
//
// When a bucket is EMPTY its weight is redistributed rather than left unearnable —
// see computeMatchScore.
const MANDATORY_WEIGHT = 80;
const GOOD_TO_HAVE_WEIGHT = 20;

// Status bands, applied to the final percentage. These match the thresholds the UI
// tooltip has always shown; the difference is that the band is now derived from the
// score instead of being a second, independently-guessed field.
const STATUS_BANDS = [
  { min: 70, status: 'Eligible' },
  { min: 40, status: 'Partially Eligible' },
  { min: 0,  status: 'Ineligible' },
];

// Fraction of a quote's distinctive words that must appear in the resume for the
// quote to count as grounded. Not 1.0: the prompt allows paraphrase, and models
// reorder and inflect words even when quoting faithfully. 0.6 was chosen to catch
// wholesale invention while tolerating "Automated regression suites" summarising
// "Automation of regression test suites".
const GROUNDING_THRESHOLD = 0.6;

// Words carrying no matching signal. Deliberately short — an aggressive stoplist
// would strip so much from a short quote that the grounding ratio turns to noise.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were', 'has', 'have',
  'had', 'not', 'but', 'are', 'his', 'her', 'their', 'its', 'our', 'out', 'via',
  'using', 'used', 'use', 'into', 'onto', 'per', 'was', 'been', 'being', 'also',
  'such', 'than', 'then', 'them', 'they', 'you', 'your', 'all', 'any', 'can',
  'resume', 'candidate', 'mentions', 'mentioned', 'found', 'evidence',
]);

/**
 * Markers that turn a mention into demonstrated experience. A skill named beside any
 * of these is being described as something the candidate DID; a skill named without
 * them is typically sitting in a comma-separated technology list.
 */
const CONTEXT_PATTERNS = [
  // Duration: "3 years", "18 months", "3+ yrs"
  /\b\d+\+?\s*(?:years?|yrs?|months?)\b/i,
  // Measurable outcome: "200+ test cases", "reduced by 40%"
  /\b\d+\s*%/,
  /\b\d{2,}\+?\s*(?:test cases|suites|scripts|users|records|apis|endpoints|tickets|defects|releases)\b/i,
  // Action verbs — the candidate doing the thing rather than listing it.
  /\b(?:implemented|developed|built|created|designed|architected|automated|migrated|integrated|optimi[sz]ed|refactored|deployed|configured|maintained|led|managed|mentored|owned|delivered|executed|authored|wrote|performed|conducted|coordinated|reduced|improved|increased|resolved|debugged|troubleshot|tested|validated|reviewed)\b/i,
  // Project / role framing.
  /\b(?:project|projects|client|clients|production|sprint|release|team|module|application|platform|pipeline|framework|role|responsibilit)/i,
];

// Separators that mean "either of these", not "both of these". "Agile / Scrum" is
// one skill satisfied by either word, so requiring both would fail a resume that
// says only "Scrum" — a false NONE on a skill the candidate plainly has.
const ALTERNATION_SPLIT = /\s*[/|]\s*|\s+or\s+/i;

/**
 * Lowercase and reduce to space-separated words.
 *
 * `+` and `#` survive because they are load-bearing in skill names (C++, C#), as do
 * digits (S3, EC2, Java 17). Everything else becomes a separator, so "CI/CD",
 * "ci-cd" and "CI CD" normalise alike.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The distinctive words of a phrase: de-duplicated, stopwords and 1–2 character
 * fragments removed. Short tokens are dropped because they match everywhere and
 * would inflate every grounding ratio.
 *
 * @param {string} text
 * @returns {string[]}
 */
function significantTokens(text) {
  const seen = new Set();
  for (const token of normalizeForMatch(text).split(' ')) {
    if (token.length > 2 && !STOPWORDS.has(token)) seen.add(token);
  }
  return [...seen];
}

/**
 * Is this skill named anywhere in the resume?
 *
 * Multi-word skills need every word present SOMEWHERE in the resume, not adjacent:
 * "API Testing" is satisfied by "Tested REST APIs", which no substring search finds.
 * Alternation-separated skills ("Agile / Scrum") need only one side.
 *
 * A skill whose own words are absent cannot honestly be STRONG — but it can still be
 * PARTIAL, because soft skills like "Problem Solving" are evidenced by description
 * rather than by name. See deriveTier.
 *
 * @param {string} skill
 * @param {string} resumeText — the FULL resume, not the slice sent to the model
 * @returns {boolean}
 */
function skillMentioned(skill, resumeText) {
  const haystack = new Set(normalizeForMatch(resumeText).split(' '));
  if (haystack.size === 0) return false;

  const alternatives = String(skill || '').split(ALTERNATION_SPLIT).filter(a => a.trim());
  for (const alt of alternatives.length ? alternatives : [skill]) {
    const tokens = significantTokens(alt);
    if (!tokens.length) continue;
    if (tokens.every(t => haystack.has(t))) return true;
  }
  return false;
}

/**
 * Find the skill named as a CONTIGUOUS phrase in the resume, with a real quote.
 *
 * Deliberately stricter than skillMentioned, and used for the opposite purpose.
 * skillMentioned matches tokens anywhere in the resume, which is safe when capping a
 * claim the model already made — a false positive there only permits a tier the model
 * asked for. Overturning a NONE is different: a false positive invents a match, so it
 * demands an unambiguous hit.
 *
 * "Exposure to performance testing tools" has its four words scattered across almost
 * any QA resume and must NOT promote; "Cypress" appearing literally must. Requiring
 * adjacency separates the two.
 *
 * Words may be separated by any punctuation, so "CI/CD Pipelines" matches "CI-CD
 * pipelines". Alternation branches are tried separately: "Playwright or Cypress" is
 * satisfied by either name alone.
 *
 * @param {string} skill
 * @param {string} resumeText — the FULL resume
 * @returns {{found: boolean, phrase: string|null, snippet: string|null}}
 */
function skillPhraseInResume(skill, resumeText) {
  const text = String(resumeText || '');
  if (!text.trim()) return { found: false, phrase: null, snippet: null };

  const branches = String(skill || '').split(ALTERNATION_SPLIT).filter(b => b.trim());
  for (const branch of branches.length ? branches : [skill]) {
    const tokens = significantTokens(branch);
    // No distinctive words (e.g. "QA", "UI") — nothing here is safe to promote on.
    if (!tokens.length) continue;

    // Match in the branch's own word order, not the de-duplicated token order.
    const ordered = normalizeForMatch(branch).split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w));
    if (!ordered.length) continue;

    const escaped = ordered.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Bounded on both sides so "cypress" does not match inside a longer word.
    const re = new RegExp(`(?<![a-z0-9])${escaped.join('[^a-z0-9]{1,3}')}(?![a-z0-9])`, 'i');
    const hit = re.exec(text);
    if (!hit) continue;

    // Quote the surrounding line, so the promoted row carries real evidence rather
    // than an assertion. Trimmed to a sentence-ish window around the hit.
    const from = Math.max(0, text.lastIndexOf('\n', hit.index) + 1);
    const lineEnd = text.indexOf('\n', hit.index);
    const to = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(from, to).trim();
    const snippet = line.length > 240
      ? line.slice(Math.max(0, hit.index - from - 80), hit.index - from + 160).trim()
      : line;

    return { found: true, phrase: hit[0], snippet: snippet || hit[0] };
  }
  return { found: false, phrase: null, snippet: null };
}

/**
 * What fraction of the quote's distinctive words actually occur in the resume?
 *
 * This is the anti-invention check. A model asked for verbatim evidence sometimes
 * writes a plausible sentence instead, and a fabricated quote produced a match the
 * resume never supported — invisible in the UI, since the fabrication reads exactly
 * like real evidence.
 *
 * @param {string} quote
 * @param {string} resumeText — the FULL resume
 * @returns {{ratio: number, matched: number, total: number}}
 */
function groundingRatio(quote, resumeText) {
  const tokens = significantTokens(quote);
  if (!tokens.length) return { ratio: 0, matched: 0, total: 0 };

  const haystack = new Set(normalizeForMatch(resumeText).split(' '));
  const matched = tokens.filter(t => haystack.has(t)).length;
  return { ratio: matched / tokens.length, matched, total: tokens.length };
}

/**
 * Does the evidence describe experience, rather than merely list a technology?
 *
 * @param {string} quote
 * @returns {boolean}
 */
function hasContextMarkers(quote) {
  const text = String(quote || '');
  if (!text.trim()) return false;
  return CONTEXT_PATTERNS.some(re => re.test(text));
}

/**
 * Does this quote look like a bare technology list — "Java, Selenium, TestNG, Maven"?
 *
 * Such a quote is real evidence of familiarity and no evidence of depth, which is
 * exactly PARTIAL. Detected by shape: several comma-separated fragments, none of
 * them a clause.
 *
 * @param {string} quote
 * @returns {boolean}
 */
function looksLikeSkillsList(quote) {
  const text = String(quote || '').trim();
  if (!text) return false;
  const parts = text.split(/[,;|]/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  // Every fragment short and verb-free reads as a list, not a sentence.
  return parts.every(p => p.split(/\s+/).length <= 3) && !hasContextMarkers(text);
}

/** Clamp `claimed` so it never exceeds `ceiling`. */
function _capTier(claimed, ceiling) {
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(claimed), TIER_ORDER.indexOf(ceiling))];
}

/** As _capTier, on the five-value grade ladder. */
function _capGrade(claimed, ceiling) {
  return GRADE_ORDER[Math.min(GRADE_ORDER.indexOf(claimed), GRADE_ORDER.indexOf(ceiling))];
}

/**
 * The grade of a row, for consumers holding a stored row rather than a fresh verdict.
 *
 * Records screened before graded partials carry a `tier` and a `credit` and no `grade`.
 * Their PARTIAL rows were all worth 0.5, which is this rubric's PARTIAL_LOW — so the
 * credit IS the grade for those rows, and reading it back is what stops a re-rendered
 * old record showing "2 partial (0 high, 0 mid, 0 low)".
 *
 * Pre-tier records carry only `matched`; a boolean was never a partial judgement.
 *
 * @param {object} row
 * @returns {'STRONG'|'PARTIAL_HIGH'|'PARTIAL_MID'|'PARTIAL_LOW'|'NONE'}
 */
function gradeOf(row) {
  const claimed = String(row?.grade || '').toUpperCase();
  if (GRADE_ORDER.includes(claimed)) return claimed;

  const tier = TIER_ORDER.includes(row?.tier) ? row.tier : (row?.matched ? 'STRONG' : 'NONE');
  if (tier !== 'PARTIAL') return tier;

  const credit = Number(row?.credit);
  if (credit >= 1) return 'PARTIAL_HIGH';
  if (credit >= 0.75) return 'PARTIAL_MID';
  return 'PARTIAL_LOW';
}

/**
 * Normalise whatever the model put in the tier field.
 *
 * Also accepts the legacy boolean `matched`, because stored Stage 1 records predate
 * tiers and get re-screened by scripts/rescore.js. A legacy `true` becomes STRONG and
 * is then subject to the same demotion checks as a fresh claim, so re-scoring an old
 * record does not smuggle an unverified match through.
 *
 * @param {object} row
 * @returns {'STRONG'|'PARTIAL'|'NONE'}
 */
function coerceClaimedTier(row) {
  const raw = String(row?.tier ?? '').trim().toUpperCase();
  if (raw === 'STRONG' || raw === 'FULL' || raw === 'YES') return 'STRONG';
  if (raw === 'PARTIAL' || raw === 'WEAK' || raw === 'IMPLIED') return 'PARTIAL';
  if (raw === 'NONE' || raw === 'NO' || raw === 'MISSING') return 'NONE';
  // Legacy boolean shape.
  if (row?.matched === true) return 'STRONG';
  return 'NONE';
}

/**
 * Decide a skill's final tier AND grade from the model's claim plus the resume text.
 *
 * Demotions, in order of severity:
 *   quote absent             → NONE. A match with no evidence is not a match.
 *   quote not in the resume  → NONE. Invented evidence supports nothing.
 *   skill name absent        → PARTIAL_LOW ceiling. The evidence is real but the skill
 *                              is inferred from it, which is not a firm match.
 *   no context markers       → PARTIAL_MID ceiling. Named, but only named.
 *   reads as a skills list   → PARTIAL_MID ceiling. Familiarity, not demonstrated use.
 *                              Never fires alone — see the header note.
 *
 * A claim that survives every check keeps its claimed strength: STRONG stays STRONG, and
 * a PARTIAL the resume fully supports becomes PARTIAL_HIGH, which is paid at full credit.
 * The model is the only thing holding that row below STRONG, and an 8B model's caution is
 * not evidence of a weaker candidate.
 *
 * One PROMOTION, and only one: a NONE claim is overturned to PARTIAL when the skill is
 * named verbatim in the resume. Negatives used to be returned unexamined on the grounds
 * that a model declining to find evidence cannot inflate a score — true, but it makes
 * every check one-directional, and a false NONE costs the candidate a full 70/N.
 *
 * The case that forced this: a JD asking for "Playwright or Cypress" against a resume
 * headed "QA Automation Engineer | Cypress" was scored NONE, because the model searched
 * the pair as one string, found no Playwright, and answered no. Meanwhile the summary it
 * wrote in the same response said "strong experience with Cypress" — the screening
 * contradicting itself on one screen.
 *
 * PARTIAL, not STRONG, because all this establishes is that the word is present; the
 * model's own reading of the context is not available to replace. Graded PARTIAL_MID and
 * not HIGH for the same reason — the name is there, the depth was never assessed.
 *
 * @param {object} row — the model's row for one skill
 * @param {string} skill
 * @param {string} resumeText — FULL resume text
 * @param {object} [opts]
 * @param {boolean} [opts.reportedByModel=true] — false when the model omitted this skill
 *   entirely. Such a row cannot grade above PARTIAL_LOW however plainly the resume names
 *   the skill: nothing read the surrounding text, so no depth claim exists to credit.
 * @returns {{tier: string, grade: string, claimedTier: string, credit: number,
 *            demoted: boolean, reasons: string[], signals: object}}
 */
function deriveTier(row, skill, resumeText, { reportedByModel = true } = {}) {
  const claimedTier = coerceClaimedTier(row);
  const quote = String(row?.evidence ?? row?.quote ?? '').trim();

  const phrase = skillPhraseInResume(skill, resumeText);
  const signals = {
    skill_named_in_resume: skillMentioned(skill, resumeText),
    skill_phrase_in_resume: phrase.found,
    matched_phrase: phrase.phrase,
    grounding: groundingRatio(quote, resumeText),
    has_context_markers: hasContextMarkers(quote),
    looks_like_skills_list: looksLikeSkillsList(quote),
    quote_chars: quote.length,
  };

  const reasons = [];
  let tier = claimedTier;

  if (claimedTier === 'NONE') {
    // The one place a claim is raised rather than cut. See the header note.
    if (phrase.found) {
      const grade = reportedByModel ? 'PARTIAL_MID' : 'PARTIAL_LOW';
      return {
        tier: 'PARTIAL',
        grade,
        claimedTier,
        credit: GRADE_CREDIT[grade],
        demoted: false,
        promoted: true,
        reasons: [
          `the model reported this skill as absent, but "${phrase.phrase}" appears ` +
          `verbatim in the resume — raised to PARTIAL on the resume text`,
        ],
        gradeReason: reportedByModel
          ? 'the resume names the skill, but no reading of the surrounding context is ' +
            'available to credit — graded at three-quarters'
          : 'the model never examined this skill, so the resume name alone earns the ' +
            'lowest partial credit',
        // Substituted so the row shows the resume line that overturned the claim
        // instead of "Not found in resume." beside a PARTIAL tier.
        evidenceOverride: phrase.snippet,
        signals,
      };
    }
    return {
      tier: 'NONE', grade: 'NONE', claimedTier, credit: 0,
      demoted: false, promoted: false, reasons, signals,
      gradeReason: 'the resume neither names the skill nor evidences it',
    };
  }

  // The claim is the ceiling on both ladders. A claimed PARTIAL that survives every
  // check is PARTIAL_HIGH; the caps below can only lower it.
  const claimedGrade = claimedTier === 'STRONG' ? 'STRONG' : 'PARTIAL_HIGH';
  let grade = claimedGrade;
  let gradeReason = claimedTier === 'STRONG'
    ? 'named in the resume with supporting context, and the quote is grounded in it'
    : 'the model graded this partial, but the resume names the skill with supporting ' +
      'context — credited as a full match';

  if (!quote) {
    reasons.push('no evidence quote supplied — a match without evidence is not scored');
    tier = 'NONE';
    grade = 'NONE';
    gradeReason = 'no evidence was supplied to grade';
  } else if (signals.grounding.ratio < GROUNDING_THRESHOLD) {
    reasons.push(
      `evidence not found in the resume (${signals.grounding.matched}/${signals.grounding.total} ` +
      `words present, need ${Math.round(GROUNDING_THRESHOLD * 100)}%)`
    );
    tier = 'NONE';
    grade = 'NONE';
    gradeReason = 'the quote does not appear in the resume, so it evidences nothing';
  } else {
    // Order does not matter: every cap is a min() on the same ladder, so the weakest
    // ceiling wins whichever fires first. A row that is both unnamed and contextless
    // lands at PARTIAL_LOW.
    if (!signals.skill_named_in_resume) {
      reasons.push('skill is not named in the resume — inferred from surrounding evidence');
      tier = _capTier(tier, 'PARTIAL');
      grade = _capGrade(grade, 'PARTIAL_LOW');
      gradeReason = 'the skill\'s own name is absent from the resume — the match is inferred';
    }
    if (!signals.has_context_markers) {
      reasons.push('no duration, project, action or outcome accompanies the mention');
      tier = _capTier(tier, 'PARTIAL');
      grade = _capGrade(grade, 'PARTIAL_MID');
      if (grade === 'PARTIAL_MID') {
        gradeReason = 'named in the resume but only named — no duration, project, action ' +
          'or outcome behind it';
      }
    }
    if (signals.looks_like_skills_list) {
      reasons.push('evidence is a bare technology list, not demonstrated use');
      tier = _capTier(tier, 'PARTIAL');
      grade = _capGrade(grade, 'PARTIAL_MID');
      if (grade === 'PARTIAL_MID') {
        gradeReason = 'the evidence is a bare technology list — familiarity, not demonstrated use';
      }
    }
  }

  return {
    tier,
    grade,
    claimedTier,
    claimedGrade,
    credit: GRADE_CREDIT[grade],
    // Measured on the GRADE ladder, not the tier: a claimed PARTIAL cut to PARTIAL_LOW
    // keeps the tier it claimed while losing half its credit, and reporting that as
    // undemoted would hide the reasons from the row that most needs them.
    demoted: grade !== claimedGrade,
    promoted: false,
    reasons,
    gradeReason,
    signals,
  };
}

/**
 * Reconcile the model's rows against the skills it was ASKED about.
 *
 * The prompt requests one row per skill and nothing used to enforce it, so a dropped
 * row simply vanished from the UI — indistinguishable from a shorter skill list, and
 * silently shrinking the denominator so the score rose. A skill the model failed to
 * report is scored NONE and flagged, because an unanswered skill is not a passed one.
 *
 * Matching is on normalised names: the model routinely echoes "CI/CD Pipelines" as
 * "CI/CD pipelines" or "CICD Pipelines", and treating those as absent would score a
 * reported skill as missing.
 *
 * @param {Array<{skill: string, source: string}>} requested
 * @param {Array<object>} rows — whatever the model returned for this bucket
 * @param {string} resumeText
 * @returns {{rows: Array<object>, missing: string[], extra: string[]}}
 */
function reconcileRows(requested, rows, resumeText) {
  const byName = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeForMatch(row?.skill);
    if (key && !byName.has(key)) byName.set(key, row);
  }

  const missing = [];
  const consumed = new Set();

  const reconciled = requested.map(({ skill, source }) => {
    const key = normalizeForMatch(skill);
    const row = byName.get(key);
    if (row) consumed.add(key);
    else missing.push(skill);

    const verdict = deriveTier(row || {}, skill, resumeText, { reportedByModel: Boolean(row) });
    const evidence = row
      ? String(row.evidence ?? row.quote ?? '').trim()
      : '';

    return {
      skill,
      source,
      tier: verdict.tier,
      // The five-value ladder the credit actually comes from. `tier` stays the coarse
      // STRONG/PARTIAL/NONE because stored records, Stage 4's audit prompt, the report
      // and the UI's colouring all read it; `grade` is what says how much a PARTIAL is
      // worth. Both are present so neither consumer has to infer the other.
      grade: verdict.grade,
      // Retained so stored records, the PDF/HTML report and Stage 4's audit prompt keep
      // reading the field they already read. PARTIAL counts as matched — the tier
      // carries the nuance, and flipping it to false would understate the candidate
      // everywhere the boolean is still consumed.
      matched: verdict.tier !== 'NONE',
      // A promoted row must not keep the model's "Not found in resume." beside a PARTIAL
      // tier — that is the same self-contradiction the promotion exists to remove. The
      // override is the resume line that overturned the claim.
      //
      // When the model omitted the row entirely, both facts are stated: the skill went
      // unexamined AND the resume names it. Dropping either half misleads — the first
      // would hide a compliance failure, the second would score a present skill as absent.
      evidence: verdict.evidenceOverride
        ? (row
          ? verdict.evidenceOverride
          : `The screening model did not report this skill, but the resume names it: ${verdict.evidenceOverride}`)
        : evidence || (row ? 'Not found in resume.' : 'The screening model did not report this skill.'),
      credit: verdict.credit,
      audit: {
        claimed_tier: verdict.claimedTier,
        claimed_grade: verdict.claimedGrade || verdict.grade,
        demoted: verdict.demoted,
        promoted: Boolean(verdict.promoted),
        demotion_reasons: verdict.reasons,
        // One sentence for "why is this only worth 0.75?", which the demotion reasons
        // answer only obliquely and a full-credit PARTIAL_HIGH does not answer at all.
        grade_reason: verdict.gradeReason || null,
        reported_by_model: Boolean(row),
        ...verdict.signals,
      },
    };
  });

  const extra = [...byName.keys()].filter(k => !consumed.has(k));
  return { rows: reconciled, missing, extra };
}

// Negation cues. A summary sentence carrying one of these near a skill name is
// reporting the skill's ABSENCE, which agrees with a NONE tier rather than contradicting
// it: "they lack blockchain testing" must not be read as a claim of blockchain testing.
const NEGATION_PATTERNS = [
  /\b(?:lacks?|lacking|no|not|non|never|without|missing|absent|absence|excludes?)\b/i,
  /\b(?:does|did|do)\s+not\b/i,
  /\b(?:limited|little|minimal|insufficient|unclear|unproven|unverified)\b/i,
  /\b(?:gap|gaps|shortfall|weakness|weaknesses)\b/i,
  /\bhowever\b/i,
];

/**
 * Sentences in the summary that assert a skill the tiers scored NONE.
 *
 * The summary is free prose the model writes in the same response as the tiers, and
 * nothing used to reconcile the two. That produced a screening arguing with itself on
 * one screen: "The candidate has strong experience with Cypress" printed above a row
 * reading "Playwright or Cypress — Not found in resume".
 *
 * Detection is per sentence, so an accurate "lacks blockchain testing" is not counted.
 * Reported rather than rewritten: editing the model's prose in code risks changing a
 * meaning nobody reviewed, whereas a flagged contradiction tells the reader exactly
 * which clause not to trust.
 *
 * @param {string} summary
 * @param {Array<{skill: string, tier: string}>} rows — graded rows, all buckets
 * @returns {Array<{skill: string, sentence: string}>}
 */
function findSummaryContradictions(summary, rows) {
  const text = String(summary || '').trim();
  if (!text) return [];

  const absent = (Array.isArray(rows) ? rows : []).filter(r => r?.tier === 'NONE');
  if (!absent.length) return [];

  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const found = [];

  for (const row of absent) {
    for (const sentence of sentences) {
      // A negated sentence is consistent with NONE — that is the model agreeing.
      if (NEGATION_PATTERNS.some(re => re.test(sentence))) continue;
      const hit = skillPhraseInResume(row.skill, sentence);
      if (hit.found) {
        found.push({ skill: row.skill, sentence: sentence.trim() });
        break;
      }
    }
  }
  return found;
}

/**
 * One sentence of coverage, computed from the tiers.
 *
 * Exists so the record always carries a fit statement that cannot disagree with the
 * skill rows, whatever the model's prose does.
 *
 * The partial count is broken down by credit when a bucket holds partials, because
 * "3 partial" spans 1.5 credits of range under the graded rubric — a reader told only
 * the count cannot tell a bucket worth 3.0 from one worth 1.5.
 *
 * @param {object} breakdown — computeMatchScore's breakdown
 * @returns {string}
 */
function coverageSentence(breakdown) {
  const partialDetail = (b) => {
    const bits = [
      b.partial_high ? `${b.partial_high} at full credit` : null,
      b.partial_mid ? `${b.partial_mid} at 0.75` : null,
      b.partial_low ? `${b.partial_low} at 0.5` : null,
    ].filter(Boolean);
    return bits.length ? ` (${bits.join(', ')})` : '';
  };
  const part = (label, b) => b.skills > 0
    ? `${label}: ${b.strong} strong, ${b.partial} partial${partialDetail(b)}, ` +
      `${b.none} not evidenced (of ${b.skills})`
    : null;
  const parts = [
    part('Mandatory', breakdown.mandatory),
    part('Good-to-have', breakdown.goodToHave),
  ].filter(Boolean);
  return parts.length ? `${parts.join('. ')}.` : 'No skills were available to evaluate.';
}

/**
 * Credit earned by one bucket, as a 0–1 fraction of its own weight.
 *
 * @param {Array<{credit: number}>} rows
 * @returns {{earned: number, possible: number, fraction: number}}
 */
function bucketFraction(rows) {
  const possible = rows.length;
  const earned = rows.reduce((sum, r) => sum + (r.credit || 0), 0);
  return { earned, possible, fraction: possible > 0 ? earned / possible : 0 };
}

/**
 * One bucket's contribution, spelled out.
 *
 * The three partial sub-counts are the reason this exists as its own function rather than
 * two inline literals: `partial: 3` no longer determines what a bucket is worth, so a
 * breakdown that reports only the tier census cannot be reconciled with `credit_earned`
 * by the reader. `partial` is kept as the total of the three, so every existing consumer
 * of the census keeps reading a correct number.
 *
 * Grades come through gradeOf, so a bucket of pre-v3 stored rows still reports a census
 * that adds up instead of three zeroes beside a non-zero `partial`.
 *
 * @param {Array<object>} rows
 * @param {{earned: number, possible: number}} fraction — from bucketFraction
 * @param {number} weight — after empty-bucket redistribution
 * @param {number} points — weight x fraction
 */
function bucketBreakdown(rows, fraction, weight, points) {
  const grades = rows.map(gradeOf);
  const count = (g) => grades.filter(x => x === g).length;
  return {
    skills: fraction.possible,
    credit_earned: Number(fraction.earned.toFixed(2)),
    weight,
    points: Number(points.toFixed(2)),
    strong: count('STRONG'),
    partial: count('PARTIAL_HIGH') + count('PARTIAL_MID') + count('PARTIAL_LOW'),
    partial_high: count('PARTIAL_HIGH'),
    partial_mid: count('PARTIAL_MID'),
    partial_low: count('PARTIAL_LOW'),
    none: count('NONE'),
  };
}

/**
 * Compute the match percentage, its status band, and a reproducible breakdown.
 *
 * Empty buckets redistribute their weight instead of leaving it unearnable. A JD with
 * no good-to-have skills is ordinary, and holding back 20 points for skills nobody
 * asked about capped a flawless candidate at 80% — read as a reservation about the
 * candidate when it was an artefact of the JD.
 *
 * @param {object} args
 * @param {Array<object>} args.mandatoryRows
 * @param {Array<object>} args.goodToHaveRows
 * @returns {{matchScore: number, status: string, breakdown: object}}
 */
function computeMatchScore({ mandatoryRows = [], goodToHaveRows = [] }) {
  const mandatory = bucketFraction(mandatoryRows);
  const goodToHave = bucketFraction(goodToHaveRows);

  // Redistribute over whichever buckets actually have skills.
  const active = [];
  if (mandatory.possible > 0) active.push('mandatory');
  if (goodToHave.possible > 0) active.push('goodToHave');

  let mandatoryWeight = 0;
  let goodToHaveWeight = 0;
  if (active.length === 2) {
    mandatoryWeight = MANDATORY_WEIGHT;
    goodToHaveWeight = GOOD_TO_HAVE_WEIGHT;
  } else if (active.length === 1) {
    if (active[0] === 'mandatory') mandatoryWeight = 100;
    else goodToHaveWeight = 100;
  }

  const mandatoryPoints = mandatory.fraction * mandatoryWeight;
  const goodToHavePoints = goodToHave.fraction * goodToHaveWeight;
  const raw = mandatoryPoints + goodToHavePoints;

  // Round once, at the end. Rounding each bucket first lets two halves each gain
  // half a point and the total drift off the arithmetic shown in the UI.
  const matchScore = active.length === 0 ? null : Math.round(raw);
  const status = matchScore === null
    ? 'Not Screenable'
    : STATUS_BANDS.find(b => matchScore >= b.min).status;

  return {
    matchScore,
    status,
    breakdown: {
      mandatory: bucketBreakdown(mandatoryRows, mandatory, mandatoryWeight, mandatoryPoints),
      goodToHave: bucketBreakdown(goodToHaveRows, goodToHave, goodToHaveWeight, goodToHavePoints),
      // The arithmetic, spelled out, so the UI and the PDF can show the score's
      // derivation rather than asserting a number.
      formula: active.length === 0
        ? 'No skills to evaluate — no score can be computed.'
        : [
          mandatoryWeight > 0
            ? `mandatory ${mandatory.earned.toFixed(2)}/${mandatory.possible} x ${mandatoryWeight}`
            : null,
          goodToHaveWeight > 0
            ? `good-to-have ${goodToHave.earned.toFixed(2)}/${goodToHave.possible} x ${goodToHaveWeight}`
            : null,
        ].filter(Boolean).join(' + ') + ` = ${raw.toFixed(1)}%`,
      raw_score: Number(raw.toFixed(2)),
      weights_redistributed: active.length === 1,
    },
  };
}

module.exports = {
  computeMatchScore,
  reconcileRows,
  findSummaryContradictions,
  coverageSentence,
  deriveTier,
  coerceClaimedTier,
  gradeOf,
  bucketFraction,
  bucketBreakdown,
  skillMentioned,
  skillPhraseInResume,
  groundingRatio,
  hasContextMarkers,
  looksLikeSkillsList,
  normalizeForMatch,
  significantTokens,
  GRADE_CREDIT,
  TIER_ORDER,
  GRADE_ORDER,
  MANDATORY_WEIGHT,
  GOOD_TO_HAVE_WEIGHT,
  GROUNDING_THRESHOLD,
  STATUS_BANDS,
};
