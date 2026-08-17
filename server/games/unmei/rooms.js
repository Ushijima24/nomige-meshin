import { VARIETY_TOPICS, LOVE_TOPICS } from "./topics.js";

const AVATARS = [
  "🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰",
  "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖",
  "👻", "🎃", "👽", "🤖",
];

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

const MAX_PLAYERS = 10;
const MIN_PLAYERS = 5;
const CONTINUE_MIN = 3;

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

function playerList(room) {
  return [...room.players.values()];
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blankRoomFields() {
  return {
    phase: "lobby",
    mode: "variety",
    revealStyle: "one",
    round: 0,
    topic: null,
    topicChoices: [],
    usedTopicIds: [],
    picks: new Map(),
    revealedIds: [],
    revealSeq: 0,
    lastReveal: null,
    activeIds: [],
    roundIds: [],
    pairs: [],
    drinks: [],
    resultKind: "",
    customDraft: "",
  };
}

function makePlayer(id, name, avatar, isHost, isBot, gender = null) {
  return {
    id,
    name,
    avatar,
    isHost,
    isBot: !!isBot,
    connected: true,
    gender: gender === "male" || gender === "female" ? gender : null,
  };
}

export function listAvatars() {
  return AVATARS;
}

export function getRoom(roomCode) {
  return rooms.get(String(roomCode || "").toUpperCase()) || null;
}

export function createRoom(hostName, avatar) {
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();
  const hostId = uid();
  const room = {
    code: roomCode,
    hostId,
    players: new Map(),
    drinkTotals: new Map(),
    ...blankRoomFields(),
  };
  room.players.set(
    hostId,
    makePlayer(hostId, sanitizeName(hostName), sanitizeAvatar(avatar), true, false)
  );
  room.drinkTotals.set(hostId, 0);
  rooms.set(roomCode, room);
  return { room, playerId: hostId };
}

export function createFromParty(partySnap) {
  const roomCode = String(partySnap.code || "").toUpperCase();
  if (!roomCode) return { error: "コードなし" };
  if (rooms.has(roomCode)) rooms.delete(roomCode);

  const room = {
    code: roomCode,
    hostId: partySnap.hostId,
    players: new Map(),
    drinkTotals: new Map(),
    partyOwned: true,
    ...blankRoomFields(),
  };

  for (const p of partySnap.players || []) {
    room.players.set(
      p.id,
      makePlayer(
        p.id,
        p.name,
        sanitizeAvatar(p.avatar),
        p.id === partySnap.hostId,
        !!p.isBot
      )
    );
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

export function joinRoom(roomCode, name, avatar) {
  const room = getRoom(roomCode);
  if (!room) return { error: "ルームが見つかりません" };
  if (room.phase !== "lobby") return { error: "すでにゲーム開始済みです" };
  if (room.players.size >= MAX_PLAYERS) return { error: "満員です（最大10人）" };
  const playerId = uid();
  room.players.set(
    playerId,
    makePlayer(playerId, sanitizeName(name), sanitizeAvatar(avatar), false, false)
  );
  room.drinkTotals.set(playerId, 0);
  return { room, playerId };
}

export function rejoinRoom(roomCode, playerId) {
  const room = getRoom(roomCode);
  if (!room) return { error: "ルームが見つかりません" };
  const p = room.players.get(playerId);
  if (!p || p.isBot) return { error: "この部屋にいません" };
  p.connected = true;
  return { room, playerId };
}

export function setConnected(room, playerId, connected) {
  const p = room.players.get(playerId);
  if (p && !p.isBot) p.connected = connected;
}

export function leaveRoom(room, playerId) {
  const p = room.players.get(playerId);
  if (!p) return room;
  if (room.phase !== "lobby") {
    if (!p.isBot) p.connected = false;
    return room;
  }
  room.players.delete(playerId);
  room.drinkTotals.delete(playerId);
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return null;
  }
  if (room.hostId === playerId) {
    const next = playerList(room).find((x) => !x.isBot) || playerList(room)[0];
    room.hostId = next.id;
    next.isHost = true;
  }
  return room;
}

export function kickFromLobby(room, hostId, targetId) {
  if (hostId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ削除できます" };
  if (targetId === hostId) return { error: "自分は削除できません" };
  const t = room.players.get(targetId);
  if (!t) return { error: "いません" };
  room.players.delete(targetId);
  room.drinkTotals.delete(targetId);
  return { ok: true, kickedId: targetId, kickedName: t.name };
}

function balanceBotGender(room) {
  const males = playerList(room).filter((p) => p.gender === "male").length;
  const females = playerList(room).filter((p) => p.gender === "female").length;
  if (males < females) return "male";
  if (females < males) return "female";
  return Math.random() < 0.5 ? "male" : "female";
}

export function addBot(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ追加できます" };
  if (room.players.size >= MAX_PLAYERS) return { error: "満員です（最大10人）" };
  const usedNames = new Set(playerList(room).map((p) => p.name));
  const name =
    BOT_NAMES.find((n) => !usedNames.has(n)) || `ダミー${room.players.size}`;
  const usedAvatars = new Set(playerList(room).map((p) => p.avatar));
  const avatar =
    AVATARS.find((a) => !usedAvatars.has(a)) ||
    AVATARS[(Math.random() * AVATARS.length) | 0];
  const botId = uid();
  const gender = room.mode === "love" ? balanceBotGender(room) : null;
  room.players.set(botId, makePlayer(botId, name, avatar, false, true, gender));
  room.drinkTotals.set(botId, 0);
  return { ok: true, botId };
}

export function removeBot(room, playerId, botId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ削除できます" };
  const bot = room.players.get(botId);
  if (!bot?.isBot) return { error: "ダミーではありません" };
  room.players.delete(botId);
  room.drinkTotals.delete(botId);
  return { ok: true };
}

export function setMode(room, playerId, mode) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ変更できます" };
  if (mode !== "variety" && mode !== "love") return { error: "不明なモード" };
  room.mode = mode;
  if (mode === "love") {
    for (const p of playerList(room)) {
      if (p.isBot && !p.gender) p.gender = balanceBotGender(room);
    }
  }
  return { ok: true };
}

export function setRevealStyle(room, playerId, style) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (style !== "one" && style !== "all") return { error: "不明な開票方法" };
  if (room.phase === "reveal" && room.revealedIds.length) {
    return { error: "開票が始まったら変更できません" };
  }
  if (!["lobby", "pick_topic", "choosing", "reveal"].includes(room.phase)) {
    return { error: "いまは変更できません" };
  }
  room.revealStyle = style;
  return { ok: true };
}

export function setGender(room, playerId, gender, targetId) {
  if (room.phase !== "lobby") return { error: "ロビーでのみ変更できます" };
  const who = targetId && playerId === room.hostId ? targetId : playerId;
  if (who !== playerId && playerId !== room.hostId) return { error: "主催者のみ" };
  const p = room.players.get(who);
  if (!p) return { error: "いません" };
  if (gender !== "male" && gender !== "female") return { error: "男か女を選んでね" };
  p.gender = gender;
  return { ok: true };
}

function topicPool(room) {
  return room.mode === "love" ? LOVE_TOPICS : VARIETY_TOPICS;
}

function refillTopicChoices(room) {
  const used = new Set(room.usedTopicIds || []);
  let pool = topicPool(room).filter((t) => !used.has(t.id));
  if (pool.length < 3) {
    room.usedTopicIds = [];
    pool = topicPool(room);
  }
  room.topicChoices = shuffle(pool).slice(0, 3);
}

function resetRoundPlay(room) {
  room.topic = null;
  room.topicChoices = [];
  room.picks = new Map();
  room.revealedIds = [];
  room.revealSeq = 0;
  room.lastReveal = null;
  room.drinks = [];
  room.resultKind = "";
  room.customDraft = "";
}

function beginPickTopic(room) {
  room.phase = "pick_topic";
  room.round = (room.round || 0) + 1;
  resetRoundPlay(room);
  refillTopicChoices(room);
}

function loveReady(room) {
  const ps = playerList(room);
  if (ps.some((p) => p.gender !== "male" && p.gender !== "female")) return false;
  const males = ps.filter((p) => p.gender === "male").length;
  const females = ps.filter((p) => p.gender === "female").length;
  return males >= 1 && females >= 1;
}

export function startGame(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "すでに開始しています" };
  if (room.players.size < MIN_PLAYERS) {
    return { error: `${MIN_PLAYERS}人以上必要です` };
  }
  if (room.mode === "love" && !loveReady(room)) {
    return { error: "ラブモードは全員が男か女を選び、両方1人以上必要です" };
  }
  room.activeIds = playerList(room).map((p) => p.id);
  room.pairs = [];
  room.usedTopicIds = [];
  beginPickTopic(room);
  return { ok: true };
}

