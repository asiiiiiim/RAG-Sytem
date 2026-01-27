require("dotenv").config();
const { ensureDbInitialized, closeMongo } = require("../src/db/mongo");

(async () => {
  const c = await ensureDbInitialized();
  const root = await c.tree_nodes.findOne({ relPath: "", nodeType: "folder" });
  console.log("Root README fields:", {
    readmeUsedPath: root.readmeUsedPath,
    readmeType: root.readmeType,
    readmePreview: (root.readmeText || "").slice(0, 120) + "...",
  });
  await closeMongo();
})();
