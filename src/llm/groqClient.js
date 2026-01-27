require("dotenv").config();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function groqChat(input) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing in .env");

  // ✅ Normalize input so both styles work
  const payload = Array.isArray(input) ? { messages: input } : (input || {});

  if (!payload.messages || !Array.isArray(payload.messages)) {
    throw new Error('groqChat requires "messages" array.');
  }

  const model = payload.model || process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const temperature = payload.temperature ?? 0;

  const body = {
    model,
    messages: payload.messages,
    temperature,
  };

  const res = await globalThis.fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

module.exports = { groqChat };
