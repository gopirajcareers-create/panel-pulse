# Vector Semantic Search Configuration

Reference: [Architecture.md](Architecture.md) — SearchService, vector embeddings, semantic search, `panel_collection`.

## Overview

Vector semantic search uses embeddings to find documents that are semantically similar to a query, regardless of exact keyword matches. Uses cosine similarity for ranking.

## How It Works

1. **Query Embedding**: User's query is embedded using Mistral Embeddings API (1024D vectors)
2. **Similarity Computation**: Cosine similarity is calculated between query and stored document embeddings
3. **Ranking**: Results are sorted by similarity score (0-1, where 1 = perfect match)
4. **Filtering**: Optional filters by field type and job ID

## Endpoint

### GET /api/v1/search/vector

Semantic search using vector embeddings.

**Query Parameters:**
- `q` (required): Search query
- `min_score` (optional, default: 0.5): Minimum similarity score (0-1)
- `field_type` (optional): Filter by field type (`jd`, `l1_transcript`, `panel_notes`, `l2_rejection`)
- `job_id` (optional): Filter by job interview ID
- `limit` (optional, default: 10): Results per page (1-100)
- `skip` (optional, default: 0): Pagination offset

**Example Request:**

```bash
# Find semantically similar interviews about Playwright automation
curl "http://localhost:3000/api/v1/search/vector?q=Tell+me+about+automation+testing+in+Playwright&min_score=0.6&limit=10"

# Search within specific job
curl "http://localhost:3000/api/v1/search/vector?q=SQL+window+functions&job_id=JD12778&min_score=0.5"

# Find similar L1 transcripts only
curl "http://localhost:3000/api/v1/search/vector?q=How+do+you+handle+async+operations&field_type=l1_transcript&limit=5"
```

**Response (200 OK):**

```json
{
  "success": true,
  "search_type": "semantic_vector",
  "query": "automation testing framework",
  "filters": {
    "field_type": null,
    "job_interview_id": null,
    "min_score": 0.6
  },
  "pagination": {
    "total": 3,
    "limit": 10,
    "skip": 0,
    "pages": 1
  },
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "job_interview_id": "JD12778",
      "candidate_name": "Nikhil",
      "panel_member_name": "Meera Nair",
      "field_type": "l1_transcript",
      "similarity": 0.8743,
      "preview": "Interviewer: Tell me about your experience with automation testing...",
      "embedded_at": "2026-03-06T06:48:40.861Z"
    }
  ],
  "timestamp": "2026-03-06T10:15:30.123Z"
}
```

## Error Responses

**400 Bad Request** — Missing or invalid query

```json
{
  "error": "Missing required query parameter",
  "details": "q parameter is required for search"
}
```

**503 Service Unavailable** — Mistral API down

```json
{
  "error": "Embedding service unavailable",
  "details": "Failed to embed query: Mistral API timeout",
  "code": "EMBEDDING_FAILED"
}
```

## Similarity Scores

| Score Range | Meaning |
|---|---|
| 0.9–1.0 | Nearly identical (exact match) |
| 0.8–0.9 | Highly similar (strong semantic match) |
| 0.7–0.8 | Very similar (good match) |
| 0.6–0.7 | Similar (acceptable match) |
| 0.5–0.6 | Somewhat similar (weak match) |
| < 0.5 | Not similar (use higher min_score) |

**Recommended min_score values:**
- `0.7+` for strict matching
- `0.5–0.6` for broader results
- `0.3–0.4` for exploratory search

## Use Cases

### 1. Find Similar Interview Transcripts
Find interviews with similar questioning patterns:

```bash
curl "http://localhost:3000/api/v1/search/vector?q=What+are+your+strengths+and+weaknesses&min_score=0.7"
```

### 2. Discover Candidates with Similar Profiles
Find candidates who answered similar questions:

```bash
curl "http://localhost:3000/api/v1/search/vector?q=Tell+me+about+your+experience+with+microservices&min_score=0.6"
```

### 3. Find Related Rejection Reasons
Find similar rejection patterns:

```bash
curl "http://localhost:3000/api/v1/search/vector?q=Poor+communication+skills&field_type=l2_rejection"
```

### 4. Hybrid Search (BM25 + Vector)
Combine with BM25 for comprehensive results:

```bash
# First: BM25 for keyword matches
curl "http://localhost:3000/api/v1/search/bm25?q=SQL+optimization"

# Then: Vector for semantic matches
curl "http://localhost:3000/api/v1/search/vector?q=How+do+you+optimize+database+queries"
```

## Performance Notes

- **Embedding cost**: Each query triggers one Mistral embedding API call ($.0002 approx)
- **Aggregation pipeline**: MongoDB compute-intensive; suitable for 10K–100K documents
- **Latency**: ~500ms–2s depending on collection size
- For large collections (1M+ docs), consider using MongoDB Atlas Vector Search (paid feature)

## Advanced: Combining BM25 + Vector

For best results, use both search methods:

1. **BM25** for keyword-based filtering (fast, exact match)
2. **Vector** for semantic understanding (slower, flexible)
3. Rank results by combining scores

Example:
```javascript
// Pseudo-code
const bm25Results = await searchBM25(query);
const vectorResults = await searchVector(query);
const combined = bm25Results.map(r => ({ ...r, score: r.score * 0.4 }))
  .concat(vectorResults.map(r => ({ ...r, score: r.similarity * 0.6 })))
  .sort((a, b) => b.score - a.score);
```

## Limitations

- Requires documents to have `embedding` field (populated via `/api/v1/embeddings`)
- Embeddings must be 1024D (Mistral standard)
- No fuzzy matching (use BM25 for typos)
- Slower than BM25 due to vector computation
