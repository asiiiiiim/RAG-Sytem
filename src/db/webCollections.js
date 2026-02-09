const { getDb } = require("./mongo"); // you already have mongo init in your project

function webPagesCol() {
  return getDb().collection("web_pages");
}

module.exports = { webPagesCol };
