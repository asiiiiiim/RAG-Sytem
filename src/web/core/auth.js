/**
 * Authentication Handler
 * 
 * Handles login detection and authentication for any webapp.
 * Configurable via environment variables.
 */

const { getConfig } = require("./config");
const { logger, sleep } = require("./utils");

// ═══════════════════════════════════════════════════════════════════════════
// Login Detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect if current page is a login page
 * Uses multiple heuristics to work with any webapp
 */
async function isLoginPage(page) {
  const config = getConfig();
  const url = (page.url() || "").toLowerCase();

  // Check URL patterns
  const loginUrlPatterns = [
    /\/(login|signin|sign-in|auth|authenticate)/i,
    /\/(index|default)\.(php|html|aspx)/i,
  ];
  
  // If we have a logged-in hint, check if we're NOT there
  if (config.loggedInUrlHint) {
    const isLoggedIn = url.includes(config.loggedInUrlHint.toLowerCase());
    if (isLoggedIn) return false;
  }

  // Check URL patterns
  const urlLooksLogin = loginUrlPatterns.some(p => p.test(url));

  // Check for password field (most reliable indicator)
  const passSelector = config.passSelector;
  const passwordFields = page.locator(passSelector);
  const hasVisiblePassword = await (async () => {
    try {
      const count = await passwordFields.count();
      if (count === 0) return false;
      return await passwordFields.first().isVisible();
    } catch {
      return false;
    }
  })();

  // Check for common login form classes/IDs
  const loginFormIndicators = [
    ".login-form", ".loginform", ".login-body",
    "#login-form", "#loginForm", "#login",
    "[class*='login']", "[id*='login']",
  ];
  
  let hasLoginForm = false;
  for (const sel of loginFormIndicators) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        hasLoginForm = true;
        break;
      }
    } catch {}
  }

  return urlLooksLogin || hasVisiblePassword || hasLoginForm;
}

/**
 * Detect if we're logged in (on a protected page)
 */
async function isLoggedIn(page) {
  const config = getConfig();
  const url = page.url().toLowerCase();

  // Check logged-in URL hint
  if (config.loggedInUrlHint) {
    return url.includes(config.loggedInUrlHint.toLowerCase());
  }

  // Check we're NOT on a login page
  return !(await isLoginPage(page));
}

// ═══════════════════════════════════════════════════════════════════════════
// Authentication
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perform login with configured credentials
 */
async function performLogin(page, options = {}) {
  const config = getConfig();
  
  const username = options.username || config.username;
  const password = options.password || config.password;

  if (!username || !password) {
    throw new Error("Login credentials not configured (WEB_USERNAME, WEB_PASSWORD)");
  }

  logger.info("Attempting login...");

  // Find and fill username field
  const userSelector = options.userSelector || config.userSelector;
  const userField = page.locator(userSelector).first();
  
  if (await userField.count() === 0) {
    throw new Error(`Username field not found: ${userSelector}`);
  }
  
  await userField.fill(username);
  logger.debug("Filled username field");

  // Find and fill password field
  const passSelector = options.passSelector || config.passSelector;
  const passField = page.locator(passSelector).first();
  
  if (await passField.count() === 0) {
    throw new Error(`Password field not found: ${passSelector}`);
  }
  
  await passField.fill(password);
  logger.debug("Filled password field");

  // Find and click submit button
  const submitSelector = options.submitSelector || config.submitSelector;
  const submitButton = page.locator(submitSelector).first();

  if (await submitButton.count() > 0) {
    // Wait for navigation after clicking
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      submitButton.click(),
    ]);
  } else {
    // Try pressing Enter on password field
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      passField.press("Enter"),
    ]);
  }

  await sleep(1000);
  logger.info("Login submitted");

  // Verify login success
  const stillOnLogin = await isLoginPage(page);
  if (stillOnLogin) {
    throw new Error("Login failed - still on login page");
  }

  logger.info("Login successful");
  return true;
}

/**
 * Navigate to login page
 */
async function goToLogin(page) {
  const config = getConfig();
  
  if (!config.loginUrl) {
    throw new Error("Login URL not configured (WEB_LOGIN_URL)");
  }

  logger.info(`Navigating to login: ${config.loginUrl}`);
  await page.goto(config.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeout,
  });
  
  await sleep(500);
  return page.url();
}

/**
 * Ensure we're authenticated, login if needed
 */
async function ensureAuthenticated(page, targetUrl) {
  const config = getConfig();

  // Try navigating to target
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeout,
  });
  await sleep(500);

  // Check if we ended up on login page
  if (await isLoginPage(page)) {
    logger.info("Login required");
    
    // Perform login
    await performLogin(page);
    
    // Navigate back to target
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.navigationTimeout,
    });
    await sleep(500);

    // Verify we're not still on login
    if (await isLoginPage(page)) {
      throw new Error("Authentication failed - still redirected to login");
    }
  }

  return true;
}

module.exports = {
  isLoginPage,
  isLoggedIn,
  performLogin,
  goToLogin,
  ensureAuthenticated,
};
