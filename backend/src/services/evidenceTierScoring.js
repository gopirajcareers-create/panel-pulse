/**
 * Evidence-tier scoring — derive a dimension score from what the panel demonstrably asked.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The model used to both count the evidence AND choose the score, so the two could
 * disagree: a dimension backed by six interviewer questions could still be scored
 * 0.5 because the CANDIDATE's answers were weak. On JD1005/Mathews the verdict read
 * "the panel did not verify the candidate's claimed experience with Grafana and
 * JMeter" when the panel had asked about both — the candidate simply answered
 * "I have heard about that name". Every dimension scores the PANEL, so a rubric
 * keyed to what the panel asked is structurally immune to that conflation.
 *
 * The tiers below are therefore computed in CODE from the tagged evidence — every
 * one of them, including full marks. An auditor can recount the quotes and
 * reproduce the score by hand, which is the point.
 *
 * ── Tiers (as a fraction of the dimension max) ───────────────────────────────
 *   0 topics                            → 0
 *   1–2 topics                          → 25%
 *   3–4 topics                          → 50%
 *   >4 topics                           → 75%
 *   >4 topics + demonstrated depth      → 100%
 *
 * ── Why full marks are hard ──────────────────────────────────────────────────
 * The first version of this ladder put the breadth ceiling at >2 topics and opened
 * the depth gate on EITHER one follow-up chain OR two how/why topics. Measured
 * against real runs that made 10/10 routine: three topics plus two how-questions per
 * dimension — an ordinary competent interview — scored 9/10, and the prompt asks the
 * model for up to 8 evidence items per dimension, so the 3-topic bar was cleared
 * almost every time. The scale had collapsed into a pass/fail check.
 *
 * Full marks now require breadth (>4 subjects) PLUS sustained depth, which is either
 * how/why probing on 5+ subjects, or 3+ subjects with one of them revisited to drill
 * deeper. A panel that covered a lot but explained-probed only two or three subjects
 * gets 75%, the correct reading of "thorough but not exceptional". 10/10 means all six
 * dimensions cleared that bar.
 *
 * Requiring a chain AND depth breadth was tried and reverted: over three live runs the
 * model set follows_up=true on 0 of 28 items and gave every question a unique topic
 * string, so chains came back 0 on 18 of 18 dimensions and full marks became
 * unreachable rather than rare. Hence two routes, neither depending on a signal the
 * evidence does not reliably carry.
 *
 * ── Mapping a tier onto a dimension's grid ───────────────────────────────────
 * The tier selects a POSITION in the dimension's `steps` array, not a fraction of
 * its max. Multiplying the max and snapping breaks on coarse grids: 75% of a
 * 0.5-max dimension is 0.375, equidistant between the 0.25 and 0.5 steps, so it
 * snaps down and tier 3 collapses onto tier 1 — the scale stops being monotonic.
 * Indexing the grid keeps every tier distinct and ordered on any step array, and
 * makes an off-grid score structurally impossible rather than merely corrected.
 *
 * ── Topics, not quotes ───────────────────────────────────────────────────────
 * Counting raw quotes would let three rephrasings of "do you know JMeter?" score
 * like three skills covered. The unit is the distinct TOPIC probed, so breadth
 * means breadth.
 *
 * That protects against rephrasings but not against the same sentence returned
 * twice, because the topic tag is the model's and it does not tag repeats
 * consistently. On JD SAAS_QA/Dharshini the model padded every dimension to the 8
 * items the prompt allows by repeating ONE question, tagging the copies with
 * different topics — so a single "in case it is not working, how will you do it?"
 * counted as five subjects probed and took Hands-on Validation to full marks.
 * Identical quotes are therefore collapsed before anything is counted: one
 * question asked once is one piece of evidence, whatever it was tagged with.
 *
 * ── Three different units ────────────────────────────────────────────────────
 *   distinct topics       — breadth. The unit for most dimensions.
 *   depth-probing topics  — subjects probed with "how"/"why"/"what if" rather than
 *                           a yes/no check. The unit for Technical Depth.
 *   follow-up chains      — subjects the panel returned to, building on the prior
 *                           answer.
 *
 * Full marks need the breadth ceiling PLUS demonstrated depth, where depth means
 * either one follow-up chain or how/why probing on 2+ subjects.
 *
 * Technical Depth was briefly scored on chains alone, which under-credited a panel
 * asking six genuine "how do you..." questions across six subjects (0.5/2, because
 * no subject was revisited). Depth-probing topics fixes that without handing full
 * marks to yes/no coverage.
 *
 * ── Why nothing here trusts a model flag ─────────────────────────────────────
 * Earlier versions gated full marks on the model's own `depth_demonstrated` and
 * counted its `probes_depth` / `follows_up` booleans. Both proved unusable on real
 * records: probes_depth came back false for every item including "How do you
 * structure your backend using Express?", and depth_demonstrated was true for all
 * six dimensions on one run and false for four on the next run of the SAME
 * transcript. A panel's score cannot depend on that. The flags are honoured when
 * set and recorded for transparency, but every count derives from the quote text.
 */

