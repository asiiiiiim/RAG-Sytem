const { InMemoryVectorStore } = require("../vectorstore/inMemoryStore");

const registry = new Map(); // docId -> { meta, store }

function generateDocId() {
  return "doc_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function addDocument({ fileName, pdfPath, preview, chunksCount }) {
  const documentId = generateDocId();

  registry.set(documentId, {
    meta: {
      documentId,
      fileName,
      pdfPath,
      preview,
      chunksCount,
      createdAt: new Date().toISOString(),
    },
    store: new InMemoryVectorStore(),
  });

  return documentId;
}

function getDocument(documentId) {
  return registry.get(documentId);
}

function listDocuments() {
  return Array.from(registry.values()).map((d) => d.meta);
}

module.exports = {
  addDocument,
  getDocument,
  listDocuments,
};
