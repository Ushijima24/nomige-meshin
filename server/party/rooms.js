const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰", "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖", "👻", "🎃", "👽", "🤖"];

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

export const PARTY_GAMES = [
  {
    id: "trap",
    title: "トラップゲーム",
    path: "/games/trap/",
    desc: "酒をカードで回す。かわして渡して、負けた人が飲む。",
    recommend: "3〜8人",
  },
  {
    id: "image-match",
    title: "画像で全員一致",
    path: "/games/image-match/",
    desc: "隠れた部分を当てる。同じ答え同士でまとめ、少ないグループが飲む。",
  },
  {
    id: "rank-bj",
    title: "ランキングBJ",
    path: "/games/rank-bj/",
    desc: "ランキングの順位が点数。21を目指す知識ブラックジャック。",
    recommend: "2〜7人",
  },
  {
    id: "seikai-jinrou",
    title: "朝までそれ正解人狼",
    path: "/games/seikai-jinrou/",
    desc: "人狼はベストアンサーになるな。お題に一番沿った答えと人狼を当てる。",
    minPlayers: 3,
    recommend: "4〜6人",
  },
];

/** @type {Map<string, PartyRoom>} */
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
  const name = sanitizeName(hostName);
  const room = {
    code: roomCode,
    hostId,
    players: new Map(),
    drinkTotals: new Map(),
    currentGame: null,
    phase: "lobby",
  };
  room.players.set(hostId, {
    id: hostId,
    name,
    avatar: sanitizeAvatar(avatar),
    isBot: false,
    connected: true,
  });
  room.drinkTotals.set(hostId, 0);
  rooms.set(roomCode, room);
  return { room, playerId: hostId };
}

export function joinRoom(roomCode, name, avatar) {
  const room = getRoom(roomCode);
  if (!room) return { error: "ルームが見つかりません" };
  if (room.phase !== "lobby") return { error: "いまゲーム中です。終わってから入ってね" };
  if (room.players.size >= 10) return { error: "満員です（最大10人）" };
  const playerId = uid();
  room.players.set(playerId, {
    id: playerId,
    name: sanitizeName(name),
    avatar: sanitizeAvatar(avatar),
    isBot: false,
    connected: true,
  });
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

export function addBot(room, hostId) {
  if (hostId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ追加できます" };
  if (room.players.size >= 10) return { error: "満員です（最大10人）" };
  const usedNames = new Set(playerList(room).map((p) => p.name));
  const name =
    BOT_NAMES.find((n) => !usedNames.has(n)) || `ダミー${room.players.size}`;
  const usedAvatars = new Set(playerList(room).map((p) => p.avatar));
  const avatar =
    AVATARS.find((a) => !usedAvatars.has(a)) ||
    AVATARS[(Math.random() * AVATARS.length) | 0];
  const botId = uid();
  room.players.set(botId, {
    id: botId,
    name,
    avatar,
    isBot: true,
    connected: true,
  });
  room.drinkTotals.set(botId, 0);
  return { ok: true, botId };
}

export function resetDrinks(room, hostId) {
  if (hostId !== room.hostId) return { error: "主催者のみ" };
  for (const id of room.players.keys()) {
    room.drinkTotals.set(id, 0);
  }
  return { ok: true };
}

export function applyDrinkTotals(room, totals) {
  if (!totals) return;
  for (const [id, n] of Object.entries(totals)) {
    if (!room.players.has(id)) continue;
    room.drinkTotals.set(id, Math.max(0, Number(n) || 0));
  }
}

export function snapshotPlayers(room) {
  return playerList(room).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isBot: !!p.isBot,
    drinkTotal: room.drinkTotals.get(p.id) || 0,
  }));
}

export function setInGame(room, gameId) {
  room.currentGame = gameId;
  room.phase = "in_game";
}

export function clearGame(room) {
  room.currentGame = null;
  room.phase = "lobby";
}

export function publicState(room, viewerId) {
  const players = playerList(room).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.id === room.hostId,
    isBot: !!p.isBot,
    connected: p.connected !== false,
    drinkTotal: room.drinkTotals.get(p.id) || 0,
  }));
  players.sort((a, b) => b.drinkTotal - a.drinkTotal || a.name.localeCompare(b.name));
  return {
    game: "party",
    code: room.code,
    phase: room.phase,
    currentGame: room.currentGame,
    you: viewerId,
    isHost: room.hostId === viewerId,
    players,
    games: PARTY_GAMES,
    drinkBoard: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      drinkTotal: p.drinkTotal,
      isBot: p.isBot,
    })),
  };
}
