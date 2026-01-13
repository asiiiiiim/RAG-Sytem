/**
 * Split text into overlapping chunks.
 *
 * @param {string} text - full document text
 * @param {object} options
 * @param {number} options.chunkSize - approx chunk size in characters
 * @param {number} options.chunkOverlap - overlap in characters
 * @returns {string[]} array of chunks
 */
function splitText(text, { chunkSize = 1200, chunkOverlap = 200 } = {}) {
  if (!text || typeof text !== "string") return [];

  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  if (chunkOverlap >= chunkSize) {
    throw new Error("chunkOverlap must be smaller than chunkSize");
  }

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();

    if (chunk) chunks.push(chunk);

    if (end === cleaned.length) break; // ✅ stop at the end

    // Move forward but keep overlap
    start = start + (chunkSize - chunkOverlap); // ✅ always progresses
  }

  return chunks;
}

module.exports = { splitText };
