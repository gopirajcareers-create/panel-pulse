/**
 * Tier-scoring checks. No test runner in backend/, so this is a plain script:
 *   node scripts/test_evidence_tiers.js     (exit 0 = pass)
 *
 * The tiers are a product decision, so they are pinned here explicitly. If a tier
 * boundary moves, this file should be the first thing that fails.
 */
'use strict';

const {
  deriveTier, tierToStep, distinctTopics, followUpChains, depthProbingTopics,
  looksDepthProbing, looksNonTechnical, normalizeTopic, scoreFromEvidence,
  coerceEvidenceItems,
} = require('../src/services/evidenceTierScoring');

let failures = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const GRID_2  = [0, 0.5, 1.0, 1.5, 2.0];
const GRID_1  = [0, 0.25, 0.5, 0.75, 1.0];
const GRID_05 = [0, 0.25, 0.5];

// Breadth-tier helper. depthTopics: 0 keeps the full-marks gate CLOSED so the
// breadth ladder is tested in isolation; the gate has its own section below.
const breadth = (units, steps) => tierToStep(deriveTier(units, { depthTopics: 0 }).tierIndex, steps);
// Same ladder with the depth gate OPEN (3+ depth subjects plus a chain — path B).
const withDepth = (units, steps) => tierToStep(deriveTier(units, { depthTopics: 3, chains: 1 }).tierIndex, steps);

console.log('=== breadth ladder, max 2.0 dimension (the spec as stated) ===');
eq('0 evidence -> 0',                       breadth(0, GRID_2), 0);
eq('1 evidence -> 0.5',                     breadth(1, GRID_2), 0.5);
eq('2 evidence -> 0.5',                     breadth(2, GRID_2), 0.5);
eq('3 evidence -> 1.0',                     breadth(3, GRID_2), 1.0);
eq('4 evidence -> 1.0',                     breadth(4, GRID_2), 1.0);
eq('5 evidence -> 1.5',                     breadth(5, GRID_2), 1.5);
eq('9 evidence -> 1.5 (breadth ceiling)',   breadth(9, GRID_2), 1.5);
eq('5 evidence + depth -> 2.0 (full marks)', withDepth(5, GRID_2), 2.0);
eq('4 evidence + depth -> 1.0 (breadth gates)', withDepth(4, GRID_2), 1.0);

console.log('\n=== breadth ladder, max 1.0 dimension ===');
eq('1 -> 0.25',           breadth(1, GRID_1), 0.25);
eq('3 -> 0.5',            breadth(3, GRID_1), 0.5);
eq('5 -> 0.75',           breadth(5, GRID_1), 0.75);
eq('5 + depth -> 1.0',    withDepth(5, GRID_1), 1.0);

console.log('\n=== max 0.5 dimension, 3-step grid (L2 leadership/behavioural) ===');
// Coarse but MUST stay monotonic: multiply-and-snap made tier 3 collapse onto tier 1.
eq('0 -> 0',              breadth(0, GRID_05), 0);
eq('1 -> 0.25',           breadth(1, GRID_05), 0.25);
eq('3 -> 0.25',           breadth(3, GRID_05), 0.25);
eq('5 -> 0.5',            breadth(5, GRID_05), 0.5);
eq('5 + depth -> 0.5',    withDepth(5, GRID_05), 0.5);
const mono = [0, 1, 2, 3, 4].map(t => tierToStep(t, GRID_05));
eq('monotonic non-decreasing', mono.every((v, i) => i === 0 || v >= mono[i - 1]), true);

console.log('\n=== topic normalisation / dedup ===');
eq('J-Meter variants collapse to one',
  distinctTopics([{ topic: 'JMeter' }, { topic: 'jmeter' }, { topic: 'J-Meter ' }, { topic: 'j meter' }]).topics.length, 1);
eq('distinct skills counted separately',
  distinctTopics([{ topic: 'Grafana' }, { topic: 'JMeter' }, { topic: 'Selenium' }]).topics.length, 3);
