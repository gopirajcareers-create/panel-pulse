# Create Endpoint Template — POST /api/v1/embeddings

Reference: [Architecture.md](Architecture.md) — EmbeddingService, Mistral Embeddings, `panel_collection` with vector_index.

## Endpoint Specification

### Overview
Generate vector embeddings for interview documents using Mistral Embeddings API and store in MongoDB with vector indexing for hybrid search.

### Request Schema

```json
POST /api/v1/embeddings
Content-Type: application/json

{
  "documents": [
    {
      "job_interview_id": "JD12778",
      "text": "Full JD or transcript or panel notes...",
      "field_type": "jd|l1_transcript|panel_notes|l2_rejection"
    }
  ]
}
```

### Response Schema (200 OK)

```json
{
  "success": true,
  "embedded_count": 3,
  "documents": [
    {
      "job_interview_id": "JD12778",
      "field_type": "jd",
      "vector_dimension": 1024,
      "stored": true
    }
  ],
  "timestamp": "2026-03-06T10:15:30Z"
}
```

### Error Responses

**400 Bad Request** — Invalid input

```json
{
  "error": "Invalid documents format",
  "details": "field_type must be one of: jd, l1_transcript, panel_notes, l2_rejection"
}
```

**401 Unauthorized** — Missing/invalid API key

```json
{
  "error": "Mistral API key not configured",
  "code": "MISTRAL_KEY_MISSING"
}
```

**503 Service Unavailable** — Mistral API or MongoDB down

```json
{
  "error": "Embedding service unavailable",
  "reason": "Mistral API timeout"
}
```

### Validation Rules
- `documents` must be an array (1-100 items)
- `text` must be non-empty string (min 10 chars, max 8192 chars per Mistral)
- `field_type` must be one of: `jd`, `l1_transcript`, `panel_notes`, `l2_rejection`
- `job_interview_id` must match existing document in MongoDB

### Example cURL

```bash
curl -X POST http://localhost:3000/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "job_interview_id": "JD12778",
        "text": "Strong SQL proficiency required. Experience with window functions, CTEs, and query optimization.",
        "field_type": "jd"
      },
      {
        "job_interview_id": "JD12778",
        "text": "Interviewer: What is a window function? Candidate: A function that operates on a set of rows...",
        "field_type": "l1_transcript"
      }
    ]
  }'
```

### Implementation Notes
- Call Mistral `mistral-embed` model via API
- Set temperature/seed for deterministic outputs
- Store embedding + metadata in `panel_collection` with vector_index
- Log all API calls for auditing and cost tracking
- Implement retry logic (3 attempts, exponential backoff)
