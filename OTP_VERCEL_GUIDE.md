# Panel Pulse AI - OTP Display on Vercel

## Overview

The OTP (One-Time Password) display feature is **already implemented** and works on:
- ✅ **Localhost** (http://localhost:5173/login)
- ✅ **VM** (http://10.10.142.91/login)
- ✅ **Vercel** (https://panel-pulse.vercel.app/login) - *requires backend API*

## How It Works

### Frontend (ChatPage.tsx)
The login page displays a testing OTP box when:
1. User enters email and requests OTP
2. Backend returns `otp` field in response
3. OTP displays in a styled container (lines 226-241)

```tsx
{testOtp && (
  <div className="mb-6 p-4 rounded-xl border border-accent-primary/30 bg-accent-primary/5">
    <div className="text-4xl font-mono font-black text-accent-primary">
      {testOtp}
    </div>
  </div>
)}
```

### Backend (auth.js)
The request-otp endpoint returns OTP when:
```javascript
if (process.env.NODE_ENV !== 'production' || process.env.SHOW_OTP_IN_RESPONSE === 'true') {
  responseData.otp = code;
}
```

## Deployment to Vercel

### Quick Start

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Add OTP display to Vercel"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to https://vercel.com/import
   - Select your GitHub repository
   - Choose `frontend` as root directory

3. **Set Environment Variables** in Vercel Dashboard:
   ```
   VITE_API_BASE_URL = https://your-backend-api.vercel.app
   VITE_APP_NAME = Panel Pulse AI
   VITE_ENABLE_MOCK = false
   ```

4. **Deploy**
   ```bash
   vercel deploy --prod
   ```

### Option A: Backend on Same Vercel (Recommended)

Deploy backend to Vercel first:

```bash
# In backend directory
vercel deploy --prod

# Copy the URL (e.g., https://panel-pulse-api.vercel.app)
# Add to frontend environment variables:
# VITE_API_BASE_URL = https://panel-pulse-api.vercel.app

# Then enable OTP display by setting on backend Vercel project:
# SHOW_OTP_IN_RESPONSE = true
```

### Option B: Backend on VM

If backend stays on VM (10.10.142.91):

```
VITE_API_BASE_URL = http://10.10.142.91
```

⚠️ **Note**: Won't work from Vercel (private IP unreachable from public internet)

### Option C: Custom Production Backend

If you have a production backend:

```
VITE_API_BASE_URL = https://your-production-api.com
```

Ensure backend:
- Has CORS enabled for `https://panel-pulse.vercel.app`
- Returns `otp` field in development or when `SHOW_OTP_IN_RESPONSE=true`

## Verification

After deployment, test OTP display:

1. Open https://panel-pulse.vercel.app/login
2. Enter your email (must be @indium.tech)
3. When "Check your email" screen appears, verify:
   - ✅ OTP displays in the styled box
   - ✅ Input fields accept 6 digits
   - ✅ Auto-submit works

## Troubleshooting

### OTP Not Displaying
```bash
# Check 1: Verify API URL in browser console
open https://panel-pulse.vercel.app
# In console: console.log(import.meta.env.VITE_API_BASE_URL)

# Check 2: Verify backend responds with OTP
curl https://your-backend-api.vercel.app/api/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"user@indium.tech"}'

# Should see: { "otp": "123456", "message": "..." }

# Check 3: Enable OTP on production backend
# In backend Vercel project settings, add:
# SHOW_OTP_IN_RESPONSE = true
```

### CORS Issues
Add Vercel domain to backend CORS config:
```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://10.10.142.91',
    'https://panel-pulse.vercel.app',  // ← Add this
    process.env.FRONTEND_URL
  ]
}));
```

### Backend Not Responding
- Check backend is deployed and running
- Verify `VITE_API_BASE_URL` matches backend domain
- Check network tab in browser DevTools
- Verify CORS headers in response

## Environment Variables Reference

| Variable | Example | Purpose |
|----------|---------|---------|
| VITE_API_BASE_URL | https://api.example.com | Backend API endpoint |
| VITE_APP_NAME | Panel Pulse AI | App display name |
| VITE_ENABLE_MOCK | false | Use mock data (testing) |

**Backend Variables** (for showing OTP):
| Variable | Example | Purpose |
|----------|---------|---------|
| NODE_ENV | production | Enables OTP display if not "production" |
| SHOW_OTP_IN_RESPONSE | true | Force OTP display in production |

## Files Modified

- ✅ `frontend/src/pages/LoginPage.tsx` - OTP display (lines 226-241)
- ✅ `backend/src/routes/auth.js` - OTP return logic (lines 78-80)
- ✅ `frontend/.env.production` - Production config
- ✅ `VERCEL_DEPLOYMENT.md` - Detailed guide

## Testing Locally

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Visit http://localhost:5173/login
# OTP should display automatically
```

## Next Steps

1. ✅ Code is ready - just deploy!
2. Deploy backend to Vercel (optional)
3. Deploy frontend to Vercel
4. Configure environment variables
5. Test OTP display on https://panel-pulse.vercel.app/login

## Support

For issues or questions about OTP display:
- Check browser console for errors
- Verify API URL in Vercel Dashboard
- Check backend logs for request/response
- Ensure backend returns `otp` field
