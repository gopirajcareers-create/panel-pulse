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
  looksDepthProbing, normalizeTopic, scoreFromEvidence,
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
// Same ladder with the depth gate OPEN.
const withDepth = (units, steps) => tierToStep(deriveTier(units, { depthTopics: 2, chains: 1 }).tierIndex, steps);

console.log('=== breadth ladder, max 2.0 dimension (the spec as stated) ===');
eq('0 evidence -> 0',                       breadth(0, GRID_2), 0);
eq('1 evidence -> 0.5',                     breadth(1, GRID_2), 0.5);
eq('2 evidence -> 1.0',                     breadth(2, GRID_2), 1.0);
eq('3 evidence -> 1.5',                     breadth(3, GRID_2), 1.5);
eq('6 evidence -> 1.5 (breadth ceiling)',   breadth(6, GRID_2), 1.5);
eq('3 evidence + depth -> 2.0 (full marks)', withDepth(3, GRID_2), 2.0);
eq('2 evidence + depth -> 1.0 (breadth gates)', withDepth(2, GRID_2), 1.0);

console.log('\n=== breadth ladder, max 1.0 dimension ===');
eq('1 -> 0.25',           breadth(1, GRID_1), 0.25);
eq('2 -> 0.5',            breadth(2, GRID_1), 0.5);
eq('3 -> 0.75',           breadth(3, GRID_1), 0.75);
eq('3 + depth -> 1.0',    withDepth(3, GRID_1), 1.0);

console.log('\n=== max 0.5 dimension, 3-step grid (L2 leadership/behavioural) ===');
// Coarse but MUST stay monotonic: multiply-and-snap made tier 3 collapse onto tier 1.
eq('0 -> 0',              breadth(0, GRID_05), 0);
eq('1 -> 0.25',           breadth(1, GRID_05), 0.25);
eq('2 -> 0.25',           breadth(2, GRID_05), 0.25);
eq('3 -> 0.5',            breadth(3, GRID_05), 0.5);
eq('3 + depth -> 0.5',    withDepth(3, GRID_05), 0.5);
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
eq('yes/no coverage -> 0 depth topics',
  depthProbingTopics([{ topic: 'aws', quote: 'Have you worked with AWS?' },
    { topic: 'docker', quote: 'Do you know Docker?' }]), 0);
eq('depth topics dedupe like breadth topics',
  depthProbingTopics([{ topic: 'JMeter', quote: 'How do you script in JMeter?' },
    { topic: 'jmeter', quote: 'And how do you parameterise it?' }]), 1);
eq('explicit probes_depth flag still honoured',
  depthProbingTopics([{ topic: 'x', quote: 'Tell me more.', probes_depth: true }]), 1);

console.log('\n=== full-marks gate (breadth AND demonstrated depth) ===');
eq('3 topics + 2 depth topics -> 2.0',
  tierToStep(deriveTier(3, { depthTopics: 2, chains: 0 }).tierIndex, GRID_2), 2.0);
eq('3 topics + 1 chain -> 2.0',
  tierToStep(deriveTier(3, { depthTopics: 0, chains: 1 }).tierIndex, GRID_2), 2.0);
eq('3 topics + only 1 depth topic -> 1.5',
  tierToStep(deriveTier(3, { depthTopics: 1, chains: 0 }).tierIndex, GRID_2), 1.5);
eq('3 topics + no depth at all -> 1.5',
  tierToStep(deriveTier(3, { depthTopics: 0, chains: 0 }).tierIndex, GRID_2), 1.5);
eq('2 topics + lots of depth -> 1.0 (breadth gates)',
  tierToStep(deriveTier(2, { depthTopics: 5, chains: 3 }).tierIndex, GRID_2), 1.0);
eq('denial reason: no depth',
  deriveTier(3, { depthTopics: 0, chains: 0 }).denialReason, 'no how/why depth probing in evidence');
eq('denial reason: breadth only',
  deriveTier(2, { depthTopics: 5, chains: 2 }).denialReason, 'insufficient breadth');
eq('denial reason: both short',
  deriveTier(2, { depthTopics: 0, chains: 0 }).denialReason, 'breadth and depth both short of full marks');
eq('no denial when granted', deriveTier(3, { depthTopics: 2 }).denialReason, null);
eq('zero evidence -> no denial noise', deriveTier(0, { depthTopics: 0 }).denialReason, null);

console.log('\n=== follow-up chains ===');
eq('3 unrelated one-shot questions -> 0 chains',
  followUpChains([{ topic: 'a' }, { topic: 'b' }, { topic: 'c' }]), 0);
eq('2 questions on one topic -> 1 chain',
  followUpChains([{ topic: 'JMeter' }, { topic: 'JMeter' }]), 1);
eq('explicit follows_up flag -> 1 chain',
  followUpChains([{ topic: 'x', follows_up: true }]), 1);
eq('5-question JMeter chain -> 1 chain',
  followUpChains(Array.from({ length: 5 }, () => ({ topic: 'JMeter' }))), 1);
eq('two independent chains -> 2',
  followUpChains([{ topic: 'a' }, { topic: 'a' }, { topic: 'b' }, { topic: 'b' }]), 2);

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
eq('breadth-only dimension -> 1.5', res.scores['Mandatory Skill Coverage'], 1.5);
// 3 depth-probing quotes but only 2 distinct subjects (JMeter elements, correlation),
// and 2 units is the 50% tier. Reaching 1.5+ here needs a THIRD subject probed with
// how/why — the ladder applies to depth dimensions exactly as it does to breadth.
eq('depth dimension (2 depth topics) -> 1.0', res.scores['Technical Depth'], 1.0);
eq('depth dimension counted 2 subjects', res.audit['Technical Depth'].depth_probing_topics, 2);
eq('yes/no breadth + bogus depth claim -> 0.75', res.scores['Framework Knowledge'], 0.75);
eq('bogus claim denial recorded',
  res.audit['Framework Knowledge'].top_tier_denial_reason, 'no how/why depth probing in evidence');
eq('model claim recorded but not scored on',
  res.audit['Framework Knowledge'].depth_claimed_by_model, true);
eq('scored_on recorded for audit', res.audit['Technical Depth'].scored_on, 'depth_probing_topics');
eq('divergence from model score flagged', res.divergences.length >= 1, true);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
