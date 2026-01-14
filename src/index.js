require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { runRAGGraph } = require("./graph/ragGraph");

const { addDocument, getDocument, listDocuments } = require("./store/registry");
const { extractPDFText } = require("./utils/pdfLoader");
const { splitText } = require("./utils/textSplitter");
const { embedText } = require("./embeddings/embedder");

const app = express();
app.use(express.json());

// Store uploads in /uploads
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "RAG server running" });
});

app.get("/documents", (req, res) => {
  return res.json({ documents: listDocuments() });
});

app.post("/documents", upload.array("files"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ error: "at least one PDF file is required" });
    }

    const created = [];

    for (const file of req.files) {
      const fileName = file.originalname || file.filename;
      const pdfPath = file.path;

      // 1) Extract text
      const text = await extractPDFText(pdfPath);

      // 2) Chunk
      const chunks = splitText(text, { chunkSize: 1200, chunkOverlap: 200 });

      // 3) Register doc
      const preview = (chunks[0] || "").slice(0, 200);
      const documentId = addDocument({
        fileName,
        pdfPath,
        preview,
        chunksCount: chunks.length,
      });

      // 4) Embed chunks + store in that doc’s vector store
      const doc = getDocument(documentId);
      for (let i = 0; i < chunks.length; i++) {
        const emb = await embedText(chunks[i], { taskType: "search_document" });

        doc.store.add({
          id: `${documentId}_chunk${i}`,
          text: chunks[i],
          embedding: emb,
          metadata: { documentId, chunkIndex: i, fileName },
        });
      }

      created.push(doc.meta);
    }

    return res.json({ documents: created });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

/**
 * POST /ask
 * Form-data:
 *  - files: PDFs (multiple)
 *  - question: string
 *  - topK: number (optional)
 */
app.post("/ask", async (req, res) => {
  try {
    const { question, documentIds, topK = 3 } = req.body;

    if (!question)
      return res.status(400).json({ error: "question is required" });
    if (
      !documentIds ||
      !Array.isArray(documentIds) ||
      documentIds.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "documentIds must be a non-empty array" });
    }

    // 1) Embed query
    const qEmb = await embedText(question, { taskType: "search_query" });

    // 2) Search across selected documents
    const allResults = [];
    for (const docId of documentIds) {
      const doc = getDocument(docId);
      if (!doc) continue;

      const results = doc.store.similaritySearch(qEmb, topK);
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      return res
        .status(404)
        .json({ error: "No documents found for given documentIds" });
    }

    // 3) Sort results globally and take topK
    allResults.sort((a, b) => b.score - a.score);
    const retrieved = allResults.slice(0, topK);

    // 4) Generate answer
    const { generateAnswer } = require("./graph/nodes/generateNode");
    const answer = await generateAnswer({
      question,
      retrievedResults: retrieved,
    });

    // 5) Build sources
    const sources = retrieved.map((r, i) => ({
      source: i + 1,
      documentId: r.metadata.documentId,
      fileName: r.metadata.fileName,
      chunkIndex: r.metadata.chunkIndex,
      score: Number(r.score.toFixed(4)),
      snippet: r.text.slice(0, 180) + (r.text.length > 180 ? "..." : ""),
    }));

    return res.json({ answer, sources });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
