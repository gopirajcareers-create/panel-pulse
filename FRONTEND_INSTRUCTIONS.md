# Panel Pulse AI — Frontend Web Application Instructions

## Project Overview

Build a **modern, recruiter-focused web application** that enables users to:
- Upload and manage Job Descriptions (JD), L1 Interview Transcripts, and L2 Rejection Reasons
- View AI-evaluated panel efficiency scores (0-10 scale)
- Explore dimension-wise evaluation breakdown with evidence
- Validate L2 rejection reasons against L1 probing depth
- Interactive dashboard with real-time scoring updates

**Target Users**: Recruiters, Hiring Managers, Panel Members, HR Business Partners, Talent Acquisition Teams

**Design Philosophy**: Dark-themed, modern card UI, responsive, accessible (WCAG 2.1 AA), fast and interactive

---

## Current State (Backend Infrastructure)

The backend (Node.js + Express) provides these API endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/v1/panel/score` | POST | Submit JD + L1 transcript + L2 reason, receive panel efficiency score |
| `GET /api/v1/panel/health` | GET | Health check |
| `GET /api/v1/panel/dimensions` | GET | Reference data for 8 scoring dimensions |
| `POST /api/v1/panel/validate-l2` | POST | Validate L2 rejection reason against L1 transcript |
| `GET /api/v1/jd/analyze` | GET | Analyze JD and extract key skills/competencies |
| `POST /api/v1/search/hybrid` | POST | Hybrid search across resume database |

**Data Schema**: MongoDB collections store JD, L1 interview, L2 rejection, and evaluation results.

---

## Technology Stack

### Core Framework
- **Build Tool**: Vite 5.x (fast HMR, optimized builds)
- **Framework**: React 18 + TypeScript
- **Routing**: React Router v6
- **State Management**: Zustand (lightweight, TypeScript-first)

### UI/UX Libraries
- **Component Library**: Shadcn/ui (TailwindCSS-based, accessible)
- **Styling**: TailwindCSS 3.x (utility-first, mobile-first)
- **Icons**: Lucide React (clean, consistent icon set)
- **Animations**: Framer Motion (smooth transitions and card animations)

### Data & API
- **HTTP Client**: Axios with interceptors
- **Form Handling**: React Hook Form + Zod validation
- **File Upload**: react-dropzone (drag-and-drop CSV/JSON)
- **Charts**: Recharts (dimension score visualization)

### Developer Tools
- **Linting**: ESLint + Prettier
- **Type Safety**: TypeScript strict mode
- **Testing**: Vitest + React Testing Library
- **Deployment**: Vercel (CI/CD, preview URLs)

---

## Project Structure

```
panel-pulse-web/
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── main.tsx                          # Entry point
│   ├── App.tsx                           # Root component with router
│   ├── config/
│   │   └── api.config.ts                 # API base URL, timeout, env vars
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                 # Axios instance with interceptors
│   │   │   ├── panel.api.ts              # /api/v1/panel/* API calls
│   │   │   ├── jd.api.ts                 # /api/v1/jd/* API calls
│   │   │   └── search.api.ts             # /api/v1/search/* API calls
│   │   ├── stores/
│   │   │   ├── evaluation.store.ts       # Evaluation results state
│   │   │   ├── upload.store.ts           # File upload state, JD/L1/L2
│   │   │   └── ui.store.ts               # Loading, modal, toast state
│   │   └── utils/
│   │       ├── formatters.ts             # Score formatters, dimension names
│   │       ├── sanitize.ts               # escapeHtml / XSS prevention
│   │       └── constants.ts              # Dimensions, score colours, categories
│   │
│   ├── hooks/
│   │   ├── use-panel-evaluation.ts       # Panel scoring submission + state
│   │   ├── use-file-upload.ts            # File upload + validation
│   │   ├── use-l2-validation.ts          # L2 rejection validation
│   │   ├── use-jd-analysis.ts            # JD extraction + analysis
│   │   └── use-mobile.ts                 # Mobile breakpoint detection
│   │
│   ├── components/
│   │   ├── ui/                           # Shadcn/ui primitives
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── select.tsx
│   │   │   ├── slider.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── progress.tsx
│   │   │   └── tooltip.tsx
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # Outer flex container (sidebar + main)
│   │   │   ├── Sidebar.tsx               # Left sidebar with navigation
│   │   │   └── MobileDrawer.tsx          # Slide-out sidebar for mobile
│   │   ├── common/
│   │   │   ├── BrandAvatar.tsx           # Panel Pulse AI logo
│   │   │   ├── StatusDot.tsx             # Pulsing online indicator
│   │   │   ├── LoadingSpinner.tsx        # Circular spinner animation
│   │   │   ├── Toast.tsx                 # Error/info toast notification
│   │   │   └── EmptyState.tsx            # No data illustration
│   │   └── features/
│   │       ├── sidebar/
│   │       │   ├── NavigationMenu.tsx    # Dashboard / Evaluate / History tabs
│   │       │   ├── BrandSection.tsx      # Logo + version
│   │       │   └── SettingsButton.tsx    # Account / settings link
│   │       ├── upload/
│   │       │   ├── FileUploadZone.tsx    # Drag-drop CSV/JSON upload
│   │       │   ├── FilePreview.tsx       # Show selected files before submit
│   │       │   ├── UploadForm.tsx        # Form wrapper + submit button
│   │       │   └── UploadStatus.tsx      # Progress + status messages
│   │       ├── evaluation/
│   │       │   ├── EvaluationHeader.tsx  # Job ID + metadata header
│   │       │   ├── ScoreCard.tsx         # Main panel efficiency score (0-10)
│   │       │   ├── ScoreCategoryBadge.tsx # Poor / Moderate / Good label
│   │       │   ├── DimensionGrid.tsx     # 8 dimensions with individual scores
│   │       │   ├── DimensionCard.tsx     # Single dimension card + evidence
│   │       │   ├── ProgressRing.tsx      # Circular progress for dimension score
│   │       │   ├── EvidenceSection.tsx   # Quoted evidence from L1 transcript
│   │       │   └── ExportButton.tsx      # Download evaluation as PDF/JSON
│   │       ├── l2-validation/
│   │       │   ├── L2ValidatorCard.tsx   # L2 reason input + probing depth result
│   │       │   ├── ProbingDepthBadge.tsx # SURFACE / DEEP / NO PROBING badge
│   │       │   └── ValidationEvidence.tsx# Linked questions from transcript
│   │       ├── dashboard/
│   │       │   ├── DashboardHeader.tsx   # Welcome + quick stats
│   │       │   ├── QuickStatsCards.tsx   # Total evaluations, avg score, etc.
│   │       │   ├── RecentEvaluations.tsx # Table of latest evaluations
│   │       │   ├── ScoreDistribution.tsx # Bar chart of score distribution
│   │       │   └── DimensionAnalytics.tsx# Line chart of dimension trends
│   │       └── modals/
│   │           ├── EvaluationDetailModal.tsx   # Full-screen evaluation detail
│   │           ├── HistoryModal.tsx            # Past evaluations list
│   │           └── SettingsModal.tsx           # API key, preferences
│   │
│   ├── pages/
│   │   ├── DashboardPage.tsx              # Main dashboard landing
│   │   ├── EvaluatePage.tsx               # Upload + evaluation flow
│   │   ├── ResultsPage.tsx                # Display evaluation results
│   │   └── HistoryPage.tsx                # Past evaluations view
│   │
│   └── types/
│       ├── evaluation.types.ts            # PanelEfficiencyScore, Dimension
│       ├── upload.types.ts                # FileData, UploadRequest
│       ├── jd.types.ts                    # JD, AnalyzedJD
│       ├── interview.types.ts             # L1Transcript, L2Reason
│       ├── api.types.ts                   # ApiResponse, ApiError
│       └── chart.types.ts                 # ChartData for Recharts
│
├── .env.development
├── .env.production
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## Development Phases

