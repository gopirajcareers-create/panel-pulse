# LLM Summarization Configuration

Reference: [Architecture.md](../../Architecture.md) — LLM-based intelligent summarization for search results.

## Overview

LLM Summarization uses advanced language models to generate concise, insightful summaries of search results. Unlike simple text extraction, LLM summarization:

- **Understands context**: Comprehends the intent behind the query
- **Synthesizes information**: Combines multiple results cohesively
- **Extracts key insights**: Highlights the most important information
- **Provides options**: Multiple summary styles and lengths

## How It Works

```
Search Results
    ↓
LLM Summarizer
    ├─ Analyzes query context
    ├─ Processes results
    ├─ Generates summary
    └─ Extracts key points
    ↓
Summarized Content
    ├─ Concise summary
    ├─ Key points
    └─ Recommendations (optional)
```

## Architecture

### Components

1. **LLM Service** (`llmSummarizeService.js`)
   - Communicates with GROQ API
   - Builds summarization prompts
   - Generates individual or combined summaries
   - Handles retry logic

2. **Search Route** (`search.js`)
   - Accepts POST requests
   - Validates input data
   - Calls LLM service
   - Formats responses

3. **API Endpoint** (`POST /api/v1/search/summarize`)
   - REST interface
   - Request validation
   - Error handling

### Technology Stack

- **LLM Provider**: GROQ (llama-3.3-70b-versatile)
- **API**: HTTPS with Bearer authentication
- **Retry Logic**: 3 attempts with exponential backoff
- **Timeout**: 30 seconds per request

## Configuration Parameters

### Request Parameters

```javascript
{
  "query": "string",                    // Required: Original search query
  "results": [Array],                   // Required: Search results to summarize
  "summary_type": "brief",              // Optional: 'brief', 'detailed', 'executive'
  "summary_length": "medium",           // Optional: 'short', 'medium', 'long'
  "include_key_points": true,           // Optional: Include key points (default: true)
  "include_recommendations": false,     // Optional: Include recommendations (default: false)
  "combined_summary": true              // Optional: Single summary for all (default: true)
}
```

### Summary Type Options

#### 1. Brief (Default)
Concise summary focusing on main points.

**Use for:** Quick overviews, time-constrained reading

**Example:**
```json
{
  "summary_type": "brief"
}
```

#### 2. Detailed
Comprehensive summary with all key information.

**Use for:** In-depth understanding, full context

**Example:**
```json
{
  "summary_type": "detailed"
}
```

#### 3. Executive
Summary optimized for decision makers.

**Use for:** Management presentations, strategic decisions

**Example:**
```json
{
  "summary_type": "executive"
}
```

### Summary Length Options

#### 1. Short
Maximum 100-150 words (individual) / 150 words (combined)

**Use for:** Quick reference, headlines

#### 2. Medium (Default)
Maximum 200-300 words (individual) / 300 words (combined)

**Use for:** General purpose, balanced detail

#### 3. Long
Maximum 400-600 words (individual) / 600 words (combined)

**Use for:** Comprehensive review, detailed analysis

## Endpoint Usage

### POST /api/v1/search/summarize

Summarize search results using LLM.

**Request:**
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Python machine learning expertise",
    "results": [
      {"id": "1", "candidate_name": "John", "Transcript": "..."},
      {"id": "2", "candidate_name": "Jane", "Transcript": "..."}
    ],
    "summary_type": "executive",
    "summary_length": "medium",
    "include_key_points": true
  }'
```

**Request Body:**
```json
{
  "query": "SQL optimization techniques",
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "job_interview_id": "JD12778",
      "candidate_name": "John Doe",
      "panel_member_name": "Jane Smith",
      "field_type": "l1_transcript",
      "Transcript": "Discussed query optimization, indexing strategies...",
      "preview": "Strong SQL expertise demonstrated"
    }
  ],
  "summary_type": "brief",
  "summary_length": "medium",
  "include_key_points": true,
  "include_recommendations": true,
  "combined_summary": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "search_type": "summarize",
  "query": "SQL optimization techniques",
  "summarization_config": {
    "summary_type": "brief",
    "summary_length": "medium",
    "include_key_points": true,
    "include_recommendations": true,
    "combined_summary": false,
    "results_summarized": 1
  },
  "summary_info": {
    "type": "brief",
    "length": "medium",
    "include_key_points": true,
    "include_recommendations": true,
    "combined_summary": false,
    "results_summarized": 1
  },
  "summaries": [
    {
      "result_id": "507f1f77bcf86cd799439011",
      "result_title": "John Doe",
      "summary": "John demonstrated strong SQL optimization expertise. Key areas covered: query optimization using EXPLAIN plans, indexing strategies including B-tree and hash indexes, query rewriting techniques, and performance tuning. Recommendations: Consider working with our optimization specialist team for large-scale database projects.",
      "length_estimate": "medium",
      "timestamp": "2026-03-06T10:15:30.123Z"
    }
  ],
  "timestamp": "2026-03-06T10:15:30.123Z"
}
```

## Use Cases

### 1. Quick Result Review
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "candidate skills",
    "results": [search_results],
    "summary_type": "brief",
    "summary_length": "short"
  }'
```

