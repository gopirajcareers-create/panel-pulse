/**
 * Skill-match tier checks. No test runner in backend/, so this is a plain script:
 *   node scripts/test_skill_match.js      (exit 0 = pass)
 *
 * The tiers and weights are a product decision, so they are pinned here explicitly.
 * If a tier boundary or a bucket weight moves, this file should be the first thing
 * that fails.
 *
 * The demotion cases matter most. Stage 1's instability came from trusting the model's
 * verdict; these assert that a claim unsupported by the resume text is cut down no
 * matter how confidently it was asserted.
 */
'use strict';

const {
  computeMatchScore, reconcileRows, deriveTier, coerceClaimedTier,
  skillMentioned, skillPhraseInResume, groundingRatio, hasContextMarkers,
  looksLikeSkillsList, findSummaryContradictions, coverageSentence,
  normalizeForMatch, significantTokens,
} = require('../src/services/skillMatchScoring');

const { cleanSkillList } = require('../src/services/screeningService');

let failures = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const RESUME = `
SATHISH KUMAR — Senior QA Engineer
Total Experience: 6 years in software testing.

PROFESSIONAL SUMMARY
Implemented automation testing with Playwright (JavaScript) to optimize test coverage
across 200+ regression test cases. Coordinated with cross-functional teams including
Developers, BAs and Product Owners to deliver quality releases. Actively participated
in debugging, defect fixing and performance optimization ensuring smooth release cycles.
Participated in Agile ceremonies including sprint planning, backlog grooming and
release testing.

TECHNICAL SKILLS
Java, Selenium WebDriver, TestNG, Maven, Jenkins, Postman, JIRA

PROJECTS
Retail Banking Platform — designed and maintained the end-to-end regression suite for
3 years using Selenium WebDriver, reducing manual effort by 40%.
`;

console.log('=== normalisation ===');
eq('CI/CD normalises to two tokens', normalizeForMatch('CI/CD'), 'ci cd');
eq('C++ keeps its plus signs', normalizeForMatch('C++'), 'c++');
eq('stopwords and short tokens dropped', significantTokens('the API and REST'), ['api', 'rest']);

console.log('\n=== skillMentioned: words present anywhere, not adjacent ===');
eq('multi-word skill matched non-adjacently', skillMentioned('Regression Testing', RESUME), true);
eq('single-word skill present', skillMentioned('Playwright', RESUME), true);
eq('absent skill', skillMentioned('Kubernetes', RESUME), false);
// The whole point of alternation handling: the resume says "Agile" but not "Scrum".
eq('alternation needs only one side', skillMentioned('Agile / Scrum', RESUME), true);
eq('alternation with both sides absent', skillMentioned('Terraform / Ansible', RESUME), false);
eq('multi-word with one word absent', skillMentioned('Kubernetes Orchestration', RESUME), false);

console.log('\n=== grounding: catches invented quotes ===');
eq('verbatim quote fully grounded',
  groundingRatio('Implemented automation testing with Playwright', RESUME).ratio, 1);
eq('fabricated quote scores low',
  groundingRatio('Led a team of 12 engineers building Kubernetes operators', RESUME).ratio < 0.6, true);
eq('empty quote scores 0', groundingRatio('', RESUME).ratio, 0);

console.log('\n=== context markers ===');
eq('duration counts', hasContextMarkers('3 years using Selenium WebDriver'), true);
eq('action verb counts', hasContextMarkers('Implemented automation testing'), true);
eq('percentage outcome counts', hasContextMarkers('reducing manual effort by 40%'), true);
eq('bare list has no context', hasContextMarkers('Java, Selenium WebDriver, TestNG, Maven'), false);
eq('skills list detected', looksLikeSkillsList('Java, Selenium WebDriver, TestNG, Maven'), true);
eq('sentence not a skills list', looksLikeSkillsList('Implemented automation testing with Playwright'), false);

console.log('\n=== tier derivation: the model claims, the resume decides ===');
const tier = (row, skill) => deriveTier(row, skill, RESUME).tier;

eq('STRONG upheld when named + context',
  tier({ tier: 'STRONG', evidence: 'Implemented automation testing with Playwright to optimize test coverage' }, 'Playwright'),
  'STRONG');

// The case that drove three-tier grading: a real mention with nothing behind it.
eq('STRONG demoted to PARTIAL for a bare skills-list mention',
  tier({ tier: 'STRONG', evidence: 'Java, Selenium WebDriver, TestNG, Maven' }, 'TestNG'),
  'PARTIAL');

eq('STRONG demoted to NONE for an invented quote',
  tier({ tier: 'STRONG', evidence: 'Led a team of 12 engineers building Kubernetes operators' }, 'Kubernetes'),
  'NONE');

