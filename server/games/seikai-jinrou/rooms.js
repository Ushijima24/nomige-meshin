import { TOPICS, ANSWER_SECONDS } from "./topics.js";

const AVATARS = [
  "🦊",
  "🐻",
  "🐱",
  "🐸",
  "🐼",
  "🐷",
  "🦁",
  "🐨",
  "🐵",
  "🐰",
  "🐯",
  "🐮",
  "🐶",
  "🐺",
  "🦝",
  "🐔",
  "🐧",
  "🦄",
  "🐙",
  "🦖",
  "👻",
  "🎃",
  "👽",
  "🤖",
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

/** 頭文字ごとの雑な単語。ボットはここからランダムに1つ出すだけ */
const BOT_WORDS = {
  あ: ["あいす", "あめ", "ありがとう", "あんまん", "あさごはん", "あか"],
  い: ["いちご", "いぬ", "いす", "いも", "いんかん", "いえ"],
  う: ["うどん", "うめ", "うた", "うさぎ", "うみ", "うんどう"],
  え: ["えいが", "えび", "えき", "えんぴつ", "えほうまき"],
  お: ["おすし", "おちゃ", "おにぎり", "おふろ", "おかね", "おまつり"],
  か: ["からあげ", "かき", "かばん", "かわ", "かさ", "カレー"],
  き: ["きつね", "きのこ", "きょうりゅう", "きんメダル", "きもの"],
  く: ["くり", "くつ", "くま", "くすり", "くも"],
  け: ["けーき", "けいさつ", "けんこう", "けしゴム"],
  こ: ["これ", "こおり", "こども", "こめ", "こうちゃ"],
  さ: ["さかな", "さくら", "さけ", "サラダ", "さんま"],
  し: ["しお", "しんかんせん", "しろ", "しま", "しょうゆ"],
  す: ["すし", "すいか", "すきやき", "すな", "スープ"],
  せ: ["せっけん", "せんべえ", "せかい", "せいふく"],
  そ: ["そら", "そば", "そふぁー", "そんちょう"],
  た: ["たまご", "たけのこ", "たこ", "たいやき", "たんぽぽ"],
  ち: ["ちくわ", "チョコレート", "ちず", "ちゃわん"],
  つ: ["つき", "つくえ", "つめたい", "つゆ"],
  て: ["てがみ", "てんぷら", "てぶくろ", "テレビ"],
  と: ["とら", "とけい", "とうもろこし", "とまと"],
  な: ["なし", "なっとう", "なみ", "なつやすみ"],
  に: ["にく", "にほん", "にんじん", "にじ"],
  ぬ: ["ぬいぐるみ", "ぬの", "ぬかみそ"],
  ね: ["ねこ", "ねつ", "ネクタイ", "ねんど"],
  の: ["のり", "のどあめ", "のはら"],
  は: ["はな", "はし", "はみがき", "はんばーがー"],
  ひ: ["ひこうき", "ひまわり", "ひるごはん", "ひつじ"],
  ふ: ["ふく", "ふね", "ふとん", "ふぁいあ"],
  へ: ["へび", "へや", "へるめっと"],
  ほ: ["ほし", "ほうせき", "ほんだな", "ほたて"],
  ま: ["まくら", "まんが", "まつり", "まめ"],
  み: ["みかん", "みず", "みそしる", "みどり"],
  む: ["むし", "むぎちゃ", "むね"],
  め: ["めがね", "めだか", "めんたいこ"],
  も: ["もも", "もち", "もり", "もんだい"],
  や: ["やきとり", "やま", "やさい", "やきゅう"],
  ゆ: ["ゆき", "ゆかた", "ゆうびん"],
  よ: ["よる", "ヨーグルト", "よるごはん"],
  ら: ["らーめん", "らいおん", "らっこ"],
  り: ["りんご", "りす", "りょこう"],
  る: ["るすばん", "るーむ"],
  れ: ["れもん", "れいぞうこ", "れすとらん"],
  ろ: ["ろうそく", "ろぼっと", "ろーす"],
  わ: ["わに", "わたがし", "わかめ"],
  が: ["がっこう", "がらくた", "がんばれ"],
  ぎ: ["ぎゅうにゅう", "ぎんこう", "ぎょうざ"],
  ぐ: ["ぐみ", "ぐらす", "ぐりこ"],
  げ: ["げーむ", "げた", "げんき"],
  ご: ["ごはん", "ごま", "ごりら"],
  ざ: ["ざぶとん", "ざくろ"],
  じ: ["じどうしゃ", "じかん", "じゅーす"],
  ず: ["ずぼん", "ずかん", "ずんだ"],
  ぜ: ["ぜに", "ぜんざい"],
  ぞ: ["ぞう", "ぞうきん"],
  だ: ["だるま", "だいこん", "だんご"],
  ば: ["ばなな", "ばす", "ばけつ"],
  ぶ: ["ぶどう", "ぶた", "ぶんぼうぐ"],
  べ: ["べんとう", "べると"],
  ぼ: ["ぼうし", "ぼーる"],
  ぱ: ["ぱん", "ぱじゃま"],
  ぴ: ["ぴざ", "ぴあの"],
  ぷ: ["ぷりん", "ぷーる"],
  ぺ: ["ぺん", "ぺっと"],
  ぽ: ["ぽてと", "ぽけっと"],
};

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

function connectedPlayers(room) {
  return playerList(room).filter((p) => p.connected !== false);
}

function blankRoomFields() {
  return {
    phase: "lobby",
    round: 0,
    topic: null,
    topicChoices: [],
    usedTopicIds: [],
    wolfId: null,
    answers: new Map(),
    groups: [],
    baVotes: new Map(),
    wolfVotes: new Map(),
    wolfVoteStage: "first",
    wolfTiedIds: [],
    bestAnswer: null,
    accusedId: null,
    drinks: [],
    resultKind: "",
    timerStartedAt: null,
    timerEndsAt: null,
    timerDurationMs: ANSWER_SECONDS * 1000,
  };
}

function makePlayer(id, name, avatar, isHost, isBot) {
  return {
    id,
    name,
    avatar,
    isHost,
    isBot: !!isBot,
    connected: true,
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
  if (room.players.size >= 10) return { error: "満員です（最大10人）" };
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

export function addBot(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
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
  room.players.set(botId, makePlayer(botId, name, avatar, false, true));
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

export function normalizeAnswer(text) {
  return String(text || "")
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function shuffleTopics(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refillTopicChoices(room) {
  const used = new Set(room.usedTopicIds || []);
  let pool = TOPICS.filter((t) => !used.has(t.id));
  if (pool.length < 3) {
    room.usedTopicIds = [];
    pool = TOPICS;
  }
  room.topicChoices = shuffleTopics(pool).slice(0, 3);
}

function rebuildGroups(room) {
  const byKey = new Map();
  for (const [playerId, text] of room.answers.entries()) {
    const key = normalizeAnswer(text) || "__empty__";
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: uid(),
        label: text || "（無回答）",
        playerIds: [],
      });
    }
    byKey.get(key).playerIds.push(playerId);
  }
  room.groups = [...byKey.values()];
}

function pickRandomWolf(room) {
  const ids = playerList(room).map((p) => p.id);
  room.wolfId = ids[(Math.random() * ids.length) | 0];
}

function resetRoundFields(room) {
  room.topic = null;
  room.topicChoices = [];
  room.wolfId = null;
  room.answers = new Map();
  room.groups = [];
  room.baVotes = new Map();
  room.wolfVotes = new Map();
  room.wolfVoteStage = "first";
  room.wolfTiedIds = [];
  room.bestAnswer = null;
  room.accusedId = null;
  room.drinks = [];
  room.resultKind = "";
  room.timerStartedAt = null;
  room.timerEndsAt = null;
}

function beginPickTopic(room) {
  room.phase = "pick_topic";
  room.round = (room.round || 0) + 1;
  resetRoundFields(room);
  refillTopicChoices(room);
}

function beginAnswering(room, topic) {
  room.phase = "answering";
  room.topic = topic;
  room.usedTopicIds = [...(room.usedTopicIds || []), topic.id];
  room.topicChoices = [];
  pickRandomWolf(room);
  room.answers = new Map();
  room.groups = [];
  room.baVotes = new Map();
  room.wolfVotes = new Map();
  room.wolfVoteStage = "first";
  room.wolfTiedIds = [];
  room.bestAnswer = null;
  room.accusedId = null;
  room.drinks = [];
  room.resultKind = "";
  room.timerStartedAt = null;
  room.timerEndsAt = null;
}

export function startGame(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者だけが開始できます" };
  if (room.phase !== "lobby") return { error: "すでに開始しています" };
  if (room.players.size < 3) return { error: "3人以上必要です" };
  if (!room.partyOwned) {
    for (const id of room.players.keys()) room.drinkTotals.set(id, 0);
  }
  room.usedTopicIds = [];
  beginPickTopic(room);
  return { ok: true };
}

export function pickTopic(room, playerId, topicId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "pick_topic") return { error: "いまはお題選びではありません" };
  const topic = (room.topicChoices || []).find((t) => t.id === topicId);
  if (!topic) return { error: "そのお題は選べません" };
  beginAnswering(room, topic);
  return { ok: true };
}

export function refreshTopics(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "pick_topic") return { error: "いまはお題選びではありません" };
  refillTopicChoices(room);
  return { ok: true };
}

export function startTimer(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "answering") return { error: "回答中のみ" };
  if (room.timerEndsAt) return { error: "タイマーはすでに動いています" };
  const now = Date.now();
  room.timerStartedAt = now;
  room.timerEndsAt = now + room.timerDurationMs;
  return { ok: true, endsAt: room.timerEndsAt };
}

