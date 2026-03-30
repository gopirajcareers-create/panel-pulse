# LLM Re-Ranking Configuration

Reference: [Architecture.md](../../Architecture.md) — LLM-based intelligent re-ranking for search results.

## Overview

LLM Re-Ranking uses advanced language models to intelligently re-rank search results based on semantic understanding and context. Unlike traditional scoring algorithms, LLM re-ranking can:

- **Understand context**: Comprehend the intent behind the query
- **Evaluate relevance**: Judge relevance based on domain knowledge
- **Provide explanations**: Explain why results are ranked a certain way
- **Handle multiple criteria**: Evaluate based on different focus areas

## How It Works

```
Search Results (ranked by BM25/Vector)
    ↓
LLM Evaluator
    ├─ Analyzes query intent
    ├─ Evaluates each result against criteria
    └─ Generates relevance scores & explanations
    ↓
Re-Ranked Results
    ├─ Primary ranking from LLM
    ├─ Explanations for each ranking
    └─ Rank change from original
```

## Architecture

### Components

1. **LLM Service** (`llmRerankService.js`)
   - Communicates with GROQ API
   - Builds evaluation prompts
   - Parses LLM responses
   - Handles retry logic

2. **Search Route** (`search.js`)
   - Accepts POST requests
   - Validates input data
   - Calls LLM service
   - Formats responses

3. **API Endpoint** (`POST /api/v1/search/rerank`)
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
  "results": [Array],                   // Required: Search results to re-rank
  "top_k": 5,                          // Optional: Return top K results (default: 5, max: 50)
  "evaluation_focus": "relevance",     // Optional: 'relevance', 'expertise_match', 'interview_quality'
  "include_explanations": true         // Optional: Include LLM explanations (default: true)
}
```

### Evaluation Focus Options

#### 1. Relevance (Default)
Ranks results by how well they answer the query.

**Criteria:**
- Keyword match quality
- Semantic relevance
- Overall usefulness

**Best for:** General search queries, documentation

```json
{
  "evaluation_focus": "relevance"
}
```

#### 2. Expertise Match
Ranks by candidate/content expertise level alignment.

**Criteria:**
- Skills mentioned in content
- Technical depth demonstrated
- Experience level
- Interview quality indicators

**Best for:** Candidate evaluation, skill-based search

```json
{
  "evaluation_focus": "expertise_match"
}
```

#### 3. Interview Quality
Ranks by interview assessment depth and quality.

**Criteria:**
- Quality of questioning
- Panel member expertise
- Skill coverage
- Probing depth

**Best for:** Panel evaluation, interview analysis

```json
{
  "evaluation_focus": "interview_quality"
}
```

## Endpoint Usage

### POST /api/v1/search/rerank

Re-rank search results using LLM evaluation.

**Request:**
```bash
curl -X POST "http://localhost:3000/api/v1/search/rerank" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SQL optimization expertise",
    "results": [
      {"id": "doc1", "candidate_name": "John", "preview": "..."},
      {"id": "doc2", "candidate_name": "Jane", "preview": "..."}
    ],
    "top_k": 5,
    "evaluation_focus": "expertise_match",
    "include_explanations": true
  }'
```

**Request Body:**
```json
{
  "query": "Python machine learning skills",
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "job_interview_id": "JD12778",
      "candidate_name": "John Doe",
      "panel_member_name": "Jane Smith",
      "field_type": "l1_transcript",
      "preview": "Demonstrated strong knowledge of scikit-learn and pandas...",
      "hybrid_score": 4.52
    },
    {
      "id": "507f1f77bcf86cd799439012",
      "job_interview_id": "JD12779",
      "candidate_name": "Alice Brown",
      "panel_member_name": "Bob Wilson",
      "field_type": "l1_transcript",
      "preview": "Mentioned Python but focused mainly on R...",
      "hybrid_score": 3.21
    }
  ],
  "top_k": 5,
  "evaluation_focus": "expertise_match",
  "include_explanations": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "search_type": "rerank_llm",
  "query": "Python machine learning skills",
  "rerank_config": {
    "top_k": 5,
    "evaluation_focus": "expertise_match",
    "include_explanations": true
  },
  "evaluation_summary": {
    "total_results": 2,
    "returned_results": 2,
    "focus": "expertise_match"
  },
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "job_interview_id": "JD12778",
      "candidate_name": "John Doe",
      "panel_member_name": "Jane Smith",
      "field_type": "l1_transcript",
      "original_rank": 1,
      "original_score": 4.52,
      "llm_rank": 1,
      "llm_score": 9.5,
      "llm_explanation": "Demonstrates deep Python ML expertise with specific tool knowledge",
      "relevance_reason": "Strong match for Python machine learning requirements",
      "preview": "Demonstrated strong knowledge of scikit-learn and pandas...",
      "rank_change": 0
    },
    {
      "id": "507f1f77bcf86cd799439012",
      "job_interview_id": "JD12779",
      "candidate_name": "Alice Brown",
      "panel_member_name": "Bob Wilson",
      "field_type": "l1_transcript",
      "original_rank": 2,
      "original_score": 3.21,
      "llm_rank": 2,
      "llm_score": 5.2,
      "llm_explanation": "Limited Python ML focus; primary expertise in R",
      "relevance_reason": "Python mentioned but not deep specialization",
      "preview": "Mentioned Python but focused mainly on R...",
      "rank_change": 0
    }
  ],
  "timestamp": "2026-03-06T10:15:30.123Z"
}
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

