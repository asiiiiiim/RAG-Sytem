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

async function shouldIncludeCommon(question, { commonRoot = "Common", threshold = 0.56 } = {}) {
  const c = await ensureDbInitialized();

  const commonNode = await c.tree_nodes.findOne(
    { nodeType: "folder", relPath: commonRoot, readmeEmbedding: { $exists: true, $type: "array" } },
    { projection: { relPath: 1, readmeEmbedding: 1, routingText: 1 } }
  );

  if (!commonNode) {
    return { include: false, reason: "No Common folder found." };
  }

  const qVec = await embedText(question, { taskType: "search_query" });
  const score = cosineSim(qVec, commonNode.readmeEmbedding);

  return {
    include: score >= threshold,
    score,
    commonScope: commonRoot,
    reason: score >= threshold ? "Common is semantically relevant." : "Common not relevant enough.",
  };
}

module.exports = { shouldIncludeCommon };
