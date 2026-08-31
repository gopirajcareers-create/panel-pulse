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
  normalizeForMatch, significantTokens, gradeOf, GRADE_CREDIT,
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
const grade = (row, skill) => deriveTier(row, skill, RESUME).grade;
const credit = (row, skill) => deriveTier(row, skill, RESUME).credit;

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

// ── Grades within PARTIAL ──────────────────────────────────────────────────────
// One flat 0.5 for every partial made "named, on a project, for three years, that the
// model merely declined to call strong" worth the same as "the skill's name appears
// nowhere and we inferred it". These pin the three bands apart.
console.log('\n=== partial grades: how much a PARTIAL is worth ===');

// The conservative-model case. Nothing about the RESUME is weak here — the model hedged
// and every check passes — so it is paid as a full match.
const hedged = { tier: 'PARTIAL', evidence: 'designed and maintained the end-to-end regression suite for 3 years using Selenium WebDriver' };
eq('hedged claim with named skill + context -> PARTIAL_HIGH', grade(hedged, 'Selenium WebDriver'), 'PARTIAL_HIGH');
eq('PARTIAL_HIGH is paid at full credit', credit(hedged, 'Selenium WebDriver'), 1);
eq('PARTIAL_HIGH keeps the coarse tier PARTIAL', tier(hedged, 'Selenium WebDriver'), 'PARTIAL');
eq('an unlowered claim is not reported as demoted',
  deriveTier(hedged, 'Selenium WebDriver', RESUME).demoted, false);

// Named, but only named.
const listed = { tier: 'STRONG', evidence: 'Java, Selenium WebDriver, TestNG, Maven' };
eq('bare skills-list mention -> PARTIAL_MID', grade(listed, 'TestNG'), 'PARTIAL_MID');
eq('PARTIAL_MID credit', credit(listed, 'TestNG'), 0.75);

// Inferred: the skill's own name is absent, so only the surrounding prose supports it.
const inferred = { tier: 'STRONG', evidence: 'Coordinated with cross-functional teams including Developers, BAs and Product Owners' };
eq('skill not named in the resume -> PARTIAL_LOW', grade(inferred, 'Communication'), 'PARTIAL_LOW');
eq('PARTIAL_LOW credit', credit(inferred, 'Communication'), 0.5);

// Both faults at once must land on the WEAKER grade, not the last one checked.
eq('unnamed AND contextless -> PARTIAL_LOW, not MID',
  grade({ tier: 'STRONG', evidence: 'Developers, BAs, Product Owners' }, 'Stakeholder Management'),
  'PARTIAL_LOW');

// A claimed PARTIAL cut to PARTIAL_LOW keeps the tier it claimed while losing half its
// credit. Reporting that as undemoted would hide the reasons on the row that needs them.
eq('a grade-only downgrade is still flagged as demoted',
  deriveTier(inferred, 'Communication', RESUME).demoted, true);
eq('every grade carries a one-line reason',
  Boolean(deriveTier(listed, 'TestNG', RESUME).gradeReason), true);

// looks_like_skills_list is computed as "list-shaped AND no context markers", so it can
// never fire alone. Pinned here because the grade table reads as though it could.
eq('list-shape never fires without the no-context check',
  looksLikeSkillsList('Java, Selenium WebDriver, TestNG, Maven') &&
  !hasContextMarkers('Java, Selenium WebDriver, TestNG, Maven'), true);

console.log('\n=== gradeOf: stored rows, including pre-grade ones ===');
eq('explicit grade is used', gradeOf({ tier: 'PARTIAL', grade: 'PARTIAL_MID', credit: 0.75 }), 'PARTIAL_MID');
// A v2 record graded every partial at 0.5, which is this rubric's LOW — so the credit
// IS the grade for those rows. Without this, re-rendering an old record shows
// "2 partial (0 high, 0 mid, 0 low)".
eq('pre-grade partial read back from its credit', gradeOf({ tier: 'PARTIAL', credit: 0.5 }), 'PARTIAL_LOW');
eq('pre-tier matched:true -> STRONG', gradeOf({ matched: true }), 'STRONG');
eq('pre-tier matched:false -> NONE', gradeOf({ matched: false }), 'NONE');
eq('STRONG needs no inference', gradeOf({ tier: 'STRONG', credit: 1 }), 'STRONG');

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
// PARTIAL_MID, not HIGH: the name is verbatim in the resume, but no reading of the
// surrounding context exists to credit — the model said the skill was absent.
eq('a promoted row is graded MID', cyTier({ tier: 'NONE', evidence: 'Not found in resume.' }, 'Cypress').grade,
  'PARTIAL_MID');
