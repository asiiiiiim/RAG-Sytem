/**
 * Clean routes.json - remove malformed entries
 */
const fs = require("fs");
const path = require("path");

const routesPath = path.join(process.cwd(), "routes.json");
const routes = JSON.parse(fs.readFileSync(routesPath, "utf-8"));

// Filter out malformed routes (XSS payloads, non-PHP files)
const clean = routes.filter(r => {
  const key = r.routeKey || "";
  // Remove entries with HTML/XSS
  if (key.includes("<") || key.includes(">")) return false;
  // Keep only .php files
  if (!key.endsWith(".php")) return false;
  return true;
});

console.log("Before:", routes.length);
console.log("After:", clean.length);
console.log("Removed:", routes.length - clean.length);

fs.writeFileSync(routesPath, JSON.stringify(clean, null, 2));
console.log("Saved cleaned routes.json");
