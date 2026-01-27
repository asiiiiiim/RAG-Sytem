const {
  buildGeneratedReadme,
  ensureGeneratedReadmeOnDisk,
  extractKeywords,
  extractAcronymPairs,
  buildRoutingText,
} = require("./readmeGenerator");

const { extractPDFText } = require("../utils/pdfLoader");

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ensureDbInitialized, closeMongo } = require("../db/mongo");

/**
 * Walk directory and return { folders: [], pdfs: [] } as relative paths.
 */
function scanTree(rootDir) {
  const folders = [];
  const pdfs = [];

  function walk(absDir) {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(absDir, entry.name);

      if (entry.isDirectory()) {
        folders.push(full);
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        pdfs.push(full);
      }
    }
  }

  // include root itself as a folder node
  folders.push(rootDir);
  walk(rootDir);

  // convert to rel paths
  const toRel = (abs) => path.relative(rootDir, abs).replaceAll("\\", "/");
  return {
    folders: folders.map(toRel),
    pdfs: pdfs.map(toRel),
  };
}

/**
 * Get parent relPath.
 * Example: "System/FCD/v1.1.1" -> "System/FCD"
 * Root "" has parent null.
 */
function parentPath(relPath) {
  if (!relPath || relPath === ".") return null;
  const norm = relPath.replaceAll("\\", "/");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length <= 1) return ""; // direct child of root
  return parts.slice(0, -1).join("/");
}

