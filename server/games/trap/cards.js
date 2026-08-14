/** トラップゲーム カード定義
 * 表示: 「カード名 効果」（ランク色分け。%はカード上に出さない）
 * keepsTurn は表示しない（酒が手元に残る）
 */

export const RANK_RATES = {
  SSS: 1,
  S: 9,
  A: 20,
  B: 30,
  C: 40,
};

/** @type {Record<string, CardDef>} */
export const CARDS = {
  boku_saikyo: {
    id: "boku_saikyo",
    name: "僕最強なんで",
    rank: "SSS",
    effect: "この試合とその次の試合無敵(負けても両隣が飲む)",
    keepsTurn: true,
  },
  handes_otoko: {
    id: "handes_otoko",
    name: "ハンデス男",
    rank: "SSS",
    effect: "自分以外全員の手札を2枚ランダムに捨てる(一枚以下は全部)",
    keepsTurn: true,
  },
  bommer: {
    id: "bommer",
    name: "ボマー",
    rank: "SSS",
    effect:
      "飲む量を５倍にして誰かにランダムで渡す(この試合自分はいかなることがあっても飲まなくていい)",
    isPassCard: true,
  },
  pitou: {
    id: "pitou",
    name: "ネフェルピトー",
    rank: "SSS",
    effect: "全員の手番のカード選択権を自分が得る",
    keepsTurn: true,
  },
  muteki: {
    id: "muteki",
    name: "無敵",
    rank: "S",
    effect: "自分はこの試合無敵(負けても両隣が飲む)",
    keepsTurn: true,
  },
  sanbai_gaeshi: {
    id: "sanbai_gaeshi",
    name: "3倍返しだ",
    rank: "S",
    effect: "飲む量を3倍にして誰か好きな人に渡す",
    needsTarget: true,
    isPassCard: true,
  },
  bochi_saguri: {
    id: "bochi_saguri",
    name: "墓地漁り",
    rank: "S",
    effect:
      "直前5枚の捨て札の中から2枚手札に持ってこれる、ただしAランク以下のカードしか選択不可",
    needsGravePick: true,
    keepsTurn: true,
  },
  hanzai: {
    id: "hanzai",
    name: "犯罪者",
    rank: "S",
    effect:
      "このカードをゲーム終了時に持っていたら自分が負けた人の肩代わりとしてのむ(自分が負けた場合は２倍飲む)",
    oncePerMatch: true,
    unusable: true,
  },
  gouyoku: {
    id: "gouyoku",
    name: "強欲なニコル",
    rank: "A",
    effect: "山札から2枚引く",
    keepsTurn: true,
  },
  nagabuchi: {
    id: "nagabuchi",
    name: "長渕",
    rank: "A",
    effect: "自分が負けた時誰かランダムに同じ量乾杯する",
    keepsTurn: true,
  },
  taiman: {
    id: "taiman",
    name: "タイマン",
    rank: "A",
    effect:
      "誰か指定してカードを自分とその相手にしか使えないようにする、周りの人は飲みは適用される(無敵、運命共同体など)",
    needsTarget: true,
    keepsTurn: true,
  },
  clock: {
    id: "clock",
    name: "クロック",
    rank: "A",
    effect: "誰か指定して2ターンの間カードを使えなくする",
    needsTarget: true,
    keepsTurn: true,
  },
  copy: {
    id: "copy",
    name: "コピー",
    rank: "A",
    effect: "直前で使われたカードを自分のものとして使える",
  },
  stealth: {
    id: "stealth",
    name: "ステルス",
    rank: "A",
    effect:
      "3ターンの間自分はカードの影響を受けない、ランダムでも選ばれない(飲みの影響はうける)",
    keepsTurn: true,
  },
  kaisuken: {
    id: "kaisuken",
    name: "回数券",
    rank: "A",
    effect: "1回使ってももう一回使える誰かランダムな人に渡す",
    isPassCard: true,
    dualUse: true,
  },
  escon: {
    id: "escon",
    name: "エスコン",
    rank: "A",
    effect:
      "自分がこの試合中に使う「自分ターン継続」カードを、誰かランダムな人に渡すにする（他の人には効かない）",
    keepsTurn: true,
  },
  present: {
    id: "present",
    name: "プレゼント",
    rank: "C",
    effect: "指定して誰かに渡す",
    needsTarget: true,
    isPassCard: true,
  },
  baika: {
    id: "baika",
    name: "倍化の術",
    rank: "B",
    effect: "量を倍にしてランダムな人に回す",
    isPassCard: true,
  },
  jigen_bakudan: {
    id: "jigen_bakudan",
    name: "時限爆弾",
    rank: "B",
    effect: "このカードを使ったあと3枚目にカードを使った人が強制的に負けになる",
    keepsTurn: true,
  },
  hanzawa: {
    id: "hanzawa",
    name: "半沢直樹",
    rank: "C",
    effect: "手札を全て捨てるとこの酒を回してきた人に返すことができる",
    isPassCard: true,
  },
  unmei: {
    id: "unmei",
    name: "運命共同体",
    rank: "B",
    effect: "誰か指定してどちらかが飲む場合同じ量飲む",
    needsTarget: true,
    keepsTurn: true,
  },
  michizure: {
    id: "michizure",
    name: "道連れ",
    rank: "B",
    effect: "自分が負けを認め指定した人と飲む(負けボタンを押した判定になる)",
    needsTarget: true,
  },
  koukan: {
    id: "koukan",
    name: "交換",
    rank: "B",
    effect:
      "自分の手札1枚と相手の手札一枚を交換できる(相手を指定し、渡す自分のカードは選べる。相手のカードはランダム)",
    needsTarget: true,
    needsExchange: true,
    keepsTurn: true,
  },
  nocount: {
    id: "nocount",
    name: "ノーカウントなんだ",
    rank: "B",
    effect: "直前にプレイされたカードの発動を無効して手番をその人に返す",
  },
  hanryu: {
    id: "hanryu",
    name: "帆龍",
    rank: "B",
    effect:
      "誰かランダムな人に渡す、試合終了時にこのカードが手札に残っていた場合手札一枚を次の試合に持ち越せる",
    isPassCard: true,
  },
  howitt: {
    id: "howitt",
    name: "ホイット",
    rank: "C",
    effect: "誰かランダムな人に渡す",
    isPassCard: true,
  },
  ichikabachi: {
    id: "ichikabachi",
    name: "一か八か",
    rank: "C",
    effect: "50%で誰か好きな人に回せるが50%でまた自分に回ってくる",
    needsTarget: true,
    isPassCard: true,
  },
  kouka_nashi: {
    id: "kouka_nashi",
    name: "効果なし",
    rank: "C",
    effect:
      "2枚集めると勝敗に関わらず自分以外全員に倍量飲ませられる、試合が終わったあと発動",
    unusable: true,
  },
  aho: {
    id: "aho",
    name: "あほ",
    rank: "C",
    effect: "飲む量倍にする",
    keepsTurn: true,
  },
  nozoki: {
    id: "nozoki",
    name: "覗き見",
    rank: "C",
    effect: "指定して誰かの手札を覗き見できる",
    needsTarget: true,
    keepsTurn: true,
  },
  jitaku: {
    id: "jitaku",
    name: "自宅警備員",
    rank: "C",
    effect:
      "全員が1枚以上(または全員で4人以下の場合は全員が1枚以上かつ合計5枚)カードを使った時、SランクまたはSSSランクのカードに変わる",
    unusable: true,
  },
};

