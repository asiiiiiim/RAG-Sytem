require("dotenv").config();
const { ensureDbInitialized, closeMongo } = require("../src/db/mongo");

(async () => {
  const c = await ensureDbInitialized();
  const root = await c.tree_nodes.findOne({ relPath: "", nodeType: "folder" });
  console.log("Root node:", root);
  const count = await c.tree_nodes.countDocuments();
  console.log("Total tree nodes:", count);
  await closeMongo();
})();