eq('C++ / C# survive normalisation',
  distinctTopics([{ topic: 'C++' }, { topic: 'C#' }]).topics.length, 2);
eq('untagged quote still counts as evidence',
  distinctTopics([{ quote: 'Do you know Grafana?' }, { quote: 'And JMeter?' }]).topics.length, 2);
eq('untagged counter reports tagging gaps',
  distinctTopics([{ quote: 'a' }, { topic: 'X', quote: 'b' }]).untagged, 1);
eq('empty evidence -> 0 topics', distinctTopics([]).topics.length, 0);
eq('normalizeTopic strips punctuation', normalizeTopic(' Spring-Boot! '), 'springboot');

console.log('\n=== depth detection from quote TEXT (not from a model flag) ===');
// The model returned probes_depth=false for every item on a real record, including
// the "How do you..." questions, which zeroed Technical Depth for a panel that had
// asked six genuine how/why questions. The text is therefore the authority.
eq('"How do you structure..." is depth',
  looksDepthProbing('How do you structure your backend application using Express?'), true);
eq('"Why that approach?" is depth', looksDepthProbing('Why did you choose that approach?'), true);
eq('"Explain how you used Docker" is depth', looksDepthProbing("Explain how you've used Docker in your projects."), true);
eq('"What steps would you take?" is depth', looksDepthProbing('What steps would you take?'), true);
eq('"Suppose a query is slow" is depth', looksDepthProbing('Suppose a query becomes slow in production.'), true);
eq('"difference between" is depth', looksDepthProbing('Can you explain the difference between useState and useEffect?'), true);
eq('"Have you worked with AWS?" is NOT depth', looksDepthProbing('Have you worked with AWS?'), false);
eq('"Do you know Docker?" is NOT depth', looksDepthProbing('Do you know Docker?'), false);
eq('"Any Selenium exposure?" is NOT depth', looksDepthProbing('Any Selenium exposure?'), false);
eq('empty quote is NOT depth', looksDepthProbing(''), false);

console.log('\n=== small talk / HR logistics are NOT depth ===');
// Every one of these matched /\bhow\b/ or /\bdescribe\b/ and counted as demonstrated
// depth, which let a transcript of pleasantries plus one repeated yes/no reach 10/10.
eq('greeting is not depth',        looksDepthProbing('How are you today?'), false);
eq('years-of-experience lookup',   looksDepthProbing('How many years of experience do you have?'), false);
eq('audio check',                  looksDepthProbing('Can you hear me? How is the audio?'), false);
eq('notice period',                looksDepthProbing('So, how about your notice period?'), false);
eq('current CTC',                  looksDepthProbing('Describe your current CTC'), false);
eq('reason for change',            looksDepthProbing('Why are you looking for a change?'), false);
eq('tell me about yourself',       looksDepthProbing('Tell me about yourself'), false);
eq('resume walkthrough',           looksDepthProbing('Walk me through your resume'), false);
eq('relocation',                   looksDepthProbing('How do you feel about relocating to Chennai?'), false);
// ...while genuine technical how/why questions are unaffected.
eq('technical "how" still depth',  looksDepthProbing('How do you handle connection pooling?'), true);
eq('"how many" on a technical subject stays out',
  looksNonTechnical('How many years have you used React?'), true);
eq('looksNonTechnical is false for technical probes',
  looksNonTechnical('Why did you choose Kafka over RabbitMQ?'), false);

