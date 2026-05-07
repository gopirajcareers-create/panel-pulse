/**
 * Comprehensive Moderation Diagnosis Script
 *
 * This script tests the entire moderation pipeline:
 * 1. LLM connectivity (Ollama, GROQ, Mistral)
 * 2. Moderation service functionality
 * 3. Database storage
 * 4. End-to-end integration
 */

// Set environment to use Ollama primarily
process.env.OLLAMA_BASE_URL = 'http://10.10.160.51:11434';
process.env.OLLAMA_MODEL_NAME = 'qwen3:latest';
process.env.MISTRAL_API_KEY = 'uwd1xWkrxt1iQa1mdMQvBqyumPzWnUyf';
process.env.MONGODB_URI = 'mongodb://Indium_db_user:Zpbw4tMshigPCaiE@ac-i6sssar-shard-00-00.apydgio.mongodb.net:27017,ac-i6sssar-shard-00-01.apydgio.mongodb.net:27017,ac-i6sssar-shard-00-02.apydgio.mongodb.net:27017/?authSource=admin&replicaSet=atlas-13zmos-shard-0&appName=PanelpulseCluster&ssl=true';
process.env.MONGODB_DB = 'panel_db';

const axios = require('axios');

// Test transcript with CLEAR discriminatory questions
const DISCRIMINATORY_TRANSCRIPT = `
Interviewer: Hi, thanks for joining us today. Let's start with some background.

Interviewer: Can you tell me what year you graduated from college?
Candidate: I graduated in 2018 from MIT.

Interviewer: That's great. Are you married? Do you have any children?
Candidate: I prefer not to answer personal questions.

Interviewer: I understand. Let me ask about your technical experience. How many years have you worked with React?
Candidate: I have about 5 years of experience with React and modern JavaScript frameworks.

Interviewer: Excellent. One more thing - do you practice any religion that might require time off during the week?
Candidate: That's a very personal question.

Interviewer: Fair enough. Let's talk about your project experience...
`;

const CLEAN_TRANSCRIPT = `
Interviewer: Can you describe your experience with cloud technologies?
Candidate: I have extensive experience with AWS, including Lambda, S3, and DynamoDB.

Interviewer: How do you approach system design for high-traffic applications?
Candidate: I typically start by understanding the requirements and then focus on scalability patterns.

Interviewer: Can you walk me through a recent technical challenge you solved?
Candidate: Sure, we had a database performance issue that I resolved by implementing caching...
`;

class ModerationDiagnostics {
  constructor() {
    this.results = {
      llmConnectivity: null,
      moderationService: null,
      databaseConnection: null,
      endToEnd: null
    };
  }

  async runAll() {
    console.log('🔬 Starting Comprehensive Moderation Diagnostics\n');
    console.log('=' .repeat(70));

    await this.testLLMConnectivity();
    console.log('\n' + '='.repeat(70));

    await this.testModerationService();
    console.log('\n' + '='.repeat(70));

    await this.testDatabaseConnection();
    console.log('\n' + '='.repeat(70));

    await this.testEndToEnd();
    console.log('\n' + '='.repeat(70));

    this.printSummary();
  }

