import {
  CARDS,
  CARDS_BY_RANK,
  RANK_RATES,
  PASS_CARD_IDS,
  publicCard,
  cardLabel,
} from "./cards.js";

const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰"];

const BOT_NAMES = [
  "ダミー太郎",
  "ダミー花子",
  "テスト三郎",
  "試し子",
  "のんべえ",
  "かんぱい君",
  "宴会部長",
  "つまみちゃん",
];

/** @type {Map<string, Room>} */
const rooms = new Map();

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function sanitizeName(name) {
  return String(name || "名無しさん").trim().slice(0, 12) || "名無しさん";
}

function sanitizeAvatar(a) {
  return AVATARS.includes(a) ? a : AVATARS[0];
}

/** たが登録 → Cランクが出ない */
export function isTagaName(name) {
  return String(name || "").includes("たが");
}

/** うし → SSS 3倍、増分は C から */
export function isUshiName(name) {
  return String(name || "").includes("うし");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function alivePlayers(room) {
  return [...room.players.values()].filter((p) => p.connected !== false);
}

function playerList(room) {
  return [...room.players.values()];
}

function getP(room, id) {
  return room.players.get(id);
}

function makeInstance(cardId, extra = {}) {
  const def = CARDS[cardId];
  const inst = { instanceId: uid(), cardId };
  if (def?.dualUse) inst.usesLeft = extra.usesLeft ?? 2;
  return inst;
}

/**
 * ランク抽選 → 同ランク内均等。犯罪者は1試合1枚。
 * たがは C 除外して再正規化。
 * うしは SSS×3、増えた分を C から引く。
 */
export function drawCard(room, forPlayerId, { forcePass = false } = {}) {
  if (forcePass) {
    const pool = PASS_CARD_IDS.filter((id) => {
      const c = CARDS[id];
      if (c.oncePerMatch && room.hanzaiDrawn) return false;
      const p = getP(room, forPlayerId);
      if (p?.taga && c.rank === "C") return false;
      return true;
    });
    const id =
      pool[(Math.random() * pool.length) | 0] || PASS_CARD_IDS[0] || "howitt";
    const def = CARDS[id];
    if (def?.oncePerMatch) room.hanzaiDrawn = true;
    return makeInstance(id);
  }

  const p = getP(room, forPlayerId);
  const rates = { ...RANK_RATES };
  if (p?.ushi) {
    const extra = rates.SSS * 2;
    rates.SSS *= 3;
    rates.C = Math.max(0, rates.C - extra);
  }
  const ranks = ["SSS", "S", "A", "B", "C"].filter((r) => {
    if (p?.taga && r === "C") return false;
    return (rates[r] || 0) > 0;
  });
  let total = ranks.reduce((s, r) => s + rates[r], 0);
  let roll = Math.random() * total;
  let picked = ranks[ranks.length - 1];
  for (const r of ranks) {
    roll -= rates[r];
    if (roll <= 0) {
      picked = r;
      break;
    }
  }

  let pool = CARDS_BY_RANK[picked].filter((c) => {
    if (c.oncePerMatch && room.hanzaiDrawn) return false;
    return true;
  });
  if (!pool.length) {
    pool = CARDS_BY_RANK[picked].filter((c) => !c.oncePerMatch);
  }
  if (!pool.length) {
    const fallbackRanks = ranks.filter((r) => r !== picked);
    for (const r of fallbackRanks) {
      pool = CARDS_BY_RANK[r].filter(
        (c) => !(c.oncePerMatch && room.hanzaiDrawn)
      );
      if (pool.length) break;
    }
  }
  if (!pool.length) pool = CARDS_BY_RANK.B;

  const def = pool[(Math.random() * pool.length) | 0];
  if (def.oncePerMatch) room.hanzaiDrawn = true;
  return makeInstance(def.id);
}

function giveCard(room, player, inst) {
  player.hand.push(inst);
  if (inst.cardId === "kouka_nashi") {
    player.koukaNashiCount = (player.koukaNashiCount || 0) + 1;
  }
}

function hasPassCard(hand) {
  return hand.some((h) => CARDS[h.cardId]?.isPassCard);
}

/** 1人3枚＋必ず渡す系を1枚以上 */
function dealHands(room) {
  for (const p of playerList(room)) {
    p.hand = [];
    p.koukaNashiCount = 0;
    p.cardsUsedThisMatch = 0;
    const carry = p.carryOver;
    p.carryChoicePending = false;
    if (carry) {
      const inst = makeInstance(carry.cardId, {
        usesLeft: carry.usesLeft,
      });
      giveCard(room, p, inst);
      if (carry.cardId === "hanzai") room.hanzaiDrawn = true;
      pushLog(
        room,
        `⛵ ${p.name} が「${CARDS[carry.cardId]?.name}」を持ち越した`
      );
      p.carryOver = null;
    }
    while (p.hand.length < 3) {
      giveCard(room, p, drawCard(room, p.id));
    }
    if (!hasPassCard(p.hand)) {
      const idxs = p.hand
        .map((_, i) => i)
        .filter((i) => !(carry && i === 0));
      const idx = idxs.length
        ? idxs[(Math.random() * idxs.length) | 0]
        : 0;
      const old = p.hand[idx];
      if (old?.cardId === "kouka_nashi") {
        p.koukaNashiCount = Math.max(0, (p.koukaNashiCount || 1) - 1);
      }
      p.hand[idx] = drawCard(room, p.id, { forcePass: true });
      if (p.hand[idx].cardId === "kouka_nashi") {
        p.koukaNashiCount = (p.koukaNashiCount || 0) + 1;
      }
    }
  }
}

function maybeTransformJitaku(room) {
  const players = playerList(room);
  const allUsed = players.every((p) => (p.cardsUsedThisMatch || 0) >= 1);
  if (!allUsed) return;
  if (players.length <= 4) {
    const total = players.reduce(
      (s, p) => s + (p.cardsUsedThisMatch || 0),
      0
    );
    if (total < 5) return;
  }
  const hiPool = [...CARDS_BY_RANK.S, ...CARDS_BY_RANK.SSS].filter(
    (c) => !(c.oncePerMatch && room.hanzaiDrawn) && !c.unusable
  );
  if (!hiPool.length) return;
  for (const p of players) {
    for (let i = 0; i < p.hand.length; i++) {
      if (p.hand[i].cardId !== "jitaku") continue;
      const def = hiPool[(Math.random() * hiPool.length) | 0];
      if (def.oncePerMatch) room.hanzaiDrawn = true;
      p.hand[i] = makeInstance(def.id);
      pushLog(room, `🏠 ${p.name} の自宅警備員が「${def.name}」に進化！`);
    }
  }
}

/** 杯数が少ない人ほど最初に選ばれやすい */
function pickFirstHolder(room) {
  const players = playerList(room);
  const weights = players.map((p) => {
    const cups = room.drinkTotals.get(p.id) || 0;
    // 0杯 → 重み高、杯数増で下がる
    return 1 / (1 + cups);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i].id;
  }
  return players[players.length - 1].id;
}

function neighborsOf(room, playerId) {
  const list = playerList(room);
  const idx = list.findIndex((p) => p.id === playerId);
  if (idx < 0 || list.length < 2) return [];
  const left = list[(idx - 1 + list.length) % list.length];
  const right = list[(idx + 1) % list.length];
  const ids = new Set([left.id, right.id]);
  ids.delete(playerId);
  return [...ids];
}

/** ランダム候補（自分以外・ステルス除外・タイマン中はペアのみ） */
function randomTargets(room, fromId, { includeStealth = false } = {}) {
  let list = playerList(room).filter((p) => p.id !== fromId);
  if (room.taimanPair) {
    const pair = new Set(room.taimanPair);
    list = list.filter((p) => pair.has(p.id));
  }
  if (!includeStealth) {
    list = list.filter((p) => (p.stealthTurns || 0) <= 0);
  }
  return list;
}

function pickRandom(room, fromId) {
  const list = randomTargets(room, fromId);
  if (!list.length) return null;
  return list[(Math.random() * list.length) | 0].id;
}

function isValidTarget(room, fromId, targetId) {
  if (!targetId || targetId === fromId) return false;
  const t = getP(room, targetId);
  if (!t) return false;
  if (room.taimanPair) {
    const pair = new Set(room.taimanPair);
    if (!pair.has(targetId)) return false;
  }
  return true;
}

function canAffect(room, targetId) {
  const t = getP(room, targetId);
  if (!t) return false;
  return (t.stealthTurns || 0) <= 0;
}

function pushLog(room, text, extra = {}) {
  const entry = {
    id: uid(),
    text,
    at: Date.now(),
    ...extra,
  };
  room.matchLog = room.matchLog || [];
  room.matchLog.unshift(entry);
  if (room.matchLog.length > 60) room.matchLog.length = 60;
}

/** 全員に見える吹き出し用アナウンス */
export function setAnnounce(room, payload) {
  room.announce = {
    id: uid(),
    at: Date.now(),
    ...payload,
  };
}

export function setBotThinking(room, botId) {
  const bot = getP(room, botId);
  if (!bot) return;
  room.botThinking = {
    playerId: botId,
    name: bot.name,
    avatar: bot.avatar,
  };
}

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function captureEffectSnapshot(room) {
  return {
    amount: room.amount,
    holderId: room.holderId,
    lastPasserId: room.lastPasserId,
    taimanPair: room.taimanPair ? [...room.taimanPair] : null,
    bombCountdown: room.bombCountdown,
    esconPlayerId: room.esconPlayerId || null,
    pitouControllerId: room.pitouControllerId || null,
    turnCount: room.turnCount || 0,
    hanzaiDrawn: !!room.hanzaiDrawn,
    peekView: room.peekView ? cloneJson(room.peekView) : null,
    graveyard: cloneJson(room.graveyard || []),
    lastPlayed: room.lastPlayed ? { ...room.lastPlayed } : null,
    players: playerList(room).map((p) => ({
      id: p.id,
      hand: cloneJson(p.hand || []),
      stealthTurns: p.stealthTurns || 0,
      clockTurns: p.clockTurns || 0,
      invincibleMatches: p.invincibleMatches || 0,
      invincibleNext: p.invincibleNext || 0,
      hasNagabuchi: !!p.hasNagabuchi,
      bondWith: p.bondWith || null,
      koukaNashiCount: p.koukaNashiCount || 0,
      bomberImmune: !!p.bomberImmune,
      cardsUsedThisMatch: p.cardsUsedThisMatch || 0,
    })),
  };
}

function restoreEffectSnapshot(room, snap) {
  if (!snap) return;
  room.amount = snap.amount;
  room.holderId = snap.holderId;
  room.lastPasserId = snap.lastPasserId;
  room.taimanPair = snap.taimanPair ? [...snap.taimanPair] : null;
  room.bombCountdown = snap.bombCountdown;
  room.esconPlayerId = snap.esconPlayerId || null;
  room.pitouControllerId = snap.pitouControllerId || null;
  room.turnCount = snap.turnCount || 0;
  room.hanzaiDrawn = !!snap.hanzaiDrawn;
  room.peekView = snap.peekView ? cloneJson(snap.peekView) : null;
  room.graveyard = cloneJson(snap.graveyard || []);
  for (const ps of snap.players || []) {
    const p = getP(room, ps.id);
    if (!p) continue;
    p.hand = cloneJson(ps.hand || []);
    p.stealthTurns = ps.stealthTurns || 0;
    p.clockTurns = ps.clockTurns || 0;
    p.invincibleMatches = ps.invincibleMatches || 0;
    p.invincibleNext = ps.invincibleNext || 0;
    p.hasNagabuchi = !!ps.hasNagabuchi;
    p.bondWith = ps.bondWith || null;
    p.koukaNashiCount = ps.koukaNashiCount || 0;
    p.bomberImmune = !!ps.bomberImmune;
    p.cardsUsedThisMatch = ps.cardsUsedThisMatch || 0;
  }
}

function discardToGrave(room, instances, byPlayerId, reason) {
  for (const inst of instances) {
    room.graveyard.unshift({
      ...inst,
      byPlayerId,
      reason,
      at: Date.now(),
    });
  }
  if (room.graveyard.length > 40) room.graveyard.length = 40;
}

function removeFromHand(player, instanceId) {
  const i = player.hand.findIndex((h) => h.instanceId === instanceId);
  if (i < 0) return null;
  const [card] = player.hand.splice(i, 1);
  return card;
}

function tickTurnCounters(room, skip = {}) {
  room.turnCount = (room.turnCount || 0) + 1;
  for (const p of playerList(room)) {
    if (p.stealthTurns > 0 && p.id !== skip.stealthId) p.stealthTurns -= 1;
    if (p.clockTurns > 0 && p.id !== skip.clockId) p.clockTurns -= 1;
  }
  if (
    !skip.bomb &&
    room.bombCountdown != null &&
    room.bombCountdown > 0
  ) {
    room.bombCountdown -= 1;
  }
}

function passDrink(room, toId, fromId) {
  room.lastPasserId = fromId;
  room.holderId = toId;
  const to = getP(room, toId);
  const from = getP(room, fromId);
  pushLog(
    room,
    `🍺 ${from?.name || "?"} → ${to?.name || "?"}（×${room.amount}）`
  );
}

function maybeAutoLoseEmptyHand(room) {
  if (room.phase !== "playing") return false;
  const h = getP(room, room.holderId);
  if (!h || (h.hand || []).length > 0) return false;
  pushLog(room, `🏳️ ${h.name} は手札0枚のため自動で負け`);
  setAnnounce(room, {
    type: "lose",
    playerId: h.id,
    name: h.name,
    avatar: h.avatar || "",
    title: `${h.name} は手札0枚のため負け！`,
    body: `飲む量 ×${room.amount}`,
  });
  applyDrink(room, h.id, { forced: true });
  return true;
}

function multiplyAmount(room, n) {
  room.amount = Math.max(1, Math.round(room.amount * n));
}

function pushDrink(drinks, playerId, cups, reason, room) {
  const p = getP(room, playerId);
  if (p?.bomberImmune) {
    pushLog(room, `💫 ${p.name} は【免除】でスキップ（${reason}）`);
    return;
  }
  drinks.push({ playerId, cups, reason });
}

/** 飲む処理（無敵・運命共同体・長渕・犯罪者・効果なし・ボマー） */
function applyDrink(room, loserId, { forced = false, partnerIds = [] } = {}) {
  const amount = room.amount;
  const drinks = [];
  const loser = getP(room, loserId);
  if (!loser) return { drinks: [] };

  const invincible =
    (loser.invincibleMatches || 0) > 0 ||
    (loser.invincibleNext || 0) > 0;

  if (invincible) {
    const neigh = neighborsOf(room, loserId);
    for (const nid of neigh) {
      pushDrink(
        drinks,
        nid,
        amount,
        `${loser.name}の無敵により両隣`,
        room
      );
    }
    if (!neigh.length && !loser.bomberImmune) {
      pushDrink(drinks, loserId, amount, "無敵だが隣がいないので本人", room);
    }
    pushLog(room, `🛡️ ${loser.name} は無敵！両隣が飲む`);
  } else {
    pushDrink(
      drinks,
      loserId,
      amount,
      forced ? "強制負け" : "負け",
      room
    );
  }

  for (const pid of partnerIds) {
    if (pid === loserId) continue;
    pushDrink(drinks, pid, amount, "道連れ", room);
  }

  if (loser.hasNagabuchi) {
    const rid = pickRandom(room, loserId);
    if (rid) {
      pushDrink(drinks, rid, amount, "長渕", room);
      const rp = getP(room, rid);
      pushLog(room, `🎤 長渕発動！${rp?.name} も同量`);
    }
  }

  const bondedExtra = [];
  for (const d of drinks) {
    const p = getP(room, d.playerId);
    if (p?.bondWith) {
      const other = p.bondWith;
      if (
        !drinks.some(
          (x) => x.playerId === other && x.reason === "運命共同体"
        ) &&
        !bondedExtra.some((x) => x.playerId === other)
      ) {
        const op = getP(room, other);
        if (!op?.bomberImmune) {
          bondedExtra.push({
            playerId: other,
            cups: d.cups,
            reason: "運命共同体",
          });
        } else {
          pushLog(room, `💫 ${op.name} は【免除】（運命共同体）`);
        }
      }
    }
  }
  drinks.push(...bondedExtra);

  for (const p of playerList(room)) {
    const has = p.hand.some((h) => h.cardId === "hanzai");
    if (!has) continue;
    if (p.id === loserId) {
      pushDrink(
        drinks,
        p.id,
        amount,
        "犯罪者（自分が負けたので追加1杯＝計2倍相当）",
        room
      );
      pushLog(room, `🚔 犯罪者 ${p.name}：自分負けのため追加飲酒`);
    } else {
      pushDrink(drinks, p.id, amount, "犯罪者（負けた人の肩代わり）", room);
      pushLog(room, `🚔 犯罪者 ${p.name}：肩代わりで飲む`);
    }
  }

  for (const p of playerList(room)) {
    if ((p.koukaNashiCount || 0) >= 2) {
      for (const o of playerList(room)) {
        if (o.id === p.id) continue;
        pushDrink(
          drinks,
          o.id,
          amount * 2,
          `効果なし×2（${p.name}）`,
          room
        );
      }
      pushLog(room, `📦 ${p.name} の効果なし×2発動！他全員に倍量`);
      p.koukaNashiCount = 0;
    }
  }

  const merged = new Map();
  for (const d of drinks) {
    const cur = merged.get(d.playerId) || { cups: 0, reasons: [] };
    cur.cups += d.cups;
    cur.reasons.push(d.reason);
    merged.set(d.playerId, cur);
  }

  const resultDrinks = [];
  for (const [playerId, v] of merged) {
    const prev = room.drinkTotals.get(playerId) || 0;
    room.drinkTotals.set(playerId, prev + v.cups);
    resultDrinks.push({
      playerId,
      cups: v.cups,
      reasons: v.reasons,
      total: prev + v.cups,
    });
    const name = getP(room, playerId)?.name || "?";
    pushLog(room, `🍻 ${name} が ${v.cups}杯（合計${prev + v.cups}）`);
  }

  room.lastResult = {
    matchNumber: room.matchNumber,
    loserId,
    amount,
    drinks: resultDrinks,
    forced,
  };

  room.matchHistory = room.matchHistory || [];
  room.matchHistory.unshift({
    matchNumber: room.matchNumber,
    drinks: resultDrinks.map((d) => ({
      playerId: d.playerId,
      name: getP(room, d.playerId)?.name || "?",
      avatar: getP(room, d.playerId)?.avatar || "",
      cups: d.cups,
      reasons: d.reasons,
    })),
    log: (room.matchLog || []).slice(0, 25),
  });
  if (room.matchHistory.length > 12) room.matchHistory.length = 12;

  room.phase = "result";
  room.holderId = null;

  for (const p of playerList(room)) {
    if (p.invincibleMatches > 0) p.invincibleMatches -= 1;
    if (p.invincibleNext > 0) {
      p.invincibleMatches += p.invincibleNext;
      p.invincibleNext = 0;
    }
  }

  setupHanryuCarry(room);

  return { drinks: resultDrinks };
}

const RANK_ORDER = { SSS: 0, S: 1, A: 2, B: 3, C: 4 };

function bestCarryFromHand(hand) {
  const sorted = [...(hand || [])].sort((a, b) => {
    const ra = RANK_ORDER[CARDS[a.cardId]?.rank] ?? 9;
    const rb = RANK_ORDER[CARDS[b.cardId]?.rank] ?? 9;
    return ra - rb;
  });
  const c = sorted[0];
  if (!c) return null;
  return { cardId: c.cardId, usesLeft: c.usesLeft };
}

function setupHanryuCarry(room) {
  for (const p of playerList(room)) {
    p.carryChoicePending = false;
    const has = (p.hand || []).some((h) => h.cardId === "hanryu");
    if (!has || !(p.hand || []).length) continue;
    if (p.isBot) {
      p.carryOver = bestCarryFromHand(p.hand);
      if (p.carryOver) {
        pushLog(
          room,
          `⛵ ${p.name} が「${CARDS[p.carryOver.cardId]?.name}」を次の試合に持ち越す`
        );
      }
      continue;
    }
    p.carryOver = null;
    p.carryChoicePending = true;
  }
}

export function pickCarryOver(room, playerId, instanceId) {
  if (room.phase !== "result") return { error: "試合終了時のみ" };
  const p = getP(room, playerId);
  if (!p?.carryChoicePending) return { error: "持ち越しできません" };
  const inst = (p.hand || []).find((h) => h.instanceId === instanceId);
  if (!inst) return { error: "そのカードはありません" };
  p.carryOver = { cardId: inst.cardId, usesLeft: inst.usesLeft };
  p.carryChoicePending = false;
  pushLog(
    room,
    `⛵ ${p.name} が「${CARDS[inst.cardId]?.name}」を次の試合に持ち越す`
  );
  return { ok: true };
}

function autoFinishCarry(room) {
  for (const p of playerList(room)) {
    if (!p.carryChoicePending) continue;
    p.carryOver = bestCarryFromHand(p.hand);
    p.carryChoicePending = false;
    if (p.carryOver) {
      pushLog(
        room,
        `⛵ ${p.name} が「${CARDS[p.carryOver.cardId]?.name}」を次の試合に持ち越す`
      );
    }
  }
}

function resetMatchFlags(room) {
  room.amount = 1;
  room.graveyard = [];
  room.lastPlayed = null;
  room.lastPasserId = null;
  room.taimanPair = null;
  room.bombCountdown = null;
  room.hanzaiDrawn = false;
  room.pending = null;
  room.turnCount = 0;
  room.peekView = null;
  room.esconPlayerId = null;
  room.pitouControllerId = null;
  room.lastEffectSnapshot = null;
  room.matchLog = [];
  room.announce = null;
  room.botThinking = null;
  for (const p of playerList(room)) {
    p.stealthTurns = 0;
    p.clockTurns = 0;
    p.hasNagabuchi = false;
    p.bondWith = null;
    p.koukaNashiCount = 0;
    p.bomberImmune = false;
    p.cardsUsedThisMatch = 0;
  }
}

function startMatch(room) {
  resetMatchFlags(room);
  dealHands(room);
  room.matchNumber = (room.matchNumber || 0) + 1;
  room.holderId = pickFirstHolder(room);
  room.phase = "playing";
  room.lastResult = null;
  const h = getP(room, room.holderId);
  pushLog(
    room,
    `🎮 試合${room.matchNumber}開始！最初の酒は ${h?.name}（杯数が少ないほど出やすい）`
  );
}

export function listAvatars() {
  return AVATARS;
}

export function createRoom(hostName, avatar) {
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();
  const hostId = uid();
  const name = sanitizeName(hostName);
  /** @type {Room} */
  const room = {
    code: roomCode,
    hostId,
    players: new Map(),
    phase: "lobby",
    drinkTotals: new Map(),
    matchNumber: 0,
    amount: 1,
    holderId: null,
    lastPasserId: null,
    graveyard: [],
    matchLog: [],
    matchHistory: [],
    lastPlayed: null,
    taimanPair: null,
    bombCountdown: null,
    hanzaiDrawn: false,
    esconPlayerId: null,
    pending: null,
    lastResult: null,
    turnCount: 0,
    peekView: null,
    lastEffectSnapshot: null,
    pitouControllerId: null,
    botThinking: null,
  };
  room.players.set(hostId, {
    id: hostId,
    name,
    avatar: sanitizeAvatar(avatar),
    isHost: true,
    connected: true,
    isBot: false,
    taga: isTagaName(name),
    ushi: isUshiName(name),
    ...blankPlayerFields(),
  });
  room.drinkTotals.set(hostId, 0);
  rooms.set(roomCode, room);
  return { room, playerId: hostId };
}

/** パーティーから同じコード・同じIDでゲーム部屋を起こす */
export function createFromParty(partySnap) {
  const roomCode = String(partySnap.code || "").toUpperCase();
  if (!roomCode) return { error: "コードなし" };
  if (rooms.has(roomCode)) rooms.delete(roomCode);

  const room = {
    code: roomCode,
    hostId: partySnap.hostId,
    players: new Map(),
    phase: "lobby",
    drinkTotals: new Map(),
    matchNumber: 0,
    amount: 1,
    holderId: null,
    lastPasserId: null,
    graveyard: [],
    matchLog: [],
    matchHistory: [],
    lastPlayed: null,
    taimanPair: null,
    bombCountdown: null,
    hanzaiDrawn: false,
    esconPlayerId: null,
    pending: null,
    lastResult: null,
    turnCount: 0,
    peekView: null,
    lastEffectSnapshot: null,
    pitouControllerId: null,
    botThinking: null,
    partyOwned: true,
  };

  for (const p of partySnap.players || []) {
    room.players.set(p.id, {
      id: p.id,
      name: p.name,
      avatar: sanitizeAvatar(p.avatar),
      isHost: p.id === partySnap.hostId,
      connected: true,
      isBot: !!p.isBot,
      taga: isTagaName(p.name),
      ushi: isUshiName(p.name),
      ...blankPlayerFields(),
    });
    room.drinkTotals.set(p.id, Math.max(0, Number(p.drinkTotal) || 0));
  }
  rooms.set(roomCode, room);
  return { room };
}

export function exportDrinkTotals(room) {
  const o = {};
  for (const [id, n] of room.drinkTotals.entries()) o[id] = n || 0;
  return o;
}

export function destroyRoom(code) {
  rooms.delete(String(code || "").toUpperCase());
}

export function resetDrinkTotals(room) {
  for (const id of room.players.keys()) room.drinkTotals.set(id, 0);
}

function blankPlayerFields(extra = {}) {
  return {
    hand: [],
    stealthTurns: 0,
    clockTurns: 0,
    invincibleMatches: 0,
    invincibleNext: 0,
    hasNagabuchi: false,
    bondWith: null,
    koukaNashiCount: 0,
    bomberImmune: false,
    cardsUsedThisMatch: 0,
    carryOver: null,
    carryChoicePending: false,
    ...extra,
  };
}

export function addBot(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ追加できます" };
  if (room.players.size >= 10) return { error: "満員です（最大10人）" };

  const usedNames = new Set([...room.players.values()].map((p) => p.name));
  const name =
    BOT_NAMES.find((n) => !usedNames.has(n)) || `ダミー${room.players.size}`;
  const usedAvatars = new Set([...room.players.values()].map((p) => p.avatar));
  const avatar =
    AVATARS.find((a) => !usedAvatars.has(a)) ||
    AVATARS[(Math.random() * AVATARS.length) | 0];

  const botId = uid();
  room.players.set(botId, {
    id: botId,
    name,
    avatar,
    isHost: false,
    connected: true,
    isBot: true,
    taga: false,
    ushi: isUshiName(name),
    ...blankPlayerFields(),
  });
  room.drinkTotals.set(botId, 0);
  return { ok: true, botId };
}

export function removeBot(room, playerId, botId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ削除できます" };
  const bot = getP(room, botId);
  if (!bot?.isBot) return { error: "ダミーではありません" };
  room.players.delete(botId);
  room.drinkTotals.delete(botId);
  return { ok: true };
}

export function joinRoom(roomCode, name, avatar) {
  const room = rooms.get(String(roomCode || "").toUpperCase());
  if (!room) return { error: "ルームが見つかりません" };
  if (room.phase !== "lobby") return { error: "すでにゲーム開始済みです" };
  if (room.players.size >= 10) return { error: "満員です（最大10人）" };

  const playerId = uid();
  const n = sanitizeName(name);
  room.players.set(playerId, {
    id: playerId,
    name: n,
    avatar: sanitizeAvatar(avatar),
    isHost: false,
    connected: true,
    isBot: false,
    taga: isTagaName(n),
    ushi: isUshiName(n),
    ...blankPlayerFields(),
  });
  room.drinkTotals.set(playerId, 0);
  return { room, playerId };
}

export function getRoom(code) {
  return rooms.get(String(code || "").toUpperCase());
}

export function rejoinRoom(roomCode, playerId) {
  const room = rooms.get(String(roomCode || "").toUpperCase());
  if (!room) return { error: "ルームが見つかりません" };
  const p = getP(room, playerId);
  if (!p || p.isBot) return { error: "この部屋にいません" };
  p.connected = true;
  return { room, playerId };
}

export function kickFromLobby(room, hostId, targetId) {
  if (hostId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ削除できます" };
  if (targetId === hostId) return { error: "自分は削除できません" };
  const t = getP(room, targetId);
  if (!t) return { error: "いません" };
  room.players.delete(targetId);
  room.drinkTotals.delete(targetId);
  return { ok: true, kickedId: targetId, kickedName: t.name };
}

export function setConnected(room, playerId, connected) {
  const p = getP(room, playerId);
  if (p) p.connected = connected;
}

export function leaveRoom(room, playerId) {
  const p = getP(room, playerId);
  if (room.phase !== "lobby") {
    if (p && !p.isBot) p.connected = false;
    return room;
  }
  room.players.delete(playerId);
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return null;
  }
  if (room.hostId === playerId) {
    const next =
      playerList(room).find((x) => !x.isBot) || playerList(room)[0];
    room.hostId = next.id;
    next.isHost = true;
  }
  return room;
}

/** 今カードを使うべきボットID（酒持ち／ネフェルピトー） */
export function listBotsNeedingAction(room) {
  if (room.phase !== "playing") return [];
  const holder = getP(room, room.holderId);
  const pitou = room.pitouControllerId
    ? getP(room, room.pitouControllerId)
    : null;
  if (pitou && holder && pitou.id !== holder.id) {
    if (pitou.isBot) return [pitou.id];
    return [];
  }
  if (!holder?.isBot) return [];
  return [holder.id];
}

/**
 * ボットの1手（簡易AI）
 * 渡せるカード優先 → バフ → ダメなら負け
 */
export function playAsBot(room, botId) {
  const bot = getP(room, botId);
  if (!bot?.isBot) return { error: "botではない" };
  if (room.phase !== "playing") return { error: "プレイ中のみ" };

  const controlling =
    room.pitouControllerId === botId &&
    room.holderId &&
    room.holderId !== botId;
  if (!controlling && room.holderId !== botId) return { error: "酒がない" };

  room.botThinking = null;

  const owner = getP(room, controlling ? room.holderId : botId);
  if (!owner) return { error: "プレイヤーなし" };

  if (
    room.peekView?.viewerId === botId ||
    room.peekView?.extraViewerId === botId
  ) {
    room.peekView = null;
  }

  if ((owner.clockTurns || 0) > 0) {
    return admitLose(room, owner.id);
  }

  const playable = (owner.hand || []).filter((h) => !CARDS[h.cardId]?.unusable);
  if (!playable.length) {
    return admitLose(room, owner.id);
  }

  const preferPass = [
    "nocount",
    "howitt",
    "present",
    "baika",
    "kaisuken",
    "bommer",
    "pitou",
    "sanbai_gaeshi",
    "ichikabachi",
    "aho",
    "gouyoku",
    "muteki",
    "stealth",
    "boku_saikyo",
    "nagabuchi",
    "handes_otoko",
    "jigen_bakudan",
    "clock",
    "taiman",
    "unmei",
    "escon",
    "bochi_saguri",
    "copy",
    "nozoki",
    "koukan",
    "hanzawa",
    "hanryu",
  ];
  const avoid = new Set(["michizure"]);

  const ranked = [...playable].sort((a, b) => {
    const ia = preferPass.indexOf(a.cardId);
    const ib = preferPass.indexOf(b.cardId);
    const sa = ia < 0 ? 99 : ia;
    const sb = ib < 0 ? 99 : ib;
    return sa - sb;
  });

  for (const inst of ranked) {
    if (avoid.has(inst.cardId) && playable.length > 1) continue;
    const def = CARDS[inst.cardId];
    if (!def) continue;

    let effectId = def.id;
    if (effectId === "copy") {
      if (!room.lastPlayed) continue;
      effectId = room.lastPlayed.cardId;
      if (
        !effectId ||
        effectId === "copy" ||
        effectId === "nocount" ||
        CARDS[effectId]?.unusable
      )
        continue;
    }
    const effectDef = CARDS[effectId] || def;

    const opts = {};
    if (effectDef.needsTarget || effectId === "koukan") {
      const targets = randomTargets(room, owner.id).filter((t) =>
        canAffect(room, t.id)
      );
      if (!targets.length && effectDef.needsTarget) continue;
      if (targets.length) {
        opts.targetId = targets[(Math.random() * targets.length) | 0].id;
      }
    }

    if (effectDef.needsGravePick || effectId === "bochi_saguri") {
      const eligible = room.graveyard
        .slice(0, 5)
        .filter((g) => ["A", "B", "C"].includes(CARDS[g.cardId]?.rank));
      if (!eligible.length) continue;
      opts.graveInstanceIds = eligible
        .slice(0, Math.min(2, eligible.length))
        .map((g) => g.instanceId);
    }

    if (effectDef.needsExchange) {
      const otherHand = owner.hand.filter((h) => h.instanceId !== inst.instanceId);
      if (!otherHand.length || !opts.targetId) continue;
      const t = getP(room, opts.targetId);
      if (!t?.hand?.length) continue;
      opts.myCardId =
        otherHand[(Math.random() * otherHand.length) | 0].instanceId;
      opts.theirCardIndex = (Math.random() * t.hand.length) | 0;
    }

    if (effectId === "hanzawa" && !room.lastPasserId) continue;
    if (effectId === "nocount" && (!room.lastPlayed || !room.lastEffectSnapshot))
      continue;

    const result = playCard(room, botId, inst.instanceId, opts);
    if (result.ok) return result;
  }

  const michi = playable.find((h) => h.cardId === "michizure");
  if (michi) {
    const targets = randomTargets(room, botId);
    if (targets.length) {
      const result = playCard(room, botId, michi.instanceId, {
        targetId: targets[(Math.random() * targets.length) | 0].id,
      });
      if (result.ok) return result;
    }
  }

  return admitLose(room, botId);
}

export function startGame(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーのみ" };
  if (room.players.size < 2) return { error: "2人以上必要です" };
  startMatch(room);
  return { ok: true };
}

export function nextMatch(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "result") return { error: "結果画面のみ" };
  autoFinishCarry(room);
  startMatch(room);
  return { ok: true };
}