function enterReview(room) {
  const alive = connectedPlayers(room);
  for (const p of alive) {
    if (!room.answers.has(p.id)) room.answers.set(p.id, "（無回答）");
  }
  rebuildGroups(room);
  room.phase = "review";
  room.timerEndsAt = room.timerEndsAt || Date.now();
}

export function closeAnswers(room, playerId) {
  if (playerId && playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "answering") return { error: "いまはしめ切れません" };
  enterReview(room);
  return { ok: true };
}

export function maybeAutoReview(room) {
  if (room.phase !== "answering") return false;
  const alive = connectedPlayers(room);
  if (alive.length < 2) return false;
  if (!alive.every((p) => room.answers.has(p.id))) return false;
  enterReview(room);
  return true;
}

export function submitAnswer(room, playerId, text) {
  if (room.phase !== "answering") return { error: "いまは回答タイムではありません" };
  if (!room.players.has(playerId)) return { error: "参加者ではありません" };
  const cleaned = String(text || "").trim().slice(0, 40);
  if (!cleaned) return { error: "回答を入力してね" };
  room.answers.set(playerId, cleaned);
  maybeAutoReview(room);
  return { ok: true };
}

export function mergeGroups(room, playerId, groupIdA, groupIdB) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "review") return { error: "いまはまとめられません" };
  if (groupIdA === groupIdB) return { error: "同じグループです" };
  const a = room.groups.find((g) => g.id === groupIdA);
  const b = room.groups.find((g) => g.id === groupIdB);
  if (!a || !b) return { error: "グループが見つかりません" };
  a.playerIds.push(...b.playerIds);
  room.groups = room.groups.filter((g) => g.id !== groupIdB);
  return { ok: true };
}

