const { groqChat } = require("../../llm/groqClient");

function buildContext(results) {
  // Join chunks with clear separators + metadata tags
  return results
    .map((r, i) => {
      return `Source ${i + 1} (doc=${r.metadata.documentId}, chunk=${
        r.metadata.chunkIndex
      }, score=${r.score.toFixed(4)}):\n${r.text}`;
    })
    .join("\n\n---\n\n");
}

async function generateAnswer({ question, retrievedResults }) {
  const context = buildContext(retrievedResults);

  const messages = [
    {
      role: "system",
      content:
        "You are a QA assistant. Use ONLY the provided context. " +
        'If the answer is not explicitly in the context, reply exactly: "I don\'t know based on the provided documents." ' +
        "When you use information, cite ONLY using bracketed source numbers like [Source 1] or [Source 2]. " +
        "Do NOT add any other text inside the brackets. Do NOT cite anything else. " +
        "For each bullet point, cite the most relevant source(s) after the sentence." +
        "Keep the answer concise and structured.",
    },
    {
      role: "user",
      content:
        `Context:\n${context}\n\n` +
        `Question: ${question}\n\n` +
        `Instruction: If the question asks for a list (objectives/requirements/etc.), extract ALL items present in the context, not only some.`,
    },
  ];

  const answer = await groqChat({ messages });
  return answer;
}

module.exports = { generateAnswer };
