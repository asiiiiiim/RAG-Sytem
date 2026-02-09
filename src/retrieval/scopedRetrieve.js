const { ensureDbInitialized } = require("../db/mongo");
const { embedText } = require("../embeddings/embedder");

function cosineSim(a, b) {
  // Validate embeddings exist and have compatible dimensions
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) {
    return 0;
  }

  if (a.length !== b.length) {
    console.warn(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
    return 0;
  }

  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function isUnderAnyScope(folderRelPath, scopes) {
  // If no scopes provided or empty array, don't match everything - be strict
  if (!scopes || !scopes.length) return false;

  for (const s of scopes) {
    // Only match root scope if explicitly passed
    if (s === "") return true;
    if (folderRelPath === s) return true;
    if (folderRelPath.startsWith(s + "/")) return true;
  }
  return false;
}

async function retrieveTopK({
  question,
  scopes,
  topK = 5,
  maxCandidates = 200,
}) {
  const c = await ensureDbInitialized();

  const qVec = await embedText(question, { taskType: "search_query" });

  if (!qVec || !Array.isArray(qVec)) {
    throw new Error(`Failed to embed question: received invalid embedding`);
  }

  // fetch a limited set and score in JS (simple, works now)
  const all = await c.chunks
    .find(
      {},
      {
        projection: {
          docRelPath: 1,
          folderRelPath: 1,
          chunkIndex: 1,
          text: 1,
          embedding: 1,
        },
      },
    )
    .limit(maxCandidates)
    .toArray();

  const filtered = all.filter((ch) =>
    isUnderAnyScope(ch.folderRelPath || "", scopes),
  );

  const scored = filtered
    .map((ch) => ({
      docRelPath: ch.docRelPath,
      folderRelPath: ch.folderRelPath,
      chunkIndex: ch.chunkIndex,
      text: ch.text,
      score: cosineSim(qVec, ch.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

module.exports = { retrieveTopK };
