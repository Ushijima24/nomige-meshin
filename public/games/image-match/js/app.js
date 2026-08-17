const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰"];

const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
});

const app = document.getElementById("app");

const ui = {
  view: "home", // home | lobby | game
  name: localStorage.getItem("meshin_name") || "",
  avatar: localStorage.getItem("meshin_avatar") || AVATARS[0],
  joinCode: "",
  error: "",
  state: null,
  answer: "",
  selectedGroupId: null,
  busy: false,
};

const params = new URLSearchParams(location.search);
if (params.get("room")) {
  ui.joinCode = params.get("room").toUpperCase();
}

const SESSION_KEY = "meshin_session";
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
function saveSession(code, playerId) {
  if (code && playerId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }));
  }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function tryRejoin() {
  const sess = loadSession();
  if (!sess?.code || !sess?.playerId) return;
  socket.emit("rejoin", { code: sess.code, playerId: sess.playerId }, (res) => {
    if (res?.ok) {
      history.replaceState({}, "", `?room=${res.code}`);
      return;
    }
    clearSession();
    ui.state = null;
    ui.view = "home";
    if (res?.error === "この部屋にいません") {
      ui.error = "部屋から外れました。もう一度入ってね";
    }
    render();
  });
}
socket.on("connect", tryRejoin);
socket.on("kicked", ({ message } = {}) => {
  clearSession();
  ui.state = null;
  ui.view = "home";
  ui.error = message || "主催者に部屋から外されました";
  history.replaceState({}, "", location.pathname);
  render();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (socket.disconnected) socket.connect();
  else tryRejoin();
});
window.addEventListener("pageshow", () => {
  if (socket.disconnected) socket.connect();
  else tryRejoin();
});

socket.on("state", (state) => {
  ui.state = state;
  ui.error = "";
  if (state.phase === "lobby") ui.view = "lobby";
  else if (state.phase === "done") ui.view = "game";
  else ui.view = "game";

  if (state.phase === "answering" && !state.hasAnswered) {
    // keep typed answer
  } else if (state.phase !== "answering") {
    ui.answer = "";
  }
  if (state.phase !== "grouping") ui.selectedGroupId = null;
  render();
});

function emit(event, data = {}) {
  return new Promise((resolve) => {
    ui.busy = true;
    render();
    socket.emit(event, data, (res) => {
      ui.busy = false;
      if (res && !res.ok) {
        ui.error = res.error || "エラー";
      }
      render();
      resolve(res || { ok: false });
    });
  });
}

function saveProfile() {
  localStorage.setItem("meshin_name", ui.name.trim());
  localStorage.setItem("meshin_avatar", ui.avatar);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function playersHtml(players, { canRemove = false } = {}) {
  return `<div class="players">${players
    .map(
      (p) => `
    <div class="player-chip ${p.isHost ? "host" : ""} ${p.isBot ? "bot" : ""} ${
      p.connected ? "" : "off"
    }">
      <div class="av">${p.avatar}${
        p.isHost ? '<span class="badge-host">主催</span>' : ""
      }${p.isBot ? '<span class="badge-bot">dummy</span>' : ""}</div>
      <div class="nm">${escapeHtml(p.name)}</div>
      ${
        canRemove && p.id !== ui.state?.you?.id
          ? `<button type="button" class="btn-ghost" style="padding:4px 8px;font-size:0.7rem;margin-top:2px" data-kick="${p.id}">削除</button>`
          : ""
      }
    </div>`
    )
    .join("")}</div>`;
}

function trayHtml(question) {
  if (!question?.image) return "";
  const hole = question.hole || { x: 60, y: 15, w: 30, h: 38 };
  const isRemote = /^https?:\/\//i.test(question.image);
  const credit = isRemote
    ? `<div class="photo-credit">Photo: Unsplash</div>`
    : "";
  return `<div class="photo-stage">
        <img class="photo" src="${escapeHtml(question.image)}" alt="お題" loading="eager" />
        <div class="photo-hole"
          data-x="${hole.x}" data-y="${hole.y}" data-w="${hole.w}" data-h="${hole.h}">
          <span>？</span>
        </div>
        ${credit}
      </div>`;
}

