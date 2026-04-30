# Vercel Deployment Guide for Panel Pulse AI

## Frontend Deployment (Vercel)

### Step 1: Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Select `frontend` as the root directory

### Step 2: Configure Environment Variables
In the Vercel Dashboard, add the following environment variables:

```
VITE_API_BASE_URL=<your-backend-api-url>
VITE_APP_NAME=Panel Pulse AI
VITE_ENABLE_MOCK=false
```

**Important:** Replace `<your-backend-api-url>` with:
- **Local/VM**: `http://10.10.142.91`
- **Vercel Backend**: `https://your-vercel-backend.vercel.app` (if deployed)
- **Production Backend**: Your production API URL

### Step 3: Build Configuration
Vercel will auto-detect:
- **Framework**: React + Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

## Backend Deployment (Optional for OTP Display)

For the OTP display feature to work on Vercel, the backend API must:

1. **Return OTP in dev/test mode** - The endpoint `/api/v1/auth/request-otp` should return:
```json
{
  "otp": "123456",  // Only in development/test environments
  "message": "OTP sent to email"
}
```

2. **Deploy to Vercel** (if using Vercel for backend):
   - Create a separate Vercel project for the backend
   - Deploy the Node.js backend to Vercel
   - Set the `VITE_API_BASE_URL` to point to the backend URL

## Testing OTP Display Feature

### Localhost (Port 5173)
```bash
cd frontend
npm run dev
```
Navigate to `http://localhost:5173/login`
- The OTP code displays automatically on the OTP step
- Works because backend is running locally

### VM (http://10.10.142.91)
- Same as localhost - OTP displays because backend is running

### Vercel (https://panel-pulse.vercel.app)
- OTP will display **if and only if**:
  1. `VITE_API_BASE_URL` environment variable is set to a working backend API
  2. The backend's `/api/v1/auth/request-otp` endpoint returns the `otp` field

## Troubleshooting OTP Not Showing on Vercel

1. **Check API URL**: Verify `VITE_API_BASE_URL` is correct in Vercel Dashboard
   ```bash
   # In browser console on Vercel site:
   console.log(import.meta.env.VITE_API_BASE_URL)
   ```

2. **Check Backend Response**: The backend must return OTP in development mode:
   ```javascript
   // In backend: backend/src/routes/auth.js (request-otp endpoint)
   if (process.env.NODE_ENV === 'development' || process.env.SHOW_TEST_OTP === 'true') {
     res.json({ otp: generatedOtp, message: 'OTP sent' });
   }
   ```

3. **CORS Issues**: Ensure backend has CORS enabled for your Vercel domain:
   ```javascript
   app.use(cors({
     origin: [
       'http://localhost:3000',
       'http://10.10.142.91',
       'https://panel-pulse.vercel.app',  // Add Vercel URL
       process.env.FRONTEND_URL
     ]
   }));
   ```

## Current Setup

- **Frontend**: Deployed to `https://panel-pulse.vercel.app`
- **Backend**: Points to `http://10.10.142.91` (VM) by default in `.env.production`
- **OTP Feature**: Works on localhost/VM because backend returns `otp` field in response

To enable OTP on Vercel, either:
- Update `VITE_API_BASE_URL` in Vercel Dashboard to your production backend
- Deploy backend to Vercel and set that URL
- Or temporarily set `VITE_API_BASE_URL` to `http://10.10.142.91` (won't work from Vercel public IP)