export function refreshTopics(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "pick_topic") return { error: "お題選び中だけです" };
  refillTopicChoices(room);
  return { ok: true };
}

function beginChoosing(room, topic) {
  room.phase = "choosing";
  room.topic = topic;
  if (topic.id && !(room.usedTopicIds || []).includes(topic.id)) {
    room.usedTopicIds = [...(room.usedTopicIds || []), topic.id];
  }
  room.topicChoices = [];
  room.picks = new Map();
  room.revealedIds = [];
  room.revealSeq = 0;
  room.lastReveal = null;
  room.roundIds = [...room.activeIds];
}

export function pickTopic(room, playerId, topicId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "pick_topic") return { error: "お題選び中だけです" };
  const topic = (room.topicChoices || []).find((t) => t.id === topicId);
  if (!topic) return { error: "そのお題はありません" };
  beginChoosing(room, topic);
  return { ok: true };
}

export function pickCustomTopic(room, playerId, text) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "pick_topic") return { error: "お題選び中だけです" };
  const t = String(text || "").trim().slice(0, 40);
  if (t.length < 2) return { error: "お題を入力してね" };
  beginChoosing(room, { id: `custom-${uid()}`, text: t, custom: true });
  return { ok: true };
}

export function activePlayers(room) {
  return room.activeIds
    .map((id) => room.players.get(id))
    .filter((p) => p && p.connected !== false);
}

