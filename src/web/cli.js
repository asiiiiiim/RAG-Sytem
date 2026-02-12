#!/usr/bin/env node
/**
 * Web Crawler CLI
 * 
 * Command-line interface for the web crawler.
 * 
 * Usage:
 *   node src/web/cli.js --url <url>              # Crawl single URL
 *   node src/web/cli.js --all                    # Crawl all routes
 *   node src/web/cli.js --pattern <pattern>      # Crawl matching routes
 *   node src/web/cli.js --help                   # Show help
 * 
 * Options:
 *   --url, -u          Single URL to crawl
 *   --all, -a          Process all routes from routes.json
 *   --pattern, -p      Filter routes by URL pattern (regex)
 *   --limit, -l        Limit number of URLs to process
 *   --skip-existing    Skip URLs that already have data
 *   --skip-forms       Don't fill forms
 *   --no-submit        Fill forms but don't submit
 *   --headless         Run browser in headless mode
 *   --no-headless      Run browser with visible window
 *   --mode             Screenshot mode: full, batches, hybrid
 *   --delay            Delay between requests (ms)
 *   --config           Path to config file
 *   --verbose, -v      Verbose logging
 *   --help, -h         Show help
 */

const { Crawler, crawl, crawlAll } = require("./crawler");
const { initConfig, logger } = require("./core");

// ═══════════════════════════════════════════════════════════════════════════
// Argument Parser
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
  const args = {
    url: null,
    all: false,
    pattern: null,
    limit: null,
    skipExisting: false,
    skipForms: false,
    submitForms: true,
    headless: null,
    screenshotMode: null,
    delay: null,
    configPath: null,
    verbose: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--url":
      case "-u":
        args.url = next;
        i++;
        break;

      case "--all":
      case "-a":
        args.all = true;
        break;

      case "--pattern":
      case "-p":
        args.pattern = next;
        i++;
        break;

      case "--limit":
      case "-l":
        args.limit = parseInt(next, 10);
        i++;
        break;

      case "--skip-existing":
        args.skipExisting = true;
        break;

      case "--skip-forms":
        args.skipForms = true;
        break;

      case "--no-submit":
        args.submitForms = false;
        break;

      case "--headless":
        args.headless = true;
        break;

      case "--no-headless":
        args.headless = false;
        break;

      case "--mode":
        args.screenshotMode = next;
        i++;
        break;

      case "--delay":
        args.delay = parseInt(next, 10);
        i++;
        break;

      case "--config":
        args.configPath = next;
        i++;
        break;

      case "--verbose":
      case "-v":
        args.verbose = true;
        break;

      case "--help":
      case "-h":
        args.help = true;
        break;

      default:
        // Positional argument - treat as URL
        if (!arg.startsWith("-") && !args.url) {
          args.url = arg;
        }
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Web Crawler CLI

Usage:
  node src/web/cli.js [options] [url]

Examples:
  # Crawl single URL
  node src/web/cli.js --url https://example.com/page.php

  # Crawl all routes from routes.json
  node src/web/cli.js --all

  # Crawl routes matching pattern
  node src/web/cli.js --pattern "statement.*account"

  # Crawl with options
  node src/web/cli.js --all --limit 10 --skip-existing --headless

Options:
  --url, -u <url>       Single URL to crawl
  --all, -a             Process all routes from routes.json
  --pattern, -p <pat>   Filter routes by URL pattern (regex)
  --limit, -l <num>     Limit number of URLs to process
  --skip-existing       Skip URLs that already have data
  --skip-forms          Don't fill forms
  --no-submit           Fill forms but don't submit
  --headless            Run browser in headless mode
  --no-headless         Run browser with visible window
  --mode <mode>         Screenshot mode: full, batches, hybrid
  --delay <ms>          Delay between requests (default: 1000)
  --config <path>       Path to config file
  --verbose, -v         Verbose logging
  --help, -h            Show this help message

Environment Variables:
  MONGO_URI             MongoDB connection URI
  MONGO_DB_NAME         Database name
  BASE_URL              Base URL for the webapp
  AUTH_USERNAME         Login username
  AUTH_PASSWORD         Login password
  SCREENSHOT_MODE       Default screenshot mode
  HEADLESS              Run headless (true/false)
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.url && !args.all && !args.pattern) {
    console.error("Error: Must specify --url, --all, or --pattern");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  // Set log level
  if (args.verbose) {
    process.env.LOG_LEVEL = "debug";
  }

  const crawlerOptions = {
    configPath: args.configPath,
    headless: args.headless,
    screenshotMode: args.screenshotMode,
  };

  const processOptions = {
    limit: args.limit,
    skipExisting: args.skipExisting,
    skipForms: args.skipForms,
    submitForms: args.submitForms,
    delay: args.delay,
    pattern: args.pattern,
  };

  let crawler = null;
  let results = [];

  try {
    crawler = new Crawler(crawlerOptions);
    await crawler.init();
    await crawler.start();

    if (args.url) {
      // Single URL
      const result = await crawler.processUrl(args.url, processOptions);
      results = [result];
    } else if (args.all || args.pattern) {
      // All routes or pattern
      results = await crawler.processAllRoutes(processOptions);
    }

    // Print summary
    const stats = crawler.getStats();
    console.log("\n" + "═".repeat(60));
    console.log("Crawl Complete");
    console.log("═".repeat(60));
    console.log(`Processed: ${stats.processed}`);
    console.log(`Success:   ${stats.success}`);
    console.log(`Failed:    ${stats.failed}`);
    console.log(`Skipped:   ${stats.skipped}`);
    console.log("═".repeat(60));

    // Exit with error code if any failed
    if (stats.failed > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error("Fatal error:", error.message);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);

  } finally {
    if (crawler) {
      await crawler.stop();
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = { parseArgs, main };