### 2. Candidate Comparison
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "React developer qualifications",
    "results": [multiple_candidates],
    "summary_type": "detailed",
    "summary_length": "medium",
    "combined_summary": true,
    "include_key_points": true
  }'
```

### 3. Executive Report
```bash
curl -X POST "http://localhost:3000/api/v1/search/summarize" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "panel interview findings",
    "results": [interview_results],
    "summary_type": "executive",
    "summary_length": "medium",
    "include_recommendations": true
  }'
```

## Error Responses

### 400 - Missing Query
```json
{
  "error": "Missing required parameter",
  "details": "query parameter is required"
}
```

### 400 - Invalid Results
```json
{
  "error": "Invalid results parameter",
  "details": "results must be a non-empty array"
}
```

### 400 - Invalid Summary Type
```json
{
  "error": "Invalid summary_type parameter",
  "details": "summary_type must be one of: brief, detailed, executive"
}
```

### 400 - Invalid Summary Length
```json
{
  "error": "Invalid summary_length parameter",
  "details": "summary_length must be one of: short, medium, long"
}
```

### 503 - LLM Service Unavailable
```json
{
  "error": "LLM service unavailable",
  "details": "GROQ_API_KEY not configured",
  "code": "LLM_NOT_CONFIGURED"
}
```

### 503 - LLM API Error
```json
{
  "error": "LLM service error",
  "details": "GROQ API 429: Rate limit exceeded",
  "code": "LLM_API_ERROR"
}
```

### 500 - Summarization Failed
```json
{
  "error": "Summarization operation failed",
  "details": "Failed to parse GROQ response"
}
```

## Response Format

### Individual Summaries

```json
{
  "result_id": "doc_id",
  "result_title": "John Doe",
  "summary": "Concise summary of the result content...",
  "length_estimate": "medium",
  "timestamp": "2026-03-06T10:15:30.123Z"
}
```

### Combined Summary

```json
{
  "combined_summary": true,
  "results_count": 3,
  "result_ids": ["doc1", "doc2", "doc3"],
  "summary": "Synthesized summary across all 3 results...",
  "length_estimate": "medium",
  "timestamp": "2026-03-06T10:15:30.123Z"
}
```

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Prompt building | 10-20ms | Fast local operation |
| LLM API call | 2-10 seconds | Main latency contributor |
| Response parsing | 50-100ms | Quick validation |
| **Total** | **2-15 seconds** | Suitable for async |

## Configuration in .env

```bash
# GROQ LLM Configuration
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL_NAME=llama-3.3-70b-versatile
```

## Implementation Details

### Summarization Modes

**Individual Summaries:**
- Generates separate summary for each result
- Best for: Comparing results side-by-side
- Use when: `combined_summary: false`

**Combined Summary:**
- Single synthesized summary across all results
- Best for: Cohesive overview
- Use when: `combined_summary: true` (default)

### Prompt Engineering

The service builds optimized prompts:

```
"You are a professional summarizer...

TASK: Summarize the following content.

SEARCH QUERY: 'Python expertise'

SUMMARY STYLE: Executive summary
LENGTH: Medium (max 300 words)
- Include 5-7 key points
- Include 3-5 recommendations

CONTENT TO SUMMARIZE:
[Results text]

IMPORTANT:
- Focus on relevance to query
- Synthesize across all results
- Use professional language
- Be concise and clear"
```

## Best Practices

1. **Choose appropriate type**: Match summary type to use case
2. **Set correct length**: Balance detail with readability
3. **Use combined mode**: For multiple results, use combined summary
4. **Enable key points**: Improves usability
5. **Handle async**: Implement client-side timeout (>30s)

## Integration Workflows

### Workflow 1: Search → Summarize
```
1. /api/v1/search/hybrid     → Get results
2. /api/v1/search/summarize  → Summarize
3. Return summary to user
```

### Workflow 2: Rerank → Summarize
```
1. /api/v1/search/hybrid     → Get results
2. /api/v1/search/rerank     → Re-rank
3. /api/v1/search/summarize  → Summarize top K
4. Return ranked & summarized
```

### Workflow 3: Complete Pipeline
```
1. /api/v1/search/hybrid     → Hybrid search
2. /api/v1/search/rerank     → LLM re-rank
3. /api/v1/search/summarize  → Summarize results
4. Return optimized results with summary
```

## Limitations

- **Top results**: Summarizes first 10 results max
- **Text field**: Requires `Transcript`, `text`, or `preview` field
- **Latency**: 2-15 seconds per request
- **API dependency**: Requires active GROQ API key
- **Context limit**: Total input text limited by LLM context

## Future Enhancements

- **Custom templates**: User-defined summary formats
- **Multi-language**: Summarization in different languages
- **Format options**: JSON, markdown, PDF output
- **Streaming**: Real-time summary generation
- **Caching**: Cache summaries for identical queries
- **Analytics**: Track summary usage and feedback

