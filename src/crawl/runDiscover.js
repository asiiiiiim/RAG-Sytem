require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { routeKeyFromUrl, isAllowedDomain, stripHash } = require("./routes");
const { launchBrowser } = require("../browser/launchBrowser");

const WAIT_UNTIL = "domcontentloaded";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms: ${label}`)), ms)),
  ]);
}

function stripQuery(urlStr) {
  const u = new URL(urlStr);
  u.search = "";
  return u.toString();
}

function envLimit(name) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return Infinity; // unlimited unless set
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

function envBool(name, def = true) {
  const v = process.env[name];
  if (v == null) return def;
  return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
}

function writeJsonAtomic(filePath, dataObj) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(dataObj, null, 2));
  fs.renameSync(tmp, filePath);
}

async function main() {
  console.log("➟ route discovery started");

  const seedUrl = process.env.WEB_BASE_URL;
  const allowedDomain = process.env.WEB_ALLOWED_DOMAIN || "zag.dev.ae.zagfn.com";
  const allowedDomains = [allowedDomain];
  const storageStateFile =
    process.env.WEB_STORAGE_STATE || path.join(process.cwd(), "storageState.web.json");

  const DROP_QUERY = envBool("DISCOVERY_DROP_QUERY", true);
  const MAX_VISITS = envLimit("DISCOVERY_MAX_VISITS");
  const MAX_ROUTES = envLimit("DISCOVERY_MAX_ROUTES");

  const CHECKPOINT_EVERY = envLimit("DISCOVERY_CHECKPOINT_EVERY");
  const checkpointEvery = CHECKPOINT_EVERY === Infinity ? 25 : CHECKPOINT_EVERY;

  if (!seedUrl) throw new Error("Missing SEED_URL in .env");
  if (!fs.existsSync(storageStateFile)) {
    throw new Error(`Missing storageState: ${storageStateFile} (run bootstrapSession first)`);
  }

  const out = path.join(process.cwd(), "routes.json");

  console.log("Seed:", seedUrl);
  console.log("Allowed:", allowedDomains);
  console.log("Using storageState:", storageStateFile);
  console.log("DROP_QUERY:", DROP_QUERY);
  console.log("MAX_VISITS:", MAX_VISITS === Infinity ? "∞" : MAX_VISITS);
  console.log("MAX_ROUTES:", MAX_ROUTES === Infinity ? "∞" : MAX_ROUTES);
  console.log("Checkpoint every:", checkpointEvery, "visits");
  console.log("Output:", out);

  let browser, context;
  let stopping = false;

  const queue = [seedUrl];
  const enqueuedUrls = new Set(queue);
  const visitedUrls = new Set();

  const expandedRouteKeys = new Set(); // expand links only once per routeKey
  const routes = new Map();            // routeKey -> exampleUrl

  function snapshotResults() {
    return Array.from(routes.entries())
      .map(([routeKey, exampleUrl]) => ({ routeKey, exampleUrl }))
      .sort((a, b) => a.routeKey.localeCompare(b.routeKey));
  }

  function checkpointWrite(reason) {
    const results = snapshotResults();
    writeJsonAtomic(out, results);
    console.log(`➟ checkpoint (${reason}): routes=${results.length}, visited=${visitedUrls.size}`);
  }

  // ✅ Best-combo Ctrl+C:
  // 1) set stopping flag (don’t close browser immediately)
  // 2) loop will exit after current step
  // 3) final checkpointWrite runs
  process.on("SIGINT", () => {
    if (stopping) return;
    stopping = true;
    console.log("\n➟ SIGINT received. Finishing current step, writing routes.json, then exiting...");
  });

  try {
    console.log("➟ launching browser...");
    browser = await launchBrowser({ headless: envBool("HEADLESS", true) });

    console.log("➟ creating context...");
    context = await browser.newContext({ storageState: storageStateFile });

    console.log("➟ creating page...");
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(45000);

    while (queue.length) {
      if (stopping) break;

      const url = queue.shift();
      if (!url || visitedUrls.has(url)) continue;
      visitedUrls.add(url);

      if (!isAllowedDomain(url, allowedDomains)) continue;

      console.log(`➟ goto: ${url}`);

      try {
        await withTimeout(page.goto(url, { waitUntil: WAIT_UNTIL }), 45000, `goto ${url}`);
        await page.waitForTimeout(900);

        const finalUrl = page.url();
        if (!isAllowedDomain(finalUrl, allowedDomains)) continue;

        const routeKey = routeKeyFromUrl(finalUrl);
        if (!routes.has(routeKey)) routes.set(routeKey, finalUrl);

        // expand links once per routeKey
        if (!expandedRouteKeys.has(routeKey)) {
          expandedRouteKeys.add(routeKey);

          const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
          console.log(`   final: ${finalUrl}`);
          console.log(`   links found: ${hrefs.length} | routes: ${routes.size}`);

          for (const h of hrefs) {
            if (!h) continue;
            if (h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("javascript:")) continue;

            let abs;
            try { abs = new URL(h, finalUrl).toString(); } catch { continue; }

            abs = stripHash(abs);
            if (DROP_QUERY) abs = stripQuery(abs);

            if (/\/logout\b/i.test(abs)) continue;
            if (!isAllowedDomain(abs, allowedDomains)) continue;

            if (!enqueuedUrls.has(abs)) {
              enqueuedUrls.add(abs);
              queue.push(abs);
            }
          }
        }

        if (visitedUrls.size % checkpointEvery === 0) checkpointWrite("periodic");
      } catch (e) {
        // ✅ silence the scary abort errors if we’re stopping
        if (stopping) break;

        const msg = String(e && e.message ? e.message : e).split("\n")[0];
        console.log(`   goto failed: ${msg}`);

        if (visitedUrls.size % checkpointEvery === 0) checkpointWrite("periodic");
      }

      if (stopping) break;

      if (visitedUrls.size >= MAX_VISITS) break;
      if (routes.size >= MAX_ROUTES) break;
    }

    checkpointWrite(stopping ? "SIGINT-final" : "final");
    console.log("➟ done");
  } finally {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