export const CARD_LIST = Object.values(CARDS);

export const CARDS_BY_RANK = {
  SSS: CARD_LIST.filter((c) => c.rank === "SSS"),
  S: CARD_LIST.filter((c) => c.rank === "S"),
  A: CARD_LIST.filter((c) => c.rank === "A"),
  B: CARD_LIST.filter((c) => c.rank === "B"),
  C: CARD_LIST.filter((c) => c.rank === "C"),
};

export const PASS_CARD_IDS = CARD_LIST.filter((c) => c.isPassCard).map(
  (c) => c.id
);

export const UNUSABLE_IDS = CARD_LIST.filter((c) => c.unusable).map((c) => c.id);

export function cardLabel(cardOrId) {
  const c = typeof cardOrId === "string" ? CARDS[cardOrId] : cardOrId;
  if (!c) return String(cardOrId);
  return `${c.name} ${c.effect}`;
}

export function publicCard(cardId, instanceId, extra = {}) {
  const c = CARDS[cardId];
  if (!c) return null;
  return {
    instanceId,
    id: c.id,
    name: c.name,
    effect: c.effect,
    label: cardLabel(c),
    rank: c.rank,
    sparkle: c.rank === "SSS" || c.rank === "S",
    needsTarget: !!c.needsTarget,
    needsGravePick: !!c.needsGravePick,
    needsExchange: !!c.needsExchange,
    dualUse: !!c.dualUse,
    unusable: !!c.unusable,
    usesLeft: extra.usesLeft,
  };
}