export function unmergePlayer(room, playerId, targetPlayerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "review") return { error: "いまは分けられません" };
  const g = room.groups.find((x) => x.playerIds.includes(targetPlayerId));
  if (!g) return { error: "見つかりません" };
  if (g.playerIds.length <= 1) return { error: "すでに単独です" };
  g.playerIds = g.playerIds.filter((id) => id !== targetPlayerId);
  room.groups.push({
    id: uid(),
    label: room.answers.get(targetPlayerId) || "（無回答）",
    playerIds: [targetPlayerId],
  });
  return { ok: true };
}

function setBestAnswer(room, group) {
  room.bestAnswer = {
    groupId: group.id,
    label: group.label,
    playerIds: [...group.playerIds],
  };
}

function wolfIsBestAnswer(room) {
  return !!room.bestAnswer?.playerIds?.includes(room.wolfId);
}

function applyDrinks(room, drinks) {
  room.drinks = drinks;
  for (const d of drinks) {
    const prev = room.drinkTotals.get(d.playerId) || 0;
    room.drinkTotals.set(d.playerId, prev + d.cups);
  }
}

function drinksWhenWolfCaught(room) {
  return [{ playerId: room.wolfId, cups: 1 }];
}

function drinksWhenWolfEscapes(room, accusedId) {
  const ba = new Set(room.bestAnswer?.playerIds || []);
  return connectedPlayers(room)
    .filter((p) => p.id !== room.wolfId)
    .filter((p) => !ba.has(p.id))
    .filter((p) => p.id !== accusedId)
    .map((p) => ({ playerId: p.id, cups: 1 }));
}

