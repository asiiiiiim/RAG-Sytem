require("dotenv").config();
const { connectMongo } = require("./src/db/mongo");
const { webPagesCol } = require("./src/db/webCollections");

(async () => {
  await connectMongo();

  const urls = [
    "https://zag.dev.ae.zagfn.com/brokers/home.php",
    "https://zag.dev.ae.zagfn.com/brokers/system_preferences.php",
    "https://zag.dev.ae.zagfn.com/brokers/trade.php",
  ];

  for (const url of urls) {
    const page = await webPagesCol().findOne({ url });
    if (page) {
      const textLen = page.extractedText?.length || 0;
      const isLoginPage =
        page.extractedText?.includes("Login") || page.title?.includes("Login");
      console.log(`\n${url}`);
      console.log(`  Title: ${page.title}`);
      console.log(`  Length: ${textLen} chars`);
      console.log(
        `  Looks like login page: ${isLoginPage ? "❌ YES" : "✅ NO"}`,
      );
      if (textLen < 1000) {
        console.log(`  Preview: ${page.extractedText?.substring(0, 200)}...`);
      }
    } else {
      console.log(`\n${url} - NOT FOUND`);
    }
  }

  process.exit(0);
})();
