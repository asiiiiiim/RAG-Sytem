require("dotenv").config();

const fs = require("fs");
const { chromium } = require("playwright");
const { extractPageText } = require("../src/web/extract/extractPageText");
const { connectMongo, getDb, getDbName } = require("../src/db/mongo");

(async () => {
  const TEST_URL = process.argv[2];
  const STORAGE_STATE =
    process.env.WEB_STORAGE_STATE || "./storageState.web.json";

  if (!TEST_URL) {
    console.error("❌ Please provide a URL");
    console.error("Usage:");
    console.error("  node testing/testWebExtractOne.js <url>");
    process.exit(1);
  }

  if (!fs.existsSync(STORAGE_STATE)) {
    throw new Error(
      `storageState not found at ${STORAGE_STATE}. Run npm run auth:web first.`,
    );
  }

  console.log("🔌 Connecting to Mongo (sanity check)...");
  await connectMongo();
  console.log("✅ Mongo connected:", getDbName());
  console.log(
    "Collections check:",
    (await getDb().collections()).map((c) => c.collectionName),
  );

  console.log("🌐 Launching browser...");
  const browser = await chromium.launch({
    headless: false,
    executablePath: process.env.BRAVE_PATH || undefined,
  });

  const context = await browser.newContext({
    storageState: STORAGE_STATE,
  });

  const page = await context.newPage();

  console.log("➡️ Opening:", TEST_URL);
  await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });

  console.log("📄 Extracting page text...");
  const { title, extractedText, rawText } = await extractPageText(page);

  console.log("\n====================");
  console.log("📌 TITLE");
  console.log("====================");
  console.log(title || "(no title)");

  console.log("\n====================");
  console.log("📊 LENGTHS");
  console.log("====================");
  console.log("Extracted text length:", extractedText.length);
  console.log("Raw text length:", rawText.length);

  console.log("\n====================");
  console.log("🧠 EXTRACTED PREVIEW (first 1500 chars)");
  console.log("====================");
  console.log(extractedText.slice(0, 1500));

  console.log("\n====================");
  console.log("🧱 RAW TEXT PREVIEW (first 800 chars)");
  console.log("====================");
  console.log(rawText.slice(0, 800));

  await browser.close();
  console.log("\n✅ Extraction test finished successfully");
})();
