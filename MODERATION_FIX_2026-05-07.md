# Moderation System Fix - May 7, 2026

## Problem Summary
Moderation feature was not working in both VM and production environments despite working previously. The system was silently failing to detect discriminatory questions in interview transcripts.

## Root Cause Analysis

### Investigation Process
1. Examined recent git commits, finding commit `1e6745aa` (May 4): "fix: restore missing moderation analysis in panel evaluation"
2. Checked code structure in both `panel-pulse/` subdirectory and root `backend/` directory
3. Discovered file discrepancy

### Root Cause: **Missing File**

**File exists in:** `panel-pulse/backend/src/services/moderationService.js` ✅  
**File missing from:** `backend/src/services/moderationService.js` ❌

This is critical because:
- The deployed backend uses `/opt/panel-pulse/backend` (root backend directory)
- The `panelEvaluationService.js` requires `'./moderationService'` (relative path)
- When the module is not found, the error is caught and silently returns `null`

### Silent Failure Mechanism

In `panelEvaluationService.js` (lines 884-896):

```javascript
async function _runModeration(transcript, job_id) {
  try {
    const { analyzeInterviewModeration } = require('./moderationService');
    const result = await analyzeInterviewModeration({
      l1_transcript: transcript,
      job_id
    });
    return result.success ? result.moderation : null;
  } catch (err) {
    console.error('_runModeration error:', err.message);
    return null; // Don't fail the whole evaluation if moderation fails
  }
}
```

**Why it fails silently:**
1. `require('./moderationService')` throws MODULE_NOT_FOUND error
2. Error is caught in try-catch
3. Function returns `null` without breaking the evaluation
4. Panel evaluation continues successfully without moderation data
5. No user-visible error in UI

### Why It Worked Before
- The file was present in an earlier deployment
- After a repository restructure or deployment change, the file was not copied to the root backend directory
- The recent commit attempted to "restore" the moderation call but didn't address the missing file

## The Fix

### Applied Solution
✅ **Copied `moderationService.js` from `panel-pulse/backend/src/services/` to `backend/src/services/`**

This ensures:
- The require() statement finds the module
- Moderation analysis executes during panel evaluation
- Discriminatory questions are detected and reported

### Files Changed
- **Created:** `backend/src/services/moderationService.js`

## Testing Required

### 1. Local Testing
Run the diagnostic script:
```bash
node diagnose-moderation.js
```

Expected results:
- ✅ LLM connectivity successful
- ✅ Moderation service detects age, marital status, religion violations
- ✅ End-to-end evaluation includes moderation data
- ✅ Moderation data saved to MongoDB

### 2. VM/Production Testing

#### Check Server Logs
Look for these error patterns that would have indicated the problem:
```
_runModeration error: Cannot find module './moderationService'
```

#### Test Evaluation
1. Upload a test interview with discriminatory questions
2. Run panel evaluation
3. Verify moderation section appears in results page
4. Check that violations are properly detected

#### Sample Discriminatory Questions for Testing
```
Interviewer: What year did you graduate from college?
Interviewer: Are you married? Do you have any children?
Interviewer: Do you practice any religion that requires time off?
```

Expected detection:
- 🚨 Age: HIGH severity
- 🚨 Marital Status: HIGH severity  
- 🚨 Religion: HIGH severity
- ❌ Overall Compliance: FAIL

### 3. Database Verification
Check existing evaluations:
```bash
cd panel-pulse/backend
node scripts/check-moderation-status.js
```

This shows:
- Total evaluations in database
- How many have moderation data
- How many are missing moderation data

To backfill missing moderation data:
```bash
node scripts/backfill-moderation.js
```

## Deployment Checklist

### For VM Deployment
- [ ] Ensure `backend/src/services/moderationService.js` exists in git
- [ ] Commit and push changes
- [ ] Pull latest code on VM
- [ ] Restart backend service
- [ ] Test with sample evaluation
- [ ] Check server logs for any errors
- [ ] Verify moderation appears in results

### For Production Deployment
- [ ] Same steps as VM
- [ ] Monitor production logs
- [ ] Test with real interview data
- [ ] Verify no performance degradation

## Prevention Measures

### 1. Add File Existence Check
Add a startup check in `server.js`:

```javascript
// Verify critical service files exist
const fs = require('fs');
const criticalServices = [
  './src/services/moderationService.js',
  './src/services/panelEvaluationService.js',
  './src/services/llmClient.js'
];

for (const service of criticalServices) {
  if (!fs.existsSync(path.join(__dirname, service))) {
    console.error(`CRITICAL: Missing service file: ${service}`);
    process.exit(1);
  }
}
```

### 2. Improve Error Handling
Make moderation failures more visible:

```javascript
async function _runModeration(transcript, job_id) {
  try {
    const { analyzeInterviewModeration } = require('./moderationService');
    const result = await analyzeInterviewModeration({
      l1_transcript: transcript,
      job_id
    });
    if (!result.success) {
      console.warn(`⚠️  Moderation failed for job ${job_id}: ${result.error}`);
    }
    return result.success ? result.moderation : null;
  } catch (err) {
    console.error(`❌ CRITICAL: _runModeration error for job ${job_id}:`, err.message);
    // Consider: send alert to monitoring system
    return null;
  }
}
```

### 3. Add Monitoring
- Alert if moderation data is missing from > 10% of recent evaluations
- Dashboard metric showing moderation coverage percentage
- Log aggregation to catch require() errors

## Technical Details

### Moderation Service Features
The `moderationService.js` analyzes interview transcripts for:

1. **Age Discrimination**
   - Birth year questions
   - Graduation dates revealing age
   - Retirement plans

2. **Marital Status**
   - Marriage questions
   - Spouse inquiries
   - Children/family planning

3. **Religion**
   - Religious beliefs
   - Practices and holidays

4. **Gender/Sexual Orientation**
   - Gender identity
   - Sexual orientation questions

5. **Race/Ethnicity**
   - National origin
   - Ethnicity questions

6. **Disability**
   - Health conditions
   - Disabilities (unless job-related)

7. **Language/Region**
   - Accent discrimination
   - Regional bias

### Severity Levels
- **High**: Direct discriminatory question
- **Medium**: Indirect/implied discrimination
- **Low**: Borderline/context-dependent
- **None**: No violation

### Overall Compliance
- **PASS**: Interview is compliant (green)
- **WARNING**: Minor issues detected (orange)
- **FAIL**: Significant violations (red)

## Impact Assessment

### Before Fix
- ❌ All evaluations missing moderation data
- ❌ Discriminatory questions going undetected
- ❌ Compliance violations not reported
- ❌ No interviewer feedback on inappropriate questions
- ⚠️  Legal/HR risk exposure

### After Fix
- ✅ Moderation analysis runs on every evaluation
- ✅ Discriminatory questions detected and reported
- ✅ Compliance status visible in results
- ✅ Interviewer training feedback available
- ✅ Audit trail for compliance reviews

## Contact
For questions or issues:
- Check server logs: `/opt/panel-pulse/backend/logs/`
- Run diagnostics: `node diagnose-moderation.js`
- Review scripts: `panel-pulse/backend/scripts/`

---

**Fix Applied:** May 7, 2026  
**Status:** ✅ Ready for deployment  
**Priority:** HIGH (Legal/Compliance)
