/**
 * Shared Utilities
 * 
 * Common utility functions used across the web crawler system.
 */

const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════════════════════
// String Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sanitize a string for use in filenames
 */
function sanitizeFilename(s, maxLength = 140) {
  return String(s || "")
    .replace(/[^\w:/.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, maxLength);
}

/**
 * Generate a timestamp string for filenames
 */
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ═══════════════════════════════════════════════════════════════════════════
// URL Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract route key from URL (hostname + pathname)
 */
function routeKeyFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return urlStr;
  }
}

/**
 * Extract domain from URL
 */
function domainFromUrl(urlStr) {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return urlStr.split("/")[0].toLowerCase();
  }
}

/**
 * Normalize URL by removing trailing slashes and query params
 */
function normalizeUrl(urlStr, options = {}) {
  try {
    const u = new URL(urlStr);
    let normalized = `${u.protocol}//${u.hostname}${u.pathname}`;
    
    // Remove trailing slash (except for root)
    if (normalized.endsWith("/") && u.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    
    // Keep query params if needed
    if (!options.dropQuery && u.search) {
      normalized += u.search;
    }
    
    return normalized;
  } catch {
    return urlStr;
  }
}

/**
 * Check if URL matches allowed host and path prefix
 */
function isUrlAllowed(urlStr, config) {
  try {
    const u = new URL(urlStr);
    
    // Check host
    if (config.allowedHost && u.hostname !== config.allowedHost) {
      return false;
    }
    
    // Check path prefix
    if (config.allowedPathPrefix && !u.pathname.startsWith(config.allowedPathPrefix)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// File Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Load JSON file with fallback
 */
function loadJson(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (e) {
    console.warn(`Warning: Failed to load ${filePath}: ${e.message}`);
  }
  return fallback;
}

/**
 * Save JSON file
 */
function saveJson(filePath, data, options = {}) {
  ensureDir(path.dirname(filePath));
  const content = options.pretty !== false 
    ? JSON.stringify(data, null, 2) 
    : JSON.stringify(data);
  fs.writeFileSync(filePath, content, "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Categorize error for reporting
 */
function categorizeError(message) {
  const msg = (message || "").toLowerCase();
  if (msg.includes("timeout")) return "timeout";
  if (msg.includes("navigation")) return "navigation";
  if (msg.includes("login") || msg.includes("auth")) return "auth";
  if (msg.includes("not found") || msg.includes("404")) return "not_found";
  if (msg.includes("network") || msg.includes("connection") || msg.includes("fetch")) return "network";
  if (msg.includes("selector") || msg.includes("locator")) return "selector";
  if (msg.includes("closed") || msg.includes("target")) return "browser_closed";
  return "unknown";
}

/**
 * Safe error message extraction
 */
function errorMessage(err, maxLength = 500) {
  const msg = err?.message || String(err);
  return msg.slice(0, maxLength);
}

// ═══════════════════════════════════════════════════════════════════════════
// Async Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 */
async function retry(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const baseDelay = options.baseDelay || 1000;
  
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════════════
// Logging Utilities
// ═══════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLogLevel = LOG_LEVELS.info;

function setLogLevel(level) {
  currentLogLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
}

function log(level, ...args) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const prefix = {
      debug: "🔍",
      info: "ℹ️ ",
      warn: "⚠️ ",
      error: "❌",
    }[level] || "";
    console.log(prefix, ...args);
  }
}

const logger = {
  debug: (...args) => log("debug", ...args),
  info: (...args) => log("info", ...args),
  warn: (...args) => log("warn", ...args),
  error: (...args) => log("error", ...args),
  setLevel: setLogLevel,
};

module.exports = {
  // String
  sanitizeFilename,
  timestamp,
  
  // URL
  routeKeyFromUrl,
  domainFromUrl,
  normalizeUrl,
  isUrlAllowed,
  
  // File
  ensureDir,
  loadJson,
  saveJson,
  
  // Error
  categorizeError,
  errorMessage,
  
  // Async
  sleep,
  retry,
  
  // Logging
  logger,
  setLogLevel,
};
