/** 愛称・略称を Wikipedia で正式名に寄せる */

const UA =
  "NomigeParty/1.0 (https://nomige-meshin.onrender.com; rank-bj nickname lookup)";

const cache = new Map();
const CACHE_MS = 30 * 60 * 1000;

function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

function nameFromExtract(extract) {
  const text = String(extract || "").trim();
  const m = text.match(/^(.{2,40}?)[（(]/);
  if (!m) return "";
  return cleanTitle(m[1]);
}

async function fetchJson(url, ms = 1400) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function opensearch(q, names) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=opensearch&limit=6&namespace=0&format=json" +
    `&search=${encodeURIComponent(q)}`;
  const data = await fetchJson(url);
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  for (const t of titles) {
    const n = cleanTitle(t);
    if (n.length >= 2) names.add(n);
  }
  return titles.slice(0, 3).map(cleanTitle).filter(Boolean);
}

async function wikiSearch(q, names) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=6" +
    `&srsearch=${encodeURIComponent(q)}`;
  const data = await fetchJson(url);
  const hits = data?.query?.search || [];
  for (const h of hits) {
    const n = cleanTitle(h.title);
    if (n.length >= 2) names.add(n);
  }
}

async function followRedirect(q, names) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&redirects=1" +
    `&titles=${encodeURIComponent(q)}`;
  const data = await fetchJson(url);
  const pages = data?.query?.pages || {};
  for (const page of Object.values(pages)) {
    if (!page?.title || page.missing) continue;
    const n = cleanTitle(page.title);
    if (n.length >= 2) names.add(n);
  }
}

async function addExtractNames(titles, names) {
  const uniq = [...new Set(titles.filter(Boolean))].slice(0, 3);
  if (!uniq.length) return;
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&redirects=1" +
    `&titles=${encodeURIComponent(uniq.join("|"))}`;
  const data = await fetchJson(url);
  const pages = data?.query?.pages || {};
  for (const page of Object.values(pages)) {
    const fromTitle = cleanTitle(page.title);
    if (fromTitle.length >= 2) names.add(fromTitle);
    const fromEx = nameFromExtract(page.extract);
    if (fromEx.length >= 2) names.add(fromEx);
  }
}

/** @returns {Promise<string[]>} 正式名候補 */
export async function resolveOfficialNames(query) {
  const q = String(query || "").trim().slice(0, 40);
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.names;

  const names = new Set();
  try {
    const openTop = await opensearch(q, names);
    await Promise.all([wikiSearch(q, names), followRedirect(q, names)]);
    await addExtractNames(openTop, names);
  } catch {
    // 取れなくてもローカル判定に戻る
  }

  const list = [...names].filter((n) => n && n !== q && n.length <= 40);
  cache.set(key, { at: Date.now(), names: list });
  return list;
}