function finishWolfIsBa(room) {
  room.accusedId = null;
  room.resultKind = "wolf_ba";
  applyDrinks(room, drinksWhenWolfCaught(room));
  room.phase = "result";
}

function enterWolfVote(room) {
  room.wolfVotes = new Map();
  room.wolfVoteStage = "first";
  room.wolfTiedIds = [];
  room.phase = "vote_wolf";
}

function publicPerson(room, id) {
  const p = room.players.get(id);
  return {
    id,
    name: p?.name || "?",
    avatar: p?.avatar || "❓",
    answer: room.answers.get(id) || "",
  };
}

function finishWolfAccused(room, accusedId) {
  room.accusedId = accusedId;
  room.wolfVoteStage = "first";
  room.wolfTiedIds = [];
  if (accusedId === room.wolfId) {
    room.resultKind = "wolf_caught";
    applyDrinks(room, drinksWhenWolfCaught(room));
  } else {
    room.resultKind = "wolf_escape";
    applyDrinks(room, drinksWhenWolfEscapes(room, accusedId));
  }
  room.phase = "result";
}

function startWolfTieBreak(room, winners) {
  room.wolfTiedIds = [...winners];
  const tied = new Set(winners);
  for (const [voterId, targetId] of [...room.wolfVotes]) {
    if (!tied.has(targetId)) room.wolfVotes.delete(voterId);
  }
  const needRevote = connectedPlayers(room).some((p) => !room.wolfVotes.has(p.id));
  room.wolfVoteStage = needRevote ? "runoff" : "host";
}

export function hostPickBa(room, playerId, groupId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "review") return { error: "いまは選べません" };
  const g = room.groups.find((x) => x.id === groupId);
  if (!g) return { error: "グループが見つかりません" };
  if (g.playerIds.length < 2) {
    return { error: "被りがある回答だけ、主催者が選べます" };
  }
  setBestAnswer(room, g);
  if (wolfIsBestAnswer(room)) finishWolfIsBa(room);
  else enterWolfVote(room);
  return { ok: true };
}

export function startBaVote(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "review") return { error: "いまは投票に進めません" };
  if (room.groups.some((g) => g.playerIds.length > 1)) {
    return { error: "被りがあるので、主催者がベストアンサーを選んでね" };
  }
  room.baVotes = new Map();
  room.phase = "vote_ba";
  return { ok: true };
}

function tally(votes) {
  const map = new Map();
  for (const targetId of votes.values()) {
    map.set(targetId, (map.get(targetId) || 0) + 1);
  }
  let max = 0;
  for (const n of map.values()) if (n > max) max = n;
  const winners = [...map.entries()]
    .filter(([, n]) => n === max)
    .map(([id]) => id);
  return { max, winners, map };
}

