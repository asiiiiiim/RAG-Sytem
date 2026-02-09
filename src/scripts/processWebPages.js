// src/scripts/processWebPages.js
require("dotenv").config();
const { connectMongo, getDb } = require("../db/mongo");
const { splitText } = require("../utils/textSplitter");
const { processChunkWithLLM } = require("../web/ingest/processPageWithLLM");
const { embedText } = require("../embeddings/embedder");

const CHUNK_SIZE = Number(process.env.WEB_LLM_CHUNK_SIZE || 4500);
const CHUNK_OVERLAP = Number(process.env.WEB_LLM_CHUNK_OVERLAP || 200);

const LIMIT = Number(process.env.WEB_PROCESS_LIMIT || 500000);
const MIN_EXTRACTED = Number(process.env.WEB_MIN_EXTRACTED || 0);
const MIN_PROCESSED = Number(process.env.WEB_MIN_PROCESSED || 0);
const FORCE = String(process.env.WEB_FORCE_REPROCESS || "0") === "1";

(async () => {
  await connectMongo();
  const db = getDb();
  const col = db.collection("web_pages");

  // // fetch pages that have extractedText and no processedText yet
  // // this process cannot be used because mongo does not supprt $expr inside find()
  // const filter = FORCE
  //   ? { extractedText: { $exists: true, $ne: "" } }
  //   : {
  //       extractedText: { $exists: true, $ne: "" },
  //       $or: [
  //         { processedText: { $exists: false } },
  //         { processedText: null },
  //         { processedText: "" },
  //         {
  //           processedText: {
  //             $type: "string",
  //             $expr: { $lt: [{ $strLenCP: "$processedText" }, MIN_PROCESSED] },
  //           },
  //         }, // may not work on all Mongo versions
  //       ],
  //     };

  // const pages = await col.find(filter).limit(LIMIT).toArray();

  const POOL = Math.max(LIMIT * 50, 200);

  const pagesRaw = await col
    .find({ extractedText: { $exists: true, $ne: "" } })
    .limit(POOL)
    .toArray();

  const eligible = pagesRaw.filter((p) => {
    const exLen = (p.extractedText || "").length;
    const prLen = (p.processedText || "").length;

    if (exLen < MIN_EXTRACTED) return false;

    if (FORCE) return true;

    return prLen < MIN_PROCESSED;
  });

  // prioritize richest pages first
  eligible.sort(
    (a, b) => (b.extractedText?.length || 0) - (a.extractedText?.length || 0),
  );

  const pages = eligible.slice(0, LIMIT);

  console.log(`Candidates in pool: ${pagesRaw.length}`);
  console.log(`Eligible after filter: ${eligible.length}`);
  console.log(`Pages to process: ${pages.length}`);
  if (pages[0])
    console.log(
      "First selected:",
      pages[0].url,
      "exLen=",
      pages[0].extractedText.length,
    );

  for (const page of pages) {
    const exLen = page.extractedText.length;
    if (exLen < MIN_EXTRACTED) {
      console.log(`⚠️ Skip (extracted too short: ${exLen}) ${page.url}`);
      continue;
    }

    console.log(`\n=== Processing: ${page.url} ===`);

    const chunks = splitText(page.extractedText, {
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    console.log(`LLM chunks: ${chunks.length}`);

    const processedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`- LLM chunk ${i + 1}/${chunks.length}`);
      const processed = await processChunkWithLLM({
        title: page.title,
        url: page.url,
        chunkText: chunks[i],
      });
      processedChunks.push(processed);
    }

    const processedText = processedChunks.join("\n\n---\n\n");

    await col.updateOne(
      { _id: page._id },
      {
        $set: {
          processedText,
          processedAt: new Date(),
          processModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
          processStats: {
            llmChunks: chunks.length,
            inChars: page.extractedText.length,
            outChars: processedText.length,
          },
        },
      },
    );

    console.log(`✅ Saved processedText (${processedText.length} chars)`);

    // ✅ CRITICAL: Store processed chunks in RAG collection for retrieval
    const chunksCol = db.collection("chunks");
    const webChunks = [];

    // Split processedText into manageable chunks for embedding
    const ragChunks = splitText(processedText, {
      chunkSize: 800,
      chunkOverlap: 100,
    });

    for (let i = 0; i < ragChunks.length; i++) {
      const chunkText = ragChunks[i];

      // Embed the chunk for vector search
      const embedding = await embedText(chunkText, {
        taskType: "search_document",
      });

      webChunks.push({
        docRelPath: `web_pages/${page.url}`,
        folderRelPath: "web_pages",
        chunkIndex: i,
        text: chunkText,
        embedding,
        source: "web",
        url: page.url,
        title: page.title,
        sourcePageId: page._id,
        storedAt: new Date(),
      });
    }

    // Bulk insert into chunks collection
    if (webChunks.length > 0) {
      await chunksCol.insertMany(webChunks).catch((err) => {
        // Handle duplicates gracefully
        if (err.code === 11000) {
          console.log(`⚠️ Some chunks already exist for ${page.url}`);
        } else {
          throw err;
        }
      });
      console.log(`✅ Stored ${webChunks.length} RAG chunks for retrieval`);
    }
  }

  console.log("\n✅ W3 processing done.");
  process.exit(0);
})();
