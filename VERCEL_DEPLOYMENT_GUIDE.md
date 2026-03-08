# 🚀 Deploy Frontend to Vercel - Step-by-Step Guide

## Prerequisites ✅
- GitHub account (already done - repo is https://github.com/fabimore-dev/panel-pulse)
- Vercel account (free tier is fine)
- Your backend URL will be added later

---

## Step 1: Create Vercel Project (5 minutes)

### 1a. Go to Vercel
```
Open: https://vercel.com/new
```

### 1b. Import Your GitHub Repository
- Click **"Import Git Repository"**
- Search for: `panel-pulse`
- Click on the **panel-pulse** repository to import it

### 1c. Configure Project Settings

You'll see an "Import Project" screen. Fill in:

**Framework Preset:**
- Select: **Vite** (not Next.js, not Create React App)

**Root Directory:**
- Click "Edit"
- Select: **frontend/** from the dropdown
- ✓ This tells Vercel where your frontend code is

**Environment Variables (Important!):**
- Click "Environment Variables"
- Add the following variable:
  ```
  Name:  VITE_API_URL
  Value: http://localhost:3000
  (We'll update this to your Railway URL after backend is deployed)
  ```

### 1d. Deploy
- Click the **"Deploy"** button
- Vercel will build and deploy your frontend
- This takes 2-5 minutes

---

## Step 2: Monitor the Deployment (5 minutes)

After clicking Deploy:

1. You'll see a **"Building"** page with progress
2. Watch the build logs appear
3. When complete, you'll see:
   ```
   ✓ Production
   ✓ Deployment ready
   ```

**Your Vercel URL will appear:**
```
https://panel-pulse-xyz.vercel.app
```
(xyz will be random characters)

**Save this URL** - you'll need it for:
- Testing the frontend
- Configuring Railway backend FRONTEND_URL
- Linking frontend to backend

---

## Step 3: Verify Deployment (2 minutes)

### 3a. Visit Your Vercel URL
```
Open: https://panel-pulse-xyz.vercel.app
(replace xyz with your actual URL)
```

### 3b. What You Should See
- ✅ Beautiful dashboard loads
- ✅ Modern UI with gradients and cards
- ✅ No 404 errors
- ✅ No styling issues

### 3c. Open DevTools to Check API Calls
1. Press **F12** (or Cmd+Option+I on Mac)
2. Go to **Network** tab
3. Refresh the page
4. Look for API calls like:
   ```
   /api/v1/panel/stats
   /api/v1/health
   /api/v1/panel/search
   ```

**Expected behavior:**
- Calls go to: `http://localhost:3000` (you'll update this later)
- They'll fail initially (because backend isn't on Vercel yet)
- This is normal - that's what Step 4 fixes

---

## Step 4: Prepare for Backend URL Update (When Backend is Ready)

**AFTER your Railway backend is deployed and working**, do this:

1. Go to **Vercel Dashboard**
2. Click your **panel-pulse** project
3. Go to **Settings** tab
4. Click **Environment Variables**
5. Find **VITE_API_URL**
6. Update the value from `http://localhost:3000` to your Railway URL:
   ```
   https://backend-xyz.railway.app
   ```
   (replace xyz with your actual Railway URL)
7. Click **Save**
8. Go to **Deployments** tab
9. Click the three dots (...) on your latest deployment
10. Select **Redeploy**
11. Wait 2-3 minutes for new build

---

## Troubleshooting Vercel Deployment

### Issue: Build Failed

**Check Vercel Build Logs:**
1. Go to Vercel Dashboard
2. Click your project
3. Click "Deployments"
4. Click the failed deployment
5. Look at the "Build" section for errors

**Common Build Errors:**
- `npm ERR!` - Missing dependency or broken import
- `TypeScript error` - Type mismatch in code
- `Module not found` - Missing file

**Solution:**
- Run locally to debug:
  ```bash
  cd frontend
  npm run build
  ```
- Fix any errors
- Commit and push to GitHub
- Vercel will auto-rebuild

---

### Issue: 404 Not Found When Visiting URL

**Cause:** Wrong framework selected (probably selected Next.js instead of Vite)

**Solution:**
1. Go to Project Settings
2. Check "Framework Preset" is set to "Vite"
3. Check "Root Directory" is set to "frontend/"
4. Redeploy

---

### Issue: Environment Variables Not Working

**Check they're set:**
1. Go to Settings → Environment Variables
2. Verify `VITE_API_URL` is there
3. Click "Redeploy" to apply new env vars

**Important:** Env vars only apply after redeployment (build with new values)

---

### Issue: API Calls Return 404 or Connection Refused

**This is expected initially** because:
- Frontend is on `https://panel-pulse-xyz.vercel.app`
- Backend is on localhost (not deployed yet)

**When you deploy backend to Railway:**
1. Get your Railway URL
2. Update VITE_API_URL in Vercel with that URL
3. Redeploy frontend
4. API calls will then work

---

## What To Do After Vercel Deploy

### Immediate (Frontend Deployed ✅)
1. ✅ Frontend is live on Vercel
2. ✅ You have a public URL
3. ✅ UI is visible and functional

### Next (Deploy Backend to Railway)
1. ⏳ Deploy backend to Railway
2. ⏳ Get Railway URL
3. ⏳ Update VITE_API_URL in Vercel
4. ⏳ Redeploy frontend
5. ⏳ Frontend ↔ Backend working

### Later (Production Ready)
1. ⏳ Both frontend and backend live
2. ⏳ Full functionality working
3. ⏳ Data loading from production database

---

## Quick Reference

| Step | What | Where | Time |
|------|------|-------|------|
| 1 | Create project | https://vercel.com/new | 5 min |
| 2 | Monitor build | Vercel Dashboard | 5 min |
| 3 | Visit URL | https://your-url.vercel.app | 2 min |
| 4 | (Later) Update backend URL | Vercel Settings | 2 min |
| 5 | (Later) Redeploy | Vercel Deployments | 3 min |

---

## Success Indicators

✅ **Vercel Deployment Complete When:**
- Deployment status shows "Ready" (green checkmark)
- URL is accessible and loads without 404
- Dashboard UI displays (may have no data - that's OK, backend not linked yet)
- No console errors about missing files

✅ **Frontend ↔ Backend Linked When:**
- (After deploying Railway backend)
- Update VITE_API_URL in Vercel
- Redeploy frontend
- Dashboard loads with data
- Network calls show API responses (not errors)

---

## Important Notes

### About Environment Variables
- **VITE_** prefix is required for frontend (Vite convention)
- Only applies after rebuild/redeploy
- Must match exactly: `VITE_API_URL` (not `API_URL`)

### About Production URL
- Vercel provides free `*.vercel.app` subdomain
- You can add custom domain later (Settings → Domains)
- DNS required if using custom domain

### About Auto-Deploys
- **After initial setup**, every `git push origin main` triggers auto-deploy
- Takes 2-3 minutes
- You'll see deployment in Vercel Dashboard

### About Rollback
- Click any previous deployment in Vercel Dashboard
- Click the three dots (...)
- Select "Promote to Production"
- Instant rollback (no rebuild needed)

---

## Next Steps After Vercel Deploy

1. ✅ **Frontend deployed to Vercel** (this step)
2. ⏳ **Deploy backend to Railway** (separate guide)
3. ⏳ **Link frontend to backend** (update VITE_API_URL)
4. ⏳ **Test production** (verify everything works)

---

## Questions?

- **How do I see deployment status?** → Vercel Dashboard → Deployments tab
- **How do I see build logs?** → Click the deployment, look at Build section
- **How do I update env vars?** → Settings → Environment Variables
- **How do I deploy again?** → Just `git push origin main` (auto-deploys)
- **How do I rollback?** → Click previous deployment, Promote to Production

**You're ready! Follow the steps above to deploy to Vercel.** 🚀
