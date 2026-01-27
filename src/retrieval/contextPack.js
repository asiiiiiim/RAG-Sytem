function normalizeSnippet(text, maxLen = 600) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > maxLen ? t.slice(0, maxLen) + "..." : t;
}

function dedupeByDocChunk(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const key = `${r.docRelPath}::${r.chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Build a single string context and a structured sources list.
 * @param {Array} results - [{docRelPath, chunkIndex, score, text, group}]
 */
function buildContextPack(results) {
  const unique = dedupeByDocChunk(results);

  const sources = unique.map((r, i) => ({
    source: i + 1,
    docRelPath: r.docRelPath,
    chunkIndex: r.chunkIndex,
    score: Number(r.score.toFixed(4)),
    snippet: normalizeSnippet(r.text),
    group: r.group || "domain",
  }));

  const context = sources
    .map(
      (s) =>
        `Source ${s.source}\nPath: ${s.docRelPath}\nChunk: ${s.chunkIndex}\nContent:\n${unique[s.source - 1].text}\n`
    )
    .join("\n---\n");

  return { context, sources };
}

module.exports = { buildContextPack };