eq('STRONG demoted to NONE when no evidence supplied',
  tier({ tier: 'STRONG', evidence: '' }, 'Playwright'),
  'NONE');

// Soft skills are evidenced by description, never by name — they must stay reachable
// at PARTIAL, or every soft skill scores 0 regardless of the resume.
eq('soft skill not named in resume caps at PARTIAL',
  tier({ tier: 'STRONG', evidence: 'Coordinated with cross-functional teams including Developers, BAs and Product Owners' }, 'Communication'),
  'PARTIAL');

eq('NONE upheld when the skill really is absent',
  tier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Docker'),
  'NONE');

// ── False negatives ────────────────────────────────────────────────────────────
// This block replaces an assertion that read "NONE is trusted without examination".
// That was the bug, pinned as a test: a JD asking for "Playwright or Cypress" against a
// resume naming Cypress was scored NONE, because the model searched the pair as one
// string. The summary in the SAME response said "strong experience with Cypress".
const CYPRESS_RESUME = `
QA Automation Engineer | Cypress • TypeScript • JavaScript | SDET
Built and scaled Cypress automation frameworks for regression-critical flows.
6 years of experience in automation testing and CI/CD integration.
`;
const cyTier = (row, skill) => deriveTier(row, skill, CYPRESS_RESUME);

eq('alternation false-negative promoted to PARTIAL',
  cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Playwright or Cypress').tier,
  'PARTIAL');
eq('promotion is flagged as such',
  cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Playwright or Cypress').promoted,
  true);