  async testLLMConnectivity() {
    console.log('\n📡 TEST 1: LLM Connectivity\n');

    const providers = [];

    // Test Ollama
    if (process.env.OLLAMA_BASE_URL) {
      console.log('Testing Ollama...');
      try {
        const response = await axios.post(
          `${process.env.OLLAMA_BASE_URL}/api/chat`,
          {
            model: process.env.OLLAMA_MODEL_NAME,
            messages: [{ role: 'user', content: 'Reply with just "OK"' }],
            stream: false
          },
          { timeout: 10000 }
        );

        if (response.data?.message?.content) {
          console.log('  ✅ Ollama: CONNECTED');
          console.log(`     Model: ${process.env.OLLAMA_MODEL_NAME}`);
          console.log(`     URL: ${process.env.OLLAMA_BASE_URL}`);
          providers.push('Ollama');
          this.results.llmConnectivity = { status: 'success', provider: 'Ollama' };
        }
      } catch (error) {
        console.log('  ❌ Ollama: FAILED');
        console.log(`     Error: ${error.message}`);
        console.log(`     Code: ${error.code || 'N/A'}`);
      }
    }

    // Test Mistral
    if (process.env.MISTRAL_API_KEY) {
      console.log('\nTesting Mistral...');
      try {
        const response = await axios.post(
          'https://api.mistral.ai/v1/chat/completions',
          {
            model: 'mistral-large-latest',
            messages: [{ role: 'user', content: 'Reply with just "OK"' }],
            max_tokens: 10
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        if (response.data?.choices?.[0]?.message?.content) {
          console.log('  ✅ Mistral: CONNECTED');
          providers.push('Mistral');
          if (!this.results.llmConnectivity) {
            this.results.llmConnectivity = { status: 'success', provider: 'Mistral (fallback)' };
          }
        }
      } catch (error) {
        console.log('  ❌ Mistral: FAILED');
        console.log(`     Error: ${error.response?.data?.message || error.message}`);
      }
    }

    if (providers.length === 0) {
      console.log('\n❌ CRITICAL: No LLM providers available!');
      this.results.llmConnectivity = { status: 'failed', provider: 'none' };
    } else {
      console.log(`\n✅ Available providers: ${providers.join(', ')}`);
    }
  }

  async testModerationService() {
    console.log('\n🛡️  TEST 2: Moderation Service\n');

    try {
      const { analyzeInterviewModeration } = require('./panel-pulse/backend/src/services/moderationService');

      console.log('Testing with discriminatory transcript...');
      const result = await analyzeInterviewModeration({
        l1_transcript: DISCRIMINATORY_TRANSCRIPT,
        job_id: 'DIAG-TEST-001'
      });

      if (!result.success) {
        console.log('❌ Moderation service FAILED');
        console.log(`   Error: ${result.error}`);
        this.results.moderationService = { status: 'failed', error: result.error };
        return;
      }

      console.log('✅ Moderation service executed successfully\n');

      // Check if it actually detected the issues
      const flags = result.moderation?.flags || {};
      const detectedCategories = Object.entries(flags)
        .filter(([_, flag]) => flag.detected)
        .map(([category, flag]) => ({
          category,
          severity: flag.severity,
          evidence: flag.evidence[0]
        }));

      console.log('Detected Issues:');
      if (detectedCategories.length === 0) {
        console.log('  ⚠️  WARNING: No discriminatory questions detected!');
        console.log('  Expected to detect: age, marital_status, religion');
        this.results.moderationService = {
          status: 'degraded',
          message: 'Service runs but detection is not working'
        };
      } else {
        detectedCategories.forEach(({ category, severity, evidence }) => {
          console.log(`  🚨 ${category}: ${severity}`);
          if (evidence) {
            console.log(`     "${evidence.substring(0, 60)}..."`);
          }
        });

        console.log(`\n  Overall Compliance: ${result.moderation.overall_compliance.toUpperCase()}`);
        console.log(`  Summary: ${result.moderation.summary}`);

        // Verify expected categories
        const expectedCategories = ['age', 'marital_status', 'religion'];
        const detectedSet = new Set(detectedCategories.map(d => d.category));
        const missedCategories = expectedCategories.filter(c => !detectedSet.has(c));

        if (missedCategories.length > 0) {
          console.log(`\n  ⚠️  Missed categories: ${missedCategories.join(', ')}`);
          this.results.moderationService = {
            status: 'partial',
            detected: detectedCategories.length,
            missed: missedCategories
          };
        } else {
          console.log('\n  ✅ All expected violations detected correctly');
          this.results.moderationService = { status: 'success', detected: detectedCategories.length };
        }
      }

    } catch (error) {
      console.log('❌ Moderation service ERROR');
      console.log(`   ${error.message}`);
      console.log(`   Stack: ${error.stack}`);
      this.results.moderationService = { status: 'error', error: error.message };
    }
  }

  async testDatabaseConnection() {
    console.log('\n💾 TEST 3: Database Connection\n');

    try {
      const { getDb } = require('./panel-pulse/backend/src/services/mongoClient');
      const db = await getDb();

      console.log('✅ Database connected successfully');

      // Check existing moderation data
      const collection = db.collection('panel_evaluations');
      const totalCount = await collection.countDocuments();
      const withModerationCount = await collection.countDocuments({
        moderation: { $exists: true, $ne: null }
      });

      console.log(`\nDatabase Status:`);
      console.log(`  Total evaluations: ${totalCount}`);
      console.log(`  With moderation: ${withModerationCount}`);
      console.log(`  Without moderation: ${totalCount - withModerationCount}`);

      if (totalCount > 0) {
        const coveragePct = Math.round((withModerationCount / totalCount) * 100);
        console.log(`  Coverage: ${coveragePct}%`);

        if (coveragePct < 100) {
          console.log(`\n  ⚠️  ${totalCount - withModerationCount} records missing moderation data`);
        }
      }

      this.results.databaseConnection = {
        status: 'success',
        total: totalCount,
        withModeration: withModerationCount
      };

    } catch (error) {
      console.log('❌ Database connection FAILED');
      console.log(`   Error: ${error.message}`);
      this.results.databaseConnection = { status: 'failed', error: error.message };
    }
  }

  async testEndToEnd() {
    console.log('\n🔄 TEST 4: End-to-End Integration\n');

    try {
      const { performPanelEvaluation } = require('./panel-pulse/backend/src/services/panelEvaluationService');

      console.log('Running full panel evaluation with moderation...');

      const testInput = {
        job_id: 'E2E-DIAG-' + Date.now(),
        panel_name: 'Test Panel',
        candidate_name: 'Test Candidate',
        jd: 'Senior Software Engineer with React and Node.js experience. Must have 5+ years experience.',
        l1_transcripts: [DISCRIMINATORY_TRANSCRIPT],
        l2_rejection_reasons: []
      };

      const result = await performPanelEvaluation(testInput);

      if (!result.success) {
        console.log('❌ End-to-end test FAILED');
        console.log(`   Error: ${result.error}`);
        this.results.endToEnd = { status: 'failed', error: result.error };
        return;
      }

      console.log('✅ Panel evaluation completed\n');

      // Check if moderation was included
      if (result.moderation) {
        console.log('✅ Moderation data present in response');
        const flags = result.moderation.flags || {};
        const detectedCount = Object.values(flags).filter(f => f.detected).length;
        console.log(`   Issues detected: ${detectedCount}`);
        console.log(`   Overall compliance: ${result.moderation.overall_compliance}`);

        if (detectedCount > 0) {
          console.log('\n✅ END-TO-END TEST PASSED');
          this.results.endToEnd = { status: 'success', detected: detectedCount };
        } else {
          console.log('\n⚠️  Moderation ran but detected nothing (unexpected)');
          this.results.endToEnd = { status: 'degraded', message: 'Detection not working' };
        }
      } else {
        console.log('❌ Moderation data MISSING from response');
        console.log('   This indicates moderation is not running in the evaluation pipeline');
        this.results.endToEnd = { status: 'failed', message: 'Moderation not in pipeline' };
      }

      // Check database
      const { getDb } = require('./panel-pulse/backend/src/services/mongoClient');
      const db = await getDb();
      const savedDoc = await db.collection('panel_evaluations').findOne({
        'Job Interview ID': testInput.job_id
      });

      if (savedDoc && savedDoc.moderation) {
        console.log('✅ Moderation data saved to database');
      } else if (savedDoc) {
        console.log('⚠️  Evaluation saved but moderation data missing in DB');
      } else {
        console.log('⚠️  Evaluation not found in database');
      }

    } catch (error) {
      console.log('❌ End-to-end test ERROR');
      console.log(`   ${error.message}`);
      this.results.endToEnd = { status: 'error', error: error.message };
    }
  }

  printSummary() {
    console.log('\n📊 DIAGNOSTIC SUMMARY\n');

    const tests = [
      { name: 'LLM Connectivity', result: this.results.llmConnectivity },
      { name: 'Moderation Service', result: this.results.moderationService },
      { name: 'Database Connection', result: this.results.databaseConnection },
      { name: 'End-to-End Integration', result: this.results.endToEnd }
    ];

    tests.forEach(test => {
      const status = test.result?.status || 'not_run';
      const icon = status === 'success' ? '✅' : status === 'partial' || status === 'degraded' ? '⚠️' : '❌';
      console.log(`${icon} ${test.name}: ${status.toUpperCase()}`);

      if (test.result?.message) {
        console.log(`   ${test.result.message}`);
      }
      if (test.result?.error) {
        console.log(`   Error: ${test.result.error}`);
      }
    });

    console.log('\n' + '='.repeat(70));

    // Overall verdict
    const allSuccess = tests.every(t => t.result?.status === 'success');
    const anyFailure = tests.some(t => t.result?.status === 'failed' || t.result?.status === 'error');

    if (allSuccess) {
      console.log('\n✅ ALL SYSTEMS OPERATIONAL - Moderation is working correctly\n');
    } else if (anyFailure) {
      console.log('\n❌ CRITICAL ISSUES DETECTED - Moderation is NOT working\n');
      console.log('Recommended Actions:');

      if (this.results.llmConnectivity?.status !== 'success') {
        console.log('  1. Check LLM provider connectivity (Ollama/Mistral)');
        console.log('     - Verify Ollama is running: http://10.10.160.51:11434');
        console.log('     - Verify Mistral API key is valid');
      }

      if (this.results.moderationService?.status === 'failed' || this.results.moderationService?.status === 'error') {
        console.log('  2. Check moderationService.js for code errors');
        console.log('     - Review recent changes');
        console.log('     - Check LLM prompt format');
      }

      if (this.results.moderationService?.status === 'degraded' || this.results.moderationService?.status === 'partial') {
        console.log('  3. Detection logic may be broken:');
        console.log('     - LLM is responding but not detecting violations');
        console.log('     - Check system prompt in moderationService.js');
        console.log('     - Verify JSON parsing logic');
      }

      if (this.results.endToEnd?.status === 'failed') {
        console.log('  4. Check panelEvaluationService.js:');
        console.log('     - Ensure _runModeration is called');
        console.log('     - Verify moderation is added to response');
      }

    } else {
      console.log('\n⚠️  PARTIAL FUNCTIONALITY - Some issues detected\n');
    }
  }
}

// Run diagnostics
const diagnostics = new ModerationDiagnostics();
diagnostics.runAll()
  .then(() => {
    console.log('Diagnostics complete.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error during diagnostics:', error);
    process.exit(1);
  });
