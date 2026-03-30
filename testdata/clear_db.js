const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '../.env' });

async function clearDatabase() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || 'panel_db';

    if (!uri) {
        console.error('Error: MONGODB_URI not found in .env file');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✓ Connected to MongoDB');
        
        const db = client.db(dbName);
        
        // 1. Clear evaluations
        console.log(`Clearing collection: panel_evaluations...`);
        const evalResult = await db.collection('panel_evaluations').deleteMany({});
        console.log(`✓ Deleted ${evalResult.deletedCount} documents from panel_evaluations`);

        // 2. Clear panel collection (vector storage)
        console.log(`Clearing collection: panel_collection...`);
        const collResult = await db.collection('panel_collection').deleteMany({});
        console.log(`✓ Deleted ${collResult.deletedCount} documents from panel_collection`);

        console.log('\nDatabase cleanup complete. You can now re-run your evaluations.');

    } catch (error) {
        console.error('Error clearing database:', error);
    } finally {
        await client.close();
    }
}

clearDatabase();
