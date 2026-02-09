require("dotenv").config();
const { connectMongo, getDb } = require("../src/db/mongo");

(async () => {
  await connectMongo();
  const col = getDb().collection("web_pages");

  const total = await col.countDocuments();
  const withExtracted = await col.countDocuments({ extractedText: { $exists: true, $ne: "" } });
  const noProcessedMissing = await col.countDocuments({
    extractedText: { $exists: true, $ne: "" },
    processedText: { $exists: false },
  });
  const noProcessedNull = await col.countDocuments({
    extractedText: { $exists: true, $ne: "" },
    $or: [{ processedText: { $exists: false } }, { processedText: null }, { processedText: "" }],
  });

  const sample = await col.findOne({}, { projection: { url: 1, title: 1, extractedText: 1, processedText: 1 } });

  console.log("total:", total);
  console.log("with extractedText:", withExtracted);
  console.log("eligible (processedText missing):", noProcessedMissing);
  console.log("eligible (missing OR null OR empty):", noProcessedNull);

  console.log("\nSample keys:");
  if (sample) {
    console.log(Object.keys(sample));
    console.log("sample.url:", sample.url);
    console.log("extractedText length:", sample.extractedText ? sample.extractedText.length : 0);
    console.log("processedText type:", typeof sample.processedText);
    console.log("processedText length:", sample.processedText ? sample.processedText.length : 0);
  } else {
    console.log("No sample document found.");
  }

  process.exit(0);
})();
