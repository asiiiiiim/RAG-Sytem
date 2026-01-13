require("dotenv").config();


const { embedText } = require("./src/embeddings/embedder");

async function test() {
  const docVec = await embedText("This is a document chunk about RAG and embeddings.", {
    taskType: "search_document",
  });

  const queryVec = await embedText("What is RAG?", {
    taskType: "search_query",
  });

  console.log("Doc vector length:", docVec.length);
  console.log("Query vector length:", queryVec.length);
  console.log("Doc first 5:", docVec.slice(0, 5));
}

test().catch(console.error);
