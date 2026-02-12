/**
 * Export routes from database to routes.json
 */
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

async function exportRoutes() {
  const client = new MongoClient("mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db("rag_tree");
  
  // Get routes from web_pages collection
  const pages = await db.collection("web_pages")
    .find({}, { projection: { routeKey: 1, url: 1 }})
    .toArray();
  
  const routes = pages
    .map(p => ({
      routeKey: p.routeKey,
      exampleUrl: p.url
    }))
    .filter(r => {
      // Filter out malformed routes
      if (!r.routeKey) return false;
      if (r.routeKey.includes("<")) return false;
      if (r.routeKey.includes(">")) return false;
      return true;
    });
  
  console.log("Found", routes.length, "routes from database");
  
  const routesPath = path.join(process.cwd(), "routes.json");
  fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
  console.log("Saved to routes.json");
  
  await client.close();
}

exportRoutes().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
