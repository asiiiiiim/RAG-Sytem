function evaluateRetrieval(state, { minScore = 0.50 } = {}) {
  const top = state.retrievedResults?.[0];

  if (!top) {
    state.retrievalQuality = "weak";
    return state;
  }

  // Simple heuristic: if top similarity is low => weak retrieval
  state.retrievalQuality = top.score >= minScore ? "strong" : "weak";
  return state;
}

module.exports = { evaluateRetrieval };
