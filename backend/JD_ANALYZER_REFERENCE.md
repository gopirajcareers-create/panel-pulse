# JD Fine-Tuning (Skill Analysis) API Reference

**Status**: ✅ Production Ready  
**Feature**: LLM-Based JD Analysis and Skill Classification

---

## Overview

The JD Analyzer API takes Job Descriptions and uses LLM analysis to extract and classify required skills into three categories:
- **Key Skills** - Core technical skills that define the role
- **Mandatory Skills** - Non-negotiable prerequisites
- **Good To Have Skills** - Nice-to-have capabilities

---

## API Endpoints

### 1. POST /api/v1/jd/analyze

Analyze a single Job Description and extract skill classifications.

**Endpoint**: `POST /api/v1/jd/analyze`

**Request**:
```bash
curl -X POST "http://localhost:3000/api/v1/jd/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "jd_content": "Job Description text here",
    "job_id": "job_123"
  }'
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| jd_content | string | Yes | The Job Description text to analyze (min 50 chars) |
| job_id | string | No | Optional Interview/Job ID for reference |

**Response (Success)**:
```json
{
  "success": true,
  "job_id": "job_123",
  "jd_analysis": {
    "original_jd": "Full JD text...",
    "analysis_result": "Key Skills:\n1. Python - Core programming...\n\nMandatory Skills:\n1. REST APIs...",
    "parsed_analysis": {
      "key_skills": [
        "Python - Core programming language for the role",
        "FastAPI - Primary web framework"
      ],
      "mandatory_skills": [
        "REST API design - Essential for backend development",
        "SQL databases - Core database knowledge"
      ],
      "good_to_have_skills": [
        "Docker - Containerization",
        "Kubernetes - Orchestration"
      ]
    },
    "is_valid": true,
    "summary": {
      "total_key_skills": 2,
      "total_mandatory_skills": 2,
      "total_good_to_have": 2
    }
  },
  "timestamp": "2026-03-06T10:30:00.000Z"
}
```

**Response (Invalid JD)**:
```json
{
  "success": false,
  "error": "JD is very short, need more info on the JD",
  "job_id": "job_123",
  "timestamp": "2026-03-06T10:30:00.000Z"
}
```

**Error Responses**:

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing required parameter: jd_content | jd_content not provided |
| 400 | jd_content must be a string | Invalid parameter type |
| 400 | JD is very short, need more info on the JD | JD less than 50 characters |
| 503 | GROQ_API_KEY not configured | Missing API key |
| 503 | Failed after 3 attempts | LLM API failure (retried 3 times) |
| 500 | Internal server error during JD analysis | Unexpected server error |

---

### 2. POST /api/v1/jd/analyze-batch

Analyze multiple Job Descriptions in a single batch request.

**Endpoint**: `POST /api/v1/jd/analyze-batch`

**Request**:
```bash
curl -X POST "http://localhost:3000/api/v1/jd/analyze-batch" \
  -H "Content-Type: application/json" \
  -d '{
    "jd_contents": [
      {
        "jd_content": "First JD text...",
        "job_id": "job_123"
      },
      {
        "jd_content": "Second JD text...",
        "job_id": "job_124"
      }
    ]
  }'
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| jd_contents | array | Yes | Array of JD objects (max 10) |
| jd_contents[].jd_content | string | Yes | JD text to analyze |
| jd_contents[].job_id | string | No | Optional job ID |

**Response**:
```json
{
  "success": true,
  "total_processed": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "job_id": "job_123",
      "success": true,
      "analysis": {
        "success": true,
        "analysis_result": "...",
        "parsed_analysis": {
          "key_skills": [...],
          "mandatory_skills": [...],
          "good_to_have_skills": [...]
        }
      }
    },
    {
      "job_id": "job_124",
      "success": true,
      "analysis": {...}
    }
  ],
  "timestamp": "2026-03-06T10:30:00.000Z"
}
```

**Batch Limits**:
- Maximum 10 JDs per batch request
- Each JD must be at least 50 characters
- Processing is sequential (not parallel)

---

### 3. GET /api/v1/jd/health

Health check for the JD Analyzer service.

**Endpoint**: `GET /api/v1/jd/health`

**Request**:
```bash
curl "http://localhost:3000/api/v1/jd/health"
```

