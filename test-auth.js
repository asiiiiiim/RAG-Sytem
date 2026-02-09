require("dotenv").config();
const fs = require("fs");
const { chromium } = require("playwright");

(async () => {
  const STORAGE_STATE = "./storageState.web.json";
  const TEST_URL =
    "https://zag.dev.ae.zagfn.com/brokers/system_preferences.php";

  console.log("🧪 Testing authentication for:", TEST_URL);

  // Load cookies
  const storageState = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf-8"));
  const cookies = storageState.cookies || [];
  console.log(`✅ Loaded ${cookies.length} cookies`);

  // Launch browser
  const browser = await chromium.launch({
    executablePath: process.env.BRAVE_PATH,
    headless: true,
  });

  const context = await browser.newContext();
  await context.addCookies(cookies);
  console.log("🔐 Applied cookies to context");

  const page = await context.newPage();

  try {
    await page.goto(TEST_URL, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Wait a bit for content to load
    await page.waitForTimeout(2000);

    const title = await page.title();
    const content = await page.content();
    const bodyText = await page.evaluate(() => document.body.innerText);
    const isLoginPage =
      content.includes("Unauthorized Access") ||
      content.includes("Please Log in First");

    console.log(`\n📄 Title: ${title}`);
    console.log(`📏 HTML length: ${content.length} chars`);
    console.log(`📏 Body text: ${bodyText.length} chars`);
    console.log(`🔒 Is login page: ${isLoginPage ? "❌ YES" : "✅ NO"}`);

    if (bodyText.length < 1000) {
      console.log(`\n📝 Body preview:\n${bodyText.substring(0, 500)}`);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }

  await browser.close();
})();
