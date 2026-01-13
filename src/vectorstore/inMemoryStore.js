const { cosineSimilarity } = require("./cosine");

class InMemoryVectorStore {
  constructor() {
    this.items = []; 
    // each item: { id, text, embedding, metadata }
  }

  add({ id, text, embedding, metadata }) {
    this.items.push({ id, text, embedding, metadata });
  }

  addMany(docs) {
    for (const doc of docs) this.add(doc);
  }

  /**
   * Search topK most similar vectors
   * @param {number[]} queryEmbedding
   * @param {number} topK
   * @param {(metadata: any) => boolean} filterFn optional
   */
  similaritySearch(queryEmbedding, topK = 5, filterFn = null) {
    const scored = [];

    for (const item of this.items) {
      if (filterFn && !filterFn(item.metadata)) continue;

      const score = cosineSimilarity(queryEmbedding, item.embedding);
      scored.push({ ...item, score });
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }
}

module.exports = { InMemoryVectorStore };
