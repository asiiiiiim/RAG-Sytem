async function autoScroll(page, maxRounds = 10) {
  for (let i = 0; i < maxRounds; i++) {
    const prev = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const next = await page.evaluate(() => document.body.scrollHeight);
    if (next === prev) break;
  }
}

async function clickAll(page, selectors, maxClicks = 50) {
  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count().catch(() => 0);
    const limit = Math.min(count, maxClicks);

    for (let i = 0; i < limit; i++) {
      try {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) {
          await el.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(250);
        }
      } catch {
        // ignore
      }
    }
  }
}

async function preparePage(page) {
  // Give JS time to render
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);

  // Scroll to trigger lazy loading
  await autoScroll(page, 12);

  // Expand accordions / tabs / load more (best effort, generic)
  // For broker sites, only remove script/style, not structural elements
  await clickAll(page, [
    '[aria-expanded="false"]',
    'button:has-text("Show more")',
    'button:has-text("Load more")',
    'a:has-text("Load more")',
    'button:has-text("More")',
  ]);

  // Click tabs (generic role-based)
  await clickAll(page, ['[role="tab"]', ".tab", ".tabs a"], 30);

  // Scroll again after expansions
  await autoScroll(page, 6);
}

function tableToMarkdown(table) {
  // table = { headers: [], rows: [ [] ] }
  const headers = table.headers.length
    ? table.headers
    : table.rows[0]?.map((_, i) => `col${i + 1}`) || [];
  const lines = [];
  if (headers.length) {
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  }
  for (const row of table.rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

async function extractStructuredText(page) {
  // Extract headings, paragraphs, lists, and tables in DOM order (simplified)
  // We'll do it in-page for speed and to avoid heavy HTML processing.
  const data = await page.evaluate(() => {
    function clean(s) {
      return (s || "").replace(/\s+/g, " ").trim();
    }

    // For broker sites, only remove script/style tags and obvious boilerplate
    // DO NOT remove nav/header/footer as they may contain critical info
    const killSelectors = [
      "script",
      "style",
      "noscript",
      ".advertisement",
      ".ads",
    ];
    for (const sel of killSelectors) {
      document.querySelectorAll(sel).forEach((n) => n.remove());
    }

    // Gather content blocks
    const blocks = [];

    // Headings + paragraphs + list items + nav items
    const contentSelector = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,nav,header,footer";
    document.querySelectorAll(contentSelector).forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const txt = clean(el.innerText);
      if (!txt) return;
      blocks.push({ type: tag, text: txt });
    });

    // Tables
    const tables = [];
    document.querySelectorAll("table").forEach((t) => {
      const headers = Array.from(t.querySelectorAll("thead th"))
        .map((th) => clean(th.innerText))
        .filter(Boolean);
      const rows = Array.from(t.querySelectorAll("tbody tr"))
        .map((tr) =>
          Array.from(tr.querySelectorAll("td,th")).map((td) =>
            clean(td.innerText),
          ),
        )
        .filter((r) => r.length && r.some(Boolean));
      if (rows.length) tables.push({ headers, rows });
    });

    const title = clean(document.title);

    return { title, blocks, tables };
  });

  const out = [];

  // Blocks to pseudo-markdown
  for (const b of data.blocks) {
    if (b.type.startsWith("h")) {
      const level = Number(b.type.slice(1)) || 2;
      out.push(`${"#".repeat(Math.min(level, 6))} ${b.text}`);
    } else if (b.type === "li") {
      out.push(`- ${b.text}`);
    } else if (b.type === "dt") {
      out.push(`**${b.text}**`);
    } else if (b.type === "dd") {
      out.push(`  - ${b.text}`);
    } else {
      out.push(b.text);
    }
  }

  // Tables
  if (data.tables?.length) {
    out.push("\n## Tables\n");
    for (let i = 0; i < data.tables.length; i++) {
      out.push(`### Table ${i + 1}`);
      out.push(tableToMarkdown(data.tables[i]));
      out.push(""); // spacing
    }
  }

  return { title: data.title || "", extractedText: out.join("\n") };
}

async function extractRawText(page) {
  return await page.evaluate(() =>
    document.body && document.body.innerText ? document.body.innerText : "",
  );
}

async function extractPageText(page) {
  await preparePage(page);

  const { title, extractedText } = await extractStructuredText(page);
  const rawText = await extractRawText(page);

  // Improved fallback logic: append raw text if structured is too small or incomplete
  const structuredLen = extractedText.length;
  const rawLen = rawText.length;

  let finalExtracted = extractedText;
  // Append raw text if:
  // 1) Raw text is significantly larger, OR
  // 2) Structured text is less than 1000 chars (likely incomplete), OR
  // 3) Structured text is less than 30% of raw text
  if (
    rawLen > 0 &&
    (rawLen > structuredLen * 1.5 ||
      structuredLen < 1000 ||
      structuredLen < rawLen * 0.3)
  ) {
    finalExtracted += `\n\n---\n\nFull Page Text:\n${rawText.slice(0, 200000)}`; // cap to avoid huge docs
  }

  return {
    title,
    extractedText: finalExtracted,
    rawText: rawText.slice(0, 200000), // store capped raw text as backup
  };
}

module.exports = { extractPageText };
