#!/usr/bin/env node
/**
 * Test Form Filler
 * 
 * Navigates to a page, fills form fields from form-fields.json, submits, 
 * and captures screenshots to the screenshots folder.
 * 
 * Usage:
 *   node src/web/ingest/testFormFill.js [pageKey]
 * 
 * Example:
 *   node src/web/ingest/testFormFill.js statement_of_account_performance
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { launchBrowser } = require("../../browser/launchBrowser");

const FORM_FIELDS_PATH = path.join(process.cwd(), "form-fields.json");
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");
const STORAGE_STATE = process.env.WEB_STORAGE_STATE || "./storageState.web.json";
const BASE_URL = process.env.WEB_BASE_URL || "https://zag.dev.ae.zagfn.com/brokers/home.php";

async function loadFormFields() {
  if (!fs.existsSync(FORM_FIELDS_PATH)) {
    throw new Error(`Form fields config not found: ${FORM_FIELDS_PATH}`);
  }
  return JSON.parse(fs.readFileSync(FORM_FIELDS_PATH, "utf-8"));
}

async function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

async function isLoginDetected(page) {
  const url = (page.url() || "").toLowerCase();
  const urlLooksLogin = /\/(login|signin|auth|index)\b/.test(url) && !/home\.php/.test(url);
  
  const loginDom = (await page.locator(".loginform.login-body").count()) > 0;
  
  const pass = page.locator('input[type="password"]');
  const passVisible = (await pass.count()) > 0 && 
    await pass.first().isVisible().catch(() => false);

  return urlLooksLogin || loginDom || passVisible;
}

async function tryLogin(page) {
  const username = process.env.WEB_USERNAME;
  const password = process.env.WEB_PASSWORD;
  
  if (!username || !password) {
    throw new Error("WEB_USERNAME and WEB_PASSWORD required for login");
  }

  console.log("🔐 Logging in...");
  
  const userSel = process.env.WEB_USER_SELECTOR || 'input[name="userName"]';
  const passSel = process.env.WEB_PASS_SELECTOR || 'input[name="passwordShow"]';
  const submitSel = process.env.WEB_SUBMIT_SELECTOR || 'button[type="submit"]';

  await page.locator(userSel).first().fill(username);
  await page.locator(passSel).first().fill(password);
  
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.locator(submitSel).first().click(),
  ]);
  
  await page.waitForTimeout(1000);
}

async function fillField(page, field) {
  console.log(`   📝 Filling "${field.label}" = "${field.value}"`);
  
  // Try each selector in the comma-separated list
  const selectors = field.selector.split(",").map(s => s.trim());
  
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
      
      // Clear existing value first
      await loc.click();
      await loc.fill("");
      
      // For date fields, we may need special handling
      if (field.type === "date") {
        // Try direct fill first
        await loc.fill(field.value);
        
        // Check if it took the value
        const val = await loc.inputValue().catch(() => "");
        if (!val) {
          // Try typing character by character
          await loc.type(field.value, { delay: 50 });
        }
      } else {
        await loc.fill(field.value);
      }
      
      console.log(`      ✓ Used selector: ${sel}`);
      return true;
    }
  }
  
  // Try by label text
  const labelLoc = page.locator(`label:has-text("${field.label}")`).first();
  if (await labelLoc.count() > 0) {
    const forAttr = await labelLoc.getAttribute("for");
    if (forAttr) {
      const inputLoc = page.locator(`#${forAttr}`);
      if (await inputLoc.count() > 0) {
        await inputLoc.fill(field.value);
        console.log(`      ✓ Found via label[for="${forAttr}"]`);
        return true;
      }
    }
  }
  
  console.log(`      ⚠️  Could not find field "${field.label}"`);
  return false;
}

async function captureScreenshots(page, pageKey, stage) {
  await ensureScreenshotsDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${pageKey}__${stage}__${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  
  // Full page screenshot
  await page.screenshot({ path: filepath, fullPage: true, type: "png" });
  console.log(`   📸 Saved: ${filename}`);
  
  return filepath;
}

async function testFormFill(pageKey) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Form Fill Test");
  console.log("═══════════════════════════════════════════════════════════\n");

  const config = await loadFormFields();
  const pageConfig = config.pages[pageKey];
  
  if (!pageConfig) {
    console.error(`❌ Page "${pageKey}" not found in form-fields.json`);
    console.log("Available pages:", Object.keys(config.pages).join(", "));
    process.exit(1);
  }

  console.log(`📄 Page: ${pageKey}`);
  console.log(`📍 URL Pattern: ${pageConfig.urlPattern}`);
  console.log(`📝 Fields to fill: ${pageConfig.fields.length}\n`);

  const headless = (process.env.HEADLESS || "true").toLowerCase() !== "false";
  const browser = await launchBrowser({ headless });
  
  let context;
  const storageStatePath = path.resolve(process.cwd(), STORAGE_STATE);
  
  if (fs.existsSync(storageStatePath)) {
    console.log("📦 Loading saved session state...");
    context = await browser.newContext({ storageState: storageStatePath });
  } else {
    context = await browser.newContext();
  }
  
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(45000);

  try {
    // Build full URL
    const baseHost = new URL(BASE_URL).origin;
    const targetUrl = `${baseHost}${pageConfig.urlPattern}`;
    
    console.log(`🌐 Navigating to: ${targetUrl}\n`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1000);

    // Check for login
    if (await isLoginDetected(page)) {
      await tryLogin(page);
      
      // Navigate again after login
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1000);
      
      if (await isLoginDetected(page)) {
        throw new Error("Still on login page after authentication attempt");
      }
    }

    // Screenshot BEFORE filling
    console.log("📸 Capturing BEFORE screenshot...");
    await captureScreenshots(page, pageKey, "1_before");

    // Analyze the page to find the actual field selectors
    console.log("\n🔍 Analyzing page fields...");
    const pageInputs = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, select, textarea"));
      return inputs.map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || "",
        name: el.name || "",
        id: el.id || "",
        placeholder: el.placeholder || "",
        className: el.className || "",
        visible: el.offsetParent !== null,
      })).filter(i => i.visible);
    });
    
    console.log(`   Found ${pageInputs.length} visible input fields:`);
    pageInputs.forEach((inp, i) => {
      console.log(`   ${i+1}. <${inp.tag}> name="${inp.name}" id="${inp.id}" type="${inp.type}" placeholder="${inp.placeholder}"`);
    });

    // Fill each field
    console.log("\n📝 Filling form fields...");
    let filledCount = 0;
    
    for (const field of pageConfig.fields) {
      const filled = await fillField(page, field);
      if (filled) filledCount++;
      await page.waitForTimeout(300);
    }

    console.log(`\n   Filled ${filledCount}/${pageConfig.fields.length} fields`);

    // Screenshot AFTER filling (before submit)
    console.log("\n📸 Capturing AFTER-FILL screenshot...");
    await captureScreenshots(page, pageKey, "2_filled");

    // Submit if configured
    if (pageConfig.submitSelector) {
      console.log("\n🚀 Submitting form...");
      
      const submitSelectors = pageConfig.submitSelector.split(",").map(s => s.trim());
      let submitted = false;
      
      for (const sel of submitSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
          console.log(`   Clicking: ${sel}`);
          await btn.click();
          submitted = true;
          break;
        }
      }

      if (submitted) {
        const waitTime = pageConfig.waitAfterSubmit || 2000;
        console.log(`   Waiting ${waitTime}ms for results...`);
        await page.waitForTimeout(waitTime);
        
        // Screenshot AFTER submit
        console.log("\n📸 Capturing AFTER-SUBMIT screenshot...");
        await captureScreenshots(page, pageKey, "3_submitted");
      } else {
        console.log("   ⚠️  Could not find submit button");
      }
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  ✅ Test Complete!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`\n📂 Screenshots saved to: ${SCREENSHOTS_DIR}/\n`);

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    
    // Capture error state
    await captureScreenshots(page, pageKey, "ERROR").catch(() => {});
    
    throw err;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// CLI
const pageKey = process.argv[2] || "statement_of_account_performance";
testFormFill(pageKey).catch((err) => {
  console.error(err);
  process.exit(1);
});
