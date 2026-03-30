# Hybrid Search Implementation Summary

## Overview
Hybrid search has been successfully implemented, combining BM25 (keyword-based) and Vector (semantic) search methods with configurable weights.

## Files Created/Modified

### 1. New Configuration Document
**File**: [prompts/hybrid_search_config.md](prompts/hybrid_search_config.md)
- Complete documentation for hybrid search
- Configuration parameters and weight tuning guide
- Usage examples and performance considerations
- Error responses and troubleshooting

### 2. Updated Search Service
**File**: [src/services/searchService.js](src/services/searchService.js)
- **New Function**: `searchHybrid(query, options)`
  - Combines BM25 and vector search results
  - Normalizes scores from both methods
  - Applies configurable weight distribution
  - Returns merged, re-ranked results

**Key Features**:
- Parallel execution of BM25 and vector searches
- Score normalization for fair comparison
- Graceful fallback if one search method fails
- Supports filtering by field_type and job_id
- Pagination support (limit/skip)

### 3. Updated Search Routes
**File**: [src/routes/search.js](src/routes/search.js)
- **New Endpoint**: `GET /api/v1/search/hybrid`
- Parameter validation for all weights and thresholds
- Comprehensive error handling
- JSON response with detailed score breakdowns

## Endpoint Details

### GET /api/v1/search/hybrid

**Required Parameters**:
- `q`: Search query string

**Optional Parameters**:
- `bm25_weight` (default: 0.5): BM25 score contribution (0-1)
- `vector_weight` (default: 0.5): Vector score contribution (0-1)
- `vector_min_score` (default: 0.3): Minimum vector similarity threshold (0-1)
- `field_type`: Filter by field (jd, l1_transcript, panel_notes, l2_rejection)
- `job_id`: Filter by job interview ID
- `limit` (default: 10): Results per page (1-100)
- `skip` (default: 0): Pagination offset

**Response Format**:
```json
{
  "success": true,
  "search_type": "hybrid",
  "query": "search term",
  "search_weights": {
    "bm25_weight": 0.5,
    "vector_weight": 0.5
  },
  "filters": { ... },
  "pagination": { ... },
  "results": [
    {
      "id": "...",
      "job_interview_id": "...",
      "hybrid_score": 4.21,
      "bm25_score": 4.52,
      "vector_score": 0.89,
      "preview": "...",
      "score_breakdown": {
        "bm25_normalized": 0.90,
        "vector_similarity": 0.89
      }
    }
  ],
  "timestamp": "2026-03-06T..."
}
```

## Example Queries

### 1. Default balanced search
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=SQL+window+functions"
```

### 2. Emphasize semantic similarity (70% vector, 30% BM25)
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=AI+expertise&bm25_weight=0.3&vector_weight=0.7"
```

### 3. Emphasize exact keywords (80% BM25, 20% vector)
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=React+TypeScript&bm25_weight=0.8&vector_weight=0.2"
```

### 4. With filters and pagination
```bash
curl "http://localhost:3000/api/v1/search/hybrid?q=machine+learning&field_type=jd&limit=20&skip=0"
```

## Technical Details

### Score Calculation
1. **BM25 Score**: Normalized using max value in result set (0-1 range)
2. **Vector Score**: Already normalized cosine similarity (0-1 range)
3. **Hybrid Score**: `(bm25_normalized × bm25Weight + vector_score × vectorWeight) / (bm25Weight + vectorWeight)`

### Search Process
1. Execute BM25 search (up to 100 results)
2. Embed query using embedding service
3. Execute vector search with similarity threshold
4. Merge results from both methods
5. Normalize scores to 0-1 range
6. Calculate weighted hybrid scores
7. Sort by hybrid score and apply pagination

### Error Handling
- Gracefully continues if BM25 fails (vector-only results)
- Gracefully continues if vector search fails (BM25-only results)
- Proper validation of all parameters
- Descriptive error messages

## Prerequisites for Deployment
- MongoDB Atlas BM25 index configured (`bm25_index`)
- Embedding service running and accessible
- Document collection with `embedding` field populated
- Embedding dimension: 1024

## Performance Considerations
- Initial query is embedded (latency ~100-300ms depending on service)
- Both BM25 and vector searches run in parallel pipeline
- Score normalization computed in-memory
- Results capped at 100 before pagination for performance
- Recommended: Use appropriate weight distribution for your use case