function layoutPhotoHoles(root = document) {
  root.querySelectorAll(".photo-stage").forEach((stage) => {
    const img = stage.querySelector("img.photo");
    const hole = stage.querySelector(".photo-hole");
    if (!img || !hole) return;

    const apply = () => {
      const iw = img.clientWidth;
      const ih = img.clientHeight;
      if (!iw || !ih) return;
      const x = Number(hole.dataset.x) || 0;
      const y = Number(hole.dataset.y) || 0;
      const w = Number(hole.dataset.w) || 30;
      const h = Number(hole.dataset.h) || 36;
      hole.style.left = `${(x / 100) * iw}px`;
      hole.style.top = `${(y / 100) * ih}px`;
      hole.style.width = `${(w / 100) * iw}px`;
      hole.style.height = `${(h / 100) * ih}px`;
    };

    if (img.complete) apply();
    else img.addEventListener("load", apply, { once: true });
    // レイアウト後の再計算
    requestAnimationFrame(apply);
  });
}

function drinkBoardHtml(board) {
  if (!board?.length) return "";
  const rows = board
    .map(
      (p) => `
    <div class="drink-board-row">
      <span>${p.avatar} ${escapeHtml(p.name)}${p.isBot ? " ·dummy" : ""}</span>
      <span class="cups-total">${p.totalCups}<small>杯</small></span>
    </div>`
    )
    .join("");
  return `<div class="drink-board"><div class="drink-board-title">🍺 累計罰杯</div>${rows}</div>`;
}

