/**
 * JD skill-extraction parse checks. No test runner in backend/, so this is a plain script:
 *   node scripts/test_jd_skill_parse.js      (exit 0 = pass)
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * Stage 1 failed with "No skills could be extracted from the JD, and no AI suggestions
 * were produced" on SOME uploads and not others, with no pattern visible from the UI.
 *
 * The cause was not the JDs. jdAnalyzerService asks for one skill per line under three
 * headers, and the parser accepted only that exact shape — headers ending in a literal
 * colon, bodies split on newlines alone. The model does not answer identically for every
 * JD. Measured on the real JD.csv row 1 (Account Manager) at seed 42 / temperature 0, it
 * answers:
 *
 *   Mandatory Skills:
 *   [Client Relationship Management, Account Growth & Business Development, ...]
 *
 * — one bracketed comma-joined line. Newline-splitting made that a single 600-char
 * "skill", which cleanSkillList then dropped as both a bracketed placeholder and as
 * over-length. All three buckets emptied, and Stage 1 threw.
 *
 * That explains "few records only" exactly: the answer SHAPE varies by JD and is stable
 * per JD, because the call is seeded. A JD that fails fails every retry, forever.
 *
 * These cases pin the shapes that must survive the parser. Adding a filter that
 * re-breaks one of them should fail here before it reaches a recruiter.
 */
'use strict';

const { _parseAnalysisResponse } = require('../src/services/jdAnalyzerService');
const { cleanSkillList, MAX_SKILL_CHARS, MAX_SKILL_WORDS } = require('../src/services/screeningService');

let failures = 0;

function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Run a raw model response through the full parse + clean path Stage 1 uses. */
function pipeline(raw) {
  const p = _parseAnalysisResponse(raw);
  return {
    mandatory: cleanSkillList(p.mandatory_skills),
    goodToHave: cleanSkillList(p.good_to_have_skills),
    ai: cleanSkillList(p.key_skills),
    unstructured: Boolean(p.unstructured_response),
  };
}

/**
 * Stage 1 throws when mandatory AND good-to-have both end up empty; AI-suggested skills
 * are promoted into mandatory when the JD states none. Mirrors resolveSkills.
 */
function wouldThrow(r) {
  const mandatory = r.mandatory.length === 0 && r.ai.length > 0 ? r.ai : r.mandatory;
  return mandatory.length === 0 && r.goodToHave.length === 0;
}