---

### Phase 1: Project Setup & Core Infrastructure

**Objective**: Bootstrap the React + TypeScript project with all dependencies, config files, and the base layout shell.

#### Tasks

1. Initialise Vite + React + TypeScript project
2. Install all dependencies (see commands below)
3. Configure TailwindCSS with the Panel Pulse dark design tokens
4. Initialise Shadcn/ui components (button, badge, progress, dialog, select, textarea, card)
5. Set up folder structure as defined above
6. Configure Axios API client with interceptors
7. Create skeleton Zustand stores
8. Build `AppShell` layout (sidebar + main columns)
9. Configure React Router v6 (multi-route: dashboard, evaluate, results, history)
10. Set up environment variable handling
11. Configure ESLint + Prettier

#### Commands

```bash
# Create project
npm create vite@latest panel-pulse-web -- --template react-ts
cd panel-pulse-web

# Core dependencies
npm install
npm install react-router-dom zustand axios
npm install react-hook-form zod @hookform/resolvers
npm install lucide-react framer-motion
npm install react-hot-toast
npm install react-dropzone
npm install recharts

# Dev dependencies
npm install -D tailwindcss postcss autoprefixer
npm install -D @types/node
npm install -D eslint prettier eslint-config-prettier

# Initialise Tailwind
npx tailwindcss init -p

# Add Shadcn/ui
npx shadcn-ui@latest init

# Add required Shadcn components
npx shadcn-ui@latest add button badge dialog select textarea card tooltip progress
```

