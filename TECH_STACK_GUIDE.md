# Panel Pulse AI - Tech Stack & Architecture Guide

**Build Your Own AI-Powered Interview Evaluation System**

This guide explains every technology choice, library, API, and architectural pattern used in Panel Pulse. Use this as a blueprint to build similar AI-powered evaluation tools.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack Summary](#tech-stack-summary)
3. [Backend Architecture](#backend-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [Database Layer](#database-layer)
6. [LLM Integration Layer](#llm-integration-layer)
7. [Key Libraries & Tools](#key-libraries--tools)
8. [API Design](#api-design)
9. [Deployment Architecture](#deployment-architecture)
10. [How to Build Something Similar](#how-to-build-something-similar)

---

## Overview

**What is Panel Pulse?**
An AI-powered system that evaluates interview panel efficiency by analyzing:
- Job Descriptions (JD)
- L1 Interview Transcripts
- L2 Rejection Reasons

**Core Output:**
- Panel Efficiency Score (0-10) across 8 dimensions
- Evidence-based evaluation
- Rejection reason validation
- Moderation analysis for bias detection

---

## Tech Stack Summary

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: JavaScript (ES6+)

### Frontend
- **Framework**: React 19.2
- **Build Tool**: Vite 7.3
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.2
- **State Management**: Zustand 5.0
- **Routing**: React Router 7.13

### Database
- **Primary DB**: MongoDB 4.10 (Atlas)
- **Collections**:
  - `panel_collection` - Raw interview data
  - `panel_evaluations` - AI evaluation results

### AI/LLM Layer
- **Primary LLM**: Local Ollama - qwen latest model
- **Embeddings**: Mistral Embed API (1024D vectors)
- **Provider Priority**: Ollama → Mistral

### Authentication
- **Method**: JWT + Cookie-based sessions
- **SSO**: Azure AD (MSAL Node 5.1)

### Deployment
- **PROD**: Local VM - 10.10.142.91
- **Database**: MongoDB Atlas

---

## Backend Architecture

### Core Structure

```
backend/
├── src/
│   ├── index.js              # Main Express server
│   ├── routes/               # API endpoints
│   │   ├── panel.js          # Panel evaluation routes
│   │   ├── auth.js           # Authentication
│   │   ├── jd.js             # Job description operations
│   │   ├── search.js         # Search/filter operations
│   │   └── extract.js        # Data extraction
│   ├── services/             # Business logic
│   │   ├── panelEvaluationService.js  # Core LLM evaluation
│   │   ├── llmClient.js                # Unified LLM client
│   │   ├── embeddingService.js         # Vector embeddings
│   │   ├── mongoClient.js              # Database connection
│   │   └── moderationService.js        # Bias detection
│   ├── middleware/
│   │   └── requireAuth.js    # JWT verification
│   └── prompts/              # LLM prompt templates
├── package.json
└── .env
```

### Why Express.js?

**Reasoning:**
- Lightweight and unopinionated
- Large ecosystem for MongoDB, JWT, file upload
- Easy to integrate LLM APIs (axios/https)
- Fast prototyping for AI pipelines

**Where Used:**
- REST API layer ([src/index.js](panel-pulse/backend/src/index.js))
- Request validation, CORS, JSON parsing
- Protected route middleware

---

## Frontend Architecture

### Core Structure

```
frontend/
├── src/
│   ├── App.tsx                    # Root component + routing
│   ├── main.tsx                   # Entry point
│   ├── pages/                     # Route pages
│   │   ├── DashboardPage.tsx      # Main dashboard
│   │   ├── EvaluatePage.tsx       # Upload & evaluate
│   │   └── ResultsPage.tsx        # Evaluation results
│   ├── components/
│   │   ├── features/              # Feature-specific components
│   │   │   ├── evaluation/        # Score cards, dimensions
│   │   │   ├── dashboard/         # Stats, charts, filters
│   │   │   └── upload/            # File upload UI
│   │   ├── ui/                    # Base UI components
│   │   └── layout/                # AppShell, Sidebar
│   ├── context/
│   │   └── AuthContext.tsx        # Global auth state
│   └── vite.config.ts
├── package.json
└── tailwind.config.js
```

### Why React + Vite?

**React (19.2):**
- Component reusability (DimensionCard, ScoreCard)
- Rich ecosystem (react-hook-form, react-markdown)
- Easy state management with Zustand

**Vite (7.3):**
- Lightning-fast HMR during development
- Optimized production builds
- Native TypeScript support

**TypeScript:**
- Type safety for API responses
- Better IDE autocomplete
- Catches errors at compile time

**Where Used:**
- [DashboardPage.tsx](panel-pulse/frontend/src/pages/DashboardPage.tsx) - Main UI
- [EvaluatePage.tsx](panel-pulse/frontend/src/pages/EvaluatePage.tsx) - File upload
- [ResultsPage.tsx](panel-pulse/frontend/src/pages/ResultsPage.tsx) - Evaluation display

---

## Database Layer

### MongoDB Schema Design

**Why MongoDB?**
- Flexible schema for evolving LLM outputs
- Native JSON storage (LLM responses are JSON)
- Efficient aggregation for analytics
- Atlas free tier for quick deployment

**Collections:**

#### 1. `panel_collection` (Raw Data)
```javascript
{
  "Job Interview ID": "JD12778",
  "JD": "Strong SQL proficiency...",
  "candidate_name": "John Doe",
  "panel_member_name": "Sarah Smith",
  "L1_decision": "Selected",
  "Transcript": "Interviewer: Can you explain...",
  "L2 Rejected Reason": "Weak TypeScript knowledge"
}
```

#### 2. `panel_evaluations` (AI Results)
```javascript
{
  "Job Interview ID": "JD12778",
  "Panel Name": "Sarah Smith",
  "Candidate Name": "John Doe",
  "score": 7.5,
  "confidence": 0.85,
  "categories": {
    "Mandatory Skill Coverage": 1.8,
    "Technical Depth": 1.5,
    "Rejection Validation Alignment": 1.2,
    // ... 5 more dimensions
  },
  "evidence": {
    "Mandatory Skill Coverage": [
      "Interviewer: What is TypeScript interface?"
    ]
  },
  "l2_detailed_validation": {
    "probing_verdict": "SURFACE_PROBING",
    "justifications": { ... }
  },
  "panel_summary": "The panel demonstrated...",
  "refined_jd": {
    "mandatory_skills": ["TypeScript", "React"],
    "good_to_have_skills": ["GraphQL"]
  },
  "moderation": {
    "overall_assessment": "APPROPRIATE",
    "flagged_questions": []
  },
  "evaluated_at": "2026-04-30T10:30:00Z"
}
```

**Where Used:**
- [mongoClient.js](panel-pulse/backend/src/services/mongoClient.js) - Connection pool
- [panelEvaluationService.js](panel-pulse/backend/src/services/panelEvaluationService.js:844-878) - Stores evaluation results

---

## LLM Integration Layer

### Provider Selection (Priority Order)

**1. Ollama (Local)**
- **When**: `OLLAMA_BASE_URL` is set
- **Why**: Data privacy, no API costs, on-premise compliance
- **Model**: llama-3.3-70b-versatile (configurable)


**2. Mistral (Cloud)**
- **When**: `MISTRAL_API_KEY` is set
- **Why**: Multilingual support, good for embeddings
- **Model**: mistral-large-latest
- **API**: `https://api.mistral.ai/v1/chat/completions`

### Unified LLM Client

**File:** [llmClient.js](panel-pulse/backend/src/services/llmClient.js)

**Key Function:**
```javascript
async function callLLM(messages, { temperature = 0.2, maxTokens = 2000 }) {
  // Auto-detects provider and routes request
  // Returns cleaned text (strips <think> blocks)
}
```

**Why This Design?**
- Single interface for all services
- Easy to swap providers (no code changes)
- Automatic fallback chain
- Consistent error handling

**Where Used:**
- [panelEvaluationService.js:377-397](panel-pulse/backend/src/services/panelEvaluationService.js) - All LLM calls
- JD refinement, scoring, L2 validation, moderation

---

### Core LLM Operations

#### 1. Panel Scoring
**Purpose:** Score interview panel across 8 dimensions

**Prompt Strategy:**
- System: "You are an expert panel evaluator..."
- User: Job ID + JD + Transcripts + L2 Reasons
- Temperature: 0.2 (deterministic)
- Max Tokens: 1500

**Output Schema:**
```json
{
  "job_id": "JD12778",
  "score": 7.5,
  "categories": { ... },
  "evidence": { ... },
  "probing_verdict": "SURFACE_PROBING"
}
```

**Implementation:** [panelEvaluationService.js:108-202](panel-pulse/backend/src/services/panelEvaluationService.js)

#### 2. L2 Rejection Validation
**Purpose:** Check if L1 panel probed rejection areas

**Verdicts:**
- `NO_PROBING` - Panel didn't ask about it
- `SURFACE_PROBING` - Asked basic questions
- `DEEP_PROBING` - Thorough technical probing

**Implementation:** [panelEvaluationService.js:213-250](panel-pulse/backend/src/services/panelEvaluationService.js)

#### 3. JD Skill Extraction
**Purpose:** Extract mandatory vs nice-to-have skills

**Output:**
```json
{
  "mandatory_skills": ["TypeScript", "React"],
  "good_to_have_skills": ["GraphQL"],
  "key_skills": ["Node.js", "MongoDB"]
}
```

**Implementation:** [panelEvaluationService.js:609-685](panel-pulse/backend/src/services/panelEvaluationService.js)

#### 4. Panel Summary Generation
**Purpose:** Natural language summary for HR

**Sections:**
- Panel Member Behavior
- Interview Process
- Rejection Reason Validation
- Recommendations

**Implementation:** [panelEvaluationService.js:746-796](panel-pulse/backend/src/services/panelEvaluationService.js)

#### 5. Moderation Analysis
**Purpose:** Detect discriminatory/inappropriate questions

**Categories:** Age, Gender, Religion, Ethnicity, Disability, etc.

**Output:**
```json
{
  "overall_assessment": "APPROPRIATE",
  "flagged_questions": [],
  "concerns": []
}
```

---

### Embeddings for Semantic Search

**Service:** [embeddingService.js](panel-pulse/backend/src/services/embeddingService.js)

**Provider:** Mistral Embed API
- **Model:** `mistral-embed`
- **Dimensions:** 1024D vectors
- **API:** `https://api.mistral.ai/v1/embeddings`

**Why Embeddings?**
- Semantic search over JDs and transcripts
- Find similar interview patterns
- Hybrid search (BM25 + Vector)

**Where Used:**
- Vector search in MongoDB
- Hybrid search pipeline

---

## Key Libraries & Tools

### Backend Dependencies

| Library | Version | Purpose | Why This Choice |
|---------|---------|---------|-----------------|
| **express** | 4.18 | Web framework | Industry standard, minimal |
| **mongodb** | 4.10 | Database driver | Native MongoDB operations |
| **axios** | 1.13 | HTTP client | LLM API calls, retries |
| **jsonwebtoken** | 9.0 | JWT auth | Stateless authentication |
| **bcrypt** | 6.0 | Password hashing | Secure password storage |
| **@azure/msal-node** | 5.1 | Azure AD SSO | Enterprise authentication |
| **dotenv** | 16.0 | Environment variables | Config management |
| **multer** | 2.1 | File upload | Handle .docx, .xlsx, .pdf |
| **mammoth** | 1.12 | DOCX parsing | Extract text from Word docs |
| **xlsx** | 0.18 | Excel parsing | Read L2 rejection sheets |
| **pdf-parse** | 2.4 | PDF parsing | Extract text from PDFs |
| **morgan** | 1.10 | HTTP logging | Request/response logs |
| **nodemailer** | 8.0 | Email sending | OTP verification |
| **resend** | 6.9 | Transactional email | Modern email API |
| **cookie-parser** | 1.4 | Parse cookies | JWT cookie handling |
| **nodemon** | 2.0 | Dev server | Auto-restart on changes |

### Frontend Dependencies

| Library | Version | Purpose | Why This Choice |
|---------|---------|---------|-----------------|
| **react** | 19.2 | UI library | Component-based UI |
| **react-dom** | 19.2 | React renderer | DOM rendering |
| **vite** | 7.3 | Build tool | Fast dev server, HMR |
| **typescript** | 5.9 | Type system | Type safety |
| **tailwindcss** | 4.2 | CSS framework | Utility-first styling |
| **react-router-dom** | 7.13 | Routing | Client-side routing |
| **zustand** | 5.0 | State management | Lightweight, no boilerplate |
| **axios** | 1.13 | HTTP client | API calls to backend |
| **react-hook-form** | 7.71 | Form handling | Performant form validation |
| **zod** | 4.3 | Schema validation | TypeScript-first validation |
| **framer-motion** | 12.35 | Animations | Smooth UI transitions |
| **lucide-react** | 0.577 | Icons | Clean, consistent icons |
| **react-markdown** | 10.1 | Markdown rendering | Display LLM summaries |
| **remark-gfm** | 4.0 | Markdown extensions | GitHub-flavored markdown |
| **recharts** | 3.7 | Charts | Score visualization |
| **react-dropzone** | 15.0 | File upload | Drag-and-drop upload UI |
| **react-hot-toast** | 2.6 | Notifications | Toast messages |
| **html2canvas** | 1.4 | Screenshot | Export results as image |
| **jspdf** | 4.2 | PDF generation | Export results as PDF |

---

## API Design

### Base URL Structure

```
https://api.panelpulse.com/api/v1
```

### Key Endpoints

#### Authentication
```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/verify-otp
POST /api/v1/auth/azure/initiate
POST /api/v1/auth/azure/callback
```

#### Panel Evaluation
```http
POST   /api/v1/panel/score          # Trigger evaluation
GET    /api/v1/panel/score/job/:id  # Poll async job
GET    /api/v1/panel/evaluation/:id # Get result by ID
GET    /api/v1/panel/search          # Filter evaluations
GET    /api/v1/panel/stats           # Dashboard stats
GET    /api/v1/panel/dimensions      # Get scoring dimensions
POST   /api/v1/panel/validate-l2     # L2 validation only
POST   /api/v1/panel/moderation      # Moderation only
```

#### Insights
```http
GET /api/v1/panel/insights/directory       # All panelists
GET /api/v1/panel/insights/profile/:name   # Panelist history
GET /api/v1/panel/efficiency               # Panel efficiency stats
```

### Request/Response Format

**Evaluation Request:**
```json
POST /api/v1/panel/score
{
  "job_id": "JD12778",
  "panel_name": "Sarah Smith",
  "candidate_name": "John Doe",
  "jd": "Job description text...",
  "l1_transcripts": ["Transcript 1...", "Transcript 2..."],
  "l2_rejection_reasons": ["Weak TypeScript knowledge"]
}
```

**Async Response (202):**
```json
{
  "success": true,
  "async_job_id": "uuid-here",
  "status": "processing"
}
```

**Poll Job (GET):**
```http
GET /api/v1/panel/score/job/{async_job_id}
```

**Final Result (200):**
```json
{
  "success": true,
  "status": "complete",
  "job_id": "JD12778",
  "panel_score": 7.5,
  "confidence": 0.85,
  "category_scores": { ... },
  "full_evaluation": { ... },
  "refined_jd": { ... },
  "panel_summary": "The panel demonstrated..."
}
```

**Why Async Design?**
- LLM calls take 10-60 seconds
- Prevents client timeout
- Better UX with progress polling

---

## Deployment Architecture

### Production Setup

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Vercel    │────────▶│   Railway API    │────────▶│   MongoDB   │
│  (Frontend) │  HTTPS  │   (Express.js)   │  TLS    │    Atlas    │
└─────────────┘         └──────────────────┘         └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        Local LLm API   │
                        │  (LLM Calls) │
                        └──────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ Mistral API  │
                        │ (Embeddings) │
                        └──────────────┘
```

### Environment Variables

**Backend (.env):**
```bash
# Server
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://panel-pulse.vercel.app

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/panel_db
MONGODB_DB=panel_db

# LLM Providers (set ONE or more)
GROQ_API_KEY=gsk_xxxxx
GROQ_MODEL_NAME=llama-3.3-70b-versatile

MISTRAL_API_KEY=xxxxx
MISTRAL_MODEL_NAME=mistral-large-latest

OLLAMA_BASE_URL=http://localhost:11434  # Optional: local
OLLAMA_MODEL_NAME=llama-3.3-70b-versatile

# Auth
JWT_SECRET=your-secret-key-here
AZURE_CLIENT_ID=xxxxx
AZURE_TENANT_ID=xxxxx
AZURE_CLIENT_SECRET=xxxxx

# Email
RESEND_API_KEY=re_xxxxx
```

**Frontend (.env.development):**
```bash
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

**Frontend (.env.production):**
```bash
VITE_API_BASE_URL=https://api.panelpulse.com/api/v1
```

### Deployment Commands

**Backend (Railway):**
```bash
# Automatically deploys from GitHub main branch
# railway.json configures build + start commands
```

**Frontend (Vercel):**
```bash
npm run build  # vite build
# Vercel auto-deploys from GitHub
```

---

## How to Build Something Similar

### Step-by-Step Blueprint

#### Phase 1: Data Ingestion
1. **Setup MongoDB Atlas** (free tier)
2. **Create Express.js API** with file upload routes
3. **Parse documents** (DOCX, XLSX, PDF) using mammoth, xlsx, pdf-parse
4. **Store in MongoDB** with structured schema

**Code Example:**
```javascript
const multer = require('multer');
const mammoth = require('mammoth');
const upload = multer({ storage: multer.memoryStorage() });

app.post('/upload', upload.single('file'), async (req, res) => {
  const { value } = await mammoth.extractRawText({ buffer: req.file.buffer });
  await db.collection('documents').insertOne({ text: value });
  res.json({ success: true });
});
```

#### Phase 2: LLM Integration
1. **Choose LLM provider** (GROQ recommended for speed)
2. **Design prompts** with clear instructions + JSON schema
3. **Create unified LLM client** (see [llmClient.js](panel-pulse/backend/src/services/llmClient.js))
4. **Parse and validate** LLM responses

**Code Example:**
```javascript
const axios = require('axios');

async function callLLM(systemPrompt, userPrompt) {
  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 2000
  }, {
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
  });
  
  return response.data.choices[0].message.content;
}
```

#### Phase 3: Evaluation Pipeline
1. **Retrieve documents** from MongoDB
2. **Build evaluation prompt** with all context
3. **Call LLM** with structured output schema
4. **Parse JSON response**
5. **Store evaluation results** in separate collection

**Code Example:**
```javascript
async function evaluatePanel(jobId) {
  const jd = await db.collection('jds').findOne({ job_id: jobId });
  const transcripts = await db.collection('transcripts').find({ job_id: jobId }).toArray();
  
  const prompt = `Evaluate this interview panel...
Job Description: ${jd.text}
Transcripts: ${transcripts.map(t => t.text).join('\n\n')}

Return JSON with score and categories.`;
  
  const result = await callLLM(SYSTEM_PROMPT, prompt);
  const evaluation = JSON.parse(result);
  
  await db.collection('evaluations').insertOne({
    job_id: jobId,
    ...evaluation,
    evaluated_at: new Date()
  });
  
  return evaluation;
}
```

#### Phase 4: Frontend Dashboard
1. **Setup React + Vite** project
2. **Create API client** with axios
3. **Build upload form** with react-dropzone
4. **Display results** with cards and charts (recharts)
5. **Add authentication** (JWT)

**Code Example:**
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  withCredentials: true
});

async function evaluate(data: FormData) {
  const response = await api.post('/panel/score', data);
  return response.data;
}

function ResultsPage() {
  const [evaluation, setEvaluation] = useState(null);
  
  useEffect(() => {
    const jobId = new URLSearchParams(location.search).get('job_id');
    api.get(`/panel/evaluation/${jobId}`).then(res => {
      setEvaluation(res.data);
    });
  }, []);
  
  return (
    <div>
      <h1>Score: {evaluation?.score}/10</h1>
      {/* Render dimensions, evidence, etc. */}
    </div>
  );
}
```

#### Phase 5: Advanced Features
1. **Async evaluation** with job queue
2. **Embeddings** for semantic search (Mistral)
3. **L2 validation** as separate LLM call
4. **Moderation** for bias detection
5. **Analytics dashboard** with aggregations

---

### Key Design Patterns

#### 1. Unified LLM Client
**Pattern:** Single abstraction over multiple providers
**Benefit:** Easy to swap providers, consistent error handling
**Implementation:** [llmClient.js](panel-pulse/backend/src/services/llmClient.js)

#### 2. Async Evaluation Pattern
**Pattern:** Return job ID immediately, poll for results
**Benefit:** Prevents timeout, better UX
**Implementation:** [panel.js:140-172](panel-pulse/backend/src/routes/panel.js)

#### 3. Structured Prompts
**Pattern:** System prompt + User prompt with JSON schema
**Benefit:** Deterministic LLM outputs, easy validation
**Implementation:** [panelEvaluationService.js:26-94](panel-pulse/backend/src/services/panelEvaluationService.js)

#### 4. Evidence-Based Scoring
**Pattern:** LLM must cite evidence from transcripts
**Benefit:** Auditable, trustworthy evaluations
**Implementation:** Evidence arrays in evaluation schema

#### 5. Parallel LLM Calls
**Pattern:** Run independent LLM operations in parallel
**Benefit:** 3-5x faster total evaluation time
**Implementation:** [panelEvaluationService.js:130-160](panel-pulse/backend/src/services/panelEvaluationService.js)

```javascript
const [l2Validation, panelScore, refinedJd] = await Promise.all([
  validateL2(...),
  scorePanel(...),
  refineJD(...)
]);
```

---

### Common Pitfalls & Solutions

#### 1. LLM Hallucinations
**Problem:** LLM invents evidence not in transcript
**Solution:** 
- Explicit prompt: "Quote ONLY from transcript"
- Validate evidence exists in transcript
- Use low temperature (0.2)

#### 2. JSON Parsing Errors
**Problem:** LLM returns text before/after JSON
**Solution:**
- Balanced-brace parser (see [panelEvaluationService.js:404-437](panel-pulse/backend/src/services/panelEvaluationService.js))
- Regex extraction as fallback
- Retry with clearer prompt

#### 3. Long Transcripts
**Problem:** Transcript exceeds LLM context window
**Solution:**
- Truncate to 14,000 chars (see [panelEvaluationService.js:257-263](panel-pulse/backend/src/services/panelEvaluationService.js))
- Chunk and process separately
- Use embedding-based retrieval first

#### 4. Rate Limits
**Problem:** LLM API rate limits
**Solution:**
- Retry with exponential backoff
- Queue system for batch processing
- Cache results to avoid re-evaluation

#### 5. Timeout Issues
**Problem:** Client timeout before LLM finishes
**Solution:**
- Async job pattern with polling
- WebSocket for real-time updates
- Server timeout > 2 minutes

---

### Performance Optimization

#### 1. Parallel LLM Calls
Run independent operations in parallel:
```javascript
const [score, validation, summary] = await Promise.all([
  scorePanel(),
  validateL2(),
  generateSummary()
]);
// 30s total instead of 90s sequential
```

#### 2. Result Caching
Check if evaluation already exists:
```javascript
const cached = await db.collection('evaluations').findOne({
  job_id, panel_name, candidate_name
});
if (cached) return cached; // Skip LLM call
```

#### 3. Connection Pooling
Reuse MongoDB connections:
```javascript
const client = new MongoClient(uri, { maxPoolSize: 10 });
await client.connect(); // Once at startup
const db = client.db('panel_db');
```

#### 4. Streaming Responses
Stream LLM responses for faster perceived performance:
```javascript
const stream = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

---

### Security Best Practices

#### 1. Environment Variables
Never commit API keys:
```bash
# .env (add to .gitignore)
GROQ_API_KEY=gsk_xxxxx
JWT_SECRET=random-256-bit-string
```

#### 2. JWT Authentication
Verify tokens on protected routes:
```javascript
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.use('/api/v1/panel', requireAuth, panelRoutes);
```

#### 3. Input Validation
Sanitize user inputs before LLM calls:
```javascript
const sanitize = (text) => text.replace(/<script>/gi, '').substring(0, 10000);
const cleanTranscript = sanitize(req.body.transcript);
```

#### 4. CORS Configuration
Restrict origins:
```javascript
const allowedOrigins = [
  'https://panel-pulse.vercel.app',
  'http://localhost:5173'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  next();
});
```

#### 5. Rate Limiting
Prevent abuse:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100 // requests per window
});

app.use('/api/v1', limiter);
```

---

### Cost Optimization

#### 1. Choose GROQ Over OpenAI
- **GROQ**: $0.10/M tokens (Llama 3.3 70B)
- **OpenAI**: $15/M tokens (GPT-4 Turbo)
- **Savings**: 150x cheaper

#### 2. Use Local Ollama for Development
Free local inference:
```bash
ollama pull llama-3.3-70b-versatile
ollama serve
```

Set `OLLAMA_BASE_URL=http://localhost:11434` in `.env`

#### 3. Prompt Engineering
Reduce token usage:
- Truncate transcripts (14k chars)
- Avoid redundant examples
- Request concise outputs

#### 4. Embedding Caching
Cache embeddings in MongoDB:
```javascript
const cached = await db.collection('embeddings').findOne({ text_hash: hash });
if (cached) return cached.embedding; // Skip API call
```

#### 5. Batch Processing
Group requests to leverage batch pricing:
```javascript
const embeddings = await mistral.embeddings.create({
  input: [text1, text2, text3, ...] // Batch 100 at a time
});
```

---

### Testing Strategy

#### 1. Unit Tests
Test LLM parsing logic:
```javascript
test('parseEvaluation handles malformed JSON', () => {
  const response = 'Some text before\n{"score": 7.5}\nSome text after';
  const parsed = parseEvaluation(response);
  expect(parsed.score).toBe(7.5);
});
```

#### 2. Integration Tests
Test full evaluation pipeline:
```javascript
test('evaluatePanel returns valid schema', async () => {
  const result = await evaluatePanel({
    job_id: 'TEST123',
    jd: 'Sample JD...',
    l1_transcripts: ['Transcript...']
  });
  
  expect(result.score).toBeGreaterThanOrEqual(0);
  expect(result.score).toBeLessThanOrEqual(10);
  expect(result.categories).toHaveProperty('Mandatory Skill Coverage');
});
```

#### 3. LLM Output Validation
Schema validation with Zod:
```typescript
import { z } from 'zod';

const EvaluationSchema = z.object({
  job_id: z.string(),
  score: z.number().min(0).max(10),
  categories: z.object({
    'Mandatory Skill Coverage': z.number().min(0).max(2),
    // ... other dimensions
  }),
  evidence: z.record(z.array(z.string()))
});

const validated = EvaluationSchema.parse(llmResponse);
```

#### 4. E2E Tests
Playwright for full user flow:
```javascript
test('user can upload and evaluate', async ({ page }) => {
  await page.goto('/evaluate');
  await page.setInputFiles('input[type=file]', 'test.docx');
  await page.click('button:has-text("Evaluate")');
  await expect(page.locator('.score')).toContainText(/\d\.\d/);
});
```

---

### Monitoring & Observability

#### 1. Request Logging
```javascript
app.use(morgan('combined')); // HTTP request logs
```

#### 2. Error Tracking
```javascript
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  // Send to Sentry/Datadog
});
```

#### 3. LLM Metrics
Track latency and costs:
```javascript
const start = Date.now();
const result = await callLLM(prompt);
const duration = Date.now() - start;

await db.collection('llm_metrics').insertOne({
  provider: 'groq',
  model: 'llama-3.3-70b',
  tokens_used: result.usage.total_tokens,
  latency_ms: duration,
  timestamp: new Date()
});
```

#### 4. Health Checks
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    mongodb: db.serverConfig.isConnected()
  });
});
```

---

## Conclusion

This guide provides everything needed to build an AI-powered evaluation system from scratch. Key takeaways:

1. **Use GROQ for fast, cheap LLM inference**
2. **MongoDB for flexible schema evolution**
3. **Async pattern for long-running LLM tasks**
4. **Parallel execution for 3-5x speedup**
5. **Evidence-based prompts for trustworthy AI**
6. **Unified LLM client for easy provider switching**

**Estimated Build Time:**
- MVP (single evaluation): 2-3 days
- Production-ready: 2-3 weeks
- Full dashboard + analytics: 4-6 weeks

**Estimated Costs (1000 evaluations/month):**
- GROQ: ~$5/month
- MongoDB Atlas: $0 (free tier)
- Vercel: $0 (free tier)
- Railway: $5/month
- **Total: ~$10/month**

---

**Next Steps:**
1. Clone this repo as reference
2. Set up MongoDB Atlas free cluster
3. Get GROQ API key (free tier)
4. Follow Phase 1-5 blueprint above
5. Deploy to Railway + Vercel

**Questions?** Open an issue or contact the maintainers.

---
