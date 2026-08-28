// Extrator com @extractus/article-extractor.
// Entrada: data/raw/*.html + data/raw/index.json
// Saída: data/extracted/article-extractor/<id>.json

const fs = require("fs");
const path = require("path");

const RAW_DIR = path.join(__dirname, "data", "raw");
const OUT_DIR = path.join(__dirname, "data", "extracted", "article-extractor");
const INDEX = JSON.parse(fs.readFileSync(path.join(RAW_DIR, "index.json"), "utf8"));

fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const { extract } = require("@extractus/article-extractor");
  for (const entry of INDEX) {
    if (!entry.fetch.file) {
      fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify({ id: entry.id, error: "no_html_fetched", fetchStatus: entry.fetch.status }, null, 2));
      console.log(`${entry.id} → SKIP (sem HTML, status ${entry.fetch.status})`);
      continue;
    }
    const htmlPath = path.join(OUT_DIR, "..", "..", "raw", entry.fetch.file);
    if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size === 0) {
      fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify({ id: entry.id, error: "empty_or_missing_file" }, null, 2));
      console.log(`${entry.id} → EMPTY/MISSING`);
      continue;
    }
    const html = fs.readFileSync(htmlPath, "utf8");
    const t0 = Date.now();
    let article = null;
    let articleErr = null;
    try {
      article = await extract(entry.fetch.finalUrl || entry.url, { html });
    } catch (err) {
      articleErr = err.message;
    }
    if (!article) {
      try {
        article = await extract(html);
      } catch (err2) {
        if (!articleErr) articleErr = err2.message;
      }
    }
    const parseMs = Date.now() - t0;
    if (!article) {
      fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify({
        id: entry.id, parseMs, error: articleErr || "extract_returned_null"
      }, null, 2));
      console.log(`${entry.id} → NULL (${parseMs}ms)`);
      continue;
    }
    const text = article.content || "";
    const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const linksCount = (text.match(/<a\s+[^>]*href/gi) || []).length;
    const headingsCount = (text.match(/<h[1-6]\b/gi) || []).length;
    const result = {
      id: entry.id,
      parseMs,
      title: article.title || null,
      description: article.description || null,
      lang: article.lang || null,
      author: article.author || null,
      image: article.image || null,
      textLength: stripped.length,
      wordCount: stripped.split(/\s+/).filter(Boolean).length,
      linksCount,
      headingsCount,
      firstChars: stripped.slice(0, 400)
    };
    fs.writeFileSync(path.join(OUT_DIR, `${entry.id}.json`), JSON.stringify(result, null, 2));
    console.log(`${entry.id} → ${result.textLength} chars / ${result.wordCount} words / ${parseMs}ms`);
  }
})();
