import {
  fetchRanking,
  pickCandidates,
  searchRankings,
  getCatalogEntry,
} from "./catalog.js";
import { matchItems, suggestCandidates } from "./match.js";

const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰"];
const BOT_NAMES = [
  "ダミー太郎",
  "ダミー花子",
  "テスト三郎",
  "試し子",
  "のんべえ",
  "かんぱい君",
];
const MISS_RANK = 22;

/** @type {Map<string, object>} */
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

function alivePlayers(room) {
  return [...room.players.values()].filter((p) => p.connected !== false);
}

function getP(room, id) {
  return room.players.get(id);
}

function requireHost(room, playerId) {
  return room.hostId === playerId;
}

function blankPlayer(id, name, avatar, isHost, isBot) {
  return {
    id,
    name,
    avatar,
    isHost,
    isBot,
    connected: true,
    cards: [],
    total: 0,
    busted: false,
    stood: false,
    actedThisDraw: false,
    drinkTotal: 0,
    drinksThisRound: 0,
    _rawAnswer: "",
  };
}

export function createRoom(name, avatar) {
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();
  const playerId = uid();
  const room = {
    code: roomCode,
    hostId: playerId,
    players: new Map(),
    phase: "lobby",
    playStep: null,
    topicChoices: [],
    lastChoiceSlugs: [],
    currentTopic: null,
    judgeQueue: [],
    result: null,
    match: 0,
    draw: 0,
    dealRevealed: false,
    bannedNames: new Set(),
  };
  room.players.set(
    playerId,
    blankPlayer(playerId, sanitizeName(name), sanitizeAvatar(avatar), true, false)
  );
  rooms.set(roomCode, room);
  return { room, playerId };
}

export function createFromParty(partySnap) {
  const roomCode = String(partySnap.code || "").toUpperCase();
  if (!roomCode) return { error: "コードなし" };
  if (rooms.has(roomCode)) rooms.delete(roomCode);

  const room = {
    code: roomCode,
    hostId: partySnap.hostId,
    players: new Map(),
    phase: "lobby",
    playStep: null,
    topicChoices: [],
    lastChoiceSlugs: [],
    currentTopic: null,
    judgeQueue: [],
    result: null,
    match: 0,
    draw: 0,
    dealRevealed: false,
    bannedNames: new Set(),
    partyOwned: true,
  };

  for (const p of partySnap.players || []) {
    const bp = blankPlayer(
      p.id,
      p.name,
      sanitizeAvatar(p.avatar),
      p.id === partySnap.hostId,
      !!p.isBot
    );
    bp.drinkTotal = Math.max(0, Number(p.drinkTotal) || 0);
    room.players.set(p.id, bp);
  }
  rooms.set(roomCode, room);
  return { room };
}

export function exportDrinkTotals(room) {
  const o = {};
  for (const p of room.players.values()) o[p.id] = p.drinkTotal || 0;
  return o;
}

export function destroyRoom(code) {
  rooms.delete(String(code || "").toUpperCase());
}

export function resetDrinkTotals(room) {
  for (const p of room.players.values()) {
    p.drinkTotal = 0;
    p.drinksThisRound = 0;
  }
}

export function getRoom(roomCode) {
  return rooms.get(String(roomCode || "").toUpperCase()) || null;
}

export function rejoinRoom(roomCode, playerId) {
  const room = getRoom(roomCode);
  if (!room) return { error: "ルームが見つかりません" };
  const p = getP(room, playerId);
  if (!p || p.isBot) return { error: "この部屋にいません" };
  p.connected = true;
  return { room, playerId };
}

export function kickFromLobby(room, hostId, targetId) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ削除できます" };
  if (targetId === hostId) return { error: "自分は削除できません" };
  const t = getP(room, targetId);
  if (!t) return { error: "いません" };
  room.players.delete(targetId);
  return { ok: true, kickedId: targetId, kickedName: t.name };
}

export function joinRoom(roomCode, name, avatar) {
  const room = getRoom(roomCode);
  if (!room) return { error: "ルームが見つかりません" };
  if (room.phase !== "lobby") return { error: "ゲーム中です" };
  if (room.players.size >= 10) return { error: "満員です" };
  const playerId = uid();
  room.players.set(
    playerId,
    blankPlayer(playerId, sanitizeName(name), sanitizeAvatar(avatar), false, false)
  );
  return { room, playerId };
}

export function setConnected(room, playerId, connected) {
  const p = getP(room, playerId);
  if (p && !p.isBot) p.connected = connected;
  return room;
}