async function main() {
  const ROOT_DIR = process.env.ROOT_DIR;
  if (!ROOT_DIR) {
    throw new Error(
      "ROOT_DIR is missing in .env. (Set it to your root folder path)"
    );
  }

  const rootAbs = path.resolve(ROOT_DIR);

  if (!fs.existsSync(rootAbs) || !fs.statSync(rootAbs).isDirectory()) {
    throw new Error(`ROOT_DIR is not a valid directory: ${rootAbs}`);
  }

  const c = await ensureDbInitialized();

  // store rootDir in meta so server can verify migration happened
  await c.meta.updateOne(
    { _id: "rag_system_meta" },
    { $set: { rootDir: rootAbs, lastMigratedAt: new Date() } }
  );

  console.log("Scanning tree:", rootAbs);
  const { folders, pdfs } = scanTree(rootAbs);

  console.log("Folders found:", folders.length);
  console.log("PDFs found:", pdfs.length);

  // Upsert folder nodes
  for (const rel of folders) {
    const relPath = rel === "." ? "" : rel; // normalize root to ""
    await c.tree_nodes.updateOne(
      { relPath, nodeType: "folder" },
      {
        $set: {
          relPath,
          nodeType: "folder",
          parentPath: parentPath(relPath),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  // Upsert pdf nodes
  for (const rel of pdfs) {
    const relPath = rel === "." ? "" : rel;
    await c.tree_nodes.updateOne(
      { relPath, nodeType: "pdf" },
      {
        $set: {
          relPath,
          nodeType: "pdf",
          parentPath: parentPath(relPath),
          fileName: path.basename(relPath),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  // Build children lists (simple: compute from all nodes)
  const all = await c.tree_nodes
    .find({}, { projection: { relPath: 1, nodeType: 1, parentPath: 1 } })
    .toArray();

  const childrenMap = new Map(); // parentPath -> children relPaths
  for (const n of all) {
    const p = n.parentPath;
    if (p === null) continue;
    if (!childrenMap.has(p)) childrenMap.set(p, []);
    childrenMap.get(p).push({ relPath: n.relPath, nodeType: n.nodeType });
  }

  // Update folder nodes with children
  for (const [p, kids] of childrenMap.entries()) {
    // Only folders can have children; root "" is also a folder
    await c.tree_nodes.updateOne(
      { relPath: p, nodeType: "folder" },
      { $set: { children: kids } }
    );
  }

  // --- README handling for folders (missing only) ---
  // For each folder node, ensure it has a README.md or README_generated.md.
  const folderNodes = await c.tree_nodes
    .find({ nodeType: "folder" }, { projection: { relPath: 1, children: 1 } })
    .toArray();

  for (const folder of folderNodes) {
    const folderRel = folder.relPath || "";
    const absFolderPath = path.join(rootAbs, folderRel);

    const readmeRealAbs = path.join(absFolderPath, "README.md");
    let usedAbsPath;
    let readmeType;
    let routingText = null;

    if (fs.existsSync(readmeRealAbs)) {
      usedAbsPath = readmeRealAbs;
      readmeType = "real";
    } else {
      // Evidence-only generation (no guessing)
      const kids = Array.isArray(folder.children) ? folder.children : [];
      const childFolders = kids
        .filter((k) => k.nodeType === "folder")
        .map((k) => k.relPath);
      const pdfFiles = kids
        .filter((k) => k.nodeType === "pdf")
        .map((k) => k.relPath);

      // ---- Evidence sampling from PDFs (lightweight) ----
      const MAX_PDFS_TO_SAMPLE = 3;
      const SLICE_CHARS = 2000;

      const pdfRelPathsToSample = pdfFiles.slice(0, MAX_PDFS_TO_SAMPLE);

      let combinedEvidence = "";
      const evidencePdfPaths = [];

      for (const pdfRel of pdfRelPathsToSample) {
        const pdfAbs = path.join(rootAbs, pdfRel);
        try {
          const fullText = await extractPDFText(pdfAbs);
          const clean = (fullText || "").replace(/\s+/g, " ").trim();
          if (!clean) continue;

          const startSlice = clean.slice(0, SLICE_CHARS);

          const midStart = Math.max(
            0,
            Math.floor(clean.length * 0.5) - Math.floor(SLICE_CHARS / 2)
          );
          const midSlice = clean.slice(midStart, midStart + SLICE_CHARS);

          combinedEvidence += "\n" + startSlice + "\n" + midSlice;
          evidencePdfPaths.push(pdfRel);
        } catch (e) {
          // ignore single PDF failure
        }
      }

      const keywords = extractKeywords(combinedEvidence, { topN: 12 });
      const acronymPairs = extractAcronymPairs(combinedEvidence, {
        maxPairs: 10,
      });
      const routingText = buildRoutingText({
        folderRelPath: folderRel,
        childFolders,
        pdfFiles,
        keywords,
        acronymPairs,
      });

      const generatedText = buildGeneratedReadme({
        folderRelPath: folderRel,
        childFolders,
        pdfFiles,
        sampledEvidenceText: combinedEvidence,
        keywords,
        acronymPairs,
        evidencePdfPaths,
      });

      usedAbsPath = ensureGeneratedReadmeOnDisk(absFolderPath, generatedText);
      readmeType = "generated";
    }

    const usedRelPath = path
      .relative(rootAbs, usedAbsPath)
      .replaceAll("\\", "/");
    const readmeText = fs.readFileSync(usedAbsPath, "utf-8");

    if (!routingText) routingText = readmeText; // for real README case

    if (readmeType === "generated") {
      // routingText already built above in the else branch
      // (we'll set it in that branch)
    }

    await c.tree_nodes.updateOne(
      { relPath: folderRel, nodeType: "folder" },
      {
        $set: {
          readmeUsedPath: usedRelPath,
          readmeType,
          readmeText,
          routingText: routingText || null,
        },
      }
    );
  }

  console.log("READMEs processed ✅");

  // --- Embed folder READMEs for routing ---
  const { embedText } = require("../embeddings/embedder");

  const foldersToEmbed = await c.tree_nodes
    .find(
      { nodeType: "folder" },
      { projection: { relPath: 1, routingText: 1, readmeEmbedding: 1 } }
    )
    .toArray();

  let embeddedCount = 0;

  for (const f of foldersToEmbed) {
    const txt = (f.routingText || "").trim();
    
    if (!txt) continue;

    // (Later optimization) skip if already embedded and unchanged
    // For now, always embed to keep it simple & correct.
    const vec = await embedText(txt, { taskType: "search_document" });

    await c.tree_nodes.updateOne(
      { relPath: f.relPath, nodeType: "folder" },
      {
        $set: {
          readmeEmbedding: vec,
          readmeEmbeddingModel: "nomic-embed-text-v1.5",
          readmeEmbeddedAt: new Date(),
        },
      }
    );

    embeddedCount++;
  }

  console.log(`Folder READMEs embedded ✅ (${embeddedCount})`);

  console.log("Tree nodes upserted ✅");

    // --- Index PDFs into Mongo chunks (for now: all PDFs found) ---
  const { indexPdfToMongo } = require("../indexing/indexPdfToMongo");

  for (const rel of pdfs) {
    const pdfRelPath = rel === "." ? "" : rel;
    console.log("Indexing PDF:", pdfRelPath);
    const r = await indexPdfToMongo({ rootAbs, pdfRelPath });
    console.log("Indexed:", r.docRelPath, "chunks:", r.chunksInserted);
  }


  await closeMongo();
}

main().catch(async (e) => {
  console.error("Migrate failed:", e);
  try {
    await closeMongo();
  } catch {}
  process.exit(1);
});