'use strict';

// Fraction of the dimension max awarded per tier index.
const TIER_FRACTIONS = [0, 0.25, 0.5, 0.75, 1.0];

// Distinct topics per breadth tier: 1–2 topics -> 25%, 3–4 -> 50%, >4 -> 75%.
// Above TOPICS_PER_TIER * 2 a dimension reaches the breadth ceiling and only
// demonstrated depth can lift it further.
//
// Was 1 topic per tier (so 3 topics hit the ceiling), which made the top of the
// scale reachable by any panel that asked three questions on a subject — see the
// header note on why full marks are hard.
const TOPICS_PER_TIER = 2;
const BREADTH_TIER_COUNT = TOPICS_PER_TIER * 2;   // 4 — above this is the ceiling

/**
 * Normalise a topic label for counting. Lowercased and stripped of punctuation so
 * "JMeter", "jmeter" and "J-Meter " collapse to one topic; a model that tags
 * inconsistently must not inflate breadth.
 *
 * @param {string} topic
 * @returns {string} '' when the topic is unusable
 */
function normalizeTopic(topic) {
  return String(topic || '')
    .toLowerCase()
    // Drop separators entirely rather than collapsing them to a space, so
    // "J-Meter", "j meter" and "jmeter" are one topic. Keeping them distinct
    // would let a single skill count three times toward breadth.
    .replace(/[^a-z0-9+#]+/g, '')
    .trim();
}

/**
 * Count the distinct topics in a dimension's tagged evidence.
 *
 * Items with no usable topic tag still count as evidence — falling back to the
 * quote itself. Dropping them would silently punish the panel for the model's
 * tagging failure, which is the exact failure mode this module exists to remove.
 *
 * @param {Array<{quote?:string, topic?:string}>} items
 * @returns {{topics: string[], untagged: number}}
 */
function distinctTopics(items) {
  const seen = new Set();
  let untagged = 0;
  for (const item of items || []) {
    const topic = normalizeTopic(item?.topic);
    if (topic) {
      seen.add(topic);
      continue;
    }
    // No tag — fall back to the quote so the evidence still counts once.
    const quote = normalizeTopic(item?.quote).slice(0, 60);
    if (quote) {
      seen.add(`quote:${quote}`);
      untagged++;
    }
  }
  return { topics: [...seen], untagged };
}

// Explanation-seeking question forms. A question matching one of these demands that
// the candidate explain something; a question matching none of them is typically an
// existence check ("Have you worked with AWS?", "Do you know Docker?").
//
// Derived from the QUOTE TEXT rather than trusted from the model. On a real record
// the model returned probes_depth=false for every item — including "How do you
// structure your backend application using Express?" — which zeroed Technical Depth
// for a panel that had asked six genuine how/why questions. A score must not hinge
// on a flag the model declines to set.
const DEPTH_PATTERNS = [
  /\bhow\b/i,
  /\bwhy\b/i,
  /\bwhat (?:steps|approach|happens|would|will|if)\b/i,
  /\bwhat (?:are|is) the (?:different|various)\b/i,
  /\bexplain\b/i,
  /\bdescribe\b/i,
  /\bwalk (?:me|us) through\b/i,
  /\bwhat would you do\b/i,
  /\bin what way\b/i,
  /\bsuppose\b/i,
  /\bdifference between\b/i,
  /\btell me about a\b/i,
];

// Questions that match a DEPTH_PATTERN but probe nothing technical. "How many years
// of experience do you have?" is a number lookup; "How are you today?" is a greeting;
// "Describe your current CTC" is HR logistics. All three matched /\bhow\b/ or
// /\bdescribe\b/ and counted as demonstrated depth, which is how a transcript of
// pleasantries plus one repeated yes/no question reached 10/10.
//
// Checked BEFORE the depth patterns, so a non-technical question cannot buy depth
// credit no matter how it is phrased.
const NON_TECHNICAL_PATTERNS = [
  /\bhow (?:are|have) you\b/i,                          // greetings
  /\bhow(?:'s| is| are)? (?:the |your )?(?:audio|video|sound|connection|network)\b/i,
  /\bcan you hear\b/i,
  /\bhow many years?\b/i,                               // experience arithmetic
  /\bhow (?:much|many) (?:years?|experience|notice|ctc|salary)\b/i,
  /\b(?:current|expected) (?:ctc|salary|package|compensation)\b/i,
  /\bnotice period\b/i,
  /\b(?:why|reason) (?:are you |for )?(?:looking|leaving|change|changing|switch)/i,
  /\bwhere are you (?:from|based|located)\b/i,
  /\brelocat/i,
  /\bintroduce yourself\b/i,
  /\btell me about yourself\b/i,
  /\bwalk (?:me|us) through your (?:resume|background|profile|cv)\b/i,
  /\bhow (?:did|was) your (?:day|weekend|journey|travel)\b/i,
];

/**
 * Is this question small talk, HR logistics, or an audio check rather than a
 * technical probe?
 *
 * @param {string} quote
 * @returns {boolean}
 */
function looksNonTechnical(quote) {
  const text = String(quote || '');
  return NON_TECHNICAL_PATTERNS.some(re => re.test(text));
}

/**
 * Does this quote ask the candidate to EXPLAIN something technical, rather than
 * confirm a fact or exchange pleasantries?
 *
 * @param {string} quote
 * @returns {boolean}
 */
function looksDepthProbing(quote) {
  const text = String(quote || '');
  if (!text.trim()) return false;
  // Small talk and HR logistics are not depth, however they are phrased.
  if (looksNonTechnical(text)) return false;
  return DEPTH_PATTERNS.some(re => re.test(text));
}

/**
 * Count distinct topics probed with a DEPTH-SEEKING question.
 *
 * This is the unit for Technical Depth. Counting chains alone was too harsh — a
 * panel asking six genuine "how do you..." questions across six subjects scored
 * 0.5/2 because no subject was revisited, precisely the under-crediting this rubric
 * exists to remove. Counting every question would be too generous, since
 * "Have you worked with AWS?" is coverage, not depth.
 *
 * The model's probes_depth flag is honoured when set but never required: the quote
 * text is the authority, so the count is reproducible by reading the evidence.
 *
 * @param {Array<{quote?:string, topic?:string, probes_depth?:boolean}>} items
 * @returns {number}
 */
function depthProbingTopics(items) {
  const seen = new Set();
  for (const item of items || []) {
    if (item?.probes_depth !== true && !looksDepthProbing(item?.quote)) continue;
    const topic = normalizeTopic(item?.topic) || `quote:${normalizeTopic(item?.quote).slice(0, 60)}`;
    if (topic) seen.add(topic);
  }
  return seen.size;
}

/**
 * Count follow-up chains: subjects the panel returned to with a question that
 * built on the candidate's previous answer.
 *
 * A chain needs two questions on the same topic AND at least one of them probing
 * how/why (or an explicit follows_up tag on a topic asked more than once). Bare
 * repetition is not a chain: "Do you know JMeter?" followed by "So you have used
 * JMeter?" is one yes/no check asked twice, and counting it as a chain was enough on
 * its own to open the full-marks gate — the exact "three rephrasings of do you know
 * JMeter" failure this module claims to have designed out of breadth, left open in
 * depth.
 *
 * A chain is not required for full marks — see deriveTier, where it lowers the depth
 * breadth needed rather than gating the tier. It cannot be required: the model sets
 * follows_up on almost nothing and rarely repeats a topic string, so a mandatory chain
 * closes the top tier entirely. When one IS present the bar is the panel visibly
 * drilling in, not merely mentioning a subject twice.
 *
 * @param {Array<{quote?:string, topic?:string, follows_up?:boolean}>} items
 * @returns {number}
 */
function followUpChains(items) {
  const perTopic = new Map();
  for (const item of items || []) {
    const topic = normalizeTopic(item?.topic) || `quote:${normalizeTopic(item?.quote).slice(0, 60)}`;
    if (!topic) continue;
    const entry = perTopic.get(topic) || { count: 0, flagged: false, depth: false };
    entry.count++;
    if (item?.follows_up === true) entry.flagged = true;
    // The model's probes_depth is honoured, but the quote text is the authority.
    if (item?.probes_depth === true || looksDepthProbing(item?.quote)) entry.depth = true;
    perTopic.set(topic, entry);
  }
  let chains = 0;
  for (const { count, flagged, depth } of perTopic.values()) {
    // Revisited AND actually drilled into. A follows_up tag counts only when the
    // subject really was raised more than once, so a mistagged one-shot question
    // cannot manufacture a chain.
    if (count >= 2 && (depth || flagged)) chains++;
  }
  return chains;
}

/**
 * Map a tier index onto a dimension's allowed-step grid.
 *
 * Tier 0 is always the lowest step and tier 4 always the highest, with the middle
 * tiers spread evenly across whatever steps exist between them. On the standard
 * 5-step grids this is the identity; on a 3-step grid ([0, 0.25, 0.5]) tiers
 * 1 and 2 both land on 0.25 and tiers 3 and 4 on 0.5 — coarse, but monotonic,
 * which multiply-and-snap was not.
 *
 * @param {number} tierIndex — 0..4
 * @param {number[]} steps   — the dimension's allowed values, ascending
 * @returns {number}
 */
function tierToStep(tierIndex, steps) {
  const grid = Array.isArray(steps) && steps.length ? steps : [0, 1];
  const lastTier = TIER_FRACTIONS.length - 1;             // 4
  const idx = Math.round((tierIndex / lastTier) * (grid.length - 1));
  return grid[Math.min(Math.max(idx, 0), grid.length - 1)];
}

// Full marks need the breadth ceiling PLUS depth, and there are two ways to show
// depth. Either is exceptional; requiring both is not reachable.
//
// Path A — sustained depth without revisiting: how/why probing across this many
// distinct subjects. The bar is high because one-shot explanation questions are the
// common case, so this must mean "asked the candidate to explain nearly everything
// raised", not "asked two how-questions".
const DEPTH_TOPICS_ALONE_FOR_FULL_MARKS = 5;
// Path B — the panel returned to a subject and drilled deeper. Rarer and stronger
// evidence of probing skill, so it needs less depth breadth alongside it.
const DEPTH_TOPICS_WITH_CHAIN_FOR_FULL_MARKS = 3;
const CHAINS_FOR_FULL_MARKS = 1;
// Kept as the documented name for path B's threshold.
const DEPTH_TOPICS_FOR_FULL_MARKS = DEPTH_TOPICS_WITH_CHAIN_FOR_FULL_MARKS;

/**
 * Derive the tier index for a dimension.
 *
 * The gate is deliberately computed from the evidence TEXT alone. The model's
 * self-reported depth_demonstrated proved unusable: on one real record it was true
 * for all six dimensions (including ones backed only by "Have you worked with
 * AWS?"), and on the next run of the same transcript it was false for four — so
 * gating on it made a panel's score depend on a coin flip. It is recorded for
 * transparency and ignored for scoring.
 *
 * @param {number} units — distinct topics, or depth-probing topics for depth dimensions
 * @param {object} [signals]
 * @param {number} [signals.chains=0]      — subjects the panel returned to
 * @param {number} [signals.depthTopics=0] — subjects probed with how/why
 * @returns {{tierIndex:number, fraction:number, topTierGranted:boolean, topTierDenied:boolean, denialReason:string|null}}
 */
function deriveTier(units, { chains = 0, depthTopics = 0 } = {}) {
  if (units <= 0) {
    return { tierIndex: 0, fraction: 0, topTierGranted: false, topTierDenied: false, denialReason: null };
  }

  // Breadth alone tops out at 75%: 1–2 units -> 25%, 3–4 -> 50%, >4 -> 75%.
  const breadthIndex = units > BREADTH_TIER_COUNT
    ? 3
    : Math.ceil(units / TOPICS_PER_TIER);
  const breadthOk = breadthIndex === 3;

  // Two routes to demonstrated depth. Requiring BOTH a chain and depth breadth made
  // full marks unreachable rather than rare: measured over live runs, the model set
  // follows_up=true on 0 of 28 evidence items and gave every question its own topic
  // string, so `chains` was 0 on 18 of 18 dimensions. A requirement the evidence
  // never satisfies is not a high bar, it is a dead branch — the same trap the header
  // records for depth_demonstrated.
  const chainsOk = chains >= CHAINS_FOR_FULL_MARKS;
  const depthOk = chainsOk
    ? depthTopics >= DEPTH_TOPICS_WITH_CHAIN_FOR_FULL_MARKS   // path B: revisited a subject
    : depthTopics >= DEPTH_TOPICS_ALONE_FOR_FULL_MARKS;       // path A: sustained explanation-seeking
  const granted = breadthOk && depthOk;

  let denialReason = null;
  if (!granted) {
    // Name every missing requirement, not just the first: "we went deep, why not
    // 2/2?" is the panel's question and a partial answer invites a second round.
    const missing = [];
    if (!breadthOk) missing.push(`breadth (${units} of ${BREADTH_TIER_COUNT + 1}+ subjects)`);
    if (!depthOk) {
      missing.push(chainsOk
        ? `how/why probing on ${DEPTH_TOPICS_WITH_CHAIN_FOR_FULL_MARKS}+ subjects (${depthTopics})`
        : `how/why probing on ${DEPTH_TOPICS_ALONE_FOR_FULL_MARKS}+ subjects (${depthTopics}), ` +
          `or ${DEPTH_TOPICS_WITH_CHAIN_FOR_FULL_MARKS}+ plus a subject revisited with a deeper follow-up`);
    }
    denialReason = `short of full marks: ${missing.join('; ')}`;
  }

  const tierIndex = granted ? 4 : breadthIndex;
  return {
    tierIndex,
    fraction: TIER_FRACTIONS[tierIndex],
    topTierGranted: granted,
    topTierDenied: Boolean(denialReason),
    denialReason,
  };
}

/**
 * Identity of a quote for duplicate detection: case, whitespace and punctuation are
 * not what makes two questions different. Compares the WHOLE quote rather than a
 * prefix, so two long questions that open the same way stay distinct.
 *
 * @param {string} quote
 * @returns {string}
 */
function quoteKey(quote) {
  return String(quote || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Collapse repeats of the same question into one evidence item.
 *
 * A model asked for "up to 8 items" will pad a thin dimension by repeating a
 * question, and the copies do not carry the same topic tag — see the header note.
 * Every count downstream (breadth, depth breadth, chains) is per-item, so the
 * padding bought breadth the interview never had and manufactured follow-up chains
 * out of pure repetition, the one thing followUpChains exists to refuse.
 *
 * The first occurrence wins for quote and topic, and the boolean flags are OR'd
 * across the copies: dropping a probes_depth=true duplicate of an untagged first
 * copy would lose real signal.
 *
 * @param {Array<{quote:string, topic:string, probes_depth:boolean, follows_up:boolean}>} items
 * @returns {Array<{quote:string, topic:string, probes_depth:boolean, follows_up:boolean}>}
 */
function dedupeEvidenceItems(items) {
  const byQuote = new Map();
  for (const item of items || []) {
    const key = quoteKey(item?.quote);
    if (!key) continue;
    const seen = byQuote.get(key);
    if (!seen) {
      byQuote.set(key, { ...item });
      continue;
    }
    seen.probes_depth = seen.probes_depth || item.probes_depth === true;
    seen.follows_up = seen.follows_up || item.follows_up === true;
    // A later copy can carry the tag the first one lacked.
    if (!seen.topic && item.topic) seen.topic = item.topic;
  }
  return [...byQuote.values()];
}

/**
 * Coerce whatever the model returned for a dimension into evidence items.
 *
 * Shared by L1 and L2 so the two cannot drift: a field dropped here silently
 * changes a score, and the earlier per-service copy dropped `probes_depth`, which
 * meant a genuine depth question phrased without a how/why keyword ("Tell me more
 * about that trade-off") was never counted as depth despite the model flagging it.
 *
 * Accepts the tagged object form and the older bare-string form, because stored
 * transcripts get re-scored and an older model response must not crash the run.
 * A bare string becomes an untagged item, which still counts once toward breadth.
 *
 * Repeats are collapsed here rather than at each call site so the scores and the
 * quotes shown in the UI and the downloaded report come from one list — a report
 * that prints eight copies of a question the scorer counted once is unauditable.
 *
 * @param {Array<object|string>} raw
 * @returns {Array<{quote:string, topic:string, probes_depth:boolean, follows_up:boolean}>}
 */
function coerceEvidenceItems(raw) {
  if (!Array.isArray(raw)) return [];
  const items = raw.map(item => {
    if (typeof item === 'string') {
      return { quote: item.trim(), topic: '', probes_depth: false, follows_up: false };
    }
    if (item && typeof item === 'object') {
      return {
        quote: String(item.quote ?? item.text ?? '').trim(),
        topic: String(item.topic ?? '').trim(),
        probes_depth: item.probes_depth === true,
        follows_up: item.follows_up === true,
      };
    }
    return null;
  }).filter(it => it && it.quote);

  return dedupeEvidenceItems(items);
}

/**
 * Score every dimension from its tagged evidence.
 *
 * @param {object} args
 * @param {Record<string, {max:number, steps:number[], depthDimension?:boolean}>} args.dimensions
 * @param {Record<string, Array<{quote?:string, topic?:string, follows_up?:boolean}>>} args.evidenceDetail
 * @param {Record<string, boolean>} [args.depthClaims] — per-dimension depth assertion
 * @param {Record<string, number>} [args.modelScores] — for divergence reporting only
 * @returns {{scores: Record<string, number>, audit: Record<string, object>, divergences: string[]}}
 */
function scoreFromEvidence({ dimensions, evidenceDetail, depthClaims = {}, modelScores = {} }) {
  const scores = {};
  const audit = {};
  const divergences = [];

  for (const [dim, cfg] of Object.entries(dimensions)) {
    const items = evidenceDetail?.[dim] || [];
    const { topics, untagged } = distinctTopics(items);
    const chains = followUpChains(items);
    const depthTopics = depthProbingTopics(items);

    // Depth dimensions count only depth-seeking questions; the rest count breadth.
    const units = cfg.depthDimension ? depthTopics : topics.length;
    // Recorded for transparency only — see deriveTier for why it is not scored on.
    const depthClaimed = depthClaims?.[dim] === true;

    const tier = deriveTier(units, { chains, depthTopics });
    const derived = tierToStep(tier.tierIndex, cfg.steps);
    scores[dim] = derived;

    audit[dim] = {
      quotes: items.length,
      distinct_topics: topics.length,
      topics,
      untagged_quotes: untagged,
      follow_up_chains: chains,
      depth_probing_topics: depthTopics,
      scored_on: cfg.depthDimension ? 'depth_probing_topics' : 'distinct_topics',
      units,
      tier_index: tier.tierIndex,
      tier_fraction: tier.fraction,
      depth_claimed_by_model: depthClaimed,   // informational; not used for scoring
      top_tier_granted: tier.topTierGranted,
      top_tier_denied: tier.topTierDenied,
      top_tier_denial_reason: tier.denialReason,
      derived_score: derived,
      model_score: modelScores?.[dim] ?? null,
    };

    // The model's own score is not used, but a large gap usually means the evidence
    // was under-reported rather than that the tiers are wrong — worth logging.
    const modelScore = modelScores?.[dim];
    if (typeof modelScore === 'number' && Math.abs(modelScore - derived) >= cfg.max * 0.5) {
      divergences.push(`${dim}: model ${modelScore} vs evidence-derived ${derived} ` +
        `(${items.length} quote(s), ${topics.length} topic(s), ${chains} chain(s))`);
    }
  }

  return { scores, audit, divergences };
}

module.exports = {
  scoreFromEvidence,
  coerceEvidenceItems,
  dedupeEvidenceItems,
  quoteKey,
  deriveTier,
  looksDepthProbing,
  looksNonTechnical,
  tierToStep,
  distinctTopics,
  followUpChains,
  depthProbingTopics,
  normalizeTopic,
  TIER_FRACTIONS,
  TOPICS_PER_TIER,
  BREADTH_TIER_COUNT,
  DEPTH_TOPICS_FOR_FULL_MARKS,
  DEPTH_TOPICS_ALONE_FOR_FULL_MARKS,
  DEPTH_TOPICS_WITH_CHAIN_FOR_FULL_MARKS,
  CHAINS_FOR_FULL_MARKS,
};
