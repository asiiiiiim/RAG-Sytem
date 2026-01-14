const { createInitialState } = require("./state");

const { extractPDFText } = require("../utils/pdfLoader");
const { splitText } = require("../utils/textSplitter");
const { embedText } = require("../embeddings/embedder");
const { InMemoryVectorStore } = require("../vectorstore/inMemoryStore");

const { generateAnswer } = require("./nodes/generateNode");
const { evaluateRetrieval } = require("./nodes/evaluateNode");

async function runRAGGraph({ question, pdfPaths = [], topK = 3 }) {
  const state = createInitialState({ question, documents: pdfPaths });

  // ---- Node: Ingest + Chunk (for all PDFs) ----
  const store = new InMemoryVectorStore();

  for (let d = 0; d < pdfPaths.length; d++) {
    const pdfPath = pdfPaths[d];
    const text = await extractPDFText(pdfPath);
    const chunks = splitText(text, { chunkSize: 1200, chunkOverlap: 200 });

    // Save chunks in state (optional)
    state.chunks.push(...chunks.map((t, idx) => ({
      documentId: `doc${d + 1}`,
      chunkIndex: idx,
      text: t,
    })));

    // ---- Node: Embed + Store ----
    for (let i = 0; i < chunks.length; i++) {
      const emb = await embedText(chunks[i], { taskType: "search_document" });

      store.add({
        id: `doc${d + 1}_chunk${i}`,
        text: chunks[i],
        embedding: emb,
        metadata: { documentId: `doc${d + 1}`, chunkIndex: i, pdfPath },
      });
    }
  }

  state.embeddingsStored = true;

  // ---- Node: Embed Query ----
  state.queryEmbedding = await embedText(question, { taskType: "search_query" });

  // ---- Node: Retrieve ----
  state.retrievedResults = store.similaritySearch(state.queryEmbedding, topK);

  // ---- Node: Evaluate ----
  evaluateRetrieval(state, { minScore: 0.50 });

  // ---- Conditional Edge: weak → retry with higher topK ----
  if (state.retrievalQuality === "weak") {
    // simple retry strategy: expand topK
    const retryTopK = Math.min(topK + 2, 8);
    state.retrievedResults = store.similaritySearch(state.queryEmbedding, retryTopK);
    evaluateRetrieval(state, { minScore: 0.50 });
  }

  // ---- Node: Generate ----
  state.answer = await generateAnswer({
    question: state.question,
    retrievedResults: state.retrievedResults,
  });

  // Sources for output
  state.sources = state.retrievedResults.map((r, i) => ({
    source: i + 1,
    documentId: r.metadata.documentId,
    chunkIndex: r.metadata.chunkIndex,
    score: r.score,
    pdfPath: r.metadata.pdfPath,
  }));

  return state;
}

module.exports = { runRAGGraph };
