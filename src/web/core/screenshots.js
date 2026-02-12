/**
 * Screenshot Capture Module
 * 
 * Handles screenshot capture with multiple modes:
 * - full: Single full-page screenshot
 * - batches: Multiple viewport-sized screenshots
 * - hybrid: Full page + viewport batches
 */

const { getConfig } = require("./config");
const { logger, sleep } = require("./utils");

// ═══════════════════════════════════════════════════════════════════════════
// Screenshot Capture
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Capture full-page screenshot
 */
async function captureFullPage(page) {
  const buffer = await page.screenshot({
    fullPage: true,
    type: "png",
  });

  return {
    buffer,
    type: "full",
    dimensions: await getPageDimensions(page),
  };
}

/**
 * Capture viewport screenshot
 */
async function captureViewport(page) {
  const buffer = await page.screenshot({
    fullPage: false,
    type: "png",
  });

  return {
    buffer,
    type: "viewport",
    dimensions: await getViewportDimensions(page),
  };
}

/**
 * Get page dimensions
 */
async function getPageDimensions(page) {
  return await page.evaluate(() => ({
    width: Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.offsetWidth
    ),
    height: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    ),
  }));
}

/**
 * Get viewport dimensions
 */
async function getViewportDimensions(page) {
  return await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
}

/**
 * Capture screenshots in batches (scroll through page)
 */
async function captureBatches(page, options = {}) {
  const config = getConfig();
  const batchSize = options.batchSize || config.batchSize;
  
  const viewport = await getViewportDimensions(page);
  const pageSize = await getPageDimensions(page);
  
  const batches = [];
  let scrollY = 0;
  let batchIndex = 0;

  while (scrollY < pageSize.height) {
    // Scroll to position
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await sleep(200);

    const buffer = await page.screenshot({
      fullPage: false,
      type: "png",
    });

    batches.push({
      buffer,
      type: "batch",
      index: batchIndex,
      scrollY,
      viewport,
    });

    scrollY += viewport.height;
    batchIndex++;

    if (batchIndex >= batchSize) {
      logger.debug(`Reached batch limit: ${batchSize}`);
      break;
    }
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));

  return batches;
}

/**
 * Capture screenshots using configured mode
 */
async function capture(page, options = {}) {
  const config = getConfig();
  const mode = options.mode || config.screenshotMode;

  const result = {
    mode,
    screenshots: [],
    viewport: await getViewportDimensions(page),
    pageSize: await getPageDimensions(page),
    capturedAt: new Date().toISOString(),
  };

  switch (mode) {
    case "full":
      const full = await captureFullPage(page);
      result.screenshots.push({
        ...full,
        name: "full",
      });
      break;

    case "batches":
      const batches = await captureBatches(page, options);
      result.screenshots.push(...batches.map((b, i) => ({
        ...b,
        name: `batch_${i}`,
      })));
      break;

    case "hybrid":
    default:
      // Full page first
      const fullPage = await captureFullPage(page);
      result.screenshots.push({
        ...fullPage,
        name: "full",
      });

      // Then batches if page is tall
      if (result.pageSize.height > result.viewport.height * 1.5) {
        const batchScreens = await captureBatches(page, options);
        result.screenshots.push(...batchScreens.map((b, i) => ({
          ...b,
          name: `batch_${i}`,
        })));
      }
      break;
  }

  logger.debug(`Captured ${result.screenshots.length} screenshot(s) [${mode}]`);
  return result;
}

/**
 * Capture with label prefix (for before/after states)
 */
async function captureWithLabel(page, label, options = {}) {
  const result = await capture(page, { ...options, mode: "full" });
  
  return result.screenshots.map((s, i) => ({
    ...s,
    name: `${label}_${s.name || i}`,
    label,
  }));
}

/**
 * Capture form workflow screenshots (before, filled, submitted)
 */
async function captureFormWorkflow(page, fillFn, submitFn) {
  const screenshots = [];

  // Before state
  const before = await captureWithLabel(page, "before");
  screenshots.push(...before);

  // Fill form
  if (fillFn) {
    const fillResult = await fillFn();
    
    // After fill state
    const filled = await captureWithLabel(page, "filled");
    screenshots.push(...filled);
    screenshots.fillResult = fillResult;
  }

  // Submit form
  if (submitFn) {
    const submitResult = await submitFn();
    
    // After submit state
    const submitted = await captureWithLabel(page, "submitted");
    screenshots.push(...submitted);
    screenshots.submitResult = submitResult;
  }

  return screenshots;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if screenshot is valid (not too small)
 */
function isValidScreenshot(buffer, options = {}) {
  const minSize = options.minSize || 1000;
  const minDimension = options.minDimension || 28;

  if (buffer.length < minSize) {
    return { valid: false, reason: "too_small" };
  }

  // Check PNG dimensions from header
  if (buffer.length > 24) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    
    if (width < minDimension || height < minDimension) {
      return { valid: false, reason: "dimensions_too_small", width, height };
    }
  }

  return { valid: true };
}

/**
 * Filter valid screenshots from array
 */
function filterValidScreenshots(screenshots, options = {}) {
  return screenshots.filter(s => {
    const check = isValidScreenshot(s.buffer, options);
    if (!check.valid) {
      logger.debug(`Filtered invalid screenshot: ${s.name} (${check.reason})`);
    }
    return check.valid;
  });
}

module.exports = {
  captureFullPage,
  captureViewport,
  getPageDimensions,
  getViewportDimensions,
  captureBatches,
  capture,
  captureWithLabel,
  captureFormWorkflow,
  isValidScreenshot,
  filterValidScreenshots,
};
