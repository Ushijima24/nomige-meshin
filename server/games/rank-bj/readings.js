/**
 * 漢字名 ↔ ひらがな の照合。
 * kuromoji は「健=ケン」のように名乗りを外すことがあるので、
 * 姓の辞書 + 名乗り読みで「さとうたける」→「佐藤健」を拾う。
 */
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");

const HIRA_OFF = 0x60;

export function toHiragana(s) {
  return String(s || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - HIRA_OFF)
  );
}

export function normalizeKana(s) {
  return toHiragana(
    String(s || "")
      .normalize("NFKC")
      .replace(/[ー−–—ｰ~〜・･.\s\u3000'"「」『』【】\[\]()（）]/g, "")
      .toLowerCase()
  );
}

function hasKanji(s) {
  return /[\u4e00-\u9fff]/.test(s);
}

function isKanaOnly(s) {
  const n = normalizeKana(s);
  return n.length > 0 && /^[\u3040-\u309f]+$/.test(n);
}

/** よく出る姓 */
const SURNAMES = {
  佐藤: ["さとう"],
  鈴木: ["すずき"],
  高橋: ["たかはし"],
  田中: ["たなか"],
  伊藤: ["いとう"],
  渡辺: ["わたなべ", "わたべ"],
  山本: ["やまもと"],
  中村: ["なかむら"],
  小林: ["こばやし"],
  加藤: ["かとう"],
  吉田: ["よしだ"],
  山田: ["やまだ"],
  佐々木: ["ささき"],
  山口: ["やまぐち"],
  松本: ["まつもと"],
  井上: ["いのうえ"],
  木村: ["きむら"],
  林: ["はやし"],
  斎藤: ["さいとう"],
  齊藤: ["さいとう"],
  斎: ["さい"],
  清水: ["しみず"],
  山崎: ["やまざき", "やまさき"],
  森: ["もり"],
  池田: ["いけだ"],
  橋本: ["はしもと"],
  阿部: ["あべ"],
  石川: ["いしかわ"],
  山下: ["やました"],
  中島: ["なかじま", "なかしま"],
  石井: ["いしい"],
  小川: ["おがわ"],
  前田: ["まえだ"],
  岡田: ["おかだ"],
  長谷川: ["はせがわ"],
  藤田: ["ふじた"],
  後藤: ["ごとう"],
  近藤: ["こんどう"],
  村上: ["むらかみ"],
  遠藤: ["えんどう"],
  青木: ["あおき"],
  坂本: ["さかもと"],
  斉藤: ["さいとう"],
  福田: ["ふくだ"],
  太田: ["おおた"],
  西村: ["にしむら"],
  藤井: ["ふじい"],
  岡本: ["おかもと"],
  藤原: ["ふじわら"],
  中川: ["なかがわ"],
  三浦: ["みうら"],
  岡崎: ["おかざき"],
  松田: ["まつだ"],
  中野: ["なかの"],
  原田: ["はらだ"],
  小野: ["おの"],
  田村: ["たむら"],
  竹内: ["たけうち"],
  金子: ["かねこ"],
  和田: ["わだ"],
  中山: ["なかやま"],
  石田: ["いしだ"],
  上田: ["うえだ"],
  森田: ["もりた"],
  原: ["はら"],
  柴田: ["しばた"],
  酒井: ["さかい"],
  工藤: ["くどう"],
  横山: ["よこやま"],
  宮崎: ["みやざき"],
  宮本: ["みやもと"],
  内田: ["うちだ"],
  高木: ["たかぎ"],
  安藤: ["あんどう"],
  島田: ["しまだ"],
  谷口: ["たにぐち"],
  大野: ["おおの"],
  高田: ["たかだ", "たかた"],
  丸山: ["まるやま"],
  今井: ["いまい"],
  河野: ["こうの", "かわの"],
  藤本: ["ふじもと"],
  村田: ["むらた"],
  武田: ["たけだ"],
  上野: ["うえの"],
  杉山: ["すぎやま"],
  増田: ["ますだ"],
  菅田: ["すだ", "すげた"],
  吉沢: ["よしざわ"],
  吉澤: ["よしざわ"],
  黒田: ["くろだ"],
  赤楚: ["あかそ"],
  新垣: ["あらがき"],
  綾瀬: ["あやせ"],
  北川: ["きたがわ"],
  松坂: ["まつざか", "まつさか"],
  福山: ["ふくやま"],
  木村: ["きむら"],
  小泉: ["こいずみ"],
  浜辺: ["はまべ"],
  永野: ["ながの"],
  平野: ["ひらの"],
  山田: ["やまだ"],
  高橋: ["たかはし"],
  神木: ["かみき"],
  染谷: ["そめや"],
  妻夫木: ["つまぶき"],
  岡田: ["おかだ"],
  菅田: ["すだ", "すげた"],
};

/** 名乗り・人名でよく使う読み（kun/on 以外） */
const KANJI = {
  健: ["けん", "たける", "たけし", "やすし"],
  健: ["けん", "たける", "たけし"],
  翔: ["しょう", "かける", "とぶ"],
  大: ["だい", "たい", "ひろし", "まさる", "ひろ"],
  太: ["た", "たい", "ふとし"],
  郎: ["ろう"],
  朗: ["ろう", "あきら"],
  也: ["や", "なり"],
  哉: ["や", "かな"],
  介: ["すけ", "かい"],
  助: ["すけ"],
  輔: ["すけ"],
  佑: ["すけ", "ゆう"],
  祐: ["すけ", "ゆう"],
  亮: ["りょう", "あきら"],
  諒: ["りょう"],
  遼: ["りょう"],
  涼: ["りょう", "すず"],
  凌: ["りょう"],
  蓮: ["れん"],
  連: ["れん"],
  樹: ["じゅ", "いつき", "たつき"],
  悠: ["ゆう", "はるか"],
  優: ["ゆう", "まさる", "やさ"],
  勇: ["ゆう", "いさむ"],
  雄: ["ゆう", "お"],
  裕: ["ゆう", "ひろし"],
  裕: ["ゆう"],
  陽: ["よう", "はる", "あき"],
  洋: ["よう", "ひろし"],
  耀: ["よう"],
  輝: ["き", "てる", "あきら"],
  暉: ["き", "てる", "あきら"],
  光: ["こう", "ひかる", "みつ"],
  明: ["あきら", "めい", "みん"],
  昭: ["あきら", "しょう"],
  章: ["あきら", "しょう"],
  誠: ["まこと", "せい"],
  真: ["しん", "まこと", "ま"],
  将: ["しょう", "まさ"],
  昌: ["しょう", "まさ"],
  正: ["せい", "しょう", "ただし", "まさ"],
  政: ["せい", "まさ"],
  雅: ["まさ", "みやび"],
  仁: ["じん", "ひとし", "さとる"],
  人: ["ひと", "じん"],
  斗: ["と", "ます"],
  翔: ["しょう", "かける"],
  隼: ["はやと", "じゅん"],
  駿: ["しゅん", "はやお"],
  瞬: ["しゅん"],
  春: ["はる"],
  晴: ["はる", "せい"],
  遥: ["はるか"],
  遥: ["はるか"],
  海: ["かい", "うみ"],
  空: ["そら", "くう"],
  蒼: ["そう", "あおい"],
  碧: ["あお", "みどり"],
  龍: ["りゅう", "たつ"],
  竜: ["りゅう", "たつ"],
  虎: ["とら"],
  馬: ["うま", "ま"],
  太郎: ["たろう"],
  次郎: ["じろう"],
  一郎: ["いちろう"],
  衛: ["えい", "まもる"],
  二: ["じ", "に", "つぎ"],
  一: ["いち", "かず", "はじめ"],
  三: ["さん", "ぞう", "みつ"],
  五: ["ご", "いつ"],
  七: ["しち", "なな"],
  八: ["はち", "や"],
  幸: ["さち", "ゆき", "こう"],
  幸: ["ゆき"],
  之: ["ゆき", "の"],
  志: ["し", "こころざし"],
  智: ["とも", "さとし", "ち"],
  知: ["とも", "さと"],
  敏: ["びん", "さとし"],
  俊: ["しゅん", "とし"],
  寿: ["とし", "ひさ", "じゅ"],
  利: ["とし", "り"],
  年: ["とし", "ねん"],
  紀: ["き", "とし", "のり"],
  典: ["のり", "てん"],
  則: ["のり"],
  徳: ["とく", "のり"],
  義: ["よし", "ぎ"],
  吉: ["よし", "きち"],
  良: ["りょう", "よし"],
  佳: ["か", "よし", "けい"],
  慶: ["けい", "よし"],
  恵: ["けい", "めぐみ", "え"],
  慧: ["けい", "さとる"],
  英: ["えい", "ひで"],
  秀: ["ひで", "しゅう"],
  豪: ["ごう", "たけし"],
  剛: ["ごう", "たけし"],
  毅: ["たけし", "き"],
  武: ["たけ", "たけし", "ぶ"],
  猛: ["たけし", "もう"],
  岳: ["がく", "たけ"],
  嵩: ["たかし"],
  隆: ["たかし", "りゅう"],
  孝: ["たかし", "こう"],
  貴: ["たかし", "き"],
  崇: ["たかし", "すう"],
  卓: ["たく", "すぐる"],
  卓: ["たく"],
  拓: ["たく", "ひらく"],
  巧: ["たくみ", "こう"],
  匠: ["たくみ"],
  奏: ["そう", "かなで"],
  想: ["そう"],
  創: ["そう", "はじめ"],
  新: ["しん", "あらた"],
  心: ["しん", "こころ"],
  信: ["しん", "のぶ"],
  伸: ["しん", "のぶ"],
  進: ["しん", "すすむ"],
  晋: ["しん"],
  慎: ["しん", "つつしむ"],
  純: ["じゅん"],
  潤: ["じゅん"],
  淳: ["じゅん", "あつし"],
  順: ["じゅん"],
  準: ["じゅん"],
  文: ["ふみ", "ぶん"],
  史: ["ふみ", "し"],
  士: ["し", "さむらい"],
  司: ["し", "つかさ"],
  嗣: ["つぐ"],
  継: ["つぐ", "けい"],
  次: ["つぐ", "じ"],
  治: ["おさむ", "じ"],
  修: ["おさむ", "しゅう"],
  理: ["り", "おさむ"],
  哲: ["てつ", "さとる"],
  悟: ["さとる", "ご"],
  覚: ["さとる", "かく"],
  学: ["がく", "まなぶ"],
  博: ["ひろし", "はく"],
  宏: ["ひろし", "こう"],
  浩: ["ひろし", "こう"],
  広: ["ひろし", "ひろ"],
  弘: ["ひろし", "ひろ"],
  裕: ["ひろし", "ゆう"],
  寛: ["ひろし", "かん"],
  洋: ["ひろし", "よう"],
  清: ["きよし", "せい"],
  潔: ["きよし", "けつ"],
  聖: ["せい", "きよし"],
  聡: ["さとし", "そう"],
  悟: ["さとる"],
  達: ["たつ", "とおる"],
  徹: ["とおる", "てつ"],
  亨: ["とおる", "きょう"],
  透: ["とおる"],
  衛: ["え", "まもる"],
  守: ["まもる", "しゅ"],
  護: ["まもる", "ご"],
  生: ["いき", "せい", "お"],
  男: ["お", "だん"],
  夫: ["お", "おっと"],
  彦: ["ひこ"],
  哉: ["や"],
  也: ["や"],
  弥: ["や", "わたる", "みつ"],
  矢: ["や"],
  哉: ["かな", "や"],
  花: ["はな", "か"],
  華: ["はな", "か"],
  香: ["か", "かおり", "こう"],
  佳: ["か", "よし"],
  加: ["か", "くわ"],
  可: ["か"],
  果: ["か", "はた"],
  歌: ["か", "うた"],
  夏: ["か", "なつ"],
  奈: ["な", "ない"],
  菜: ["な", "さい"],
  那: ["な"],
  南: ["な", "みなみ"],
  美: ["み", "び", "よし"],
  実: ["み", "みのる", "じつ"],
  見: ["み"],
  未: ["み", "ひつじ"],
  味: ["み"],
  三: ["み", "さん"],
  里: ["さと", "り"],
  理: ["り"],
  莉: ["り", "れい"],
  梨: ["り", "なし"],
  利: ["り"],
  李: ["り", "すもも"],
  織: ["おり", "しょく"],
  衣: ["い", "ころも"],
  依: ["い", "え"],
  愛: ["あい", "まな"],
  藍: ["あい"],
  彩: ["あや", "さい"],
  綾: ["あや"],
  文: ["あや", "ふみ"],
  絢: ["あや"],
  桜: ["さくら", "おう"],
  咲: ["さき", "さく"],
  幸: ["さち", "ゆき"],
  佐: ["さ", "すけ"],
  沙: ["さ", "すな"],
  紗: ["さ", "しゃ"],
  早: ["さ", "はや"],
  小: ["さ", "こ", "お"],
  子: ["こ", "し"],
  湖: ["こ"],
  心: ["こころ", "しん"],
  琴: ["こと"],
  言: ["こと"],
  結: ["ゆい", "ゆう", "むす"],
  夕: ["ゆう"],
  雪: ["ゆき", "せつ"],
  由: ["ゆい", "よし", "ゆ"],
  有: ["ゆう", "あり"],
  友: ["ゆう", "とも"],
  夢: ["ゆめ", "む"],
  弓: ["ゆみ"],
  月: ["つき", "げつ"],
  希: ["のぞみ", "き"],
  望: ["のぞみ", "ぼう"],
  希: ["まれ", "き"],
  乃: ["の", "ない"],
  野: ["の"],
  音: ["おと", "ね"],
  寧: ["ねい", "やす"],
  祢: ["ね"],
  杏: ["あん", "あんず", "きょう"],
  安: ["あん", "やす"],
  歩: ["あゆ", "ほ", "あゆむ"],
  歩: ["ほ"],
  渉: ["あゆむ", "しょう"],
  渉: ["わたる"],
  航: ["わたる", "こう"],
  渡: ["わたる"],
  亘: ["わたる"],
  衛: ["まもる", "えい"],
  将: ["まさ"],
  昌: ["まさ"],
  正: ["まさ"],
  雅: ["まさ"],
  政: ["まさ"],
  晶: ["あきら", "しょう"],
  瑛: ["あきら", "えい"],
  永: ["えい", "なが"],
  栄: ["えい", "さかえ"],
  衛: ["えい"],
  慧: ["けい", "え"],
  恵: ["え", "めぐみ"],
  江: ["え", "ごう"],
  絵: ["え"],
  枝: ["えだ"],
  恵: ["めぐみ"],
  萌: ["もえ", "ほう"],
  穂: ["ほ"],
  保: ["ほ", "たもつ"],
  帆: ["ほ"],
  菜: ["な"],
  那: ["な"],
  凪: ["なぎ"],
  渚: ["なぎさ"],
  凪: ["なぎ"],
  成: ["なり", "せい"],
  也: ["なり"],
  也: ["や"],
  谷: ["たに", "や"],
  弥: ["や", "みつ"],
  哉: ["や"],
  夜: ["や", "よる"],
  矢: ["や"],
  也: ["なり"],
  輝: ["てる"],
  照: ["てる"],
  輝: ["あきら"],
  璃: ["り"],
  里: ["り"],
  莉: ["り"],
  律: ["りつ"],
  立: ["りつ", "たつ"],
  陸: ["りく", "ろく"],
  凌: ["りょう"],
  陵: ["りょう"],
  涼: ["りょう"],
  遼: ["りょう"],
  諒: ["りょう"],
  玲: ["れい"],
  礼: ["れい"],
  麗: ["れい", "うらら"],
  零: ["れい"],
  蓮: ["れん"],
  恋: ["れん", "こい"],
  錬: ["れん"],
};

const CHUNK = { ...SURNAMES };
for (const [k, v] of Object.entries(KANJI)) {
  CHUNK[k] = [...new Set([...(CHUNK[k] || []), ...v])];
}

let tokenizer = null;
const readingCache = new Map();

export function warmupReadings() {
  return new Promise((resolve) => {
    if (tokenizer) return resolve(tokenizer);
    const dicPath = path.join(
      path.dirname(require.resolve("kuromoji/package.json")),
      "dict"
    );
    kuromoji.builder({ dicPath }).build((err, t) => {
      if (!err) tokenizer = t;
      resolve(tokenizer);
    });
  });
}

function kuromojiReading(chunk) {
  if (!tokenizer || !chunk) return [];
  try {
    const tokens = tokenizer.tokenize(chunk);
    if (!tokens.length) return [];
    const surface = tokens.map((x) => x.surface_form).join("");
    if (surface !== chunk) return [];
    const raw = tokens.map((x) => x.reading || x.surface_form).join("");
    const h = normalizeKana(raw);
    return h ? [h] : [];
  } catch {
    return [];
  }
}

function readingsFor(chunk) {
  const cached = readingCache.get(chunk);
  if (cached) return cached;
  const out = new Set();
  (CHUNK[chunk] || []).forEach((r) => out.add(normalizeKana(r)));
  kuromojiReading(chunk).forEach((r) => out.add(r));
  if (chunk.length === 1 && !hasKanji(chunk)) {
    const h = normalizeKana(chunk);
    if (h) out.add(h);
  }
  const list = [...out].filter(Boolean);
  readingCache.set(chunk, list);
  return list;
}

/** 漢字名がひらがなクエリの読みになり得るか */
export function readingFits(surface, query) {
  const name = String(surface || "").replace(/[（(][^）)]*[）)]/g, "").trim();
  const q = normalizeKana(query);
  if (!name || !q) return false;
  if (!hasKanji(name) || !isKanaOnly(query)) return false;

  const rec = (i, j) => {
    if (i === name.length) return j === q.length;
    if (j > q.length) return false;
    const ch = name[i];
    if (!hasKanji(ch)) {
      const h = normalizeKana(ch);
      if (!h) return rec(i + 1, j);
      if (q.slice(j, j + h.length) !== h) return false;
      return rec(i + 1, j + h.length);
    }
    for (let len = Math.min(4, name.length - i); len >= 1; len--) {
      const chunk = name.slice(i, i + len);
      for (const r of readingsFor(chunk)) {
        if (!r) continue;
        if (q.slice(j, j + r.length) === r && rec(i + len, j + r.length)) {
          return true;
        }
      }
    }
    return false;
  };
  return rec(0, 0);
}

/** 漢字名の候補読みを全部集める（あいまい一致用） */
export function collectReadings(surface) {
  const name = String(surface || "").replace(/[（(][^）)]*[）)]/g, "").trim();
  if (!name || !hasKanji(name)) return [];
  const out = new Set();
  const walk = (i, acc) => {
    if (i === name.length) {
      if (acc) out.add(acc);
      return;
    }
    const ch = name[i];
    if (!hasKanji(ch)) {
      const h = normalizeKana(ch);
      walk(i + 1, acc + (h || ""));
      return;
    }
    let any = false;
    for (let len = Math.min(4, name.length - i); len >= 1; len--) {
      const chunk = name.slice(i, i + len);
      for (const r of readingsFor(chunk)) {
        if (!r) continue;
        any = true;
        walk(i + len, acc + r);
      }
    }
    if (!any) walk(i + 1, acc);
  };
  walk(0, "");
  return [...out];
}

