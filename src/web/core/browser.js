/**
 * Browser Manager
 * 
 * Handles browser lifecycle and context management.
 * Works with Playwright across different systems.
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { getConfig } = require("./config");
const { ensureDir, logger } = require("./utils");

let _browser = null;
let _context = null;

// ═══════════════════════════════════════════════════════════════════════════
// Browser Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Launch browser with configured options
 */
async function launchBrowser(options = {}) {
  const config = getConfig();
  
  const launchOptions = {
    headless: options.headless ?? config.headless,
  };

  // Use custom browser if specified
  const executablePath = options.executablePath || config.browserExecutable;
  if (executablePath) {
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Browser executable not found: ${executablePath}`);
    }
    logger.info(`Using browser: ${executablePath}`);
    launchOptions.executablePath = executablePath;
  } else {
    logger.info("Using Playwright bundled Chromium");
  }

  _browser = await chromium.launch(launchOptions);
  return _browser;
}

/**
 * Create browser context with optional session state
 */
async function createContext(options = {}) {
  if (!_browser) {
    await launchBrowser(options);
  }

  const config = getConfig();
  const contextOptions = {
    viewport: {
      width: options.viewportWidth || config.viewportWidth,
      height: options.viewportHeight || config.viewportHeight,
    },
  };

  // Load session state if exists
  const storageStatePath = options.storageState || config.storageState;
  if (storageStatePath && fs.existsSync(storageStatePath)) {
    logger.info(`Loading session from: ${storageStatePath}`);
    contextOptions.storageState = storageStatePath;
  }

  _context = await _browser.newContext(contextOptions);
  return _context;
}

/**
 * Create a new page with default settings
 */
async function createPage(options = {}) {
  if (!_context) {
    await createContext(options);
  }

  const config = getConfig();
  const page = await _context.newPage();
  
  page.setDefaultNavigationTimeout(options.navigationTimeout || config.navigationTimeout);
  page.setDefaultTimeout(options.timeout || 30000);

  return page;
}

/**
 * Save current session state
 */
async function saveSession(filePath) {
  if (!_context) {
    throw new Error("No active browser context");
  }

  const config = getConfig();
  const savePath = filePath || config.storageState;
  
  ensureDir(path.dirname(savePath));
  await _context.storageState({ path: savePath });
  
  logger.info(`Session saved to: ${savePath}`);
  return savePath;
}

/**
 * Close browser and cleanup
 */
async function closeBrowser() {
  if (_context) {
    await _context.close().catch(() => {});
    _context = null;
  }
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

/**
 * Get current browser instance
 */
function getBrowser() {
  return _browser;
}

/**
 * Get current context instance
 */
function getContext() {
  return _context;
}

// ═══════════════════════════════════════════════════════════════════════════
// Page Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Navigate to URL with retry logic
 */
async function navigateTo(page, url, options = {}) {
  const config = getConfig();
  const timeout = options.timeout || config.navigationTimeout;
  const waitUntil = options.waitUntil || "domcontentloaded";

  await page.goto(url, { waitUntil, timeout });
  
  // Wait for page to stabilize
  await page.waitForTimeout(options.stabilizeMs || 500);
  
  return page.url();
}

/**
 * Get page dimensions
 */
async function getPageDimensions(page) {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return {
      pageHeight: Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      ),
      pageWidth: Math.max(
        body.scrollWidth, body.offsetWidth,
        html.clientWidth, html.scrollWidth, html.offsetWidth
      ),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      dpr: window.devicePixelRatio || 1,
    };
  });
}

/**
 * Scroll to position
 */
async function scrollTo(page, y) {
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
  await page.waitForTimeout(150);
}

/**
 * Scroll element into view
 */
async function scrollIntoView(page, selector) {
  const element = page.locator(selector).first();
  if (await element.count() > 0) {
    await element.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    return true;
  }
  return false;
}

module.exports = {
  launchBrowser,
  createContext,
  createPage,
  saveSession,
  closeBrowser,
  getBrowser,
  getContext,
  navigateTo,
  getPageDimensions,
  scrollTo,
  scrollIntoView,
};
