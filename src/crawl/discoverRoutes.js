const { PlaywrightCrawler, Dataset, log } = require("crawlee");
const { isAllowedDomain, routeKeyFromUrl, stripHash } = require("./routes");

async function discoverRoutes({
  seedUrls,
  allowedDomains,
  maxRequests = 500,
  headless = true,
}) {
  // 1) Sanitize seeds (this prevents undefined/empty entries)
  const seeds = (seedUrls || [])
    .filter((u) => typeof u === "string")
    .map((u) => u.trim())
    .filter(Boolean);

  if (seeds.length === 0) {
    throw new Error("seedUrls is empty/invalid. Provide at least one valid URL string.");
  }

  const seenRouteKeys = new Map();

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: maxRequests,
    headless,
    requestHandlerTimeoutSecs: 120,

    async requestHandler({ page, request, enqueueLinks }) {
      const url = request.loadedUrl || request.url;
      if (!url) return;

      if (!isAllowedDomain(url, allowedDomains)) return;

      // record routeKey + exampleUrl
      try {
        const u = new URL(url);
        const routeKey = routeKeyFromUrl(url);

        if (!seenRouteKeys.has(routeKey)) {
          seenRouteKeys.set(routeKey, {
            routeKey,
            exampleUrl: url,
            domain: u.hostname.toLowerCase(),
            normalizedPath: routeKey.replace(u.hostname.toLowerCase(), ""),
            discoveredFrom: request.userData?.from,
          });
        }
      } catch {}

      // enqueue internal links
      await enqueueLinks({
        strategy: "same-domain",
        transformRequestFunction: (req) => {
          // IMPORTANT: must return RequestOptions-like object OR null
          // NEVER return undefined (it causes your exact crash)

          if (!req || !req.url) return null;

          const clean = stripHash(req.url);
          if (!clean.startsWith("http")) return null;
          if (!isAllowedDomain(clean, allowedDomains)) return null;
          if (/\/logout\b/i.test(clean)) return null;

          return {
            url: clean,
            uniqueKey: clean, // helps dedupe
            userData: { from: url },
          };
        },
      });

      // small wait for SPAs
      await page.waitForTimeout(250);
    },

    failedRequestHandler({ request }) {
      log.warning(`Failed: ${request.url}`);
    },
  });

  // 2) Run using sanitized seeds
  await crawler.run(seeds);

  const results = Array.from(seenRouteKeys.values()).sort((a, b) =>
    a.routeKey.localeCompare(b.routeKey)
  );

  return results;
}

module.exports = { discoverRoutes };