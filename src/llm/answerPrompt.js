function buildAnswerMessages({ question, context }) {
  const system = `
You are a careful assistant answering questions ONLY using the provided sources.
Rules:
- Use ONLY the information in the sources. If the sources don't contain the answer, say: "I don't know based on the provided documents."
- Always include citations in the form [Source X] after each claim.
- Prefer concise, direct answers.
- Do not mention "context window" or internal tool names.
`.trim();

  const user = `
Question:
${question}

Sources:
${context}

Write the answer with citations like [Source 1], [Source 2].
`.trim();

  return { system, user };
}

module.exports = { buildAnswerMessages };
