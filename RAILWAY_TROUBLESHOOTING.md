# 🔧 Railway Backend Troubleshooting Guide

## Quick Diagnosis Steps

### Step 1: Check Railway Logs
```
1. Go to Railway Dashboard → Your Project
2. Click "Deployments" tab
3. Click the latest deployment
4. Look at the "Logs" section
5. Search for error messages (red text)
```

**Common errors you might see:**
- `MongoError`: MongoDB connection issue
- `Cannot find module`: Missing dependency
- `EADDRINUSE`: Port already in use
- `CORS error`: Frontend origin not whitelisted
- `403 Forbidden`: Environment variable missing

---

### Step 2: Verify Environment Variables in Railway
```
1. Go to Railway Dashboard → Project Settings
2. Click "Variables" tab
3. Verify these are set:
   ✓ MONGODB_URI = (full MongoDB Atlas connection string)
   ✓ NODE_ENV = production
   ✓ FRONTEND_URL = (your Vercel URL)
   ✓ API_PORT = (leave empty - Railway assigns)
```

**Watch for:**
- Typos in variable names
- Incomplete MongoDB connection string
- Missing username/password in MongoDB URI
- Wrong port number

---

### Step 3: Test Backend Health Endpoint
```bash
# Replace backend-xyz with your Railway URL
curl -v https://backend-xyz.railway.app/api/v1/health

# Expected response (HTTP 200):
{
  "status": "ok",
  "uptime": 123.45,
  "timestamp": "2026-03-08T..."
}
```

---

### Step 4: Check MongoDB Connection
```bash
# Test if MongoDB URI is valid
# In Railway logs, look for messages like:
# ✓ "Connected to MongoDB"
# or
# ✗ "Failed to connect to MongoDB"
```

---

## Common Issues & Solutions

### Issue 1: MongoDB Connection Failing

**Error message:**
```
MongoServerSelectionError: connect ENOTFOUND cluster0.mongodb.net
```

