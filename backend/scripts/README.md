# Backend Maintenance Scripts

This directory contains utility scripts for database maintenance and backfilling operations.

## Scoring Scripts

### test_evidence_tiers.js / test_l2_tiers.js

**Purpose:** Pin the evidence-tier rubric. No database or model needed — pure functions
over fixtures, so they run in about a second.

```bash
cd backend
node scripts/test_evidence_tiers.js   # shared tier ladder, topic dedup, depth detection
node scripts/test_l2_tiers.js         # L2's 8 dimensions, coarse grids, handoff cap
```

The tier boundaries are a product decision, not an implementation detail. If someone
changes what "2 evidences" is worth, these should be the first thing that fails.

---

### test_context_budget.js

**Purpose:** Prove a worst-case scoring prompt still fits the context window. No
database or model — it builds the real prompts with every input at its cap and checks
the estimate against the same budget `llmClient`'s pre-flight guard uses.

```bash
cd backend
node scripts/test_context_budget.js
```

That guard has already fired on a real interview. The transcript cap used to be a
literal `28000`, hand-derived from `num_ctx` and `num_predict`; when `num_predict` rose
3000 → 4000 for the tier-scoring evidence objects, the input budget shrank by 1000
tokens, the literal did not move, and a 36085-char transcript failed outright with
*"~12653 estimated tokens but only 12384 available"*. The caps are computed from
`promptCharBudget()` now, but they are computed from a **measured** overhead constant
(`PROMPT_RESERVE_CHARS`) that goes stale the moment someone adds a paragraph to a system
prompt. This re-measures on every run.

**Run it after editing any scoring prompt, any JSON skeleton, or `maxTokens`.** It is
fast and needs no infrastructure, so there is no reason not to.

---

### rescore.js

**Purpose:** Re-score one stored evaluation and diff it against the score on record.
**Read-only unless you pass `--write`**, so a rubric change can be measured before
anything is persisted.

```bash
node scripts/rescore.js --job JD1005 --candidate Mathews --audit
node scripts/rescore.js --job JD1005 --candidate Mathews --stage l2 --write
```

- `--stage l1|l2` (default `l1`)
- `--audit` prints how each score was derived: the counted topics, depth-probing
  subjects, follow-up chains, and the reason full marks were withheld.
- `--write` persists to `stage2.evaluation` / `stage3.evaluation`.

Use `--audit` when a panel disputes a score: it shows the exact quotes each dimension
was counted from, so the number can be recomputed by hand.

---

### verify_determinism.js

**Purpose:** Prove identical input still produces an identical score. Calls the real
model against a real stored record; writes nothing.

```bash
node scripts/verify_determinism.js              # L1 and L2, cold + warm
node scripts/verify_determinism.js --stage l2
```

It **unloads the model** between runs on purpose. Seed and temperature 0 are not
sufficient by themselves: the first generation after a model load diverges from every
later one, which moved a real L2 record between 8.0 and 9.0 depending only on whether
the model happened to already be resident. `llmClient` warms the model before every
seeded call to remove that, and this is what verifies it end to end.

Run it after any change to a scoring prompt, to `llmClient`, or after the Ollama host
is upgraded or restarted. Takes several minutes — it deliberately pays cold-start cost
multiple times.

---

## Moderation Data Scripts

### check-moderation-status.js

**Purpose:** Diagnose how many evaluations have moderation data.

**Usage:**
```bash
cd backend
node scripts/check-moderation-status.js
```

**Output:**
- Total evaluation count
- Count with/without moderation data
- Sample records from both categories
- Coverage percentage

**When to use:**
- Before running the backfill script
- To verify the backfill was successful
- To monitor moderation data coverage

---

### backfill-moderation.js

**Purpose:** Analyze existing evaluations and add moderation data.

**Usage:**
```bash
cd backend
node scripts/backfill-moderation.js
```

**What it does:**
1. Finds all evaluations without moderation data
2. Runs moderation analysis on each transcript
3. Updates the database with results
4. Shows a summary at the end

**Important notes:**
- Adds a 1-second delay between requests to avoid rate limiting
- Only processes evaluations that have a transcript
- Sets `moderation_backfilled: true` flag for tracking
- Can be safely re-run (skips already-processed records)

**Rate Limiting:**
- Uses LLM API (Ollama/GROQ/Mistral)
- May take time for large datasets
- Respect API rate limits

---

## Running in Production

### Quick Diagnostic Flow

1. **Check current status:**
   ```bash
   node scripts/check-moderation-status.js
   ```

2. **If missing data, run backfill:**
   ```bash
   node scripts/backfill-moderation.js
   ```

3. **Verify results:**
   ```bash
   node scripts/check-moderation-status.js
   ```

### Environment Requirements

These scripts require:
- MongoDB connection (uses existing `mongoClient.js`)
- LLM API access (Ollama/GROQ/Mistral configured in `.env`)
- Node.js environment

Make sure your `.env` file has:
```
MONGO_URI=mongodb://...
OLLAMA_BASE_URL=...
GROQ_API_KEY=...
```

---

## Troubleshooting

### "Moderation analysis not available"

**Cause:** Database records created before moderation feature was added don't have the `moderation` field.

**Fix:** Run the backfill script.

### Rate Limit Errors

**Cause:** LLM API rate limiting.

**Fix:** 
- Wait and retry
- Increase delay in backfill script (line with `setTimeout`)
- Process in smaller batches

### Script Hangs

**Cause:** MongoDB connection issue or timeout.

**Fix:**
- Check `MONGO_URI` in `.env`
- Verify database is accessible
- Check network connectivity

---

## Adding New Scripts

When adding new maintenance scripts:

1. Place them in this directory
2. Use the existing service modules (`mongoClient`, etc.)
3. Add clear console output with emojis for readability
4. Handle errors gracefully
5. Document usage in this README
