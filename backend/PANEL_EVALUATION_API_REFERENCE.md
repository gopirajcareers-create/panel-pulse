# Panel Evaluation API Reference

## Quick Start

### Base URL
```
http://localhost:3000/api/v1/panel
```

### Health Check
```bash
curl http://localhost:3000/api/v1/panel/health
```

### Score Interview
```bash
curl -X POST http://localhost:3000/api/v1/panel/score \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_123",
    "jd": "Senior Developer...",
    "l1_transcripts": ["Transcript 1...", "Transcript 2..."]
  }'
```

---

## API Endpoints

### 1. Panel Health Check

```
GET /health
```

**Purpose**: Verify panel evaluation service is operational

**Query Parameters**: None

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**: None

**Response (200 - Success)**:
```json
{
  "success": true,
  "service": "panel-evaluator",
  "status": "healthy",
  "configuration": {
    "groq_configured": true,
    "groq_model": "llama-3.3-70b-versatile",
    "dimensions_loaded": 8,
    "schema_validated": true
  },
  "timestamp": "2026-03-06T10:12:59.367Z"
}
```

**Response (500 - Error)**:
```json
{
  "success": false,
  "error": "Health check failed",
  "details": "...",
  "timestamp": "2026-03-06T10:12:59.367Z"
}
```

**Use Cases**:
- Deployment validation
- Health monitoring
- Service status checks
- Configuration verification

**Example - JavaScript**:
```javascript
async function checkHealth() {
  const response = await fetch('http://localhost:3000/api/v1/panel/health');
  const data = await response.json();
  console.log(data.status); // "healthy"
}
```

---

### 2. Get Scoring Dimensions

```
GET /dimensions
```

**Purpose**: Retrieve panel scoring dimensions and their weights

**Query Parameters**: None

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**: None

**Response (200 - Success)**:
```json
{
  "success": true,
  "dimensions": {
    "Mandatory Skill Coverage": {
      "max_score": 10,
      "weight": 0.15,
      "weight_percentage": "15%"
    },
    "Technical Depth": {
      "max_score": 10,
      "weight": 0.2,
      "weight_percentage": "20%"
    },
    "Scenario / Risk Evaluation": {
      "max_score": 10,
      "weight": 0.15,
      "weight_percentage": "15%"
    },
    "Framework Knowledge": {
      "max_score": 10,
      "weight": 0.1,
      "weight_percentage": "10%"
    },
    "Hands-on Validation": {
      "max_score": 10,
      "weight": 0.15,
      "weight_percentage": "15%"
    },
    "Leadership Evaluation": {
      "max_score": 10,
      "weight": 0.1,
      "weight_percentage": "10%"
    },
    "Behavioral Assessment": {
      "max_score": 10,
      "weight": 0.1,
      "weight_percentage": "10%"
    },
    "Interview Structure": {
      "max_score": 10,
      "weight": 0.05,
      "weight_percentage": "5%"
    }
  },
  "total_weight": 1,
  "timestamp": "2026-03-06T10:13:24.287Z"
}
```

**Use Cases**:
- UI display of scoring dimensions
- Weight calculation verification
- Documentation/reports
- Training materials

**Example - Python**:
```python
import requests

response = requests.get('http://localhost:3000/api/v1/panel/dimensions')
dimensions = response.json()['dimensions']
for name, info in dimensions.items():
    print(f"{name}: {info['weight_percentage']}")
```

---

### 3. Panel Score Evaluation

```
POST /score
```

**Purpose**: Evaluate candidate interview transcripts and generate panel score

