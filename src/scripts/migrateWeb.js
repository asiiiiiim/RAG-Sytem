require("dotenv").config();
const fs = require("fs");
const { PlaywrightCrawler } = require("crawlee");

const BASE_URL = process.env.WEB_BASE_URL;
const ALLOWED_HOST = process.env.WEB_ALLOWED_HOST;
const ALLOWED_PREFIX = process.env.WEB_ALLOWED_PATH_PREFIX || "/brokers";
const STORAGE_STATE =
  process.env.WEB_STORAGE_STATE || "./storageState.web.json";
const MAX_PAGES = Number(process.env.WEB_MAX_PAGES || 200);
const CONCURRENCY = Number(process.env.WEB_CONCURRENCY || 1);
const DELAY_MS = Number(process.env.WEB_DELAY_MS || 800);

const { extractPageText } = require("../web/extract/extractPageText");
const { connectMongo } = require("../db/mongo"); // or whatever your init is called
const { webPagesCol } = require("../db/webCollections");

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = ""; // remove fragments
    return url.toString();
  } catch {
    return null;
  }
}

function isAllowed(u) {
  try {
    const url = new URL(u);
    if (ALLOWED_HOST && url.host !== ALLOWED_HOST) return false;
    if (ALLOWED_PREFIX && !url.pathname.startsWith(ALLOWED_PREFIX))
      return false;
    return true;
  } catch {
    return false;
  }
}

(async () => {
  if (!BASE_URL) throw new Error("WEB_BASE_URL missing in .env");
  if (!fs.existsSync(STORAGE_STATE)) {
    throw new Error(
      `Storage state not found: ${STORAGE_STATE}. Run npm run auth:web first.`,
    );
  }

  let visitedCount = 0;

  await connectMongo(); // connect once
  const webPages = webPagesCol();

  // Load storage state for authentication
  let authCookies = [];
  try {
    if (fs.existsSync(STORAGE_STATE)) {
      const storageState = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf-8"));
      authCookies = storageState.cookies || [];
      console.log(`✅ Loaded ${authCookies.length} authentication cookies`);
    } else {
      console.warn(`⚠️ Storage state not found: ${STORAGE_STATE}`);
    }
  } catch (err) {
    console.error(`❌ Failed to load storage state: ${err.message}`);
  }

  // Create a persistent browser with authentication
  const { chromium } = require("playwright");
  const browser = await chromium.launch({
    executablePath: process.env.BRAVE_PATH,
    headless: true,
  });
  
  // Create context with storage state
  const context = await browser.newContext({
    storageState: STORAGE_STATE,
  });

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1, // Must be 1 to use shared context

    launchContext: {
      // Return existing browser and context
      launcher: {
        launch: async () => browser,
        launchPersistentContext: async () => context,
      },
    },

    requestHandler: async ({ page, request, enqueueLinks, log }) => {
      visitedCount++;
      const title = await page.title().catch(() => "");
      log.info(`[${visitedCount}/${MAX_PAGES}] ${request.url} :: ${title}`);

      // ✅ extract full content (structured + fallback)
      const {
        title: extractedTitle,
        extractedText,
        rawText,
      } = await extractPageText(page);

      // ✅ store page record (upsert)
      await webPages.updateOne(
        { url: request.url },
        {
          $set: {
            url: request.url,
            title: extractedTitle || title || "",
            extractedText,
            rawText,
            extractedAt: new Date(),
          },
        },
        { upsert: true },
      );

      // throttle to avoid rate limiting
      await new Promise((r) => setTimeout(r, DELAY_MS));

      if (visitedCount >= MAX_PAGES) return;

      // Enqueue links (BFS-like: Crawlee queue behaves like FIFO typically)
      await enqueueLinks({
        selector: "a",
        transformRequestFunction: (req) => {
          const nu = normalizeUrl(req.url);
          if (!nu) return null;
          if (!isAllowed(nu)) return null;
          return { url: nu };
        },
      });
    },

    failedRequestHandler: async ({ request, log }) => {
      log.error(`Request failed: ${request.url}`);
    },
  });

  await crawler.run([{ url: BASE_URL }]);
  
  // Clean up
  await context.close();
  await browser.close();
  
  console.log("✅ Web crawl skeleton finished.");
})();