function activeAll(room) {
  return room.activeIds.map((id) => room.players.get(id)).filter(Boolean);
}

export function validTargets(room, playerId) {
  const me = room.players.get(playerId);
  if (!me) return [];
  return activeAll(room).filter((p) => {
    if (p.id === playerId) return false;
    if (room.mode === "love") {
      if (!me.gender || !p.gender) return false;
      return me.gender !== p.gender;
    }
    return true;
  });
}

function maybeStartReveal(room) {
  const need = activeAll(room);
  if (!need.length) return;
  if (need.every((p) => room.picks.has(p.id))) {
    room.phase = "reveal";
    room.revealedIds = [];
    room.revealSeq = 0;
    room.lastReveal = null;
  }
}

export function submitPick(room, playerId, targetId) {
  if (room.phase !== "choosing") return { error: "指名中だけです" };
  if (!room.activeIds.includes(playerId)) return { error: "この回戦の指名者ではありません" };
  const ok = validTargets(room, playerId).some((p) => p.id === targetId);
  if (!ok) return { error: "その人は選べません" };
  room.picks.set(playerId, targetId);
  maybeStartReveal(room);
  return { ok: true };
}

export function listBotsNeedingPick(room) {
  if (room.phase !== "choosing") return [];
  return activeAll(room)
    .filter((p) => p.isBot && !room.picks.has(p.id) && validTargets(room, p.id).length)
    .map((p) => p.id);
}

export function pickAsBot(room, botId) {
  const targets = validTargets(room, botId);
  if (!targets.length) return { error: "指名できる人がいません" };
  const t = targets[(Math.random() * targets.length) | 0];
  return submitPick(room, botId, t.id);
}

export function hostPickFor(room, hostId, playerId) {
  if (hostId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "choosing") return { error: "指名中だけです" };
  const p = room.players.get(playerId);
  if (!p) return { error: "いません" };
  if (room.picks.has(playerId)) return { error: "すでに指名済みです" };
  return pickAsBot(room, playerId);
}

function isMutual(room, fromId) {
  const to = room.picks.get(fromId);
  if (!to) return false;
  return room.picks.get(to) === fromId;
}

function pushReveal(room, fromId) {
  if (room.revealedIds.includes(fromId)) return { error: "もう開票済みです" };
  const toId = room.picks.get(fromId);
  if (!toId) return { error: "指名がありません" };
  room.revealedIds.push(fromId);
  room.revealSeq += 1;
  const mutual = isMutual(room, fromId);
  room.lastReveal = {
    seq: room.revealSeq,
    fromId,
    toId,
    mutual,
    style: "one",
  };
  return { ok: true, lastReveal: room.lastReveal };
}

export function revealOne(room, playerId, targetId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "reveal") return { error: "開票中だけです" };
  if (!room.activeIds.includes(targetId)) return { error: "その人は開票対象ではありません" };
  return pushReveal(room, targetId);
}

export function revealAll(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "reveal") return { error: "開票中だけです" };
  room.revealStyle = "all";
  const left = room.activeIds.filter((id) => !room.revealedIds.includes(id));
  if (!left.length) return { error: "全員開票済みです" };
  const batch = [];
  for (const id of left) {
    room.revealedIds.push(id);
    room.revealSeq += 1;
    const toId = room.picks.get(id);
    batch.push({
      seq: room.revealSeq,
      fromId: id,
      toId,
      mutual: isMutual(room, id),
    });
  }
  room.lastReveal = {
    seq: room.revealSeq,
    fromId: left[0],
    toId: room.picks.get(left[0]),
    mutual: isMutual(room, left[0]),
    style: "all",
    batch,
  };
  return { ok: true, lastReveal: room.lastReveal };
}