**Query Parameters**: None

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "job_id": "job_123",
  "jd": "Senior Full Stack Developer - 5+ years experience...",
  "l1_transcripts": [
    "Interview transcript segment 1...",
    "Interview transcript segment 2...",
    "Interview transcript segment 3..."
  ],
  "l2_rejection_reasons": []
}
```

**Parameters**:

| Name | Type | Required | Max Length | Description |
|------|------|----------|-----------|-------------|
| job_id | string | Yes | 255 | Unique job identifier |
| jd | string | Yes | 10000 | Job description with requirements |
| l1_transcripts | array | Yes | 5 items | Interview transcripts (non-empty) |
| l2_rejection_reasons | array | No | - | Reasons for L2 rejection (if applicable) |

**Response (200 - Success)**:
```json
{
  "success": true,
  "job_id": "job_123",
  "panel_score": 8,
  "confidence": 0.9,
  "category_scores": {
    "Mandatory Skill Coverage": 8,
    "Technical Depth": 9,
    "Scenario / Risk Evaluation": 7,
    "Framework Knowledge": 9,
    "Hands-on Validation": 8,
    "Leadership Evaluation": 6,
    "Behavioral Assessment": 8,
    "Interview Structure": 8
  },
  "probing_verdict": "SURFACE_PROBING",
  "evidence_count": 5,
  "l2_validation": {
    "matches_evidence": true,
    "notes": "Candidate's experience and skills align with requirements..."
  },
  "full_evaluation": {
    "job_id": "job_123",
    "score": 8,
    "confidence": 0.9,
    "categories": { /* scores */ },
    "evidence": [
      {
        "quote": "I have 6 years of experience...",
        "source": "transcript_1:1-2",
        "timestamp": "2024-03-16T14:30:00Z"
      }
    ],
    "probing_verdict": "SURFACE_PROBING",
    "l2_validation": { /* validation */ }
  },
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

**Response (400 - Bad Request)**:
```json
{
  "success": false,
  "error": "Missing required parameters: job_id, jd, l1_transcripts",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

**Response (503 - Service Unavailable)**:
```json
{
  "success": false,
  "error": "Failed to call GROQ API after 3 attempts",
  "details": "timeout: GROQ API call exceeded 30 seconds",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

**Response (500 - Internal Error)**:
```json
{
  "success": false,
  "error": "Internal server error during panel scoring",
  "details": "...",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

**Status Codes**:
- `200`: Scoring completed successfully
- `400`: Invalid input (missing/invalid parameters)
- `503`: GROQ API unavailable (retry after 60 seconds)
- `500`: Internal server error

**Probing Verdicts**:
- `STRONG_PROBING`: Score 8-10, move to next round
- `SURFACE_PROBING`: Score 6-7, conduct targeted probing
- `DEEP_PROBING`: Score <6, investigate gaps or reject

**Confidence Levels**:
- `0.9-1.0`: Very High (strong evidence)
- `0.7-0.9`: High (good evidence)
- `0.5-0.7`: Moderate (some evidence)
- `<0.5`: Low (limited evidence)

**Use Cases**:
- Evaluate L1 interview transcripts
- Generate candidate scores
- Support hiring decisions
- Document evaluation evidence
- Identify skill gaps

**Example - cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/panel/score \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_123",
    "jd": "Senior Full Stack Developer...",
    "l1_transcripts": [
      "Candidate: I have 6 years of React experience...",
      "Interviewer: Tell us about microservices...",
      "Candidate: I implemented microservices using..."
    ]
  }' | python3 -m json.tool
```

**Example - Node.js/JavaScript**:
```javascript
const panelScore = await fetch('http://localhost:3000/api/v1/panel/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job_id: 'job_123',
    jd: 'Senior Developer...',
    l1_transcripts: [
      'Transcript 1...',
      'Transcript 2...'
    ]
  })
}).then(r => r.json());

console.log(`Score: ${panelScore.panel_score}/10`);
console.log(`Verdict: ${panelScore.probing_verdict}`);
```

**Example - Python**:
```python
import requests

payload = {
    'job_id': 'job_123',
    'jd': 'Senior Full Stack Developer...',
    'l1_transcripts': [
        'Transcript 1...',
        'Transcript 2...',
        'Transcript 3...'
    ]
}

response = requests.post(
    'http://localhost:3000/api/v1/panel/score',
    json=payload
)

result = response.json()
print(f"Score: {result['panel_score']}")
print(f"Confidence: {result['confidence']}")
print(f"Verdict: {result['probing_verdict']}")
```

---

### 4. L2 Rejection Validation

```
POST /validate-l2
```

**Purpose**: Validate L2 rejection reasons against L1 interview evidence

**Query Parameters**: None

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "job_id": "job_123",
  "l2_reason": "Candidate lacks Kubernetes expertise",
  "l1_transcripts": [
    "Interview transcript segment 1...",
    "Interview transcript segment 2...",
    "Interview transcript segment 3..."
  ]
}
```

**Parameters**:

| Name | Type | Required | Max Length | Description |
|------|------|----------|-----------|-------------|
| job_id | string | Yes | 255 | Unique job identifier |
| l2_reason | string | Yes | 1000 | Reason for L2 rejection |
| l1_transcripts | array | Yes | 5 items | Original L1 transcripts (non-empty) |

**Response (200 - Success)**:
```json
{
  "success": true,
  "job_id": "job_123",
  "l2_reason": "Candidate lacks Kubernetes expertise",
  "probing_verdict": "SURFACE_PROBING",
  "confidence": 0.8,
  "evidence_found": 1,
  "validation_notes": "Candidate mentions limited exposure...",
  "full_validation": {
    "job_id": "job_123",
    "probing_verdict": "SURFACE_PROBING",
    "evidence": [
      {
        "quote": "I have some exposure to Kubernetes but not expert...",
        "source": "transcript_3"
      }
    ],
    "confidence": 0.8,
    "notes": "Candidate mentions limited exposure..."
  },
  "timestamp": "2026-03-06T10:13:36.488Z"
}
```

**Response (400 - Bad Request)**:
```json
{
  "success": false,
  "error": "Missing required parameters: job_id, l2_reason, l1_transcripts",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

**Response (503 - Service Unavailable)**:
```json
{
  "success": false,
  "error": "Failed to call GROQ API after 3 attempts",
  "details": "timeout: GROQ API call exceeded 30 seconds",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

**Status Codes**:
- `200`: Validation completed successfully
- `400`: Invalid input (missing/invalid parameters)
- `503`: GROQ API unavailable (retry after 60 seconds)
- `500`: Internal server error

**Use Cases**:
- Validate rejection reasons
- Support hiring decisions
- Document rejection evidence
- Audit trail for rejections
- Dispute resolution

**Example - cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/panel/validate-l2 \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_123",
    "l2_reason": "Insufficient Docker experience",
    "l1_transcripts": [
      "I have basic Docker knowledge...",
      "Never used Docker in production...",
      "Only worked with VM deployments..."
    ]
  }' | python3 -m json.tool
```

---

## Common Workflows

### Workflow 1: Full L1 Scoring

```
1. Interview Conducted & Transcribed
   ↓
2. POST /score
   - Input: job_id, jd, l1_transcripts
   - Output: panel_score, category_scores, verdict
   ↓
3. Review Score & Verdict
   ├─ STRONG_PROBING → Move to L2
   ├─ SURFACE_PROBING → Conditional Probing Interview
   └─ DEEP_PROBING → Deep Investigation or Rejection
   ↓
4. Document Score in System
```

### Workflow 2: L2 Rejection Validation

```
1. L2 Interview Conducted
   ↓
2. Rejection Decision Made
   ↓
3. POST /validate-l2
   - Input: job_id, l2_reason, l1_transcripts
   - Output: evidence_found, confidence, validation_notes
   ↓
4. Review Validation
   - If evidence matches: Proceed with rejection
   - If evidence insufficient: Re-evaluate
   ↓
5. Document Rejection Reason
```

### Workflow 3: Batch Candidate Evaluation

```
For Each Candidate:
  ├─ Transcribe Interview
  ├─ POST /score
  ├─ Record Results
  └─ Compare Across Candidates

Summary Report:
  - Top Candidates
  - Average Score
  - Skill Gaps
  - Hiring Recommendations
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": "Technical details if available",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Missing required parameters | Incomplete request | Check all required fields present |
| l1_transcripts must be non-empty | Empty array provided | Add at least one transcript |
| Failed to call GROQ API | LLM service timeout | Retry or check GROQ service status |
| JSON parsing error | Invalid LLM response | Contact support |
| Timeout exceeded | Process too slow | Reduce transcript length or retry |

### Retry Strategy

```javascript
async function scoreWithRetry(data, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:3000/api/v1/panel/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.status === 200) {
        return response.json();
      } else if (response.status === 503) {
        // Service unavailable - wait and retry
        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60s
        continue;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}
```

---

## Rate Limiting

**Current Limits** (Production):
- Per User: 50 requests/minute
- Per IP: 100 requests/minute
- Concurrent Requests: 10 maximum

**Throttle Response**:
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "details": "Maximum requests exceeded. Try again in 60 seconds.",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

---

## Performance Optimization

### Response Time Estimates

| Operation | Avg Time | Components |
|-----------|----------|------------|
| Health Check | 50ms | Database verification |
| Dimensions | 80ms | Cache lookup |
| Panel Score | 18-22s | 3-5 GROQ API calls |
| L2 Validation | 12-16s | 2-3 GROQ API calls |

### Optimization Tips

1. **Batch Requests**: Group similar evaluations
2. **Cache Results**: Store JD analyses
3. **Parallel Processing**: Score multiple candidates simultaneously
4. **Async Pattern**: Use webhooks for callbacks
5. **Connection Pooling**: Reuse HTTP connections

---

## Authentication (Future)

**Bearer Token** (when implemented):
```
Authorization: Bearer YOUR_API_TOKEN
```

**Example**:
```bash
curl -X GET http://localhost:3000/api/v1/panel/health \
  -H "Authorization: Bearer abc123xyz"
```

---

## Webhooks (Future)

**Callback on Completion**:
```json
{
  "event": "panel_score_completed",
  "job_id": "job_123",
  "candidate_id": "cand_456",
  "score": 8,
  "verdict": "SURFACE_PROBING",
  "timestamp": "2026-03-06T10:13:20.484Z"
}
```

---

## SDK Examples

### Python SDK Pattern

```python
class PanelEvaluator:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = f"{base_url}/api/v1/panel"
    
    def health(self):
        return self._get("/health")
    
    def dimensions(self):
        return self._get("/dimensions")
    
    def score(self, job_id, jd, transcripts):
        return self._post("/score", {
            "job_id": job_id,
            "jd": jd,
            "l1_transcripts": transcripts
        })
    
    def validate_l2(self, job_id, reason, transcripts):
        return self._post("/validate-l2", {
            "job_id": job_id,
            "l2_reason": reason,
            "l1_transcripts": transcripts
        })
    
    def _get(self, endpoint):
        # Implementation
        pass
    
    def _post(self, endpoint, data):
        # Implementation
        pass

# Usage
evaluator = PanelEvaluator()
score = evaluator.score("job_123", "Senior Dev...", ["T1...", "T2..."])
print(f"Score: {score['panel_score']}")
```

### JavaScript/Node.js SDK Pattern

```javascript
class PanelEvaluator {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = `${baseUrl}/api/v1/panel`;
  }

  async health() {
    return this._get('/health');
  }

  async dimensions() {
    return this._get('/dimensions');
  }

  async score(jobId, jd, transcripts) {
    return this._post('/score', {
      job_id: jobId,
      jd,
      l1_transcripts: transcripts
    });
  }

  async validateL2(jobId, reason, transcripts) {
    return this._post('/validate-l2', {
      job_id: jobId,
      l2_reason: reason,
      l1_transcripts: transcripts
    });
  }

  async _get(endpoint) {
    const response = await fetch(this.baseUrl + endpoint);
    return response.json();
  }

  async _post(endpoint, data) {
    const response = await fetch(this.baseUrl + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }
}

// Usage
const evaluator = new PanelEvaluator();
const result = await evaluator.score('job_123', 'Senior Dev...', ['T1...', 'T2...']);
console.log(`Score: ${result.panel_score}`);
```

---

## Support & Troubleshooting

### Health Check Diagnostic

```bash
# 1. Check service is running
curl http://localhost:3000/api/v1/panel/health

# 2. If health fails, verify configuration
echo $GROQ_API_KEY
echo $GROQ_MODEL_NAME

# 3. Check backend logs
tail -f /tmp/panel-server.log

# 4. Test network connectivity
curl -I http://localhost:3000/api/v1/panel/health
```

### Common Issues

**Issue**: Service returns 503 timeout
- **Check**: GROQ API status and key validity
- **Solution**: Retry after 60 seconds or contact support

**Issue**: Consistently low scores
- **Check**: Transcript quality and JD specificity
- **Solution**: Provide more detailed interview data

**Issue**: Inconsistent scores for same input
- **Check**: Backend logs for errors
- **Solution**: All results are deterministic; inconsistency may indicate data changes

---

## Changelog

### v1.0 (2024-03-16)
- Initial release
- 4 API endpoints
- 8-dimensional scoring
- L2 validation system
- GROQ LLM integration

---

## Version Info

- **API Version**: 1.0
- **Backend**: Node.js Express
- **Database**: MongoDB
- **LLM Provider**: GROQ
- **Model**: llama-3.3-70b-versatile
- **Documentation Date**: March 16, 2024