export function leaveRoom(room, playerId) {
  const p = getP(room, playerId);
  if (!p) return room;
  if (room.phase === "lobby" && !p.isBot) {
    room.players.delete(playerId);
    if (room.hostId === playerId) {
      const next = [...room.players.values()].find((x) => !x.isBot);
      if (next) {
        room.hostId = next.id;
        next.isHost = true;
      } else {
        rooms.delete(room.code);
        return null;
      }
    }
  }
  return room;
}

export function addBot(room, hostId) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ" };
  if (room.players.size >= 10) return { error: "満員です" };
  const used = new Set([...room.players.values()].map((p) => p.name));
  const name = BOT_NAMES.find((n) => !used.has(n)) || `PC${room.players.size}`;
  const id = uid();
  room.players.set(
    id,
    blankPlayer(id, name, AVATARS[room.players.size % AVATARS.length], false, true)
  );
  return { ok: true };
}

export function removeBot(room, hostId, botId) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  const p = getP(room, botId);
  if (!p?.isBot) return { error: "PCだけ削除できます" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ" };
  room.players.delete(botId);
  return { ok: true };
}

function refillTopics(room) {
  room.topicChoices = pickCandidates([], room.lastChoiceSlugs, 5);
  room.lastChoiceSlugs = room.topicChoices.map((c) => c.slug);
}

function resetHands(room, { keepTopic = false } = {}) {
  for (const p of room.players.values()) {
    p.cards = [];
    p.total = 0;
    p.busted = false;
    p.stood = false;
    p.actedThisDraw = false;
    p.drinksThisRound = 0;
    p._rawAnswer = "";
  }
  room.judgeQueue = [];
  room.result = null;
  room.dealRevealed = false;
  room.draw = 0;
  room.bannedNames = new Set();
  if (!keepTopic) room.currentTopic = null;
}

function playersWhoNeedAct(room) {
  return alivePlayers(room).filter((p) => {
    if (p.actedThisDraw) return false;
    if (room.draw === 2 && (p.stood || p.busted || p.total === 21)) return false;
    return true;
  });
}

function collectBanned(room) {
  const names = new Set();
  for (const p of alivePlayers(room)) {
    for (const c of p.cards) {
      if (c.miss || !c.name) continue;
      names.add(c.name);
    }
  }
  room.bannedNames = names;
}

function isBanned(room, item) {
  if (!room.bannedNames?.size) return false;
  const names = [item?.name, ...(item?.aliases || [])].filter(Boolean);
  return names.some((n) => room.bannedNames.has(n));
}

function beginDraw(room, draw) {
  room.draw = draw;
  room.dealRevealed = false;
  room.judgeQueue = [];
  room.playStep = "answering";
  if (draw === 2) collectBanned(room);
  for (const p of alivePlayers(room)) {
    if (draw === 2 && (p.stood || p.busted || p.total === 21)) {
      p.actedThisDraw = true;
      p.stood = true;
    } else {
      p.actedThisDraw = false;
    }
    p._rawAnswer = "";
  }
}

function maybeAdvance(room) {
  if (playersWhoNeedAct(room).length) {
    room.playStep = room.judgeQueue.length ? "gm_judge" : "answering";
    return;
  }
  if (room.judgeQueue.length) {
    room.playStep = "gm_judge";
    return;
  }
  room.dealRevealed = true;
  if (room.draw === 1) {
    const canSecond = alivePlayers(room).some(
      (p) => !p.busted && p.total !== 21
    );
    if (!canSecond) {
      finishMatch(room);
      return;
    }
    beginDraw(room, 2);
    return;
  }
  finishMatch(room);
}

export function startGame(room, hostId) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (alivePlayers(room).length < 2) return { error: "2人以上必要です" };
  room.phase = "playing";
  room.match = 1;
  resetHands(room);
  room.playStep = "pick_topic";
  refillTopics(room);
  return { ok: true };
}

export function refreshTopics(room, hostId) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (room.playStep !== "pick_topic") return { error: "今はお題選びではありません" };
  refillTopics(room);
  return { ok: true };
}

export async function searchTopics(room, hostId, q) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (room.playStep !== "pick_topic") return { error: "今はお題選びではありません" };
  const found = await searchRankings(q);
  if (!found.length) return { error: "見つかりませんでした" };
  room.topicChoices = found.slice(0, 8);
  room.lastChoiceSlugs = room.topicChoices.map((c) => c.slug);
  return { ok: true };
}

export async function pickTopic(room, hostId, slug) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (room.playStep !== "pick_topic") return { error: "今はお題選びではありません" };
  let data;
  try {
    data = await fetchRanking(slug);
  } catch (e) {
    return { error: e.message || "ランキングを取得できませんでした" };
  }
  const entry = getCatalogEntry(slug);
  room.currentTopic = {
    slug,
    title: data.title || entry?.title || slug,
    category: entry?.category || "",
    url: `https://ranking.net/rankings/${slug}`,
    items: data.items,
  };
  beginDraw(room, 1);
  return { ok: true };
}

