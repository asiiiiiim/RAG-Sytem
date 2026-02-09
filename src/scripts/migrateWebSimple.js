require("dotenv").config();
const fs = require("fs");
const { chromium } = require("playwright");

const BASE_URL = process.env.WEB_BASE_URL;
const ALLOWED_HOST = process.env.WEB_ALLOWED_HOST;
const ALLOWED_PREFIX = process.env.WEB_ALLOWED_PATH_PREFIX || "/brokers";
const STORAGE_STATE = process.env.WEB_STORAGE_STATE || "./storageState.web.json";
const MAX_PAGES = Number(process.env.WEB_MAX_PAGES || 200);
const DELAY_MS = Number(process.env.WEB_DELAY_MS || 800);

const { extractPageText } = require("../web/extract/extractPageText");
const { connectMongo } = require("../db/mongo");
const { webPagesCol } = require("../db/webCollections");

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isAllowed(u) {
  try {
    const url = new URL(u);
    
    // Block logout and session-destroying URLs
    const blockedPaths = ['/logout', '/signout', '/logoff', '/sign-out', '/log-out'];
    if (blockedPaths.some(p => url.pathname.toLowerCase().includes(p))) {
      return false;
    }
    
    // Block URLs with logout-like parameters
    const blockedParams = ['logout', 'signout', 'logoff'];
    if (blockedParams.some(p => url.search.toLowerCase().includes(p))) {
      return false;
    }
    
    // Allow exact host match OR subdomain match (e.g., api.domain.com, www.domain.com)
    if (ALLOWED_HOST) {
      const hostMatches = url.host === ALLOWED_HOST || url.host.endsWith('.' + ALLOWED_HOST);
      if (!hostMatches) return false;
    }
    if (ALLOWED_PREFIX && !url.pathname.startsWith(ALLOWED_PREFIX)) return false;
    return true;
  } catch {
    return false;
  }
}

(async () => {
  if (!BASE_URL) throw new Error("WEB_BASE_URL missing in .env");
  if (!fs.existsSync(STORAGE_STATE)) {
    throw new Error(`Storage state not found: ${STORAGE_STATE}. Run npm run auth:web first.`);
  }

  await connectMongo();
  const webPages = webPagesCol();

  // Launch browser with persistent context
  const browser = await chromium.launch({
    executablePath: process.env.BRAVE_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    storageState: STORAGE_STATE,
  });

  console.log("✅ Browser launched with authenticated context from:", STORAGE_STATE);

  const visited = new Set();
  const queue = [BASE_URL];
  let processed = 0;

  while (queue.length > 0 && processed < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;

    visited.add(url);
    processed++;

    try {
      const page = await context.newPage();
      console.log(`[${processed}/${MAX_PAGES}] Crawling: ${url}`);

      const startTime = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      console.log(`  ↳ Page loaded in ${Date.now() - startTime}ms`);
      
      await page.waitForTimeout(1000);

      const title = await page.title();
      const { title: extractedTitle, extractedText, rawText } = await extractPageText(page);

      // Check if we got logged out (detect login page)
      const isLoginPage = extractedText.includes("Unauthorized Access") || 
                          extractedText.includes("Please Log in First") ||
                          (extractedText.length < 500 && title.includes("SKAExtreme"));
      
      if (isLoginPage) {
        console.warn(`⚠️ Session lost at ${url} - got login page. Stopping crawl.`);
        console.warn(`   Please run 'npm run auth:web' to regenerate authentication.`);
        await page.close();
        break; // Exit the crawl loop
      }

      // Store page
      await webPages.updateOne(
        { url },
        {
          $set: {
            url,
            title: extractedTitle || title || "",
            extractedText,
            rawText,
            extractedAt: new Date(),
          },
        },
        { upsert: true }
      );

      console.log(`✅ Saved: ${url} (${extractedText.length} chars)`);

      // Extract links
      const links = await page.$$eval("a", (anchors) =>
        anchors.map((a) => a.href).filter(Boolean)
      );

      for (const link of links) {
        const normalized = normalizeUrl(link);
        if (normalized && isAllowed(normalized) && !visited.has(normalized)) {
          queue.push(normalized);
        }
      }

      await page.close();
      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (err) {
      console.error(`❌ Failed to crawl ${url}: ${err.message}`);
    }
  }

  await context.close();
  await browser.close();
  
  // Close MongoDB connection
  const { client } = require("../db/mongo");
  if (client) await client.close();

  console.log(`\n✅ Crawl finished: ${processed} pages processed`);
  process.exit(0);
})().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
