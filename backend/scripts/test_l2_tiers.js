/**
 * L2 tier-scoring checks. No test runner in backend/, so this is a plain script:
 *   node scripts/test_l2_tiers.js     (exit 0 = pass)
 *
 * The shared tier ladder is pinned in test_evidence_tiers.js. This file covers what
 * is specific to L2: the 8-dimension config, the 3-step coarse grids, and the
 * handoff cap — the only scoring rule that lives in l2ScoringService rather than in
 * the shared module. No LLM call: _deriveScores runs on a fixture response.
 */
'use strict';

const {
  L2_DIMENSIONS, MAX_L2_SCORE, HANDOFF_DIMENSION, HANDOFF_CAP_WITHOUT_L1, _deriveScores,
} = require('../src/services/l2ScoringService');

let failures = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

/** Build n evidence items on n distinct topics, optionally depth-probing. */
function items(n, { depth = false, prefix = 't' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    topic: `${prefix}${i}`,
    quote: depth ? `How do you handle ${prefix}${i} at scale?` : `Have you used ${prefix}${i}?`,
  }));
}

/** Run the derivation over a fixture, filling unlisted dimensions with no evidence. */
function derive(evidenceDetail, hasL1 = true) {
  const full = {};
  for (const dim of Object.keys(L2_DIMENSIONS)) full[dim] = evidenceDetail[dim] || [];
  return _deriveScores({ evidence_detail: full }, hasL1);
}

console.log('=== dimension config ===');
eq('8 dimensions', Object.keys(L2_DIMENSIONS).length, 8);
eq('weights total 10.0', MAX_L2_SCORE, 10.0);
eq('Technical Depth is the only depth dimension',
  Object.entries(L2_DIMENSIONS).filter(([, c]) => c.depthDimension).map(([k]) => k), ['Technical Depth']);
// Posing a failure scenario IS the evidence; also requiring how/why phrasing would
// gate the same requirement twice and score a scenario-heavy panel as shallow.
eq('Scenario / Risk is NOT a depth dimension',
  Boolean(L2_DIMENSIONS['Scenario / Risk Evaluation'].depthDimension), false);
for (const [dim, cfg] of Object.entries(L2_DIMENSIONS)) {
  eq(`${dim} grid spans 0..max`, [cfg.steps[0], cfg.steps[cfg.steps.length - 1]], [0, cfg.max]);
}

console.log('\n=== tiers on the 2.0-max dimensions ===');
eq('1 subject -> 0.5', derive({ 'Mandatory Skill Coverage': items(1) }).categories['Mandatory Skill Coverage'], 0.5);
eq('2 subjects -> 1.0', derive({ 'Mandatory Skill Coverage': items(2) }).categories['Mandatory Skill Coverage'], 1.0);
eq('3 subjects (yes/no) -> 1.5', derive({ 'Mandatory Skill Coverage': items(3) }).categories['Mandatory Skill Coverage'], 1.5);
eq('3 subjects + depth -> 2.0',
  derive({ 'Mandatory Skill Coverage': items(3, { depth: true }) }).categories['Mandatory Skill Coverage'], 2.0);
eq('no evidence -> 0', derive({}).categories['Mandatory Skill Coverage'], 0);

console.log('\n=== the 0.5-max / 3-step grids (Leadership, Behavioral) ===');
// The regression that motivated tierToStep: multiply-and-snap put 75% of 0.5 at
// 0.375, which snapped DOWN to 0.25, so a panel probing three leadership subjects
// scored identically to one probing a single subject.
const lead1 = derive({ 'Leadership Evaluation': items(1) }).categories['Leadership Evaluation'];
const lead3 = derive({ 'Leadership Evaluation': items(3) }).categories['Leadership Evaluation'];
eq('1 subject -> 0.25', lead1, 0.25);
eq('3 subjects -> 0.5 (NOT collapsed onto 0.25)', lead3, 0.5);
eq('3 subjects outscore 1 subject', lead3 > lead1, true);
eq('Behavioral 3 subjects -> 0.5',
  derive({ 'Behavioral Assessment': items(3) }).categories['Behavioral Assessment'], 0.5);
eq('every score lands on its own grid',
  Object.entries(derive({
    'Leadership Evaluation': items(3), 'Behavioral Assessment': items(2),
    'Framework Knowledge': items(3, { depth: true }),
  }).categories).every(([d, v]) => L2_DIMENSIONS[d].steps.includes(v)), true);

