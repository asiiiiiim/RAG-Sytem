require("dotenv").config();
const { ensureDbInitialized, closeMongo } = require("../src/db/mongo");

(async () => {
  const c = await ensureDbInitialized();
  const anyFolder = await c.tree_nodes.findOne(
    { nodeType: "folder", relPath: { $ne: "" } },
    { projection: { relPath: 1, routingText: 1, readmeEmbedding: 1 } },
  );

  console.log("Sample folder:", anyFolder?.relPath);
  console.log(
    "routingText preview:\n",
    (anyFolder?.routingText || "").slice(0, 300) + "...",
  );
  console.log("embedding length:", anyFolder?.readmeEmbedding?.length);

  await closeMongo();
})();
