/**
 * Split long text into overlapping chunks
 * @param {string} text
 * @param {object} options
 * @param {number} options.chunkSize - max characters per chunk
 * @param {number} options.chunkOverlap - overlapping characters
 * @returns {string[]}
 */
function chunkText(
  text,
  { chunkSize = 1200, chunkOverlap = 200 } = {}
) {
  if (!text || typeof text !== "string") return [];

  // Normalize whitespace
  const cleanText = text.replace(/\r/g, "").trim();
  if (!cleanText) return [];

  // First split by paragraphs
  const paragraphs = cleanText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length <= chunkSize) {
      current += (current ? "\n\n" : "") + p;
    } else {
      if (current) chunks.push(current);

      // Paragraph itself too big → hard split
      if (p.length > chunkSize) {
        let start = 0;
        while (start < p.length) {
          const end = start + chunkSize;
          chunks.push(p.slice(start, end));
          start += chunkSize - chunkOverlap;
        }
        current = "";
      } else {
        current = p;
      }
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

module.exports = { chunkText };