function publicVoteTally(room, votes) {
  if (!votes?.size) return [];
  const byTarget = new Map();
  for (const [voterId, targetId] of votes) {
    if (!byTarget.has(targetId)) byTarget.set(targetId, []);
    byTarget.get(targetId).push(voterId);
  }
  return [...byTarget.entries()]
    .map(([targetId, voterIds]) => {
      const t = room.players.get(targetId);
      return {
        target: {
          id: targetId,
          name: t?.name || "?",
          avatar: t?.avatar || "❓",
          answer: room.answers.get(targetId) || "",
        },
        votes: voterIds.length,
        voters: voterIds.map((id) => {
          const p = room.players.get(id);
          return { id, name: p?.name || "?", avatar: p?.avatar || "❓" };
        }),
      };
    })
    .sort((a, b) => b.votes - a.votes || a.target.name.localeCompare(b.target.name, "ja"));
}

function finalizeBaVotes(room) {
  const { winners } = tally(room.baVotes);
  if (!winners.length) {
    room.phase = "review";
    return;
  }
  if (winners.length === 1) {
    const pid = winners[0];
    const g =
      room.groups.find((x) => x.playerIds.includes(pid)) || {
        id: uid(),
        label: room.answers.get(pid) || "",
        playerIds: [pid],
      };
    setBestAnswer(room, {
      id: g.id,
      label: g.label,
      playerIds: [pid],
    });
  } else {
    setBestAnswer(room, {
      id: uid(),
      label: winners.map((id) => room.answers.get(id) || "").join(" / "),
      playerIds: winners,
    });
  }
  if (wolfIsBestAnswer(room)) finishWolfIsBa(room);
  else enterWolfVote(room);
}

function finalizeWolfVotes(room) {
  const { winners } = tally(room.wolfVotes);
  if (winners.length === 1) {
    finishWolfAccused(room, winners[0]);
    return;
  }
  if (room.wolfVoteStage === "runoff") {
    startWolfTieBreak(room, winners);
    room.wolfVoteStage = "host";
    return;
  }
  startWolfTieBreak(room, winners);
}

export function hostPickAccused(room, playerId, targetId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "vote_wolf" || room.wolfVoteStage !== "host") {
    return { error: "いまは追放できません" };
  }
  if (!room.wolfTiedIds.includes(targetId)) {
    return { error: "同数トップの中から選んでね" };
  }
  finishWolfAccused(room, targetId);
  return { ok: true };
}

export function castVote(room, voterId, targetId) {
  if (!room.players.has(voterId)) return { error: "参加者ではありません" };
  if (!room.players.has(targetId)) return { error: "プレイヤー不明" };
  if (voterId === targetId) return { error: "自分には投票できないよ" };

  if (room.phase === "vote_ba") {
    if (room.baVotes.has(voterId)) return { error: "すでに投票済み" };
    room.baVotes.set(voterId, targetId);
    const voters = connectedPlayers(room);
    if (voters.every((p) => room.baVotes.has(p.id))) finalizeBaVotes(room);
    return { ok: true };
  }

  if (room.phase === "vote_wolf") {
    if (room.wolfVoteStage === "host") {
      return { error: "主催者が追放する人を決める番です" };
    }
    const ba = new Set(room.bestAnswer?.playerIds || []);
    if (ba.has(targetId)) return { error: "ベストアンサーは選べません" };
    if (room.wolfVoteStage === "runoff" && !room.wolfTiedIds.includes(targetId)) {
      return { error: "同数トップの中から選んでね" };
    }
    if (room.wolfVotes.has(voterId)) return { error: "すでに投票済み" };
    room.wolfVotes.set(voterId, targetId);
    const voters = connectedPlayers(room);
    if (voters.every((p) => room.wolfVotes.has(p.id))) finalizeWolfVotes(room);
    return { ok: true };
  }

  return { error: "いまは投票できません" };
}