function screenable(label, raw, expectContains = []) {
  const r = pipeline(raw);
  const ok = !wouldThrow(r);
  check(label, ok, ok
    ? `mand=${r.mandatory.length} gth=${r.goodToHave.length} ai=${r.ai.length}`
    : 'Stage 1 would throw "No skills could be extracted"');
  for (const want of expectContains) {
    const all = [...r.mandatory, ...r.goodToHave, ...r.ai].map(s => s.toLowerCase());
    check(`  ↳ extracted "${want}"`, all.some(s => s.includes(want.toLowerCase())),
      all.length ? `got ${JSON.stringify(all.slice(0, 6))}` : 'nothing extracted');
  }
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('=== the reported bug: one bracketed comma-joined line ===');
// Verbatim from qwen3:latest on JD.csv row 1, seed 42, temperature 0.
screenable(
  'bracketed comma list is split into skills',
  `Mandatory Skills:
[Client Relationship Management, Account Growth & Business Development, Internal Collaboration, Strong relationship management and communication skills, Understanding of enterprise IT service areas, Strong business acumen with financial management awareness]

Good To Have Skills:
[]

AI Suggested Skills:
[Strategic thinking, Stakeholder management, Cross-functional collaboration, Financial analysis]`,
  ['Client Relationship Management', 'Strategic thinking', 'Stakeholder management'],
);

console.log('\n=== header spellings the model actually varies ===');
screenable('plain colon headers, one per line',
  `Mandatory Skills:\n- Java\n- Spring Boot\n\nGood To Have Skills:\n- Docker\n\nAI Suggested Skills:\n- SQL`,
  ['Java', 'Spring Boot', 'Docker']);

screenable('markdown ### headers with no colon',
  `### Mandatory Skills\n- Java\n\n### Good To Have Skills\n- Docker\n\n### AI Suggested Skills\n- REST APIs`,
  ['Java', 'Docker']);

screenable('bold **headers:**',
  `**Mandatory Skills:**\n- Java\n\n**Good To Have Skills:**\n- Docker\n\n**AI Suggested Skills:**\n- SQL`,
  ['Java', 'Docker']);

screenable('hyphenated "AI-Suggested Skills"',
  `Mandatory Skills:\nNone\n\nGood To Have Skills:\nNone\n\nAI-Suggested Skills:\n- Account Management\n- Negotiation`,
  ['Account Management', 'Negotiation']);

screenable('comma-separated with no brackets',
  `Mandatory Skills:\nJava, Spring Boot, Microservices, Kafka\n\nGood To Have Skills:\nTerraform, Jenkins\n\nAI Suggested Skills:\nSystem Design`,
  ['Microservices', 'Terraform']);

screenable('numbered list',
  `Mandatory Skills:\n1. Java\n2. Spring Boot\n\nGood To Have Skills:\n\nAI Suggested Skills:\n1. SQL`,
  ['Java', 'Spring Boot']);

console.log('\n=== competency phrasing (non-technical JDs) ===');
// The other half of the bug: an 8-word cap tuned on "Spring Boot" dropped every
// requirement an Account Manager JD states, emptying the buckets a second way.
{
  const r = screenable('multi-word competencies survive the word cap',
    `Mandatory Skills:
- Strong business acumen with financial management awareness
- Ability to manage multiple stakeholders and priorities
- Proficiency in preparing proposals, RFX responses, and presentations

Good To Have Skills:
None

AI Suggested Skills:
- Stakeholder management`);
  check('  ↳ kept the 7-word competency', r.mandatory.some(s => /business acumen/i.test(s)),
    JSON.stringify(r.mandatory));
}

console.log('\n=== a bullet delimits; a comma inside a bulleted line does not ===');
// The two shapes want opposite treatment of commas, and getting this backwards is not
// harmless: splitting a bulleted competency into fragments creates rows like the bare
// word "presentations" that no resume can match, and every one drags matchScore down.
{
  const r = pipeline(`Mandatory Skills:
- Proficiency in preparing proposals, RFX responses, and presentations
- Operational, Hiring and Delivery Management`);
  check('a bulleted line stays ONE skill despite internal commas',
    r.mandatory.length === 2, `got ${r.mandatory.length}: ${JSON.stringify(r.mandatory)}`);
  check('  ↳ no bare fragment row was created',
    !r.mandatory.includes('presentations'), JSON.stringify(r.mandatory));
}
{
  // Without a bullet, the comma is the only delimiter present, so it must be honoured.
  const r = pipeline(`Mandatory Skills:\nJava, Spring Boot, Kafka`);
  check('an UNbulleted line is comma-split',
    r.mandatory.length === 3, JSON.stringify(r.mandatory));
}

console.log('\n=== noise that must still be rejected ===');
{
  const r = pipeline(`Mandatory Skills:\n[List mandatory skills]\n\nGood To Have Skills:\n[List nice-to-have skills]\n\nAI Suggested Skills:\n[List top 5 AI-recommended mandatory skills]`);
  check('template placeholders are discarded',
    r.mandatory.length === 0 && r.goodToHave.length === 0 && r.ai.length === 0,
    JSON.stringify([r.mandatory, r.goodToHave, r.ai]));
}
{
  const r = pipeline(`Mandatory Skills:\nNone\n\nGood To Have Skills:\nN/A\n\nAI Suggested Skills:\n- Java`);
  check('"None" / "N/A" are not scored as skills',
    r.mandatory.length === 0 && r.goodToHave.length === 0,
    `mand=${JSON.stringify(r.mandatory)} gth=${JSON.stringify(r.goodToHave)}`);
  check('  ↳ but the real AI skill survives', r.ai.includes('Java'), JSON.stringify(r.ai));
}
{
  // qwen3 reasoning leaking into the answer. think:false suppresses it; this is the belt.
  const r = pipeline(`Mandatory Skills:
- Wait, the JD does not say mandatory anywhere
- Java
- I need to check the responsibilities section again`);
  check('model narration is dropped, real skill kept',
    r.mandatory.includes('Java') && r.mandatory.length === 1, JSON.stringify(r.mandatory));
}
{
  const r = pipeline('Okay, let me read through this job description carefully. The role is for an Account Manager and I need to look for the exact words mandatory or required before I answer.');
  check('a response with no headers is flagged unstructured', r.unstructured === true);
  check('  ↳ and yields no invented skills',
    r.mandatory.length === 0 && r.goodToHave.length === 0 && r.ai.length === 0);
}

console.log('\n=== the three empty cases are told apart ===');
// All three end in the same "nothing to score against" refusal, but they need OPPOSITE
// advice: retry / upload a fuller JD / check the extracted text. One message for all
// three is what told users to fix a JD that was already correct.
{
  const r = _parseAnalysisResponse('JD is very short, need more info on the JD');
  check('the documented "very short" refusal is insufficient_jd, NOT a model failure',
    r.insufficient_jd === true && !r.unstructured_response,
    `insufficient_jd=${r.insufficient_jd} unstructured=${r.unstructured_response}`);
}
{
  const r = _parseAnalysisResponse('Sure! Here is my analysis of the role you provided.');
  check('genuine narration is unstructured_response, not insufficient_jd',
    r.unstructured_response === true && !r.insufficient_jd,
    `insufficient_jd=${r.insufficient_jd} unstructured=${r.unstructured_response}`);
}
{
  const r = _parseAnalysisResponse('Mandatory Skills:\n- None\n\nGood To Have Skills:\n- None\n\nAI Suggested Skills:\n- None');
  check('headers present but all empty is NEITHER flag (a real empty result)',
    !r.unstructured_response && !r.insufficient_jd,
    `insufficient_jd=${r.insufficient_jd} unstructured=${r.unstructured_response}`);
}

console.log('\n=== caps stay internally consistent ===');
// cleanSkillList applies a word cap AND a char cap. If the char cap binds first for
// ordinary English, raising the word cap achieves nothing — which is how the original
// 8-word / 80-char pair came to drop every requirement on a competency-phrased JD.
//
// The bound is checked at a REALISTIC average word length, not a worst case: a 14-word
// phrase of 10-letter words is prose, and the char cap rejecting it is correct. English
// competency phrasing runs ~6-7 chars a word ("Strong business acumen with financial
// management awareness" = 7 words, 56 chars).
{
  const AVG_WORD_CHARS = 7;
  const needed = MAX_SKILL_WORDS * (AVG_WORD_CHARS + 1) - 1;
  check(`a ${MAX_SKILL_WORDS}-word phrase at ${AVG_WORD_CHARS} chars/word fits the char cap`,
    needed <= MAX_SKILL_CHARS,
    `needs ${needed} chars, MAX_SKILL_CHARS=${MAX_SKILL_CHARS}`);
}
{
  // The real phrases from the JD that triggered this bug must survive both caps.
  const REAL = [
    'Strong business acumen with financial management awareness',
    'Ability to manage multiple stakeholders and priorities',
    'Problem-solving mindset with the ability to handle escalations diplomatically',
    'Proven experience in IT services or delivery management',
    'Understanding of enterprise IT service areas',
  ];
  const kept = cleanSkillList(REAL);
  check('every real competency from the failing JD survives both caps',
    kept.length === REAL.length,
    `kept ${kept.length}/${REAL.length}${kept.length < REAL.length
      ? ` — dropped ${JSON.stringify(REAL.filter(s => !kept.includes(s)))}` : ''}`);
}
{
  const over = Array.from({ length: MAX_SKILL_WORDS + 6 }, () => 'word').join(' ');
  check('prose well past the word cap is still rejected',
    cleanSkillList([over]).length === 0);
}

console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
