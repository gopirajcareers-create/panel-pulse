# 🚀 Production Deployment Guide - Vercel & Railway

## Current Status ✅
- ✅ All code pushed to GitHub (main branch)
- ✅ Environment files created (.env.example)
- ✅ Deployment configs added (vercel.json, railway.json)
- ✅ Backend code updated for environment variables
- ✅ Backend running on localhost:3000 ✓
- ✅ Frontend running on localhost:5173 ✓

---

## Phase 5: Deploy Frontend to Vercel

### Step 1: Create Vercel Account & Project

1. Go to https://vercel.com/signup (create account if needed)
2. Click "New Project"
3. Select "Import Git Repository"
4. Find and click on `panel-pulse` repository
5. Click "Import"

### Step 2: Configure Vercel Settings

On the "Import Project" page:
- **Framework Preset**: Select "Vite"
- **Root Directory**: Click "Edit" and select `frontend/` from dropdown
- Leave other settings as default

### Step 3: Configure Environment Variables

Before deploying, set up environment variables:
1. In Vercel Dashboard, go to your project
2. Click "Settings" → "Environment Variables"
3. Add the following variable:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://backend-<random>.railway.app` (you'll update this after Railway deploys)
   - **Environments**: Select "Production"

For now, you can use a placeholder like:
```
VITE_API_URL=https://api.example.com
```

We'll update it after Railway gives us the backend URL.

### Step 4: Deploy Frontend

1. Click "Deploy"
2. Wait for the build to complete (usually 2-3 minutes)
3. You'll see a ✅ green checkmark when done
4. Vercel will give you a URL like: `https://panel-pulse-xyz.vercel.app`

**Save this URL** - you'll need it for Railway configuration.

### Expected Output
```
✓ Build completed in 2m 34s
✓ Ready on https://panel-pulse-xyz.vercel.app
```

---

## Phase 6: Deploy Backend to Railway

### Step 1: Create Railway Account & Project

1. Go to https://railway.app/login (create account if needed)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Search for and select `panel-pulse`
5. Select the `backend/` directory

### Step 2: Configure Environment Variables

In Railway Dashboard → Variables, add these:

```
MONGODB_URI=mongodb+srv://<your-username>:<your-password>@cluster0.mongodb.net/panel-pulse?retryWrites=true&w=majority
NODE_ENV=production
API_PORT=
FRONTEND_URL=https://panel-pulse-xyz.vercel.app
```

**Important Notes**:
- **MONGODB_URI**: Get this from MongoDB Atlas (instructions below)
- **NODE_ENV**: Must be "production"
- **API_PORT**: Leave empty - Railway assigns port automatically
- **FRONTEND_URL**: Use the Vercel URL from Phase 5

### Step 3: Get MongoDB Connection String

If you don't have MongoDB Atlas set up:

1. Go to https://cloud.mongodb.com
2. Create account (free tier is fine)
3. Create a new project
4. Click "Build a Database"
5. Select "M0 Free" tier
6. Choose your region
7. Create database named "panel-pulse"
8. Go to "Database Access" → Create user (save username/password)
9. Go to "Network Access" → Add your IP (or allow all: 0.0.0.0/0)
10. Go to "Databases" → Click "Connect"
11. Select "Drivers" → Copy the connection string
12. Replace `<username>`, `<password>` with your credentials

### Step 4: Deploy Backend

1. Railway will automatically deploy when you save variables
2. Watch the logs for confirmation
3. Once deployed, go to "Deployments" tab
4. You'll see a public URL like: `https://backend-xyz.railway.app`

**Save this URL** - you need it to update Vercel.

### Expected Output
```
✓ Build successful
✓ Deployment ready at https://backend-xyz.railway.app
```

---

## Phase 7: Link Frontend to Backend

Now that you have both URLs, update Vercel with the correct backend URL:

### Step 1: Update Vercel Environment Variable

1. Go to Vercel Dashboard
2. Select your `panel-pulse` project
3. Go to Settings → Environment Variables
4. Find `VITE_API_URL`
5. Update value to your Railway URL: `https://backend-xyz.railway.app`
6. Click "Save"