console.log('\n=== depth-probing topics (the unit for Technical Depth) ===');
const SIX_HOW = [
  { topic: 'react state',       quote: 'How do you manage state in larger React applications?' },
  { topic: 'express structure', quote: 'How do you structure your backend application using Express?' },
  { topic: 'slow query',        quote: 'Suppose a query becomes slow. What steps would you take?' },
  { topic: 'docker',            quote: "Explain how you've used Docker in your projects." },
  { topic: 'auth',              quote: 'How do you handle authentication and error management?' },
  { topic: 'prod incident',     quote: 'Tell me about a production issue you investigated and fixed.' },
];
eq('6 how/why on 6 subjects -> 6 depth topics', depthProbingTopics(SIX_HOW), 6);
eq('...so Technical Depth is 1.5, not 0', breadth(depthProbingTopics(SIX_HOW), GRID_2), 1.5);
// ...and 2.0 once the gate sees the depth count: six subjects each probed with how/why
// is exactly the "sustained explanation-seeking" route to full marks, no chain needed.
eq('...and 2.0 via path A (no chain needed)',
  tierToStep(deriveTier(depthProbingTopics(SIX_HOW), { depthTopics: 6, chains: 0 }).tierIndex, GRID_2), 2.0);
eq('yes/no coverage -> 0 depth topics',
  depthProbingTopics([{ topic: 'aws', quote: 'Have you worked with AWS?' },
    { topic: 'docker', quote: 'Do you know Docker?' }]), 0);
eq('depth topics dedupe like breadth topics',
  depthProbingTopics([{ topic: 'JMeter', quote: 'How do you script in JMeter?' },
    { topic: 'jmeter', quote: 'And how do you parameterise it?' }]), 1);
eq('explicit probes_depth flag still honoured',
  depthProbingTopics([{ topic: 'x', quote: 'Tell me more.', probes_depth: true }]), 1);

console.log('\n=== full-marks gate: breadth ceiling PLUS one of two depth routes ===');
// Path A — sustained explanation-seeking without ever revisiting a subject. This route
// MUST exist: measured over live runs the model set follows_up=true on 0 of 28 items
// and gave every question a unique topic, so chains was 0 on 18 of 18 dimensions.
// Gating full marks on a chain made 10/10 unreachable rather than rare.
eq('path A: 5 topics + 5 depth topics, no chain -> 2.0',
  tierToStep(deriveTier(5, { depthTopics: 5, chains: 0 }).tierIndex, GRID_2), 2.0);
eq('path A falls short at 4 depth topics -> 1.5',
  tierToStep(deriveTier(5, { depthTopics: 4, chains: 0 }).tierIndex, GRID_2), 1.5);
// Path B — a revisited subject is stronger evidence, so it needs less depth breadth.
eq('path B: 5 topics + 3 depth topics + 1 chain -> 2.0',
  tierToStep(deriveTier(5, { depthTopics: 3, chains: 1 }).tierIndex, GRID_2), 2.0);
eq('path B falls short at 2 depth topics -> 1.5',
  tierToStep(deriveTier(5, { depthTopics: 2, chains: 1 }).tierIndex, GRID_2), 1.5);
eq('5 topics + no depth at all -> 1.5',
  tierToStep(deriveTier(5, { depthTopics: 0, chains: 0 }).tierIndex, GRID_2), 1.5);
eq('4 topics + lots of depth -> 1.0 (breadth gates)',
  tierToStep(deriveTier(4, { depthTopics: 5, chains: 3 }).tierIndex, GRID_2), 1.0);
// The old calibration, pinned so it cannot come back: 3 topics + 2 how-questions was
// full marks and is now the 50% tier.
eq('OLD full-marks shape (3 topics, 2 depth) -> 1.0',
  tierToStep(deriveTier(3, { depthTopics: 2, chains: 1 }).tierIndex, GRID_2), 1.0);
eq('denial offers both routes when there is no chain',
  deriveTier(5, { depthTopics: 3, chains: 0 }).denialReason,
  'short of full marks: how/why probing on 5+ subjects (3), or 3+ plus a subject ' +
  'revisited with a deeper follow-up');
eq('denial names path B threshold once a chain exists',
  deriveTier(5, { depthTopics: 1, chains: 1 }).denialReason,
  'short of full marks: how/why probing on 3+ subjects (1)');
