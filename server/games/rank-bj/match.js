/** 名前のゆらぎを潰して部分一致判定する */

const HIRA_START = 0x3041;

export function toHiragana(s) {
  return String(s || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

export function normalize(s) {
  return toHiragana(
    String(s || "")
      .normalize("NFKC")
      .replace(/[ー−–—ｰ~〜・･.\s\u3000'"「」『』【】\[\]()（）]/g, "")
      .toLowerCase()
  );
}

export function aliasesOf(name) {
  const raw = String(name || "").trim();
  const out = new Set([raw]);
  const inner = [...raw.matchAll(/[（(]([^）)]+)[）)]/g)].map((m) => m[1].trim());
  inner.forEach((x) => out.add(x));
  const stripped = raw.replace(/[（(][^）)]+[）)]/g, "").trim();
  if (stripped) out.add(stripped);
  stripped.split(/[／/・･]/).forEach((p) => {
    const t = p.trim();
    if (t) out.add(t);
  });
  return [...out].filter(Boolean);
}

function namesFor(item) {
  const list = [item.name, ...(item.aliases || [])];
  aliasesOf(item.name).forEach((a) => list.push(a));
  return [...new Set(list.filter(Boolean))];
}

function scoreMatch(query, item) {
  const q = normalize(query);
  if (!q) return 0;
  let best = 0;
  for (const n of namesFor(item)) {
    const nn = normalize(n);
    if (!nn) continue;
    if (nn === q) best = Math.max(best, 100 + Math.min(nn.length, 20));
    else if (q.length >= 2 && nn.includes(q))
      best = Math.max(best, 60 + q.length * 2);
    else if (nn.length >= 2 && q.includes(nn))
      best = Math.max(best, 50 + nn.length);
  }
  return best;
}

export function suggestCandidates(query, items, limit = 15) {
  const q = String(query || "").trim();
  if (!q || !items?.length) return [];
  const qn = normalize(q);
  const ranked = items
    .map((item) => {
      let score = scoreMatch(q, item);
      if (!score) {
        for (const n of namesFor(item)) {
          const nn = normalize(n);
          if (!nn) continue;
          if (nn.startsWith(qn) || (qn.length >= 2 && qn.startsWith(nn))) {
            score = Math.max(score, 40);
          }
          if (qn.length >= 2) {
            for (let i = 0; i <= qn.length - 2; i++) {
              if (nn.includes(qn.slice(i, i + 2))) {
                score = Math.max(score, i === 0 ? 28 : 18);
              }
            }
          }
          if (qn[0] && nn.includes(qn[0])) score = Math.max(score, 8);
        }
      }
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.rank - b.item.rank);
  return ranked.slice(0, limit).map((x) => x.item);
}

export function matchItems(query, items) {
  const q = String(query || "").trim();
  if (!q || !items?.length) {
    return { auto: null, candidates: [], confidence: "none" };
  }
  const qn = normalize(q);
  const ranked = items
    .map((item) => ({ item, score: scoreMatch(q, item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.rank - b.item.rank);

  if (!ranked.length) return { auto: null, candidates: [], confidence: "none" };

  const top = ranked[0];
  const close = ranked.filter((x) => x.score >= top.score - 15).slice(0, 8);

  const uniqueExact = ranked.filter((x) => x.score >= 100);
  if (uniqueExact.length === 1) {
    return { auto: uniqueExact[0].item, candidates: close.map((x) => x.item), confidence: "high" };
  }
  if (ranked.length === 1 && (qn.length >= 2 || top.score >= 100)) {
    return { auto: top.item, candidates: close.map((x) => x.item), confidence: "high" };
  }
  if (top.score >= 80 && (ranked[1]?.score || 0) < 50) {
    return { auto: top.item, candidates: close.map((x) => x.item), confidence: "high" };
  }

  return {
    auto: null,
    candidates: close.map((x) => x.item),
    confidence: close.length > 1 ? "ambiguous" : "low",
  };
}
