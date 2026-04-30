const { MongoClient } = require('mongodb');
(async()=>{
  const uri='mongodb://gkr_db_user:ZhnNmNyOK9lCxZn0@ac-atcrjzc-shard-00-00.dbulnco.mongodb.net:27017,ac-atcrjzc-shard-00-01.dbulnco.mongodb.net:27017,ac-atcrjzc-shard-00-02.dbulnco.mongodb.net:27017/?authSource=admin&replicaSet=atlas-omqkp4-shard-0&appName=langTestCaseGen&ssl=true';
  const client=new MongoClient(uri);
  await client.connect();
  const admin = client.db().admin();
  const info = await admin.listDatabases();
  console.log('databases', info.databases.map(d=>d.name));
  for (const dbInfo of info.databases) {
    const db = client.db(dbInfo.name);
    const counts = {};
    const cols = await db.listCollections().toArray();
    for(const c of cols){
      counts[c.name]=await db.collection(c.name).countDocuments();
    }
    console.log(dbInfo.name, counts);
  }
  await client.close();
})();