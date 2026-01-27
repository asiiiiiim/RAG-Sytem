require("dotenv").config();
const { retrieveWithRouting } = require("../src/retrieval/retrievePipeline");

(async () => {
  const question =
    "What is the purpose of the Functional Specifications Document (FSD)?";

  const out = await retrieveWithRouting({
    question,
    topKDomain: 8,
    topKFinal: 6,
    candidateK: 8,
    finalMaxScopes: 3,
  });

  console.log("Selected scopes:", out.routing.selectedScopes);
  console.log("Quota:", out.quota);
  console.log("Common decision:", out.commonDecision);

  console.log("\nSources summary:");
  out.sources.forEach((s) => {
    console.log(
      `#${s.source} score=${s.score} path=${s.docRelPath} chunk=${s.chunkIndex}`,
    );
  });

  console.log("\nContext preview:\n", out.context.slice(0, 600) + "...\n");
})();
