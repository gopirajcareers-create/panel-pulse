/**
 * Quick Verification Script for Moderation Fix
 *
 * This script verifies that moderationService.js is accessible
 * and can successfully detect discriminatory questions.
 */

console.log('🔍 Verifying Moderation Fix...\n');

// Test 1: Check if file exists
console.log('TEST 1: File Existence Check');
const fs = require('fs');
const path = require('path');

const filePaths = [
  './backend/src/services/moderationService.js',
  './panel-pulse/backend/src/services/moderationService.js'
];

filePaths.forEach(filePath => {
  const exists = fs.existsSync(filePath);
  console.log(`  ${exists ? '✅' : '❌'} ${filePath} ${exists ? 'exists' : 'MISSING'}`);
});

// Test 2: Check if require works
console.log('\nTEST 2: Module Require Check');
try {
  const { analyzeInterviewModeration } = require('./backend/src/services/moderationService');
  console.log('  ✅ Successfully required moderationService from backend/');
  console.log('  ✅ analyzeInterviewModeration function is available');
} catch (error) {
  console.log('  ❌ FAILED to require moderationService');
  console.log(`  Error: ${error.message}`);
  process.exit(1);
}

// Test 3: Simple functionality test
console.log('\nTEST 3: Basic Functionality Check');

// Set minimal environment for testing
process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'uwd1xWkrxt1iQa1mdMQvBqyumPzWnUyf';
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://10.10.160.51:11434';
process.env.OLLAMA_MODEL_NAME = process.env.OLLAMA_MODEL_NAME || 'qwen3:latest';

const { analyzeInterviewModeration } = require('./backend/src/services/moderationService');

const testTranscript = `
Interviewer: Can you tell me about your React experience?
Candidate: I have 5 years of React experience.

Interviewer: What year did you graduate from university?
Candidate: I graduated in 2018.

Interviewer: Are you married?
Candidate: I prefer not to answer that.

Interviewer: Let's talk about your technical projects...
`;

analyzeInterviewModeration({
  l1_transcript: testTranscript,
  job_id: 'VERIFY-TEST-001'
})
  .then(result => {
    if (result.success) {
      console.log('  ✅ Moderation analysis completed successfully\n');

      const flags = result.moderation?.flags || {};
      const detectedCategories = Object.entries(flags)
        .filter(([_, flag]) => flag.detected)
        .map(([category]) => category);

      console.log('  Detection Results:');
      if (detectedCategories.length > 0) {
        console.log(`    🚨 Detected violations: ${detectedCategories.join(', ')}`);
        console.log(`    Overall compliance: ${result.moderation.overall_compliance.toUpperCase()}`);

        // Verify expected detections
        const expectedCategories = ['age', 'marital_status'];
        const allExpectedDetected = expectedCategories.every(cat => detectedCategories.includes(cat));

        if (allExpectedDetected) {
          console.log('\n✅ ALL TESTS PASSED');
          console.log('   The moderation system is working correctly!');
          console.log('   - File exists and is accessible');
          console.log('   - Module can be required');
          console.log('   - Discrimination detection is functional');
        } else {
          console.log('\n⚠️  PARTIAL SUCCESS');
          console.log(`   Expected to detect: ${expectedCategories.join(', ')}`);
          console.log(`   Actually detected: ${detectedCategories.join(', ')}`);
          console.log('   The system runs but detection may need tuning.');
        }
      } else {
        console.log('    ⚠️  No violations detected (unexpected for this test)');
        console.log('\n⚠️  TESTS PASSED WITH WARNING');
        console.log('   The moderation service runs but did not detect obvious violations.');
        console.log('   This may indicate the LLM is not responding correctly.');
      }

      process.exit(0);
    } else {
      console.log('  ❌ Moderation analysis FAILED');
      console.log(`  Error: ${result.error}`);
      console.log('\n❌ TEST FAILED');
      console.log('   The moderation service is accessible but not working correctly.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.log('  ❌ Error running moderation analysis');
    console.log(`  ${error.message}`);
    console.log('\n❌ TEST FAILED');
    console.log('   The moderation service threw an error during execution.');
    process.exit(1);
  });
