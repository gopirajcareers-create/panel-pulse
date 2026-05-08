# Commit frontend moderation integration

Write-Host "📦 Committing Frontend Moderation Integration" -ForegroundColor Cyan

# Stage the files
git add frontend/src/pages/ResultsPage.tsx
git add frontend/src/lib/stores/evaluation.store.ts
git add frontend/src/components/features/evaluation/ModerationCard.tsx

# Show what's staged
Write-Host "`n📋 Files to commit:" -ForegroundColor Yellow
git diff --cached --name-only

# Commit
git commit -m "feat: integrate ModerationCard component into Results page

- Import and display ModerationCard in ResultsPage.tsx
- Add moderation field to evaluation store
- Add moderation to progressive reveal animation
- Show moderation section after L2 validation
- Component displays even if no discriminatory questions (shows PASS)

This completes the moderation feature integration:
- Backend: moderationService.js analyzes transcripts
- Frontend: ModerationCard displays results
- Store: moderation data persisted

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push
git push origin main

Write-Host "`n✅ DONE! Frontend moderation integration pushed" -ForegroundColor Green
Write-Host "`nNext: Deploy to VM and test with a new evaluation" -ForegroundColor Cyan