### Step 2: Redeploy Frontend

1. Go to "Deployments" tab
2. Click the three dots (...) on the latest deployment
3. Select "Redeploy"
4. Wait for new build to complete

This ensures the frontend uses the correct backend URL.

---

## Phase 8: Test Production Deployment

### Step 1: Test Frontend URL

1. Visit your Vercel URL: `https://panel-pulse-xyz.vercel.app`
2. The beautiful dashboard should load
3. Check browser DevTools (F12) → Network tab
4. You should see API requests going to your Railway backend

### Step 2: Test Backend API

Open a terminal and run:
```bash
curl -s https://backend-xyz.railway.app/api/v1/health | json_pp
```

Expected output:
```json
{
  "status": "ok",
  "uptime": 1234.567,
  "timestamp": "2026-03-08T08:00:00.000Z"
}
```

### Step 3: Test Data Flow

1. On the Vercel frontend, click dashboard
2. You should see:
   - ✅ Panels loading from database
   - ✅ Statistics displaying
   - ✅ Charts rendering
3. Try searching/filtering - should work instantly

### Step 4: Verify Localhost Still Works

Open another terminal:
```bash
# Backend should still work
curl http://localhost:3000/api/v1/health

# Frontend should still work
open http://localhost:5173
```

Both should work without any changes. ✅

---

## 🎉 Success Checklist

- [ ] Vercel frontend deployed and accessible
- [ ] Railway backend deployed and accessible
- [ ] Frontend can communicate with backend (check Network tab)
- [ ] Dashboard loads data from production database
- [ ] Localhost:5173 still works
- [ ] Localhost:3000 still works
- [ ] No breaking changes introduced

---

## 🔄 Rollback (If Needed)

If something breaks in production:

```bash
cd /Users/gopirajk/panel-pulse-ai
git log --oneline  # Find the commit before deployment

# Revert to previous working commit
git revert <commit-hash>
git push origin main

# Vercel & Railway will automatically redeploy
```

---

## 📞 Troubleshooting

### Frontend shows 404 on API calls
- **Problem**: VITE_API_URL not set correctly
- **Solution**: Check Vercel Environment Variables, ensure it matches Railway URL

### Backend returns CORS error
- **Problem**: FRONTEND_URL not set in Railway
- **Solution**: Go to Railway → Variables, update FRONTEND_URL to match Vercel URL

### MongoDB connection fails
- **Problem**: MONGODB_URI incorrect or network access blocked
- **Solution**: 
  1. Verify MongoDB Atlas connection string
  2. Ensure your IP is whitelisted in Network Access (use 0.0.0.0/0 for testing)

### Vercel build fails
- **Problem**: Missing dependencies or build error
- **Solution**: Check Vercel build logs, run `npm run build` locally to debug

---

## 📊 Monitoring & Maintenance

### Monitor Vercel
- Go to Vercel Dashboard
- Watch "Analytics" tab for traffic/performance
- Review "Build Logs" for any build failures

### Monitor Railway
- Go to Railway Project
- Check "Logs" tab for runtime errors
- Monitor "Metrics" for CPU/Memory usage

### Check Data
```bash
# Verify MongoDB has data
mongosh "mongodb+srv://<user>:<pass>@cluster.mongodb.net/panel-pulse"
> db.evaluations.countDocuments()
> db.panels.countDocuments()
```

---

## 🎓 Key Points to Remember

1. **Environment Variables are Secrets**
   - Never commit .env files to git
   - Always use dashboard configuration (Vercel, Railway)
   - Use .env.example for templates only

2. **Localhost Independence**
   - Localhost:5173 → uses VITE_API_URL from .env.local
   - Localhost:3000 → uses defaults if env vars not set
   - Production URLs are separate, no interference

3. **Deployment Automation**
   - Simply `git push origin main` redeploys everything
   - Vercel watches for GitHub changes
   - Railway watches for GitHub changes
   - No manual button clicks needed after initial setup

---

**You're now in production! 🚀**

Next time you make changes:
1. Commit to git
2. `git push origin main`
3. Vercel & Railway auto-deploy
4. Done! No manual steps needed.
