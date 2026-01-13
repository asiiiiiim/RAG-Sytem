const fs = require("fs");

const pdfParseModule = require("pdf-parse");

// 🔍 normalize export (handles CJS + ESM + Node 25)
const pdfParse =
  typeof pdfParseModule === "function"
    ? pdfParseModule
    : pdfParseModule.default;

async function extractPDFText(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    console.error("PDF error:", err);
    return "";
  }
}

module.exports = { extractPDFText };