function applyCard(room, player, item, { miss = false } = {}) {
  const rank = miss ? MISS_RANK : item.rank;
  const card = {
    slug: room.currentTopic.slug,
    rankingTitle: room.currentTopic.title,
    name: miss ? player._rawAnswer || "該当なし" : item.name,
    rank,
    miss,
    bust: rank > 21,
  };
  player.cards.push(card);
  player.total = player.cards.reduce((s, c) => s + c.rank, 0);
  player.busted = player.total > 21;
  player.actedThisDraw = true;
  if (player.busted || player.total === 21) player.stood = true;
  delete player._rawAnswer;
}

export function submitAnswer(room, playerId, text) {
  const p = getP(room, playerId);
  if (!p) return { error: "未参加" };
  if (room.playStep !== "answering" && room.playStep !== "gm_judge") {
    return { error: "今は回答できません" };
  }
  if (!room.currentTopic) return { error: "お題がありません" };
  if (p.actedThisDraw) return { error: "もう回答済みです" };
  if (room.draw === 2 && (p.stood || p.busted || p.total === 21)) {
    return { error: "この回はステイです" };
  }
  const answer = String(text || "").trim().slice(0, 40);
  if (!answer) return { error: "名前を入力してね" };
  const mine = new Set(p.cards.map((c) => c.name));
  if (mine.has(answer)) return { error: "同じ名前は2回使えません" };

  p._rawAnswer = answer;
  const result = matchItems(answer, room.currentTopic.items);
  if (result.auto) {
    if (mine.has(result.auto.name)) {
      return { error: "同じ項目は2回使えません" };
    }
    if (isBanned(room, result.auto)) {
      return { error: "1回目に出た項目は2回目使えません" };
    }
    applyCard(room, p, result.auto);
    maybeAdvance(room);
    return { ok: true, auto: true };
  }
  room.judgeQueue.push({
    playerId,
    text: answer,
    candidates: suggestCandidates(answer, room.currentTopic.items, 15),
  });
  p.actedThisDraw = true;
  room.playStep = "gm_judge";
  return { ok: true, auto: false };
}

export function stand(room, playerId) {
  const p = getP(room, playerId);
  if (!p) return { error: "未参加" };
  if (room.draw !== 2) return { error: "1回目は必ず回答します" };
  if (room.playStep !== "answering" && room.playStep !== "gm_judge") {
    return { error: "今はステイできません" };
  }
  if (p.actedThisDraw) return { error: "もう行動済みです" };
  if (!p.cards.length) return { error: "まだカードがありません" };
  p.stood = true;
  p.actedThisDraw = true;
  maybeAdvance(room);
  return { ok: true };
}

export function gmConfirm(room, hostId, { itemKey, miss } = {}) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (room.playStep !== "gm_judge") return { error: "今は判定ではありません" };
  const job = room.judgeQueue[0];
  if (!job) return { error: "判定待ちがありません" };
  const p = getP(room, job.playerId);
  if (!p) {
    room.judgeQueue.shift();
    maybeAdvance(room);
    return { ok: true };
  }
  if (miss) {
    applyCard(room, p, { rank: MISS_RANK, name: "該当なし" }, { miss: true });
  } else {
    const item = room.currentTopic.items.find(
      (it) => `${it.rank}:${it.name}` === itemKey
    );
    if (!item) return { error: "候補を選んでください" };
    if (isBanned(room, item)) {
      return { error: "1回目に出た項目は2回目使えません" };
    }
    applyCard(room, p, item);
  }
  room.judgeQueue.shift();
  maybeAdvance(room);
  return { ok: true };
}

function finishMatch(room) {
  const ps = alivePlayers(room);
  const busted = ps.filter((p) => p.busted);
  const has21 = ps.some((p) => !p.busted && p.total === 21);
  const cups = has21 ? 2 : 1;
  let losers;
  let reason;
  if (busted.length) {
    losers = busted;
    reason = "burst";
  } else {
    const min = Math.min(...ps.map((p) => p.total));
    losers = ps.filter((p) => p.total === min);
    reason = "lowest";
  }
  const loserIds = new Set(losers.map((p) => p.id));
  for (const p of ps) {
    p.drinksThisRound = loserIds.has(p.id) ? cups : 0;
    p.drinkTotal += p.drinksThisRound;
  }
  room.phase = "result";
  room.playStep = null;
  room.dealRevealed = true;
  room.result = {
    reason,
    cups,
    has21,
    loserIds: [...loserIds],
  };
}

