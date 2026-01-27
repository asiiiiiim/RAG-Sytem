const { ensureDbInitialized } = require("../db/mongo");
const { embedText } = require("../embeddings/embedder");

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

function isUnderAnyScope(folderRelPath, scopes) {
  if (!scopes || !scopes.length) return true;
  for (const s of scopes) {
    if (s === "") return true;
    if (folderRelPath === s) return true;
    if (folderRelPath.startsWith(s + "/")) return true;
  }
  return false;
}

async function retrieveTopK({ question, scopes, topK = 5, maxCandidates = 200 }) {
  const c = await ensureDbInitialized();

  const qVec = await embedText(question, { taskType: "search_query" });

  // fetch a limited set and score in JS (simple, works now)
  const all = await c.chunks
    .find({}, { projection: { docRelPath: 1, folderRelPath: 1, chunkIndex: 1, text: 1, embedding: 1 } })
    .limit(maxCandidates)
    .toArray();

  const filtered = all.filter((ch) => isUnderAnyScope(ch.folderRelPath || "", scopes));

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
