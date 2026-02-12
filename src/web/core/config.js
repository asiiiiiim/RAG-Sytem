/**
 * Configuration Module
 * 
 * Centralizes all configuration with validation and sensible defaults.
 * Works with any webapp by using environment variables.
 */

const path = require("path");
const fs = require("fs");

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Schema with Defaults
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG_SCHEMA = {
  // Server
  port: { env: "PORT", default: 3000, type: "number" },

  // Database
  mongoUri: { env: "MONGODB_URI", default: "mongodb://127.0.0.1:27017", required: true },
  dbName: { env: "DB_NAME", default: "web_crawler", required: true },
  gridFsBucket: { env: "GRIDFS_BUCKET", default: "screenshots" },

  // Browser
  browserExecutable: { env: "BROWSER_EXECUTABLE", default: null },
  headless: { env: "HEADLESS", default: true, type: "boolean" },
  viewportWidth: { env: "VIEWPORT_WIDTH", default: 1280, type: "number" },
  viewportHeight: { env: "VIEWPORT_HEIGHT", default: 720, type: "number" },
  navigationTimeout: { env: "NAVIGATION_TIMEOUT", default: 45000, type: "number" },

  // Target Site
  baseUrl: { env: "WEB_BASE_URL", required: true },
  allowedHost: { env: "WEB_ALLOWED_HOST", default: null },
  allowedPathPrefix: { env: "WEB_ALLOWED_PATH_PREFIX", default: "/" },
  storageState: { env: "WEB_STORAGE_STATE", default: "./storage/session.json" },

  // Authentication
  loginUrl: { env: "WEB_LOGIN_URL", default: null },
  username: { env: "WEB_USERNAME", default: null },
  password: { env: "WEB_PASSWORD", default: null },
  loggedInUrlHint: { env: "WEB_LOGGEDIN_URL_HINT", default: null },

  // Login Selectors (customizable per webapp)
  userSelector: { env: "WEB_USER_SELECTOR", default: 'input[name="username"], input[name="email"], input[type="email"]' },
  passSelector: { env: "WEB_PASS_SELECTOR", default: 'input[type="password"]' },
  submitSelector: { env: "WEB_SUBMIT_SELECTOR", default: 'button[type="submit"], input[type="submit"]' },
  loginFormSelector: { env: "WEB_LOGIN_FORM_SELECTOR", default: 'form, .login-form, .loginform' },

  // Crawling
  concurrency: { env: "WEB_CONCURRENCY", default: 1, type: "number" },
  delayMs: { env: "WEB_DELAY_MS", default: 500, type: "number" },
  maxPages: { env: "WEB_MAX_PAGES", default: 500, type: "number" },
  dropQueryParams: { env: "DISCOVERY_DROP_QUERY", default: true, type: "boolean" },
  checkpointEvery: { env: "DISCOVERY_CHECKPOINT_EVERY", default: 25, type: "number" },

  // Screenshots
  screenshotMode: { env: "SCREENSHOT_MODE", default: "full", validate: v => ["full", "batches", "hybrid"].includes(v) },
  tileOverlap: { env: "TILE_OVERLAP", default: 0.2, type: "number" },

  // Files
  routesJson: { env: "ROUTES_JSON", default: "./data/routes.json" },
  formFieldsJson: { env: "FORM_FIELDS_JSON", default: "./config/form-fields.json" },
  dataDir: { env: "DATA_DIR", default: "./data" },

  // Vision Model (optional)
  ollamaUrl: { env: "OLLAMA_URL", default: "http://127.0.0.1:11434" },
  ollamaModel: { env: "OLLAMA_VLM_MODEL", default: "qwen2.5vl:3b" },
};

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Loading
// ═══════════════════════════════════════════════════════════════════════════

let _config = null;

function parseValue(value, type) {
  if (value === null || value === undefined) return null;
  
  switch (type) {
    case "number":
      const num = Number(value);
      return isNaN(num) ? null : num;
    case "boolean":
      if (typeof value === "boolean") return value;
      return value.toLowerCase() === "true" || value === "1";
    default:
      return value;
  }
}

function loadConfig(options = {}) {
  if (_config && !options.reload) return _config;

  const config = {};
  const errors = [];

  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    let value = process.env[schema.env];

    // Use default if not set
    if (value === undefined || value === "") {
      value = schema.default;
    } else {
      value = parseValue(value, schema.type);
    }

    // Check required
    if (schema.required && (value === null || value === undefined || value === "")) {
      errors.push(`Missing required config: ${schema.env}`);
    }

    // Validate
    if (value !== null && schema.validate && !schema.validate(value)) {
      errors.push(`Invalid value for ${schema.env}: ${value}`);
    }

    config[key] = value;
  }

  // Derive additional config
  if (config.baseUrl) {
    try {
      const url = new URL(config.baseUrl);
      if (!config.allowedHost) {
        config.allowedHost = url.hostname;
      }
    } catch (e) {
      errors.push(`Invalid WEB_BASE_URL: ${config.baseUrl}`);
    }
  }

  // Resolve paths relative to project root
  const projectRoot = options.projectRoot || process.cwd();
  config.projectRoot = projectRoot;
  config.routesJson = path.resolve(projectRoot, config.routesJson);
  config.formFieldsJson = path.resolve(projectRoot, config.formFieldsJson);
  config.storageState = path.resolve(projectRoot, config.storageState);
  config.dataDir = path.resolve(projectRoot, config.dataDir);

  // Ensure data directory exists
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }

  if (errors.length > 0 && !options.skipValidation) {
    throw new Error(`Configuration errors:\n  - ${errors.join("\n  - ")}`);
  }

  _config = config;
  return config;
}

function getConfig() {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}

function printConfig() {
  const config = getConfig();
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Configuration");
  console.log("═══════════════════════════════════════════════════════════\n");
  
  const groups = {
    "Target Site": ["baseUrl", "allowedHost", "allowedPathPrefix"],
    "Authentication": ["loginUrl", "username", "loggedInUrlHint"],
    "Browser": ["headless", "viewportWidth", "viewportHeight", "browserExecutable"],
    "Crawling": ["concurrency", "delayMs", "maxPages", "dropQueryParams"],
    "Screenshots": ["screenshotMode", "tileOverlap"],
    "Database": ["mongoUri", "dbName", "gridFsBucket"],
    "Files": ["routesJson", "formFieldsJson", "storageState"],
  };

  for (const [group, keys] of Object.entries(groups)) {
    console.log(`📁 ${group}:`);
    for (const key of keys) {
      const value = config[key];
      const display = key === "password" ? "****" : 
                      value === null ? "(not set)" : 
                      String(value).length > 50 ? String(value).slice(0, 50) + "..." : 
                      value;
      console.log(`   ${key}: ${display}`);
    }
    console.log();
  }
}

module.exports = {
  loadConfig,
  getConfig,
  printConfig,
  CONFIG_SCHEMA,
};
