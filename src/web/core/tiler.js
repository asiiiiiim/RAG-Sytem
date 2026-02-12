
function computeTiles({ pageHeight, viewportHeight, overlapRatio = 0.2 }) {
  const overlap = Math.floor(viewportHeight * overlapRatio);
  const step = Math.max(1, viewportHeight - overlap);

  const tiles = [];
  let y = 0;
  let i = 0;

  while (y < pageHeight) {
    const remaining = pageHeight - y;
    const h = Math.min(viewportHeight, remaining);
    tiles.push({ index: i++, y, height: h });
    if (y + viewportHeight >= pageHeight) break;
    y += step;
  }
  return tiles;
}

module.exports = { computeTiles };