export function backToLobby(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  room._botKickScheduled = false;
  resetMatchFlags(room);
  room.phase = "lobby";
  room.holderId = null;
  room.lastResult = null;
  for (const p of playerList(room)) {
    p.hand = [];
    p.carryOver = null;
    p.carryChoicePending = false;
  }
  pushLog(room, "⛔ 主催者が試合を中止してロビーに戻しました");
  return { ok: true };
}

function findTheirCardIndex(target, opts) {
  if (!target?.hand?.length) return -1;
  if (opts.theirCardId) {
    return target.hand.findIndex((h) => h.instanceId === opts.theirCardId);
  }
  if (opts.theirCardIndex != null && opts.theirCardIndex !== "") {
    const i = Number(opts.theirCardIndex);
    if (Number.isInteger(i) && i >= 0 && i < target.hand.length) return i;
  }
  return -1;
}

function validateExchange(room, player, playerId, usedInstanceId, opts) {
  if (!opts.targetId) {
    return { error: "交換する相手とカードを選んでください", needExchange: true };
  }
  const t = getP(room, opts.targetId);
  if (!t || t.id === playerId) {
    return { error: "その相手は選べません", needExchange: true };
  }
  if (!isValidTarget(room, playerId, opts.targetId)) {
    return { error: "その相手は選べません", needExchange: true };
  }
  if (!canAffect(room, opts.targetId)) {
    return { error: "相手はステルス中です" };
  }
  const others = player.hand.filter((h) => h.instanceId !== usedInstanceId);
  if (!others.length) {
    return { error: "交換する自分のカードが他にありません" };
  }
  if (!opts.myCardId) {
    return { error: "交換する自分のカードを選んでください", needExchange: true };
  }
  const myIdx = player.hand.findIndex(
    (h) => h.instanceId === opts.myCardId && h.instanceId !== usedInstanceId
  );
  if (myIdx < 0) {
    return { error: "交換する自分のカードが見つかりません", needExchange: true };
  }
  if (!t.hand.length) {
    return { error: "相手の手札が空です" };
  }
  return { ok: true, target: t, myIdx };
}

