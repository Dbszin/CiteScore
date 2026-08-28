// Extrator com @mozilla/readability + jsdom.
// Entrada: data/raw/*.html + data/raw/index.json
// Saída: data/extracted/readability/<id>.json
//         { id, title, lang, byline, excerpt, textContent, textLength, linksCount, headingsCount, parseMs, error? }

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { Readability, isProbablyReaderable } = require("@mozilla/readability");

const RAW_DIR = path.join(__dirname, "data", "raw");
const OUT_DIR = path.join(__dirname, "data", "extracted", "readability");
const INDEX = JSON.parse(fs.readFileSync(path.join(RAW_DIR, "index.json"), "utf8"));

fs.mkdirSync(OUT_DIR, { recursive: true });

const CHAR_THRESHOLD = 100;

for (const entry of INDEX) {
  if (!entry.fetch.file) {
    fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify({ id: entry.id, error: "no_html_fetched", fetchStatus: entry.fetch.status }, null, 2));
    console.log(`${entry.id} → SKIP (sem HTML, status ${entry.fetch.status})`);
    continue;
  }
  const htmlPath = path.join(RAW_DIR, entry.fetch.file);
  if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size === 0) {
    fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify({ id: entry.id, error: "empty_or_missing_file" }, null, 2));
    console.log(`${entry.id} → EMPTY/MISSING`);
    continue;
  }
  const html = fs.readFileSync(htmlPath, "utf8");
  const t0 = Date.now();
  try {
    const dom = new JSDOM(html, { url: entry.fetch.finalUrl || entry.url });
    const doc = dom.window.document;
    const readerable = isProbablyReaderable(doc);
    const reader = new Readability(doc, { charThreshold: CHAR_THRESHOLD });
    const article = reader.parse();
    const parseMs = Date.now() - t0;
    if (!article) {
      fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify({
        id: entry.id, readerable, parseMs, error: "readability_returned_null"
      }, null, 2));
      console.log(`${entry.id} → null (${parseMs}ms)`);
      continue;
    }
    // Contagem de links e headings preservados no HTML extraído
    const outDom = new JSDOM(article.content || "");
    const outDoc = outDom.window.document;
    const linksCount = outDoc.querySelectorAll("a[href]").length;
    const headingsCount = outDoc.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
    const text = article.textContent || "";
    const result = {
      id: entry.id,
      readerable,
      parseMs,
      title: article.title || null,
      byline: article.byline || null,
      lang: article.lang || null,
      excerpt: article.excerpt || null,
      siteName: article.siteName || null,
      publishedTime: article.publishedTime || null,
      textLength: text.length,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      linksCount,
      headingsCount,
      firstChars: text.slice(0, 400)
    };
    fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify(result, null, 2));
    console.log(`${entry.id} → ${result.textLength} chars / ${result.wordCount} words / ${parseMs}ms`);
  } catch (err) {
    fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify({
      id: entry.id, parseMs: Date.now() - t0, error: err.message
    }, null, 2));
    console.log(`${entry.id} → ERROR ${err.message}`);
  }
}
