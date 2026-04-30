const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectToMongo() {
  if (client && db) return db;

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pp_db';
  const dbName = process.env.MONGODB_DB || 'pp_db';
  
  client = new MongoClient(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000
  });

  await client.connect();
  console.log('✓ MongoDB connected');
  
  db = client.db(dbName);
  
  // Create vector index on panel_collection for hybrid search
  await createVectorIndex();

  // Ensure users collection indexes
  await createUsersIndexes();
  
  return db;
}

async function getDb() {
  if (!db) await connectToMongo();
  return db;
}

async function createVectorIndex() {
  try {
    const collection = db.collection('panel_collection');
    
    // Create basic index for BM25 search on job_interview_id, panel_name, candidate_name
    try {
      await collection.createIndex(
        { job_interview_id: 1, panel_name: 1, candidate_name: 1 }
      );
      console.log('✓ Index created for hybrid search');
    } catch (indexErr) {
      // If index already exists, that's fine - just log it
      if (indexErr.message.includes('already exists')) {
        console.log('✓ Index already exists for hybrid search');
      } else {
        throw indexErr;
      }
    }
  } catch (err) {
    console.warn('Warning: Index setup issue:', err.message);
  }
}

async function createUsersIndexes() {
  try {
    const collection = db.collection('users');
    await collection.createIndex({ email: 1 }, { unique: true });
    await collection.createIndex({ empId: 1 }, { unique: true });
    console.log('✓ Users collection indexes ensured');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('✓ Users indexes already exist');
    } else {
      console.warn('Warning: Users index setup issue:', err.message);
    }
  }
}

function getMongoClient() {
  return client;
}

async function ping() {
  if (!client) throw new Error('MongoDB not connected');
  await client.db('admin').command({ ping: 1 });
  return true;
}

async function disconnect() {
  if (client) {
    await client.close();
    client = null;
  }
}

module.exports = {
  connectToMongo,
  getDb,
  getMongoClient,
  ping,
  disconnect
};
