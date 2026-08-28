// Fetch bruto: baixa HTML das URLs com timeout agressivo, headers realistas,
// retry 1x em 5xx/timeout, sem retry em 4xx.
// Saída: data/raw/*.html (HTML bruto) + data/raw/index.json (status, tamanho, tempo)

const fs = require("fs");
const path = require("path");
const urls = require("./urls.js");

const OUT_DIR = path.join(__dirname, "data", "raw");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const TIMEOUT_MS = 10000;
const RETRY_ON_TIMEOUT = true;

fs.mkdirSync(OUT_DIR, { recursive: true });

const headers = {
  "User-Agent": "Mozilla/5.0 (compatible; CiteScoreBot/1.0; +https://citescore.local)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache"
};

async function fetchOnce(url) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
    clearTimeout(timer);
    const body = await res.text();
    return {
      status: res.status,
      finalUrl: res.url,
      contentType: res.headers.get("content-type") || "",
      bytes: body.length,
      ms: Date.now() - t0,
      html: body
    };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, error: err.name + ": " + err.message, ms: Date.now() - t0 };
  }
}

async function fetchWithRetry(url) {
  const first = await fetchOnce(url);
  if (first.status === 0 && first.error && /abort|timeout/i.test(first.error) && RETRY_ON_TIMEOUT) {
    console.log(`  retry após timeout...`);
    return await fetchOnce(url);
  }
  return first;
}

(async () => {
  const index = [];
  for (const u of urls) {
    console.log(`fetch ${u.id} → ${u.url}`);
    const r = await fetchWithRetry(u.url);
    const filename = `${u.id}.html`;
    if (r.html && r.status >= 200 && r.status < 400) {
      fs.writeFileSync(path.join(OUT_DIR, filename), r.html, "utf8");
    }
    index.push({
      id: u.id,
      url: u.url,
      lang: u.lang,
      type: u.type,
      description: u.description,
      fetch: {
        status: r.status,
        finalUrl: r.finalUrl,
        contentType: r.contentType,
        bytes: r.bytes || 0,
        ms: r.ms,
        error: r.error || null,
        file: r.html ? filename : null
      }
    });
    console.log(`  status=${r.status} bytes=${r.bytes || 0} time=${r.ms}ms`);
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  console.log(`\nindex → ${INDEX_PATH}`);
})();