function renderHome() {
  return `
  <div class="screen">
    <p style="margin:0 0 8px"><a href="/" style="color:var(--accent-2);font-weight:800;text-decoration:none;font-size:0.85rem">← ゲーム選択</a></p>
    <div class="brand">
      <div class="app-name">飲みゲーパーティー</div>
      <div class="logo"><span>画像で全員一致</span></div>
      <p class="sub">写真の一部を隠して、みんなで答えをそろえよう</p>
    </div>
    <div class="panel">
      <label class="field">
        <span class="lbl">なまえ</span>
        <input type="text" id="name" maxlength="12" placeholder="例：たろう" value="${escapeHtml(
          ui.name
        )}" />
      </label>
      <div class="field">
        <span class="lbl">アバター</span>
        <div class="avatars" id="avatars">
          ${AVATARS.map(
            (a) =>
              `<button type="button" class="avatar-btn ${
                a === ui.avatar ? "selected" : ""
              }" data-avatar="${a}">${a}</button>`
          ).join("")}
        </div>
      </div>
      ${ui.error ? `<p class="err">${escapeHtml(ui.error)}</p>` : ""}
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-create" ${ui.busy ? "disabled" : ""}>ルームを作る（主催）</button>
      </div>
      <label class="field" style="margin-top:18px">
        <span class="lbl">ルームコードで参加</span>
        <input type="text" id="join-code" maxlength="6" placeholder="例：AB3K" value="${escapeHtml(
          ui.joinCode
        )}" style="text-transform:uppercase;letter-spacing:0.15em;font-weight:800" />
      </label>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btn-join" ${ui.busy ? "disabled" : ""}>ルームに入る</button>
      </div>
    </div>
    <div class="panel" style="margin-top:14px">
      <p class="lbl" style="color:var(--accent);font-size:0.85rem;font-weight:800;margin:0 0 8px">遊び方</p>
      <ol style="margin:0;padding-left:1.2em;line-height:1.55;font-weight:700;font-size:0.9rem;color:var(--text)">
        <li>写真の一部が隠されたお題が出る</li>
        <li>各自が「何か」を答えとして入力する</li>
        <li>主催者が同じ答え同士をグループにまとめる</li>
        <li>一番人数が少ないグループ（少数派）が罰杯</li>
        <li>全員一致なら誰も飲まないことも</li>
      </ol>
      <p style="margin:10px 0 0;font-size:0.8rem;font-weight:700;color:var(--muted);line-height:1.45">ダミー参加者を足して人数を増やせます。別アプリを開いても同じブラウザなら戻ってこれます。</p>
    </div>
  </div>`;
}

function shareUrl() {
  return `${location.origin}${location.pathname}?room=${ui.state.code}`;
}

function renderLobby() {
  const s = ui.state;
  const share = shareUrl();
  const isHost = s.you?.isHost;
  return `
  <div class="screen">
    <div class="brand">
      <div class="app-name">飲みゲーパーティー</div>
      <div class="logo"><span>画像で全員一致</span></div>
    </div>
    <div class="room-code">
      <div class="tiny">ルームコード</div>
      <div class="code">${s.code}</div>
      <div class="hint">LINEでURLを共有してね</div>
    </div>
    <div class="panel">
      <p class="lbl" style="color:var(--muted);font-size:0.8rem;font-weight:700;margin-bottom:4px">参加者 ${s.players.length}/10</p>
      ${playersHtml(s.players, { canRemove: isHost })}
      ${
        isHost
          ? `<div class="bot-actions">
              <button type="button" id="btn-add-bot" ${
                s.players.length >= 10 || ui.busy ? "disabled" : ""
              }>＋ダミー参加者を追加</button>
              <button type="button" id="btn-add-bots4" ${
                s.players.length >= 10 || ui.busy ? "disabled" : ""
              }>ダミー4人まとめて</button>
            </div>`
          : ""
      }
      ${ui.error ? `<p class="err">${escapeHtml(ui.error)}</p>` : ""}
      ${
        isHost
          ? `<div class="btn-row">
              <button class="btn btn-primary" id="btn-start" ${
                s.players.length < 2 || ui.busy ? "disabled" : ""
              }>ゲーム開始</button>
              <p class="wait">${
                s.players.length < 2
                  ? "友だちかダミーをあと1人以上追加してね"
                  : "人数そろったら開始！"
              }</p>
            </div>`
          : `<p class="wait">主催者の開始待ち…</p>`
      }
      <div class="btn-row">
        <button class="btn btn-ghost" id="btn-leave">この部屋から出る</button>
      </div>
      <p class="share-url">${escapeHtml(share)}</p>
      <div class="btn-row">
        <button class="btn btn-line" id="btn-line">LINEで共有</button>
        <button class="btn btn-ghost" id="btn-copy">参加URLをコピー</button>
      </div>
    </div>
  </div>`;
}

function renderAnswering() {
  const s = ui.state;
  const q = s.question;
  return `
  <div class="screen">
    <div class="meta-bar">
      <span class="cat">第 ${q.index + 1} 問</span>
      <span>残りお題 ${q.remainingAfter}</span>
    </div>
    ${trayHtml(q)}
    <p class="prompt">${escapeHtml(q.prompt || "ここに入るのは？")}</p>
    <div class="panel">
      ${
        s.hasAnswered
          ? `<p class="wait">回答済み！ほかの人を待ってるよ<br/><span style="color:var(--accent)">あなた: ${escapeHtml(
              s.myAnswer || ""
            )}</span><br/>${s.answeredCount}/${s.expectedCount}</p>`
          : `
        <label class="field">
          <span class="lbl">隠れてるところに入るものは？</span>
          <input type="text" id="answer" maxlength="40" placeholder="自由に書いてね" value="${escapeHtml(
            ui.answer
          )}" />
        </label>
        ${ui.error ? `<p class="err">${escapeHtml(ui.error)}</p>` : ""}
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-answer" ${ui.busy ? "disabled" : ""}>送信</button>
        </div>`
      }
    </div>
    <div class="footer-players">${playersHtml(s.players)}</div>
  </div>`;
}

function renderGrouping() {
  const s = ui.state;
  const q = s.question;
  const isHost = s.you?.isHost;
  return `
  <div class="screen">
    <div class="meta-bar">
      <span class="cat">第 ${q.index + 1} 問</span>
      <span>答え合わせ</span>
    </div>
    ${trayHtml(q)}
    <p class="prompt">${escapeHtml(q.prompt || "ここに入るのは？")}</p>
    <div class="panel">
      <p class="host-tip">${
        isHost
          ? "同じ意味の答え同士をタップしてまとめてね → 判定へ"
          : "主催者が「同じ意味」をまとめています…"
      }</p>
      <div class="groups">
        ${s.groups
          .map(
            (g) => `
          <div class="group-card ${
            ui.selectedGroupId === g.id ? "selected" : ""
          }" data-group="${g.id}">
            <div class="glabel">「${escapeHtml(g.label)}」 ×${g.members.length}</div>
            <div class="group-members">
              ${g.members
                .map(
                  (m) => `
                <span class="member">
                  <span>${m.avatar}</span>
                  <span>${escapeHtml(m.name)}</span>
                  <span style="opacity:.7;font-weight:500">(${escapeHtml(m.answer)})</span>
                  ${
                    isHost && g.members.length > 1
                      ? `<button type="button" class="split" data-split="${m.id}" title="分離">↩</button>`
                      : ""
                  }
                </span>`
                )
                .join("")}
            </div>
          </div>`
          )
          .join("")}
      </div>
      ${ui.error ? `<p class="err">${escapeHtml(ui.error)}</p>` : ""}
      ${
        isHost
          ? `<div class="btn-row">
              <button class="btn btn-primary" id="btn-confirm" ${ui.busy ? "disabled" : ""}>この分け方で判定！</button>
            </div>`
          : ""
      }
    </div>
  </div>`;
}

function renderResult() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  let banner = "";
  if (s.voteNeeded) {
    banner = `<div class="result-banner drink">全員バラバラ！一番ハズレに1票投票（${s.voteCount}/${s.voteExpected}）</div>`;
  } else if (s.resultType === "tie") {
    banner = `<div class="result-banner tie">同率トップ！誰も飲まない 🎉</div>`;
  } else if (s.resultType === "voted") {
    banner = `<div class="result-banner drink">投票でハズレ決定</div>`;
  } else if (!s.drinks?.length) {
    banner = `<div class="result-banner safe">完璧に一致！セーフ ✨</div>`;
  } else {
    banner = `<div class="result-banner drink">不一致…罰杯タイム</div>`;
  }

  const drinksHtml =
    !s.voteNeeded && s.drinks?.length > 0
      ? `<div class="drink-list">${s.drinks
          .map(
            (d) => `
        <div class="drink-item">
          <span>${d.avatar} ${escapeHtml(d.name)}</span>
          <span class="cups">${"🍺".repeat(Math.min(d.cups, 3))} ×${d.cups}</span>
        </div>`
          )
          .join("")}</div>`
      : "";

  const meId = s.you?.id;
  const pickHtml = s.voteNeeded
    ? s.hasVoted
      ? `<p class="wait">投票済み！ほかの人を待ってるよ（${s.voteCount}/${s.voteExpected}）</p>`
      : `<p class="host-tip">一番ハズレだと思う人をタップ（自分以外）</p>
      <div class="pick-grid">
        ${s.players
          .filter((p) => p.connected && p.id !== meId)
          .map(
            (p) =>
              `<button type="button" data-pick="${p.id}">${p.avatar}<br/>${escapeHtml(
                p.name
              )}<br/><small style="opacity:.7">${escapeHtml(
                s.groups?.find((g) => g.members.some((m) => m.id === p.id))?.label || ""
              )}</small></button>`
          )
          .join("")}
      </div>`
    : "";

  return `
  <div class="screen">
    <div class="meta-bar">
      <span class="cat">結果</span>
      <span>第 ${s.question.index + 1} 問</span>
    </div>
    ${banner}
    <div class="panel">
      <div class="groups" style="margin-top:0">
        ${s.groups
          .map(
            (g) => `
          <div class="group-card" style="cursor:default">
            <div class="glabel">「${escapeHtml(g.label)}」 ×${g.members.length}</div>
            <div class="group-members">
              ${g.members
                .map(
                  (m) =>
                    `<span class="member">${m.avatar} ${escapeHtml(m.name)}</span>`
                )
                .join("")}
            </div>
          </div>`
          )
          .join("")}
      </div>
      ${drinksHtml}
      ${pickHtml}
      ${drinkBoardHtml(s.drinkBoard)}
      ${ui.error ? `<p class="err">${escapeHtml(ui.error)}</p>` : ""}
      ${
        isHost && !s.voteNeeded
          ? `<div class="btn-row">
              ${
                (s.question.remainingAfter ?? 0) > 0
                  ? `<button class="btn btn-primary" id="btn-next" ${ui.busy ? "disabled" : ""}>次の問題へ</button>`
                  : ""
              }
              <button class="btn btn-secondary" id="btn-end" ${ui.busy ? "disabled" : ""}>やめる（結果を見る）</button>
            </div>`
          : !isHost && !s.voteNeeded
            ? `<p class="wait">主催者の「次へ／やめる」待ち…</p>`
            : ""
      }
    </div>
  </div>`;
}

function renderDone() {
  const s = ui.state;
  return `
  <div class="screen">
    <div class="brand">
      <div class="app-name">飲みゲーパーティー</div>
      <div class="logo"><span>おつかれ！</span></div>
      <p class="sub">画像で全員一致 — 全問終了</p>
    </div>
    <div class="panel">
      ${drinkBoardHtml(s.drinkBoard)}
      ${playersHtml(s.players)}
      ${
        s.you?.isHost
          ? `<div class="btn-row">
              <button class="btn btn-primary" id="btn-lobby" ${ui.busy ? "disabled" : ""}>ロビーに戻る</button>
            </div>`
          : `<p class="wait">主催者がロビーに戻すまで待ってね</p>`
      }
    </div>
  </div>`;
}

function render() {
  let html = "";
  if (ui.view === "home" || !ui.state) html = renderHome();
  else if (ui.state.phase === "lobby") html = renderLobby();
  else if (ui.state.phase === "answering") html = renderAnswering();
  else if (ui.state.phase === "grouping") html = renderGrouping();
  else if (ui.state.phase === "result") html = renderResult();
  else if (ui.state.phase === "done") html = renderDone();
  else html = renderHome();

  app.innerHTML = html;
  bindEvents();
  layoutPhotoHoles(app);
}

function bindEvents() {
  const nameEl = document.getElementById("name");
  if (nameEl) {
    nameEl.addEventListener("input", (e) => {
      ui.name = e.target.value;
    });
  }

  const joinEl = document.getElementById("join-code");
  if (joinEl) {
    joinEl.addEventListener("input", (e) => {
      ui.joinCode = e.target.value.toUpperCase();
    });
  }

  document.querySelectorAll(".avatar-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.avatar = btn.dataset.avatar;
      render();
    });
  });

  const createBtn = document.getElementById("btn-create");
  if (createBtn) {
    createBtn.addEventListener("click", async () => {
      if (!ui.name.trim()) {
        ui.error = "なまえを入れてね";
        render();
        return;
      }
      saveProfile();
      const res = await emit("create_room", { name: ui.name, avatar: ui.avatar });
      if (res?.ok) {
        saveSession(res.code, res.playerId);
        history.replaceState({}, "", `?room=${res.code}`);
      }
    });
  }

  const joinBtn = document.getElementById("btn-join");
  if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
      if (!ui.name.trim()) {
        ui.error = "なまえを入れてね";
        render();
        return;
      }
      if (!ui.joinCode.trim()) {
        ui.error = "ルームコードを入れてね";
        render();
        return;
      }
      saveProfile();
      const res = await emit("join_room", {
        code: ui.joinCode.trim(),
        name: ui.name,
        avatar: ui.avatar,
      });
      if (res?.ok) {
        saveSession(res.code, res.playerId);
        history.replaceState({}, "", `?room=${res.code}`);
      }
    });
  }

  const startBtn = document.getElementById("btn-start");
  if (startBtn) {
    startBtn.addEventListener("click", () => emit("start_game"));
  }

  const addBotBtn = document.getElementById("btn-add-bot");
  if (addBotBtn) {
    addBotBtn.addEventListener("click", () => emit("add_bot"));
  }

  const addBots4 = document.getElementById("btn-add-bots4");
  if (addBots4) {
    addBots4.addEventListener("click", async () => {
      const room = ui.state;
      const need = Math.min(4, 10 - room.players.length);
      for (let i = 0; i < need; i++) {
        const res = await emit("add_bot");
        if (!res?.ok) break;
      }
    });
  }

  document.querySelectorAll("[data-kick]").forEach((btn) => {
    btn.addEventListener("click", () =>
      emit("kick_player", { playerId: btn.dataset.kick })
    );
  });

  const leaveBtn = document.getElementById("btn-leave");
  if (leaveBtn) {
    leaveBtn.addEventListener("click", async () => {
      await emit("leave_room");
      clearSession();
      ui.state = null;
      ui.view = "home";
      ui.error = "";
      history.replaceState({}, "", location.pathname);
      render();
    });
  }

  const copyBtn = document.getElementById("btn-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const url = shareUrl();
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = "コピーした！";
      } catch {
        copyBtn.textContent = url;
      }
    });
  }

  const lineBtn = document.getElementById("btn-line");
  if (lineBtn) {
    lineBtn.addEventListener("click", () => {
      const url = shareUrl();
      const text = `飲みゲーパーティー「画像で全員一致」に参加してね！\nルーム ${ui.state.code}\n${url}`;
      const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
      window.open(lineUrl, "_blank", "noopener,noreferrer");
    });
  }

  const answerEl = document.getElementById("answer");
  if (answerEl) {
    answerEl.addEventListener("input", (e) => {
      ui.answer = e.target.value;
    });
    answerEl.focus();
  }

  const answerBtn = document.getElementById("btn-answer");
  if (answerBtn) {
    answerBtn.addEventListener("click", () =>
      emit("submit_answer", { text: ui.answer })
    );
  }

  document.querySelectorAll(".group-card[data-group]").forEach((card) => {
    card.addEventListener("click", async (e) => {
      if (e.target.closest(".split")) return;
      if (!ui.state?.you?.isHost) return;
      const id = card.dataset.group;
      if (!ui.selectedGroupId) {
        ui.selectedGroupId = id;
        render();
        return;
      }
      if (ui.selectedGroupId === id) {
        ui.selectedGroupId = null;
        render();
        return;
      }
      const a = ui.selectedGroupId;
      ui.selectedGroupId = null;
      await emit("merge_groups", { groupIdA: a, groupIdB: id });
    });
  });

  document.querySelectorAll("[data-split]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      emit("unmerge_player", { targetPlayerId: btn.dataset.split });
    });
  });

  const confirmBtn = document.getElementById("btn-confirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => emit("confirm_groups"));
  }

  document.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () =>
      emit("cast_vote", { targetId: btn.dataset.pick })
    );
  });

  const nextBtn = document.getElementById("btn-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => emit("next_question"));
  }

  const endBtn = document.getElementById("btn-end");
  if (endBtn) {
    endBtn.addEventListener("click", () => emit("end_game"));
  }

  const lobbyBtn = document.getElementById("btn-lobby");
  if (lobbyBtn) {
    lobbyBtn.addEventListener("click", () => emit("back_to_lobby"));
  }
}

render();