// A skill the model never examined cannot grade above LOW however plainly the resume
// names it. Nothing read the surrounding text, so there is no depth claim to credit.
eq('a skill the model never reported is graded LOW',
  deriveTier({}, 'Cypress', CYPRESS_RESUME, { reportedByModel: false }).grade,
  'PARTIAL_LOW');

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
  mandatoryRows: [
    { tier: 'STRONG', grade: 'STRONG', credit: 1 },
    { tier: 'PARTIAL', grade: 'PARTIAL_HIGH', credit: 1 },
    { tier: 'PARTIAL', grade: 'PARTIAL_MID', credit: 0.75 },
    { tier: 'PARTIAL', grade: 'PARTIAL_LOW', credit: 0.5 },
    { tier: 'NONE', grade: 'NONE', credit: 0 },
  ],
  goodToHaveRows: [{ tier: 'NONE', grade: 'NONE', credit: 0 }],
});
// "3 partial" spans 1.5 credits of range now, so the count alone cannot be reconciled
// with credit_earned — the sentence breaks the partials out by what they are worth.
eq('coverage sentence breaks partials out by credit',
  coverageSentence(cov.breakdown),
  'Mandatory: 1 strong, 3 partial (1 at full credit, 1 at 0.75, 1 at 0.5), 1 not evidenced (of 5). ' +
  'Good-to-have: 0 strong, 0 partial, 1 not evidenced (of 1).');
eq('partial census sums the three grades', cov.breakdown.mandatory.partial, 3);
eq('credit_earned matches the grades', cov.breakdown.mandatory.credit_earned, 3.25);
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
// Rows are built from the GRADE, since that is where credit comes from. 'PARTIAL' on its
// own is no longer a scoreable statement.
const row = (grade) => ({
  tier: grade === 'STRONG' ? 'STRONG' : grade === 'NONE' ? 'NONE' : 'PARTIAL',
  grade,
  credit: GRADE_CREDIT[grade],
});

eq('all strong in both buckets -> 100',
  computeMatchScore({
    mandatoryRows: [row('STRONG'), row('STRONG')],
    goodToHaveRows: [row('STRONG')],
  }).matchScore, 100);

eq('all none -> 0',
  computeMatchScore({ mandatoryRows: [row('NONE')], goodToHaveRows: [row('NONE')] }).matchScore, 0);

// The bucket weights, pinned on a case where each bucket is exactly half-earned or fully
// earned so the split is readable in the number: 80 + 10 = 90.
eq('3/3 mandatory + 1/2 good-to-have -> 90',
  computeMatchScore({
    mandatoryRows: [row('STRONG'), row('STRONG'), row('STRONG')],
    goodToHaveRows: [row('STRONG'), row('NONE')],
  }).matchScore, 90);

// Good-to-have alone must not be able to carry a candidate into Eligible. 3 of 5
// mandatory plus a flawless good-to-have list read 72% and "Eligible" under 70/30 —
// two must-have skills unevidenced. At 80/20 the same candidate reads 68%.
const gapFiller = computeMatchScore({
  mandatoryRows: [row('STRONG'), row('STRONG'), row('STRONG'), row('NONE'), row('NONE')],
  goodToHaveRows: [row('STRONG'), row('STRONG')],
});
eq('3/5 mandatory + all good-to-have -> 68, not 72', gapFiller.matchScore, 68);
eq('...and it is not Eligible', gapFiller.status, 'Partially Eligible');

// Full mandatory coverage with nothing good-to-have evidenced clears the band on its
// own. Under 70/30 that candidate sat exactly on 70, one rounding step from Partially
// Eligible — a reservation the evidence did not support.
eq('5/5 mandatory alone -> 80',
  computeMatchScore({
    mandatoryRows: [row('STRONG'), row('STRONG'), row('STRONG'), row('STRONG'), row('STRONG')],
    goodToHaveRows: [row('NONE'), row('NONE')],
  }).matchScore, 80);

