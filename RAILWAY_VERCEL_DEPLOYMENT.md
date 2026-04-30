# 🚀 Railway & Vercel Deployment Guide

## Architecture
```
GitHub (Main Branch)
  ├─ Push → Railway (Backend on https://panel-pulse-api.railway.app)
  └─ Push → Vercel (Frontend on https://panel-pulse.vercel.app)
```

---

## Prerequisites
- ✅ GitHub account & repository (`panel-pulse` - main branch)
- ✅ Railway account (https://railway.app)
- ✅ Vercel account (https://vercel.com)
- ✅ Environment variables configured locally

---

## Step 1: Deploy Backend to Railway

### 1.1 Create Railway Project
1. Go to https://railway.app
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select the `panel-pulse` repository
4. Click **"Deploy"**

### 1.2 Configure Railway

Once deployment starts:
1. Go to your Railway project dashboard
2. Click on the **Deployment** tab
3. Wait for the build to complete (5-10 minutes)

### 1.3 Set Environment Variables in Railway

In your Railway project settings:
1. Go to **Variables**
2. Add the following environment variables:

```
PORT = 3000
NODE_ENV = production
MONGODB_URI = <your-mongodb-connection-string>
MONGODB_DB = panel_db
FRONTEND_URL = https://panel-pulse.vercel.app
MISTRAL_API_KEY = <your-mistral-api-key>
GROQ_API_KEY = <your-groq-api-key>
```

**Note:** Use your actual API keys from:
- MongoDB Atlas connection string from your database
- Mistral API key from https://console.mistral.ai
- Groq API key from https://console.groq.com

### 1.4 Get Your Railway Backend URL

After deployment:
1. In Railway dashboard, click on your project
2. Look for the **Public URL** (or **Domain**)
3. Copy the URL: `https://your-railway-domain.railway.app`
4. **Save this URL** - you'll need it for the frontend

### 1.5 Verify Backend is Running

Test the backend health endpoint:
```bash
curl https://your-railway-domain.railway.app/api/v1/health
```

You should see a response like:
```json
{ "status": "ok" }
```

---

## Step 2: Deploy Frontend to Vercel

### 2.1 Update Frontend Environment Variable

Before deploying, update the `VITE_API_URL` for Vercel:

1. Get your Railway backend URL from Step 1.4
2. Update `.env.example`:
   ```
   VITE_API_URL=https://your-railway-domain.railway.app
   ```

### 2.2 Create Vercel Project

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select the `panel-pulse` repository
4. Click **"Import"**

### 2.3 Configure Vercel Project

On the import screen:

**Framework Preset:**
- Select: **Vite**

**Root Directory:**
- Click "Edit" and select **frontend/**

**Environment Variables:**
- Click "Environment Variables"
- Add: 
  ```
  VITE_API_URL = https://your-railway-domain.railway.app
  ```
- Select: **Production**

### 2.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (3-5 minutes)
3. You'll get a URL like: `https://panel-pulse-xyz.vercel.app`

### 2.5 Verify Frontend is Running

1. Open your Vercel URL: `https://panel-pulse-xyz.vercel.app`
2. You should see the dashboard loading
3. Open DevTools (F12) → **Network** tab
4. Verify API calls are going to your Railway backend

---

## Step 3: Update Backend CORS (if needed)

If you have a custom Vercel domain, add it to the backend CORS in `backend/src/index.js`:

```javascript
const allowedOrigins = [
  'https://panel-pulse.vercel.app',
  'https://your-custom-vercel-domain.com',
  FRONTEND_URL,
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);
```

Then redeploy backend to Railway:
```bash
git add backend/src/index.js
git commit -m "chore: update CORS for custom Vercel domain"
git push origin main
```

---

## Troubleshooting

### Frontend can't connect to backend
1. Verify `VITE_API_URL` is set in Vercel Environment Variables
2. Check Network tab in DevTools - what URL are requests going to?
3. Verify backend health: `curl https://your-railway-domain.railway.app/api/v1/health`

### Backend deployment fails
1. Check Railway logs: Dashboard → Deployments → View Logs
2. Verify all environment variables are set in Railway
3. Ensure MongoDB connection string is correct

### CORS errors
1. Backend logs will show CORS errors if origin is blocked
2. Add your Vercel URL to `FRONTEND_URL` environment variable in Railway
3. Redeploy backend after changing environment variables

---

## Deployment Summary

Your production setup:
```
🌐 Frontend: https://panel-pulse-xyz.vercel.app
    ↓
📡 API Calls to Backend: https://your-railway-domain.railway.app
    ↓
🗄️ Database: MongoDB Atlas
```

All automatic deployments:
- Push to `main` branch → GitHub automatically triggers Railway & Vercel builds
- No manual deployment needed after initial setup
