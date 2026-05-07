# PowerShell script to commit and push the moderation fix

Write-Host "🔧 Committing Moderation Fix to Main Branch" -ForegroundColor Cyan
Write-Host "=" * 60

# Set location to project root
Set-Location "D:\All_Projects\panel-pulse-ai"

# Check current branch
Write-Host "`n📍 Current branch:" -ForegroundColor Yellow
git branch --show-current

# Show status before committing
Write-Host "`n📊 Git Status:" -ForegroundColor Yellow
git status --short

# Stage the critical file
Write-Host "`n➕ Staging files..." -ForegroundColor Yellow
git add backend/src/services/moderationService.js
git add verify-moderation-fix.js
git add diagnose-moderation.js
git add MODERATION_FIX_SUMMARY.md
git add MODERATION_FIX_2026-05-07.md

# Show what's staged
Write-Host "`n📦 Files staged for commit:" -ForegroundColor Yellow
git diff --cached --name-only

# Create commit
Write-Host "`n💾 Creating commit..." -ForegroundColor Yellow
git commit -m "fix: restore missing moderationService.js to backend directory

Root Cause:
- moderationService.js was missing from backend/src/services/
- File existed in panel-pulse/backend/src/services/ only
- require('./moderationService') failed silently
- Panel evaluations completed WITHOUT moderation data

Impact:
- Moderation feature was completely non-functional in VM and prod
- Discriminatory questions were not being detected
- Legal/HR compliance risk

Fix:
- Copied moderationService.js to backend/src/services/
- Added comprehensive verification and diagnostic scripts
- Created detailed documentation

Testing:
- Run: node verify-moderation-fix.js
- Run: node diagnose-moderation.js

Files Added:
- backend/src/services/moderationService.js (critical fix)
- verify-moderation-fix.js (quick verification)
- diagnose-moderation.js (comprehensive diagnostics)
- MODERATION_FIX_SUMMARY.md (executive summary)
- MODERATION_FIX_2026-05-07.md (detailed documentation)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to remote
Write-Host "`n🚀 Pushing to main branch..." -ForegroundColor Yellow
git push origin main

Write-Host "`n✅ DONE! Moderation fix pushed to main branch" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "  1. Deploy to VM: ssh to VM and run 'git pull origin main'" -ForegroundColor White
Write-Host "  2. Restart backend: pm2 restart backend" -ForegroundColor White
Write-Host "  3. Verify: node verify-moderation-fix.js" -ForegroundColor White
Write-Host "  4. Test with real evaluation" -ForegroundColor White
