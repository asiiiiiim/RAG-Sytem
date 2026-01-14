const { groqChat } = require("../../llm/groqClient");

function buildContext(results) {
  // Join chunks with clear separators + metadata tags
  return results
    .map((r, i) => {
      return `Source ${i + 1} (doc=${r.metadata.documentId}, chunk=${r.metadata.chunkIndex}, score=${r.score.toFixed(4)}):\n${r.text}`;
    })
    .join("\n\n---\n\n");
}

async function generateAnswer({ question, retrievedResults }) {
  const context = buildContext(retrievedResults);

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful assistant. Answer ONLY using the provided context. " +
        "If the answer is not in the context, say: 'I don't know based on the provided documents.' " +
        "Cite sources like [Source 1], [Source 2] when you use them.",
    },
    {
      role: "user",
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    },
  ];

  const answer = await groqChat({ messages });
  return answer;
}

module.exports = { generateAnswer };
