/**
 * Web Crawler Module
 * 
 * Main crawling engine that orchestrates browser, auth, forms, and screenshots.
 * Designed to be portable and configurable for any webapp.
 */

const core = require("./core");
const {
  getConfig,
  initConfig,
  logger,
  routeKeyFromUrl,
  categorizeError,
  sleep,
  retry,
} = core;

// ═══════════════════════════════════════════════════════════════════════════
// Crawler Class
// ═══════════════════════════════════════════════════════════════════════════

class Crawler {
  constructor(options = {}) {
    this.options = options;
    this.config = null;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.stats = {
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    };
  }

  /**
   * Initialize crawler
   */
  async init() {
    // Load configuration
    this.config = initConfig(this.options.configPath);
    
    // Apply runtime options
    if (this.options.headless !== undefined) {
      this.config.headless = this.options.headless;
    }
    if (this.options.screenshotMode) {
      this.config.screenshotMode = this.options.screenshotMode;
    }

    // Connect to database
    await core.connect();
    await core.ensureIndexes();

    // Load form config if available
    core.loadFormConfig();

    logger.info("Crawler initialized");
    return this;
  }

  /**
   * Start browser and authenticate
   */
  async start() {
    // Launch browser
    const browserResult = await core.launchBrowser({
      headless: this.config.headless,
      executablePath: this.config.browserPath,
    });
    this.browser = browserResult.browser;

    // Create context with session
    const contextResult = await core.createContext(this.browser, {
      storageState: this.config.storageStatePath,
    });
    this.context = contextResult.context;

    // Create page
    const pageResult = await core.createPage(this.context);
    this.page = pageResult.page;

    // Authenticate if needed
    await core.ensureAuthenticated(this.page, this.config);

    logger.info("Crawler started");
    return this;
  }

