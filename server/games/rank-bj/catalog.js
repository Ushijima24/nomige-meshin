import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aliasesOf, normalize } from "./match.js";
import { warmupReadings, wikiKanaFromExtract, readingFits } from "./readings.js";
import { resolveOfficialNames, wikiNicknamesForNames } from "./wiki.js";

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

const rankingCache = new Map(); // slug -> { items, title, fetchedAt, ver }
const CACHE_MS = 6 * 60 * 60 * 1000;
const CACHE_VER = 2;

export function listCatalog() {
  return catalog;
}

export function getCatalogEntry(slug) {
  return catalog.find((c) => c.slug === slug) || null;
}

export function pickCandidates(excludeSlugs = [], avoidSlugs = [], n = 5) {
  const exclude = new Set(excludeSlugs);
  const avoid = new Set(avoidSlugs);
  const unused = catalog.filter((c) => !exclude.has(c.slug));
  const fresh = unused.filter((c) => !avoid.has(c.slug));
  const shuffle = (arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const picked = [];
  const seen = new Set();
  for (const c of shuffle(fresh)) {
    if (picked.length >= n) break;
    picked.push(c);
    seen.add(c.slug);
  }
  if (picked.length < n) {
    for (const c of shuffle(unused)) {
      if (picked.length >= n) break;
      if (seen.has(c.slug)) continue;
      picked.push(c);
    }
  }
  return picked;
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

async function enrichWikiReadings(items) {
  const kanjiNames = [
    ...new Set(
      items.filter((it) => /[\u4e00-\u9fff]/.test(it.name)).map((it) => it.name)
    ),
  ].slice(0, 80);
  if (!kanjiNames.length) return;
  const batches = [];
  for (let i = 0; i < kanjiNames.length; i += 40) {
    batches.push(kanjiNames.slice(i, i + 40));
  }
  const kanaByTitle = new Map();
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const url =
          "https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&redirects=1" +
          `&titles=${encodeURIComponent(batch.join("|"))}`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return;
        const data = await res.json();
        const pages = data?.query?.pages || {};
        const redirects = data?.query?.redirects || [];
        const normalized = data?.query?.normalized || [];
        const fromTo = new Map();
        for (const n of normalized) fromTo.set(n.to, n.from);
        for (const r of redirects) fromTo.set(r.to, fromTo.get(r.from) || r.from);
        for (const page of Object.values(pages)) {
          if (!page?.title || page.missing) continue;
          const kana = wikiKanaFromExtract(page.extract);
          if (!kana.length) continue;
          const original = fromTo.get(page.title) || page.title;
          kanaByTitle.set(page.title, kana);
          kanaByTitle.set(original, kana);
        }
      } catch {
        // 読みが取れなくてもローカル照合で拾う
      }
    })
  );
  try {
    const nickMap = await wikiNicknamesForNames(
      items.map((it) => it.name).slice(0, 40)
    );
    for (const it of items) {
      const extra = [
        ...(kanaByTitle.get(it.name) || []),
        ...(nickMap.get(it.name) || []),
      ];
      if (!extra.length) continue;
      const aliases = new Set(it.aliases || []);
      extra.forEach((k) => aliases.add(k));
      it.aliases = [...aliases];
    }
  } catch {
    for (const it of items) {
      const extra = kanaByTitle.get(it.name);
      if (!extra?.length) continue;
      const aliases = new Set(it.aliases || []);
      extra.forEach((k) => aliases.add(k));
      it.aliases = [...aliases];
    }
  }
}

export async function fetchRanking(slug) {
  const cached = rankingCache.get(slug);
  if (cached && cached.ver === CACHE_VER && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached;
  }

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
  await warmupReadings();
  await enrichWikiReadings(items);
  const data = { slug, title, items, fetchedAt: Date.now(), ver: CACHE_VER };
  rankingCache.set(slug, data);
  return data;
}

