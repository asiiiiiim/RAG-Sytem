const { groqChat } = require("../../llm/groqClient"); // you already have this for W2 answering

function buildPrompt({ title, chunkText, url }) {
  return `
You are converting a web page into a detailed, structured knowledge note for retrieval-augmented QA.

Rules:
- Use ONLY the provided content. Do not invent or assume.
- Keep ALL important details. Do not over-summarize.
- Preserve procedures, constraints, required approvals, rules, definitions.
- Convert tables into bullet lists or key:value lines.
- Remove obvious UI chrome if it is not informational (menus, language picker), but DO NOT drop real content.
- Output in clear Markdown with headings and bullets.

Metadata:
Title: ${title || ""}
URL: ${url || ""}

Content to process:
"""
${chunkText}
"""
`;
}

async function processChunkWithLLM({ title, url, chunkText }) {
  const prompt = buildPrompt({ title, chunkText, url });

  // Using your existing groqChat helper
  const out = await groqChat({
    // choose your current working Groq model
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: "You are a precise documentation assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  return out;
}

module.exports = { processChunkWithLLM };