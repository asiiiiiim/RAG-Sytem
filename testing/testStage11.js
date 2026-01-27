require("dotenv").config();
const { retrieveWithRouting } = require("../src/retrieval/retrievePipeline");
const { generateGroundedAnswer } = require("../src/llm/generateAnswer");

(async () => {
  const question =
    "What is the purpose of the Functional Specifications Document (FSD)?";

  const out = await retrieveWithRouting({ question });
  const answer = await generateGroundedAnswer({
    question,
    context: out.context,
  });

  console.log("\n=== Answer ===\n");
  console.log(answer);

  console.log("\n=== Sources ===\n");
  console.log(out.sources);
})();
