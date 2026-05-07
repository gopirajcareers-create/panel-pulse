/**
 * Backfill Moderation Data Script
 *
 * This script analyzes all existing panel evaluations that don't have
 * moderation data and adds it to the database.
 *
 * Usage: node scripts/backfill-moderation.js
 */

const { analyzeInterviewModeration } = require('../src/services/moderationService');
const { getDb } = require('../src/services/mongoClient');

async function backfillModeration() {
  try {
    console.log('🚀 Starting moderation backfill process...\n');

    const db = await getDb();
    const collection = db.collection('panel_evaluations');

    // Find all evaluations without moderation data
    const evaluationsWithoutModeration = await collection.find({
      $or: [
        { moderation: { $exists: false } },
        { moderation: null }
      ],
      l1_transcript: { $exists: true, $ne: '', $ne: null }
    }).toArray();

    console.log(`Found ${evaluationsWithoutModeration.length} evaluations without moderation data.\n`);

    if (evaluationsWithoutModeration.length === 0) {
      console.log('✅ All evaluations already have moderation data. Nothing to backfill.');
      process.exit(0);
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < evaluationsWithoutModeration.length; i++) {
      const evaluation = evaluationsWithoutModeration[i];
      const jobId = evaluation['Job Interview ID'];
      const panelName = evaluation['Panel Name'];
      const candidateName = evaluation['Candidate Name'];

      console.log(`[${i + 1}/${evaluationsWithoutModeration.length}] Processing: ${jobId} - ${panelName}`);

      try {
        // Run moderation analysis
        const result = await analyzeInterviewModeration({
          l1_transcript: evaluation.l1_transcript,
          job_id: jobId
        });

        if (!result.success) {
          console.error(`  ❌ Moderation failed: ${result.error}`);
          errorCount++;
          continue;
        }

        // Update the document with moderation results
        await collection.updateOne(
          { _id: evaluation._id },
          {
            $set: {
              moderation: result.moderation,
              moderation_analyzed_at: new Date().toISOString(),
              moderation_backfilled: true
            }
          }
        );

        const compliance = result.moderation?.overall_compliance || 'unknown';
        console.log(`  ✅ Success - Compliance: ${compliance}`);
        successCount++;

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Backfill Summary:');
    console.log(`  Total processed: ${evaluationsWithoutModeration.length}`);
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed: ${errorCount}`);
    console.log('='.repeat(60));

    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillModeration();
