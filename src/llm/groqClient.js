require("dotenv").config();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function groqChat(input) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing in .env");

  // ✅ Normalize input so both styles work
  const payload = Array.isArray(input) ? { messages: input } : input || {};

  if (!payload.messages || !Array.isArray(payload.messages)) {
    throw new Error('groqChat requires "messages" array.');
  }

  const model =
    payload.model || process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const temperature = payload.temperature ?? 0;

  const body = {
    model,
    messages: payload.messages,
    temperature,
  };

  const maxRetries = Number(process.env.GROQ_MAX_RETRIES || 6);
  const baseDelayMs = Number(process.env.GROQ_RETRY_BASE_MS || 800);

  let attempt = 0;
  while (true) {
    const res = await globalThis.fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    }

    const errText = await res.text();
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader
      ? Math.max(0, Number(retryAfterHeader) * 1000)
      : 0;

    const isRetryable = res.status === 429 || res.status >= 500;
    if (!isRetryable || attempt >= maxRetries) {
      throw new Error(`Groq request failed (${res.status}): ${errText}`);
    }

    const jitter = Math.floor(Math.random() * 200);
    const backoffMs = baseDelayMs * Math.pow(2, attempt);
    const waitMs = Math.max(retryAfterMs, backoffMs + jitter);

    await sleep(waitMs);
    attempt += 1;
  }
}

module.exports = { groqChat };
