import { shuffleDeck, publicQuestion, alignDeckIfTesting } from "./questions.js";

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

const BOT_ANSWER_POOL = [
  "唐揚げ",
  "からあげ",
  "コーラ",
  "ビール",
  "卵焼き",
  "たまご",
  "サラダ",
  "味噌汁",
  "漬物",
  "ポテト",
  "チーズ",
  "ウインナー",
  "緑茶",
  "お茶",
  "みかん",
  "りんご",
  "海苔",
  "ねぎ",
  "キムチ",
  "ご飯",
];

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {{ id: string, name: string, avatar: string, isHost: boolean, connected: boolean, isBot?: boolean }} Player
 * @typedef {{
 *   code: string,
 *   hostId: string,
 *   players: Map<string, Player>,
 *   phase: 'lobby'|'answering'|'grouping'|'result'|'done',
 *   questions: any[],
 *   qIndex: number,
 *   answers: Map<string, string>,
 *   groups: { id: string, label: string, playerIds: string[] }[],
 *   drinks: { playerId: string, cups: number }[],
 *   resultType: string,
 *   hostPickNeeded: boolean,
 *   hostPickId: string|null,
 *   votes: Map<string, string>,
 *   voteNeeded: boolean,
 *   drinkTotals: Map<string, number>,
 *   round: number,
 * }} Room
 */

export function listAvatars() {
  return AVATARS;
}

export function createRoom(hostName, avatar) {
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();

  const hostId = uid();
  /** @type {Room} */
  const room = {
    code: roomCode,
    hostId,
    players: new Map(),
    phase: "lobby",
    questions: [],
    qIndex: 0,
    answers: new Map(),
    groups: [],
    drinks: [],
    resultType: "",
    hostPickNeeded: false,
    hostPickId: null,
    votes: new Map(),
    voteNeeded: false,
    drinkTotals: new Map(),
    round: 0,
  };

  room.players.set(hostId, {
    id: hostId,
    name: sanitizeName(hostName),
    avatar: sanitizeAvatar(avatar),
    isHost: true,
    connected: true,
    isBot: false,
  });

  rooms.set(roomCode, room);
  return { room, playerId: hostId };
}

export function joinRoom(roomCode, name, avatar) {
  const room = rooms.get(String(roomCode || "").toUpperCase());
  if (!room) return { error: "ルームが見つかりません" };
  if (room.phase !== "lobby") return { error: "すでにゲーム開始済みです" };
  if (room.players.size >= 10) return { error: "満員です（最大10人）" };

  const playerId = uid();
  room.players.set(playerId, {
    id: playerId,
    name: sanitizeName(name),
    avatar: sanitizeAvatar(avatar),
    isHost: false,
    connected: true,
    isBot: false,
  });
  return { room, playerId };
}

export function addBot(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ追加できます" };
  if (room.players.size >= 10) return { error: "満員です（最大10人）" };

  const usedNames = new Set([...room.players.values()].map((p) => p.name));
  const name =
    BOT_NAMES.find((n) => !usedNames.has(n)) ||
    `ダミー${room.players.size}`;
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
  });
  return { ok: true, botId };
}

export function removeBot(room, playerId, botId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ削除できます" };
  const bot = room.players.get(botId);
  if (!bot?.isBot) return { error: "ダミーではありません" };
  room.players.delete(botId);
  return { ok: true };
}

export function getRoom(roomCode) {
  return rooms.get(String(roomCode || "").toUpperCase());
}

export function rejoinRoom(roomCode, playerId) {
  const room = rooms.get(String(roomCode || "").toUpperCase());
  if (!room) return { error: "ルームが見つかりません" };
  const p = room.players.get(playerId);
  if (!p || p.isBot) return { error: "この部屋にいません" };
  p.connected = true;
  return { room, playerId };
}

export function kickFromLobby(room, hostId, targetId) {
  if (hostId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "lobby") return { error: "ロビーでのみ削除できます" };
  if (targetId === hostId) return { error: "自分は削除できません" };
  const t = room.players.get(targetId);
  if (!t) return { error: "いません" };
  room.players.delete(targetId);
  return { ok: true, kickedId: targetId, kickedName: t.name };
}

export function setConnected(room, playerId, connected) {
  const p = room.players.get(playerId);
  if (p) p.connected = connected;
}

