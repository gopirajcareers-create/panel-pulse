const { MongoClient } = require('mongodb');

(async()=>{
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'pp_db';
  console.log('uri', uri);
  console.log('db', dbName);
  try {
    const client = new MongoClient(uri);
    await client.connect();
    const admin = client.db().admin();
    const info = await admin.listDatabases();
    console.log('databases', info.databases.map(d=>d.name));
    for (const dbInfo of info.databases) {
      const db = client.db(dbInfo.name);
      const cols = await db.listCollections().toArray();
      const counts = {};
      for(const c of cols){
        counts[c.name] = await db.collection(c.name).countDocuments();
      }
      console.log(dbInfo.name, counts);
    }
    await client.close();
  } catch (e) {
    console.error('error', e);
  }
})();