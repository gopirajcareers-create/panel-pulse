const { MongoClient } = require('mongodb');
require('dotenv').config();

async function test() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'pp_db';
  console.log('Testing connection to:', uri.split('@')[1], 'DB:', dbName);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    console.log('Successfully connected to MongoDB');
    
    const db = client.db(dbName);
    console.log('Pinging database...');
    await db.command({ ping: 1 });
    console.log('Ping successful');
    
    console.log('Testing index creation on panel_collection...');
    const collection = db.collection('panel_collection');
    await collection.createIndex({ job_interview_id: 1 });
    console.log('Index creation successful');
    
    await client.close();
  } catch (err) {
    console.error('Test failed:');
    console.error(err);
    process.exit(1);
  }
}

test();