/**
 * カード使用
 * opts: { targetId, graveInstanceIds, myCardId, theirCardId, theirCardIndex }
 */
export function playCard(room, actorId, instanceId, opts = {}) {
  if (room.phase !== "playing") return { error: "プレイ中のみ" };
  if (room.pending) return { error: "選択待ちです" };

  const holderId = room.holderId;
  const pitouId = room.pitouControllerId;
  const pitouTakesOver = !!(pitouId && holderId && pitouId !== holderId);
  if (pitouTakesOver) {
    if (actorId !== pitouId) {
      const n = getP(room, pitouId)?.name || "ネフェルピトー";
      return { error: `${n} がカードを選んでいます` };
    }
  } else if (holderId !== actorId) {
    return { error: "酒が回ってきていません" };
  }

  const playerId = holderId;
  const player = getP(room, playerId);
  const actor = getP(room, actorId);
  if (!player) return { error: "プレイヤーなし" };
  if ((player.clockTurns || 0) > 0) {
    return { error: "クロック中はカードを使えません（負けボタンか待機）" };
  }

  const inst = player.hand.find((h) => h.instanceId === instanceId);
  if (!inst) return { error: "そのカードは持っていません" };
  const def = CARDS[inst.cardId];
  if (!def) return { error: "不明なカード" };
  if (def.unusable) {
    return {
      error: `${def.name}は手札に持っているだけで発動します（使えません）`,
    };
  }

  // コピーは直前カードの定義で動く
  let effectId = def.id;
  let effectDef = def;
  if (def.id === "copy") {
    if (!room.lastPlayed) return { error: "直前のカードがありません" };
    effectId = room.lastPlayed.cardId;
    effectDef = CARDS[effectId];
    if (
      !effectDef ||
      effectId === "copy" ||
      effectId === "nocount" ||
      effectDef.unusable
    ) {
      return { error: "コピーできないカードです" };
    }
  }

  // 対象が必要なカード
  if (
    effectDef.needsTarget &&
    !opts.targetId &&
    !["bochi_saguri"].includes(effectId)
  ) {
    return { error: "対象を選んでください", needTarget: true };
  }
  if (effectDef.needsTarget && opts.targetId) {
    if (!isValidTarget(room, playerId, opts.targetId)) {
      return { error: "その相手は選べません" };
    }
    if (!canAffect(room, opts.targetId) && effectId !== "nozoki") {
      // 覗き見はステルスでも？ → カード影響なのでステルスは無効
      return { error: "相手はステルス中です" };
    }
    if (effectId === "nozoki" && !canAffect(room, opts.targetId)) {
      return { error: "相手はステルス中です" };
    }
  }

  if (effectDef.needsGravePick) {
    const eligible = room.graveyard
      .slice(0, 5)
      .filter((g) => {
        const r = CARDS[g.cardId]?.rank;
        return r === "A" || r === "B" || r === "C";
      });
    if (!opts.graveInstanceIds || opts.graveInstanceIds.length === 0) {
      if (!eligible.length) return { error: "拾える捨て札がありません" };
      // クライアントに候補を返すため pending にせずエラー+候補
      return {
        error: "捨て札を選んでください",
        needGravePick: true,
        graveOptions: eligible.slice(0, 5).map((g) => publicCard(g.cardId, g.instanceId)),
      };
    }
  }

  if (effectDef.needsExchange) {
    const ex = validateExchange(room, player, playerId, instanceId, opts);
    if (ex.error) return ex;
  }

  // 手札から除去
  const used = removeFromHand(player, instanceId);
  if (!used) return { error: "手札エラー" };

  // 回数券: 残回数があれば手札に戻す
  let returnedKaisukenInst = null;
  if (def.id === "kaisuken" || (def.id === "copy" && effectId === "kaisuken")) {
    const left = (used.usesLeft ?? 2) - 1;
    if (left > 0) {
      returnedKaisukenInst = makeInstance("kaisuken", { usesLeft: left });
      player.hand.push(returnedKaisukenInst);
      pushLog(room, `🎫 回数券の残り ${left} 回`);
    }
  }

  if (!returnedKaisukenInst || def.id !== "kaisuken") {
    discardToGrave(room, [used], playerId, "play");
  } else {
    discardToGrave(
      room,
      [{ ...used, instanceId: uid() }],
      playerId,
      "kaisuken-use"
    );
  }

  player.cardsUsedThisMatch = (player.cardsUsedThisMatch || 0) + 1;

  const snapshot = captureEffectSnapshot(room);
  const result = resolveEffect(room, playerId, effectId, opts);

  if (result.error) {
    player.hand.push(used);
    const gi = room.graveyard.findIndex((g) => g.instanceId === used.instanceId);
    if (gi >= 0) room.graveyard.splice(gi, 1);
    player.cardsUsedThisMatch = Math.max(
      0,
      (player.cardsUsedThisMatch || 1) - 1
    );
    return result;
  }

  if (effectId === "nocount") {
    if (player.hand.some((h) => h.instanceId === used.instanceId)) {
      removeFromHand(player, used.instanceId);
    }
    if (!room.graveyard.some((g) => g.instanceId === used.instanceId)) {
      discardToGrave(room, [used], playerId, "play");
    }
    player.cardsUsedThisMatch = (player.cardsUsedThisMatch || 0) + 1;
  }

  room.lastEffectSnapshot = snapshot;

  room.lastPlayed = {
    cardId: effectId,
    displayCardId: effectId,
    viaCopy: def.id === "copy",
    playerId,
    name: player.name,
    kaisukenReturnedId: returnedKaisukenInst?.instanceId || null,
  };

  const playedName =
    def.id === "copy" ? `コピー→${effectDef.name}` : effectDef.name;
  const viaPitou =
    actorId !== playerId && actor
      ? `（${actor.name}が選択）`
      : "";
  pushLog(
    room,
    `🃏 ${player.name} が「${playedName} ${effectDef.effect}」を使用${viaPitou}`,
    { cardId: effectDef.id, playerId }
  );

  if (room.peekView && actorId !== playerId) {
    room.peekView.extraViewerId = actorId;
  }

  if (result.ichikabachi === true) {
    setAnnounce(room, {
      type: "card",
      result: "success",
      playerId,
      name: player.name,
      avatar: player.avatar,
      rank: effectDef.rank,
      cardName: playedName,
      body: `${result.targetName || "相手"} に渡した！`,
      title: `${player.name} の一か八か 成功！`,
    });
  } else if (result.ichikabachi === false) {
    setAnnounce(room, {
      type: "card",
      result: "fail",
      playerId,
      name: player.name,
      avatar: player.avatar,
      rank: effectDef.rank,
      cardName: playedName,
      body: "失敗…自分に戻った",
      title: `${player.name} の一か八か 失敗…`,
    });
  } else {
    setAnnounce(room, {
      type: "card",
      playerId,
      name: player.name,
      avatar: player.avatar,
      rank: effectDef.rank,
      cardName: playedName,
      body: result.announceBody || effectDef.effect,
      title: `${player.name} が「${playedName}」のカードを使った${viaPitou}`,
    });
  }

  tickTurnCounters(room, {
    stealthId: effectId === "stealth" ? playerId : null,
    clockId: effectId === "clock" ? opts.targetId : null,
    bomb: effectId === "jigen_bakudan",
  });

  const bombHit =
    room.bombCountdown != null && room.bombCountdown === 0;

  // エスコンは使った本人だけ: 自分ターン継続カード（エスコン自身も含む）→ ランダム渡し
  if (
    room.phase === "playing" &&
    room.esconPlayerId === playerId &&
    effectDef.keepsTurn &&
    room.holderId === playerId
  ) {
    let rid = pickRandom(room, playerId);
    if (!rid) {
      const fallback = randomTargets(room, playerId, { includeStealth: true });
      rid = fallback[(Math.random() * fallback.length) | 0]?.id;
    }
    if (rid) {
      pushLog(room, `📡 エスコン効果！自分ターン継続→ランダム渡し`);
      passDrink(room, rid, playerId);
    }
  }

  maybeTransformJitaku(room);

  if (bombHit && room.phase === "playing") {
    pushLog(room, `💥 時限爆弾が爆発！${player.name} 強制負け`);
    applyDrink(room, playerId, { forced: true });
    return { ok: true, exploded: true };
  }

  maybeAutoLoseEmptyHand(room);

  return { ok: true, ...result };
}

