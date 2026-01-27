require("dotenv").config();
const { selectScopes } = require("../src/routing/treeRouter");
const { retrieveTopK } = require("../src/retrieval/scopedRetrieve");

(async () => {
  const question =
    "What is the purpose of the Functional Specifications Document (FSD)?";

  const routing = await selectScopes(question, {
    candidateK: 8,
    finalMaxScopes: 3,
  });
  console.log("Scopes:", routing.selectedScopes);

  const results = await retrieveTopK({
    question,
    scopes: routing.selectedScopes,
    topK: 5,
  });
  console.log("\nTop chunks:");
  results.forEach((r, i) => {
    console.log(
      `#${i + 1} score=${r.score.toFixed(4)} ${r.docRelPath} chunk=${r.chunkIndex}`,
    );
    console.log(r.text.slice(0, 160).replace(/\s+/g, " ") + "...\n");
  });
})();
