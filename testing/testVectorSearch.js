require("dotenv").config();

const { extractPDFText } = require("../src/utils/pdfLoader");
const { splitText } = require("../src/utils/textSplitter");
const { embedText } = require("../src/embeddings/embedder");
const { InMemoryVectorStore } = require("../src/vectorstore/inMemoryStore");

async function main() {
  const store = new InMemoryVectorStore();

  const text = await extractPDFText("./sample.pdf");
  const chunks = splitText(text, { chunkSize: 1200, chunkOverlap: 200 });

  // 1) Embed & store chunks
  for (let i = 0; i < chunks.length; i++) {
    const emb = await embedText(chunks[i], { taskType: "search_document" });

    store.add({
      id: `doc1_chunk${i}`,
      text: chunks[i],
      embedding: emb,
      metadata: { documentId: "doc1", chunkIndex: i },
    });
  }

  // 2) Embed query
  const question = "What is the purpose of this project?";
  const qEmb = await embedText(question, { taskType: "search_query" });

  // 3) Search
  const results = store.similaritySearch(qEmb, 2);

  console.log("Top results:");
  results.forEach((r, idx) => {
    console.log(`\n#${idx + 1} score=${r.score.toFixed(4)} id=${r.id}`);
    console.log(r.text.slice(0, 250));
  });
}

main().catch(console.error);