function findMutualPairs(room) {
  const matched = new Set();
  const pairs = [];
  for (const id of room.activeIds) {
    if (matched.has(id)) continue;
    const to = room.picks.get(id);
    if (!to || matched.has(to)) continue;
    if (room.picks.get(to) === id) {
      pairs.push({
        a: id,
        b: to,
        round: room.round,
        topic: room.topic?.text || "",
      });
      matched.add(id);
      matched.add(to);
    }
  }
  return { pairs, matched };
}

function canContinue(room, ids) {
  if (ids.length < CONTINUE_MIN) return false;
  if (room.mode === "love") {
    const people = ids.map((id) => room.players.get(id)).filter(Boolean);
    const males = people.filter((p) => p.gender === "male").length;
    const females = people.filter((p) => p.gender === "female").length;
    if (!males || !females) return false;
  }
  return ids.every((id) => validTargets({ ...room, activeIds: ids }, id).length > 0);
}

function addDrinks(room, ids, kind) {
  room.drinks = ids.map((playerId) => ({ playerId, cups: 1 }));
  for (const d of room.drinks) {
    room.drinkTotals.set(d.playerId, (room.drinkTotals.get(d.playerId) || 0) + d.cups);
  }
  room.resultKind = kind;
}

export function finishReveal(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "reveal") return { error: "開票中だけです" };
  const left = room.activeIds.filter((id) => !room.revealedIds.includes(id));
  if (left.length) return { error: "まだ開票していない人がいます" };

  const { pairs, matched } = findMutualPairs(room);
  room.pairs = [...(room.pairs || []), ...pairs];
  const remain = room.activeIds.filter((id) => !matched.has(id));
  room.activeIds = remain;

  if (remain.length === 0) {
    room.phase = "gameover";
    room.drinks = [];
    room.resultKind = "all_paired";
    return { ok: true };
  }
  if (remain.length <= 2 || !canContinue(room, remain)) {
    room.phase = "gameover";
    addDrinks(
      room,
      remain,
      remain.length <= 2 ? "last_remain" : "cannot_pair"
    );
    return { ok: true };
  }
  room.phase = "result";
  room.resultKind = "continue";
  return { ok: true };
}

export function nextRound(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "result") return { error: "まだ結果中です" };
  const topic = room.topic;
  if (!topic) {
    beginPickTopic(room);
    return { ok: true };
  }
  room.round = (room.round || 0) + 1;
  room.picks = new Map();
  room.revealedIds = [];
  room.revealSeq = 0;
  room.lastReveal = null;
  room.drinks = [];
  room.resultKind = "";
  room.topicChoices = [];
  beginChoosing(room, topic);
  return { ok: true };
}

export function backToPickTopic(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (!["choosing", "reveal"].includes(room.phase)) {
    return { error: "お題選択に戻れるのは指名中・開票中だけです" };
  }
  const tid = room.topic?.id;
  if (tid) {
    room.usedTopicIds = (room.usedTopicIds || []).filter((id) => id !== tid);
  }
  const round = room.round || 1;
  resetRoundPlay(room);
  room.round = round;
  room.phase = "pick_topic";
  refillTopicChoices(room);
  return { ok: true };
}

export function backToLobby(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  const genders = new Map(playerList(room).map((p) => [p.id, p.gender]));
  const mode = room.mode;
  Object.assign(room, blankRoomFields());
  room.mode = mode;
  for (const p of playerList(room)) p.gender = genders.get(p.id) || p.gender;
  if (!room.partyOwned) {
    for (const id of room.players.keys()) room.drinkTotals.set(id, 0);
  }
  return { ok: true };
}

function publicPerson(room, id) {
  const p = room.players.get(id);
  return {
    id,
    name: p?.name || "?",
    avatar: p?.avatar || "❓",
    gender: p?.gender || null,
    isBot: !!p?.isBot,
    connected: p?.connected !== false,
    isHost: p?.id === room.hostId,
  };
}

function roundPlayers(room) {
  const ids = room.roundIds?.length ? room.roundIds : room.activeIds;
  return ids.map((id) => room.players.get(id)).filter(Boolean);
}

