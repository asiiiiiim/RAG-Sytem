const { MongoClient } = require("mongodb");

let client;
let db;
let _collections = null;

function getDbName() {
  return process.env.DB_NAME || "rag_tree";
}

async function connectMongo() {
  if (db)
    return db; // already connected
  else {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is missing in .env");

    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }

    db = client.db(getDbName());
    return db;
  }
}

function getDb() {
  if (!db) throw new Error("Mongo not connected. Call connectMongo() first.");
  return db;
}

function collections() {
  if (!_collections) {
    if (!db)
      throw new Error("Mongo not connected yet. Call connectMongo() first.");
    _collections = {
      meta: db.collection("meta"),
      tree_nodes: db.collection("tree_nodes"),
      documents: db.collection("documents"),
      chunks: db.collection("chunks"),
    };
  }
  return _collections;
}

/**
 * Initialize DB structure (indexes + meta doc).
 * Call this from BOTH migrate and server startup.
 */
async function ensureDbInitialized() {
  await connectMongo();
  const c = collections();

  // 1) Meta (schema versioning)
  await c.meta.updateOne(
    { _id: "rag_system_meta" },
    {
      $setOnInsert: {
        schemaVersion: 2,
        createdAt: new Date(),
      },
      $set: {
        lastInitAt: new Date(),
      },
    },
    { upsert: true },
  );

  // 2) Indexes (safe to run repeatedly)
  await c.tree_nodes.createIndex({ relPath: 1 }, { unique: true });
  await c.documents.createIndex({ relPath: 1 }, { unique: true });

  // For fast subtree filtering later
  await c.chunks.createIndex({ docRelPath: 1 });
  await c.chunks.createIndex({ folderRelPath: 1 });

  return c;
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    _collections = null;
  }
}

module.exports = {
  connectMongo,
  getDb,
  getDbName,
  collections,
  ensureDbInitialized,
  closeMongo,
};
