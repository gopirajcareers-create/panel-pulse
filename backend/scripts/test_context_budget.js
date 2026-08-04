/**
 * Prove a WORST-CASE scoring prompt fits the context window.
 *
 *   node scripts/test_context_budget.js
 *
 * No database, no model — it builds the real prompts from the real services with every
 * input at its cap and checks the token estimate against the same budget llmClient's
 * pre-flight guard uses.
 *
 * This exists because that guard already fired on a real interview. The transcript cap
 * was a literal 28000 derived by hand from num_ctx and num_predict; when num_predict
 * rose 3000 -> 4000 for the tier-scoring evidence objects the input budget shrank by
 * 1000 tokens, the literal did not move, and a 36085-char transcript failed with
 * "~12653 estimated tokens but only 12384 available". The caps are computed now, but
 * they are computed from a MEASURED overhead constant (PROMPT_RESERVE_CHARS), and a
 * measured constant goes stale the moment someone adds a paragraph to a system prompt.
 * That is what this catches: it re-measures on every run.
 */
'use strict';

const screening = require('../src/services/screeningService');
const l1 = require('../src/services/l1ScoringService');
const l2 = require('../src/services/l2ScoringService');
const { NUM_CTX, CHARS_PER_TOKEN, promptCharBudget } = require('../src/services/llmClient');

let failures = 0;
function assert(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Mirrors llmClient._estimateTokens: sum of message chars / CHARS_PER_TOKEN. */
function estimateTokens(system, user) {
  return Math.ceil((system.length + user.length) / CHARS_PER_TOKEN);
}

const filler = (n, word) => (word + ' ').repeat(Math.ceil(n / (word.length + 1))).slice(0, n);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`Context: num_ctx=${NUM_CTX} chars_per_token=${CHARS_PER_TOKEN}\n`);

// A skill name at cleanSkillList's upper bound (80 chars), repeated to the per-bucket
// cap. The screening prompt enumerates each skill TWICE — once as a numbered list and
// once as a JSON row skeleton — so the skill lists are a real part of the overhead, not
// a rounding error, and PROMPT_RESERVE_CHARS has to cover them.
const worstCaseSkills = (n, word) => Array.from({ length: n }, (_, i) => ({
  skill: `${filler(76, word)} ${String(i).padStart(2, '0')}`.slice(0, 80),
  source: 'jd',
}));

const STAGES = [
  {
    label: 'Screening (Stage 1)',
    service: 'screeningService',
    outputTokens: screening.MAX_OUTPUT_TOKENS,
    system: screening.SCREENING_SYSTEM_PROMPT,
    build: () => screening._buildScreeningPrompt(
      filler(screening.MAX_JD_CHARS + 5000, 'requirement'),
      filler(screening.MAX_RESUME_CHARS + 5000, 'experience'),
      worstCaseSkills(screening.MAX_SKILLS_PER_BUCKET, 'mandatory'),
      worstCaseSkills(screening.MAX_SKILLS_PER_BUCKET, 'preferred'),
    ),
    caps: { resume: screening.MAX_RESUME_CHARS, jd: screening.MAX_JD_CHARS },
  },
  {
    label: 'L1',
    service: 'l1ScoringService',
    outputTokens: l1.MAX_OUTPUT_TOKENS,
    system: l1.L1_SCORING_SYSTEM_PROMPT,
    // Every input at its cap, and the transcript OVER its cap so the truncation path
    // is the one measured — that is the path a long real interview takes.
    build: () => l1._buildScoringPrompt(
      'JD9999',
      filler(l1.MAX_JD_CHARS + 5000, 'requirement'),
      filler(l1.MAX_RESUME_CHARS + 5000, 'experience'),
      filler(l1.MAX_TRANSCRIPT_CHARS + 20000, 'Panelist 0:01: how would you handle that'),
    ),
    caps: { transcript: l1.MAX_TRANSCRIPT_CHARS },
  },
  {
    label: 'L2',
    service: 'l2ScoringService',
    outputTokens: l2.MAX_OUTPUT_TOKENS,
    system: l2.L2_SCORING_SYSTEM_PROMPT,
    build: () => l2._buildScoringPrompt(
      'JD9999',
      filler(l2.MAX_JD_CHARS + 5000, 'requirement'),
      filler(l2.MAX_RESUME_CHARS + 5000, 'experience'),
      filler(l2.MAX_L1_CONTEXT_CHARS + 20000, 'L1 0:01: what does that mean'),
      filler(l2.MAX_L2_TRANSCRIPT_CHARS + 20000, 'Panelist 0:01: why did you choose that'),
    ),
    caps: { l2Transcript: l2.MAX_L2_TRANSCRIPT_CHARS, l1Context: l2.MAX_L1_CONTEXT_CHARS },
  },
];

for (const stage of STAGES) {
  console.log(`═══ ${stage.label} ═══`);
  console.log(`  caps: ${JSON.stringify(stage.caps)}`);

  const user = stage.build();
  const budget = NUM_CTX - stage.outputTokens;
  const estimated = estimateTokens(stage.system, user);
  const headroom = budget - estimated;

  console.log(`  system=${stage.system.length} user=${user.length} chars ` +
    `=> ~${estimated} tokens vs ${budget} budget (num_predict=${stage.outputTokens})`);

  assert(`worst-case prompt fits the input budget`, estimated <= budget,
    `~${estimated} tokens, budget ${budget}, headroom ${headroom}`);

  // A prompt that only just fits is a prompt that stops fitting on the next edit.
  // The threshold is ABSOLUTE, not a share of the window: headroom is
  // (PROMPT_RESERVE_CHARS - actual overhead), which does not grow when num_ctx does.
  // 750 tokens ≈ 2400 chars ≈ a page of new instructions added to a system prompt.
  const MIN_HEADROOM_TOKENS = 750;
  assert(`at least ${MIN_HEADROOM_TOKENS} tokens of headroom for future prompt edits`,
    headroom >= MIN_HEADROOM_TOKENS,
    headroom >= MIN_HEADROOM_TOKENS ? `${headroom} tokens spare`
      : `only ${headroom} tokens spare — raise PROMPT_RESERVE_CHARS in ${stage.service}`);

  // The capped inputs should get the bulk of the window. If overhead has grown enough
  // to dominate, the reserve is wrong even when the total still fits.
  const capChars = Object.values(stage.caps).reduce((a, b) => a + b, 0);
  assert(`input caps are a usable size (${capChars} chars)`, capChars >= 10000,
    `${capChars} chars of scorable input`);

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// promptCharBudget itself: the arithmetic every cap above depends on.
console.log('═══ promptCharBudget ═══');
assert('budget shrinks as the output budget grows',
  promptCharBudget(4000) < promptCharBudget(3000));
assert('reserve is subtracted from the char budget',
  promptCharBudget(4000, { reserveChars: 1000 }) === promptCharBudget(4000) - 1000);
assert('a larger window yields a larger budget',
  promptCharBudget(4000, { numCtx: 40960 }) > promptCharBudget(4000, { numCtx: 16384 }));
assert('never negative when the reserve exceeds the window',
  promptCharBudget(4000, { reserveChars: 10_000_000 }) === 0);
// The regression itself: a cap taken from promptCharBudget must survive the guard.
{
  const chars = promptCharBudget(4000);
  assert('a full-budget prompt does not trip the pre-flight guard',
    Math.ceil(chars / CHARS_PER_TOKEN) <= NUM_CTX - 4000,
    `${chars} chars => ~${Math.ceil(chars / CHARS_PER_TOKEN)} tokens vs ${NUM_CTX - 4000}`);
}

console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