/**
 * 読みのあいまいスコア（0 / 70〜120）
 * 1文字抜け・余分・置換を拾う
 */
export function readingFuzzyScore(surface, query) {
  if (readingFits(surface, query)) return 120;
  const q = normalizeKana(query);
  if (!q || q.length < 4) return 0;
  if (!hasKanji(surface) || !isKanaOnly(query)) return 0;
  let best = 0;
  for (const r of collectReadings(surface)) {
    if (!r) continue;
    if (r === q) best = Math.max(best, 120);
    else if (r.startsWith(q) && q.length >= 4) best = Math.max(best, 86);
    else if (q.startsWith(r) && r.length >= 4) best = Math.max(best, 80);
    else {
      const maxLen = Math.max(r.length, q.length);
      let d = 0;
      // 簡易レーベンシュタイン（長さ差が大きいときはスキップ）
      if (Math.abs(r.length - q.length) > 2) continue;
      const prev = new Array(q.length + 1);
      const cur = new Array(q.length + 1);
      for (let j = 0; j <= q.length; j++) prev[j] = j;
      for (let i = 1; i <= r.length; i++) {
        cur[0] = i;
        for (let j = 1; j <= q.length; j++) {
          const cost = r[i - 1] === q[j - 1] ? 0 : 1;
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        for (let j = 0; j <= q.length; j++) prev[j] = cur[j];
      }
      d = prev[q.length];
      if (d === 1 && maxLen >= 5) best = Math.max(best, 92);
      else if (d === 1 && maxLen >= 4) best = Math.max(best, 84);
      else if (d === 2 && maxLen >= 7) best = Math.max(best, 76);
    }
  }
  return best;
}

export function wikiKanaFromExtract(extract) {
  const text = String(extract || "");
  const m = text.match(/（\s*([ぁ-んァ-ヶー＝\s]+)/);
  if (!m) return [];
  const k = normalizeKana(m[1]);
  return k.length >= 2 ? [k] : [];
}