function seatLayout(room) {
  const active = ["reveal", "result", "gameover"].includes(room.phase)
    ? roundPlayers(room)
    : activeAll(room);
  if (room.mode === "love") {
    const fem = active.filter((p) => p.gender === "female");
    const mal = active.filter((p) => p.gender === "male");
    const seats = [];
    const yOf = (i, n) => (n <= 1 ? 50 : 16 + (68 * i) / (n - 1));
    fem.forEach((p, i) => {
      const y = yOf(i, fem.length);
      seats.push({
        id: p.id,
        side: "left",
        x: 11,
        y,
        portX: 22,
        portY: y,
      });
    });
    mal.forEach((p, i) => {
      const y = yOf(i, mal.length);
      seats.push({
        id: p.id,
        side: "right",
        x: 89,
        y,
        portX: 78,
        portY: y,
      });
    });
    return seats;
  }
  const n = active.length || 1;
  return active.map((p, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + 36 * Math.cos(a);
    const y = 50 + 36 * Math.sin(a);
    return {
      id: p.id,
      side: "circle",
      x,
      y,
      portX: 50 + 27 * Math.cos(a),
      portY: 50 + 27 * Math.sin(a),
    };
  });
}

export function publicState(room, viewerId) {
  const me = room.players.get(viewerId);
  const isHost = me?.id === room.hostId;
  const inPlay = room.phase !== "lobby";
  const revealedSet = new Set(room.revealedIds);
  const showPicks =
    room.phase === "result" ||
    room.phase === "gameover" ||
    room.phase === "reveal";

  const players = playerList(room).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.id === room.hostId,
    connected: p.connected !== false,
    isBot: !!p.isBot,
    gender: p.gender,
    totalCups: room.drinkTotals.get(p.id) || 0,
    active: room.activeIds.includes(p.id),
    hasPicked: room.picks.has(p.id),
    revealed: revealedSet.has(p.id),
  }));

  const myPick = room.picks.get(viewerId) || null;
  const revealedPicks = showPicks
    ? (room.roundIds?.length ? room.roundIds : room.activeIds)
        .filter((id) => revealedSet.has(id) || room.phase !== "reveal")
        .map((id) => {
          const to = room.picks.get(id);
          return {
            fromId: id,
            toId: to,
            mutual: to ? room.picks.get(to) === id : false,
          };
        })
    : [];

  const drinkBoard = playerList(room)
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      totalCups: room.drinkTotals.get(p.id) || 0,
      isBot: !!p.isBot,
    }))
    .sort((a, b) => b.totalCups - a.totalCups);

  const waitingPick = room.phase === "choosing"
    ? activeAll(room).filter((p) => !room.picks.has(p.id)).map((p) => publicPerson(room, p.id))
    : [];

  return {
    game: "unmei",
    code: room.code,
    phase: room.phase,
    mode: room.mode,
    revealStyle: room.revealStyle,
    round: room.round,
    topic:
      inPlay && room.topic && room.phase !== "pick_topic"
        ? { id: room.topic.id, text: room.topic.text }
        : null,
    topicChoices:
      room.phase === "pick_topic" && isHost
        ? (room.topicChoices || []).map((t) => ({ id: t.id, text: t.text }))
        : [],
    players,
    you: me
      ? {
          id: me.id,
          name: me.name,
          avatar: me.avatar,
          isHost,
          isBot: !!me.isBot,
          gender: me.gender,
          active: room.activeIds.includes(me.id),
        }
      : null,
    myPick,
    hasPicked: room.picks.has(viewerId),
    targets:
      room.phase === "choosing" && room.activeIds.includes(viewerId)
        ? validTargets(room, viewerId).map((p) => publicPerson(room, p.id))
        : [],
    waitingPick,
    pickedCount: activeAll(room).filter((p) => room.picks.has(p.id)).length,
    expectedCount: activeAll(room).length,
    revealedIds: [...room.revealedIds],
    lastReveal: room.phase === "reveal" ? room.lastReveal : null,
    revealedPicks,
    seats:
      ["choosing", "reveal", "result", "gameover"].includes(room.phase)
        ? seatLayout(room)
        : [],
    pairs: (room.pairs || []).map((pair) => ({
      a: publicPerson(room, pair.a),
      b: publicPerson(room, pair.b),
      round: pair.round,
      topic: pair.topic,
    })),
    remain: (room.phase === "result" || room.phase === "gameover")
      ? room.activeIds.map((id) => publicPerson(room, id))
      : [],
    drinks:
      room.phase === "gameover"
        ? room.drinks.map((d) => ({
            ...publicPerson(room, d.playerId),
            cups: d.cups,
          }))
        : [],
    resultKind: room.phase === "result" || room.phase === "gameover" ? room.resultKind : "",
    drinkBoard,
    loveReady: room.mode !== "love" || loveReady(room),
    canStart:
      room.players.size >= MIN_PLAYERS &&
      (room.mode !== "love" || loveReady(room)),
    minPlayers: MIN_PLAYERS,
  };
}
