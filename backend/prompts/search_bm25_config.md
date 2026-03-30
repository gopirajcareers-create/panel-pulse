# MongoDB Atlas Search — BM25 Configuration

Reference: [Architecture.md](Architecture.md) — SearchService, BM25 hybrid search, `panel_collection`.

## Overview

BM25 (Best Matching 25) is MongoDB Atlas's full-text search algorithm optimized for relevance ranking. This configuration enables fast, scalable text search across interview documents.

## Index Definition

### Index Name
`bm25_index`

### Index Configuration (JSON)

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "job_interview_id": {
        "type": "string"
      },
      "field_type": {
        "type": "string"
      },
      "text": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "jd_content": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "transcript_content": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "panel_notes": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "l2_reason": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "embedding": {
        "type": "vector",
        "dimensions": 1024,
        "similarity": "cosine"
      }
    }
  }
}
```

## How to Create the Index in MongoDB Atlas

1. Go to MongoDB Atlas Dashboard
2. Select your cluster (`langtestcasegen`)
3. Navigate to **Collections** → **panel_pulse-ai.panel_collection**
4. Click **Search** tab
5. Click **Create Search Index**
6. Choose **JSON Editor**
7. Paste the index configuration above
8. Click **Create Index**

**Wait for index to finish building** (usually 1-2 minutes)

## Endpoint Usage

### GET /api/v1/search/bm25

Query the BM25 index.

**Request:**
```bash
curl "http://localhost:3000/api/v1/search/bm25?q=SQL+window+functions&field_type=jd&limit=10&skip=0"
```

**Query Parameters:**
- `q` (required): Search query (URL-encoded)
- `field_type` (optional): Filter by field type (`jd`, `l1_transcript`, `panel_notes`, `l2_rejection`)
- `job_id` (optional): Filter by job interview ID
- `limit` (optional, default: 10): Results per page (1-100)
- `skip` (optional, default: 0): Pagination offset

**Response (200 OK):**
```json
{
  "success": true,
  "query": "SQL window functions",
  "filters": {
    "field_type": "jd",
    "job_interview_id": null
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
      "score": 4.5213,
      "highlights": [],
      "preview": "Strong SQL proficiency required. Experience with window functions, CTEs..."
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

**503 Service Unavailable** — Index not configured
```json
{
  "error": "Search service unavailable",
  "details": "BM25 search index not configured...",
  "code": "SEARCH_INDEX_NOT_FOUND"
}
```

## Example Queries

### Search for SQL expertise
```bash
curl "http://localhost:3000/api/v1/search/bm25?q=SQL+expertise"
```

### Search in JD field only
```bash
curl "http://localhost:3000/api/v1/search/bm25?q=automation&field_type=jd"
```

### Search for a specific job
```bash
curl "http://localhost:3000/api/v1/search/bm25?q=TypeScript&job_id=JD12778"
```

### Pagination
```bash
curl "http://localhost:3000/api/v1/search/bm25?q=Python&limit=20&skip=0"
```

## Advanced Features

### Fuzzy Matching
The index is configured with `maxEdits: 2`, which allows typos:
- "wimdow" matches "window"
- "typescirpt" matches "typescript"

### Field Weighting
All searchable fields have equal weight. For custom weighting, update the index configuration:

```json
{
  "text": {
    "type": "string",
    "analyzer": "lucene.standard",
    "boost": { "value": 2 }  // Weight JD higher
  }
}
```

## Notes

- BM25 scoring is based on term frequency and document length normalization
- Higher scores indicate better relevance
- Supports phrase queries: `"window functions"`
- Supports boolean operators: `SQL AND window`
- Consider indexing on `embedding` field too for hybrid vector + BM25 search later
