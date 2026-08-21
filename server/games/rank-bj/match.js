/** 名前のゆらぎを潰して部分一致判定する */
import { readingFits, readingFuzzyScore, normalizeKana, toHiragana } from "./readings.js";

export { toHiragana };

export function normalize(s) {
  return normalizeKana(s)
    .replace(/[!！?？、。,.…・･]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1"); // あああ → ああ
}

/** ひらがな → ローマ字（マッチ用。ヘボン式寄り） */
const KANA_ROMA = [
  ["きゃ", "kya"], ["きゅ", "kyu"], ["きょ", "kyo"],
  ["しゃ", "sha"], ["しゅ", "shu"], ["しょ", "sho"],
  ["ちゃ", "cha"], ["ちゅ", "chu"], ["ちょ", "cho"],
  ["にゃ", "nya"], ["にゅ", "nyu"], ["にょ", "nyo"],
  ["ひゃ", "hya"], ["ひゅ", "hyu"], ["ひょ", "hyo"],
  ["みゃ", "mya"], ["みゅ", "myu"], ["みょ", "myo"],
  ["りゃ", "rya"], ["りゅ", "ryu"], ["りょ", "ryo"],
  ["ぎゃ", "gya"], ["ぎゅ", "gyu"], ["ぎょ", "gyo"],
  ["じゃ", "ja"], ["じゅ", "ju"], ["じょ", "jo"],
  ["びゃ", "bya"], ["びゅ", "byu"], ["びょ", "byo"],
  ["ぴゃ", "pya"], ["ぴゅ", "pyu"], ["ぴょ", "pyo"],
  ["ふぁ", "fa"], ["ふぃ", "fi"], ["ふぇ", "fe"], ["ふぉ", "fo"],
  ["うぃ", "wi"], ["うぇ", "we"], ["うぉ", "wo"],
  ["てぃ", "ti"], ["でぃ", "di"], ["とぅ", "tu"], ["どぅ", "du"],
  ["ぁ", "a"], ["ぃ", "i"], ["ぅ", "u"], ["ぇ", "e"], ["ぉ", "o"],
  ["っ", ""], ["ん", "n"],
  ["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"],
  ["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"],
  ["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"],
  ["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"],
  ["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"],
  ["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"],
  ["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"],
  ["や", "ya"], ["ゆ", "yu"], ["よ", "yo"],
  ["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"],
  ["わ", "wa"], ["ゐ", "wi"], ["ゑ", "we"], ["を", "wo"],
  ["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"],
  ["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"],
  ["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"],
  ["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"],
  ["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"],
  ["ヴ", "vu"],
];

/** よくある略称・読みゆらぎ（クエリ正規化後キー → 別名） */
const QUERY_NICKS = {
  きめつ: ["鬼滅の刃", "鬼滅"],
  きめつのやいば: ["鬼滅の刃"],
  じゅじゅつ: ["呪術廻戦"],
  じゅじゅつかいせん: ["呪術廻戦"],
  わんぴ: ["ワンピース"],
  わんぴす: ["ワンピース"],
  わんぴいす: ["ワンピース"],
  しんげき: ["進撃の巨人"],
  しんげきのきょじん: ["進撃の巨人"],
  のぎざか: ["乃木坂46"],
  のぎざか46: ["乃木坂46"],
  ひなたざか: ["日向坂46"],
  さくらざか: ["櫻坂46"],
  キングヌー: ["King Gnu"],
  きんぐぬー: ["King Gnu"],
  きんぐぬう: ["King Gnu"],
  マック: ["マクドナルド"],
  まくど: ["マクドナルド"],
  まくどなるど: ["マクドナルド"],
  スタバ: ["スターバックス"],
  すたば: ["スターバックス"],
};

export function kanaToRomaji(s) {
  let h = normalizeKana(s);
  if (!h) return "";
  let out = "";
  let i = 0;
  while (i < h.length) {
    if (h[i] === "っ" && i + 1 < h.length) {
      let next = "";
      for (const [k, r] of KANA_ROMA) {
        if (k !== "っ" && h.startsWith(k, i + 1)) {
          next = r;
          break;
        }
      }
      if (next) {
        out += next[0];
        i += 1;
        continue;
      }
    }
    let hit = null;
    for (const [k, r] of KANA_ROMA) {
      if (h.startsWith(k, i)) {
        hit = { k, r };
        break;
      }
    }
    if (hit) {
      out += hit.r;
      i += hit.k.length;
    } else {
      i += 1;
    }
  }
  return out.replace(/n(?=[bmp])/g, "m");
}

function latinCompact(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isKanaOnlyQuery(s) {
  const n = normalize(s);
  return n.length > 0 && /^[\u3040-\u309f]+$/.test(n);
}

/** 長音ゆらぎを潰したローマ字（わんぴいす↔わんぴーす） */
function softRomaji(s) {
  return kanaToRomaji(s)
    .replace(/aa+/g, "a")
    .replace(/ii+/g, "i")
    .replace(/uu+/g, "u")
    .replace(/ee+/g, "e")
    .replace(/oo+/g, "o")
    .replace(/ou/g, "o");
}

function editDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const cur = new Array(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j];
  }
  return prev[t.length];
}