  /**
   * Process a single URL
   */
  async processUrl(url, options = {}) {
    const routeKey = options.routeKey || routeKeyFromUrl(url);
    const startTime = Date.now();

    logger.info(`Processing: ${routeKey}`);

    // Check if already exists
    if (options.skipExisting) {
      const exists = await core.webPageExists(routeKey);
      if (exists) {
        logger.info(`Skipping (exists): ${routeKey}`);
        this.stats.skipped++;
        return { skipped: true, routeKey };
      }
    }

    try {
      // Navigate to URL
      await core.navigateTo(this.page, url, {
        waitFor: options.waitFor || this.config.waitForSelector,
        timeout: this.config.navigationTimeout,
      });

      // Check if we need to re-authenticate
      if (await core.isLoginPage(this.page)) {
        logger.warn("Session expired, re-authenticating");
        await core.performLogin(this.page, this.config);
        await core.navigateTo(this.page, url);
      }

      // Collect page metadata
      const metadata = await this.collectMetadata();

      // Handle form filling if applicable
      const formResult = await this.handleForm(url, options);

      // Capture screenshots
      const screenshots = await this.captureScreenshots(options);

      // Upload screenshots to GridFS
      const screenshotRefs = await core.uploadScreenshots(
        screenshots,
        routeKey,
        { url, domain: metadata.domain }
      );

      // Save to database
      await core.saveWebPage({
        routeKey,
        url,
        domain: metadata.domain,
        title: metadata.title,
        screenshots: screenshotRefs.map((ref, i) => ({
          fileId: ref.fileId,
          name: ref.name,
          type: ref.type,
          label: ref.label,
          meta: screenshots[i]?.dimensions || {},
        })),
        viewport: this.config.viewport,
        formFill: formResult,
        extraction: {
          status: "pending",
          version: "2.0",
        },
        processedAt: new Date(),
        duration: Date.now() - startTime,
      });

      // Save session state
      await core.saveSession(this.context, this.config.storageStatePath);

      this.stats.processed++;
      this.stats.success++;

      logger.info(`✓ Completed: ${routeKey} (${Date.now() - startTime}ms)`);

      return {
        success: true,
        routeKey,
        url,
        screenshots: screenshotRefs.length,
        formFilled: formResult?.filled?.length > 0,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      const errorInfo = categorizeError(error);
      
      logger.error(`✗ Failed: ${routeKey} - ${errorInfo.message}`);

      // Save failure record
      await core.saveWebFailure({
        routeKey,
        url,
        error: errorInfo.message,
        errorCategory: errorInfo.category,
        stack: error.stack,
        failedAt: new Date(),
      });

      this.stats.processed++;
      this.stats.failed++;

      return {
        success: false,
        routeKey,
        url,
        error: errorInfo,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Collect page metadata
   */
  async collectMetadata() {
    const url = this.page.url();
    const urlObj = new URL(url);

    return {
      url,
      domain: urlObj.hostname,
      title: await this.page.title().catch(() => ""),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle form filling
   */
  async handleForm(url, options = {}) {
    if (options.skipForms) {
      return null;
    }

    const formMatch = core.findFormConfigForUrl(url);
    if (!formMatch) {
      return null;
    }

    // Fill form
    const fillResult = await core.fillForm(this.page, formMatch.config);

    // Submit if configured
    if (options.submitForms !== false && formMatch.config.submitSelector) {
      const submitResult = await core.submitForm(this.page, formMatch.config);
      fillResult.submitted = submitResult.submitted;
    }

    return {
      configKey: formMatch.key,
      filled: fillResult.filled,
      failed: fillResult.failed,
      submitted: fillResult.submitted || false,
    };
  }

  /**
   * Capture screenshots
   */
  async captureScreenshots(options = {}) {
    const mode = options.screenshotMode || this.config.screenshotMode;
    const result = await core.capture(this.page, { mode });
    
    // Filter valid screenshots
    const valid = core.filterValidScreenshots(result.screenshots);
    
    return valid;
  }

  /**
   * Process multiple URLs
   */
  async processUrls(urls, options = {}) {
    const results = [];
    const limit = options.limit || urls.length;
    
    for (let i = 0; i < Math.min(urls.length, limit); i++) {
      const url = typeof urls[i] === "string" ? urls[i] : urls[i].url;
      
      try {
        const result = await this.processUrl(url, options);
        results.push(result);
      } catch (error) {
        logger.error(`Unhandled error for ${url}: ${error.message}`);
        results.push({
          success: false,
          url,
          error: { message: error.message },
        });
      }

      // Delay between requests
      if (i < urls.length - 1) {
        await sleep(options.delay || this.config.requestDelay);
      }
    }

    return results;
  }

  /**
   * Process all routes from config
   */
  async processAllRoutes(options = {}) {
    const routes = await core.getRoutes();
    
    // Apply pattern filter
    const filtered = options.pattern 
      ? core.filterRoutes(routes, options.pattern)
      : routes;

    logger.info(`Processing ${filtered.length} routes`);
    
    return await this.processUrls(
      filtered.map(r => r.url || r.path),
      options
    );
  }

  /**
   * Get crawler statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Stop crawler
   */
  async stop() {
    if (this.context) {
      await core.saveSession(this.context, this.config.storageStatePath);
    }
    if (this.browser) {
      await core.closeBrowser(this.browser);
    }
    await core.disconnect();
    
    logger.info("Crawler stopped");
    logger.info(`Stats: ${JSON.stringify(this.stats)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create and initialize a crawler instance
 */
async function createCrawler(options = {}) {
  const crawler = new Crawler(options);
  await crawler.init();
  await crawler.start();
  return crawler;
}

/**
 * Quick crawl - create crawler, process URLs, stop
 */
async function crawl(urls, options = {}) {
  const crawler = await createCrawler(options);
  
  try {
    const results = await crawler.processUrls(
      Array.isArray(urls) ? urls : [urls],
      options
    );
    return results;
  } finally {
    await crawler.stop();
  }
}

/**
 * Crawl all routes
 */
async function crawlAll(options = {}) {
  const crawler = await createCrawler(options);
  
  try {
    return await crawler.processAllRoutes(options);
  } finally {
    await crawler.stop();
  }
}

module.exports = {
  Crawler,
  createCrawler,
  crawl,
  crawlAll,
};
