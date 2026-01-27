const path = require("path");
const { ensureDbInitialized } = require("../db/mongo");
const { extractPDFText } = require("../utils/pdfLoader");
const { chunkText } = require("../utils/chunker"); // you already have chunking util
const { embedText } = require("../embeddings/embedder");

async function indexPdfToMongo({ rootAbs, pdfRelPath, chunkSize = 1200, chunkOverlap = 200 }) {
  const c = await ensureDbInitialized();

  const docRelPath = pdfRelPath.replaceAll("\\", "/");
  const folderRelPath = path.posix.dirname(docRelPath) === "." ? "" : path.posix.dirname(docRelPath);
  const pdfAbsPath = path.join(rootAbs, docRelPath);

  // 1) Extract PDF text
  const fullText = await extractPDFText(pdfAbsPath);
  if (!fullText || !fullText.trim()) {
    console.warn("Empty PDF text:", docRelPath);
    return { docRelPath, chunksInserted: 0 };
  }

  // 2) Chunk
  const chunks = chunkText(fullText, { chunkSize, chunkOverlap });
  if (!chunks.length) {
    console.warn("No chunks produced:", docRelPath);
    return { docRelPath, chunksInserted: 0 };
  }

  // 3) (Re)index: remove old chunks for this doc (idempotent)
  await c.chunks.deleteMany({ docRelPath });

  // 4) Embed + insert
  let inserted = 0;
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];

    const embedding = await embedText(text, { taskType: "search_document" });

    await c.chunks.insertOne({
      docRelPath,
      folderRelPath,
      chunkIndex: i,
      text,
      embedding,
      createdAt: new Date(),
    });

    inserted++;
  }

  // 5) Upsert documents collection (nice metadata)
  await c.documents.updateOne(
    { relPath: docRelPath },
    {
      $set: {
        relPath: docRelPath,
        fileName: path.basename(docRelPath),
        folderRelPath,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  return { docRelPath, folderRelPath, chunksInserted: inserted };
}

module.exports = { indexPdfToMongo };
