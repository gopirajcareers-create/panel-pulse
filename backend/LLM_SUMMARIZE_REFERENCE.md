# LLM Summarization API - Quick Reference

## Endpoint

```
POST /api/v1/search/summarize
```

## Quick Test

**Minimal request:**
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Python",
    "results": [{"id": "1", "Transcript": "Python content here"}]
  }'
```

## Request Body

```json
{
  "query": "string",                    // Required
  "results": [Array],                   // Required
  "summary_type": "brief",              // Optional (default: brief)
  "summary_length": "medium",           // Optional (default: medium)
  "include_key_points": true,           // Optional (default: true)
  "include_recommendations": false,     // Optional (default: false)
  "combined_summary": true              // Optional (default: true)
}
```

## Summary Type Options

| Option | Use Case | Description |
|--------|----------|-------------|
| `brief` | Quick overview | Concise main points only |
| `detailed` | Full context | All key information included |
| `executive` | Decision making | Optimized for leadership |

## Summary Length Options

| Option | Limit | Use Case |
|--------|-------|----------|
| `short` | 100-150 words | Headlines & quick ref |
| `medium` | 200-300 words | General purpose |
| `long` | 400-600 words | Comprehensive review |

## Response

```json
{
  "success": true,
  "query": "...",
  "summaries": [
    {
      "result_id": "...",
      "result_title": "...",
      "summary": "The summarized text...",
      "length_estimate": "medium"
    }
  ]
}
```

## Example Scenarios

### Scenario 1: Quick Candidate Review
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "candidate skills",
    "results": [search_results],
    "summary_type": "brief",
    "summary_length": "short",
    "combined_summary": false
  }'
```

### Scenario 2: Candidate Comparison
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "React developers",
    "results": [multiple_results],
    "summary_type": "detailed",
    "summary_length": "medium",
    "combined_summary": true,
    "include_key_points": true
  }'
```

### Scenario 3: Executive Summary
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "interview findings",
    "results": [results],
    "summary_type": "executive",
    "summary_length": "medium",
    "include_recommendations": true
  }'
```

## Combined vs Individual

**Combined (Default)**
- Single synthesis across all results
- Best for: Overview, comparison
- Use: `combined_summary: true`

**Individual**
- Separate summary for each result
- Best for: Detailed review
- Use: `combined_summary: false`

## Error Codes

| Status | Error | Fix |
|--------|-------|-----|
| 400 | Missing query | Add `query` parameter |
| 400 | Invalid results | Ensure `results` is non-empty array |
| 400 | Invalid type | Use: brief, detailed, executive |
| 400 | Invalid length | Use: short, medium, long |
| 503 | LLM unavailable | Set `GROQ_API_KEY` in .env |
| 503 | API error | Check GROQ account limits |
| 500 | Summarize failed | Check response format |

## Response Structure

### Individual Summary
```json
{
  "result_id": "doc_id",
  "result_title": "John Doe",
  "summary": "...",
  "length_estimate": "medium",
  "timestamp": "..."
}
```

### Combined Summary
```json
{
  "combined_summary": true,
  "results_count": 3,
  "result_ids": ["1", "2", "3"],
  "summary": "...",
  "length_estimate": "medium"
}
```

## Configuration

```bash
# Required in .env:
GROQ_API_KEY=your_key_here
GROQ_MODEL_NAME=llama-3.3-70b-versatile
```

## Performance

- **Latency**: 2-15 seconds
- **Timeout**: 30 seconds
- **Retries**: 3 attempts with backoff
- **Max results**: 10 per request

## Common Parameters

```bash
# Default (balanced)
{
  "summary_type": "brief",           # quick
  "summary_length": "medium",        # balanced
  "include_key_points": true,        # helpful
  "combined_summary": true           # overview
}

# Executive focused
{
  "summary_type": "executive",
  "summary_length": "medium",
  "include_recommendations": true,
  "combined_summary": true
}

# Detailed individual
{
  "summary_type": "detailed",
  "summary_length": "long",
  "include_key_points": true,
  "combined_summary": false
}
```

## Tips

1. Use `brief` for quick review
2. Use `detailed` for full context
3. Use `executive` for decision-making
4. `combined_summary: true` for overview
5. `combined_summary: false` for comparison
6. Enable `include_key_points` for clarity
7. Enable `include_recommendations` for actions

## Complete Workflow

```bash
# 1. Search
SEARCH=$(curl "http://localhost:3000/api/v1/search/hybrid?q=Python&limit=5")

# 2. Extract results
RESULTS=$(echo $SEARCH | jq '.results')

# 3. Summarize
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"Python\",
    \"results\": $RESULTS,
    \"summary_type\": \"brief\",
    \"summary_length\": \"medium\"
  }" | jq '.summaries[0].summary'
```

## Field Requirements

Results must have one of:
- `Transcript` field
- `text` field
- `preview` field

```json
{
  "id": "required",
  "Transcript": "content here",  // OR
  "text": "content here",         // OR
  "preview": "content here"      // minimum
}
```