export function leaveRoom(room, playerId) {
  const p = room.players.get(playerId);
  if (!p) return;
  if (room.phase === "lobby") {
    room.players.delete(playerId);
    if (playerId === room.hostId) {
      const next = [...room.players.values()].find((x) => !x.isBot);
      if (next) {
        room.hostId = next.id;
        next.isHost = true;
      } else {
        rooms.delete(room.code);
        return null;
      }
    }
  } else {
    if (!p.isBot) p.connected = false;
  }
  return room;
}

export function startGame(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者だけが開始できます" };
  if (room.phase !== "lobby") return { error: "すでに開始しています" };
  const n = room.players.size;
  if (n < 2) return { error: "2人以上必要です" };
  if (n > 10) return { error: "最大10人です" };

  room.questions = shuffleDeck();
  if (!room.questions.length) {
    return { error: "お題写真がありません。public/games/image-match/questions/images/ に入れてね" };
  }
  room.qIndex = 0;
  room.round = 1;
  room.drinkTotals = new Map();
  beginQuestion(room);
  return { ok: true };
}

function beginQuestion(room) {
  room.phase = "answering";
  room.answers = new Map();
  room.groups = [];
  room.drinks = [];
  room.resultType = "";
  room.hostPickNeeded = false;
  room.hostPickId = null;
  room.votes = new Map();
  room.voteNeeded = false;
}

function applyDrinkTotals(room, drinks) {
  for (const d of drinks) {
    const prev = room.drinkTotals.get(d.playerId) || 0;
    room.drinkTotals.set(d.playerId, prev + d.cups);
  }
}

function pickBotAnswer(room) {
  const existing = [...room.answers.values()];
  // たまに多数派に寄せる／たまにバラす
  if (existing.length && Math.random() < 0.45) {
    return existing[(Math.random() * existing.length) | 0];
  }
  if (Math.random() < 0.25) {
    const near = BOT_ANSWER_POOL[(Math.random() * BOT_ANSWER_POOL.length) | 0];
    // 表記ゆれサンプル
    if (near === "唐揚げ" && Math.random() < 0.5) return "からあげ";
    if (near === "たまご" && Math.random() < 0.5) return "卵";
    if (near === "お茶" && Math.random() < 0.5) return "緑茶";
    return near;
  }
  return BOT_ANSWER_POOL[(Math.random() * BOT_ANSWER_POOL.length) | 0];
}

/** ダミーが未回答なら回答を入れる。呼び出し側で段階的に叩く想定 */
export function answerAsBot(room, botId) {
  const bot = room.players.get(botId);
  if (!bot?.isBot) return { error: "botではない" };
  if (room.phase !== "answering") return { error: "回答フェーズではない" };
  if (room.answers.has(botId)) return { ok: true, skipped: true };
  return submitAnswer(room, botId, pickBotAnswer(room));
}

export function listBotsNeedingAnswer(room) {
  if (room.phase !== "answering") return [];
  return [...room.players.values()]
    .filter((p) => p.isBot && !room.answers.has(p.id))
    .map((p) => p.id);
}

export function submitAnswer(room, playerId, text) {
  if (room.phase !== "answering") return { error: "今は回答タイムではありません" };
  if (!room.players.has(playerId)) return { error: "参加者ではありません" };
  const cleaned = String(text || "").trim().slice(0, 40);
  if (!cleaned) return { error: "回答を入力してね" };
  room.answers.set(playerId, cleaned);

  const connectedIds = [...room.players.values()]
    .filter((p) => p.connected)
    .map((p) => p.id);
  const allIn = connectedIds.every((id) => room.answers.has(id));
  if (allIn && connectedIds.length >= 2) {
    enterGrouping(room);
  }
  return { ok: true };
}

function enterGrouping(room) {
  room.phase = "grouping";
  // 初期: 各プレイヤー独立グループ（表記そのまま）
  room.groups = [...room.answers.entries()].map(([playerId, label]) => ({
    id: uid(),
    label,
    playerIds: [playerId],
  }));
}

/** 主催者が2グループをマージ（同義判定） */
export function mergeGroups(room, playerId, groupIdA, groupIdB) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "grouping") return { error: "いまはグループ編集できません" };
  if (groupIdA === groupIdB) return { error: "同じグループです" };

  const a = room.groups.find((g) => g.id === groupIdA);
  const b = room.groups.find((g) => g.id === groupIdB);
  if (!a || !b) return { error: "グループが見つかりません" };

  a.playerIds.push(...b.playerIds);
  // ラベルは人数の多い方／先の方を残す
  room.groups = room.groups.filter((g) => g.id !== groupIdB);
  return { ok: true };
}