function resolveEffect(room, playerId, effectId, opts) {
  const player = getP(room, playerId);

  switch (effectId) {
    case "boku_saikyo": {
      player.invincibleMatches = Math.max(player.invincibleMatches || 0, 1);
      player.invincibleNext = Math.max(player.invincibleNext || 0, 1);
      pushLog(room, `👑 ${player.name}：今試合＋次試合無敵`);
      // 番は渡さない（特に指定なし→酒はそのまま）
      return {};
    }
    case "handes_otoko": {
      for (const o of playerList(room)) {
        if (o.id === playerId) continue;
        if (!canAffect(room, o.id)) continue;
        const n = Math.min(2, o.hand.length);
        const shuffled = shuffle(o.hand);
        const drop = shuffled.slice(0, n);
        o.hand = shuffled.slice(n);
        discardToGrave(room, drop, o.id, "handes");
        pushLog(room, `🗑️ ${o.name} の手札を${drop.length}枚破棄`);
      }
      return {};
    }
    case "bommer": {
      multiplyAmount(room, 5);
      player.bomberImmune = true;
      const rid = pickRandom(room, playerId);
      if (!rid) return { error: "渡せる相手がいません" };
      pushLog(room, `💣 ${player.name} ボマー！量×5・特殊効果【免除】`);
      passDrink(room, rid, playerId);
      return {};
    }
    case "muteki": {
      player.invincibleMatches = Math.max(player.invincibleMatches || 0, 1);
      pushLog(room, `🛡️ ${player.name}：この試合無敵`);
      return {};
    }
    case "sanbai_gaeshi": {
      multiplyAmount(room, 3);
      passDrink(room, opts.targetId, playerId);
      return {};
    }
    case "bochi_saguri": {
      const want = opts.graveInstanceIds || [];
      const taken = [];
      for (const gid of want.slice(0, 2)) {
        const idx = room.graveyard.findIndex((g) => g.instanceId === gid);
        if (idx < 0) continue;
        const g = room.graveyard[idx];
        const r = CARDS[g.cardId]?.rank;
        if (!["A", "B", "C"].includes(r)) continue;
        room.graveyard.splice(idx, 1);
        const fresh = makeInstance(g.cardId);
        giveCard(room, player, fresh);
        taken.push(CARDS[g.cardId].name);
      }
      if (!taken.length) return { error: "拾えるカードがありませんでした" };
      pushLog(room, `⚰️ ${player.name} が墓地から ${taken.join("・")} を入手`);
      return {};
    }
    case "hanzai": {
      // 持っているだけで終了時効果。使用しても手札から消えるので「使用」は弱い。
      // 仕様: カードとして場に出したら意味薄い → 使用ではなくキープ想定だが、
      // ユーザーが使う場合は「宣言して手札に戻す」ではなく、使用したら墓地行き。
      // → 犯罪者は「持っている」必要があるので、使用しても効果なしで墓地へ（損）。
      // より良く: 使用不可にしておく…が手札にあるだけで発動するので play は非推奨。
      pushLog(room, `🚔 ${player.name} が犯罪者を出した（持っていないと終了時効果なし）`);
      return {};
    }
    case "gouyoku": {
      giveCard(room, player, drawCard(room, playerId));
      giveCard(room, player, drawCard(room, playerId));
      pushLog(room, `📚 ${player.name} が2枚ドロー`);
      return {};
    }
    case "nagabuchi": {
      player.hasNagabuchi = true;
      pushLog(room, `🎤 ${player.name} に長渕セット`);
      return {};
    }
    case "taiman": {
      room.taimanPair = [playerId, opts.targetId];
      const t = getP(room, opts.targetId);
      pushLog(room, `⚔️ タイマン！${player.name} vs ${t?.name}`);
      return {};
    }
    case "clock": {
      const t = getP(room, opts.targetId);
      if (!canAffect(room, opts.targetId)) return { error: "ステルス中" };
      t.clockTurns = Math.max(t.clockTurns || 0, 2);
      pushLog(room, `⏰ ${t.name} は2ターンカード使用不可`);
      // 自分のターン = 酒キープ
      return {};
    }
    case "stealth": {
      player.stealthTurns = Math.max(player.stealthTurns || 0, 3);
      pushLog(room, `👻 ${player.name} ステルス3ターン`);
      return {};
    }
    case "kaisuken": {
      const rid = pickRandom(room, playerId);
      if (!rid) return { error: "渡せる相手がいません" };
      pushLog(room, `🎫 回数券！ランダムに渡す`);
      passDrink(room, rid, playerId);
      return {};
    }
    case "present": {
      passDrink(room, opts.targetId, playerId);
      return {};
    }
    case "baika": {
      multiplyAmount(room, 2);
      const rid = pickRandom(room, playerId);
      if (!rid) return { error: "渡せる相手がいません" };
      passDrink(room, rid, playerId);
      return {};
    }
    case "jigen_bakudan": {
      // このカードのあと「3枚目」→ 次の3回のカード使用で爆発
      room.bombCountdown = 3;
      pushLog(room, `💣 時限爆弾セット（あと3枚使用で爆発）`);
      return {};
    }
    case "hanzawa": {
      if (!room.lastPasserId || !getP(room, room.lastPasserId)) {
        return { error: "返せる相手がいません（最初の人は使えない）" };
      }
      discardToGrave(room, [...player.hand], playerId, "hanzawa");
      player.hand = [];
      passDrink(room, room.lastPasserId, playerId);
      pushLog(room, `💼 半沢！手札全捨てで返した`);
      return {};
    }
    case "unmei": {
      const t = getP(room, opts.targetId);
      if (!canAffect(room, opts.targetId)) return { error: "ステルス中" };
      player.bondWith = opts.targetId;
      t.bondWith = playerId;
      pushLog(room, `🔗 運命共同体 ${player.name} ⇔ ${t.name}`);
      return {};
    }
    case "michizure": {
      applyDrink(room, playerId, {
        partnerIds: [opts.targetId],
      });
      return {};
    }
    case "escon": {
      room.esconPlayerId = playerId;
      pushLog(
        room,
        `📡 エスコン発動！${player.name} が使う「自分ターン継続」だけランダム渡し`
      );
      return {};
    }
    case "howitt": {
      const rid = pickRandom(room, playerId);
      if (!rid) return { error: "渡せる相手がいません" };
      passDrink(room, rid, playerId);
      return {};
    }
    case "hanryu": {
      const rid = pickRandom(room, playerId);
      if (!rid) return { error: "渡せる相手がいません" };
      pushLog(room, `⛵ 帆龍！ランダムに渡す`);
      passDrink(room, rid, playerId);
      return {};
    }
    case "ichikabachi": {
      const t = getP(room, opts.targetId);
      const success = Math.random() < 0.5;
      if (success) {
        passDrink(room, opts.targetId, playerId);
        pushLog(room, `🎲 一か八か成功！${t?.name || "相手"} に渡した`);
      } else {
        pushLog(room, `🎲 一か八か失敗…自分に戻った`);
      }
      return {
        ichikabachi: success,
        targetName: t?.name || "相手",
      };
    }
    case "nocount": {
      const prev = room.lastPlayed;
      const undo = room.lastEffectSnapshot;
      if (!prev || !undo) {
        return { error: "無効にできる直前のカードがありません" };
      }
      const undoneName = CARDS[prev.cardId]?.name || prev.cardId;
      const undoneBy = prev.name || getP(room, prev.playerId)?.name || "相手";
      restoreEffectSnapshot(room, undo);
      if (getP(room, prev.playerId)) {
        room.holderId = prev.playerId;
      }
      if (prev.kaisukenReturnedId) {
        const owner = getP(room, prev.playerId);
        if (owner) {
          const gone = removeFromHand(owner, prev.kaisukenReturnedId);
          if (gone) {
            discardToGrave(room, [gone], prev.playerId, "nocount-kaisuken");
            pushLog(room, `🎫 ノーカウント！残っていた回数券は消えた`);
          }
        }
      }
      pushLog(
        room,
        `🚫 ノーカウント！${undoneBy} の「${undoneName}」を無効 → 手番を返した`
      );
      return {
        announceBody: `${undoneBy} の「${undoneName}」を無効にして手番を返した`,
      };
    }
    case "kouka_nashi": {
      pushLog(
        room,
        `⬜ 効果なし（${player.name} 収集 ${player.koukaNashiCount}/2・終了時発動）`
      );
      return {};
    }
    case "aho": {
      multiplyAmount(room, 2);
      pushLog(room, `🤪 あほ！量×2・自分の番継続`);
      return {};
    }
    case "nozoki": {
      const t = getP(room, opts.targetId);
      room.peekView = {
        viewerId: playerId,
        targetId: opts.targetId,
        hand: t.hand.map((h) => publicCard(h.cardId, h.instanceId)),
      };
      pushLog(room, `👀 ${player.name} が ${t.name} の手札を覗き見`);
      return { peeked: true };
    }
    case "koukan": {
      const t = getP(room, opts.targetId);
      if (!t) return { error: "相手が見つかりません" };
      if (!canAffect(room, opts.targetId)) return { error: "ステルス中" };
      if (!t.hand.length) return { error: "相手の手札が空です" };
      const myIdx = player.hand.findIndex(
        (h) => h.instanceId === opts.myCardId
      );
      if (myIdx < 0) {
        return { error: "交換する自分のカードが見つかりません" };
      }
      const theirIdx = (Math.random() * t.hand.length) | 0;
      const mine = player.hand[myIdx];
      const theirs = t.hand[theirIdx];
      player.hand[myIdx] = theirs;
      t.hand[theirIdx] = mine;
      if (theirs.cardId === "kouka_nashi") {
        player.koukaNashiCount = (player.koukaNashiCount || 0) + 1;
      }
      if (mine.cardId === "kouka_nashi") {
        t.koukaNashiCount = (t.koukaNashiCount || 0) + 1;
      }
      pushLog(
        room,
        `🔄 ${player.name} ⇔ ${t.name} 「${CARDS[mine.cardId]?.name}」と「${CARDS[theirs.cardId]?.name}」を交換`
      );
      return {};
    }
    case "pitou": {
      room.pitouControllerId = playerId;
      pushLog(
        room,
        `👑 ネフェルピトー！${player.name} が全員のカード選択権を得た`
      );
      return {};
    }
    case "jitaku": {
      pushLog(
        room,
        `🏠 自宅警備員…まだ全員がカードを使っていないため効果なし`
      );
      return {};
    }
    default:
      return { error: "未実装の効果です" };
  }
}

