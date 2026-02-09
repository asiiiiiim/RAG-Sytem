require("dotenv").config();
const { connectMongo, getDb } = require("../db/mongo");

(async () => {
  await connectMongo();
  const col = getDb().collection("web_pages");

  const MIN = Number(process.env.WEB_MIN_SAVE_EXTRACTED || 2000);

  const result = await col.deleteMany({
    $or: [
      { extractedText: { $exists: false } },
      { extractedText: "" },
      { $expr: { $lt: [{ $strLenCP: "$extractedText" }, MIN] } },
    ],
  });

  console.log(`✅ Deleted ${result.deletedCount} small/empty web_pages docs (min=${MIN}).`);
  process.exit(0);
})();
