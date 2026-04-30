# Hybrid Search API - Quick Reference & Testing Guide

## Implementation Status: ✅ COMPLETE

## Available Endpoints

### 1. BM25 Search (Keyword-based)
```
GET /api/v1/search/bm25?q=<query>&field_type=<type>&job_id=<id>&limit=<n>&skip=<n>
```

### 2. Vector Search (Semantic)
```
GET /api/v1/search/vector?q=<query>&field_type=<type>&job_id=<id>&min_score=<0-1>&limit=<n>&skip=<n>
```

### 3. Hybrid Search (Combined) ⭐ NEW
```
GET /api/v1/search/hybrid?q=<query>&bm25_weight=<0-1>&vector_weight=<0-1>&vector_min_score=<0-1>&field_type=<type>&job_id=<id>&limit=<n>&skip=<n>
```

## Quick Test Examples

### Test 1: Balanced Hybrid Search (50/50)
```bash
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=Python+machine+learning&limit=5"
```
Expected: Results ranked by balanced BM25 + vector similarity

### Test 2: Semantic-focused Search (30% BM25, 70% Vector)
```bash
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=AI+algorithms&bm25_weight=0.3&vector_weight=0.7&limit=5"
```
Expected: Results weighted more toward semantic meaning

### Test 3: Keyword-focused Search (80% BM25, 20% Vector)
```bash
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=Java+Spring+Boot&bm25_weight=0.8&vector_weight=0.2&limit=5"
```
Expected: Results weighted more toward exact keywords

### Test 4: With Field Filter
```bash
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=React&field_type=jd&limit=10"
```
Expected: Results only from JD field

### Test 5: With Job ID Filter
```bash
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=TypeScript&job_id=JD12778&limit=5"
```
Expected: Results from specific job interview only

### Test 6: High Vector Similarity Threshold
```bash
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=distributed+systems&vector_min_score=0.7&limit=5"
```
Expected: Only semantically very similar results

### Test 7: Pagination
```bash
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=database&limit=10&skip=0"
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=database&limit=10&skip=10"
```
Expected: First and second pages of results

## Response Structure

### Success Response (200 OK)
```json
{
  "success": true,
  "search_type": "hybrid",
  "query": "search term",
  "search_weights": {
    "bm25_weight": 0.5,
    "vector_weight": 0.5
  },
  "filters": {
    "field_type": null,
    "job_interview_id": null,
    "vector_min_score": 0.3
  },
  "pagination": {
    "total": 25,
    "limit": 10,
    "skip": 0,
    "pages": 3
  },
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "job_interview_id": "JD12778",
      "candidate_name": "John Doe",
      "panel_member_name": "Jane Smith",
      "field_type": "jd",
      "hybrid_score": 4.2156,
      "bm25_score": 4.5213,
      "vector_score": 0.89,
      "preview": "Strong SQL proficiency required...",
      "score_breakdown": {
        "bm25_normalized": 0.9043,
        "vector_similarity": 0.89
      }
    }
  ],
  "timestamp": "2026-03-06T10:15:30.123Z"
}
```

### Error Responses

**400 - Missing Query**
```json
{
  "error": "Missing required query parameter",
  "details": "q parameter is required for search"
}
```

**400 - Invalid Weight**
```json
{
  "error": "Invalid bm25_weight parameter",
  "details": "bm25_weight must be a number between 0 and 1"
}
```

**400 - Invalid Pagination**
```json
{
  "error": "Invalid limit parameter",
  "details": "limit must be a number between 1 and 100"
}
```

**503 - Embedding Failed**
```json
{
  "error": "Embedding service unavailable",
  "details": "Failed to embed query: ...",
  "code": "EMBEDDING_FAILED"
}
```

## Score Interpretation

| Score Range | Meaning |
|---|---|
| 4.5 - 5.0 | Highly relevant (top matches) |
| 3.5 - 4.5 | Very relevant |
| 2.5 - 3.5 | Relevant |
| 1.5 - 2.5 | Somewhat relevant |
| 0.5 - 1.5 | Low relevance |
| 0.0 - 0.5 | Minimal relevance |

### Score Breakdown Interpretation

**bm25_normalized**: How well the document matches keywords (0-1, higher = more keyword hits)
**vector_similarity**: How semantically similar the document is (0-1, higher = more conceptually related)

## Weight Configuration Recommendations

| Use Case | BM25 | Vector | Rationale |
|----------|------|--------|-----------|
| Legal/compliance docs | 0.8 | 0.2 | Exact terms critical |
| Technical docs | 0.6 | 0.4 | Both keywords and concepts matter |
| Interview transcripts | 0.5 | 0.5 | Balanced approach (default) |
| FAQ/QA systems | 0.3 | 0.7 | User intent > exact keywords |
| Knowledge base search | 0.4 | 0.6 | Flexibility in phrasing |

## Field Types Supported

- `jd` - Job Description
- `l1_transcript` - L1 Interview Transcript
- `panel_notes` - Panel Notes
- `l2_rejection` - L2 Rejection Reason

## Performance Notes

- ⚡ First request embeds query (~100-300ms)
- ⚡ Both BM25 and vector searches run in parallel
- ⚡ Results capped at 100 before pagination
- ⚡ Typical response time: 500ms-2s depending on result size

## Troubleshooting

### Getting 503 Embedding Service Error
- Check embedding service is running
- Verify MongoDB connection is active
- Check database has documents with `embedding` field

### Getting Empty Results
- Try lower `vector_min_score` (default 0.3)
- Try different weight distribution
- Check field_type/job_id filters aren't too restrictive

### Getting Only Vector Results (BM25 Failed)
- Check BM25 index is created: `bm25_index`
- See [search_bm25_config.md](prompts/search_bm25_config.md) for setup
- System continues with vector-only fallback

### Weight Sum > 1
- System auto-normalizes: if weights=0.6, 0.7, they're treated as 0.46, 0.54
- Best practice: keep sum = 1.0 for clarity

