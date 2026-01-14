function createInitialState({ question, documents = [] }) {
  return {
    question,
    documents, // later: uploaded PDFs
    chunks: [],
    embeddingsStored: false,

    queryEmbedding: null,
    retrievedResults: [],
    retrievalQuality: "unknown", // weak | strong

    answer: "",
    sources: [],
  };
}

module.exports = { createInitialState };
