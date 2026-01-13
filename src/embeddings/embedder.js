const fetch = require("node-fetch");

const NOMIC_EMBED_URL = "https://api-atlas.nomic.ai/v1/embedding/text";

async function embedText(text, { taskType = "search_document" } = {}) {
  if (!process.env.NOMIC_API_KEY) {
    throw new Error("NOMIC_API_KEY is missing. Did you load dotenv?");
  }

  const res = await globalThis.fetch(NOMIC_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOMIC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nomic-embed-text-v1.5",
      texts: [text],
      task_type: taskType,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  // API returns embeddings for each input text
  // Most commonly: { embeddings: [ [..vector..] ], ... }
  return data.embeddings[0];
}

module.exports = { embedText };
