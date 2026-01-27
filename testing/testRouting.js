require("dotenv").config();
const { selectScopes } = require("../src/routing/treeRouter");

(async () => {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.log('Usage: node testRouting.js "your question"');
    process.exit(0);
  }

  const result = await selectScopes(question, {
    candidateK: 8,
    finalMaxScopes: 3,
  });

  console.log("\nSelected scopes:");
  console.log(result.selectedScopes);

  console.log("\nTop candidates:");
  for (const c of result.candidates.slice(0, 8)) {
    console.log(`- ${c.relPath || "(root)"} score=${c.score.toFixed(4)}`);
  }

  console.log("\nNotes:", result.notes);
})();