export function unmergePlayer(room, playerId, targetPlayerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "grouping") return { error: "いまはグループ編集できません" };

  const g = room.groups.find((x) => x.playerIds.includes(targetPlayerId));
  if (!g) return { error: "見つかりません" };
  if (g.playerIds.length <= 1) return { error: "すでに単独です" };

  g.playerIds = g.playerIds.filter((id) => id !== targetPlayerId);
  const label = room.answers.get(targetPlayerId) || "?";
  room.groups.push({ id: uid(), label, playerIds: [targetPlayerId] });
  return { ok: true };
}

export function confirmGroups(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "grouping") return { error: "グループ確定できません" };

  const result = calcDrinks(room.groups);
  room.drinks = result.drinks;
  room.resultType = result.type;
  room.votes = new Map();
  room.voteNeeded = result.type === "all_different";
  room.hostPickNeeded = false;
  room.phase = "result";

  if (!room.voteNeeded) {
    applyDrinkTotals(room, room.drinks);
  }
  return { ok: true, voteNeeded: room.voteNeeded };
}

/** 全員バラバラ時：1人1票で一番ハズレに投票（自分以外） */
export function castVote(room, voterId, targetId) {
  if (room.phase !== "result" || !room.voteNeeded) {
    return { error: "いまは投票できません" };
  }
  if (!room.players.has(voterId)) return { error: "参加者ではありません" };
  if (!room.players.has(targetId)) return { error: "プレイヤー不明" };
  if (voterId === targetId) return { error: "自分には投票できないよ" };
  if (room.votes.has(voterId)) return { error: "すでに投票済み" };

  room.votes.set(voterId, targetId);

  const voters = [...room.players.values()].filter((p) => p.connected);
  const allVoted = voters.every((p) => room.votes.has(p.id));
  if (allVoted && voters.length >= 2) {
    finalizeVotes(room);
  }
  return { ok: true, done: !room.voteNeeded };
}

function finalizeVotes(room) {
  const tally = new Map();
  for (const targetId of room.votes.values()) {
    tally.set(targetId, (tally.get(targetId) || 0) + 1);
  }
  let max = 0;
  for (const n of tally.values()) if (n > max) max = n;
  const losers = [...tally.entries()].filter(([, n]) => n === max).map(([id]) => id);

  room.drinks = losers.map((playerId) => ({ playerId, cups: 1 }));
  applyDrinkTotals(room, room.drinks);
  room.voteNeeded = false;
  room.resultType = "voted";
}

export function voteAsBot(room, botId) {
  const bot = room.players.get(botId);
  if (!bot?.isBot) return { error: "botではない" };
  if (!room.voteNeeded || room.votes.has(botId)) return { ok: true, skipped: true };
  const candidates = [...room.players.values()]
    .filter((p) => p.connected && p.id !== botId)
    .map((p) => p.id);
  if (!candidates.length) return { error: "候補なし" };
  const target = candidates[(Math.random() * candidates.length) | 0];
  return castVote(room, botId, target);
}

export function listBotsNeedingVote(room) {
  if (!room.voteNeeded) return [];
  return [...room.players.values()]
    .filter((p) => p.isBot && p.connected && !room.votes.has(p.id))
    .map((p) => p.id);
}

/** @deprecated 互換用 — castVote に統合 */
export function hostPickOutlier(room, playerId, targetId) {
  return castVote(room, playerId, targetId);
}

export function nextQuestion(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "result") return { error: "まだ結果中です" };
  if (room.voteNeeded) return { error: "投票が終わるまで待ってね" };

  if (room.qIndex + 1 >= room.questions.length) {
    room.phase = "done";
    return { ok: true, ended: true };
  }
  room.qIndex += 1;
  room.round += 1;
  beginQuestion(room);
  return { ok: true };
}

export function endGame(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "result" && room.phase !== "answering" && room.phase !== "grouping") {
    return { error: "いまは終了できません" };
  }
  if (room.phase === "result" && room.voteNeeded) {
    return { error: "投票が終わるまで待ってね" };
  }
  room.phase = "done";
  return { ok: true };
}

export function backToLobby(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  room.phase = "lobby";
  room.questions = [];
  room.qIndex = 0;
  room.answers = new Map();
  room.groups = [];
  room.drinks = [];
  room.resultType = "";
  room.hostPickNeeded = false;
  room.hostPickId = null;
  room.votes = new Map();
  room.voteNeeded = false;
  room.drinkTotals = new Map();
  room.round = 0;
  return { ok: true };
}

