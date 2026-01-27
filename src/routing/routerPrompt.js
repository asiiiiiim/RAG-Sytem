function buildRouterMessages({ question, candidates }) {
  // candidates: [{ relPath, routingText, score }]
  const formatted = candidates
    .map((c, i) => {
      return `Candidate ${i + 1}
Path: ${c.relPath || "(root)"}
Score: ${c.score.toFixed(4)}
RoutingText:
${c.routingText || "(no routing text)"}
`;
    })
    .join("\n---\n");

  const system = `
You are a routing assistant for a document-tree RAG system.
Your job is to select which folder scopes are most relevant for retrieving context to answer the user's question.

Rules:
- You MUST choose from the given candidate folder paths only.
- Output MUST be valid JSON only (no extra text).
- Select between 1 and 3 folder paths in "selectedScopes".
- Prefer the most specific relevant folder scopes (deeper folders) if appropriate.
- If multiple scopes are clearly relevant, include them.
- Do NOT include a scope unless it is relevant to the question.

Return JSON schema:
{
  "selectedScopes": ["folder/path/1", "folder/path/2"],
  "notes": "short reason"
}
`.trim();

  const user = `
Question:
${question}

Candidate folders:
${formatted}

Return JSON only.
`.trim();

  return { system, user };
}

module.exports = { buildRouterMessages };