export function clearPeek(room, playerId) {
  if (
    room.peekView?.viewerId === playerId ||
    room.peekView?.extraViewerId === playerId
  ) {
    room.peekView = null;
  }
  return { ok: true };
}

export function admitLose(room, playerId) {
  if (room.phase !== "playing") return { error: "プレイ中のみ" };
  const holderId = room.holderId;
  const asPitou =
    !!room.pitouControllerId &&
    room.pitouControllerId === playerId &&
    holderId &&
    holderId !== playerId;
  if (holderId !== playerId && !asPitou) {
    return { error: "酒が回ってきていません" };
  }
  const loser = getP(room, holderId);
  const actor = getP(room, playerId);
  if (!loser) return { error: "プレイヤーなし" };
  if (asPitou) {
    pushLog(
      room,
      `🏳️ ネフェルピトー ${actor?.name} が ${loser.name} の負けを認めた`
    );
    setAnnounce(room, {
      type: "lose",
      playerId: holderId,
      name: loser.name,
      avatar: loser.avatar || "",
      title: `${actor?.name || "?"} が ${loser.name} の負けを認めた！`,
      body: `飲む量 ×${room.amount}`,
    });
  } else {
    pushLog(room, `🏳️ ${loser.name} が負けを認めた`);
    setAnnounce(room, {
      type: "lose",
      playerId: holderId,
      name: loser.name,
      avatar: loser.avatar || "",
      title: `${loser.name} が負けを認めた！`,
      body: `飲む量 ×${room.amount}`,
    });
  }
  applyDrink(room, holderId, { forced: false });
  return { ok: true };
}

