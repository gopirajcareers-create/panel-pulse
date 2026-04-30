# Interview Moderation Layer

## Overview
The moderation layer automatically checks interview transcripts for potentially discriminatory or inappropriate questions that violate hiring regulations and best practices.

## Features

### Automatic Detection
The system automatically analyzes interview transcripts during panel evaluation and flags questions related to:

1. **Age** - Birth year, graduation dates revealing age, retirement plans
2. **Marital Status** - Marriage, spouse, children, family planning
3. **Religion** - Religious beliefs, practices, holidays
4. **Gender/Sexual Orientation** - Gender identity or sexual orientation questions
5. **Race/Ethnicity** - Race, ethnicity, or national origin
6. **Disability/Health** - Health conditions or disabilities (unless job-related)
7. **Language/Region** - Language proficiency or regional bias

### Display Format
Each category is displayed with a **Yes/No** indicator:
- **NO** (Green background) - No discriminatory questions detected
- **YES** (Red background) - Potentially discriminatory questions found

### Severity Levels
- **None** - No violation detected
- **Low** - Borderline or context-dependent
- **Medium** - Indirect or implied discrimination
- **High** - Direct discriminatory question

### Overall Compliance Status
- **PASS** (Green) - Interview is compliant
- **WARNING** (Orange) - Minor issues detected
- **FAIL** (Red) - Significant compliance violations

## Implementation Details

### Backend Components

#### Moderation Service
**File**: `backend/src/services/moderationService.js`

Analyzes transcripts using LLM to detect discriminatory questions:
```javascript
analyzeInterviewModeration({ l1_transcript, job_id })
```

#### API Endpoint
**Endpoint**: `POST /api/v1/panel/moderation`

**Request Body**:
```json
{
  "job_id": "JOB123",
  "panel_name": "John Doe",
  "candidate_name": "Jane Smith",
  "l1_transcript": "Interview transcript text..."
}
```

**Response**:
```json
{
  "success": true,
  "job_id": "JOB123",
  "moderation": {
    "flags": {
      "age": { "detected": false, "evidence": [], "severity": "none" },
      "marital_status": { "detected": true, "evidence": ["Do you have children?"], "severity": "high" },
      ...
    },
    "overall_compliance": "fail",
    "summary": "Detected marital status question which is not permitted."
  }
}
```

### Frontend Components

#### ModerationCard Component
**File**: `frontend/src/components/features/evaluation/ModerationCard.tsx`

Displays moderation results in a card format with:
- Category-by-category Yes/No indicators
- Evidence tooltips on hover for detected issues
- Overall compliance status badge
- Summary of findings

#### Integration
The moderation card appears on the Results page after the panel summary, showing:
- All 7 moderation categories
- Color-coded indicators (green/red)
- Detailed evidence on hover
- Compliance status

### Database Schema
Moderation results are stored in the `panel_evaluations` collection:

```json
{
  "Job Interview ID": "JOB123",
  "Panel Name": "John Doe",
  "Candidate Name": "Jane Smith",
  "moderation": {
    "flags": { ... },
    "overall_compliance": "pass|warning|fail",
    "summary": "..."
  },
  "moderation_analyzed_at": "2024-01-15T10:30:00.000Z"
}
```

## Usage

### Automatic Evaluation
Moderation runs automatically during panel evaluation:

1. Upload interview transcript via the Evaluate page
2. System processes the evaluation
3. Moderation analysis runs in parallel with other evaluations
4. Results appear on the Results page under "Interview Moderation"

### Standalone Analysis
You can also analyze a transcript independently:

```bash
curl -X POST http://localhost:3000/api/v1/panel/moderation \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "JOB123",
    "l1_transcript": "Your interview transcript here..."
  }'
```

## Testing

### Test Cases

#### Compliant Interview
```
Interviewer: Can you describe your experience with React?
Candidate: I have 3 years of experience...

Expected: All categories = NO (Green)
```

#### Non-Compliant Interview
```
Interviewer: Are you married? Do you have children?
Interviewer: What year did you graduate from college?

Expected: 
- Marital Status = YES (Red)
- Age = YES (Red)
- Overall Compliance = FAIL
```

## Benefits

1. **Legal Compliance** - Helps organizations avoid discriminatory hiring practices
2. **Interviewer Training** - Identifies areas where interviewers need coaching
3. **Risk Mitigation** - Prevents potential lawsuits and regulatory issues
4. **Quality Control** - Ensures consistent, professional interview standards
5. **Audit Trail** - Maintains records of compliance for regulatory review

## Configuration

The moderation layer uses the same LLM configuration as the panel evaluation:
- **Provider**: GROQ / Mistral / Ollama (configurable)
- **Temperature**: 0.1 (for consistent, conservative detection)
- **Max Tokens**: 800

## Notes

- Moderation analysis is **non-blocking** - if it fails, the panel evaluation still completes
- Context matters: technical questions (e.g., "Do you require visa sponsorship?") are acceptable
- Evidence shows actual interviewer quotes, not candidate responses
- The system is designed to be conservative (minimize false positives)

## Future Enhancements

1. Custom moderation rules per organization
2. Multi-language support
3. Real-time moderation during live interviews
4. Interviewer-specific compliance reports
5. Integration with HR compliance systems
