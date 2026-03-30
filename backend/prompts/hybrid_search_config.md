# Hybrid Search Configuration (BM25 + Vector)

Reference: [Architecture.md](Architecture.md) — Hybrid Search combining BM25 and Vector embeddings for `panel_collection`.

## Overview

Hybrid search combines the strengths of:
- **BM25 (Full-Text Search)**: Keyword-based relevance, excellent for exact term matches
- **Vector Search**: Semantic similarity, captures intent and context

This approach provides superior search results by ranking documents based on both lexical and semantic relevance.

## Search Strategy

The hybrid search works in two parallel paths:

1. **BM25 Path**: Keyword matching with relevance scoring
2. **Vector Path**: Semantic similarity with cosine distance scoring

Results are merged and re-ranked using a configurable weight distribution.

## Configuration Parameters

### Weight Configuration
```javascript
{
  bm25Weight: 0.5,      // BM25 score contribution (0-1)
  vectorWeight: 0.5,    // Vector score contribution (0-1)
  // Note: Weights should sum to 1.0 for normalized scores
}
```

### Scoring Normalization
- **BM25 Score**: Normalized to 0-1 range using percentile ranking
- **Vector Score**: Already in 0-1 range (cosine similarity)
- **Hybrid Score**: `(bm25Normalized * bm25Weight) + (vectorScore * vectorWeight)`

### Threshold Parameters
```javascript
{
  bm25MinScore: 0.0,    // Minimum BM25 score (can filter out low-relevance)
  vectorMinScore: 0.3,  // Minimum vector similarity (semantic threshold)
  minHybridScore: 0.0   // Final hybrid score threshold
}
```

## Endpoint Usage

### GET /api/v1/search/hybrid

Perform hybrid search combining BM25 and vector embeddings.

**Request:**
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=SQL+window+functions&bm25_weight=0.5&vector_weight=0.5&limit=10&skip=0"
```

**Query Parameters:**
- `q` (required): Search query (URL-encoded)
- `bm25_weight` (optional, default: 0.5): BM25 score weight (0-1)
- `vector_weight` (optional, default: 0.5): Vector score weight (0-1)
- `vector_min_score` (optional, default: 0.3): Minimum vector similarity (0-1)
- `field_type` (optional): Filter by field type (`jd`, `l1_transcript`, `panel_notes`, `l2_rejection`)
- `job_id` (optional): Filter by job interview ID
- `limit` (optional, default: 10): Results per page (1-100)
- `skip` (optional, default: 0): Pagination offset

**Response (200 OK):**
```json
{
  "success": true,
  "search_type": "hybrid",
  "query": "SQL window functions",
  "search_weights": {
    "bm25_weight": 0.5,
    "vector_weight": 0.5
  },
  "filters": {
    "field_type": "jd",
    "job_interview_id": null,
    "vector_min_score": 0.3
  },
  "pagination": {
    "total": 5,
    "limit": 10,
    "skip": 0,
    "pages": 1
  },
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "job_interview_id": "JD12778",
      "field_type": "jd",
      "hybrid_score": 4.2156,
      "bm25_score": 4.5213,
      "vector_score": 0.8900,
      "preview": "Strong SQL proficiency required. Experience with window functions, CTEs...",
      "score_breakdown": {
        "bm25_normalized": 0.9043,
        "vector_similarity": 0.8900
      }
    }
  ],
  "timestamp": "2026-03-06T10:15:30.123Z"
}
```

## Error Responses

**400 Bad Request** — Missing required query or invalid parameters
```json
{
  "error": "Missing required query parameter",
  "details": "q parameter is required for search"
}
```

**400 Bad Request** — Invalid weight configuration
```json
{
  "error": "Invalid weight parameter",
  "details": "bm25_weight must be between 0 and 1"
}
```

**503 Service Unavailable** — Search index not configured
```json
{
  "error": "Search service unavailable",
  "details": "BM25 search index not configured...",
  "code": "SEARCH_INDEX_NOT_FOUND"
}
```

## Example Queries

### Equal weight (default) - balanced keyword and semantic
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=machine+learning+algorithms"
```

### Emphasis on semantic similarity (70% vector, 30% BM25)
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=AI+expertise&bm25_weight=0.3&vector_weight=0.7"
```

### Emphasis on exact keywords (80% BM25, 20% vector)
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=Python+Django&bm25_weight=0.8&vector_weight=0.2"
```

### Search with filters
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=React&field_type=jd&job_id=JD12778&limit=20"
```

### Adjust vector similarity threshold
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=distributed+systems&vector_min_score=0.5"
```

## Performance Considerations

1. **Embedding Generation**: First query is embedded (adds latency)
2. **Dual Pipeline**: Both BM25 and vector searches run in parallel aggregation
3. **Score Normalization**: BM25 scores normalized using percentile ranking within result set
4. **Memory**: Combines results from both searches before pagination

## Weight Tuning Guide

| Use Case | BM25 Weight | Vector Weight | Rationale |
|----------|------------|---------------|-----------|
| Exact keyword matches required | 0.8 | 0.2 | Prioritize lexical relevance |
| Product documentation search | 0.6 | 0.4 | Mix both approaches |
| General semantic search | 0.4 | 0.6 | Prioritize contextual understanding |
| Intent-based (FAQ, QA) | 0.2 | 0.8 | Maximize semantic matching |
| Balanced/default | 0.5 | 0.5 | Equal emphasis |

## Index Requirements

For hybrid search to work, you need both indexes created:

1. **BM25 Index**: `bm25_index` (Atlas Search)
2. **Vector Support**: `embedding` field configured in BM25 index (type: vector, dimensions: 1024)

See [search_bm25_config.md](search_bm25_config.md) for detailed BM25 index setup.

## Notes

- BM25 scoring is based on term frequency and document length normalization
- Vector similarity is cosine-based (output: -1 to 1, typically 0-1 for normalized embeddings)
- Results are re-ranked after combining both scores
- Pagination happens after score calculation for accurate result ordering
- Empty results from either search method are handled gracefully

