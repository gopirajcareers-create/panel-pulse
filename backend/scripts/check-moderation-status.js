/**
 * Check Moderation Status Script
 *
 * This script checks how many evaluations have moderation data
 * and shows some sample records.
 *
 * Usage: node scripts/check-moderation-status.js
 */

const { getDb } = require('../src/services/mongoClient');

async function checkModerationStatus() {
  try {
    console.log('🔍 Checking moderation status...\n');

    const db = await getDb();
    const collection = db.collection('panel_evaluations');

    // Get total count
    const totalCount = await collection.countDocuments();
    console.log(`Total evaluations: ${totalCount}`);

    // Count with moderation data
    const withModerationCount = await collection.countDocuments({
      moderation: { $exists: true, $ne: null }
    });
    console.log(`With moderation data: ${withModerationCount}`);

    // Count without moderation data
    const withoutModerationCount = totalCount - withModerationCount;
    console.log(`Without moderation data: ${withoutModerationCount}`);

    const percentage = totalCount > 0
      ? Math.round((withModerationCount / totalCount) * 100)
      : 0;
    console.log(`\nCoverage: ${percentage}%\n`);

    // Show sample records WITHOUT moderation
    if (withoutModerationCount > 0) {
      console.log('📋 Sample records WITHOUT moderation data:');
      const samplesWithout = await collection.find({
        $or: [
          { moderation: { $exists: false } },
          { moderation: null }
        ]
      }).limit(5).toArray();

      samplesWithout.forEach((doc, idx) => {
        console.log(`  ${idx + 1}. Job ID: ${doc['Job Interview ID']} | Panel: ${doc['Panel Name']} | Date: ${doc.evaluated_at || 'N/A'}`);
        console.log(`     Has transcript: ${!!doc.l1_transcript}`);
      });
      console.log();
    }

    // Show sample records WITH moderation
    if (withModerationCount > 0) {
      console.log('✅ Sample records WITH moderation data:');
      const samplesWith = await collection.find({
        moderation: { $exists: true, $ne: null }
      }).limit(3).toArray();

      samplesWith.forEach((doc, idx) => {
        const compliance = doc.moderation?.overall_compliance || 'unknown';
        const flags = doc.moderation?.flags || {};
        const detectedCount = Object.values(flags).filter((f) => f?.detected).length;

        console.log(`  ${idx + 1}. Job ID: ${doc['Job Interview ID']} | Panel: ${doc['Panel Name']}`);
        console.log(`     Compliance: ${compliance} | Issues detected: ${detectedCount}`);
      });
      console.log();
    }

    console.log('='.repeat(60));
    if (withoutModerationCount > 0) {
      console.log('💡 Tip: Run backfill-moderation.js to add moderation data to existing records.');
    } else {
      console.log('✨ All evaluations have moderation data!');
    }
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('Error checking moderation status:', error);
    process.exit(1);
  }
}

// Run the check
checkModerationStatus();
