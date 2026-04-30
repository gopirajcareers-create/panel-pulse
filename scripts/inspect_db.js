const { MongoClient } = require('mongodb');

(async function(){
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'pp_db';
  console.log('using URI', uri);
  console.log('using DB', dbName);
  try {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    const names = await db.listCollections().toArray();
    console.log('collections', names.map(c=>c.name));
    const count = await db.collection('panel_evaluations').countDocuments();
    console.log('panel_evaluations count', count);
    const doc = await db.collection('panel_evaluations').findOne();
    console.log('one doc', doc);
    await client.close();
  } catch (e) {
    console.error('error', e);
  }
})();