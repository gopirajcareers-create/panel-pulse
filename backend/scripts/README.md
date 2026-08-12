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

### test_json_repair.js

**Purpose:** Pin the JSON repair layer (`src/services/jsonRepair.js`) that both scoring
services parse model responses through. No database or model — fixtures only.

```bash
cd backend
node scripts/test_json_repair.js
```

The scoring prompts ask the model to quote the transcript **verbatim** inside JSON
strings, so a panelist who says *the "N+1 problem"* produces an evidence string
containing a raw double quote — and an 8B model escapes it only most of the time. When it
doesn't, the string ends early and the response fails to parse with `done_reason=stop`
and a tail that *looks* complete. That failed a whole real evaluation. Since scoring pins
`seed` and `temperature: 0`, a retry returns byte-identical broken output, so repair —
not retry — is the only recovery.

The important cases here are the **negative** ones: repair must never turn a valid
response into a *different* valid response, and a truncated response must still fail
rather than be silently completed. A repair that quietly changes correct output is worse
than a failed parse, because it scores.

**Run it after touching `jsonRepair.js` or either scoring prompt's rule 2.**

---

### test_pipeline_identity.js

**Purpose:** Pin how a pipeline record is identified. No database or model — an
in-process collection stub models the one Mongo behaviour this turns on.

```bash
cd backend
node scripts/test_pipeline_identity.js
```

`pipeline_evaluations` is keyed by `(jobId, candidateName)` with **no unique index**, and
Mongo matches strings byte-for-byte unless given a collation. Stage 2/3 used to
`findOne` on an exact match and then write with `upsert: true`, so a name re-typed as
`dhanapalan c` missed the screened document and **inserted a second one** holding only
that stage. That is the escalated bug: one dashboard row with the screening and no L1,
another with L1 and no screening, and *"JD Not Found"* at Stage 3 because the record
being scored really had no JD.

The test asserts the old behaviour still splits (so the regression is legible) and that
`services/pipelineIdentity` now resolves every case/whitespace variant to the one
screened record, keeps accented names distinct, and never re-creates a vanished record.

**Run it after touching `services/pipelineIdentity.js` or any stage write in
`routes/pipeline.js`.** Splitting a candidate's pipeline is invisible until Stage 3.

---

### merge_split_pipelines.js

**Purpose:** Repair records already split into two documents by the old upsert.
**Dry run by default** — pass `--write` to apply.

```bash
node scripts/merge_split_pipelines.js            # preview every merge
node scripts/merge_split_pipelines.js --write
```

The code fix stops new splits; it does not heal stored ones. This groups documents by
folded identity, keeps the one holding the screening (the JD and resume every later
stage is scored against), adopts each stage from whichever document completed it,
recomputes `completedStages` from the merged stages, and deletes the loser only after
the survivor's update succeeds. A duplicate completed stage is preserved under
`mergeAudit.discarded` rather than dropped, following `appendScreeningHistory`.

**What it refuses:** a group where *no* document has a usable Stage 1 is reported, not
merged — its L1/L2 scores were produced against Stage 3's old placeholder JD, so it
needs Stage 1 run and the stages re-scored. That is a judgement call.

Idempotent, so re-running is safe. Note which database `.env` points at — the script
prints it, because it is the one script here that **deletes** documents.

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

### backfill_rubric.js

**Purpose:** Re-derive **every** stored L1/L2 score under the current rubric and write
it back, so one dashboard column stops mixing two rubrics.
**Dry run by default** — pass `--write` to persist.

```bash
node scripts/backfill_rubric.js --stage l1            # preview the deltas
node scripts/backfill_rubric.js --stage both --write
```

- `--stage l1|l2|both` (default `l1`)
- `--verbose` also lists the records that were already current.

**Why it needs no LLM call:** scores derive from stored evidence in code, so the whole
collection re-derives in one pass. That is the difference from `rescore.js`, which
re-runs the *model* for one candidate — right for "did the evidence change?", far too
slow for "make the column comparable".

**What it does not fix:** it corrects for **rubric** changes only. A record whose
evidence was under-reported by an older *prompt* or a different model stays
under-reported — that needs `rescore.js`. Records carrying no tagged evidence (scored
before the tier rubric) are skipped and listed rather than written as 0.0.

Prior scores, their `rubric_version` and model provenance are appended to
`stage2.history` / `stage3.history` before the overwrite, following the same convention
as Stage 1's `appendScreeningHistory` — "the score changed" cannot be answered after
overwriting the number being complained about. Re-running is idempotent: a record
already at the current rubric whose score does not move is left untouched.

Run `score_distribution.js` first to see the shape of the change, and note which
database `.env` points at — the script prints it, because prod and dev share the
collection name.

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
