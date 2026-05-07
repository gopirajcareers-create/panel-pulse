# Backend Maintenance Scripts

This directory contains utility scripts for database maintenance and backfilling operations.

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
