require("dotenv").config();

const { connectMongo, getDb } = require("../db/mongo");
const { splitText } = require("../utils/textSplitter");
const { embedText } = require("../embeddings/embedder");

const LIMIT = process.env.WEB_EMBED_LIMIT
  ? Number(process.env.WEB_EMBED_LIMIT)
  : null; // null = all pages
const CHUNK_SIZE = Number(process.env.WEB_EMBED_CHUNK_SIZE || 1200);
const CHUNK_OVERLAP = Number(process.env.WEB_EMBED_CHUNK_OVERLAP || 200);

(async () => {
  await connectMongo();
  const db = getDb();

  const pagesCol = db.collection("web_pages");
  const chunksCol = db.collection("web_chunks");

  // Get pages that have processedText (limit only if specified)
  let query = pagesCol.find({ processedText: { $exists: true, $ne: "" } });
  if (LIMIT) {
    query = query.limit(LIMIT);
  }
  const pages = await query.toArray();

  console.log(`Pages to embed: ${pages.length}`);

  for (const page of pages) {
    const url = page.url;
    const title = page.title || "";

    console.log(`\n=== Embedding: ${url} ===`);

    const chunks = splitText(page.processedText, {
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    console.log(`Text chunks: ${chunks.length}`);

    // Remove old chunks for this page to avoid duplicates
    await chunksCol.deleteMany({ url });

    for (let i = 0; i < chunks.length; i++) {
      console.log(`- Embedding chunk ${i + 1}/${chunks.length}`);

      const emb = await embedText(chunks[i], { taskType: "search_document" });

      await chunksCol.insertOne({
        url,
        title,
        chunkIndex: i,
        chunkText: chunks[i],
        embedding: emb,
        embeddingModel: "nomic-embed-text-v1.5",
        createdAt: new Date(),
      });
    }

    console.log(`✅ Stored ${chunks.length} chunks for ${url}`);
  }

  console.log("\n✅ W4 embedding done.");
  process.exit(0);
})();
