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
 * ── Tiers ────────────────────────────────────────────────────────────────────
 *   STRONG   1.0  — named with supporting context: duration, a project, an action,
 *                   or a measurable outcome.
 *   PARTIAL  0.5  — present but thin: a bare skills-list mention, or evidence that
 *                   only implies the skill.
 *   NONE     0    — absent from the resume.
 *
 * Three tiers rather than a boolean because a boolean is a coin flip on borderline
 * evidence. "Listed under Skills, no project" is genuinely between yes and no, and
 * forcing it to a side moved the whole score by 70/N between runs of the same
 * record — the single largest contributor to the instability this module fixes.
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

// Credit awarded per tier, as a fraction of one skill's worth of the bucket.
const TIER_CREDIT = { STRONG: 1.0, PARTIAL: 0.5, NONE: 0 };

// Ordered weakest → strongest, so a demotion is `min(claimed, allowed)` by index.
const TIER_ORDER = ['NONE', 'PARTIAL', 'STRONG'];

// Bucket weights. Mandatory skills carry most of the score; a good-to-have skill is
// by definition not disqualifying. When a bucket is EMPTY its weight is redistributed
// rather than left unearnable — see computeMatchScore.
const MANDATORY_WEIGHT = 70;
const GOOD_TO_HAVE_WEIGHT = 30;

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
 * Decide a skill's final tier from the model's claim plus the resume text.
 *
 * Demotions, in order of severity:
 *   claim is NONE            → NONE, unexamined. Negatives are trusted.
 *   quote absent             → NONE. A match with no evidence is not a match.
 *   quote not in the resume  → NONE. Invented evidence supports nothing.
 *   skill name absent        → PARTIAL ceiling. The evidence is real but the skill
 *                              is inferred from it, which is not a firm match.
 *   no context markers       → PARTIAL ceiling. Named, but only named.
 *   reads as a skills list   → PARTIAL ceiling. Familiarity, not demonstrated use.
 *
 * @param {object} row — the model's row for one skill
 * @param {string} skill
 * @param {string} resumeText — FULL resume text
 * @returns {{tier: string, claimedTier: string, credit: number, demoted: boolean,
 *            reasons: string[], signals: object}}
 */
function deriveTier(row, skill, resumeText) {
  const claimedTier = coerceClaimedTier(row);
  const quote = String(row?.evidence ?? row?.quote ?? '').trim();

  const signals = {
    skill_named_in_resume: skillMentioned(skill, resumeText),
    grounding: groundingRatio(quote, resumeText),
    has_context_markers: hasContextMarkers(quote),
    looks_like_skills_list: looksLikeSkillsList(quote),
    quote_chars: quote.length,
  };

  const reasons = [];
  let tier = claimedTier;

  if (claimedTier === 'NONE') {
    return { tier: 'NONE', claimedTier, credit: 0, demoted: false, reasons, signals };
  }

  if (!quote) {
    reasons.push('no evidence quote supplied — a match without evidence is not scored');
    tier = 'NONE';
  } else if (signals.grounding.ratio < GROUNDING_THRESHOLD) {
    reasons.push(
      `evidence not found in the resume (${signals.grounding.matched}/${signals.grounding.total} ` +
      `words present, need ${Math.round(GROUNDING_THRESHOLD * 100)}%)`
    );
    tier = 'NONE';
  } else {
    if (!signals.skill_named_in_resume) {
      reasons.push('skill is not named in the resume — inferred from surrounding evidence');
      tier = _capTier(tier, 'PARTIAL');
    }
    if (!signals.has_context_markers) {
      reasons.push('no duration, project, action or outcome accompanies the mention');
      tier = _capTier(tier, 'PARTIAL');
    }
    if (signals.looks_like_skills_list) {
      reasons.push('evidence is a bare technology list, not demonstrated use');
      tier = _capTier(tier, 'PARTIAL');
    }
  }

  return {
    tier,
    claimedTier,
    credit: TIER_CREDIT[tier],
    demoted: tier !== claimedTier,
    reasons,
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

    const verdict = deriveTier(row || {}, skill, resumeText);
    const evidence = row
      ? String(row.evidence ?? row.quote ?? '').trim()
      : '';

    return {
      skill,
      source,
      tier: verdict.tier,
      // Retained so stored records, the PDF/HTML report and Stage 4's audit prompt keep
      // reading the field they already read. PARTIAL counts as matched — the tier
      // carries the nuance, and flipping it to false would understate the candidate
      // everywhere the boolean is still consumed.
      matched: verdict.tier !== 'NONE',
      evidence: evidence || (row ? 'Not found in resume.' : 'The screening model did not report this skill.'),
      credit: verdict.credit,
      audit: {
        claimed_tier: verdict.claimedTier,
        demoted: verdict.demoted,
        demotion_reasons: verdict.reasons,
        reported_by_model: Boolean(row),
        ...verdict.signals,
      },
    };
  });

  const extra = [...byName.keys()].filter(k => !consumed.has(k));
  return { rows: reconciled, missing, extra };
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
 * Compute the match percentage, its status band, and a reproducible breakdown.
 *
 * Empty buckets redistribute their weight instead of leaving it unearnable. A JD with
 * no good-to-have skills is ordinary, and holding back 30 points for skills nobody
 * asked about capped a flawless candidate at 70% — read as a reservation about the
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
      mandatory: {
        skills: mandatory.possible,
        credit_earned: Number(mandatory.earned.toFixed(2)),
        weight: mandatoryWeight,
        points: Number(mandatoryPoints.toFixed(2)),
        strong: mandatoryRows.filter(r => r.tier === 'STRONG').length,
        partial: mandatoryRows.filter(r => r.tier === 'PARTIAL').length,
        none: mandatoryRows.filter(r => r.tier === 'NONE').length,
      },
      goodToHave: {
        skills: goodToHave.possible,
        credit_earned: Number(goodToHave.earned.toFixed(2)),
        weight: goodToHaveWeight,
        points: Number(goodToHavePoints.toFixed(2)),
        strong: goodToHaveRows.filter(r => r.tier === 'STRONG').length,
        partial: goodToHaveRows.filter(r => r.tier === 'PARTIAL').length,
        none: goodToHaveRows.filter(r => r.tier === 'NONE').length,
      },
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
  deriveTier,
  coerceClaimedTier,
  bucketFraction,
  skillMentioned,
  groundingRatio,
  hasContextMarkers,
  looksLikeSkillsList,
  normalizeForMatch,
  significantTokens,
  TIER_CREDIT,
  TIER_ORDER,
  MANDATORY_WEIGHT,
  GOOD_TO_HAVE_WEIGHT,
  GROUNDING_THRESHOLD,
  STATUS_BANDS,
};