eq('denial names breadth alone when depth is satisfied',
  deriveTier(4, { depthTopics: 5, chains: 2 }).denialReason,
  'short of full marks: breadth (4 of 5+ subjects)');
eq('denial names ALL missing requirements',
  deriveTier(2, { depthTopics: 0, chains: 0 }).denialReason,
  'short of full marks: breadth (2 of 5+ subjects); how/why probing on 5+ subjects (0), ' +
  'or 3+ plus a subject revisited with a deeper follow-up');
eq('no denial when granted', deriveTier(5, { depthTopics: 3, chains: 1 }).denialReason, null);
eq('zero evidence -> no denial noise', deriveTier(0, { depthTopics: 0 }).denialReason, null);

console.log('\n=== follow-up chains (revisited AND drilled into) ===');
eq('3 unrelated one-shot questions -> 0 chains',
  followUpChains([{ topic: 'a' }, { topic: 'b' }, { topic: 'c' }]), 0);
// A rephrasing is not a chain. This alone used to open the full-marks gate.
eq('yes/no asked twice -> 0 chains',
  followUpChains([{ topic: 'JMeter', quote: 'Do you know JMeter?' },
    { topic: 'JMeter', quote: 'So you have used JMeter?' }]), 0);
eq('revisited WITH a how question -> 1 chain',
  followUpChains([{ topic: 'JMeter', quote: 'Do you know JMeter?' },
    { topic: 'JMeter', quote: 'How do you parameterise a JMeter script?' }]), 1);
eq('follows_up flag on a revisited topic -> 1 chain',
  followUpChains([{ topic: 'x', quote: 'Do you use x?' },
    { topic: 'x', quote: 'Tell me more.', follows_up: true }]), 1);
// A mistagged one-shot cannot manufacture a chain — the subject must really recur.
eq('follows_up flag on a ONE-SHOT question -> 0 chains',
  followUpChains([{ topic: 'x', quote: 'Do you use x?', follows_up: true }]), 0);
eq('5-question JMeter chain with depth -> 1 chain',
  followUpChains([{ topic: 'JMeter', quote: 'How do you script?' },
    ...Array.from({ length: 4 }, () => ({ topic: 'JMeter', quote: 'And?' }))]), 1);
eq('two independent drilled chains -> 2',
  followUpChains([{ topic: 'a', quote: 'How does a work?' }, { topic: 'a', quote: 'a again?' },
    { topic: 'b', quote: 'Why b?' }, { topic: 'b', quote: 'b again?' }]), 2);

