const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function groqChat({ messages, model = process.env.GROQ_MODEL || "llama-3.1-8b-instant", temperature = 0.2 }) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing. Add it to .env and load dotenv.");
  }

  const res = await globalThis.fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq request failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

module.exports = { groqChat };
