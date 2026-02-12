#!/usr/bin/env node
/**
 * Web Page Ingestion with Form Filling (Refactored)
 * 
 * Uses core modules for browser, auth, forms, screenshots, and database.
 * 
 * Usage:
 *   node src/web/ingest/ingestWithForms.js --url "https://example.com/page.php"
 *   node src/web/ingest/ingestWithForms.js --all
 *   node src/web/ingest/ingestWithForms.js --pattern "statement"
 *   node src/web/ingest/ingestWithForms.js --all --limit 10 --skip-existing
 */

require("dotenv").config();
const path = require("path");

// Import core modules
const core = require("../core");

// ═══════════════════════════════════════════════════════════════════════════
// CLI Argument Parsing
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url: null,
    all: false,
    pattern: null,
    limit: Infinity,
    skipExisting: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--url":
      case "-u":
        opts.url = args[++i];
        break;
      case "--all":
      case "-a":
        opts.all = true;
        break;
      case "--pattern":
      case "-p":
        opts.pattern = args[++i];
        break;
      case "--limit":
      case "-l":
        opts.limit = parseInt(args[++i], 10);
        break;
      case "--skip-existing":
        opts.skipExisting = true;
        break;
      default:
        if (!arg.startsWith("-") && !opts.url) {
          opts.url = arg;
        }
    }
  }
  
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════════
// Page Processing
// ═══════════════════════════════════════════════════════════════════════════

async function processPage(page, url, config) {
  const routeKey = core.routeKeyFromUrl(url);
  const startTime = Date.now();
  
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📄 Processing: ${routeKey}`);
  console.log(`${"═".repeat(60)}`);

  // Navigate to URL
  console.log(`🌐 Navigating to: ${url}`);
  await core.navigateTo(page, url, { timeout: 60000 });

  // Check for login redirect
  if (await core.isLoginPage(page)) {
    console.log("🔐 Session expired, re-authenticating...");
    await core.performLogin(page, config);
    await core.navigateTo(page, url);
  }

  // Collect metadata
  const urlObj = new URL(page.url());
  const domain = urlObj.hostname;
  const title = await page.title().catch(() => "");

  // Screenshots array
  const screenshots = [];

  // Capture BEFORE screenshot
  console.log("📸 Capturing BEFORE screenshot...");
  const beforeShots = await core.captureWithLabel(page, "before");
  screenshots.push(...beforeShots);

  // Check for form configuration
  const formMatch = core.findFormConfigForUrl(url);
  let formResult = null;

  if (formMatch) {
    console.log(`📝 Found form config: ${formMatch.key}`);
    
    // Fill form
    formResult = await core.fillForm(page, formMatch.config);
    console.log(`   Filled ${formResult.filled.length}/${formResult.total} fields`);
    
    // Capture FILLED screenshot
    console.log("📸 Capturing FILLED screenshot...");
    const filledShots = await core.captureWithLabel(page, "filled");
    screenshots.push(...filledShots);

    // Submit form if configured
    if (formMatch.config.submitSelector) {
      console.log("🚀 Submitting form...");
      const submitResult = await core.submitForm(page, formMatch.config);
      formResult.submitted = submitResult.submitted;
      
      // Capture SUBMITTED screenshot
      console.log("📸 Capturing SUBMITTED screenshot...");
      const submittedShots = await core.captureWithLabel(page, "submitted");
      screenshots.push(...submittedShots);
    }
  } else {
    console.log("ℹ️  No form config for this page");
  }

  // Filter valid screenshots
  const validShots = core.filterValidScreenshots(screenshots);
  console.log(`📸 ${validShots.length} valid screenshot(s)`);

  // Upload to GridFS
  console.log("💾 Uploading to GridFS...");
  const screenshotRefs = await core.uploadScreenshots(validShots, routeKey, {
    url,
    domain,
  });

  // Save to database
  await core.saveWebPage({
    routeKey,
    url,
    domain,
    title,
    screenshots: screenshotRefs.map((ref, i) => ({
      fileId: ref.fileId,
      name: ref.name,
      type: ref.type,
      label: ref.label,
      meta: validShots[i]?.dimensions || {},
    })),
    viewport: { width: 1280, height: 720 },
    formFill: formResult,
    extraction: {
      status: "pending",
      version: "2.0",
    },
    processedAt: new Date(),
    duration: Date.now() - startTime,
  });

  const duration = Date.now() - startTime;
  console.log(`✅ Completed in ${duration}ms`);

  return { success: true, routeKey, duration };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();
  
  if (!opts.url && !opts.all && !opts.pattern) {
    console.error("Usage: --url <url> | --all | --pattern <pattern>");
    process.exit(1);
  }

  // Initialize configuration
  const config = core.initConfig();
  
  // Connect to database
  await core.connect();
  await core.ensureIndexes();

  // Load form config
  core.loadFormConfig();

  // Launch browser
  console.log("\n🚀 Launching browser...");
  const { browser } = await core.launchBrowser({
    headless: config.headless,
    executablePath: config.browserPath,
  });

  const { context } = await core.createContext(browser, {
    storageState: config.storageStatePath,
  });

  const { page } = await core.createPage(context);

  // Authenticate if needed
  await core.ensureAuthenticated(page, config);

  // Build URL list
  let urls = [];
  
  if (opts.url) {
    urls = [opts.url];
  } else {
    const routes = await core.getRoutes();
    urls = routes.map(r => r.exampleUrl || r.url || r.path).filter(Boolean);
    
    if (opts.pattern) {
      const regex = new RegExp(opts.pattern, "i");
      urls = urls.filter(u => regex.test(u));
    }
    
    if (opts.limit < urls.length) {
      urls = urls.slice(0, opts.limit);
    }
  }

  console.log(`\n📋 Processing ${urls.length} URL(s)`);

  // Process each URL
  const results = { success: 0, failed: 0, skipped: 0 };
  
  for (const url of urls) {
    const routeKey = core.routeKeyFromUrl(url);
    
    // Skip if exists
    if (opts.skipExisting) {
      const exists = await core.webPageExists(routeKey);
      if (exists) {
        console.log(`⏭️  Skipping (exists): ${routeKey}`);
        results.skipped++;
        continue;
      }
    }

    try {
      await processPage(page, url, config);
      results.success++;
    } catch (error) {
      console.error(`❌ Failed: ${routeKey}`, error.message);
      
      await core.saveWebFailure({
        routeKey,
        url,
        error: error.message,
        errorCategory: core.categorizeError(error).category,
        stack: error.stack,
        failedAt: new Date(),
      });
      
      results.failed++;
    }

    // Delay between requests
    if (urls.indexOf(url) < urls.length - 1) {
      await core.sleep(1000);
    }
  }

  // Save session state
  await core.saveSession(context, config.storageStatePath);

  // Cleanup
  await core.closeBrowser(browser);
  await core.disconnect();

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 Summary");
  console.log(`${"═".repeat(60)}`);
  console.log(`✅ Success: ${results.success}`);
  console.log(`❌ Failed:  ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`${"═".repeat(60)}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