function pickBotAnswer(room) {
  const topic = room.topic?.text || "";
  const m = topic.match(/「(.)」/);
  const initial = m ? m[1] : "";
  const pool = BOT_WORDS[initial] || BOT_WORDS["あ"];
  const used = new Set([...room.answers.values()]);
  const free = pool.filter((w) => !used.has(w));
  const pickFrom = free.length ? free : pool;
  return pickFrom[(Math.random() * pickFrom.length) | 0];
}

export function answerAsBot(room, botId) {
  const bot = room.players.get(botId);
  if (!bot?.isBot) return { error: "botではない" };
  if (room.phase !== "answering") return { error: "回答フェーズではない" };
  if (room.answers.has(botId)) return { ok: true, skipped: true };
  return submitAnswer(room, botId, pickBotAnswer(room));
}

export function listBotsNeedingAnswer(room) {
  if (room.phase !== "answering") return [];
  return playerList(room)
    .filter((p) => p.isBot && !room.answers.has(p.id))
    .map((p) => p.id);
}

export function voteAsBot(room, botId) {
  const bot = room.players.get(botId);
  if (!bot?.isBot) return { error: "botではない" };
  if (room.phase === "vote_ba") {
    if (room.baVotes.has(botId)) return { ok: true, skipped: true };
    const candidates = connectedPlayers(room)
      .map((p) => p.id)
      .filter((id) => id !== botId);
    if (!candidates.length) return { error: "候補なし" };
    return castVote(
      room,
      botId,
      candidates[(Math.random() * candidates.length) | 0]
    );
  }
  if (room.phase === "vote_wolf") {
    if (room.wolfVoteStage === "host") return { ok: true, skipped: true };
    if (room.wolfVotes.has(botId)) return { ok: true, skipped: true };
    const ba = new Set(room.bestAnswer?.playerIds || []);
    const pool =
      room.wolfVoteStage === "runoff"
        ? room.wolfTiedIds.filter((id) => id !== botId)
        : connectedPlayers(room)
            .filter((p) => !ba.has(p.id) && p.id !== botId)
            .map((p) => p.id);
    if (!pool.length) return { error: "候補なし" };
    return castVote(room, botId, pool[(Math.random() * pool.length) | 0]);
  }
  return { ok: true, skipped: true };
}

export function listBotsNeedingVote(room) {
  if (room.phase === "vote_ba") {
    return connectedPlayers(room)
      .filter((p) => p.isBot && !room.baVotes.has(p.id))
      .map((p) => p.id);
  }
  if (room.phase === "vote_wolf") {
    if (room.wolfVoteStage === "host") return [];
    return connectedPlayers(room)
      .filter((p) => p.isBot && !room.wolfVotes.has(p.id))
      .map((p) => p.id);
  }
  return [];
}

export function nextRound(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  if (room.phase !== "result") return { error: "まだ結果中です" };
  beginPickTopic(room);
  return { ok: true };
}

export function backToLobby(room, playerId) {
  if (playerId !== room.hostId) return { error: "主催者のみ" };
  Object.assign(room, blankRoomFields());
  if (!room.partyOwned) {
    for (const id of room.players.keys()) room.drinkTotals.set(id, 0);
  }
  return { ok: true };
}

