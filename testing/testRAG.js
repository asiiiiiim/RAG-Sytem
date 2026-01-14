require("dotenv").config();

const { extractPDFText } = require("../src/utils/pdfLoader");
const { splitText } = require("../src/utils/textSplitter");
const { embedText } = require("../src/embeddings/embedder");
const { InMemoryVectorStore } = require("../src/vectorstore/inMemoryStore");
const { generateAnswer } = require("../src/graph/nodes/generateNode");

async function main() {
  // 1) Build the store from the PDF
  const store = new InMemoryVectorStore();
  const text = await extractPDFText("./sample.pdf");
  const chunks = splitText(text, { chunkSize: 1200, chunkOverlap: 200 });

  for (let i = 0; i < chunks.length; i++) {
    const emb = await embedText(chunks[i], { taskType: "search_document" });
    store.add({
      id: `doc1_chunk${i}`,
      text: chunks[i],
      embedding: emb,
      metadata: { documentId: "doc1", chunkIndex: i },
    });
  }

  // 2) Ask a question
  const question = "What are the main objectives of the project?";

  // 3) Retrieve top chunks
  const qEmb = await embedText(question, { taskType: "search_query" });
  const retrieved = store.similaritySearch(qEmb, 3);

  // 4) Generate answer using retrieved chunks
  const answer = await generateAnswer({ question, retrievedResults: retrieved });

  console.log("\n=== Answer ===\n");
  console.log(answer);

  console.log("\n=== Sources Used ===\n");
  retrieved.forEach((r, i) => {
    console.log(
      `Source ${i + 1}: doc=${r.metadata.documentId}, chunk=${r.metadata.chunkIndex}, score=${r.score.toFixed(4)}`
    );
  });
}

main().catch(console.error);
