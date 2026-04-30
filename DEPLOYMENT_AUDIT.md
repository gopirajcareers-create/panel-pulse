# Deployment Audit & Plan

## Current State Analysis

### Git
✅ Git initialized
✅ Remote configured: `origin` → `https://github.com/fabimore-dev/panel-pulse.git`
✅ Ready for CI/CD integration

### Backend (Node.js + Express)
📁 Location: `/Users/gopirajk/panel-pulse-ai/backend/`
- **package.json scripts**:
  - `npm start` → `node src/index.js` (PRODUCTION)
  - `npm run dev` → `nodemon src/index.js` (DEVELOPMENT)
  - `npm run lint` → placeholder
- **Main entry**: `src/index.js`
- **Node engines**: `>=18`
- **Dependencies**: Express, MongoDB client, dotenv, morgan, axios
- **.gitignore**: Covers `node_modules/` and `.env`
- **Environment vars needed**: `MONGODB_URI`, `API_PORT` (default 3000), `FRONTEND_URL`

### Frontend (React + Vite)
📁 Location: `/Users/gopirajk/panel-pulse-ai/frontend/`
- **package.json scripts**:
  - `npm run dev` → `vite` (DEVELOPMENT on :5173)
  - `npm run build` → `tsc -b && vite build` (PRODUCTION)
  - `npm run preview` → preview production build
- **Build output**: `dist/`
- **Build system**: Vite (fast, modern)
- **.gitignore**: Properly configured (blocks node_modules, dist, .local files)
- **Environment vars needed**: `VITE_API_URL` (default `http://localhost:3000` for dev)

### Deployment Targets
- **Frontend**: Vercel (auto-deploy on push, handles Vite build)
- **Backend**: Railway (auto-deploy on push, Node.js support)
- **Database**: MongoDB Atlas (cloud-hosted, referenced by `MONGODB_URI`)

---

## Missing/Needed Components

| Component | Current | Needed | Priority |
|-----------|---------|--------|----------|
| .env files | ❌ Not in repo | `.env.example` for reference | HIGH |
| `vercel.json` | ❌ Not found | Config for Vite build | HIGH |
| `railway.json` or config | ❌ Not found | Start script + env vars | HIGH |
| `.github/workflows` | ❌ Not found | Optional CI/CD validation | MEDIUM |
| CORS config in backend | ❓ Need to check | Dynamic CORS for Vercel URL | HIGH |
| API endpoint logic | ❓ Need to check | Environment-aware base URL | HIGH |
| Environment detection | ❓ Need to check | NODE_ENV variable handling | MEDIUM |

---

## Key Assumptions

1. **MongoDB Atlas** is the production database (MONGODB_URI points to it)
2. **Local MongoDB** is used for development (if running locally)
3. **Vercel** will auto-detect Vite and run `npm run build`
4. **Railway** will auto-detect Node.js and run `npm install && npm start`
5. **No changes needed** to localhost development (port 5173 and 3000)
6. **Git branch** `main` is the production branch

---

## Action Items (In Order)

### Phase 1: Environment Setup (Steps 1-3)
1. Create `.env.example` files (both backend & frontend) - reference only
2. Verify `.gitignore` blocks all `.env` files properly
3. Document environment variable requirements

### Phase 2: Backend Configuration (Steps 4-5)
4. Update `backend/src/index.js` to use `process.env.API_PORT` with default 3000
5. Configure CORS dynamically based on `FRONTEND_URL` environment variable
6. Create Railway config (env vars in dashboard: `MONGODB_URI`, `NODE_ENV=production`, `API_PORT`)

### Phase 3: Frontend Configuration (Steps 6-7)
7. Verify API client uses `VITE_API_URL` from environment
8. Ensure fallback to `http://localhost:3000` for development
9. Create `vercel.json` config for Vite deployment

### Phase 4: GitHub Integration (Step 8)
10. Create `.github/workflows/deploy.yml` for automated testing on push (optional)
11. Link Vercel project to GitHub repo (auto-deploy on main push)
12. Link Railway project to GitHub repo (auto-deploy on main push)

### Phase 5: Production Database (Step 9)
13. Create MongoDB Atlas cluster for production (if not exists)
14. Store `MONGODB_URI` in Railway environment variables (secrets)
15. Document MongoDB connection strategy

### Phase 6: Validation & Testing (Steps 10-12)
16. Test localhost dev (5173 + 3000) still works
17. Make small test commit and push to main
18. Monitor Vercel and Railway deployments
19. Test production deployment URLs
20. Verify frontend ↔ backend communication in production

---

## Risk Mitigation

✅ **No breaking changes to localhost**: All env var logic defaults to development values
✅ **Secrets security**: `.env` files blocked by .gitignore, secrets in Vercel/Railway dashboards
✅ **Rollback plan**: Git history preserved, can revert if deployment fails
✅ **Testing**: Small test commit before full deployment
✅ **Documentation**: This audit file + deployment checklist

---

## Next Steps

**When ready, execute Phase 1-3 (mandatory) before touching git.**
Phase 4-6 happen in parallel with GitHub/Vercel/Railway dashboards.