function publicGroups(room) {
  return room.groups.map((g) => ({
    id: g.id,
    label: g.label,
    duplicated: g.playerIds.length > 1,
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

function publicDrinks(room) {
  return room.drinks.map((d) => {
    const p = room.players.get(d.playerId);
    return {
      playerId: d.playerId,
      cups: d.cups,
      name: p?.name || "?",
      avatar: p?.avatar || "❓",
    };
  });
}

export function publicState(room, viewerId) {
  const players = playerList(room).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.id === room.hostId,
    connected: p.connected !== false,
    isBot: !!p.isBot,
    totalCups: room.drinkTotals.get(p.id) || 0,
    hasAnswered: room.answers.has(p.id),
  }));

  const me = room.players.get(viewerId);
  const inPlay = room.phase !== "lobby" && room.phase !== "pick_topic";
  const revealed = room.phase === "result";
  const showAnswers = ["review", "vote_ba", "vote_wolf", "result"].includes(
    room.phase
  );
  const isHost = me?.id === room.hostId;

  const baIds = new Set(room.bestAnswer?.playerIds || []);
  const voteMap =
    room.phase === "vote_ba"
      ? room.baVotes
      : room.phase === "vote_wolf"
        ? room.wolfVotes
        : null;

  const drinkBoard = playerList(room)
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      totalCups: room.drinkTotals.get(p.id) || 0,
      isBot: !!p.isBot,
    }))
    .sort((a, b) => b.totalCups - a.totalCups);

  return {
    game: "seikai-jinrou",
    code: room.code,
    phase: room.phase,
    round: room.round,
    topic: inPlay && room.topic ? { id: room.topic.id, text: room.topic.text } : null,
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
          isHost: me.id === room.hostId,
          isBot: !!me.isBot,
          role:
            inPlay && room.wolfId
              ? me.id === room.wolfId
                ? "wolf"
                : "citizen"
              : null,
        }
      : null,
    answeredCount: room.answers.size,
    expectedCount: connectedPlayers(room).length,
    myAnswer: room.answers.get(viewerId) || null,
    hasAnswered: room.answers.has(viewerId),
    groups: showAnswers ? publicGroups(room) : null,
    bestAnswer: room.bestAnswer
      ? {
          label: room.bestAnswer.label,
          playerIds: room.bestAnswer.playerIds,
          members: room.bestAnswer.playerIds.map((id) => {
            const p = room.players.get(id);
            return { id, name: p?.name || "?", avatar: p?.avatar || "❓" };
          }),
        }
      : null,
    wolfVoteStage: room.phase === "vote_wolf" ? room.wolfVoteStage : null,
    wolfTied: room.phase === "vote_wolf" && room.wolfTiedIds?.length
      ? room.wolfTiedIds.map((id) => publicPerson(room, id))
      : null,
    wolfCandidates: room.phase === "vote_wolf"
      ? (room.wolfVoteStage === "runoff" || room.wolfVoteStage === "host"
          ? (room.wolfTiedIds || []).map((id) => publicPerson(room, id))
          : connectedPlayers(room)
              .filter((p) => !baIds.has(p.id))
              .map((p) => publicPerson(room, p.id)))
      : null,
    hasVoted: voteMap ? voteMap.has(viewerId) : false,
    voteKept:
      room.phase === "vote_wolf" &&
      room.wolfVoteStage === "runoff" &&
      room.wolfVotes.has(viewerId),
    revoteLeft:
      room.phase === "vote_wolf" && room.wolfVoteStage === "runoff"
        ? connectedPlayers(room).filter((p) => !room.wolfVotes.has(p.id)).length
        : 0,
    voteCount: voteMap ? voteMap.size : 0,
    voteExpected: connectedPlayers(room).length,
    baVoteTally: revealed ? publicVoteTally(room, room.baVotes) : null,
    baVoteByHost: revealed ? !!(room.bestAnswer && !(room.baVotes?.size)) : false,
    wolfVoteTally: revealed ? publicVoteTally(room, room.wolfVotes) : null,
    drinks: revealed ? publicDrinks(room) : null,
    drinkBoard,
    resultKind: revealed ? room.resultKind : "",
    wolf: revealed
      ? (() => {
          const p = room.players.get(room.wolfId);
          return {
            id: room.wolfId,
            name: p?.name || "?",
            avatar: p?.avatar || "❓",
          };
        })()
      : null,
    accused: revealed && room.accusedId
      ? (() => {
          const p = room.players.get(room.accusedId);
          return {
            id: room.accusedId,
            name: p?.name || "?",
            avatar: p?.avatar || "❓",
          };
        })()
      : null,
    timer: {
      durationMs: room.timerDurationMs,
      startedAt: room.timerStartedAt,
      endsAt: room.timerEndsAt,
      running: !!(room.timerEndsAt && room.phase === "answering"),
    },
    hasDuplicates: showAnswers
      ? room.groups.some((g) => g.playerIds.length > 1)
      : false,
  };
}
