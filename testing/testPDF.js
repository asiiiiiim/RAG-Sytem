const { extractPDFText } = require("../src/utils/pdfLoader");

async function test() {
  const text = await extractPDFText("sample.pdf");
  console.log(text.slice(0, 500));
}

test();