### 400 - Invalid top_k
```json
{
  "error": "Invalid top_k parameter",
  "details": "top_k must be a number between 1 and 50"
}
```

### 400 - Invalid Evaluation Focus
```json
{
  "error": "Invalid evaluation_focus parameter",
  "details": "evaluation_focus must be one of: relevance, expertise_match, interview_quality"
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

### 500 - Re-ranking Failed
```json
{
  "error": "Re-ranking operation failed",
  "details": "Failed to parse GROQ response"
}
```

## Use Cases

### 1. Refine Search Results
```bash
# Get search results first
RESULTS=$(curl "http://localhost:3000/api/v1/search/hybrid?q=Python&limit=10")

# Re-rank them with LLM
curl -X POST "http://localhost:3000/api/v1/search/rerank" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"Python\",
    \"results\": $RESULTS,
    \"top_k\": 5,
    \"evaluation_focus\": \"relevance\"
  }"
```

### 2. Find Best Candidate Match
```json
{
  "query": "Strong Java backend developer with Spring Boot experience",
  "results": [...],
  "evaluation_focus": "expertise_match",
  "top_k": 10,
  "include_explanations": true
}
```

### 3. Evaluate Interview Quality
```json
{
  "query": "Deep technical assessment of React skills",
  "results": [...],
  "evaluation_focus": "interview_quality",
  "top_k": 5
}
```

## Response Format

### Result Object

```json
{
  "id": "document_id",
  "job_interview_id": "JD12778",
  "candidate_name": "John Doe",
  "panel_member_name": "Jane Smith",
  "field_type": "l1_transcript",
  
  "original_rank": 2,              // Original rank from search
  "original_score": 4.52,          // Original search score
  
  "llm_rank": 1,                   // LLM-assigned rank
  "llm_score": 9.5,                // LLM score (1-10)
  "llm_explanation": "Detailed explanation...",
  "relevance_reason": "Why this is relevant",
  
  "preview": "Content preview...",
  "rank_change": -1                // Negative = moved up
}
```

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Prompt generation | ~10-20ms | Fast |
| LLM API call | 2-10 seconds | Depends on GROQ |
| Response parsing | ~50-100ms | Quick |
| Retry attempts | Up to 3 | With backoff |
| Timeout | 30 seconds | Per request |
| **Total latency** | **2-15 seconds** | Acceptable for async |

## Configuration in .env

```bash
# GROQ LLM Configuration
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL_NAME=llama-3.3-70b-versatile

# Optional: Custom timeout (ms)
GROQ_TIMEOUT=30000
```

## Implementation Details

### Prompt Engineering

The system builds optimized prompts for the LLM:

```
"You are an expert evaluator...

TASK: Re-rank these results for maximum relevance.

QUERY: 'Python machine learning'

EVALUATION CRITERIA:
- Keyword match quality
- Semantic relevance
- Overall usefulness

RESULTS TO RANK:
1. [id] Content preview...
2. [id] Content preview...

Return ONLY valid JSON array..."
```

### LLM Response Parsing

The service:
1. Makes API request to GROQ
2. Extracts JSON from response
3. Handles markdown code blocks
4. Validates array structure
5. Normalizes scores (1-10)

### Retry Strategy

- **Attempt 1**: Immediate
- **Attempt 2**: After 1 second
- **Attempt 3**: After 2 seconds
- **Failure**: Returns 503 error

## Best Practices

1. **Use appropriate focus**: Select evaluation_focus based on your need
2. **Batch requests**: Re-rank multiple queries together if possible
3. **Cache results**: Store re-ranking results for identical queries
4. **Handle timeouts**: Implement client-side timeout handling
5. **Monitor costs**: GROQ charges per token; monitor usage

## Limitations

- **Top K limit**: Maximum 50 results (LLM context window)
- **Input size**: Results limited to first 10 for LLM evaluation
- **Latency**: 2-15 seconds per request (suitable for async)
- **API dependency**: Requires active GROQ API key
- **Variability**: LLM results may vary slightly between calls

## Integration with Other Endpoints

### Workflow 1: Hybrid Search → LLM Re-rank
```
1. Call /api/v1/search/hybrid
2. Get ranked results
3. Call /api/v1/search/rerank with those results
4. Return LLM-ranked results to user
```

### Workflow 2: BM25 + Vector Fusion
```
1. Call /api/v1/search/bm25
2. Call /api/v1/search/vector
3. Merge results
4. Call /api/v1/search/rerank
5. Return best results
```

## Future Enhancements

- **Batch re-ranking**: Process multiple result sets in one call
- **Custom criteria**: User-defined evaluation prompts
- **Result caching**: Cache LLM rankings for popular queries
- **A/B testing**: Compare LLM vs traditional ranking
- **Feedback loop**: Learn from user feedback to improve rankings
- **Multi-model support**: Support multiple LLM providers

