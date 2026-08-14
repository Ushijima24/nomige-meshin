import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aliasesOf } from "./match.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "catalog.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** @type {{ slug: string, title: string, category: string, url: string }[]} */
let catalog = [];
try {
  catalog = JSON.parse(fs.readFileSync(seedPath, "utf8"));
} catch {
  catalog = [];
}

const rankingCache = new Map(); // slug -> { items, title, fetchedAt }
const CACHE_MS = 6 * 60 * 60 * 1000;

export function listCatalog() {
  return catalog;
}

export function getCatalogEntry(slug) {
  return catalog.find((c) => c.slug === slug) || null;
}

export function pickCandidates(excludeSlugs = [], avoidSlugs = [], n = 5) {
  const exclude = new Set(excludeSlugs);
  const avoid = new Set(avoidSlugs);
  const pool = catalog.filter((c) => !exclude.has(c.slug));
  const preferred = pool.filter((c) => !avoid.has(c.slug));
  const src = preferred.length >= n ? preferred : pool;
  const shuffled = [...src];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`取得失敗 (${res.status})`);
  return res.text();
}

function parseItems(html) {
  const items = [];
  const re =
    /<span class="font-bold text-xl mr-1">(\d+)<\/span>位<\/div><div class="grow truncate[^"]*">([^<]+)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const rank = Number(m[1]);
    const name = decodeHtml(m[2].trim());
    if (!rank || !name) continue;
    items.push({
      rank,
      name,
      aliases: aliasesOf(name).filter((a) => a !== name),
    });
  }
  return items;
}

function parseTitle(html, fallback) {
  const h2 = html.match(
    /<h2 class="text-xl font-bold text-center[^"]*">([^<]+)<\/h2>\s*<div class="mt-4" id="js-rank-list"/
  );
  if (h2) return decodeHtml(h2[1].trim());
  const og = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (og) return decodeHtml(og[1].trim());
  return fallback;
}

function decodeHtml(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function fetchRanking(slug) {
  const cached = rankingCache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;

  const entry = getCatalogEntry(slug);
  const items = [];
  let title = entry?.title || slug;
  for (let page = 1; page <= 8; page++) {
    const url =
      `https://ranking.net/rankings/${encodeURIComponent(slug)}` +
      (page > 1 ? `?page=${page}` : "");
    const html = await fetchText(url);
    if (page === 1) title = parseTitle(html, title) || title;
    const pageItems = parseItems(html);
    if (!pageItems.length) break;
    for (const it of pageItems) {
      if (!items.some((x) => x.rank === it.rank && x.name === it.name)) {
        items.push(it);
      }
    }
    if (pageItems.length < 20) break;
  }
  if (!items.length) throw new Error("このランキングから順位を取れませんでした");
  items.sort((a, b) => a.rank - b.rank);
  const data = { slug, title, items, fetchedAt: Date.now() };
  rankingCache.set(slug, data);
  return data;
}

export async function searchRankings(q) {
  const query = String(q || "").trim().slice(0, 40);
  if (!query) return [];
  const local = catalog.filter(
    (c) =>
      c.title.includes(query) ||
      (c.category && c.category.includes(query)) ||
      c.slug.includes(query.toLowerCase())
  );
  let remote = [];
  try {
    const url = `https://ranking.net/search?q=${encodeURIComponent(query)}`;
    const html = await fetchText(url);
    const re =
      /<h3 class="font-bold text-lg truncate"><a class="wrap-link" href="\/rankings\/([^"]+)">([^<]+)<\/a><\/h3>/g;
    let m;
    while ((m = re.exec(html))) {
      const slug = m[1];
      const title = decodeHtml(m[2].trim());
      remote.push({
        slug,
        title,
        category: "",
        url: `https://ranking.net/rankings/${slug}`,
      });
      if (!catalog.some((c) => c.slug === slug)) {
        catalog.push({
          slug,
          title,
          category: "",
          url: `https://ranking.net/rankings/${slug}`,
        });
      }
    }
  } catch {
    // ローカル候補だけ返す
  }
  const seen = new Set();
  const out = [];
  for (const c of [...remote, ...local]) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    out.push(c);
    if (out.length >= 12) break;
  }
  return out;
}
