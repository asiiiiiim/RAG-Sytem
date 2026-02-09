require("dotenv").config();
const { MongoClient } = require("mongodb");

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const col = client
    .db(process.env.DB_NAME || "rag_tree")
    .collection("web_pages");

  const page = await col.findOne({
    url: "https://zag.dev.ae.zagfn.com/brokers/home.php",
  });

  if (!page) {
    console.log("❌ Page not found");
    process.exit(1);
  }

  console.log("URL:", page.url);
  console.log("Title:", page.title);
  console.log("Extracted length:", page.extractedText?.length || 0);
  console.log("\n=== First 800 chars of extractedText ===");
  console.log(page.extractedText?.slice(0, 800));

  await client.close();
  process.exit(0);
})();
