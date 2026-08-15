import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  createRoom,
  joinRoom,
  getRoom,
  setConnected,
  leaveRoom,
  startGame,
  submitAnswer,
  mergeGroups,
  unmergePlayer,
  confirmGroups,
  nextQuestion,
  endGame,
  backToLobby,
  publicState,
  listAvatars,
  addBot,
  removeBot,
  rejoinRoom,
  kickFromLobby,
  answerAsBot,
  listBotsNeedingAnswer,
  castVote,
  voteAsBot,
  listBotsNeedingVote,
} from "./games/image-match/rooms.js";
import { questionCount, imagesDir } from "./games/image-match/questions.js";
import * as trap from "./games/trap/rooms.js";
import { CARD_LIST, RANK_RATES, cardLabel } from "./games/trap/cards.js";
import * as rankBj from "./games/rank-bj/rooms.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const PORT = process.env.PORT || 3847;

fs.mkdirSync(imagesDir, { recursive: true });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  pingInterval: 10000,
  pingTimeout: 30000,
});

const REJOIN_GRACE_MS = 10 * 60 * 1000;

function createGraceTracker(sessions, getRoomFn, leaveFn, emitFn) {
  const timers = new Map();
  const key = (code, id) => `${code}:${id}`;
  return {
    cancel(code, id) {
      const k = key(code, id);
      clearTimeout(timers.get(k));
      timers.delete(k);
    },
    schedule(code, id) {
      this.cancel(code, id);
      timers.set(
        key(code, id),
        setTimeout(() => {
          timers.delete(key(code, id));
          const still = [...sessions.values()].some(
            (s) => s.roomCode === code && s.playerId === id
          );
          if (still) return;
          const room = getRoomFn(code);
          if (!room || room.phase !== "lobby") return;
          const updated = leaveFn(room, id);
          if (updated) emitFn(updated);
        }, REJOIN_GRACE_MS)
      );
    },
  };
}

function notifyKicked(getSocket, sessions, roomCode, playerId, message) {
  for (const [sid, s] of [...sessions]) {
    if (s.roomCode !== roomCode || s.playerId !== playerId) continue;
    const sock = getSocket(sid);
    sock?.emit("kicked", {
      message: message || "主催者に部屋から外されました",
    });
    sock?.leave(roomCode);
    sessions.delete(sid);
  }
}

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.use(express.static(publicDir));

app.get("/api/avatars", (_req, res) => {
  res.json({ avatars: listAvatars() });
});

app.get("/api/questions/count", (_req, res) => {
  res.json({ count: questionCount() });
});

app.get("/api/trap/cards", (_req, res) => {
  res.json({
    rates: RANK_RATES,
    cards: CARD_LIST.map((c) => ({
      id: c.id,
      name: c.name,
      effect: c.effect,
      label: cardLabel(c),
      rank: c.rank,
      rate: RANK_RATES[c.rank],
    })),
  });
});

/** socket.id -> { roomCode, playerId } */
const sessions = new Map();

function emitRoom(room) {
  if (!room) return;
  for (const [sid, sess] of sessions) {
    if (sess.roomCode !== room.code) continue;
    const sock = io.sockets.sockets.get(sid);
    if (sock) sock.emit("state", publicState(room, sess.playerId));
  }
}

const imageGrace = createGraceTracker(sessions, getRoom, leaveRoom, emitRoom);

function kickBots(room) {
  const botIds = listBotsNeedingAnswer(room);
  botIds.forEach((botId, i) => {
    setTimeout(() => {
      if (room.phase !== "answering") return;
      answerAsBot(room, botId);
      emitRoom(room);
    }, 500 + i * 350 + Math.floor(Math.random() * 400));
  });
}

function kickBotVotes(room) {
  const botIds = listBotsNeedingVote(room);
  botIds.forEach((botId, i) => {
    setTimeout(() => {
      if (!room.voteNeeded) return;
      voteAsBot(room, botId);
      emitRoom(room);
    }, 400 + i * 300 + Math.floor(Math.random() * 350));
  });
}

