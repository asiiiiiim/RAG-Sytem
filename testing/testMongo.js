require("dotenv").config();
const { ensureDbInitialized, closeMongo } = require("../src/db/mongo");

(async () => {
  const c = await ensureDbInitialized();
  const meta = await c.meta.findOne({ _id: "rag_system_meta" });
  console.log("DB OK ✅", meta);
  await closeMongo();
})();