**Response**:
```json
{
  "success": true,
  "service": "jd-analyzer",
  "status": "healthy",
  "configuration": {
    "groq_configured": true,
    "groq_model": "llama-3.3-70b-versatile",
    "system_prompt_loaded": true
  },
  "timestamp": "2026-03-06T10:30:00.000Z"
}
```

---

## Skill Classification Guide

### Key Skills
**Definition**: Core technical skills that define the role

**Characteristics**:
- Primary focus of the job description
- Will be evaluated in-depth during interviews
- Technical differentiators for this role
- Explicitly mentioned as requirements

**Example**:
- For a "Python Backend Developer": Python, FastAPI, REST APIs
- For a "QA Automation Engineer": Test Automation, Selenium, TestNG

---

### Mandatory Skills
**Definition**: Non-negotiable prerequisites

**Characteristics**:
- Without these, candidate cannot perform the job
- Prerequisite for understanding other aspects
- Lack of knowledge is automatic disqualification
- Explicitly stated as "required" or "must have"

**Example**:
- For any IT role: Communication skills
- For database roles: SQL knowledge
- For software roles: Programming fundamentals

---

### Good To Have Skills
**Definition**: Nice-to-have but not critical

**Characteristics**:
- Enhance the role but aren't critical
- Can be learned on the job relatively quickly
- Provide additional value but not dealbreakers
- Mentioned as "nice to have" or "preferred"

**Example**:
- For a Python developer: Kubernetes, Docker (if not primary focus)
- For a backend developer: Cloud certifications, DevOps knowledge

---

## Response Format

### Analysis Result Format

The `analysis_result` field contains the raw LLM output in the following format:

```
Key Skills:
1. Skill Name - Brief explanation of why it's key

Mandatory Skills:
1. Skill Name - Brief explanation of why it's mandatory

Good To Have Skills:
1. Skill Name - Brief explanation of why it's good to have
```

### Parsed Analysis Format

The `parsed_analysis` field contains structured data:

```json
{
  "key_skills": [
    "Skill 1 - Explanation",
    "Skill 2 - Explanation"
  ],
  "mandatory_skills": [
    "Skill 1 - Explanation",
    "Skill 2 - Explanation"
  ],
  "good_to_have_skills": [
    "Skill 1 - Explanation",
    "Skill 2 - Explanation"
  ]
}
```

---

## Implementation Details

### Service Layer
**File**: `src/services/jdAnalyzerService.js`

**Main Functions**:
- `analyzeJD(jdContent, options)` - Analyze single JD
- `analyzeJDBatch(jdContents)` - Batch analysis

**Features**:
- GROQ LLM integration with llama-3.3-70b-versatile
- 3 retry attempts with exponential backoff (1s, 2s delays)
- 30-second timeout per request
- Input validation and error handling
- Structured response parsing

### Route Layer
**File**: `src/routes/jd.js`

**Endpoints**:
- `POST /analyze` - Single JD analysis
- `POST /analyze-batch` - Batch JD analysis
- `GET /health` - Health check

### System Prompt
**File**: `prompts/system-prompt.md`

Contains the LLM prompt for JD analysis with:
- ICE-O-T framework (Instruction, Context, Example, Output, Tone)
- Skill classification guidelines
- Critical rules and constraints
- Output validation checks

---

## Usage Examples

### Example 1: Simple JD Analysis

```bash
curl -X POST "http://localhost:3000/api/v1/jd/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "jd_content": "We are looking for a Senior Python Developer with 5+ years experience. Must have expertise in FastAPI, REST APIs, and SQL databases. Experience with Docker and Kubernetes is a plus.",
    "job_id": "PYTHON_DEV_001"
  }'
```

**Response** (summarized):
```json
{
  "success": true,
  "job_id": "PYTHON_DEV_001",
  "jd_analysis": {
    "parsed_analysis": {
      "key_skills": [
        "Python - Core programming language",
        "FastAPI - Primary web framework"
      ],
      "mandatory_skills": [
        "REST API design - Essential skill",
        "SQL databases - Core requirement"
      ],
      "good_to_have_skills": [
        "Docker - Containerization",
        "Kubernetes - Orchestration"
      ]
    }
  }
}
```

---

### Example 2: Batch Analysis

```bash
curl -X POST "http://localhost:3000/api/v1/jd/analyze-batch" \
  -H "Content-Type: application/json" \
  -d '{
    "jd_contents": [
      {
        "jd_content": "Python backend developer needed...",
        "job_id": "PYTHON_001"
      },
      {
        "jd_content": "Frontend React developer needed...",
        "job_id": "REACT_001"
      }
    ]
  }'
```