**Solutions:**
1. **Verify MongoDB Atlas connection string**
   - Go to MongoDB Atlas (https://cloud.mongodb.com)
   - Click "Databases"
   - Click "Connect" on your cluster
   - Copy connection string
   - In Railway, update MONGODB_URI with this string

2. **Replace placeholders in MongoDB URI**
   ```
   Wrong: mongodb+srv://<username>:<password>@cluster...
   Right: mongodb+srv://myuser:mypassword@cluster...
   ```

3. **Whitelist Railway IP**
   - Go to MongoDB Atlas → Network Access
   - Click "Add IP Address"
   - Enter: `0.0.0.0/0` (allows all IPs - for testing)
   - Click "Confirm"
   - Wait 1-2 minutes for changes to apply

4. **Check MongoDB cluster status**
   - Go to MongoDB Atlas → Databases
   - Your cluster should show "Active" status
   - Not "Paused" or "Creating"

---

### Issue 2: Build Failed on Railway

**Error message:**
```
Build failed: npm ERR!
```

**Solutions:**
1. **Check package.json exists in backend/**
   ```bash
   ls -la /Users/gopirajk/panel-pulse-ai/backend/package.json
   ```

2. **Verify all dependencies are in package.json**
   ```bash
   cd /Users/gopirajk/panel-pulse-ai/backend
   npm install
   ```

3. **Check railway.json is valid**
   ```bash
   cat /Users/gopirajk/panel-pulse-ai/backend/railway.json
   ```
   Should look like:
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

### Issue 3: Port Issues

**Error message:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
1. **Leave API_PORT empty in Railway**
   - Don't set it to 3000 or any specific port
   - Railway auto-assigns a port
   - Backend reads it from `process.env.PORT` or `process.env.API_PORT`

2. **Verify src/index.js uses PORT correctly**
   ```javascript
   const PORT = process.env.API_PORT || process.env.PORT || 3000;
   ```

---

### Issue 4: Backend Returns 502 Error

**Error message:**
```
502 Bad Gateway
```

**Causes:**
1. Backend crashed or didn't start
2. Backend not listening on correct port
3. Environment variables missing

**Solutions:**
1. Check Railway logs for errors
2. Verify environment variables are set
3. Test locally: `cd backend && npm start`
4. Check that app listens on `process.env.PORT` not hardcoded 3000

---

### Issue 5: CORS Errors in Browser

**Error message (in browser DevTools):**
```
Access to XMLHttpRequest blocked by CORS policy
```

**Causes:**
- FRONTEND_URL not set in Railway
- Wrong frontend URL in Railway
- Frontend and backend origins don't match

**Solutions:**
1. **Set FRONTEND_URL in Railway**
   - Go to Railway → Variables
   - Add/update: `FRONTEND_URL = https://your-vercel-url.vercel.app`
   - Redeploy backend

2. **Verify CORS middleware in src/index.js**
   ```javascript
   const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
   // ... backend uses this for CORS
   ```

3. **Test backend directly** (bypasses CORS)
   ```bash
   curl -X GET https://backend-xyz.railway.app/api/v1/health
   ```
   If this works, the backend is fine - frontend config issue

---

### Issue 6: API Endpoints Return 404

**Error message:**
```
404 Not Found: /api/v1/panel/stats
```

**Causes:**
1. Route not registered in backend
2. Base URL wrong
3. Backend restarted during request

**Solutions:**
1. **Test specific endpoints**
   ```bash
   curl https://backend-xyz.railway.app/api/v1/health
   curl https://backend-xyz.railway.app/api/v1/panel/stats
   ```

2. **Check that routes exist in src/**
   ```bash
   ls -la /Users/gopirajk/panel-pulse-ai/backend/src/routes/
   # Should show: health.js, panel.js, search.js, etc.
   ```

3. **Verify routes are mounted in src/index.js**
   ```javascript
   app.use('/api/v1/health', healthRoutes);
   app.use('/api/v1/panel', panelRoutes);
   // etc...
   ```

---

## Testing Checklist

- [ ] Railway deployment shows "Active" (not "Failed")
- [ ] Check Railway logs for errors (no red text)
- [ ] Health endpoint responds: `curl https://backend-xyz.railway.app/api/v1/health`
- [ ] MongoDB connection working (check logs for "Connected to MongoDB")
- [ ] FRONTEND_URL set in Railway variables
- [ ] NODE_ENV set to "production"
- [ ] MONGODB_URI contains actual username and password (not placeholders)
- [ ] Test API endpoint: `curl https://backend-xyz.railway.app/api/v1/panel/stats`

---

## Quick Fix Commands (Run Locally to Test)

```bash
# Test backend locally first
cd /Users/gopirajk/panel-pulse-ai/backend

# Check environment variables work
echo $MONGODB_URI
echo $NODE_ENV

# Verify app starts
npm start
# Should see: "✅ Server running on http://localhost:3000"

# Test health endpoint
curl http://localhost:3000/api/v1/health

# If all local tests pass, issue is with Railway config
```

---

## What Information I Need From You

To help fix the issue faster, please provide:

1. **Railway backend URL** 
   - Format: `https://backend-xxx.railway.app`

2. **Error message you're seeing**
   - What happens when you try to access the backend?
   - Browser error? Railway error? Time out?

3. **Most recent error from Railway logs**
   - Go to Railway → Deployments → Latest → Logs
   - Copy the last few error lines (red text)

4. **Response from health endpoint**
   ```bash
   curl -v https://backend-xyz.railway.app/api/v1/health 2>&1
   # Copy output here
   ```

5. **MongoDB connection string working locally?**
   ```bash
   cd /Users/gopirajk/panel-pulse-ai/backend
   MONGODB_URI="your-connection-string" npm start
   # Does it connect?
   ```

---

## Summary

Most Railway issues fall into these categories:

| Issue | Test | Fix |
|-------|------|-----|
| MongoDB connection | Check logs for "MongoError" | Whitelist IP in Atlas + verify URI |
| Build failed | Check Railway Logs | Verify package.json exists |
| Port issues | See "EADDRINUSE" error | Leave API_PORT empty |
| 502 error | Check if backend is running | Verify env vars, check logs |
| CORS error | Browser DevTools Network tab | Set FRONTEND_URL in Railway |
| 404 errors | curl health endpoint | Verify routes exist, check logs |

Once you identify which category your issue falls into, follow the solution steps above.

**Need help? Share your Railway backend URL and the error message you see!**