console.log('\n=== end-to-end (the JD1005/Mathews shape) ===');
const DIMS = {
  'Mandatory Skill Coverage': { max: 2.0, steps: GRID_2 },
  'Technical Depth':          { max: 2.0, steps: GRID_2, depthDimension: true },
  'Framework Knowledge':      { max: 1.0, steps: GRID_1 },
};
const res = scoreFromEvidence({
  dimensions: DIMS,
  evidenceDetail: {
    // Three distinct JD skills raised. The candidate answered two of them badly
    // ("I have heard about that name") — that must not affect the panel's score.
    'Mandatory Skill Coverage': [
      { quote: 'Do you have exposure to Dynatrace?', topic: 'Dynatrace' },
      { quote: 'Your hands on with the JMeter scripting part?', topic: 'JMeter' },
      { quote: 'Any Grafana dashboards you built?', topic: 'Grafana' },
    ],
    // The real Mathews chain #16->#20: one subject drilled repeatedly.
    'Technical Depth': [
      { quote: 'What are the different elements you use in JMeter?', topic: 'JMeter elements' },
      { quote: 'And how do you use assertions?', topic: 'JMeter elements' },
      { quote: 'How would you correlate a dynamic token?', topic: 'correlation' },
    ],
    // Yes/no coverage only — breadth 3 but no depth, so 75% and NOT full marks.
    'Framework Knowledge': [
      { quote: 'Have you used Selenium?', topic: 'Selenium' },
      { quote: 'Do you know TestNG?', topic: 'TestNG' },
      { quote: 'Any Cucumber exposure?', topic: 'Cucumber' },
    ],
  },
  // Model claimed depth everywhere, including on the yes/no dimension. Ignored.
  depthClaims: { 'Technical Depth': true, 'Framework Knowledge': true, 'Mandatory Skill Coverage': true },
  modelScores: { 'Mandatory Skill Coverage': 0.5, 'Technical Depth': 0.5, 'Framework Knowledge': 1.0 },
});
// 3 distinct JD skills is the 50% tier now, not 75%: three subjects is ordinary
// coverage for a screening round.
eq('breadth-only dimension (3 topics) -> 1.0', res.scores['Mandatory Skill Coverage'], 1.0);
// 3 depth-probing quotes but only 2 distinct subjects (JMeter elements, correlation),
// and 2 units is the 25% tier. Reaching higher needs more subjects probed with
// how/why — the ladder applies to depth dimensions exactly as it does to breadth.
eq('depth dimension (2 depth topics) -> 0.5', res.scores['Technical Depth'], 0.5);
eq('depth dimension counted 2 subjects', res.audit['Technical Depth'].depth_probing_topics, 2);
eq('yes/no breadth + bogus depth claim -> 0.5', res.scores['Framework Knowledge'], 0.5);
eq('bogus claim denial recorded',
  res.audit['Framework Knowledge'].top_tier_denial_reason,
  'short of full marks: breadth (3 of 5+ subjects); how/why probing on 5+ subjects (0), ' +
  'or 3+ plus a subject revisited with a deeper follow-up');
eq('model claim recorded but not scored on',
  res.audit['Framework Knowledge'].depth_claimed_by_model, true);
eq('scored_on recorded for audit', res.audit['Technical Depth'].scored_on, 'depth_probing_topics');
eq('divergence from model score flagged', res.divergences.length >= 1, true);

console.log('\n=== regression: pleasantries must not score 10/10 ===');
// This exact evidence shape scored 10.0/10 under the previous calibration: four
// "topics" of which three matched a depth keyword by accident, plus one yes/no asked
// twice counting as a follow-up chain.
const L1_FULL = {
  'Mandatory Skill Coverage':   { max: 2.0, steps: GRID_2 },
  'Technical Depth':            { max: 2.0, steps: GRID_2, depthDimension: true },
  'Resume Initial Screening':   { max: 2.0, steps: GRID_2 },
  'Scenario / Risk Evaluation': { max: 2.0, steps: GRID_2 },
  'Framework Knowledge':        { max: 1.0, steps: GRID_1 },
  'Hands-on Validation':        { max: 1.0, steps: GRID_1 },
};
const SMALL_TALK = [
  { quote: 'How many years of experience do you have?', topic: 'experience' },
  { quote: 'Why are you looking for a change?',         topic: 'motivation' },
  { quote: 'Describe your current project briefly',     topic: 'current project' },
  { quote: 'Do you know Cypress?',                      topic: 'Cypress' },
  { quote: 'So you have used Cypress right?',           topic: 'Cypress' },
];
const weak = scoreFromEvidence({
  dimensions: L1_FULL,
  evidenceDetail: Object.fromEntries(Object.keys(L1_FULL).map(d => [d, SMALL_TALK])),
});
const weakTotal = Object.values(weak.scores).reduce((s, v) => s + v, 0);
eq('small talk total is well under 10', weakTotal < 6, true);
eq('Technical Depth on small talk -> 0.5', weak.scores['Technical Depth'], 0.5);
eq('no chain from a repeated yes/no', weak.audit['Technical Depth'].follow_up_chains, 0);
eq('small talk contributed no depth subjects',
  weak.audit['Mandatory Skill Coverage'].depth_probing_topics, 1);   // "describe your current project"

