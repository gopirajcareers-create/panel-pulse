# LLM Re-Ranking API - Quick Reference

## Endpoint

```
POST /api/v1/search/rerank
```

## Quick Test

**Minimal request:**
```bash
curl -X POST "http://localhost:3000/api/v1/search/rerank" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Python",
    "results": [{"id": "1", "preview": "Python content"}],
    "top_k": 5
  }'
```

## Request Body

```json
{
  "query": "search query",                           // Required
  "results": [
    {
      "id": "doc_id",
      "job_interview_id": "JD123",
      "candidate_name": "Name",
      "preview": "content preview"
    }
  ],                                                  // Required
  "top_k": 5,                                        // Optional (default: 5, max: 50)
  "evaluation_focus": "relevance",                   // Optional (default: relevance)
  "include_explanations": true                       // Optional (default: true)
}
```

## Evaluation Focus Options

| Option | Best For | Criteria |
|--------|----------|----------|
| `relevance` | General search | Keyword match, semantic relevance |
| `expertise_match` | Candidate eval | Skills, depth, experience |
| `interview_quality` | Panel eval | Question quality, coverage, probing |

## Response

```json
{
  "success": true,
  "search_type": "rerank_llm",
  "query": "...",
  "results": [
    {
      "id": "...",
      "llm_rank": 1,
      "llm_score": 9.5,
      "llm_explanation": "...",
      "rank_change": -2,
      "original_rank": 3,
      "original_score": 4.52
    }
  ]
}
```

## Response Fields

| Field | Description |
|-------|-------------|
| `llm_rank` | LLM rank (1=best) |
| `llm_score` | LLM score 1-10 |
| `llm_explanation` | Why ranked this way |
| `rank_change` | Negative = moved up |
| `original_rank` | Original search rank |
| `original_score` | Original search score |

## Example Scenarios

### Scenario 1: Find Best Python Expert
```bash
curl -X POST "http://localhost:3000/api/v1/search/rerank" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Python expertise",
    "results": [search_results],
    "top_k": 5,
    "evaluation_focus": "expertise_match"
  }'
```

### Scenario 2: Best Interview Assessment
```bash
curl -X POST "http://localhost:3000/api/v1/search/rerank" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "React technical depth",
    "results": [search_results],
    "top_k": 10,
    "evaluation_focus": "interview_quality"
  }'
```

### Scenario 3: Most Relevant Documents
```bash
curl -X POST "http://localhost:3000/api/v1/search/rerank" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SQL optimization",
    "results": [search_results],
    "top_k": 3,
    "evaluation_focus": "relevance"
  }'
```

## Error Codes

| Status | Error | Meaning |
|--------|-------|---------|
| 400 | Missing query | Query parameter required |
| 400 | Invalid results | Results must be non-empty array |
| 400 | Invalid top_k | Must be 1-50 |
| 400 | Invalid focus | Must be relevance/expertise_match/interview_quality |
| 503 | LLM unavailable | GROQ API key not configured |
| 503 | LLM error | GROQ API error (rate limit, etc) |
| 500 | Rerank failed | Internal error |

## Full Example Flow

```bash
# 1. Get search results
RESULTS=$(curl -s "http://localhost:3000/api/v1/search/hybrid?q=Python&limit=10" | jq '.results')

# 2. Re-rank them
curl -X POST "http://localhost:3000/api/v1/search/rerank" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"Python\",
    \"results\": $RESULTS,
    \"top_k\": 5,
    \"evaluation_focus\": \"expertise_match\",
    \"include_explanations\": true
  }" | jq '.results[] | {name: .candidate_name, rank: .llm_rank, score: .llm_score, reason: .llm_explanation}'
```

## Performance Notes

- **Latency**: 2-15 seconds (LLM-dependent)
- **Timeout**: 30 seconds per request
- **Retries**: 3 attempts with backoff
- **Max results**: Top 50 can be returned
- **Input limit**: First 10 results evaluated

## Configuration Required

```bash
# In .env file:
GROQ_API_KEY=your_key_here
GROQ_MODEL_NAME=llama-3.3-70b-versatile
```

## Integration with Search

**Combined workflow:**
```
1. Call /api/v1/search/hybrid  → Get ranked results
2. Call /api/v1/search/rerank  → LLM re-ranks
3. Return to user              → Best results
```

## Common Parameters

```bash
# Default balanced
{
  "query": "test",
  "results": [...],
  "top_k": 5,                          # Default
  "evaluation_focus": "relevance",    # Default
  "include_explanations": true        # Default
}

# Expertise focused
{
  "evaluation_focus": "expertise_match",
  "top_k": 10
}

# Interview analysis
{
  "evaluation_focus": "interview_quality",
  "top_k": 15
}

# Concise (no explanations)
{
  "include_explanations": false
}
```

## Tips & Tricks

1. **Combine searches**: Hybrid search + LLM rerank for best results
2. **Use focus wisely**: Pick evaluation_focus based on your need
3. **Batch requests**: Rerank multiple sets in parallel
4. **Cache results**: Save LLM rankings for identical queries
5. **Monitor costs**: Track GROQ API usage for budgeting

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 503 LLM error | Check GROQ_API_KEY in .env |
| Slow response | LLM takes 2-15s; consider async |
| Parse error | Ensure results have `id` field |
| Invalid focus | Use: relevance, expertise_match, interview_quality |