// The three partial grades must produce three different scores on identical shapes.
const oneMandatory = (g) => computeMatchScore({ mandatoryRows: [row(g)], goodToHaveRows: [row('NONE')] }).matchScore;
eq('PARTIAL_HIGH scores as a full match', oneMandatory('PARTIAL_HIGH'), 80);
eq('PARTIAL_MID scores three-quarters', oneMandatory('PARTIAL_MID'), 60);
eq('PARTIAL_LOW scores half', oneMandatory('PARTIAL_LOW'), 40);
eq('NONE scores nothing', oneMandatory('NONE'), 0);

console.log('\n=== empty-bucket weight redistribution ===');
const noGth = computeMatchScore({ mandatoryRows: [row('STRONG'), row('STRONG')], goodToHaveRows: [] });
eq('no good-to-have skills -> mandatory carries 100', noGth.matchScore, 100);
eq('redistribution flagged', noGth.breakdown.weights_redistributed, true);
eq('mandatory weight raised to 100', noGth.breakdown.mandatory.weight, 100);

const noMandatory = computeMatchScore({ mandatoryRows: [], goodToHaveRows: [row('PARTIAL_LOW')] });
eq('good-to-have alone carries 100', noMandatory.matchScore, 50);

const nothing = computeMatchScore({ mandatoryRows: [], goodToHaveRows: [] });
eq('no skills at all -> null score', nothing.matchScore, null);
eq('no skills at all -> Not Screenable', nothing.status, 'Not Screenable');

console.log('\n=== status bands derive from the score, never independently ===');
const status = (m, g) => computeMatchScore({ mandatoryRows: m, goodToHaveRows: g }).status;
eq('100 -> Eligible', status([row('STRONG')], [row('STRONG')]), 'Eligible');
eq('80 -> Eligible', status([row('STRONG')], [row('NONE')]), 'Eligible');
eq('70 -> Eligible (boundary)', status([row('PARTIAL_MID')], [row('PARTIAL_HIGH')]), 'Eligible');
eq('60 -> Partially Eligible', status([row('PARTIAL_MID')], [row('NONE')]), 'Partially Eligible');
eq('40 -> Partially Eligible (boundary)', status([row('PARTIAL_LOW')], [row('NONE')]), 'Partially Eligible');
eq('20 -> Ineligible', status([row('NONE')], [row('STRONG')]), 'Ineligible');
eq('0 -> Ineligible', status([row('NONE')], [row('NONE')]), 'Ineligible');

console.log('\n=== breakdown is auditable by hand ===');
const audited = computeMatchScore({
  mandatoryRows: [row('STRONG'), row('PARTIAL_MID'), row('PARTIAL_LOW'), row('NONE')],
  goodToHaveRows: [row('STRONG')],
});
eq('mandatory credit summed', audited.breakdown.mandatory.credit_earned, 2.25);
eq('tier census: strong', audited.breakdown.mandatory.strong, 1);
eq('tier census: partial', audited.breakdown.mandatory.partial, 2);
eq('grade census: high', audited.breakdown.mandatory.partial_high, 0);
eq('grade census: mid', audited.breakdown.mandatory.partial_mid, 1);
eq('grade census: low', audited.breakdown.mandatory.partial_low, 1);
eq('tier census: none', audited.breakdown.mandatory.none, 1);
eq('bucket points recorded', audited.breakdown.mandatory.points, 45);
eq('formula states the arithmetic',
  audited.breakdown.formula, 'mandatory 2.25/4 x 80 + good-to-have 1.00/1 x 20 = 65.0%');
eq('formula matches the score', audited.matchScore, 65);

// Rows stored before graded partials carry no `grade`, so the census has to be inferred
// from their credit or an old record re-renders as "1 partial (0 high, 0 mid, 0 low)".
const legacy = computeMatchScore({
  mandatoryRows: [{ tier: 'STRONG', credit: 1 }, { tier: 'PARTIAL', credit: 0.5 }],
  goodToHaveRows: [{ matched: false }],
});
eq('pre-grade rows still produce a census that adds up',
  [legacy.breakdown.mandatory.partial, legacy.breakdown.mandatory.partial_low], [1, 1]);

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