/**
 * 飲み判定:
 * - 最大グループが唯一 → 多数派セーフ。少数派は cup=1、単独(size1)は cup=3
 * - 最大が同率（例 2-2-2, 3-3）→ 誰も飲まない
 * - 全員単独（全部1）→ 全員1票でハズレ投票
 */
export function calcDrinks(groups) {
  if (!groups.length) return { type: "empty", drinks: [] };

  const max = Math.max(...groups.map((g) => g.playerIds.length));
  const top = groups.filter((g) => g.playerIds.length === max);

  if (max === 1) {
    return { type: "all_different", drinks: [] };
  }

  if (top.length > 1) {
    return { type: "tie", drinks: [] };
  }

  /** @type {{ playerId: string, cups: number }[]} */
  const drinks = [];
  for (const g of groups) {
    if (g.playerIds.length === max) continue;
    const cups = g.playerIds.length === 1 ? 3 : 1;
    for (const pid of g.playerIds) drinks.push({ playerId: pid, cups });
  }
  return { type: "minority", drinks };
}

export function publicState(room, viewerId) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.id === room.hostId,
    connected: p.connected,
    isBot: !!p.isBot,
    totalCups: room.drinkTotals.get(p.id) || 0,
  }));

  const me = room.players.get(viewerId);
  const answeredCount = room.answers.size;
  const expected = players.filter((p) => p.connected).length;

  let question = null;
  if (room.questions.length && room.phase !== "lobby" && room.phase !== "done") {
    alignDeckIfTesting(room);
    const remainingAfter = Math.max(0, room.questions.length - room.qIndex - 1);
    question = publicQuestion(
      room.questions[room.qIndex],
      room.qIndex,
      remainingAfter
    );
  }

  const myAnswer =
    room.phase === "answering" ? room.answers.get(viewerId) || null : null;

  let revealedAnswers = null;
  if (room.phase === "grouping" || room.phase === "result") {
    revealedAnswers = [...room.answers.entries()].map(([playerId, text]) => {
      const p = room.players.get(playerId);
      return {
        playerId,
        text,
        name: p?.name || "?",
        avatar: p?.avatar || "❓",
      };
    });
  }

  let groups = null;
  if (room.phase === "grouping" || room.phase === "result") {
    groups = room.groups.map((g) => ({
      id: g.id,
      label: g.label,
      members: g.playerIds.map((id) => {
        const p = room.players.get(id);
        return {
          id,
          name: p?.name || "?",
          avatar: p?.avatar || "❓",
          answer: room.answers.get(id) || "",
        };
      }),
    }));
  }

  let drinks = null;
  if (room.phase === "result" && !room.voteNeeded) {
    drinks = room.drinks.map((d) => {
      const p = room.players.get(d.playerId);
      return {
        playerId: d.playerId,
        cups: d.cups,
        name: p?.name || "?",
        avatar: p?.avatar || "❓",
      };
    });
  }

  const drinkBoard = [...room.players.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      totalCups: room.drinkTotals.get(p.id) || 0,
      isBot: !!p.isBot,
    }))
    .sort((a, b) => b.totalCups - a.totalCups);

  const voteCount = room.votes?.size || 0;
  const voteExpected = players.filter((p) => p.connected).length;

  return {
    code: room.code,
    phase: room.phase,
    players,
    you: me
      ? {
          id: me.id,
          name: me.name,
          avatar: me.avatar,
          isHost: me.id === room.hostId,
          isBot: !!me.isBot,
        }
      : null,
    question,
    answeredCount,
    expectedCount: expected,
    myAnswer,
    hasAnswered: room.answers.has(viewerId),
    revealedAnswers,
    groups,
    drinks,
    drinkBoard,
    resultType: room.resultType,
    voteNeeded: !!room.voteNeeded,
    hasVoted: room.votes?.has(viewerId) || false,
    voteCount,
    voteExpected,
    myVote: room.votes?.get(viewerId) || null,
    round: room.round,
  };
}

function sanitizeName(name) {
  const n = String(name || "").trim().slice(0, 12);
  return n || "ななし";
}

function sanitizeAvatar(avatar) {
  return AVATARS.includes(avatar) ? avatar : AVATARS[(Math.random() * AVATARS.length) | 0];
}
