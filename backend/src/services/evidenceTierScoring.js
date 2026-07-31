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
 *   1 topic                             → 25%
 *   2 topics                            → 50%
 *   >2 topics                           → 75%
 *   >2 topics + demonstrated depth      → 100%
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

// Above this many distinct topics a dimension reaches the breadth ceiling (75%)
// and only demonstrated depth can lift it further.
const BREADTH_TIER_COUNT = 2;

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

/**
 * Does this quote ask the candidate to EXPLAIN, rather than confirm?
 *
 * @param {string} quote
 * @returns {boolean}
 */
function looksDepthProbing(quote) {
  const text = String(quote || '');
  if (!text.trim()) return false;
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
 * A chain requires either an explicit follows_up tag or two questions on the same
 * topic. Chains are what gate FULL marks — a boolean "depth_demonstrated" from the
 * model came back true on every dimension of a real record, including ones backed
 * only by yes/no questions, so full marks needs grounding in the evidence itself.
 *
 * @param {Array<{quote?:string, topic?:string, follows_up?:boolean}>} items
 * @returns {number}
 */
function followUpChains(items) {
  const perTopic = new Map();
  for (const item of items || []) {
    const topic = normalizeTopic(item?.topic) || `quote:${normalizeTopic(item?.quote).slice(0, 60)}`;
    if (!topic) continue;
    const entry = perTopic.get(topic) || { count: 0, flagged: false };
    entry.count++;
    if (item?.follows_up === true) entry.flagged = true;
    perTopic.set(topic, entry);
  }
  let chains = 0;
  for (const { count, flagged } of perTopic.values()) {
    if (flagged || count >= 2) chains++;
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

// Full marks require depth on at least this many distinct subjects (or one genuine
// follow-up chain). Two rather than one: a single "how" question among yes/no
// coverage is not the "more evidence + follow-ups + depth" tier.
const DEPTH_TOPICS_FOR_FULL_MARKS = 2;

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

  // Breadth alone tops out at 75%: 1 unit -> 25%, 2 -> 50%, >2 -> 75%.
  const breadthIndex = units > BREADTH_TIER_COUNT ? 3 : units;
  const breadthOk = breadthIndex === 3;

  // Depth is demonstrated by either drilling into one subject repeatedly (a chain)
  // or asking explanation-seeking questions across several subjects.
  const depthOk = chains >= 1 || depthTopics >= DEPTH_TOPICS_FOR_FULL_MARKS;
  const granted = breadthOk && depthOk;

  let denialReason = null;
  if (!granted) {
    if (!breadthOk && !depthOk) denialReason = 'breadth and depth both short of full marks';
    else if (!breadthOk) denialReason = 'insufficient breadth';
    else denialReason = 'no how/why depth probing in evidence';
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
  deriveTier,
  looksDepthProbing,
  tierToStep,
  distinctTopics,
  followUpChains,
  depthProbingTopics,
  normalizeTopic,
  TIER_FRACTIONS,
  BREADTH_TIER_COUNT,
  DEPTH_TOPICS_FOR_FULL_MARKS,
};
