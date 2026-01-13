const { extractPDFText } = require("./src/utils/pdfLoader");
const { splitText } = require("./src/utils/textSplitter");

async function test() {
  const text = await extractPDFText("./sample.pdf");

  const chunks = splitText(text, { chunkSize: 1200, chunkOverlap: 200 });

  console.log("Total chunks:", chunks.length);
  console.log("\n--- First chunk ---\n");
  console.log(chunks[0]);
  console.log("\n--- Second chunk ---\n");
  console.log(chunks[1]);
}

test();
