/**
 * Test moderation with Ollama
 */

// Set environment to use Ollama
process.env.OLLAMA_BASE_URL = 'http://10.10.160.51:11434';
process.env.OLLAMA_MODEL_NAME = 'qwen3:latest';
// Comment out Mistral to ensure Ollama is used
delete process.env.MISTRAL_API_KEY;

const { analyzeInterviewModeration } = require('./panel-pulse/backend/src/services/moderationService');

const sampleTranscript = `
Interviewer: Can you tell me about your experience with JavaScript?
Candidate: Yes, I have 5 years of experience with JavaScript and React.

Interviewer: What year did you graduate from university?
Candidate: I graduated in 2018.

Interviewer: Are you married? Do you have any children?
Candidate: I prefer not to answer that.

Interviewer: That's fine. Let's talk about your technical skills...
`;

async function testModeration() {
  console.log('🧪 Testing moderation analysis with Ollama...\n');
  console.log('Sample transcript contains:');
  console.log('  ✓ Technical question (acceptable)');
  console.log('  ✗ Graduation year question (age discrimination)');
  console.log('  ✗ Marital status question (discriminatory)\n');

  try {
    const result = await analyzeInterviewModeration({
      l1_transcript: sampleTranscript,
      job_id: 'TEST-001'
    });

    if (result.success) {
      console.log('✅ SUCCESS! Moderation analysis completed with Ollama\n');
      console.log('Results:');
      console.log('  Overall Compliance:', result.moderation.overall_compliance);
      console.log('  Summary:', result.moderation.summary);
      console.log('\nDetected Issues:');

      for (const [category, flag] of Object.entries(result.moderation.flags)) {
        if (flag.detected) {
          console.log(`  🚨 ${category}: ${flag.severity} severity`);
          if (flag.evidence.length > 0) {
            console.log(`     Evidence: "${flag.evidence[0]}"`);
          }
        }
      }
    } else {
      console.error('❌ FAILED:', result.error);
      console.error('\nTroubleshooting:');
      console.error('  1. Check if Ollama server is running at http://10.10.160.51:11434');
      console.error('  2. Verify qwen3:latest model is installed (run: ollama list)');
      console.error('  3. Test connectivity: curl http://10.10.160.51:11434/api/tags');
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\nFull error:', error);
  }
}

testModeration();