export async function searchRankings(q) {
  const query = String(q || "").trim().slice(0, 40);
  if (!query) return { hits: [], similar: [] };
  if (/[\u3040-\u30ff]/.test(query)) await warmupReadings();

  const remote = await searchRemote(query);
  const hitSlugs = new Set();
  const hits = [];
  const addHit = (c) => {
    if (!c?.slug || hitSlugs.has(c.slug)) return;
    hitSlugs.add(c.slug);
    hits.push({
      slug: c.slug,
      title: c.title,
      category: c.category || "",
      url: c.url || `https://ranking.net/rankings/${c.slug}`,
    });
  };
  remote.forEach(addHit);

  const scoreOne = (text) =>
    catalog.map((c) => {
      const r = scoreTopicQuery(text, c);
      return { c, score: r.score, hit: r.hit };
    });

  let scored = scoreOne(query);
  for (const x of scored.filter((x) => x.hit).sort((a, b) => b.score - a.score)) {
    addHit(x.c);
  }

  if (!hits.length) {
    try {
      const official = await resolveOfficialNames(query);
      for (const name of official.slice(0, 4)) {
        const extra = scoreOne(name);
        for (const x of extra.filter((x) => x.hit)) addHit(x.c);
        for (const x of extra) {
          const i = scored.findIndex((s) => s.c.slug === x.c.slug);
          if (i >= 0) scored[i].score = Math.max(scored[i].score, x.score);
          else scored.push(x);
        }
      }
      if (!hits.length && official[0] && normalize(official[0]) !== normalize(query)) {
        (await searchRemote(official[0])).forEach(addHit);
      }
    } catch {
      // 近い候補だけで返す
    }
  }

  const similar = scored
    .filter((x) => !hitSlugs.has(x.c.slug) && x.score >= 42)
    .sort((a, b) => b.score - a.score || (a.c.title || "").length - (b.c.title || "").length)
    .slice(0, 6)
    .map((x) => ({
      slug: x.c.slug,
      title: x.c.title,
      category: x.c.category || "",
      url: x.c.url || `https://ranking.net/rankings/${x.c.slug}`,
    }));

  return { hits: hits.slice(0, 12), similar };
}

function bigrams(s) {
  const g = new Set();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

function titleCore(title) {
  return String(title || "")
    .replace(/["“”『』「」]/g, "")
    .replace(/ランキング$/g, "")
    .replace(/で思い浮かぶものは？$/g, "")
    .replace(/^全国の/, "")
    .trim();
}

function kanaQueryFitsTitle(title, query) {
  const q = normalize(query);
  if (q.length < 2 || !/^[\u3040-\u309f]+$/.test(q)) return "none";
  const core = titleCore(title);
  if (readingFits(core, query)) return "core";
  for (let i = 0; i < core.length; i++) {
    if (!/[\u4e00-\u9fff]/.test(core[i])) continue;
    for (let len = 2; len <= 8 && i + len <= core.length; len++) {
      const chunk = core.slice(i, i + len);
      if (!/[\u4e00-\u9fff]/.test(chunk[chunk.length - 1])) break;
      if (readingFits(chunk, query)) return "part";
    }
    if (q.length >= 3 && readingFits(core[i], query)) return "part";
  }
  return "none";
}

function scoreTopicQuery(query, entry) {
  const q = normalize(query);
  if (!q) return { score: 0, hit: false };
  const title = normalize(entry.title || "");
  const core = normalize(titleCore(entry.title || ""));
  const cat = normalize(entry.category || "");
  const slug = normalize((entry.slug || "").replace(/-/g, ""));
  let score = 0;
  let hit = false;

  if (title === q || core === q || slug === q) {
    return { score: 100, hit: true };
  }
  if (q.length >= 2 && (title.includes(q) || core.includes(q) || slug.includes(q))) {
    hit = true;
    score = Math.max(score, 82 + Math.min(q.length, 12));
  }
  if (q.length >= 2 && cat.includes(q)) {
    hit = true;
    score = Math.max(score, 70);
  }
  const kanaFit = kanaQueryFitsTitle(entry.title || "", query);
  if (kanaFit === "core") {
    hit = true;
    score = Math.max(score, 92);
  } else if (kanaFit === "part") {
    hit = true;
    score = Math.max(score, 80);
  }
  if (q.length >= 2 && title.length >= 2) {
    score = Math.max(score, Math.round(dice(bigrams(q), bigrams(title)) * 78));
    if (core.length >= 2) {
      score = Math.max(score, Math.round(dice(bigrams(q), bigrams(core)) * 78));
    }
  }
  if (q.length >= 2 && cat.length >= 2) {
    score = Math.max(score, Math.round(dice(bigrams(q), bigrams(cat)) * 52));
  }
  return { score, hit };
}

async function searchRemote(query) {
  const remote = [];
  try {
    const url = `https://ranking.net/search?q=${encodeURIComponent(query)}`;
    const html = await fetchText(url);
    const re =
      /<h3 class="font-bold text-lg truncate"><a class="wrap-link" href="\/rankings\/([^"]+)">([^<]+)<\/a><\/h3>/g;
    let m;
    while ((m = re.exec(html))) {
      const slug = m[1];
      const title = decodeHtml(m[2].trim());
      const row = {
        slug,
        title,
        category: "",
        url: `https://ranking.net/rankings/${slug}`,
      };
      remote.push(row);
      if (!catalog.some((c) => c.slug === slug)) catalog.push(row);
      if (remote.length >= 12) break;
    }
  } catch {
    // ローカル候補だけ返す
  }
  return remote;
}
