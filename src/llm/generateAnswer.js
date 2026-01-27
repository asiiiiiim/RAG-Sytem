const { groqChat } = require("./groqClient");
const { buildAnswerMessages } = require("./answerPrompt");

async function generateGroundedAnswer({ question, context }) {
  const { system, user } = buildAnswerMessages({ question, context });

  const text = await groqChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
  });

  return text.trim();
}

module.exports = { generateGroundedAnswer };
