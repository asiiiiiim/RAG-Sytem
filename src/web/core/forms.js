/**
 * Form Filler Module
 * 
 * Handles form detection, filling, and submission.
 * Configurable via form-fields.json for any webapp.
 */

const { getConfig } = require("./config");
const { loadJson, logger, sleep } = require("./utils");

let _formConfig = null;

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Loading
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load form fields configuration
 */
function loadFormConfig(options = {}) {
  if (_formConfig && !options.reload) {
    return _formConfig;
  }

  const config = getConfig();
  const configPath = options.configPath || config.formFieldsJson;
  
  _formConfig = loadJson(configPath, { pages: {}, defaults: {} });
  
  const pageCount = Object.keys(_formConfig.pages || {}).length;
  if (pageCount > 0) {
    logger.info(`Loaded form config: ${pageCount} page(s)`);
  }
  
  return _formConfig;
}

/**
 * Find form configuration for a URL
 */
function findFormConfigForUrl(url) {
  const formConfig = loadFormConfig();
  const urlLower = url.toLowerCase();

  for (const [key, pageConfig] of Object.entries(formConfig.pages || {})) {
    const pattern = pageConfig.urlPattern || "";
    if (pattern && urlLower.includes(pattern.toLowerCase())) {
      return { key, config: pageConfig };
    }
  }

  return null;
}

/**
 * Get default values from config
 */
function getDefaults() {
  const formConfig = loadFormConfig();
  return formConfig.defaults || {};
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect form fields on current page
 */
async function detectFormFields(page) {
  const fields = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input, select, textarea"));
    
    return inputs.map(el => {
      // Try to find associated label
      let label = "";
      
      // Check for label[for]
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${el.id}"]`);
        if (labelEl) label = labelEl.textContent?.trim() || "";
      }
      
      // Check parent row/cell for label
      if (!label) {
        const row = el.closest("tr");
        if (row) {
          const firstCell = row.querySelector("td:first-child, th:first-child");
          if (firstCell && firstCell !== el.closest("td")) {
            label = firstCell.textContent?.trim() || "";
          }
        }
      }
      
      // Check preceding sibling label
      if (!label) {
        const prev = el.previousElementSibling;
        if (prev?.tagName === "LABEL") {
          label = prev.textContent?.trim() || "";
        }
      }

      return {
        tag: el.tagName.toLowerCase(),
        type: el.type || "",
        name: el.name || "",
        id: el.id || "",
        placeholder: el.placeholder || "",
        label: label.slice(0, 100),
        value: el.value || "",
        visible: el.offsetParent !== null,
        required: el.required || false,
      };
    }).filter(f => f.visible && f.type !== "hidden" && f.type !== "submit" && f.type !== "reset");
  });

  return fields;
}

/**
 * Check if page has a form
 */
async function hasForm(page) {
  const forms = await page.locator("form").count();
  return forms > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Filling
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fill a single form field
 */
async function fillField(page, field) {
  const selectors = field.selector.split(",").map(s => s.trim());

  // Try each selector
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      const count = await loc.count();
      
      if (count > 0 && await loc.isVisible().catch(() => false)) {
        await loc.click().catch(() => {});
        await loc.fill("");
        
        // Handle different field types
        if (field.type === "date") {
          await loc.fill(field.value);
          const filled = await loc.inputValue().catch(() => "");
          if (!filled) {
            // Fallback: type character by character
            await loc.type(field.value, { delay: 30 });
          }
        } else if (field.type === "select") {
          await loc.selectOption(field.value);
        } else {
          await loc.fill(field.value);
        }

        return { success: true, selector: sel };
      }
    } catch (e) {
      continue;
    }
  }

  // Fallback: try finding by label text
  try {
    const labelLoc = page.locator(`label:has-text("${field.label}")`).first();
    if (await labelLoc.count() > 0) {
      const forAttr = await labelLoc.getAttribute("for");
      if (forAttr) {
        const inputLoc = page.locator(`#${forAttr}`).first();
        if (await inputLoc.count() > 0) {
          await inputLoc.fill(field.value);
          return { success: true, selector: `#${forAttr}`, method: "label" };
        }
      }
    }
  } catch (e) {}

  return { success: false, selector: null };
}

/**
 * Fill all configured form fields
 */
async function fillForm(page, formConfig) {
  const results = {
    filled: [],
    failed: [],
    total: 0,
  };

  const fields = formConfig.fields || [];
  results.total = fields.length;

  for (const field of fields) {
    const result = await fillField(page, field);
    
    if (result.success) {
      results.filled.push({
        label: field.label,
        value: field.value,
        selector: result.selector,
      });
      logger.debug(`Filled: ${field.label} = ${field.value}`);
    } else {
      results.failed.push({
        label: field.label,
        value: field.value,
      });
      logger.warn(`Failed to fill: ${field.label}`);
    }

    await sleep(150);
  }

  return results;
}

/**
 * Fill form for current page using config
 */
async function fillFormForUrl(page, url) {
  const match = findFormConfigForUrl(url);
  
  if (!match) {
    logger.debug(`No form config for: ${url}`);
    return null;
  }

  logger.info(`Filling form: ${match.key}`);
  const result = await fillForm(page, match.config);
  result.configKey = match.key;
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Submission
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Submit form using configured selector
 */
async function submitForm(page, formConfig) {
  if (!formConfig?.submitSelector) {
    return { submitted: false, reason: "no_submit_selector" };
  }

  const selectors = formConfig.submitSelector.split(",").map(s => s.trim());

  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
        await btn.click();
        logger.debug(`Submitted via: ${sel}`);
        
        // Wait for response
        const waitTime = formConfig.waitAfterSubmit || 3000;
        await sleep(waitTime);
        
        return { submitted: true, selector: sel };
      }
    } catch (e) {
      continue;
    }
  }

  return { submitted: false, reason: "submit_button_not_found" };
}

/**
 * Submit form for current page using config
 */
async function submitFormForUrl(page, url) {
  const match = findFormConfigForUrl(url);
  
  if (!match) {
    return { submitted: false, reason: "no_config" };
  }

  return await submitForm(page, match.config);
}

module.exports = {
  loadFormConfig,
  findFormConfigForUrl,
  getDefaults,
  detectFormFields,
  hasForm,
  fillField,
  fillForm,
  fillFormForUrl,
  submitForm,
  submitFormForUrl,
};
