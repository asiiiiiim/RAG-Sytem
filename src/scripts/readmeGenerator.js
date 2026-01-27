const fs = require("fs");
const path = require("path");

// very small stopword set (we can expand later)
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "as",
  "is", "are", "was", "were", "be", "by", "at", "from", "this", "that", "it",
  "these", "those", "into", "their", "its", "we", "you", "they", "can", "may",
  "must", "should", "will", "shall", "not", "no", "yes"
]);

function looksLikeIdToken(w) {
  // drop long merged tokens like fsdzagv10, doc codes, hashes
  if (!w) return true;
  if (w.length > 20) return true;
  // lots of digits => likely ID/version/code
  const digits = (w.match(/[0-9]/g) || []).length;
  if (digits >= 3 && digits / w.length > 0.25) return true;
  // all alnum no vowels and long => often code
  if (/^[a-z0-9_-]{10,}$/i.test(w)) return true;
  return false;
}

function isGenericExpansion(full) {
  const t = full.trim().toLowerCase();
  // too short or too generic
  if (t.length < 8) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;
  const generic = new Set(["system", "document", "documents", "platform", "lending", "trading", "process"]);
  // If it's a single generic word or starts/ends with generic-only terms, reject
  if (words.length === 2 && generic.has(words[0]) && generic.has(words[1])) return true;
  if (words.length === 1 && generic.has(words[0])) return true;
  return false;
}

function normalizeWord(w) {
  return w.toLowerCase().replace(/[^a-z0-9_-]/g, "").trim();
}

function extractKeywords(text, { topN = 12 } = {}) {
  const freq = new Map();
  const words = text.split(/\s+/g);

  for (const raw of words) {
    const w = normalizeWord(raw);
    if (!w) continue;
    if (w.length < 3) continue;
    if (STOPWORDS.has(w)) continue;
    if (looksLikeIdToken(w)) continue;

    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w, c]) => ({ word: w, count: c }));
}

/**
 * Extract acronym pairs only if they appear explicitly in text:
 * - Full Term (ABBR)
 * - ABBR (Full Term)
 */
function extractAcronymPairs(text, { maxPairs = 10 } = {}) {
  const pairs = new Map(); // ABBR -> Full Term

  // Full Term (ABBR)
  const re1 = /([A-Za-z][A-Za-z0-9 \-]{3,80}?)\s*\(([A-Z]{2,10})\)/g;
  // ABBR (Full Term)
  const re2 = /([A-Z]{2,10})\s*\(([A-Za-z][A-Za-z0-9 \-]{3,80}?)\)/g;

  let m;
  while ((m = re1.exec(text)) !== null) {
    const full = m[1].trim().replace(/\s+/g, " ");
    const abbr = m[2].trim();
    if (full.length < 4) continue;
    if (isGenericExpansion(full)) continue;
    pairs.set(abbr, full);
    if (pairs.size >= maxPairs) break;
  }

  while ((m = re2.exec(text)) !== null) {
    const abbr = m[1].trim();
    const full = m[2].trim().replace(/\s+/g, " ");
    if (full.length < 4) continue;
    pairs.set(abbr, full);
    if (pairs.size >= maxPairs) break;
  }

  return [...pairs.entries()].map(([abbr, full]) => ({ abbr, full }));
}

function safeSlice(text, maxChars) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) + "..." : cleaned;
}

/**
 * Build README_generated.md content using evidence only.
 */
function buildGeneratedReadme({
  folderRelPath,
  childFolders,
  pdfFiles,
  sampledEvidenceText, // combined sample text from PDFs
  keywords,
  acronymPairs,
  evidencePdfPaths,
}) {
  const title = folderRelPath ? `Folder: ${folderRelPath}` : "Folder: (root)";

  const foldersList = childFolders.length ? childFolders.map((f) => `- ${f}`).join("\n") : "- (none)";
  const pdfList = pdfFiles.length ? pdfFiles.map((f) => `- ${f}`).join("\n") : "- (none)";

  const keywordList = keywords.length
    ? keywords.map((k) => `- ${k.word} (${k.count})`).join("\n")
    : "- (not enough text to extract keywords)";

  const acrList = acronymPairs.length
    ? acronymPairs.map((p) => `- ${p.abbr}: ${p.full}`).join("\n")
    : "- (none detected in evidence)";

  const evidenceFiles = evidencePdfPaths.length
    ? evidencePdfPaths.map((p) => `- ${p}`).join("\n")
    : "- (no PDFs sampled)";

  const samplePreview = sampledEvidenceText
    ? safeSlice(sampledEvidenceText, 700)
    : "(no PDF text evidence available)";

  return `# README (Generated)

${title}

## What this folder contains
This README was generated automatically because **README.md** was missing.
It is **evidence-based** and does not guess meanings beyond observed content.

## Subfolders
${foldersList}

## PDF documents
${pdfList}

## Evidence: sampled PDFs
${evidenceFiles}

## Evidence: sample text (preview)
> ${samplePreview}

## Keywords (from evidence)
${keywordList}

## Abbreviations found (from evidence)
${acrList}

## Notes
- Replace this file with a real **README.md** when available.
- This file is safe to keep temporarily for routing and review.
`;
}

function ensureGeneratedReadmeOnDisk(absFolderPath, generatedText) {
  const generatedPath = path.join(absFolderPath, "README_generated.md");
  if (!fs.existsSync(generatedPath)) {
    fs.writeFileSync(generatedPath, generatedText, "utf-8");
  }
  return generatedPath;
}

function buildRoutingText({
  folderRelPath,
  childFolders,
  pdfFiles,
  keywords,
  acronymPairs,
}) {
  const title = folderRelPath ? `Folder: ${folderRelPath}` : "Folder: (root)";
  const foldersLine =
    childFolders.length ? childFolders.slice(0, 12).join(", ") : "(none)";
  const pdfLine =
    pdfFiles.length ? pdfFiles.slice(0, 12).map((p) => path.basename(p)).join(", ") : "(none)";

  const kwLine = keywords.length ? keywords.map((k) => k.word).join(", ") : "(none)";
  const acrLine = acronymPairs.length
    ? acronymPairs.map((p) => `${p.abbr}=${p.full}`).join(" | ")
    : "(none)";

  // IMPORTANT: short + dense + stable for embeddings
  return [
    title,
    `Subfolders: ${foldersLine}`,
    `PDFs: ${pdfLine}`,
    `Keywords: ${kwLine}`,
    `Abbreviations: ${acrLine}`,
  ].join("\n");
}

module.exports = {
  buildGeneratedReadme,
  ensureGeneratedReadmeOnDisk,
  extractKeywords,
  extractAcronymPairs,
  buildRoutingText,
};