console.log('\n=== an exceptional panel still reaches full marks ===');
// 7 subjects, how/why on 5 of them, two of those revisited to drill deeper. Note the
// depth dimension needs >4 subjects probed with how/why in its own right — coverage on
// 6 subjects with depth on only 4 lands Technical Depth at 1.0/2.0, which is the
// intended reading of "broad, drilled in on some, but not exhaustively deep".
const EXCELLENT = [
  { quote: 'How do you structure your Cypress page objects?',        topic: 'Cypress structure' },
  { quote: 'And why keep the selectors out of the spec files?',      topic: 'Cypress structure' },
  { quote: 'How do you handle flaky waits in the suite?',            topic: 'flaky tests' },
  { quote: 'What would you do if the retry still fails in CI?',      topic: 'flaky tests' },
  { quote: 'Explain how you assert on an intercepted network call.', topic: 'network stubbing' },
  { quote: 'Why did you choose that reporting setup?',               topic: 'reporting' },
  { quote: 'How do you parallelise the suite across runners?',       topic: 'parallelisation' },
  { quote: 'Have you used TestNG?',                                  topic: 'TestNG' },
  { quote: 'Any Docker exposure for the test runners?',              topic: 'Docker' },
];
const strong = scoreFromEvidence({
  dimensions: L1_FULL,
  evidenceDetail: Object.fromEntries(Object.keys(L1_FULL).map(d => [d, EXCELLENT])),
});
eq('exceptional panel -> 10.0',
  Object.values(strong.scores).reduce((s, v) => s + v, 0), 10.0);
eq('...on 7 distinct subjects', strong.audit['Mandatory Skill Coverage'].distinct_topics, 7);
eq('...with 5 depth subjects', strong.audit['Technical Depth'].depth_probing_topics, 5);
eq('...and 2 real chains', strong.audit['Mandatory Skill Coverage'].follow_up_chains, 2);

console.log('\n=== regression: a padded evidence list must not buy breadth ===');
// SAAS_QA/Dharshini: asked for "up to 8 items", the model quoted ONE question eight
// times and tagged the copies with different topics, so a single "in case it is not
// working, how will you do it?" counted as 8 subjects probed with depth on all of
// them — full marks on Hands-on Validation for one question, and manufactured chains
// out of pure repetition. Repeats are collapsed before anything is counted.
const PADDED = Array.from({ length: 8 }, (_, i) => ({
  quote: 'In some case, in case is not working. How will you do it?',
  topic: ['Selenium', 'TestNG', 'waits', 'retries', 'grid', 'reporting', 'CI', 'Docker'][i],
  probes_depth: true,
}));
const padded = coerceEvidenceItems(PADDED);
eq('8 copies of one question -> 1 item', padded.length, 1);
eq('...counting 1 subject', distinctTopics(padded).topics.length, 1);
eq('...and no chain', followUpChains(padded), 0);
const paddedScore = scoreFromEvidence({
  dimensions: { 'Hands-on Validation': { max: 1.0, steps: GRID_1 } },
  evidenceDetail: { 'Hands-on Validation': padded },
});
eq('...scoring 0.25/1.0, not full marks', paddedScore.scores['Hands-on Validation'], 0.25);

// Whitespace, case and punctuation do not make two questions different; a genuinely
// different question still counts.
eq('case and spacing variants collapse',
  coerceEvidenceItems([
    'So which framework are you using?',
    '  so which framework are you using  ',
    'SO WHICH FRAMEWORK ARE YOU USING?',
    'And how do you run them in parallel?',
  ]).length, 2);

// A flag set on a later copy is not lost when the copies collapse.
const merged = coerceEvidenceItems([
  { quote: 'Tell me more about that trade-off.', topic: '' },
  { quote: 'Tell me more about that trade-off.', topic: 'caching', probes_depth: true, follows_up: true },
]);
eq('flags OR across collapsed copies',
  [merged.length, merged[0].topic, merged[0].probes_depth, merged[0].follows_up],
  [1, 'caching', true, true]);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