function fuzzyKeyScore(qKey, nKey) {
  if (!qKey || !nKey) return 0;
  if (qKey === nKey) return 100 + Math.min(qKey.length, 20);
  const maxLen = Math.max(qKey.length, nKey.length);
  if (maxLen < 4) return 0;
  const d = editDistance(qKey, nKey);
  if (d === 1 && maxLen >= 5) return 90;
  if (d === 1 && maxLen >= 4) return 84;
  if (d === 2 && maxLen >= 7) return 78;
  if (d === 2 && maxLen >= 5) return 72;
  if (d / maxLen <= 0.18 && maxLen >= 6) return 70;
  return 0;
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

/** 比較用キー: かな正規化・ローマ字・ラテン圧縮 */
function matchKeys(text) {
  const nn = normalize(text);
  const latin = latinCompact(text);
  const fromKana = nn && /^[\u3040-\u309f]+$/.test(nn) ? kanaToRomaji(nn) : "";
  const soft =
    nn && /^[\u3040-\u309f]+$/.test(nn) ? softRomaji(nn) : softRomaji(text);
  const keys = new Set();
  if (nn && nn.length >= 2) keys.add(nn);
  if (latin && latin.length >= 3) keys.add(latin);
  if (fromKana && fromKana.length >= 3) keys.add(fromKana);
  if (soft && soft.length >= 3) keys.add(soft);
  return [...keys].filter(Boolean);
}

function nickBoost(query, item) {
  const q = normalize(query);
  const nicks = QUERY_NICKS[q];
  if (!nicks?.length) return 0;
  const names = namesFor(item).map((n) => normalize(n));
  for (const nick of nicks) {
    const nn = normalize(nick);
    if (names.some((n) => n === nn || n.includes(nn) || nn.includes(n))) return 108;
  }
  return 0;
}

function isWeakKey(q) {
  const n = normalize(q);
  const L = latinCompact(q);
  if (n.length <= 2) return true;
  if (L && L.length <= 2) return true;
  if (L && /^\d+$/.test(L)) return true;
  return false;
}

function scoreMatch(query, item) {
  const q = normalize(query);
  if (!q) return 0;
  let best = nickBoost(query, item);
  if (readingFits(item.name, query)) best = Math.max(best, 120);
  else best = Math.max(best, readingFuzzyScore(item.name, query));
  const qKeys = matchKeys(query);
  const qRomaji = isKanaOnlyQuery(query) ? kanaToRomaji(q) : "";
  const qSoft = softRomaji(query);
  const qLatin = latinCompact(query);
  for (const n of namesFor(item)) {
    if (n !== item.name && readingFits(n, query)) best = Math.max(best, 115);
    else if (n !== item.name) best = Math.max(best, Math.min(110, readingFuzzyScore(n, query)));
    const nn = normalize(n);
    if (!nn) continue;
    if (nn === q) best = Math.max(best, 100 + Math.min(nn.length, 20));
    else if (q.length >= 2 && nn.includes(q))
      best = Math.max(best, 60 + q.length * 2);
    else if (nn.length >= 2 && q.includes(nn))
      best = Math.max(best, 50 + nn.length);

    // 読みの先頭一致（4文字以上）
    if (isKanaOnlyQuery(query) && q.length >= 4) {
      const nRoma = softRomaji(n);
      if (nRoma && qSoft && (nRoma.startsWith(qSoft) || qSoft.startsWith(nRoma))) {
        best = Math.max(best, 82 + Math.min(q.length, 10));
      }
    }

    const nKeys = matchKeys(n);
    for (const qk of qKeys) {
      for (const nk of nKeys) {
        if (!qk || !nk) continue;
        if (qk === nk) best = Math.max(best, 100 + Math.min(qk.length, 20));
        else if (qk.length >= 3 && nk.includes(qk))
          best = Math.max(best, 60 + qk.length * 2);
        else if (nk.length >= 3 && qk.includes(nk))
          best = Math.max(best, 50 + nk.length);
        else best = Math.max(best, fuzzyKeyScore(qk, nk));
      }
    }
    if (qRomaji.length >= 2) {
      const nLatin = latinCompact(n);
      if (nLatin.includes(qRomaji)) best = Math.max(best, 62 + qRomaji.length * 2);
      best = Math.max(best, fuzzyKeyScore(qRomaji, nLatin));
      best = Math.max(best, fuzzyKeyScore(qSoft, softRomaji(n)));
    }
    if (qLatin.length >= 2) {
      const nAsRoma =
        /^[\u3040-\u309f]+$/.test(nn) ? kanaToRomaji(nn) : latinCompact(n);
      if (nAsRoma.includes(qLatin)) best = Math.max(best, 62 + qLatin.length * 2);
      best = Math.max(best, fuzzyKeyScore(qLatin, nAsRoma));
    }
  }
  return best;
}

export function suggestCandidates(query, items, limit = 15) {
  const q = String(query || "").trim();
  if (!q || !items?.length) return [];
  const qn = normalize(q);
  const qRomaji = isKanaOnlyQuery(q) ? kanaToRomaji(qn) : "";
  const qLatin = latinCompact(q);
  const qSoft = softRomaji(q);
  const ranked = items
    .map((item) => {
      let score = scoreMatch(q, item);
      if (!score) {
        for (const n of namesFor(item)) {
          const nn = normalize(n);
          const nLatin = latinCompact(n);
          const nRoma =
            nn && /^[\u3040-\u309f]+$/.test(nn) ? kanaToRomaji(nn) : nLatin;
          const nSoft = softRomaji(n);
          if (!nn && !nLatin) continue;
          if (nn && (nn.startsWith(qn) || (qn.length >= 2 && qn.startsWith(nn)))) {
            score = Math.max(score, 40);
          }
          if (qRomaji.length >= 2 && nLatin.includes(qRomaji)) {
            score = Math.max(score, 45);
          }
          if (qLatin.length >= 2 && nRoma.includes(qLatin)) {
            score = Math.max(score, 45);
          }
          score = Math.max(score, fuzzyKeyScore(qSoft, nSoft));
          score = Math.max(score, fuzzyKeyScore(qRomaji, nLatin));
          if (qn.length >= 2 && nn) {
            for (let i = 0; i <= qn.length - 2; i++) {
              if (nn.includes(qn.slice(i, i + 2))) {
                score = Math.max(score, i === 0 ? 28 : 18);
              }
            }
          }
          if (qn[0] && nn?.includes(qn[0])) score = Math.max(score, 8);
        }
      }
      if (readingFits(item.name, q)) score = Math.max(score, 120);
      return { item, score };
    })
    .filter((x) => x.score >= 28)
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
  const second = ranked[1]?.score || 0;
  const close = ranked.filter((x) => x.score >= top.score - 15).slice(0, 8);
  const weak = isWeakKey(q);

  const uniqueExact = ranked.filter((x) => x.score >= 100);
  if (uniqueExact.length === 1 && !(weak && uniqueExact[0].score < 110)) {
    return { auto: uniqueExact[0].item, candidates: close.map((x) => x.item), confidence: "high" };
  }
  if (uniqueExact.length > 1) {
    return {
      auto: null,
      candidates: close.map((x) => x.item),
      confidence: "ambiguous",
    };
  }
  if (ranked.length === 1 && (qn.length >= 2 || top.score >= 100)) {
    return { auto: top.item, candidates: close.map((x) => x.item), confidence: "high" };
  }
  // 強い部分一致＋マージン（短いキーは除外）
  if (!weak && top.score >= 72 && top.score - second >= 18) {
    return { auto: top.item, candidates: close.map((x) => x.item), confidence: "high" };
  }
  if (!weak && top.score >= 64 && second < 40) {
    return { auto: top.item, candidates: close.map((x) => x.item), confidence: "high" };
  }
  if (top.score >= 80 && second < 50) {
    return { auto: top.item, candidates: close.map((x) => x.item), confidence: "high" };
  }

  return {
    auto: null,
    candidates: close.map((x) => x.item),
    confidence: close.length > 1 ? "ambiguous" : "low",
  };
}
