require("dotenv").config();
const { connectMongo, getDb, closeMongo } = require("./mongo");

async function main() {
  await connectMongo();
  const db = getDb();

  const webPages = db.collection("web_pages");
  const webChunks = db.collection("web_chunks");
  const webFailures = db.collection("web_failures");

  const w = webCollections();
  
  // web_pages: 1 per routeKey
  await w.web_pages.createIndex({ routeKey: 1 }, { unique: true });
  await w.web_pages.createIndex({ domain: 1 });
  await w.web_pages.createIndex({ updatedAt: -1 });

  // web_chunks: many per routeKey
  await w.web_chunks.createIndex({ routeKey: 1 });
  await w.web_chunks.createIndex({ domain: 1 });
  await w.web_chunks.createIndex({ type: 1 });
  await w.web_chunks.createIndex({ tags: 1 });
  // (vector index comes later once we lock embedding size & choose Mongo vector search vs manual cosine)

  // failures (for retry queue and auditing)
  await w.web_failures.createIndex({ routeKey: 1, pass: 1 });
  await w.web_failures.createIndex({ createdAt: -1 });

  console.log("✅ Mongo indexes created/verified:");
  console.log("- web_pages(routeKey unique), (domain), (updatedAt)");
  console.log("- web_chunks(routeKey), (domain), (type), (tags)");
  console.log("- web_failures(routeKey, pass), (createdAt)");

  await closeMongo();
}

main().catch((e) => {
  console.error("initWebCollections error:", e);
  process.exit(1);
});
