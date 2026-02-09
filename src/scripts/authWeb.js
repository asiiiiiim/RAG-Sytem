require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing in .env`);
  return v;
}

(async () => {
  const loginUrl = must("WEB_LOGIN_URL");
  const username = must("WEB_USERNAME");
  const password = must("WEB_PASSWORD");
  const storagePath =
    process.env.WEB_STORAGE_STATE || "./storageState.web.json";

  // Allow selectors to be configured in .env
  const userSelector =
    process.env.WEB_USER_SELECTOR || 'input[name="userName"]';
  const passSelector =
    process.env.WEB_PASS_SELECTOR || 'input[name="passwordShow"]';
  const submitSelector =
    process.env.WEB_SUBMIT_SELECTOR ||
    'button[type="submit"], input[value="Login"]';

  // What indicates "logged in"?
  // We'll treat being on /home.php as logged in, OR presence of a logout link/button.
  const loggedInUrlHint = process.env.WEB_LOGGEDIN_URL_HINT || "/home.php";
  const logoutSelector =
    process.env.WEB_LOGOUT_SELECTOR ||
    'a[href*="logout"], button[name="logout"], a:has-text("Logout")';

  const warmupUrlsRaw = process.env.WEB_AUTH_WARMUP_URLS || "";
  const warmupUrls = warmupUrlsRaw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (warmupUrls.length === 0) {
    const base = new URL(loginUrl);
    warmupUrls.push(new URL(loggedInUrlHint, base).toString());
    warmupUrls.push(
      new URL("/brokers/system_preferences.php", base).toString(),
    );
  }

  const browser = await chromium.launch({
    executablePath: process.env.BRAVE_PATH,
    headless: false,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Opening login:", loginUrl);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  // Small wait for any redirects
  await page.waitForTimeout(4000);

  const currentUrl = page.url();
  const isAlreadyLoggedIn =
    currentUrl.includes(loggedInUrlHint) ||
    (await page
      .locator(logoutSelector)
      .first()
      .isVisible()
      .catch(() => false));

  if (isAlreadyLoggedIn) {
    console.log("✅ Already logged in (detected). Saving storage state...");
    for (const url of warmupUrls) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
      } catch (err) {
        console.warn(`⚠️ Warmup failed for ${url}: ${err.message}`);
      }
    }
    await context.storageState({ path: storagePath });
    console.log("✅ Saved storage state to:", storagePath);
    await browser.close();
    if (!fs.existsSync(storagePath))
      throw new Error("storageState file was not created!");
    return;
  }

  // Not logged in: try to fill and submit the form
  console.log("Not logged in; attempting login form fill...");

  // Wait for username field (but not forever)
  await page.waitForSelector(userSelector, { timeout: 15000 });
  await page.fill(userSelector, username);
  await page.fill(passSelector, password);

  await Promise.all([
    page.click(submitSelector),
    page.waitForLoadState("networkidle"),
  ]);

  // Confirm login
  await page.waitForTimeout(1000);
  const afterUrl = page.url();
  const nowLoggedIn =
    afterUrl.includes(loggedInUrlHint) ||
    (await page
      .locator(logoutSelector)
      .first()
      .isVisible()
      .catch(() => false));

  if (!nowLoggedIn) {
    console.log("After submit URL:", afterUrl);
    throw new Error(
      "Login did not look successful. Check credentials/selectors.",
    );
  }

  for (const url of warmupUrls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    } catch (err) {
      console.warn(`⚠️ Warmup failed for ${url}: ${err.message}`);
    }
  }

  await context.storageState({ path: storagePath });
  console.log("✅ Saved storage state to:", storagePath);

  await browser.close();
  if (!fs.existsSync(storagePath))
    throw new Error("storageState file was not created!");
})();
