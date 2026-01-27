require("dotenv").config();
const { selectScopes } = require("../src/routing/treeRouter");
const { retrieveTopK } = require("../src/retrieval/scopedRetrieve");
const { shouldIncludeCommon } = require("../src/retrieval/commonProbe");
const { mergeAndApplyQuota } = require("../src/retrieval/mergeAndQuota");

(async () => {
  const question =
    "What is the purpose of the Functional Specifications Document (FSD)?";

  const routing = await selectScopes(question, {
    candidateK: 8,
    finalMaxScopes: 3,
  });
  console.log("Domain scopes:", routing.selectedScopes);

  const domain = await retrieveTopK({
    question,
    scopes: routing.selectedScopes,
    topK: 6,
  });

  const commonDecision = await shouldIncludeCommon(question, {
    threshold: 0.56,
  });
  console.log("Common decision:", commonDecision);

  let common = [];
  if (commonDecision.include) {
    common = await retrieveTopK({
      question,
      scopes: [commonDecision.commonScope],
      topK: 6,
    });
  }

  const merged = mergeAndApplyQuota({
    domainResults: domain,
    commonResults: common,
    topKFinal: 6,
    commonRatio: 0.33,
    commonHardCap: 2,
  });

  console.log("\nQuota:", merged.quota);
  console.log("\nFinal picked chunks:");
  merged.finalResults.forEach((r, i) => {
    console.log(
      `#${i + 1} [${r.group}] score=${r.score.toFixed(4)} ${r.docRelPath} chunk=${r.chunkIndex}`,
    );
  });
})();
