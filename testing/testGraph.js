require("dotenv").config();
const { runRAGGraph } = require("../src/graph/ragGraph");

async function main() {
  const result = await runRAGGraph({
    question: "What are the main objectives of the project?",
    pdfPaths: ["./sample.pdf"], // later you can pass multiple PDFs
    topK: 3,
  });

  console.log("\n=== Answer ===\n");
  console.log(result.answer);

  console.log("\n=== Sources ===\n");
  console.log(result.sources);
}

main().catch(console.error);