#### Configuration Files

**vite.config.ts**:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**tailwind.config.js** (Panel Pulse dark theme tokens):
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Panel Pulse brand
        primary: '#6366f1',
        accent: '#ec4899',
        // Backgrounds
        'bg-base': '#0f0f13',
        'bg-surface': '#18181f',
        'bg-card': '#1e1e28',
        // Text
        'text-primary': '#f1f1f5',
        'text-muted': '#8b8ba0',
        // Scoring dimension colours
        'score-mandatory': '#818cf8',
        'score-technical': '#f472b6',
        'score-scenario': '#34d399',
        'score-framework': '#fbbf24',
        'score-handson': '#f87171',
        'score-leadership': '#60a5fa',
        'score-behavioral': '#a78bfa',
        'score-structure': '#94e2d5',
        // Score category colours
        'score-poor': '#ef4444',
        'score-moderate': '#f59e0b',
        'score-good': '#10b981',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulse: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
        bounce: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer: { '0%': { backgroundPosition: '-200%' }, '100%': { backgroundPosition: '200%' } },
        spin: { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
      },
      animation: {
        'status-pulse': 'pulse 2s ease-in-out infinite',
        'dot-bounce': 'bounce 0.6s ease-in-out infinite',
        shimmer: 'shimmer 1.5s infinite linear',
        'spin-slow': 'spin 1.5s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

**.env.development**:
```
VITE_API_BASE_URL=http://localhost:3000
VITE_APP_NAME=Panel Pulse AI
VITE_ENABLE_MOCK=false
```

**.env.production**:
```
VITE_API_BASE_URL=https://your-backend-domain.com
VITE_APP_NAME=Panel Pulse AI
VITE_ENABLE_MOCK=false
```

#### API Client (src/lib/api/client.ts)
```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    config.headers['X-Request-ID'] = crypto.randomUUID();
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      const message = (error.response.data as any)?.error || 'An error occurred';
      if (status === 404) toast.error(`Not found: ${message}`);
      else if (status === 500) toast.error('Server error. Please try again later.');
      else toast.error(message);
    } else if (error.request) {
      toast.error('Network error. Check your connection.');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

#### Zustand Store Skeletons

**src/lib/stores/evaluation.store.ts**:
```typescript
import { create } from 'zustand';

interface EvaluationState {
  jobId: string;
  panelScore: number | null;
  dimensions: Record<string, number>;
  evidence: Record<string, string[]>;
  l2ValidationResult: any | null;
  isLoading: boolean;
  setJobId: (id: string) => void;
  setEvaluation: (score: number, dims: Record<string, number>, ev: Record<string, string[]>) => void;
  setL2Validation: (result: any) => void;
  setLoading: (v: boolean) => void;
  clear: () => void;
}

export const useEvaluationStore = create<EvaluationState>((set) => ({
  jobId: '',
  panelScore: null,
  dimensions: {},
  evidence: {},
  l2ValidationResult: null,
  isLoading: false,
  setJobId: (id) => set({ jobId: id }),
  setEvaluation: (score, dims, ev) => set({ panelScore: score, dimensions: dims, evidence: ev }),
  setL2Validation: (result) => set({ l2ValidationResult: result }),
  setLoading: (v) => set({ isLoading: v }),
  clear: () => set({
    jobId: '',
    panelScore: null,
    dimensions: {},
    evidence: {},
    l2ValidationResult: null,
    isLoading: false,
  }),
}));
```

#### Deliverables
- ✅ Running Vite dev server on port 5173
- ✅ AppShell layout (sidebar 260 px + full-height main)
- ✅ React Router configured (4 routes: dashboard, evaluate, results, history)
- ✅ Axios client with interceptors
- ✅ Zustand store skeletons (evaluation, upload, ui)
- ✅ TailwindCSS with Panel Pulse dark tokens + 8 dimension colour palette
- ✅ Shadcn/ui primitives installed

---

### Phase 2: Sidebar & Navigation Module

**Objective**: Build the left sidebar with brand, navigation menu, and settings.

#### Components to Build

1. **BrandSection.tsx**
   - Inline SVG circle avatar with indigo → pink gradient
   - Brand name "Panel Pulse AI"
   - Version "v2.0"

2. **NavigationMenu.tsx**
   - Three main tabs: Dashboard | Evaluate | History
   - Each tab: icon + label + click handler
   - Active tab: indigo tinted background + checkmark
   - Uses React Router `useNavigate()` to change routes

3. **SettingsButton.tsx**
   - Bottom of sidebar
   - Settings icon + "Settings" label
   - Opens `SettingsModal` on click

4. **Sidebar.tsx** (composes all above)
   - Fixed 260 px width, `overflow-y: auto`
   - Order from top: Brand → NavigationMenu → (flexible space) → SettingsButton

#### Deliverables
- ✅ Brand avatar visible
- ✅ Navigation tabs switch routes on click
- ✅ Active tab highlighted
- ✅ Settings button opens modal overlay

---

### Phase 3: Upload & File Management Module

**Objective**: Build the file upload interface for JD, L1 transcript, and L2 rejection reason.

#### Components to Build

1. **FileUploadZone.tsx**
   - Drag-and-drop area styled as a dashed border card
   - Accepts CSV, JSON, TXT files
   - Icon: upload cloud
   - Text: "Drag files here or click to browse"
   - Shows file names once selected
   - Uses `react-dropzone` library

2. **FilePreview.tsx**
   - Shows selected files in a table:
     - Column 1: File icon + name
     - Column 2: File type (JD / L1 / L2)
     - Column 3: File size + remove button (✕)
   - Updates upload store on file selection

3. **UploadForm.tsx**
   - Wraps FileUploadZone + FilePreview
   - Submit button: "Evaluate Panel"
   - Disabled until all 3 files selected
   - Shows validation error if file format invalid
   - On submit: calls panel API with file contents

4. **UploadStatus.tsx**
   - Progress bar during upload
   - Status messages: "Uploading…" → "Processing…" → "Complete!"
   - Error message if upload fails
   - Success message with evaluation ID

#### Custom Hook (src/hooks/use-file-upload.ts)
```typescript
export function useFileUpload() {
  const { setFiles } = useUploadStore();
  
  function handleFilesSelected(files: File[]) {
    // Validate file types
    // Parse file contents
    // Update store
  }
  
  async function submitEvaluation(jobId: string, jdFile: File, l1File: File, l2File: File) {
    // Call panel API
    // Return evaluation result
  }
  
  return { handleFilesSelected, submitEvaluation };
}
```

#### Deliverables
- ✅ Drag-and-drop file upload working
- ✅ File selection displayed in preview table
- ✅ Submit button calls panel API
- ✅ Progress bar shows during upload
- ✅ Error/success toasts on completion

---

### Phase 4: Evaluation Display Module

**Objective**: Build the main scoring card, dimension grid, and evidence display.

#### Components to Build

1. **ScoreCard.tsx**
   - Large circular progress ring displaying main panel efficiency score (0-10)
   - Score in centre in large font
   - Ring colour: green (good) / orange (moderate) / red (poor)
   - Subtitle: score category label

2. **ScoreCategoryBadge.tsx**
   - Pill badge showing:
     - 0–4.9 → "Poor" (red)
     - 5–7.9 → "Moderate" (orange)
     - 8–10 → "Good" (green)

3. **DimensionCard.tsx**
   - Single dimension with:
     - Dimension name (bold)
     - Max score value (e.g., "2.0")
     - Actual score progress bar
     - Evidence quote below (italicized, truncated)
   - Colour background per dimension from palette

4. **DimensionGrid.tsx**
   - 2-column grid (1 column on mobile) of 8 `DimensionCard` components
   - Renders all dimensions:
     1. Mandatory Skill Coverage (2.0)
     2. Technical Depth (1.5)
     3. Scenario/Risk Evaluation (1.0)
     4. Framework Knowledge (1.0)
     5. Hands-on Validation (1.0)
     6. Leadership Evaluation (1.0)
     7. Behavioral Assessment (1.0)
     8. Interview Structure (1.5)

5. **EvidenceSection.tsx**
   - Expandable section showing full evidence transcript snippets
   - Quoted text with interview Q&A format
   - Scroll container if long

6. **ProgressRing.tsx**
   - Circular SVG progress indicator
   - Props: `score: number`, `maxScore: number`, `colour: string`
   - Smooth animation on render

7. **EvaluationHeader.tsx**
   - Job Interview ID
   - Timestamp of evaluation
   - Panel member name (if available)

8. **ExportButton.tsx**
   - Download evaluation as PDF or JSON
   - Button with download icon

#### Deliverables
- ✅ Main score card displays 0-10 with colour
- ✅ 8 dimension cards in 2-column grid
- ✅ Each dimension shows actual vs. max score
- ✅ Evidence section expandable with transcript quotes
- ✅ Export button downloads PDF/JSON

---

### Phase 5: L2 Validation Module

**Objective**: Build the L2 rejection reason validator that shows probing depth classification.

#### Components to Build

1. **L2ValidatorCard.tsx**
   - Input field for L2 rejection reason text [DESCOPED]
   - Button: "Validate Against Transcript" [DESCOPED]
   - Calls `use-l2-validation` hook
   - Displays result below

2. **ProbingDepthBadge.tsx**
   - Pill badge showing:
     - "NO PROBING" (grey)
     - "SURFACE PROBING" (orange)
     - "DEEP PROBING" (green)
   - Colour updates based on validation result

3. **ValidationEvidence.tsx**
   - Shows matching Q&A from transcript
   - Links rejection reason to specific interview questions
   - Formatted as quote blocks
   - Shows L2 rejected reason as list before showing the PROBING batch

#### Custom Hook (src/hooks/use-l2-validation.ts)
```typescript
export function useL2Validation() {
  async function validateL2Reason(transcript: string, rejectionReason: string) {
    const response = await panelApi.validateL2({
      transcript,
      rejectionReason,
    });
    return response;
  }
  
  return { validateL2Reason };
}
```

#### Deliverables
- ✅ Probing depth badge displays correctly
- ✅ Evidence quotes shown from transcript

---

### Phase 6: Dashboard Module

**Objective**: Build the main dashboard landing page with stats and visualizations.

#### Components to Build

1. **DashboardHeader.tsx**
   - Welcome message: "Welcome back, [User]"
   - Brief intro text

2. **QuickStatsCards.tsx**
   - 4 cards in a grid:
     - Total Evaluations (count)
     - Average Panel Score (value)
     - Last Evaluation (date)
     - Evaluations This Week (count)
   - Each card has an icon + label + value

3. **RecentEvaluations.tsx**
   - Table of last 10 evaluations:
     - Columns: Job ID | Date | Score | Category | Action
   - Row click opens EvaluationDetailModal

4. **ScoreDistribution.tsx**
   - Bar chart using Recharts
   - X-axis: Score ranges (0-2, 2-4, 4-6, 6-8, 8-10)
   - Y-axis: Count of evaluations

5. **DimensionAnalytics.tsx**
   - Line chart showing average dimension scores over time
   - 8 lines, one per dimension (colour-coded)
   - Hover tooltip shows exact values

#### Type Definition (src/types/chart.types.ts)
```typescript
export interface DashboardStats {
  totalEvaluations: number;
  averageScore: number;
  lastEvaluationDate: string;
  evaluationsThisWeek: number;
  scoreDistribution: Record<string, number>;
  dimensionTrends: Array<{ date: string; dimension: string; score: number }>;
}
```

#### Deliverables
- ✅ Dashboard stats cards populated from API
- ✅ Recent evaluations table renders
- ✅ Score distribution bar chart
- ✅ Dimension analytics line chart

---

### Phase 7: Modals & Detail Views

**Objective**: Build full-screen modals for detailed evaluation view, history, and settings.

#### Components to Build

1. **EvaluationDetailModal.tsx**
   - Full-screen overlay with all evaluation details
   - Composes: EvaluationHeader + ScoreCard + DimensionGrid + EvidenceSection + L2ValidationResult
   - Close button (✕) top-right
   - Framer Motion: scale + opacity enter/exit

2. **HistoryModal.tsx**
   - List of all past evaluations
   - Each item: Job ID + Date + Score + Category
   - Click to open EvaluationDetailModal for that evaluation
   - Searchable by Job ID

3. **SettingsModal.tsx**
   - Account info section
   - API configuration (if needed)
   - Preferences (theme, export format)
   - Sign out button

#### Deliverables
- ✅ All modals open/close smoothly
- ✅ Detail modal shows full evaluation
- ✅ History modal lists all past evaluations
- ✅ Settings modal shows user preferences

---

### Phase 8: Layout Integration & Full Page Assembly

**Objective**: Compose all modules into multi-page routes and verify end-to-end flow.

#### Routes

1. **DashboardPage** (`/`)
   - AppShell + Sidebar + Dashboard components

2. **EvaluatePage** (`/evaluate`)
   - AppShell + Sidebar + UploadForm + UploadStatus

3. **ResultsPage** (`/results/:evaluationId`)
   - AppShell + Sidebar + EvaluationDetailModal (full-screen)

4. **HistoryPage** (`/history`)
   - AppShell + Sidebar + HistoryModal

#### App.tsx
```tsx
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { EvaluatePage } from './pages/EvaluatePage';
import { ResultsPage } from './pages/ResultsPage';
import { HistoryPage } from './pages/HistoryPage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e1e28', color: '#f1f1f5' } }} />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/evaluate" element={<EvaluatePage />} />
        <Route path="/results/:evaluationId" element={<ResultsPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

#### End-to-End Flow Verification

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/` | Dashboard with stats + recent evaluations |
| 2 | Click "Evaluate" nav | Navigate to `/evaluate` |
| 3 | Upload 3 files | Files appear in preview table |
| 4 | Click "Evaluate Panel" | Progress bar shows upload |
| 5 | Wait for response | Redirected to `/results/:id` |
| 6 | View results | Main score + 8 dimensions visible |
| 7 | Expand evidence | Transcript quotes show |
| 8 | Validate L2 reason | Probing depth badge appears |
| 9 | Click export | PDF/JSON downloads |
| 10 | Click "History" nav | Navigate to `/history` |
| 11 | Click past evaluation | Modal opens with that evaluation |
| 12 | Close modal | Return to history page |

#### Deliverables
- ✅ All 4 routes functional
- ✅ Navigation between pages smooth
- ✅ Full evaluation flow from upload → results
- ✅ History page shows past evaluations
- ✅ No console errors

---

### Phase 9: Mobile Optimization & Polish

**Objective**: Ensure excellent mobile experience, accessibility, and final visual polish.

#### Tasks

1. **Mobile Sidebar (MobileDrawer.tsx)**
   - On `< 768px`: Sidebar hides behind hamburger menu button in header
   - Slide-in drawer from left using Framer Motion
   - Overlay backdrop closes drawer on tap outside

2. **Responsive Layout**
   - Dimension grid: full-width on mobile (1 column), 2 columns on desktop
   - File upload: full-width drag zone
   - Modal: full-screen on mobile (`< 768px`), centred card on desktop
   - Font sizes scale down on mobile

3. **Accessibility (WCAG 2.1 AA)**
   - `aria-label` on all icon-only buttons (upload, close, export)
   - `role="dialog"` + `aria-modal="true"` on modals
   - `aria-live="polite"` region for evaluation results (screen reader announcement)
   - Keyboard tab order: sidebar → main content → modals
   - Visible focus rings (Tailwind `focus-visible:ring-2`)
   - Focus trap inside open modals

4. **Performance**
   - Lazy-load modals with `React.lazy` + `Suspense`
   - `useMemo` on dimension grid rendering
   - `useCallback` on upload handler to prevent re-render
   - Debounce chart updates (250 ms) if real-time updates expected

5. **Security — XSS Prevention**
   - All API-returned text rendered via sanitised strings
   - Never use `dangerouslySetInnerHTML` without DOMPurify
   - Install `dompurify` if rich text rendering needed
   - `escapeHtml` utility:
     ```typescript
     export function escapeHtml(unsafe: string): string {
       return unsafe
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#039;');
     }
     ```

6. **Loading Skeletons**
   - Skeleton shimmer for dimension cards during evaluation
   - Skeleton for recent evaluations table rows during fetch

7. **Animations Checklist**
   - Sidebar nav button: background fade on active toggle
   - Modals: scale + fade enter/exit
   - Progress rings: smooth number animation (0 → final score)
   - Charts: fade-in on data load
   - File upload: bounce on drag-over

#### Deliverables
- ✅ Mobile drawer sidebar
- ✅ Full-screen modals on mobile
- ✅ All interactive elements have ARIA labels
- ✅ Focus trap in modals
- ✅ `aria-live` result announcements
- ✅ Skeleton loaders for cards
- ✅ XSS prevention via sanitize utility
- ✅ All animations smooth and performant
- ✅ No layout overflow on 375 px screens

---

## Design System

### Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary` | `#6366f1` | Active states, brand, buttons |
| `--accent` | `#ec4899` | Brand secondary, gradient |
| `--bg-base` | `#0f0f13` | Page background |
| `--bg-surface` | `#18181f` | Sidebar, header background |
| `--bg-card` | `#1e1e28` | Cards, modals |
| `--text-primary` | `#f1f1f5` | Main text |
| `--text-muted` | `#8b8ba0` | Labels, hints, secondary text |
| `--score-mandatory` | `#818cf8` | Mandatory Skill Coverage |
| `--score-technical` | `#f472b6` | Technical Depth |
| `--score-scenario` | `#34d399` | Scenario/Risk Evaluation |
| `--score-framework` | `#fbbf24` | Framework Knowledge |
| `--score-handson` | `#f87171` | Hands-on Validation |
| `--score-leadership` | `#60a5fa` | Leadership Evaluation |
| `--score-behavioral` | `#a78bfa` | Behavioral Assessment |
| `--score-structure` | `#94e2d5` | Interview Structure |
| `--score-poor` | `#ef4444` | Score 0-4.9 |
| `--score-moderate` | `#f59e0b` | Score 5-7.9 |
| `--score-good` | `#10b981` | Score 8-10 |

### Typography

| Role | Class | Size |
|------|-------|------|
| Main heading | `text-2xl font-bold` | 28 px |
| Card title | `text-lg font-semibold` | 18 px |
| Label | `text-xs font-medium uppercase tracking-widest` | 12 px |
| Body text | `text-sm` | 14 px |
| Score value | `text-4xl font-bold` | 36 px |
| Dimension name | `text-base font-medium` | 16 px |

### Component Spacing
- Sidebar padding: `p-5` (20 px)
- Card padding: `p-4` (16 px)
- Gap between cards: `gap-4` (16 px)
- Section gap: `gap-6` (24 px)
- Modal padding: `p-6` (24 px)

### State Colours

| State | Class |
|-------|-------|
| Nav button active | `bg-indigo-500/12 border-indigo-400/30` |
| Send button enabled | `bg-gradient-to-r from-primary to-accent` |
| Send button disabled | `opacity-40 cursor-not-allowed` |
| Card hover | `hover:shadow-lg hover:border-white/[0.12]` |
| Progress ring (good) | `stroke-score-good` |
| Progress ring (moderate) | `stroke-score-moderate` |
| Progress ring (poor) | `stroke-score-poor` |

---

## API Reference (Backend Endpoints)

### POST /api/v1/panel/score

**Request**:
```json
{
  "jobId": "JD12778",
  "jd": "Strong SQL proficiency...",
  "l1Transcript": "Interviewer: Tell me about your SQL...",
  "l2RejectionReason": "Weak knowledge in window functions"
}
```

**Response**:
```json
{
  "jobId": "JD12778",
  "panelEfficiencyScore": 6.8,
  "scoreCategory": "Moderate",
  "dimensions": {
    "mandatorySkillCoverage": 1.5,
    "technicalDepth": 1.2,
    "scenarioRiskEvaluation": 0.7,
    "frameworkKnowledge": 0.9,
    "handsOnValidation": 0.8,
    "leadershipEvaluation": 0.9,
    "behavioralAssessment": 0.6,
    "interviewStructure": 1.2
  },
  "evidence": {
    "mandatorySkillCoverage": [
      "Interviewer: Do you have experience with joins?",
      "Candidate: Yes, I use them regularly..."
    ]
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### POST /api/v1/panel/validate-l2

**Request**:
```json
{
  "l1Transcript": "Interviewer: What about window functions?",
  "l2RejectionReason": "Weak knowledge in window functions"
}
```

**Response**:
```json
{
  "probingDepth": "SURFACE PROBING",
  "matchedQuestions": [
    "What about window functions?"
  ],
  "validated": true,
  "confidence": 0.87
}
```

### GET /api/v1/panel/health

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## Testing Strategy

### Unit Tests

**Evaluation store**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useEvaluationStore } from '@/lib/stores/evaluation.store';

describe('evaluationStore', () => {
  beforeEach(() => useEvaluationStore.getState().clear());
  
  it('sets panel score', () => {
    useEvaluationStore.getState().setEvaluation(7.5, {}, {});
    expect(useEvaluationStore.getState().panelScore).toBe(7.5);
  });
  
  it('clears state', () => {
    useEvaluationStore.getState().setEvaluation(8.0, {}, {});
    useEvaluationStore.getState().clear();
    expect(useEvaluationStore.getState().panelScore).toBeNull();
  });
});
```

**ScoreCard component**:
```typescript
import { render, screen } from '@testing-library/react';
import { ScoreCard } from '@/components/features/evaluation/ScoreCard';

describe('ScoreCard', () => {
  it('renders score and category', () => {
    render(<ScoreCard score={8.2} category="Good" />);
    expect(screen.getByText('8.2')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
  });
});
```

### E2E Critical Flow (Playwright)
```
1. Open http://localhost:5173/
2. Assert dashboard visible with stats
3. Click "Evaluate" nav
4. Upload 3 files
5. Assert progress bar shows
6. Assert redirect to /results/:id
7. Assert main score + 8 dimensions visible
8. Expand evidence section
9. Validate L2 reason
10. Assert probing depth badge
11. Click export button
12. Assert PDF/JSON downloads
13. Click "History" nav
14. Assert past evaluations list
15. Click past evaluation
16. Assert modal opens with full details
17. Close modal
```

---

## Deployment

### Vercel Deployment

1. Push `panel-pulse-web/` to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard:
   - `VITE_API_BASE_URL` → your backend URL
4. Deploy on push to `main`

**vercel.json**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "env": {
    "VITE_API_BASE_URL": "@panel_pulse_api_base_url"
  }
}
```

---

## Final Pre-Launch Checklist

- [ ] All pages render on 375 px width without overflow
- [ ] Dashboard stats cards display correctly
- [ ] File upload drag-and-drop working
- [ ] File validation rejects invalid formats
- [ ] Panel scoring API returns valid response
- [ ] Main score (0-10) displays with correct colour
- [ ] All 8 dimensions render with correct scores
- [ ] Evidence section expands and shows transcript
- [ ] L2 validation returns probing depth classification
- [ ] Export button downloads PDF/JSON
- [ ] History page lists all past evaluations
- [ ] Click history item opens detail modal
- [ ] Modal Escape key and overlay click close
- [ ] All buttons have `aria-label`
- [ ] Focus trap active in modals
- [ ] `aria-live` announces new results
- [ ] Keyboard navigation works through all controls
- [ ] No `dangerouslySetInnerHTML` without sanitisation
- [ ] Vite build completes with no errors (`npm run build`)
- [ ] No console errors in production build
- [ ] Lighthouse score ≥ 85 (Performance + Accessibility)
- [ ] Mobile drawer sidebar works on small screens
- [ ] Charts load and display correctly
- [ ] Responsive fonts and spacing on all breakpoints

---

## Resources

### Documentation
- [React 18 Docs](https://react.dev)
- [Vite Guide](https://vitejs.dev/guide/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [Shadcn/ui Components](https://ui.shadcn.com)
- [Zustand Guide](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Framer Motion](https://www.framer.com/motion/)
- [Recharts Documentation](https://recharts.org)
- [Lucide Icons](https://lucide.dev/icons)

### Design Inspiration
- Linear (clean sidebar + main split)
- Vercel Dashboard (modern evaluation cards)
- Datadog (dimension analytics)

---

## Development Workflow

1. **Branch**: create `feature/<phase-name>` from `main`
2. **Implement**: build components, add types, wire stores
3. **Test**: run `npm run dev`, test all interactions in browser (mobile + desktop)
4. **Lint**: `npm run lint` must pass
5. **Commit**: `feat: <concise description>`
6. **Push**: create PR → merge to `main` → auto-deploy to Vercel

---

*End of Panel Pulse AI Frontend Web Instructions*
