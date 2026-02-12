/**
 * Core Module Index
 * 
 * Re-exports all core modules for convenient importing.
 */

module.exports = {
  // Configuration
  ...require("./config"),
  
  // Utilities
  ...require("./utils"),
  
  // Browser management
  ...require("./browser"),
  
  // Authentication
  ...require("./auth"),
  
  // Form handling
  ...require("./forms"),
  
  // Screenshot capture
  ...require("./screenshots"),
  
  // Database operations
  ...require("./database"),
  
  // Tiling utilities
  ...require("./tiler"),
};
