require("dotenv").config();
const { ensureDbInitialized, closeMongo } = require("../src/db/mongo");

(async () => {
  const c = await ensureDbInitialized();
  const root = await c.tree_nodes.findOne(
    { relPath: "", nodeType: "folder" },
    { projection: { readmeEmbedding: 1, readmeEmbeddingModel: 1 } },
  );

  console.log("Has embedding?", Array.isArray(root.readmeEmbedding));
  console.log("Embedding length:", root.readmeEmbedding?.length);
  console.log("Model:", root.readmeEmbeddingModel);

  await closeMongo();
})();