export function nextRound(room, hostId) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  if (room.phase !== "result") return { error: "結果発表後です" };
  room.phase = "playing";
  room.match += 1;
  resetHands(room);
  room.playStep = "pick_topic";
  refillTopics(room);
  return { ok: true };
}

export function backToLobby(room, hostId) {
  if (!requireHost(room, hostId)) return { error: "主催者のみ" };
  room.phase = "lobby";
  room.playStep = null;
  room.currentTopic = null;
  room.judgeQueue = [];
  room.result = null;
  resetHands(room);
  room.match = 0;
  return { ok: true };
}

export function botAnswer(room, playerId) {
  const p = getP(room, playerId);
  if (!p?.isBot) return { error: "対象外" };
  if (p.actedThisDraw) return { error: "対象外" };
  if (room.draw === 2) {
    if (p.total >= 16) return stand(room, playerId);
    if (p.total >= 12 && Math.random() < 0.5) return stand(room, playerId);
  }
  const items = room.currentTopic?.items || [];
  const used = new Set(p.cards.map((c) => c.name));
  const available = items.filter(
    (it) => !used.has(it.name) && !isBanned(room, it)
  );
  const under = available.filter((it) => it.rank + p.total <= 21);
  const pool = under.length ? under : available;
  if (!pool.length) return submitAnswer(room, playerId, "該当なし");
  const pick = pool[(Math.random() * pool.length) | 0];
  return submitAnswer(room, playerId, pick.name);
}

export function listBotsNeedingAction(room) {
  if (room.phase !== "playing") return [];
  if (room.playStep !== "answering" && room.playStep !== "gm_judge") return [];
  return playersWhoNeedAct(room)
    .filter((p) => p.isBot)
    .map((p) => p.id);
}

export function publicState(room, viewerId) {
  const viewer = getP(room, viewerId);
  const isHost = viewer?.isHost;
  const pending = room.judgeQueue[0] || null;
  const needAct = new Set(playersWhoNeedAct(room).map((p) => p.id));

  const players = [...room.players.values()].map((p) => {
    const hideCurrent =
      !room.dealRevealed && room.phase === "playing";
    const visibleCards = hideCurrent
      ? p.cards.filter((_, i) => i < Math.max(room.draw - 1, 0))
      : p.cards;
    const visibleTotal = visibleCards.reduce((s, c) => s + c.rank, 0);
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === room.hostId,
      isBot: !!p.isBot,
      connected: p.connected !== false,
      cards: visibleCards,
      total: hideCurrent ? visibleTotal : p.total,
      busted: hideCurrent ? false : p.busted,
      stood: hideCurrent ? false : p.stood,
      actedThisDraw: p.actedThisDraw,
      waiting: needAct.has(p.id),
      drinkTotal: p.drinkTotal,
      drinksThisRound: p.drinksThisRound,
      cardCount: visibleCards.length,
    };
  });

  return {
    code: room.code,
    phase: room.phase,
    playStep: room.playStep,
    match: room.match,
    draw: room.draw,
    dealRevealed: room.dealRevealed,
    you: viewerId,
    isHost: !!isHost,
    canAnswer: needAct.has(viewerId) && (room.playStep === "answering" || room.playStep === "gm_judge"),
    canStay: room.draw === 2 && needAct.has(viewerId),
    players,
    topicChoices: isHost && room.playStep === "pick_topic" ? room.topicChoices : [],
    currentTopic: room.currentTopic
      ? {
          slug: room.currentTopic.slug,
          title: room.currentTopic.title,
          category: room.currentTopic.category,
          url: room.currentTopic.url,
          itemCount: room.currentTopic.items.length,
        }
      : null,
    gmItems:
      isHost && room.currentTopic
        ? room.currentTopic.items.map((it) => ({
            rank: it.rank,
            name: it.name,
            key: `${it.rank}:${it.name}`,
            banned: isBanned(room, it),
          }))
        : null,
    pending: pending
      ? {
          playerId: pending.playerId,
          playerName: getP(room, pending.playerId)?.name || "",
          text:
            isHost || pending.playerId === viewerId ? pending.text : "？？？",
          queueLen: room.judgeQueue.length,
          candidates: isHost
            ? pending.candidates.map((it) => ({
                rank: it.rank,
                name: it.name,
                key: `${it.rank}:${it.name}`,
                banned: isBanned(room, it),
              }))
            : [],
        }
      : null,
    bannedNames: [...(room.bannedNames || [])],
    resultItems:
      room.phase === "result" && room.currentTopic
        ? room.currentTopic.items
            .filter((it) => it.rank >= 1 && it.rank <= 21)
            .sort((a, b) => a.rank - b.rank)
            .map((it) => ({ rank: it.rank, name: it.name }))
        : [],
    result: room.result,
  };
}
