# Railway Backend Diagnostic Checklist

## What To Check FIRST

### ✅ Step 1: Your Railway Backend URL
- What is your Railway backend URL?
- Format: `https://backend-xxxxxx.railway.app`
- Paste it here: ________________

---

### ✅ Step 2: Check Railway Deployment Status

Go to: https://railway.app/project

```
1. Click your "panel-pulse" project
2. Look at the top-right status indicator
   ✓ Should show: "Active" (green)
   ✗ If shows: "Failed" or "Building" = deployment issue
   ✗ If shows: "Crashed" = runtime error
```

**What you should see:**
- Deployment Status: **Active**
- Last deploy time: Recent
- Build logs: No red error messages

---

### ✅ Step 3: Check Railway Logs (Most Important!)

```
1. Go to Railway Dashboard
2. Select your project
3. Click "Deployments" tab
4. Click the latest deployment (top of list)
5. Scroll down to "Logs" section
6. Read the logs (look for RED TEXT = errors)
```

**Copy and paste any RED error messages here:**
```
_______________________________________
_______________________________________
_______________________________________
```

---

### ✅ Step 4: Verify Environment Variables in Railway

Go to: `https://railway.app/project` → Settings → Variables

Check that ALL of these are set:

```
[ ] MONGODB_URI
    Current value: mongodb+srv://***...
    Is it complete? Yes / No / Not Set
    
[ ] NODE_ENV  
    Current value: production
    Is it correct? Yes / No / Not Set
    
[ ] FRONTEND_URL
    Current value: https://...
    Is it correct? Yes / No / Not Set
    
[ ] API_PORT
    Current value: (should be EMPTY)
    Is it empty? Yes / No / Needs Change
```

---

### ✅ Step 5: Test Health Endpoint

Open a terminal and run:

```bash
# Replace backend-xyz with YOUR actual Railway URL
curl -v https://YOUR-RAILWAY-URL/api/v1/health

# Example:
curl -v https://backend-abc123.railway.app/api/v1/health
```

What response do you get?

```
[ ] 200 OK with JSON data
    {
      "status": "ok",
      "uptime": 123.45,
      "timestamp": "..."
    }
    
[ ] 502 Bad Gateway (backend crashed)

[ ] 503 Service Unavailable (backend not running)

[ ] 404 Not Found (wrong URL)

[ ] Connection timeout (Railway URL wrong or server down)

[ ] CORS error (browser issue, not backend issue)

[ ] Other: _________________________
```

---

### ✅ Step 6: Check MongoDB Connection in Railway Logs

Search the Railway logs for these keywords:

```
✓ "Connected to MongoDB"        = MongoDB works!
✓ "Database ready"              = Database working!

✗ "MongoServerSelectionError"   = MongoDB connection failing
✗ "ENOTFOUND"                   = DNS issue
✗ "authentication failed"       = Wrong username/password
✗ "Unauthorized"                = No permission to database
```

**What do you see in the logs?**
```
_______________________________________
```

---

## Common Issues Quick Diagnosis

### If you see: "502 Bad Gateway"
**Cause:** Backend crashed or won't start
**Solution:** 
- Check Railway logs for error messages
- Verify all environment variables are set
- Make sure MONGODB_URI is complete (includes username & password)

### If you see: "MongoServerSelectionError"
**Cause:** MongoDB not reachable
**Solution:**
- Verify MongoDB Atlas cluster is "Active" (not Paused)
- Check network access allows Railway IP: https://cloud.mongodb.com → Network Access → 0.0.0.0/0
- Verify MONGODB_URI contains actual username and password (not `<username>`)

### If you see: "Cannot connect to MongoDB"
**Cause:** MongoDB URI missing or incorrect
**Solution:**
- Go to MongoDB Atlas → Databases → Connect
- Copy the connection string
- In Railway Variables, update MONGODB_URI with the copied string
- Replace `<username>` and `<password>` with actual values

### If you see: "CORS error" in browser
**Cause:** FRONTEND_URL not set correctly
**Solution:**
- In Railway Variables, set FRONTEND_URL = your Vercel URL (exactly)
- Verify no typos or trailing slashes
- Redeploy backend

### If backend returns 404 for API routes
**Cause:** Routes not registered
**Solution:**
- Not a Railway issue, likely code issue
- Test locally: `cd backend && npm start`
- Check that src/index.js mounts all routes

---

## Information I Need From You

To diagnose the issue, please provide:

1. **Your Railway backend URL**
   ```
   https://____________________
   ```

2. **Railway deployment status** (green Active, or red Failed?)
   ```
   ____________________
   ```

3. **Error message from Railway logs** (copy & paste)
   ```
   ____________________
   ____________________
   ____________________
   ```

4. **Health endpoint test result**
   ```
   curl https://YOUR-URL/api/v1/health
   
   Response:
   ____________________
   ```

5. **MONGODB_URI in Railway** (first 50 chars, with password removed)
   ```
   mongodb+srv://username:****@cluster...
   ```

6. **What error do you see when accessing the backend?**
   ```
   [ ] 502 Bad Gateway
   [ ] 503 Service Unavailable
   [ ] Connection timeout
   [ ] 404 Not Found
   [ ] CORS error
   [ ] Other: ________________
   ```

---

## Next Steps

Once you provide the information above, I can:
1. ✅ Identify the exact issue
2. ✅ Provide specific fix instructions
3. ✅ Get your Railway backend working
4. ✅ Help link it with Vercel frontend

**Don't worry - 99% of Railway issues are environment variable issues, which are easy to fix!**
