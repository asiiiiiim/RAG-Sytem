const { selectScopes } = require("../routing/treeRouter");
const { retrieveTopK } = require("./scopedRetrieve");
const { shouldIncludeCommon } = require("./commonProbe");
const { mergeAndApplyQuota } = require("./mergeAndQuota");
const { buildContextPack } = require("./contextPack");

async function retrieveWithRouting({
  question,
  topKDomain = 8,
  topKFinal = 6,
  candidateK = 8,
  finalMaxScopes = 3,
  commonThreshold = 0.56,
  commonRatio = 0.33,
  commonHardCap = 2,
}) {
  // 1) route
  const routing = await selectScopes(question, { candidateK, finalMaxScopes });

  // 2) domain retrieve
  const domain = await retrieveTopK({ question, scopes: routing.selectedScopes, topK: topKDomain });

  // 3) common probe (optional)
  const commonDecision = await shouldIncludeCommon(question, { threshold: commonThreshold });
  let common = [];
  if (commonDecision.include) {
    common = await retrieveTopK({ question, scopes: [commonDecision.commonScope], topK: topKDomain });
  }

  // 4) merge + quota
  const merged = mergeAndApplyQuota({
    domainResults: domain,
    commonResults: common,
    topKFinal,
    commonRatio,
    commonHardCap,
  });

  // 5) context pack
  const pack = buildContextPack(merged.finalResults);

  return {
    routing,
    commonDecision,
    quota: merged.quota,
    context: pack.context,
    sources: pack.sources,
  };
}

module.exports = { retrieveWithRouting };
