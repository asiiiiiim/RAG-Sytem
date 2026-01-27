const { retrieveWithRouting } = require("../retrieval/retrievePipeline");
const { generateGroundedAnswer } = require("../llm/generateAnswer");

async function askQuestion({
  question,
  topKFinal = 6,
  candidateK = 8,
  finalMaxScopes = 3,
}) {
  const retrieval = await retrieveWithRouting({
    question,
    topKFinal,
    candidateK,
    finalMaxScopes,
  });

  const answer = await generateGroundedAnswer({
    question,
    context: retrieval.context,
  });

  return {
    answer,
    sources: retrieval.sources,
    routing: retrieval.routing,
    quota: retrieval.quota,
    commonDecision: retrieval.commonDecision,
  };
}

module.exports = { askQuestion };
