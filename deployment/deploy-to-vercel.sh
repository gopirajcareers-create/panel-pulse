#!/bin/bash

# ─── Vercel Deployment Helper ───────────────────────────────────────────────

set -e

echo "🚀 Panel Pulse AI - Vercel Deployment Helper"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "❌ Vercel CLI not found. Install with: npm install -g vercel"
  exit 1
fi

# Detect if we're in the frontend directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Run this script from the frontend directory:"
  echo "   cd frontend && bash ../deployment/deploy-to-vercel.sh"
  exit 1
fi

echo ""
echo "📋 Deployment Steps:"
echo "1. Link/create Vercel project"
echo "2. Configure environment variables"
echo "3. Deploy frontend"
echo ""

# Step 1: Link project
echo "🔗 Linking Vercel project..."
vercel link --yes 2>/dev/null || vercel link

# Step 2: Show environment setup instructions
echo ""
echo "⚙️  Environment Variables Setup:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Add these environment variables in Vercel Dashboard:"
echo ""
echo "  Key: VITE_API_BASE_URL"
echo "  Value: <your-backend-api-url>"
echo "         (e.g., https://panel-pulse-api.vercel.app)"
echo ""
echo "  Key: VITE_APP_NAME"
echo "  Value: Panel Pulse AI"
echo ""
echo "  Key: VITE_ENABLE_MOCK"
echo "  Value: false"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: Deploy
echo "🚀 Deploying to Vercel..."
vercel deploy --prod

echo ""
echo "✅ Deployment complete!"
echo "📱 Your app is live at: $(vercel inspect --prod 2>/dev/null | grep 'Production' | awk '{print $NF}')"
echo ""
echo "💡 For OTP display to work:"
echo "   - Ensure backend API is running"
echo "   - Set VITE_API_BASE_URL to your backend URL"
echo "   - Backend must return 'otp' field in /api/v1/auth/request-otp response"
echo ""
