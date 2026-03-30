# Production Deployment Checklist

## Pre-Deployment Verification

- [ ] Backend localhost (port 3000) working
- [ ] Frontend localhost (port 5173) working
- [ ] MongoDB connection working locally
- [ ] All code committed to `main` branch
- [ ] No uncommitted changes that should be deployed

---

## Phase 1: Environment Variable Strategy

### Backend (.env files)

#### `.env.local` (Development - DO NOT COMMIT)
```bash
MONGODB_URI=mongodb://localhost:27017/panel-pulse
NODE_ENV=development
API_PORT=3000
FRONTEND_URL=http://localhost:5173
```

#### `.env.example` (Reference - COMMIT to repo)
```bash
# Backend Configuration
MONGODB_URI=your_mongodb_connection_string
NODE_ENV=development|production
API_PORT=3000
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env files)

#### `.env.local` (Development - DO NOT COMMIT)
```bash
VITE_API_URL=http://localhost:3000
VITE_ENV=development
```

#### `.env.production.local` (Production - DO NOT COMMIT, set in Vercel)
```bash
VITE_API_URL=https://railway-backend-url.railway.app
VITE_ENV=production
```

#### `.env.example` (Reference - COMMIT to repo)
```bash
# Frontend Configuration
VITE_API_URL=http://localhost:3000
VITE_ENV=development|production
```

---

## Phase 2: Code Changes Required

### Backend: Update `src/index.js`

**Required changes**:
1. Use `process.env.API_PORT || 3000` for port
2. Use `process.env.FRONTEND_URL || 'http://localhost:5173'` for CORS
3. Use `process.env.MONGODB_URI` for database connection
4. Add environment variable logging on startup (for debugging)

**Example**:
```javascript
const PORT = process.env.API_PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/panel-pulse';

// CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

// Server startup
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
});
```

### Frontend: Verify API client

**Location**: `src/lib/api/dashboard.api.ts` (or similar)

**Required changes**:
1. Read `VITE_API_URL` from `import.meta.env`
2. Default to `http://localhost:3000` if not set
3. Use base URL for all API calls

**Example**:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const dashboardApi = {
  fetchStats: async () => {
    const response = await axios.get(`${API_BASE_URL}/api/v1/panel/stats`);
    return response.data;
  },
  // ... other methods
};
```

---

## Phase 3: Deployment Configuration Files

### `vercel.json` (Frontend)
Create at `/Users/gopirajk/panel-pulse-ai/frontend/vercel.json`:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "env": {
    "VITE_API_URL": "@vite-api-url"
  }
}
```

### `railway.json` (Backend)
Create at `/Users/gopirajk/panel-pulse-ai/backend/railway.json`:

```json
{
  "builder": "nixpacks",
  "build": {
    "cmd": "npm install"
  },
  "start": {
    "cmd": "npm start"
  },
  "env": {
    "NODE_ENV": "production"
  }
}
```

---

## Phase 4: Git Push & Repository Setup

### Step 1: Verify Git Status
```bash
cd /Users/gopirajk/panel-pulse-ai
git status
```
- Ensure only intended files are staged
- `.env*` files should NOT be included
- `node_modules/` should NOT be included

### Step 2: Create `.env.example` Files

**backend/.env.example**:
```bash
# Database
MONGODB_URI=your_mongodb_connection_string_here

# Server
NODE_ENV=development
API_PORT=3000
FRONTEND_URL=http://localhost:5173
```

**frontend/.env.example**:
```bash
# API Configuration
VITE_API_URL=http://localhost:3000
VITE_ENV=development
```

### Step 3: Commit Changes
```bash
git add backend/.env.example frontend/.env.example vercel.json railway.json DEPLOYMENT_AUDIT.md DEPLOYMENT_CHECKLIST.md
git commit -m "chore: add deployment configuration and environment examples"
```

### Step 4: Push to GitHub
```bash
git push origin main
```

---

## Phase 5: Vercel Frontend Deployment

### Step 1: Create Vercel Project
- Go to https://vercel.com/new
- Import GitHub repository: `panel-pulse`
- Select Framework: **Vite**
- Root Directory: `frontend/`

### Step 2: Configure Environment Variables in Vercel
In Vercel Dashboard → Settings → Environment Variables:
- Key: `VITE_API_URL`
- Value: `https://your-railway-backend-url.railway.app` (get this from Railway after backend deploys)
- Select environment: **Production**

### Step 3: Deploy
- Click "Deploy"
- Monitor build logs
- Verify deployment at `https://your-vercel-url.vercel.app`

### Step 4: Test
- Visit the Vercel frontend URL
- Verify it can connect to Railway backend (once deployed)

---

## Phase 6: Railway Backend Deployment

### Step 1: Create Railway Project
- Go to https://railway.app
- Create new project
- Select "GitHub Repo"
- Choose `panel-pulse` repository
- Select Root Directory: `backend/`

### Step 2: Configure Environment Variables in Railway
In Railway Dashboard → Variables:
- `MONGODB_URI`: Paste your MongoDB Atlas connection string
  - Format: `mongodb+srv://username:password@cluster.mongodb.net/panel-pulse?retryWrites=true&w=majority`
- `NODE_ENV`: `production`
- `API_PORT`: Leave empty (Railway auto-assigns)
- `FRONTEND_URL`: Paste your Vercel frontend URL (e.g., `https://your-vercel-url.vercel.app`)

### Step 3: Configure Networking
- Get the public Railway URL (shown in Dashboard)
- Copy this URL (format: `https://backend-xxx.railway.app`)

### Step 4: Deploy
- Click "Deploy"
- Monitor build logs
- Verify deployment at Railway URL

### Step 5: Update Vercel with Railway URL
- Go back to Vercel Dashboard
- Settings → Environment Variables
- Update `VITE_API_URL` with Railway URL: `https://backend-xxx.railway.app`
- Redeploy frontend

---

## Phase 7: Final Testing

### Local Development Test
```bash
# Terminal 1: Backend
cd backend
npm run dev
# Should run on http://localhost:3000

# Terminal 2: Frontend
cd frontend
npm run dev
# Should run on http://localhost:5173
```

- [ ] Backend localhost still works
- [ ] Frontend localhost still works
- [ ] Frontend can communicate with backend

### Production Test
- [ ] Visit Vercel frontend URL
- [ ] Check API calls work (browser DevTools Network tab)
- [ ] Verify data loads from Railway backend
- [ ] Test key features (dashboard, search, etc.)

### Rollback Plan
If production breaks:
```bash
git log --oneline  # Find last good commit
git revert <commit-hash>
git push origin main
# Vercel & Railway will redeploy automatically
```

---

## Phase 8: Post-Deployment

### Update Documentation
- [ ] Add deployment URL to README.md
- [ ] Document environment variables
- [ ] Add troubleshooting guide

### Monitoring
- [ ] Set up error tracking (Sentry or similar)
- [ ] Monitor Railway logs for errors
- [ ] Monitor Vercel build logs
- [ ] Set up alerts for deployment failures

### CI/CD Enhancement (Optional)
- [ ] Create GitHub Actions workflow for automated testing
- [ ] Add pre-deployment checks (lint, build, test)
- [ ] Add automatic rollback on failed deployment

---

## Key Reminders

⚠️ **CRITICAL**:
1. Never commit `.env` files with secrets
2. Always use `.env.example` as reference
3. Store secrets in Vercel/Railway dashboards
4. Test localhost before pushing to git
5. Keep git history clean

✅ **SAFETY**:
- Local development (5173 & 3000) continues to work unchanged
- No breaking changes to existing code
- Full ability to rollback via git
- All secrets stored securely (not in code)

