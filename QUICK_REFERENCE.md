# Quick Reference: Deployment Setup

## 🎯 Goal
```
git push → GitHub → Auto-deploy to Vercel (frontend) & Railway (backend)
                  → Zero impact on localhost:5173 & localhost:3000
```

## 📋 TODO Before First Push

### ✅ Completed
- [x] Git remote configured (GitHub)
- [x] Audit completed (DEPLOYMENT_AUDIT.md)
- [x] Execution plan created (DEPLOYMENT_CHECKLIST.md)
- [x] Architecture documented (DEPLOYMENT_ARCHITECTURE.md)

### ⏳ Before First `git push main`

**Phase 1: Create Environment Files** (5 min)
- [ ] Create `backend/.env.example`
- [ ] Create `frontend/.env.example`
- [ ] Git: `git add .env.example && git commit -m "docs: add env examples"`

**Phase 2: Update Code** (15 min)
- [ ] Edit `backend/src/index.js` - use env vars for PORT, CORS, DATABASE
- [ ] Verify `frontend/src/lib/api/dashboard.api.ts` - reads VITE_API_URL
- [ ] Git: `git add backend/src/index.js frontend/src/lib/api/dashboard.api.ts`

**Phase 3: Create Config Files** (5 min)
- [ ] Create `frontend/vercel.json`
- [ ] Create `backend/railway.json`
- [ ] Git: `git add frontend/vercel.json backend/railway.json`

**Phase 4: Verify & Commit** (5 min)
- [ ] Test `npm run dev` in both frontend & backend (localhost still works)
- [ ] Git: `git commit -m "chore: add deployment config files"`

### 🚀 First Push
```bash
git push origin main
```

### ⚙️ After First Push (Dashboard Work)

**Vercel Setup** (10 min)
1. Go to https://vercel.com/new
2. Import GitHub repo `panel-pulse`
3. Root Directory: `frontend/`
4. Framework: Vite (auto-detected)
5. Environment Variables → Add: `VITE_API_URL=https://railway-backend.railway.app`
6. Deploy

**Railway Setup** (10 min)
1. Go to https://railway.app
2. Create new project → GitHub
3. Select `panel-pulse` repository
4. Root Directory: `backend/`
5. Variables → Add:
   - `MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/panel-pulse`
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://your-vercel-url.vercel.app`
6. Deploy

**Update Vercel with Railway URL** (2 min)
1. Copy Railway backend URL from Railway dashboard
2. Go to Vercel → Settings → Env Vars
3. Update `VITE_API_URL` with Railway URL
4. Redeploy frontend

---

## 📁 File Checklist

### Files to Create (Commit These)
```
backend/.env.example          # Reference only, not secrets
frontend/.env.example         # Reference only, not secrets
frontend/vercel.json          # Vercel deployment config
backend/railway.json          # Railway deployment config
DEPLOYMENT_AUDIT.md           # Already created ✅
DEPLOYMENT_CHECKLIST.md       # Already created ✅
DEPLOYMENT_ARCHITECTURE.md    # Already created ✅
```

### Files to Modify (Then Commit)
```
backend/src/index.js          # Use env vars: API_PORT, FRONTEND_URL, MONGODB_URI
frontend/src/lib/api/...      # Use env var: VITE_API_URL
backend/.gitignore            # Already blocks .env ✅
frontend/.gitignore           # Already good ✅
```

### Files to Keep Private (Do NOT Commit)
```
.env.local                     # Local dev env vars (gitignored)
.env.production.local          # Local prod env vars (gitignored)
backend/.env                   # Only if exists (gitignored)
frontend/.env                  # Only if exists (gitignored)
```

---

## 🔑 Key Environment Variables

### Backend (`backend/.env.example`)
```
MONGODB_URI=mongodb://localhost:27017/panel-pulse
NODE_ENV=development
API_PORT=3000
FRONTEND_URL=http://localhost:5173
```

Production in Railway dashboard:
```
MONGODB_URI=mongodb+srv://...@cluster.mongodb.net/...
NODE_ENV=production
API_PORT=(auto)
FRONTEND_URL=https://vercel-url.vercel.app
```

### Frontend (`frontend/.env.example`)
```
VITE_API_URL=http://localhost:3000
```

Production in Vercel dashboard:
```
VITE_API_URL=https://railway-backend.railway.app
```

---

## 🧪 Testing After Each Phase

**Phase 1-2 (Before Commit)**
```bash
cd backend && npm run dev      # Should run on :3000
cd frontend && npm run dev     # Should run on :5173
# Test both work together ✅
```

**After First Push (Monitor Dashboards)**
- Vercel: Check build logs → should say "✅ Production ready"
- Railway: Check deployment logs → should say "✅ Running"

**Final Testing**
- Visit `https://your-vercel-url.vercel.app`
- Check browser console for API errors
- Verify data loads from Railway backend
- Test key features (dashboard, search, etc.)

---

## 🎯 Success Indicators

✅ You succeeded when:
1. `git push origin main` completes
2. Vercel build finishes (green checkmark)
3. Railway deployment finishes (green checkmark)
4. `https://your-vercel-url.vercel.app` loads
5. Frontend shows data (connected to Railway backend)
6. `localhost:5173` still works (unchanged)
7. `localhost:3000` still works (unchanged)

❌ If something breaks:
```bash
# Rollback via git
git log --oneline
git revert <bad-commit-hash>
git push origin main
# Vercel & Railway redeploy automatically
```

---

## 📞 Quick Help

**Q: Where do I set production environment variables?**
A: Vercel Dashboard → Settings → Environment Variables (for frontend)
   Railway Dashboard → Variables (for backend)

**Q: Will localhost:5173 still work?**
A: YES - Env vars default to `http://localhost:3000` in dev

**Q: Where is the database for production?**
A: MongoDB Atlas (cloud) - MONGODB_URI stored in Railway secrets

**Q: How do I rollback if production breaks?**
A: `git revert <commit> && git push origin main` - automatic redeploy

**Q: Can I test production locally?**
A: Yes, set `.env.production.local` with production URLs and run `npm run build && npm run preview`

---

## 📚 Full Documentation

- **Architecture**: See `DEPLOYMENT_ARCHITECTURE.md`
- **Step-by-Step**: See `DEPLOYMENT_CHECKLIST.md`
- **Detailed Audit**: See `DEPLOYMENT_AUDIT.md`