eq('promotion replaces the "not found" evidence with the resume line',
  /Cypress/.test(cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Playwright or Cypress').evidenceOverride || ''),
  true);
eq('promotion records its reason',
  cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Playwright or Cypress').reasons.length,
  1);

// Promotion tops out at PARTIAL. The resume proves the word is present; only the model
// can judge depth, and it declined to.
eq('promotion never reaches STRONG',
  cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Cypress').tier,
  'PARTIAL');

// The guard against over-promotion. skillMentioned matches these words scattered across
// the resume, but promotion requires them ADJACENT — otherwise a genuine gap gets credit.
eq('scattered words do NOT promote (needs a contiguous phrase)',
  cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Exposure to performance testing tools').tier,
  'NONE');
eq('scattered words: skillMentioned would have said yes',
  skillMentioned('automation testing experience', CYPRESS_RESUME), true);
eq('...but the phrase check says no',
  skillPhraseInResume('automation testing experience', CYPRESS_RESUME).found, false);
eq('genuinely absent skill stays NONE',
  cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Kubernetes').tier, 'NONE');

console.log('\n=== phrase matching: punctuation and word boundaries ===');
eq('punctuation between words tolerated',
  skillPhraseInResume('CI/CD integration', CYPRESS_RESUME).found, true);
eq('substring of a longer word does not count',
  skillPhraseInResume('press', CYPRESS_RESUME).found, false);
eq('phrase must be in order',
  skillPhraseInResume('frameworks Cypress automation', CYPRESS_RESUME).found, false);

console.log('\n=== summary vs evidence: the contradiction the UI showed ===');
const CONTRADICTING = 'The candidate has strong experience with Cypress and TypeScript. ' +
  'They have also demonstrated expertise in automation testing.';
const noneRows = [{ skill: 'Cypress', tier: 'NONE' }, { skill: 'Kubernetes', tier: 'NONE' }];

eq('summary asserting a NONE skill is flagged',
  findSummaryContradictions(CONTRADICTING, noneRows).map(c => c.skill), ['Cypress']);
eq('the offending sentence is captured, not the whole summary',
  findSummaryContradictions(CONTRADICTING, noneRows)[0].sentence,
  'The candidate has strong experience with Cypress and TypeScript.');

// An accurate summary NAMES absent skills to report them missing. That agrees with the
// tiers and must not be flagged, or every honest summary trips the warning.
eq('negated mention is not a contradiction',
  findSummaryContradictions('However, they lack Kubernetes and blockchain testing experience.', noneRows),
  []);
eq('"does not have" is not a contradiction',
  findSummaryContradictions('The candidate does not have Cypress exposure.', noneRows), []);
eq('no NONE rows -> nothing to contradict',
  findSummaryContradictions(CONTRADICTING, [{ skill: 'Cypress', tier: 'STRONG' }]), []);
eq('empty summary -> no contradictions', findSummaryContradictions('', noneRows), []);

console.log('\n=== coverage sentence is derived, so it cannot disagree ===');
const cov = computeMatchScore({
  mandatoryRows: [{ tier: 'STRONG', credit: 1 }, { tier: 'PARTIAL', credit: 0.5 }, { tier: 'NONE', credit: 0 }],
  goodToHaveRows: [{ tier: 'NONE', credit: 0 }],
});
eq('coverage sentence counts every tier',
  coverageSentence(cov.breakdown),
  'Mandatory: 1 strong, 1 partial, 1 not evidenced (of 3). Good-to-have: 0 strong, 0 partial, 1 not evidenced (of 1).');
eq('no skills -> says so',
  coverageSentence(computeMatchScore({ mandatoryRows: [], goodToHaveRows: [] }).breakdown),
  'No skills were available to evaluate.');

eq('legacy matched:true is graded, not trusted',
  tier({ matched: true, evidence: 'Java, Selenium WebDriver, TestNG, Maven' }, 'Maven'),
  'PARTIAL');
eq('legacy matched:false -> NONE', tier({ matched: false, evidence: '' }, 'Docker'), 'NONE');

eq('demotion reason recorded',
  deriveTier({ tier: 'STRONG', evidence: 'Java, Selenium WebDriver, TestNG, Maven' }, 'TestNG', RESUME).reasons.length > 0,
  true);

console.log('\n=== tier coercion ===');
eq('lowercase accepted', coerceClaimedTier({ tier: 'strong' }), 'STRONG');
eq('synonym accepted', coerceClaimedTier({ tier: 'implied' }), 'PARTIAL');
eq('garbage defaults to NONE', coerceClaimedTier({ tier: 'probably?' }), 'NONE');

console.log('\n=== reconciliation: a skill the model skipped is not a pass ===');
const requested = [
  { skill: 'Playwright', source: 'jd' },
  { skill: 'Selenium WebDriver', source: 'jd' },
  { skill: 'Kubernetes', source: 'jd' },
];
const rec = reconcileRows(requested, [
  { skill: 'Playwright', tier: 'STRONG', evidence: 'Implemented automation testing with Playwright to optimize test coverage' },
  // 'Selenium WebDriver' omitted entirely by the model.
  { skill: 'Kubernetes', tier: 'NONE', evidence: 'Not found in resume.' },
  { skill: 'Astrology', tier: 'STRONG', evidence: 'invented row nobody asked about' },
], RESUME);

eq('every requested skill produces a row', rec.rows.length, 3);
eq('omitted skill reported', rec.missing, ['Selenium WebDriver']);
// The model never reported "Selenium WebDriver", but the resume's skills line names it
// verbatim, so the promotion applies: PARTIAL, not NONE. Scoring it 0 would penalise the
// candidate for the model's omission.
eq('omitted skill the resume names -> PARTIAL, not 0', rec.rows[1].tier, 'PARTIAL');
eq('omitted-and-promoted evidence states BOTH facts',
  rec.rows[1].evidence.startsWith('The screening model did not report this skill, but the resume names it:'),
  true);
eq('omission still recorded in the audit', rec.rows[1].audit.reported_by_model, false);

// A skill the model omitted that the resume genuinely lacks stays at zero.
const recAbsent = reconcileRows(
  [{ skill: 'Kubernetes Orchestration', source: 'jd' }], [], RESUME);
eq('omitted skill absent from the resume -> NONE', recAbsent.rows[0].tier, 'NONE');
eq('omitted absent skill says the model skipped it',
  recAbsent.rows[0].evidence, 'The screening model did not report this skill.');
eq('unrequested row discarded', rec.extra, ['astrology']);
eq('row order follows the request', rec.rows.map(r => r.skill),
  ['Playwright', 'Selenium WebDriver', 'Kubernetes']);
eq('source is carried through', rec.rows[0].source, 'jd');

// Case-and-punctuation drift is normal model behaviour, not an omission.
const recCase = reconcileRows(
  [{ skill: 'CI/CD Pipelines', source: 'jd' }],
  [{ skill: 'CI/CD pipelines', tier: 'NONE', evidence: 'Not found in resume.' }],
  RESUME);
eq('case-drifted skill name still matched', recCase.missing, []);

console.log('\n=== score arithmetic ===');
const row = (tier) => ({ tier, credit: tier === 'STRONG' ? 1 : tier === 'PARTIAL' ? 0.5 : 0 });

eq('all strong in both buckets -> 100',
  computeMatchScore({
    mandatoryRows: [row('STRONG'), row('STRONG')],
    goodToHaveRows: [row('STRONG')],
  }).matchScore, 100);

eq('all none -> 0',
  computeMatchScore({ mandatoryRows: [row('NONE')], goodToHaveRows: [row('NONE')] }).matchScore, 0);

// 3/3 mandatory + 1/2 good-to-have = 70 + 15 = 85: the exact figure from the reported
// screenshot, so the new arithmetic is verifiably continuous with the old on the case
// where the old code happened to be right.
eq('3/3 mandatory + 1/2 good-to-have -> 85',
  computeMatchScore({
    mandatoryRows: [row('STRONG'), row('STRONG'), row('STRONG')],
    goodToHaveRows: [row('STRONG'), row('NONE')],
  }).matchScore, 85);

// The reason grading exists: a borderline skill now moves the score by half a slot
// rather than flipping a full 70/N.
eq('partial mandatory scores between none and strong',
  computeMatchScore({ mandatoryRows: [row('PARTIAL'), row('STRONG')], goodToHaveRows: [row('STRONG')] }).matchScore,
  Math.round(0.75 * 70 + 30));

console.log('\n=== empty-bucket weight redistribution ===');
const noGth = computeMatchScore({ mandatoryRows: [row('STRONG'), row('STRONG')], goodToHaveRows: [] });
eq('no good-to-have skills -> mandatory carries 100', noGth.matchScore, 100);
eq('redistribution flagged', noGth.breakdown.weights_redistributed, true);
eq('mandatory weight raised to 100', noGth.breakdown.mandatory.weight, 100);

const noMandatory = computeMatchScore({ mandatoryRows: [], goodToHaveRows: [row('PARTIAL')] });
eq('good-to-have alone carries 100', noMandatory.matchScore, 50);

const nothing = computeMatchScore({ mandatoryRows: [], goodToHaveRows: [] });
eq('no skills at all -> null score', nothing.matchScore, null);
eq('no skills at all -> Not Screenable', nothing.status, 'Not Screenable');

console.log('\n=== status bands derive from the score, never independently ===');
const status = (m, g) => computeMatchScore({ mandatoryRows: m, goodToHaveRows: g }).status;
eq('100 -> Eligible', status([row('STRONG')], [row('STRONG')]), 'Eligible');
eq('70 -> Eligible (boundary)', status([row('STRONG')], [row('NONE')]), 'Eligible');
eq('50 -> Partially Eligible', status([row('PARTIAL')], [row('PARTIAL')]), 'Partially Eligible');
eq('35 -> Ineligible', status([row('PARTIAL')], [row('NONE')]), 'Ineligible');
eq('0 -> Ineligible', status([row('NONE')], [row('NONE')]), 'Ineligible');

console.log('\n=== breakdown is auditable by hand ===');
const audited = computeMatchScore({
  mandatoryRows: [row('STRONG'), row('PARTIAL'), row('NONE')],
  goodToHaveRows: [row('STRONG')],
});
eq('mandatory credit summed', audited.breakdown.mandatory.credit_earned, 1.5);
eq('tier census: strong', audited.breakdown.mandatory.strong, 1);
eq('tier census: partial', audited.breakdown.mandatory.partial, 1);
eq('tier census: none', audited.breakdown.mandatory.none, 1);
eq('formula states the arithmetic',
  audited.breakdown.formula, 'mandatory 1.50/3 x 70 + good-to-have 1.00/1 x 30 = 65.0%');
eq('formula matches the score', audited.matchScore, 65);

console.log('\n=== skill-list cleaning: the noise that used to be scored ===');
// Each of these reached the UI as a "skill" and, worse, was scored — an unmatchable
// entry drags the percentage down for a reason unrelated to the candidate.
eq('template placeholder dropped', cleanSkillList(['[List mandatory skills]', 'Java']), ['Java']);
eq('bullet glyph stripped', cleanSkillList(['- Selenium', '* TestNG']), ['Selenium', 'TestNG']);
eq('numbering stripped', cleanSkillList(['1. Java', '2) Python']), ['Java', 'Python']);
eq('section header dropped', cleanSkillList(['Mandatory Skills:', 'Java']), ['Java']);
eq('reasoning prose dropped',
  cleanSkillList(['Wait, I need to check the JD again', 'Java']), ['Java']);
eq('long sentence dropped',
  cleanSkillList(['The candidate should have a deep understanding of distributed systems design', 'Java']), ['Java']);
eq('duplicates collapsed case-insensitively', cleanSkillList(['Java', 'java', 'JAVA']), ['Java']);
eq('CI/CD survives punctuation cleanup', cleanSkillList(['CI/CD Pipelines']), ['CI/CD Pipelines']);
eq('trailing punctuation trimmed', cleanSkillList(['Java,', 'Python.']), ['Java', 'Python']);
eq('non-alphabetic entry dropped', cleanSkillList(['5+', '---', 'Java']), ['Java']);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
