require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { runRAGGraph } = require("./graph/ragGraph");

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

/**
 * POST /ask
 * Form-data:
 *  - files: PDFs (multiple)
 *  - question: string
 *  - topK: number (optional)
 */
app.post("/ask", upload.array("files"), async (req, res) => {
  try {
    const question = req.body.question;
    const topK = Number(req.body.topK || 3);

    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "at least one PDF file is required" });
    }

    const pdfPaths = req.files.map((f) => f.path);

    const result = await runRAGGraph({
      question,
      pdfPaths,
      topK,
    });

    return res.json({
      answer: result.answer,
      sources: result.sources,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