function bind(socket, roomCode, playerId) {
  sessions.set(socket.id, { roomCode, playerId });
  socket.join(roomCode);
  imageGrace.cancel(roomCode, playerId);
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ name, avatar }, cb) => {
    try {
      const { room, playerId } = createRoom(name, avatar);
      bind(socket, room.code, playerId);
      cb?.({ ok: true, playerId, code: room.code });
      emitRoom(room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "作成失敗" });
    }
  });

  socket.on("join_room", ({ code, name, avatar }, cb) => {
    try {
      const result = joinRoom(code, name, avatar);
      if (result.error) return cb?.({ ok: false, error: result.error });
      bind(socket, result.room.code, result.playerId);
      cb?.({ ok: true, playerId: result.playerId, code: result.room.code });
      emitRoom(result.room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "参加失敗" });
    }
  });

  socket.on("rejoin", ({ code, playerId }, cb) => {
    try {
      const result = rejoinRoom(code, playerId);
      if (result.error) return cb?.({ ok: false, error: result.error });
      bind(socket, result.room.code, result.playerId);
      setConnected(result.room, result.playerId, true);
      cb?.({ ok: true, playerId: result.playerId, code: result.room.code });
      emitRoom(result.room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "復帰失敗" });
    }
  });

  socket.on("kick_player", ({ playerId }, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = kickFromLobby(room, sess.playerId, playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    notifyKicked(
      (sid) => io.sockets.sockets.get(sid),
      sessions,
      room.code,
      result.kickedId,
      `${result.kickedName} は部屋から外されました`
    );
    imageGrace.cancel(room.code, result.kickedId);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("leave_room", (_data, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: true });
    sessions.delete(socket.id);
    socket.leave(sess.roomCode);
    imageGrace.cancel(sess.roomCode, sess.playerId);
    const room = getRoom(sess.roomCode);
    if (room) {
      const updated = leaveRoom(room, sess.playerId);
      if (updated) emitRoom(updated);
    }
    cb?.({ ok: true });
  });

  socket.on("add_bot", (_data, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = addBot(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("remove_bot", ({ botId }, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = removeBot(room, sess.playerId, botId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("start_game", (_data, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = startGame(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
    kickBots(room);
  });

  socket.on("submit_answer", ({ text }, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = submitAnswer(room, sess.playerId, text);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("merge_groups", ({ groupIdA, groupIdB }, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = mergeGroups(room, sess.playerId, groupIdA, groupIdB);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("unmerge_player", ({ targetPlayerId }, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = unmergePlayer(room, sess.playerId, targetPlayerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("confirm_groups", (_data, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = confirmGroups(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
    if (room.voteNeeded) kickBotVotes(room);
  });

  socket.on("cast_vote", ({ targetId }, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = castVote(room, sess.playerId, targetId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("host_pick", ({ targetId }, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = castVote(room, sess.playerId, targetId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("next_question", (_data, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = nextQuestion(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
    if (room.phase === "answering") kickBots(room);
  });

  socket.on("end_game", (_data, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = endGame(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("back_to_lobby", (_data, cb) => {
    const sess = sessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = backToLobby(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const sess = sessions.get(socket.id);
    if (!sess) return;
    sessions.delete(socket.id);
    const stillHere = [...sessions.values()].some(
      (s) => s.roomCode === sess.roomCode && s.playerId === sess.playerId
    );
    if (stillHere) return;
    const room = getRoom(sess.roomCode);
    if (!room) return;
    setConnected(room, sess.playerId, false);
    emitRoom(room);
    imageGrace.schedule(sess.roomCode, sess.playerId);
  });
});

/** ---- トラップゲーム (/trap) ---- */
const trapSessions = new Map();

function emitTrap(room) {
  if (!room) return;
  for (const [sid, sess] of trapSessions) {
    if (sess.roomCode !== room.code) continue;
    const sock = io.of("/trap").sockets.get(sid);
    if (sock) sock.emit("state", trap.publicState(room, sess.playerId));
  }
}

const trapGrace = createGraceTracker(
  trapSessions,
  (c) => trap.getRoom(c),
  (room, id) => trap.leaveRoom(room, id),
  emitTrap
);

function kickTrapBots(room) {
  if (room._botKickScheduled) return;
  const botIds = trap.listBotsNeedingAction(room);
  if (!botIds.length) return;

  const botId = botIds[0];
  room._botKickScheduled = true;
  trap.setBotThinking(room, botId);
  emitTrap(room);

  // ゆっくり考える（約3.5〜5.5秒）
  const delay = 3500 + Math.floor(Math.random() * 2000);
  setTimeout(() => {
    room._botKickScheduled = false;
    if (room.phase !== "playing") return;
    const still = trap.listBotsNeedingAction(room);
    if (!still.includes(botId)) {
      kickTrapBots(room);
      return;
    }
    trap.playAsBot(room, botId);
    emitTrap(room);
    if (room.phase === "playing" && trap.listBotsNeedingAction(room).length) {
      kickTrapBots(room);
    }
  }, delay);
}

function bindTrap(socket, roomCode, playerId) {
  trapSessions.set(socket.id, { roomCode, playerId });
  socket.join(roomCode);
  trapGrace.cancel(roomCode, playerId);
}

io.of("/trap").on("connection", (socket) => {
  socket.on("create_room", ({ name, avatar }, cb) => {
    try {
      const { room, playerId } = trap.createRoom(name, avatar);
      bindTrap(socket, room.code, playerId);
      cb?.({ ok: true, playerId, code: room.code });
      emitTrap(room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "作成失敗" });
    }
  });

  socket.on("join_room", ({ code, name, avatar }, cb) => {
    try {
      const result = trap.joinRoom(code, name, avatar);
      if (result.error) return cb?.({ ok: false, error: result.error });
      bindTrap(socket, result.room.code, result.playerId);
      cb?.({ ok: true, playerId: result.playerId, code: result.room.code });
      emitTrap(result.room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "参加失敗" });
    }
  });

  socket.on("rejoin", ({ code, playerId }, cb) => {
    try {
      const result = trap.rejoinRoom(code, playerId);
      if (result.error) return cb?.({ ok: false, error: result.error });
      bindTrap(socket, result.room.code, result.playerId);
      trap.setConnected(result.room, result.playerId, true);
      cb?.({ ok: true, playerId: result.playerId, code: result.room.code });
      emitTrap(result.room);
      kickTrapBots(result.room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "復帰失敗" });
    }
  });

  socket.on("kick_player", ({ playerId }, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.kickFromLobby(room, sess.playerId, playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    notifyKicked(
      (sid) => io.of("/trap").sockets.get(sid),
      trapSessions,
      room.code,
      result.kickedId,
      `${result.kickedName} は部屋から外されました`
    );
    trapGrace.cancel(room.code, result.kickedId);
    cb?.({ ok: true });
    emitTrap(room);
  });

  socket.on("leave_room", (_data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: true });
    trapSessions.delete(socket.id);
    socket.leave(sess.roomCode);
    trapGrace.cancel(sess.roomCode, sess.playerId);
    const room = trap.getRoom(sess.roomCode);
    if (room) {
      const updated = trap.leaveRoom(room, sess.playerId);
      if (updated) emitTrap(updated);
    }
    cb?.({ ok: true });
  });

  socket.on("add_bot", (_data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.addBot(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitTrap(room);
  });

  socket.on("remove_bot", ({ botId }, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.removeBot(room, sess.playerId, botId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitTrap(room);
  });

  socket.on("start_game", (_data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.startGame(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitTrap(room);
    kickTrapBots(room);
  });

  socket.on("play_card", (data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.playCard(room, sess.playerId, data?.instanceId, {
      targetId: data?.targetId,
      graveInstanceIds: data?.graveInstanceIds,
      myCardId: data?.myCardId,
      theirCardId: data?.theirCardId,
      theirCardIndex:
        data?.theirCardIndex == null ? null : Number(data.theirCardIndex),
    });
    if (result.error) return cb?.(result);
    cb?.({ ok: true, ...result });
    emitTrap(room);
    kickTrapBots(room);
  });

  socket.on("admit_lose", (_data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.admitLose(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitTrap(room);
  });

  socket.on("clear_peek", (_data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    trap.clearPeek(room, sess.playerId);
    cb?.({ ok: true });
    emitTrap(room);
    kickTrapBots(room);
  });

  socket.on("pick_carry", (data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.pickCarryOver(room, sess.playerId, data?.instanceId);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    emitTrap(room);
  });

  socket.on("next_match", (_data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.nextMatch(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitTrap(room);
    kickTrapBots(room);
  });

  socket.on("back_to_lobby", (_data, cb) => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = trap.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = trap.backToLobby(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitTrap(room);
  });

  socket.on("disconnect", () => {
    const sess = trapSessions.get(socket.id);
    if (!sess) return;
    trapSessions.delete(socket.id);
    const stillHere = [...trapSessions.values()].some(
      (s) => s.roomCode === sess.roomCode && s.playerId === sess.playerId
    );
    if (stillHere) return;
    const room = trap.getRoom(sess.roomCode);
    if (!room) return;
    trap.setConnected(room, sess.playerId, false);
    emitTrap(room);
    trapGrace.schedule(sess.roomCode, sess.playerId);
  });
});

/** ---- ランキングBJ (/rank-bj) ---- */
const rankBjSessions = new Map();

function emitRankBj(room) {
  if (!room) return;
  for (const [sid, sess] of rankBjSessions) {
    if (sess.roomCode !== room.code) continue;
    const sock = io.of("/rank-bj").sockets.get(sid);
    if (sock) sock.emit("state", rankBj.publicState(room, sess.playerId));
  }
}

const rankBjGrace = createGraceTracker(
  rankBjSessions,
  (c) => rankBj.getRoom(c),
  (room, id) => rankBj.leaveRoom(room, id),
  emitRankBj
);

function kickRankBjBots(room) {
  if (!room || room._bjBotKick) return;
  const botIds = rankBj.listBotsNeedingAction(room);
  if (!botIds.length) return;
  const botId = botIds[0];
  room._bjBotKick = true;
  setTimeout(() => {
    room._bjBotKick = false;
    if (room.phase !== "playing") return;
    const still = rankBj.listBotsNeedingAction(room);
    if (!still.includes(botId)) {
      kickRankBjBots(room);
      return;
    }
    rankBj.botAnswer(room, botId);
    emitRankBj(room);
    kickRankBjBots(room);
  }, 900 + Math.floor(Math.random() * 800));
}

function bindRankBj(socket, roomCode, playerId) {
  rankBjSessions.set(socket.id, { roomCode, playerId });
  socket.join(roomCode);
  rankBjGrace.cancel(roomCode, playerId);
}

io.of("/rank-bj").on("connection", (socket) => {
  socket.on("create_room", ({ name, avatar }, cb) => {
    try {
      const { room, playerId } = rankBj.createRoom(name, avatar);
      bindRankBj(socket, room.code, playerId);
      cb?.({ ok: true, playerId, code: room.code });
      emitRankBj(room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "作成失敗" });
    }
  });

  socket.on("join_room", ({ code, name, avatar }, cb) => {
    try {
      const result = rankBj.joinRoom(code, name, avatar);
      if (result.error) return cb?.({ ok: false, error: result.error });
      bindRankBj(socket, result.room.code, result.playerId);
      cb?.({ ok: true, playerId: result.playerId, code: result.room.code });
      emitRankBj(result.room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "参加失敗" });
    }
  });

  socket.on("rejoin", ({ code, playerId }, cb) => {
    try {
      const result = rankBj.rejoinRoom(code, playerId);
      if (result.error) return cb?.({ ok: false, error: result.error });
      bindRankBj(socket, result.room.code, result.playerId);
      rankBj.setConnected(result.room, result.playerId, true);
      cb?.({ ok: true, playerId: result.playerId, code: result.room.code });
      emitRankBj(result.room);
      kickRankBjBots(result.room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "復帰失敗" });
    }
  });

  socket.on("kick_player", ({ playerId }, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.kickFromLobby(room, sess.playerId, playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    notifyKicked(
      (sid) => io.of("/rank-bj").sockets.get(sid),
      rankBjSessions,
      room.code,
      result.kickedId,
      `${result.kickedName} は部屋から外されました`
    );
    rankBjGrace.cancel(room.code, result.kickedId);
    cb?.({ ok: true });
    emitRankBj(room);
  });

  socket.on("leave_room", (_data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: true });
    rankBjSessions.delete(socket.id);
    socket.leave(sess.roomCode);
    rankBjGrace.cancel(sess.roomCode, sess.playerId);
    const room = rankBj.getRoom(sess.roomCode);
    if (room) {
      const updated = rankBj.leaveRoom(room, sess.playerId);
      if (updated) emitRankBj(updated);
    }
    cb?.({ ok: true });
  });

  socket.on("add_bot", (_data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.addBot(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
  });

  socket.on("remove_bot", ({ botId }, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.removeBot(room, sess.playerId, botId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
  });

  socket.on("start_game", (_data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.startGame(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
  });

  socket.on("refresh_topics", (_data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.refreshTopics(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
  });

  socket.on("search_topics", async ({ q }, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    try {
      const result = await rankBj.searchTopics(room, sess.playerId, q);
      if (result.error) return cb?.({ ok: false, error: result.error });
      cb?.({ ok: true });
      emitRankBj(room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "検索失敗" });
    }
  });

  socket.on("pick_topic", async ({ slug }, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    try {
      const result = await rankBj.pickTopic(room, sess.playerId, slug);
      if (result.error) return cb?.({ ok: false, error: result.error });
      cb?.({ ok: true });
      emitRankBj(room);
      kickRankBjBots(room);
    } catch (e) {
      cb?.({ ok: false, error: e.message || "取得失敗" });
    }
  });

  socket.on("submit_answer", ({ text }, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.submitAnswer(room, sess.playerId, text);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
    kickRankBjBots(room);
  });

  socket.on("gm_confirm", (data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.gmConfirm(room, sess.playerId, data || {});
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
    kickRankBjBots(room);
  });

  socket.on("stand", (_data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.stand(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
    kickRankBjBots(room);
  });

  socket.on("next_round", (_data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.nextRound(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
  });

  socket.on("back_to_lobby", (_data, cb) => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return cb?.({ ok: false, error: "未参加" });
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return cb?.({ ok: false, error: "ルームなし" });
    const result = rankBj.backToLobby(room, sess.playerId);
    if (result.error) return cb?.({ ok: false, error: result.error });
    cb?.({ ok: true });
    emitRankBj(room);
  });

  socket.on("disconnect", () => {
    const sess = rankBjSessions.get(socket.id);
    if (!sess) return;
    rankBjSessions.delete(socket.id);
    const stillHere = [...rankBjSessions.values()].some(
      (s) => s.roomCode === sess.roomCode && s.playerId === sess.playerId
    );
    if (stillHere) return;
    const room = rankBj.getRoom(sess.roomCode);
    if (!room) return;
    rankBj.setConnected(room, sess.playerId, false);
    emitRankBj(room);
    rankBjGrace.schedule(sess.roomCode, sess.playerId);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`飲みゲーパーティー http://localhost:${PORT}`);
  console.log(`トラップゲーム     http://localhost:${PORT}/games/trap/`);
  console.log(`ランキングBJ       http://localhost:${PORT}/games/rank-bj/`);
});
