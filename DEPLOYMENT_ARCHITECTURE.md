# Deployment Architecture Overview

## Local Development Flow (Currently Working)
```
┌─────────────────────────────────────────────────────────┐
│           LOCAL DEVELOPMENT ENVIRONMENT                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Frontend Dev Server          Backend Dev Server       │
│  npm run dev                  npm run dev              │
│  localhost:5173               localhost:3000           │
│  (Vite HMR enabled)          (Nodemon watch)          │
│       ↓                             ↓                  │
│       └──────────────┬──────────────┘                  │
│                      │                                 │
│              Local MongoDB                            │
│        mongodb://localhost:27017                       │
│                      │                                 │
│           ✅ WORKING & WILL STAY WORKING             │
└─────────────────────────────────────────────────────────┘
```

---

## Production Deployment Flow (To Be Implemented)
```
┌──────────────────────────────────────────────────────────────┐
│                    GitHub Repository                         │
│               (github.com/fabimore-dev/panel-pulse)           │
│                          ↑                                    │
│                      git push main                           │
│                    (from localhost)                          │
└──────────┬───────────────────────────────────────┬───────────┘
           │                                       │
    ┌──────▼──────────────┐             ┌─────────▼──────────┐
    │   VERCEL (Frontend) │             │ RAILWAY (Backend)  │
    ├────────────────────┤             ├────────────────────┤
    │ ✅ Auto-deploys on │             │ ✅ Auto-deploys on│
    │    GitHub push     │             │    GitHub push    │
    │                    │             │                    │
    │ Build: npm build   │             │ Build: npm install│
    │ Output: dist/      │             │ Start: npm start  │
    │ URL: vercel.app    │             │ URL: railway.app  │
    │                    │             │                    │
    │ Env vars:          │             │ Env vars:          │
    │ VITE_API_URL   ───┼─────┐       │ MONGODB_URI        │
    │ (Railway URL)  │             │ API_PORT (auto)    │
    │                │             │ FRONTEND_URL   ◄────┤
    │ Production ◄───┴─────┐       │ (Vercel URL)       │
    │ Frontend                      │ NODE_ENV=prod      │
    │                              │ Production Backend │
    └────────────────────┘         └────────────────────┘
             ↓                               ↓
       ┌─────────────────────────────────────┘
       │         (HTTPS/SSL enabled)
       │
    USERS
```

---

## Configuration Matrix

| Component | Development | Production |
|-----------|-------------|------------|
| **Frontend Port** | :5173 (Vite) | Auto (Vercel) |
| **Backend Port** | :3000 (local) | Auto (Railway) |
| **API URL** | `http://localhost:3000` | `https://railway.railway.app` |
| **Database** | Local MongoDB or Atlas dev | Atlas production cluster |
| **Env Detection** | `NODE_ENV=development` | `NODE_ENV=production` |
| **Build** | `npm run dev` | `npm run build` |
| **Deployment** | Manual (localhost) | Auto (GitHub push) |
| **Secrets** | `.env.local` (gitignored) | Vercel/Railway dashboards |

---

## Files to Create/Modify

### ✅ Already Done (Don't Touch)
- `DEPLOYMENT_AUDIT.md` - Full audit and analysis
- `DEPLOYMENT_CHECKLIST.md` - Step-by-step execution guide

### 📝 To Create (Before Pushing)
1. **backend/.env.example** - Reference env vars
2. **frontend/.env.example** - Reference env vars
3. **frontend/vercel.json** - Vercel build config
4. **backend/railway.json** - Railway start config

### 🔧 To Modify (Before Pushing)
1. **backend/src/index.js** - Read env vars for port, CORS, database
2. **frontend/src/lib/api/dashboard.api.ts** - Read VITE_API_URL
3. **backend/.gitignore** - Ensure `.env*` is blocked
4. **frontend/.gitignore** - Already good, no changes

### 🚀 Dashboard Configuration (After Code Push)
1. **Vercel Dashboard** - Link GitHub, set env vars, deploy
2. **Railway Dashboard** - Link GitHub, set env vars, deploy
3. **GitHub Settings** - Check auto-deploy hooks (if using Actions)

---

## Execution Priority

| Phase | Steps | Status | Impact |
|-------|-------|--------|--------|
| **1: Prep** | Create .env.example files | ⏳ Pending | Low - reference only |
| **2: Code** | Update backend/frontend for env vars | ⏳ Pending | CRITICAL - must work |
| **3: Config** | Create vercel.json, railway.json | ⏳ Pending | HIGH - deployment depends |
| **4: Push** | Commit & push to main | ⏳ Pending | HIGH - triggers deployment |
| **5: Dashboard** | Set up Vercel & Railway projects | ⏳ Pending | CRITICAL - actual deploy |
| **6: Test** | Verify prod URLs, local still works | ⏳ Pending | HIGH - validation |

---

## Risk Assessment & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Secrets leak in git | 🔴 CRITICAL | Use .gitignore + .env.example only |
| Local dev breaks | 🟠 HIGH | Env vars have localhost defaults |
| Prod deployment fails | 🟠 HIGH | Test locally first, can rollback via git |
| Database connection issues | 🟠 HIGH | Test MONGODB_URI separately before deploy |
| CORS blocking frontend-backend | 🟡 MEDIUM | Configure CORS with FRONTEND_URL env var |
| API URL mismatch | 🟡 MEDIUM | Use VITE_API_URL env var, default to localhost |

---

## Success Criteria

✅ All requirements met when:
1. `git push origin main` triggers automatic deployments
2. Vercel frontend deploys successfully
3. Railway backend deploys successfully
4. Frontend can communicate with Railway backend
5. localhost:5173 and localhost:3000 still work unchanged
6. No secrets exposed in git repository
7. Full rollback capability via git revert

---

## Next Step

📖 **FOLLOW: `DEPLOYMENT_CHECKLIST.md`** (Phase by Phase)

Start with Phase 1: Create .env.example files

