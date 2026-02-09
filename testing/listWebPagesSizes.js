require("dotenv").config();
const { connectMongo, getDb } = require("../src/db/mongo");

(async () => {
  await connectMongo();
  const col = getDb().collection("web_pages");

  const pages = await col
    .find({}, { projection: { url: 1, title: 1, extractedText: 1, processedText: 1 } })
    .toArray();

  const rows = pages.map((p) => ({
    url: p.url,
    title: p.title,
    extractedLen: (p.extractedText || "").length,
    processedLen: (p.processedText || "").length,
  }));

  rows.sort((a, b) => b.extractedLen - a.extractedLen);

  console.log("Total pages:", rows.length);
  console.log("Top by extractedLen:");
  for (const r of rows.slice(0, 20)) {
    console.log(
      `- extracted=${r.extractedLen} processed=${r.processedLen} :: ${r.url} :: ${r.title || ""}`
    );
  }

  const big = rows.filter((r) => r.extractedLen >= 10);
  console.log("\n>=10 extracted:", big.length);

  process.exit(0);
})();
