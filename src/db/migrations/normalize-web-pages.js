#!/usr/bin/env node
/**
 * Migration: Normalize web_pages collection
 * 
 * Changes:
 * 1. Remove `captureMeta` field (redundant with screenshots.*.meta)
 * 2. Remove `index` from tileRefs arrays (redundant with array position)
 * 3. Add `screenshots.viewport` at root level (consolidated)
 * 4. Add `extraction.version` field
 * 5. Add `domain` and `failureType` to web_failures schema
 * 6. Create indexes on routeKey, domain
 * 
 * Run: node src/db/migrations/normalize-web-pages.js
 */

require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "rag_tree";

async function migrate() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Migration: Normalize web_pages & web_failures");
  console.log("═══════════════════════════════════════════════════════════\n");

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const webPages = db.collection("web_pages");
  const webFailures = db.collection("web_failures");

  // ─────────────────────────────────────────────────────────────
  // 1. Create indexes
  // ─────────────────────────────────────────────────────────────
  console.log("1️⃣  Creating indexes on web_pages...");
  
  await webPages.createIndex({ routeKey: 1 }, { unique: true, background: true });
  console.log("   ✓ Created unique index on routeKey");
  
  await webPages.createIndex({ domain: 1 }, { background: true });
  console.log("   ✓ Created index on domain");
  
  await webPages.createIndex({ "extraction.status": 1 }, { background: true });
  console.log("   ✓ Created index on extraction.status");

  console.log("\n   Creating indexes on web_failures...");
  await webFailures.createIndex({ routeKey: 1 }, { background: true });
  console.log("   ✓ Created index on routeKey");
  
  await webFailures.createIndex({ domain: 1 }, { background: true });
  console.log("   ✓ Created index on domain");

  // ─────────────────────────────────────────────────────────────
  // 2. Normalize web_pages documents
  // ─────────────────────────────────────────────────────────────
  console.log("\n2️⃣  Normalizing web_pages documents...");

  const docs = await webPages.find({}).toArray();
  console.log(`   Found ${docs.length} documents to process`);

  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const updates = {};
    const unsets = {};
    let needsUpdate = false;

    // Remove captureMeta if exists
    if (doc.captureMeta) {
      unsets.captureMeta = "";
      needsUpdate = true;
    }

    // Extract viewport from screenshots.basic.meta or screenshots.advanced.meta
    if (doc.screenshots && !doc.screenshots.viewport) {
      const viewport = 
        doc.screenshots?.basic?.meta?.viewport ||
        doc.screenshots?.advanced?.meta?.viewport ||
        { width: 1365, height: 768 };
      updates["screenshots.viewport"] = viewport;
      needsUpdate = true;
    }

    // Add extraction.version if missing
    if (doc.extraction && doc.extraction.version === undefined) {
      updates["extraction.version"] = 1;
      needsUpdate = true;
    }

    // Normalize tileRefs: remove index property (implicit in array position)
    const normalizeRefs = (refs) => {
      if (!Array.isArray(refs)) return refs;
      return refs.map(({ index, ...rest }) => rest);
    };

    if (doc.screenshots?.basic?.tileRefs) {
      const normalized = normalizeRefs(doc.screenshots.basic.tileRefs);
      const hasIndex = doc.screenshots.basic.tileRefs.some(r => r.index !== undefined);
      if (hasIndex) {
        updates["screenshots.basic.tileRefs"] = normalized;
        needsUpdate = true;
      }
    }

    if (doc.screenshots?.advanced?.tileRefs) {
      const normalized = normalizeRefs(doc.screenshots.advanced.tileRefs);
      const hasIndex = doc.screenshots.advanced.tileRefs.some(r => r.index !== undefined);
      if (hasIndex) {
        updates["screenshots.advanced.tileRefs"] = normalized;
        needsUpdate = true;
      }
    }

    if (doc.screenshots?.advancedContainer?.tileRefs) {
      const normalized = normalizeRefs(doc.screenshots.advancedContainer.tileRefs);
      const hasIndex = doc.screenshots.advancedContainer.tileRefs.some(r => r.index !== undefined);
      if (hasIndex) {
        updates["screenshots.advancedContainer.tileRefs"] = normalized;
        needsUpdate = true;
      }
    }

    // Normalize advancedTables structure
    if (Array.isArray(doc.screenshots?.advancedTables)) {
      // Convert array to object structure
      const refs = doc.screenshots.advancedTables.map(({ index, ...rest }) => rest);
      updates["screenshots.advancedTables"] = {
        refs,
        found: refs.length,
        captured: refs.length,
        failed: [],
      };
      needsUpdate = true;
    } else if (doc.screenshots?.advancedTables?.refs) {
      const normalized = normalizeRefs(doc.screenshots.advancedTables.refs);
      const hasIndex = doc.screenshots.advancedTables.refs.some(r => r.index !== undefined);
      if (hasIndex) {
        updates["screenshots.advancedTables.refs"] = normalized;
        needsUpdate = true;
      }
    }

    // Apply updates
    if (needsUpdate) {
      const updateOp = {};
      if (Object.keys(updates).length > 0) updateOp.$set = updates;
      if (Object.keys(unsets).length > 0) updateOp.$unset = unsets;

      await webPages.updateOne({ _id: doc._id }, updateOp);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`   ✓ Updated: ${updated} | Skipped: ${skipped}`);

  // ─────────────────────────────────────────────────────────────
  // 3. Normalize web_failures documents
  // ─────────────────────────────────────────────────────────────
  console.log("\n3️⃣  Normalizing web_failures documents...");

  const failures = await webFailures.find({ domain: { $exists: false } }).toArray();
  console.log(`   Found ${failures.length} documents missing domain`);

  let failuresUpdated = 0;

  for (const doc of failures) {
    try {
      const url = doc.exampleUrl || doc.routeKey;
      let domain = null;
      
      if (url.startsWith("http")) {
        domain = new URL(url).hostname.toLowerCase();
      } else if (doc.routeKey) {
        // routeKey format: hostname/path
        domain = doc.routeKey.split("/")[0].toLowerCase();
      }

      // Categorize failure type
      let failureType = "unknown";
      const reason = (doc.reason || "").toLowerCase();
      
      if (reason.includes("timeout")) failureType = "timeout";
      else if (reason.includes("navigation")) failureType = "navigation";
      else if (reason.includes("login") || reason.includes("auth")) failureType = "auth";
      else if (reason.includes("not found") || reason.includes("404")) failureType = "not_found";
      else if (reason.includes("network") || reason.includes("connection")) failureType = "network";
      else if (reason.includes("selector") || reason.includes("locator")) failureType = "selector";

      if (domain) {
        await webFailures.updateOne(
          { _id: doc._id },
          { $set: { domain, failureType } }
        );
        failuresUpdated++;
      }
    } catch (e) {
      // Skip malformed URLs
    }
  }

  console.log(`   ✓ Updated: ${failuresUpdated}`);

  // ─────────────────────────────────────────────────────────────
  // 4. Summary
  // ─────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Migration Complete!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  web_pages:   ${updated} updated, ${skipped} skipped`);
  console.log(`  web_failures: ${failuresUpdated} updated`);
  console.log("  Indexes created on routeKey, domain, extraction.status");
  console.log("═══════════════════════════════════════════════════════════\n");

  await client.close();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
