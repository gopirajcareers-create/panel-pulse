# Commit the critical moderation API fixes

Write-Host "🔧 Committing Moderation API Fixes" -ForegroundColor Cyan
Write-Host "=" * 70

# Stage all three critical fixes
git add backend/src/routes/panel.js
git add frontend/src/lib/api/dashboard.api.ts

# Show what's being committed
Write-Host "`n📋 Files to commit:" -ForegroundColor Yellow
git diff --cached --name-only

Write-Host "`n📝 Changes:" -ForegroundColor Yellow
Write-Host "  Backend route: Added moderation + gapAnalysis to API response"
Write-Host "  Backend async: Added moderation to async job result"
Write-Host "  Frontend API:  Added moderation mapping from response"

# Commit
git commit -m "fix: add moderation field to API responses (critical bug fix)

ROOT CAUSE:
Backend was generating and storing moderation data correctly,
but API routes were NOT returning it to the frontend.

FIXES:
1. backend/src/routes/panel.js (Line 683-684)
   - Added moderation + gapAnalysis to /evaluation/:id response

2. backend/src/routes/panel.js (Line 162)
   - Added moderation to /score async job response

3. frontend/src/lib/api/dashboard.api.ts (Line 206)
   - Added moderation mapping from API body

IMPACT:
- Frontend will now receive moderation data
- ModerationCard will render on Results page
- Users can see discriminatory question detection

TESTING:
- Create NEW evaluation after deployment
- Check Results page for Moderation section
- Verify violations are detected and displayed

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push
git push origin main

Write-Host "`n✅ SUCCESS! Moderation API fixes pushed to main" -ForegroundColor Green
Write-Host "`n🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Deploy to VM: git pull origin main" -ForegroundColor White
Write-Host "  2. Restart backend: pm2 restart backend" -ForegroundColor White
Write-Host "  3. Rebuild frontend: cd frontend && npm run build" -ForegroundColor White
Write-Host "  4. Create NEW evaluation (old ones won't have moderation)" -ForegroundColor White
Write-Host "  5. Check Results page - Moderation card should now appear!" -ForegroundColor White
