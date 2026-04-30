# Panel Pulse --- Application Architecture

AI‑Powered Interview Panel Efficiency Evaluation System

------------------------------------------------------------------------

## 1. High-Level Overview

### Goal

Build an enterprise grade AI system that evaluates interview panel efficiency by
analyzing:

-   Job Description (JD)
-   L1 Interview Transcript
-   L2 Rejection Reason

The system determines:

1.  Panel Efficiency Score (0--10)
2.  Dimension-wise evaluation
3.  Evidence from interviewer questions
4.  Validation of L2 rejection reasons
5.  Probing depth classification

------------------------------------------------------------------------

## 2. Core Inputs

### Input 1 --- Job Description

Fields:

Job Interview ID\
JD

------------------------------------------------------------------------

### Input 2 --- L1 Interview Data

Job Interview ID\
candidate_id\
candidate_name\
role\
panel_member_id\
panel_member_name\
panel_member_email\
L1_decision\
Transcript

------------------------------------------------------------------------

### Input 3 --- L2 Rejection Data

Job Interview ID\
L2 Rejected Reason

Example: - Poor automation skills - Weak TypeScript knowledge

------------------------------------------------------------------------

## 3. Core Output

### PART A --- Panel Efficiency Score

  Dimension                    Max
  ---------------------------- -----
  Mandatory Skill Coverage     2.0
  Technical Depth              1.5
  Scenario / Risk Evaluation   1.0
  Framework Knowledge          1.0
  Hands-on Validation          1.0
  Leadership Evaluation        1.0
  Behavioral Assessment        1.0
  Interview Structure          1.5

Score Categories:

0 -- 4.9 → Poor\
5 -- 7.9 → Moderate\
8 -- 10 → Good

------------------------------------------------------------------------

### PART B --- L2 Rejection Validation

Classification:

No L1 probing → NO PROBING\
Surface probing → SURFACE PROBING\
Deep probing + weakness exposed → DEEP PROBING

Example:

Rejection Reason: Weak knowledge in TypeScript

Evidence: "What is TypeScript interface?"

Verdict: SURFACE PROBING

------------------------------------------------------------------------

## 4. System Architecture

Excel Data\
↓\
LLM based Data Processing (Adding more context to JD)\
↓\
MongoDB (pp_db)\
↓\
LLM Analysis\
↓\
Evaluation Output\
↓\
Stored Back to Mongo\
↓\
UI Dashboard

------------------------------------------------------------------------

## 5. Logical Architecture

Layers:

UI Layer\
API Layer\
AI Orchestration Layer\
Data Layer\
LLM Layer

------------------------------------------------------------------------

## 6. Data Layer

Database: `pp_db`\
Collection: `pp_jd_collection`

Example Documents:

### JD Document

``` json
{
  "Job Interview ID": "JD12778",
  "JD": "Strong SQL proficiency..."
}
```

### L1 Interview Document

``` json
{
  "Job Interview ID": "JD12778",
  "candidate_name": "Nikhil",
  "panel_member_name": "Meera Nair",
  "L1_decision": "Selected",
  "Transcript": "Interviewer: ..."
}
```

### L2 Rejection Document

``` json
{
  "Job Interview ID": "JD12778",
  "L2 Rejected Reason": "Weak knowledge in window functions"
}
```

------------------------------------------------------------------------

## 7. AI Evaluation Pipeline

API Trigger\
↓\
Python Node\
↓\
Mongo Retrieval\
↓\
Prompt Template\
↓\
LLM Evaluation\
↓\
Output Formatter\
↓\
Mongo Storage

------------------------------------------------------------------------

## 8. API Layer

Example endpoint:

POST /api/v1/evaluate

Request:

``` json
{
 "job_id": "JD12778"
}
```

Response: Panel efficiency report

------------------------------------------------------------------------

## 9. UI Layer

Features:

Panel list\
Candidate search\
Panel search\
Panel efficiency report\
Evaluate button

------------------------------------------------------------------------

## 10. Data Flow

Excel Upload\
↓\
MongoDB\
↓\
UI Search\
↓\
Evaluate Button\
↓\
API Trigger\
↓\
LLM\
↓\
Evaluation Output

------------------------------------------------------------------------

## 11. Future Enhancements

Batch evaluation\
Panel analytics dashboard\
Responsible AI audit

------------------------------------------------------------------------

## 12. Deployment Architecture

- API Layer (Express Routes)
        Exposes HTTP endpoints (/v1/...), request validation, size limits, versioning.
  
- SearchService – orchestrates BM25, vector, hybrid, re-ranking, summarization.
- EmbeddingService – wraps Mistral embedding API (configurable model).
- LLMService – wraps Mistral (or other) LLM for re-ranking + summarization + metadata extraction.
- PanelDataRepository – MongoDB CRUD, BM25 queries, vector queries.
- LoggingService – logging, request IDs, timing metrics.

- LLM API\
- Frontend Dashboard

------------------------------------------------------------------------

## 13. Recommended Tech Stack

Backend: node.js, FastAPI\
Database: MongoDB Atlas\
Frontend: React / Next.js
Embeddings: Mistral Embeddings
LLM: GROQ

------------------------------------------------------------------------

## 14. Project Folder Structure

panel-probing-evaluator/

backend/\
  api/\
  services/\
  prompts/\
  db/

frontend/\
  pages/\
  components/

data/\
  jd.csv\
  l1.csv\
  l2.csv

------------------------------------------------------------------------

## 15. Development Strategy

Phase 1: Excel/csv → Mongo ingestion\
Phase 2: API layer\
Phase 3: AI evaluation pipeline\
Phase 4: UI dashboard\
Phase 5: Analytics

------------------------------------------------------------------------

Final System:

Excel/csv Data → MongoDB → LLM Evaluation → MongoDB Results → UI Dashboard