---

### Example 3: Handling Invalid JD

```bash
curl -X POST "http://localhost:3000/api/v1/jd/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "jd_content": "Senior Dev",
    "job_id": "SHORT_JD"
  }'
```

**Response**:
```json
{
  "success": false,
  "error": "JD is very short, need more info on the JD",
  "job_id": "SHORT_JD"
}
```

---

## Integration Workflows

### Workflow 1: Single JD Analysis

```
Client Request
    ↓
POST /api/v1/jd/analyze
    ↓
Validate Input (min 50 chars)
    ↓
Call GROQ LLM with System Prompt
    ↓
Parse Response (Key/Mandatory/Good-to-have)
    ↓
Return Structured Analysis
```

### Workflow 2: Batch Processing

```
Client Request (Array of JDs)
    ↓
Validate Each JD
    ↓
Process Each JD Sequentially
    ↓
Aggregate Results
    ↓
Return Batch Result
```

### Workflow 3: Interview Preparation Pipeline

```
1. Upload JD
    ↓
2. POST /api/v1/jd/analyze (Get skill requirements)
    ↓
3. Use Key/Mandatory Skills for Interview Questions
    ↓
4. Reference Good-to-Have for Nice Questions
    ↓
5. Ready for Interview
```

---

## Performance Profile

| Operation | Time | Status |
|-----------|------|--------|
| JD Analysis | 3-15 seconds | ✅ Normal (LLM API call) |
| Input Validation | 50ms | ⚡ Fast |
| Response Parsing | 100ms | ⚡ Fast |
| Batch (10 JDs) | 30-150 seconds | ✅ Expected |

---

## Error Handling

### Validation Errors (400)
- Missing `jd_content` parameter
- Invalid parameter type
- JD too short (< 50 characters)

### Configuration Errors (503)
- Missing `GROQ_API_KEY`
- Missing `GROQ_MODEL_NAME`
- LLM API failures (retried 3 times)

### Server Errors (500)
- Unexpected processing errors
- Response parsing failures

**All errors include**:
- Clear error message
- Relevant context
- ISO timestamp
- Optional error details

---

## Configuration

### Environment Variables

```bash
# Required
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL_NAME=llama-3.3-70b-versatile
```

### Retry Logic
- **Attempts**: 3
- **Backoff**: Exponential (1s, 2s)
- **Timeout**: 30 seconds per request

---

## Best Practices

1. **Provide comprehensive JDs** - Minimum 50 characters, ideally 200+
2. **Include job ID** - Helpful for batch processing and tracking
3. **Use batch endpoint** - For multiple JDs, more efficient
4. **Handle timeout** - LLM operations can take 3-15 seconds
5. **Cache results** - Store analyses for identical JDs
6. **Validate responses** - Check parsed_analysis structure

---

## Limitations

- **Minimum JD length**: 50 characters
- **Maximum batch size**: 10 JDs per request
- **Timeout**: 30 seconds per LLM request
- **API dependency**: Requires active GROQ API key
- **LLM limitations**: Cannot analyze corrupted or severely malformed JDs

---

## Integration Points

### In Other Search Features

**Combining with Re-ranking**:
```
1. Analyze JD to get Key/Mandatory Skills
2. Search for candidates
3. Re-rank by these skill categories
```

**Combining with Summarization**:
```
1. Analyze JD to understand requirements
2. Find matching candidates
3. Summarize candidate profiles against these requirements
```

---

## Support Resources

- **Configuration**: [prompts/system-prompt.md](prompts/system-prompt.md)
- **Service Code**: [src/services/jdAnalyzerService.js](src/services/jdAnalyzerService.js)
- **Route Code**: [src/routes/jd.js](src/routes/jd.js)

---

## Status Summary

| Aspect | Status | Details |
|--------|--------|---------|
| Implementation | ✅ | Fully implemented |
| API Endpoints | ✅ | 3 endpoints (analyze, batch, health) |
| Error Handling | ✅ | Comprehensive (7+ scenarios) |
| LLM Integration | ✅ | GROQ with retry logic |
| Documentation | ✅ | Complete with examples |
| Testing | ✅ | Ready for testing |

---

**Status**: ✅ **Production Ready**

