/** 愛称・略称を Wikipedia で正式名に寄せる */

const UA =
  "NomigeParty/1.0 (https://nomige-meshin.onrender.com; rank-bj nickname lookup)";

const cache = new Map();
const nickCache = new Map();
const CACHE_MS = 30 * 60 * 1000;

const INFOBOX_NICK_KEYS = "愛称|別名|別名義|ニックネーム|通称|呼称";
const SOCIAL_TEMPLATES = new Set(
  [
    "twitter",
    "x",
    "instagram",
    "tiktok",
    "youtube",
    "youtubechannel",
    "threads",
    "facebook",
    "official",
    "officialwebsite",
  ].map((s) => s.toLowerCase())
);

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

function isNoiseNick(t) {
  return /株式会社|公式プロフィール|オフィシャル|Co\.|Ltd\.|Inc\.|ASOBISYSTEM|talent/i.test(
    t
  );
}

function addNick(out, raw) {
  const s = String(raw || "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (!s) return;
  const bits = s.split(/[、,／/・•|]/);
  for (const bit of bits) {
    const t = bit
      .replace(/[（(][^）)]*[）)]/g, " ")
      .replace(/\s*[-–—]\s*(TikTok|YouTube|Instagram|Twitter|X|公式|チャンネル).*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (t.length >= 2 && t.length <= 40 && !/^https?:/i.test(t) && !isNoiseNick(t)) {
      out.add(t);
    }
    const m = t.match(/^([\u3040-\u30ff\u4e00-\u9fffA-Za-z0-9]{2,12})の/);
    if (m && /[\u3040-\u30ff]/.test(m[1])) out.add(m[1]);
  }
}

function nickFromTemplateArgs(kind, body) {
  if (!SOCIAL_TEMPLATES.has(kind.replace(/\s+/g, "").toLowerCase())) return [];
  const parts = String(body || "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  const labels = [];
  for (const p of parts) {
    const val = p.includes("=") ? p.slice(p.indexOf("=") + 1).trim() : p;
    if (!val || /^https?:/i.test(val)) continue;
    if (/^(channel|user|id|1)$/i.test(val) && !/[\u3040-\u9fff]/.test(val)) continue;
    if (/^[A-Za-z0-9._\-]{3,40}$/.test(val) && !/[\u3040-\u9fff]/.test(val)) continue;
    labels.push(val);
  }
  return labels;
}

export function nicknamesFromWikitext(wikitext) {
  const out = new Set();
  const wt = String(wikitext || "");
  const infoRe = new RegExp(`^\\|\\s*(?:${INFOBOX_NICK_KEYS})\\s*=\\s*(.+)$`, "gim");
  let m;
  while ((m = infoRe.exec(wt))) addNick(out, m[1]);

  const ext = [
    wt.split(/==\s*外部リンク\s*==/i)[1]?.split(/^==/m)[0] || "",
    wt.split(/==\s*関連リンク\s*==/i)[1]?.split(/^==/m)[0] || "",
  ].join("\n");

  const tplRe = /\{\{\s*([A-Za-z][A-Za-z0-9 _-]*)\s*\|([^}]*)\}\}/g;
  while ((m = tplRe.exec(ext))) {
    for (const label of nickFromTemplateArgs(m[1], m[2])) addNick(out, label);
  }
  const linkRe = /\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g;
  while ((m = linkRe.exec(ext))) addNick(out, m[1]);

  return [...out].filter((n) => n.length >= 2 && n.length <= 40);
}

function mapRedirects(data) {
  const fromTo = new Map();
  for (const n of data?.query?.normalized || []) fromTo.set(n.to, n.from);
  for (const r of data?.query?.redirects || []) {
    fromTo.set(r.to, fromTo.get(r.from) || r.from);
  }
  return fromTo;
}

async function fetchWikitextBatch(titles) {
  const uniq = [
    ...new Set(
      titles.flatMap((t) => [t, String(t).replace(/\s+/g, "")]).filter(Boolean)
    ),
  ].slice(0, 10);
  if (!uniq.length) return new Map();
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&redirects=1" +
    `&titles=${encodeURIComponent(uniq.join("|"))}`;
  const data = await fetchJson(url, 4000);
  const out = new Map();
  if (!data?.query?.pages) return out;
  const fromTo = mapRedirects(data);
  for (const page of Object.values(data.query.pages)) {
    if (!page?.title || page.missing) continue;
    const wt = page.revisions?.[0]?.slots?.main?.["*"] || page.revisions?.[0]?.["*"] || "";
    if (!wt) continue;
    const nicks = nicknamesFromWikitext(wt);
    const original = fromTo.get(page.title) || page.title;
    out.set(page.title, nicks);
    out.set(original, nicks);
    out.set(cleanTitle(page.title), nicks);
    out.set(cleanTitle(original), nicks);
  }
  return out;
}

/** 項目名 → Wikipediaの愛称・外部リンク表記 */
export async function wikiNicknamesForNames(names) {
  const want = [...new Set((names || []).map((n) => String(n || "").trim()).filter((n) => n.length >= 2))];
  const result = new Map();
  const missing = [];
  const now = Date.now();
  for (const name of want) {
    const hit = nickCache.get(name);
    if (hit && now - hit.at < CACHE_MS) result.set(name, hit.aliases);
    else missing.push(name);
  }
  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    try {
      const found = await fetchWikitextBatch(batch);
      for (const name of batch) {
        const aliases =
          found.get(name) ||
          found.get(cleanTitle(name)) ||
          found.get(name.replace(/[（(][^）)]+[）)]/g, "").trim()) ||
          [];
        nickCache.set(name, { at: Date.now(), aliases });
        result.set(name, aliases);
      }
    } catch {
      for (const name of batch) {
        nickCache.set(name, { at: Date.now(), aliases: [] });
        result.set(name, []);
      }
    }
  }
  return result;
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

