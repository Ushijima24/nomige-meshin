const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰", "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖", "👻", "🎃", "👽", "🤖"];
const socket = io("/party", {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
});

const app = document.getElementById("app");
const SESSION_KEY = "party_session";

const ui = {
  view: "home",
  name: localStorage.getItem("party_name") || "",
  avatar: localStorage.getItem("party_avatar") || AVATARS[0],
  joinCode: "",
  error: "",
  state: null,
  busy: false,
};

const params = new URLSearchParams(location.search);
if (params.get("room")) ui.joinCode = params.get("room").toUpperCase();
let stayOnPicker = params.get("pick") === "1";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

if (loadSession()?.code && loadSession()?.playerId) ui.view = "joining";
function saveSession(code, playerId) {
  if (code && playerId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }));
  }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function saveProfile() {
  localStorage.setItem("party_name", ui.name.trim());
  localStorage.setItem("party_avatar", ui.avatar);
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tryRejoin() {
  const sess = loadSession();
  if (!sess?.code || !sess?.playerId) return;
  socket.emit("rejoin", { code: sess.code, playerId: sess.playerId }, (res) => {
    if (res?.ok) {
      history.replaceState(
        {},
        "",
        stayOnPicker ? `?room=${res.code}&pick=1` : `?room=${res.code}`
      );
      return;
    }
    clearSession();
    ui.state = null;
    ui.view = "home";
    render();
  });
}

socket.on("connect", tryRejoin);
socket.on("state", (state) => {
  ui.state = state;
  ui.error = "";
  ui.view = "lobby";
  render();
  if (!stayOnPicker) return;
  if (state.isHost && state.phase === "in_game") {
    emit("return_to_party");
    return;
  }
  if (state.phase === "lobby") {
    stayOnPicker = false;
    history.replaceState({}, "", `?room=${state.code}`);
  }
});
socket.on("enter_game", ({ path, code, playerId }) => {
  if (stayOnPicker) return;
  saveSession(code, playerId);
  location.href = `${path}?room=${encodeURIComponent(code)}`;
});
socket.on("kicked", ({ message } = {}) => {
  clearSession();
  ui.state = null;
  ui.view = "home";
  ui.error = message || "主催者に部屋から外されました";
  history.replaceState({}, "", "/");
  render();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (socket.disconnected) socket.connect();
  else tryRejoin();
});

function emit(event, data = {}) {
  return new Promise((resolve) => {
    ui.busy = true;
    render();
    socket.emit(event, data, (res) => {
      ui.busy = false;
      if (res && !res.ok) ui.error = res.error || "エラー";
      render();
      resolve(res || { ok: false });
    });
  });
}

function renderHome() {
  return `
    <div class="brand">
      <div class="name">NOMI GE PARTY</div>
      <h1>飲みゲーパーティー</h1>
      <p>まず部屋をつくって集まろう。中で遊ぶゲームを選べます。</p>
    </div>
    <div class="panel">
      <label>なまえ</label>
      <input type="text" id="name" maxlength="12" value="${escapeHtml(ui.name)}" placeholder="例: たろう" />
      <label>アバター</label>
      <div class="avatars">${AVATARS.map(
        (a) =>
          `<button type="button" data-av="${a}" class="${ui.avatar === a ? "on" : ""}">${a}</button>`
      ).join("")}</div>
      <button class="btn" id="create" ${ui.busy ? "disabled" : ""}>ルームを作る（主催）</button>
      <label style="margin-top:14px">ルームコードで参加</label>
      <input type="text" id="code" maxlength="4" value="${escapeHtml(ui.joinCode)}" placeholder="ABCD" style="text-transform:uppercase" />
      <button class="btn join" id="join" ${ui.busy ? "disabled" : ""}>参加する</button>
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>
    <div class="panel">
      <div class="section-title">遊び方の流れ</div>
      <p class="sub" style="margin:0">① 部屋に入る → ② 主催者がゲームを選ぶ → ③ そのゲームで遊ぶ → ④ また部屋に戻って別ゲームもOK。</p>
    </div>
  `;
}

function renderLobby() {
  const s = ui.state;
  const games = s.games || [];
  return `
    <div class="brand">
      <div class="name">NOMI GE PARTY</div>
      <h1>パーティー</h1>
      <div class="code-big">${escapeHtml(s.code)}</div>
      <p>このコードを共有して、そろったらゲームを選んでね</p>
    </div>
    <div class="panel">
      <div class="section-title">${s.isHost ? "ゲームを選ぶ" : "主催者の選択待ち"}</div>
      ${
        s.isHost
          ? games
              .map(
                (g) =>
                  `<button type="button" class="game-pick" data-game="${g.id}" ${
                    ui.busy || s.players.length < (g.minPlayers || 2) ? "disabled" : ""
                  }>
                    <div class="title">${escapeHtml(g.title)}</div>
                    <div class="desc">${escapeHtml(g.desc)}${
                      g.minPlayers && s.players.length < g.minPlayers
                        ? `（${g.minPlayers}人以上）`
                        : ""
                    }</div>
                  </button>`
              )
              .join("")
          : `<p class="sub" style="margin:0">主催者がゲームを選ぶと、みんなでその画面に移動します。</p>`
      }
      ${s.players.length < 2 ? `<p class="sub">開始には2人以上必要です（PC追加も可）</p>` : ""}
    </div>
    <div class="panel">
      <div class="section-title">参加者 ${s.players.length}/10</div>
      <div class="players">${s.players
        .map((p) => {
          const flags = [];
          if (p.isHost) flags.push('<span class="badge host">主催</span>');
          if (p.isBot) flags.push('<span class="badge">PC</span>');
          return `<div class="player-chip ${p.connected ? "" : "off"}">
            <div class="av">${p.avatar}</div>
            <div class="nm">${escapeHtml(p.name)}${flags.join("")}</div>
            <div class="meta">${p.drinkTotal || 0}杯</div>
            ${
              s.isHost && p.id !== s.you
                ? `<button type="button" class="kick" data-kick="${p.id}">削除</button>`
                : ""
            }
          </div>`;
        })
        .join("")}</div>
      ${
        s.isHost
          ? `<div class="row" style="margin-top:12px">
              <button class="btn ghost" id="add-bot" ${ui.busy || s.players.length >= 10 ? "disabled" : ""}>＋PC参加</button>
            </div>`
          : ""
      }
    </div>
    <div class="panel totals-mini">
      <div class="section-title">累計</div>
      <div class="totals-line">${(s.drinkBoard || [])
        .map(
          (p) =>
            `<span class="total-chip">${p.avatar} ${escapeHtml(p.name)} <b>${p.drinkTotal || 0}</b></span>`
        )
        .join("")}</div>
      ${
        s.isHost
          ? `<button class="btn danger mini" id="reset-drinks" ${ui.busy ? "disabled" : ""}>累計リセット</button>`
          : ""
      }
    </div>
    <button class="btn ghost" id="leave" ${ui.busy ? "disabled" : ""}>この部屋から出る</button>
    ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
  `;
}

function renderJoining() {
  return `
    <div class="brand">
      <div class="name">NOMI GE PARTY</div>
      <h1>パーティー</h1>
      <p>部屋に入っています…</p>
    </div>
  `;
}

function render() {
  if (ui.view === "lobby" && ui.state) app.innerHTML = renderLobby();
  else if (ui.view === "joining") app.innerHTML = renderJoining();
  else app.innerHTML = renderHome();
  bind();
}

function bind() {
  app.querySelector("#name")?.addEventListener("input", (e) => {
    ui.name = e.target.value;
  });
  app.querySelector("#code")?.addEventListener("input", (e) => {
    ui.joinCode = e.target.value.toUpperCase();
  });
  app.querySelectorAll("[data-av]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.avatar = b.getAttribute("data-av");
      render();
    })
  );
  app.querySelector("#create")?.addEventListener("click", async () => {
    saveProfile();
    if (!ui.name.trim()) {
      ui.error = "なまえを入れてね";
      render();
      return;
    }
    const res = await emit("create_room", { name: ui.name, avatar: ui.avatar });
    if (res.ok) {
      saveSession(res.code, res.playerId);
      history.replaceState({}, "", `?room=${res.code}`);
    }
  });
  app.querySelector("#join")?.addEventListener("click", async () => {
    saveProfile();
    if (!ui.name.trim()) {
      ui.error = "なまえを入れてね";
      render();
      return;
    }
    const res = await emit("join_room", {
      code: ui.joinCode,
      name: ui.name,
      avatar: ui.avatar,
    });
    if (res.ok) {
      saveSession(res.code, res.playerId);
      history.replaceState({}, "", `?room=${res.code}`);
    }
  });
  app.querySelector("#add-bot")?.addEventListener("click", () => emit("add_bot"));
  app.querySelector("#reset-drinks")?.addEventListener("click", () => emit("reset_drinks"));
  app.querySelectorAll("[data-kick]").forEach((b) =>
    b.addEventListener("click", () =>
      emit("kick_player", { playerId: b.getAttribute("data-kick") })
    )
  );
  app.querySelectorAll("[data-game]").forEach((b) =>
    b.addEventListener("click", () =>
      emit("select_game", { gameId: b.getAttribute("data-game") })
    )
  );
  app.querySelector("#leave")?.addEventListener("click", async () => {
    await emit("leave_room");
    clearSession();
    ui.state = null;
    ui.view = "home";
    ui.error = "";
    history.replaceState({}, "", "/");
    render();
  });
}

render();
