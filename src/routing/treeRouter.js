const { embedText } = require("../embeddings/embedder");
const { buildRouterMessages } = require("./routerPrompt");
const { groqChat } = require("../llm/groqClient");
const { ensureDbInitialized } = require("../db/mongo");

/**
 * Cosine similarity between two vectors
 */
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // try to extract JSON block if model added extra text
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Failed to parse router JSON.");
  }
}

/**
 * Select relevant folder scopes using:
 * 1) Embedding top-K candidate folders
 * 2) LLM chooses final 1-3 scopes from those candidates
 */
async function selectScopes(question, { candidateK = 8, finalMaxScopes = 3 } = {}) {
  const c = await ensureDbInitialized();

  // 1) Embed question for routing
  const qVec = await embedText(question, { taskType: "search_query" });

  // 2) Load folder nodes with embeddings
  const folders = await c.tree_nodes
    .find(
      { nodeType: "folder", readmeEmbedding: { $exists: true, $type: "array" } },
      { projection: { relPath: 1, routingText: 1, readmeEmbedding: 1 } }
    )
    .toArray();

  if (!folders.length) {
    return {
      selectedScopes: [""],
      candidates: [],
      notes: "No folder embeddings found; defaulting to root scope.",
    };
  }

  // 3) Score and pick Top-K
  const scored = folders
    .map((f) => ({
      relPath: f.relPath || "",
      routingText: f.routingText || "",
      score: cosineSim(qVec, f.readmeEmbedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, candidateK);

  // // --- prune candidates: threshold + prefer specific folders ---
  // const MIN_SCORE = Number(process.env.ROUTER_MIN_SCORE || 0.58);

  // let pruned = scored.filter(c => c.score >= MIN_SCORE);

  // // If threshold prunes too hard, keep at least top 3
  // if (pruned.length < 3) pruned = scored.slice(0, Math.min(3, scored.length));

  // // Prefer deeper folders (more specific)
  // pruned.sort((a, b) => {
  //   const da = (a.relPath.match(/\//g) || []).length;
  //   const db = (b.relPath.match(/\//g) || []).length;
  //   if (db !== da) return db - da;
  //   return b.score - a.score;
  // });

  // // Remove parent if a child already exists in pruned list
  // const finalCandidates = [];
  // for (const cand of pruned) {
  //   const isParentOfExisting = finalCandidates.some(
  //     (x) => x.relPath.startsWith(cand.relPath + "/")
  //   );
  //   if (isParentOfExisting) continue;
  //   finalCandidates.push(cand);
  // }

  // const candidatesForLLM = finalCandidates.slice(0, candidateK);

  // 4) LLM decides final scopes (1-3)
  const { system, user } = buildRouterMessages({ question, candidates: scored });

  let llmText = "";
  try {
    llmText = await groqChat({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
    });

    const parsed = safeParseJson(llmText);

    let selectedScopes = Array.isArray(parsed.selectedScopes) ? parsed.selectedScopes : [];
    selectedScopes = selectedScopes
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);

    // enforce: must be from candidates and limit size
    const allowed = new Set(scored.map((x) => x.relPath));
    selectedScopes = selectedScopes.filter((s) => allowed.has(s)).slice(0, finalMaxScopes);

    // fallback if empty
    if (!selectedScopes.length) {
      selectedScopes = [scored[0]?.relPath || ""];
    }

    return {
      selectedScopes,
      candidates: scored,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      raw: llmText,
    };
  } catch (e) {
    // Fallback: just use top 1 from embedding scores
    return {
      selectedScopes: [scored[0]?.relPath || ""],
      candidates: scored,
      notes: `LLM routing failed, fallback to top-1 embedding scope. Error: ${e.message}`,
      raw: llmText,
    };
  }
}

module.exports = { selectScopes };