export function publicState(room, viewerId) {
  const viewer = getP(room, viewerId);
  const players = playerList(room).map((p) => {
    const bondPartner = p.bondWith ? getP(room, p.bondWith) : null;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      connected: p.connected,
      handCount: p.hand?.length || 0,
      drinkTotal: room.drinkTotals.get(p.id) || 0,
      hasDrink: room.holderId === p.id,
      stealthTurns: p.stealthTurns || 0,
      clockTurns: p.clockTurns || 0,
      invincible: (p.invincibleMatches || 0) > 0,
      hasNagabuchi: !!p.hasNagabuchi,
      bondWith: p.bondWith,
      bondName: bondPartner?.name || null,
      bomberImmune: !!p.bomberImmune,
      koukaNashiCount: p.koukaNashiCount || 0,
      taga: !!p.taga,
      isBot: !!p.isBot,
    };
  });

  const myHand =
    viewer?.hand?.map((h) =>
      publicCard(h.cardId, h.instanceId, { usesLeft: h.usesLeft })
    ) || [];

  const graveTop = room.graveyard.slice(0, 5).map((g) => ({
    ...publicCard(g.cardId, g.instanceId),
    byPlayerId: g.byPlayerId,
  }));

  const fieldStatuses = [];
  if (room.esconPlayerId) {
    const en = getP(room, room.esconPlayerId)?.name || "?";
    fieldStatuses.push(
      `エスコン発動中（${en} の自分ターン継続→ランダム渡し）`
    );
  }
  if (room.pitouControllerId) {
    const pn = getP(room, room.pitouControllerId)?.name || "?";
    fieldStatuses.push(`ネフェルピトー ${pn} が全員のカードを選択中`);
  }
  if (room.taimanPair) {
    const [a, b] = room.taimanPair;
    fieldStatuses.push(
      `タイマン ${getP(room, a)?.name || "?"} vs ${getP(room, b)?.name || "?"}`
    );
  }
  if (room.bombCountdown != null) {
    fieldStatuses.push(`時限爆弾 残${room.bombCountdown}`);
  }
  const exempt = playerList(room).filter((p) => p.bomberImmune);
  if (exempt.length) {
    fieldStatuses.push(
      `免除 ${exempt.map((p) => p.name).join("・")}（この試合飲まない）`
    );
  }

  return {
    game: "trap",
    code: room.code,
    phase: room.phase,
    you: viewerId,
    isHost: room.hostId === viewerId,
    players,
    matchNumber: room.matchNumber,
    amount: room.amount,
    holderId: room.holderId,
    yourTurn: room.phase === "playing" && room.holderId === viewerId,
    pitouControllerId: room.pitouControllerId || null,
    pitouPicking: !!(
      room.phase === "playing" &&
      room.pitouControllerId &&
      room.holderId &&
      room.pitouControllerId !== room.holderId &&
      viewerId === room.pitouControllerId
    ),
    pitouHand:
      room.phase === "playing" &&
      room.pitouControllerId &&
      room.holderId &&
      room.pitouControllerId !== room.holderId &&
      viewerId === room.pitouControllerId
        ? (getP(room, room.holderId)?.hand || []).map((h) =>
            publicCard(h.cardId, h.instanceId, { usesLeft: h.usesLeft })
          )
        : null,
    lastPasserId: room.lastPasserId,
    bombCountdown: room.bombCountdown,
    taimanPair: room.taimanPair,
    esconPlayerId: room.esconPlayerId || null,
    turnCount: room.turnCount,
    log: (room.matchLog || []).slice(0, 30),
    matchHistory: (room.matchHistory || []).slice(0, 8),
    fieldStatuses,
    announce: room.announce || null,
    botThinking: room.botThinking || null,
    lastPlayed: room.lastPlayed
      ? {
          playerId: room.lastPlayed.playerId,
          name: room.lastPlayed.name,
          card: publicCard(
            room.lastPlayed.displayCardId || room.lastPlayed.cardId,
            "last"
          ),
        }
      : null,
    myHand,
    graveTop,
    rankRates: { ...RANK_RATES },
    lastResult: room.lastResult,
    carryPending: !!(viewer?.carryChoicePending && room.phase === "result"),
    carryHand:
      viewer?.carryChoicePending && room.phase === "result"
        ? (viewer.hand || []).map((h) =>
            publicCard(h.cardId, h.instanceId, { usesLeft: h.usesLeft })
          )
        : null,
    carryPickedName: viewer?.carryOver
      ? CARDS[viewer.carryOver.cardId]?.name || null
      : null,
    carryWaiting: playerList(room)
      .filter((p) => p.carryChoicePending)
      .map((p) => p.name),
    peekView:
      room.peekView?.viewerId === viewerId ||
      room.peekView?.extraViewerId === viewerId
        ? room.peekView
        : null,
    avatars: AVATARS,
  };
}