console.log('\n=== Technical Depth counts depth-probing subjects only ===');
eq('4 yes/no questions -> 0',
  derive({ 'Technical Depth': items(4) }).categories['Technical Depth'], 0);
eq('3 how/why subjects -> 2.0',
  derive({ 'Technical Depth': items(3, { depth: true }) }).categories['Technical Depth'], 2.0);
eq('scored_on recorded',
  derive({ 'Technical Depth': items(3, { depth: true }) }).evidence_audit['Technical Depth'].scored_on,
  'depth_probing_topics');

console.log('\n=== handoff cap when no L1 transcript exists ===');
const strongHandoff = { [HANDOFF_DIMENSION]: items(4, { depth: true, prefix: 'claim' }) };
const withL1 = derive(strongHandoff, true);
const withoutL1 = derive(strongHandoff, false);
eq('with L1: full marks reachable', withL1.categories[HANDOFF_DIMENSION], 2.0);
eq('without L1: capped', withoutL1.categories[HANDOFF_DIMENSION], HANDOFF_CAP_WITHOUT_L1);
eq('cap reported in warnings', withoutL1.scoring_warnings.capped_dimensions, [`${HANDOFF_DIMENSION} 2->1`]);
eq('cap recorded in audit', withoutL1.evidence_audit[HANDOFF_DIMENSION].capped_to, HANDOFF_CAP_WITHOUT_L1);
eq('cap reason recorded',
  withoutL1.evidence_audit[HANDOFF_DIMENSION].cap_reason,
  'no L1 transcript — handoff follow-up unobservable');
eq('cap lowers the total by the difference',
  Math.round((withL1.score - withoutL1.score) * 10) / 10, 1.0);
// A score already at or under the cap must not be reported as capped — that would
// read as "we withheld marks here" when nothing was withheld.
const weakHandoff = derive({ [HANDOFF_DIMENSION]: items(1) }, false);
eq('score under the cap is untouched', weakHandoff.categories[HANDOFF_DIMENSION], 0.5);
eq('...and not reported as capped', weakHandoff.scoring_warnings.capped_dimensions, []);
eq('cap does not touch other dimensions',
  derive({ 'Technical Depth': items(3, { depth: true }) }, false).categories['Technical Depth'], 2.0);

console.log('\n=== frontend contract + totals ===');
const res = derive({
  'Mandatory Skill Coverage': items(3, { prefix: 'skill' }),
  'Technical Depth': items(3, { depth: true, prefix: 'design' }),
  'Leadership Evaluation': items(2, { prefix: 'lead' }),
});
eq('evidence is Record<string, string[]>',
  Object.values(res.evidence).every(v => Array.isArray(v) && v.every(q => typeof q === 'string')), true);
eq('every dimension key present in evidence',
  Object.keys(L2_DIMENSIONS).every(d => Array.isArray(res.evidence[d])), true);
eq('quotes survive derivation', res.evidence['Mandatory Skill Coverage'].length, 3);
eq('total is the sum of the derived categories',
  res.score, Math.round(Object.values(res.categories).reduce((s, v) => s + v, 0) * 10) / 10);
eq('percent is of 10.0', res.score_percent, Math.round((res.score / MAX_L2_SCORE) * 100));
eq('empty dimensions reported',
  res.scoring_warnings.dimensions_without_evidence.includes('Behavioral Assessment'), true);

console.log('\n=== legacy stored responses re-score without crashing ===');
// Older records stored evidence as bare strings under `evidence`, with the model's
// own `categories`. Re-scoring one must derive from the strings, not throw.
const legacy = _deriveScores({
  categories: { 'Mandatory Skill Coverage': 2.0, 'Technical Depth': 1.5 },
  evidence: {
    'Mandatory Skill Coverage': ['Have you used Kafka?', 'Any Redis experience?', 'And Postgres?'],
    'Technical Depth': ['How would you scale the write path?'],
  },
}, true);
eq('bare strings count toward breadth', legacy.categories['Mandatory Skill Coverage'], 1.5);
eq('untagged evidence flagged', legacy.scoring_warnings.untagged_evidence.length > 0, true);
eq('model score divergence flagged', legacy.scoring_warnings.model_score_divergences.length > 0, true);
eq('legacy total recomputed, not trusted', legacy.score, 2.0);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
