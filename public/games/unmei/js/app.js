const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰", "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖", "👻", "🎃", "👽", "🤖"];
const socket = io("/unmei", {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
});

const app = document.getElementById("app");
const ui = {
  view: "home",
  rulesBack: "home",
  name: localStorage.getItem("unmei_name") || "",
  avatar: localStorage.getItem("unmei_avatar") || AVATARS[0],
  joinCode: "",
  error: "",
  state: null,
  busy: false,
  customTopic: "",
  pickId: "",
  arenaKey: "",
  drawnFrom: new Set(),
  drawnBatchSeq: 0,
};

const params = new URLSearchParams(location.search);
if (params.get("room")) ui.joinCode = params.get("room").toUpperCase();

const SESSION_KEY = "unmei_session";
const PARTY_KEY = "party_session";

function loadPartySession() {
  try {
    return JSON.parse(localStorage.getItem(PARTY_KEY) || "null");
  } catch {
    return null;
  }
}
function hasPartySession() {
  const p = loadPartySession();
  return !!(p?.code && p?.playerId);
}
function loadSession() {
  try {
    const party = loadPartySession();
    const local = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (party?.code && party?.playerId) {
      if (!ui.joinCode || party.code === ui.joinCode) return party;
    }
    return local;
  } catch {
    return null;
  }
}
function saveSession(code, playerId) {
  if (code && playerId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }));
    localStorage.setItem(PARTY_KEY, JSON.stringify({ code, playerId }));
  }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function partyHomeUrl(code) {
  const c = code || loadPartySession()?.code || ui.state?.code || ui.joinCode;
  return c ? `/?room=${encodeURIComponent(c)}&pick=1` : "/";
}
function goBackToParty() {
  const url = partyHomeUrl();
  emit("back_to_party").finally(() => {
    location.href = url;
  });
}

if (hasPartySession() || loadSession()?.playerId) ui.view = "joining";

function tryRejoin() {
  const sess = loadSession();
  if (!sess?.code || !sess?.playerId) {
    if (ui.view === "joining") {
      if (hasPartySession() || ui.joinCode) location.href = partyHomeUrl();
      else {
        ui.view = "home";
        render();
      }
    }
    return;
  }
  socket.emit("rejoin", { code: sess.code, playerId: sess.playerId }, (res) => {
    if (res?.ok) {
      saveSession(res.code, res.playerId);
      history.replaceState({}, "", `?room=${res.code}`);
      return;
    }
    clearSession();
    if (hasPartySession() || ui.joinCode) {
      location.href = partyHomeUrl(loadPartySession()?.code || ui.joinCode);
      return;
    }
    ui.state = null;
    ui.view = "home";
    if (res?.error === "この部屋にいません") {
      ui.error = "部屋から外れました。もう一度入ってね";
    }
    render();
  });
}

socket.on("connect", tryRejoin);
socket.on("go_party", ({ code } = {}) => {
  location.href = partyHomeUrl(code);
});
socket.on("kicked", ({ message } = {}) => {
  clearSession();
  if (hasPartySession()) {
    location.href = partyHomeUrl(loadPartySession()?.code);
    return;
  }
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
  if (ui.view !== "rules") {
    ui.view = state.phase === "lobby" ? "lobby" : "game";
  }
  if (state.phase !== "choosing") ui.pickId = state.myPick || "";
  else if (state.myPick) ui.pickId = state.myPick;
  document.body.classList.toggle("love", state.mode === "love");
  render();
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

function saveProfile() {
  localStorage.setItem("unmei_name", ui.name.trim());
  localStorage.setItem("unmei_avatar", ui.avatar);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function partyBackHtml() {
  if (ui.state) {
    return `<button type="button" class="linkish" data-act="party">← ゲーム選択に戻る</button>`;
  }
  const href = hasPartySession() ? partyHomeUrl() : "/";
  return `<a class="back" href="${href}">← ゲーム選択に戻る</a>`;
}

function screenHeadHtml() {
  return `<div class="screen-head">
    ${partyBackHtml()}
    <button type="button" class="linkish" data-act="rules">📖 遊び方</button>
  </div>`;
}

function rulesBodyHtml() {
  return `
    <div class="panel howto">
      <div class="section-title">このゲームは何？</div>
      <p class="sub" style="margin:0">「一緒に〇〇するなら誰？」を指名して、両思いなら成立。最後まで残った1〜2人が飲む。開始は<strong>5人以上</strong>（推奨 6〜10人）。</p>
    </div>
    <div class="panel howto">
      <div class="section-title">2つのモード</div>
      <ul>
        <li><strong>バラエティモード</strong> … 自分以外なら誰でも指名。円形に座る</li>
        <li><strong>ラブモード</strong> … 男／女に分かれて座り、相手の席だけ指名できる</li>
      </ul>
    </div>
    <div class="panel howto">
      <div class="section-title">流れ</div>
      <ol>
        <li>主催者がモードを選んで開始</li>
        <li>お題は「一緒に〇〇するなら」など、2人ですること</li>
        <li>お題が出たら、一番合う人を1人指名（他の人には見えない）</li>
        <li>全員が指名したら開票。主催者がボタンを押すと、線が伸びて誰を選んだか分かる</li>
        <li>開票は「1人ずつ」か「全員一気」（開票画面で選べる）</li>
        <li>両思いなら成立してその2人は抜けられる。不成立の人は残る</li>
        <li>残った人が3人以上なら<strong>同じお題でもう一回</strong>。1人または2人になったら、残った人が1杯</li>
      </ol>
    </div>`;
}

function lobbyHowtoHtml(mode) {
  const love = mode === "love";
  return `
    <div class="panel howto">
      <div class="section-title">このゲームは何？</div>
      <p class="sub" style="margin:0">「一緒に〇〇するなら誰？」を指名して、両思いなら成立。最後まで残った1〜2人が飲む。開始は<strong>5人以上</strong>（推奨 6〜10人）。</p>
    </div>
    <div class="panel howto">
      <div class="section-title">${love ? "ラブモード" : "バラエティモード"}</div>
      <p class="sub" style="margin:0">${
        love
          ? "男／女に分かれて座り、相手の席だけ指名できる。"
          : "自分以外なら誰でも指名。円形に座る。"
      }</p>
    </div>`;
}

function drinkBoardHtml(board) {
  if (!board?.length) return "";
  return `<div class="drink-board"><div class="drink-board-title">🍺 累計罰杯</div>${board
    .map(
      (p) => `<div class="drink-board-row"><span>${p.avatar} ${escapeHtml(p.name)}</span><span>${p.totalCups}杯</span></div>`
    )
    .join("")}</div>`;
}

function genderLabel(g) {
  if (g === "female") return '<span class="badge f">女</span>';
  if (g === "male") return '<span class="badge m">男</span>';
  return '<span class="badge">未選択</span>';
}

function renderRules() {
  return `
    <div class="screen-head">
      ${partyBackHtml()}
      <button type="button" class="linkish" data-act="rules-back">← 戻る</button>
    </div>
    <h1>遊び方</h1>
    <p class="sub">運命の人ゲーム</p>
    ${rulesBodyHtml()}
    <button type="button" class="btn ghost" data-act="rules-back">戻る</button>`;
}

function renderHome() {
  return `
    <p>${partyBackHtml()}</p>
    <h1>運命の人ゲーム</h1>
    <p class="sub">お題で1人を指名。両思いなら成立、最後まで残った人が飲む。</p>
    <p style="margin:0 0 12px"><button type="button" class="linkish" data-act="rules">📖 遊び方</button></p>
    <div class="panel">
      <label>なまえ</label>
      <input type="text" id="name" maxlength="12" placeholder="例：たろう" value="${escapeHtml(ui.name)}" />
      <label>アバター</label>
      <div class="avatars">${AVATARS.map(
        (a) =>
          `<button type="button" data-av="${a}" class="${ui.avatar === a ? "on" : ""}">${a}</button>`
      ).join("")}</div>
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
      <button class="btn" data-act="create" ${ui.busy ? "disabled" : ""}>ルームを作る（主催）</button>
      <label style="margin-top:8px">ルームコードで参加</label>
      <input type="text" id="join-code" maxlength="6" placeholder="ABCD" value="${escapeHtml(ui.joinCode)}" style="text-transform:uppercase;letter-spacing:.15em" />
      <button class="btn join" data-act="join" ${ui.busy ? "disabled" : ""}>ルームに入る</button>
    </div>`;
}

function renderJoining() {
  return `
    <p>${partyBackHtml()}</p>
    <h1>運命の人ゲーム</h1>
    <p class="wait">ゲームに入っています…</p>`;
}

function renderLobby() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  const love = s.mode === "love";
  return `
    ${screenHeadHtml()}
    <h1>運命の人ゲーム</h1>
    <div class="panel">
      <div class="section-title">モード</div>
      <div class="mode-grid">
        <button type="button" class="mode-card ${s.mode === "variety" ? "on-v" : ""}" data-act="mode" data-mode="variety" ${isHost && !ui.busy ? "" : "disabled"}>
          <div class="ttl">バラエティモード</div>
          <div class="dsc">自分以外なら誰でも指名できる</div>
        </button>
        <button type="button" class="mode-card ${love ? "on-l" : ""}" data-act="mode" data-mode="love" ${isHost && !ui.busy ? "" : "disabled"}>
          <div class="ttl">ラブモード</div>
          <div class="dsc">男女に分かれて座る</div>
        </button>
      </div>
    </div>
    ${
      love
        ? `<div class="panel">
            <div class="section-title">自分の席（男／女）</div>
            <p class="host-tip">ラブモードは入るときに性別を選びます。主催者は他の人のも変えられます。</p>
            <div class="gender-btns" style="margin-bottom:8px">
              <button type="button" class="f ${s.you?.gender === "female" ? "on" : ""}" data-act="gender" data-gender="female">女</button>
              <button type="button" class="m ${s.you?.gender === "male" ? "on" : ""}" data-act="gender" data-gender="male">男</button>
            </div>
          </div>`
        : ""
    }
    ${
      love
        ? `<div class="panel">
      <div class="section-title">参加者 ${s.players.length}/10</div>
      <div class="players">${s.players
        .map((p) => {
          const flags = [];
          if (p.isHost) flags.push('<span class="badge host">主催</span>');
          if (p.isBot) flags.push('<span class="badge">PC</span>');
          if (love) flags.push(genderLabel(p.gender));
          return `<div class="player-row ${p.connected ? "" : "off"}">
            <div class="av">${p.avatar}</div>
            <div class="nm">${escapeHtml(p.name)} ${flags.join(" ")}</div>
            ${
              love && isHost
                ? `<div class="gender-btns">
                    <button type="button" class="f ${p.gender === "female" ? "on" : ""}" data-act="gender" data-gender="female" data-who="${p.id}">女</button>
                    <button type="button" class="m ${p.gender === "male" ? "on" : ""}" data-act="gender" data-gender="male" data-who="${p.id}">男</button>
                  </div>`
                : ""
            }
            ${
              isHost && p.id !== s.you.id
                ? p.isBot
                  ? `<button type="button" class="kick" data-act="remove-bot" data-id="${p.id}">削除</button>`
                  : `<button type="button" class="kick" data-act="kick" data-id="${p.id}">削除</button>`
                : ""
            }
          </div>`;
        })
        .join("")}</div>
    </div>`
        : ""
    }
    <div class="lobby-actions">
      ${
        isHost
          ? `<button class="btn" data-act="start" ${!s.canStart || ui.busy ? "disabled" : ""}>ゲーム開始（${s.minPlayers}人〜）</button>`
          : `<p class="wait">主催者の開始待ち…</p>`
      }
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>
    ${lobbyHowtoHtml(s.mode)}`;
}

function renderPickTopic() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">${s.round}回戦</span><span>${s.mode === "love" ? "ラブモード" : "バラエティモード"}</span></div>
    <div class="panel">
      <div class="section-title">お題を選ぶ</div>
      ${
        isHost
          ? `<p class="host-tip">3つから1つ選ぶか、自分で入力してね</p>
             <div class="topic-choices">
               ${(s.topicChoices || [])
                 .map(
                   (t) =>
                     `<button type="button" class="topic-choice" data-act="topic" data-id="${t.id}" ${ui.busy ? "disabled" : ""}>${escapeHtml(t.text)}</button>`
                 )
                 .join("")}
             </div>
             <button class="btn ghost" data-act="refresh" ${ui.busy ? "disabled" : ""}>お題を入れ替える</button>
             <label style="margin-top:12px">オリジナルお題</label>
             <input type="text" id="custom-topic" maxlength="40" placeholder="例：この中で一緒に飲みに行くなら誰？" value="${escapeHtml(ui.customTopic)}" />
             <button class="btn" data-act="custom-topic" ${ui.busy ? "disabled" : ""}>このお題で始める</button>
             ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}`
          : `<p class="wait">主催者がお題を選んでいます…</p>`
      }
    </div>`;
}

function renderChoosing() {
  const s = ui.state;
  const canPick = s.you?.active && s.targets?.length;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">${s.round}回戦</span><span>指名 ${s.pickedCount}/${s.expectedCount}</span></div>
    <div class="topic">${escapeHtml(s.topic?.text || "")}</div>
    ${
      canPick
        ? `<div class="panel">
            <div class="section-title">${s.hasPicked ? "指名を変えられるよ" : "1人選んでね"}</div>
            <div class="pick-grid">${(s.targets || [])
              .map(
                (p) =>
                  `<button type="button" class="pick-card ${ui.pickId === p.id ? "on" : ""}" data-act="target" data-id="${p.id}">
                    <span class="pick-av">${p.avatar}</span>
                    <span class="pick-name">${escapeHtml(p.name)}</span>
                  </button>`
              )
              .join("")}</div>
            <button class="btn" data-act="submit-pick" ${!ui.pickId || ui.busy ? "disabled" : ""}>${s.hasPicked ? "指名を更新" : "この人に指名"}</button>
          </div>`
        : `<div class="panel"><p class="wait">${s.you?.active ? "指名できる相手がいません" : "成立したのでこの回戦は見学です"}</p></div>`
    }
    <div class="panel">
      <div class="section-title">まだの人</div>
      <p class="waiting">${
        (s.waitingPick || []).length
          ? s.waitingPick.map((p) => `${p.avatar} ${escapeHtml(p.name)}`).join("、")
          : "全員指名済み。開票へ…"
      }</p>
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>`;
}

function playerById(id) {
  return (ui.state?.players || []).find((p) => p.id === id);
}

function genderClass(p) {
  if (p?.gender === "female") return "f";
  if (p?.gender === "male") return "m";
  return "";
}

function lineColor(fromId) {
  const p = playerById(fromId);
  if (ui.state?.mode === "love") {
    return p?.gender === "female" ? "#ff6ea8" : "#6ec8ff";
  }
  return "#ffe08a";
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function seatOf(id) {
  return (ui.state?.seats || []).find((s) => s.id === id);
}

function animateDots(svg, x1, y1, x2, y2, color) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(10, Math.floor(dist / 2.4));
  const delay = Math.max(70, 2200 / n);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = svgEl("circle", {
      cx: x1 + (x2 - x1) * t,
      cy: y1 + (y2 - y1) * t,
      r: i === n ? 1.35 : 1.05,
      fill: color,
      opacity: "0",
    });
    svg.appendChild(c);
    setTimeout(() => {
      c.setAttribute("opacity", "1");
    }, i * delay);
  }
  return n * delay + 80;
}

function addHeart(svg, x, y, color) {
  const g = svgEl("g", {
    transform: `translate(${x} ${y}) scale(0.022) translate(-256 -256)`,
  });
  const path = svgEl("path", {
    d: "M256 448l-35-31C86 307 32 259 32 192 32 124 85 80 148 80c39 0 77 18 108 47 31-29 69-47 108-47 63 0 116 44 116 112 0 67-54 115-189 225l-35 31z",
    fill: color,
  });
  g.appendChild(path);
  svg.appendChild(g);
}

function addArrow(svg, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const deg = (angle * 180) / Math.PI;
  const g = svgEl("g", {
    transform: `translate(${x2} ${y2}) rotate(${deg})`,
  });
  const path = svgEl("path", {
    d: "M 0 0 L -4.2 -2.4 L -2.6 0 L -4.2 2.4 Z",
    fill: color,
  });
  g.appendChild(path);
  svg.appendChild(g);
}

function addLineEnd(svg, x1, y1, x2, y2, color) {
  if (ui.state?.mode === "love") addArrow(svg, x1, y1, x2, y2, color);
  else addHeart(svg, x2, y2, color);
}

function stampAt(midX, midY, ok) {
  const fx = document.getElementById("fx");
  if (!fx) return;
  const el = document.createElement("div");
  el.className = `stamp ${ok ? "ok" : "ng"}`;
  el.textContent = ok ? "成立" : "不成立";
  el.style.left = `${midX}%`;
  el.style.top = `${midY}%`;
  fx.appendChild(el);
}

function sparkles() {
  const fx = document.getElementById("fx");
  if (!fx) return;
  for (let i = 0; i < 8; i++) {
    const s = document.createElement("div");
    s.className = "spark";
    s.textContent = "✦";
    s.style.left = `${42 + Math.random() * 16}%`;
    s.style.top = `${42 + Math.random() * 16}%`;
    fx.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

function showCenterHeart() {
  if (ui.state?.mode === "love") return;
  const fx = document.getElementById("fx");
  if (!fx || fx.querySelector(".center-heart")) return;
  const h = document.createElement("div");
  h.className = "center-heart";
  h.textContent = "♥";
  fx.appendChild(h);
  sparkles();
}

function drawPickLineInstant(fromId, toId, mutual) {
  const svg = document.getElementById("lines");
  if (!svg) return;
  const a = seatOf(fromId);
  const b = seatOf(toId);
  if (!a || !b) return;
  const color = lineColor(fromId);
  const dist = Math.hypot(b.portX - a.portX, b.portY - a.portY);
  const n = Math.max(8, Math.floor(dist / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    svg.appendChild(
      svgEl("circle", {
        cx: a.portX + (b.portX - a.portX) * t,
        cy: a.portY + (b.portY - a.portY) * t,
        r: i === n ? 1.6 : 1.15,
        fill: color,
      })
    );
  }
  addLineEnd(svg, a.portX, a.portY, b.portX, b.portY, mutual ? "#ff4d88" : "#ff6b7a");
  stampAt((a.portX + b.portX) / 2, (a.portY + b.portY) / 2, mutual);
  if (mutual) showCenterHeart();
}

function drawPickLine(fromId, toId, mutual, { stamp = true, heartCenter = true } = {}) {
  const svg = document.getElementById("lines");
  if (!svg) return 0;
  const a = seatOf(fromId);
  const b = seatOf(toId);
  if (!a || !b) return 0;
  const color = lineColor(fromId);
  const ms = animateDots(svg, a.portX, a.portY, b.portX, b.portY, color);
  setTimeout(() => {
    addLineEnd(svg, a.portX, a.portY, b.portX, b.portY, mutual ? "#ff4d88" : "#ff6b7a");
    if (stamp) {
      stampAt((a.portX + b.portX) / 2, (a.portY + b.portY) / 2, mutual);
    }
    if (mutual && heartCenter) showCenterHeart();
  }, ms);
  return ms;
}

function setupArena(s) {
  const arena = document.getElementById("arena");
  const seatsEl = document.getElementById("seats");
  if (!arena || !seatsEl) return;
  seatsEl.innerHTML = "";
  const svg = document.getElementById("lines");
  if (svg) svg.replaceChildren();
  const fx = document.getElementById("fx");
  if (fx) fx.replaceChildren();
  ui.drawnFrom = new Set();
  ui.drawnBatchSeq = 0;

  for (const seat of s.seats || []) {
    const p = playerById(seat.id);
    if (!p) continue;
    const wrap = document.createElement("div");
    wrap.className = `seat ${genderClass(p)}`;
    wrap.style.left = `${seat.x}%`;
    wrap.style.top = `${seat.y}%`;
    wrap.innerHTML = `<div class="av">${p.avatar}</div><div class="nm">${escapeHtml(p.name)}</div>`;
    if ((s.phase === "result" || s.phase === "gameover") && s.remain && !s.remain.some((r) => r.id === p.id) && (s.pairs || []).some((pair) => pair.a.id === p.id || pair.b.id === p.id)) {
      wrap.classList.add("paired");
    }
    seatsEl.appendChild(wrap);

    const port = document.createElement("button");
    port.type = "button";
    port.className = `port ${genderClass(p)}`;
    port.style.left = `${seat.portX}%`;
    port.style.top = `${seat.portY}%`;
    port.dataset.act = "reveal-one";
    port.dataset.id = seat.id;
    port.title = p.name;
    seatsEl.appendChild(port);
  }
  updatePorts(s);
  if (s.phase === "result" || s.phase === "gameover") {
    for (const pick of s.revealedPicks || []) {
      ui.drawnFrom.add(pick.fromId);
      drawPickLineInstant(pick.fromId, pick.toId, pick.mutual);
    }
  }
}

function updatePorts(s) {
  const isHost = s.you?.isHost;
  const oneByOne = s.revealStyle === "one" && s.phase === "reveal";
  document.querySelectorAll(".port").forEach((port) => {
    const id = port.dataset.id;
    const done = (s.revealedIds || []).includes(id);
    port.classList.toggle("done", done);
    port.disabled = !isHost || !oneByOne || done || s.phase !== "reveal";
    port.classList.toggle("pulse", isHost && oneByOne && !done && s.phase === "reveal");
  });
}

function syncRevealLines(s) {
  const last = s.lastReveal;
  const animating = new Set();
  if (last?.style === "all" && last.batch && last.seq !== ui.drawnBatchSeq) {
    for (const ev of last.batch) animating.add(ev.fromId);
  } else if (last && last.style !== "all" && last.fromId && !ui.drawnFrom.has(last.fromId)) {
    animating.add(last.fromId);
  }

  for (const pick of s.revealedPicks || []) {
    if (ui.drawnFrom.has(pick.fromId) || animating.has(pick.fromId)) continue;
    ui.drawnFrom.add(pick.fromId);
    drawPickLineInstant(pick.fromId, pick.toId, pick.mutual);
  }

  if (last?.style === "all" && last.batch && last.seq !== ui.drawnBatchSeq) {
    ui.drawnBatchSeq = last.seq;
    (last.batch || []).forEach((ev, i) => {
      if (ui.drawnFrom.has(ev.fromId)) return;
      ui.drawnFrom.add(ev.fromId);
      setTimeout(() => {
        drawPickLine(ev.fromId, ev.toId, ev.mutual, {
          stamp: true,
          heartCenter: ev.mutual,
        });
      }, i * 550);
    });
    return;
  }
  if (last && last.style !== "all" && last.fromId && !ui.drawnFrom.has(last.fromId)) {
    ui.drawnFrom.add(last.fromId);
    drawPickLine(last.fromId, last.toId, last.mutual);
  }
}

function arenaHtml(s) {
  const love = s.mode === "love";
  return `
    <div class="arena-wrap">
      <div id="arena" class="arena ${love ? "love" : "variety"}">
        <div class="table-ring"></div>
        <svg id="lines" class="lines" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div id="fx" class="fx"></div>
        <div id="seats"></div>
      </div>
    </div>`;
}

function pairHtml(s) {
  if (!s.pairs?.length) return "";
  return `<div class="panel">
    <div class="section-title">成立したペア</div>
    <div class="pair-list">${s.pairs
      .map(
        (p) =>
          `<div class="pair-chip">${p.a.avatar} ${escapeHtml(p.a.name)} ♥ ${p.b.avatar} ${escapeHtml(p.b.name)}</div>`
      )
      .join("")}</div>
  </div>`;
}

function renderReveal() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  const left = (s.expectedCount || 0) - (s.revealedIds || []).length;
  const allDone = left <= 0;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar">
      <span class="pill">${s.round}回戦 開票</span>
      <span>${s.revealStyle === "all" ? "全員一気" : "1人ずつ"}</span>
    </div>
    <div class="topic">${escapeHtml(s.topic?.text || "")}</div>
    ${
      isHost && s.phase === "reveal" && !(s.revealedIds || []).length
        ? `<div class="style-row" style="margin-bottom:10px">
            <button type="button" class="${s.revealStyle === "one" ? "on" : ""}" data-act="style" data-style="one">人を選んで開票</button>
            <button type="button" data-act="reveal-all" ${ui.busy ? "disabled" : ""}>全員一気に開票</button>
          </div>`
        : ""
    }
    <p class="host-tip">${
      isHost
        ? s.revealStyle === "all" || (s.revealedIds || []).length
          ? "線が伸びるのを見てね"
          : "テーブルの丸ボタンを押すと、その人の線が伸びます"
        : "主催者が開票しています。線を見てね"
    }</p>
    ${arenaHtml(s)}
    <div id="host-actions">
    ${
      isHost && allDone
        ? `<button class="btn" data-act="finish" ${ui.busy ? "disabled" : ""}>結果へ</button>`
        : `<p class="wait">${allDone ? "結果待ち…" : s.revealStyle === "one" ? `残り ${left} 人` : ""}</p>`
    }
    ${
      isHost
        ? `<button class="btn ghost" data-act="back-topic" ${ui.busy ? "disabled" : ""}>お題選択に戻る</button>`
        : ""
    }
    </div>
    ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    ${pairHtml(s)}`;
}

function renderResult() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">${s.round}回戦 結果</span></div>
    <div class="topic">${escapeHtml(s.topic?.text || "")}</div>
    ${arenaHtml(s)}
    <p class="banner ok">${(s.pairs || []).length ? "成立した人は抜けられます" : "そろわなかった"}</p>
    ${pairHtml(s)}
    <div class="panel">
      <div class="section-title">まだ残っている人</div>
      <p class="waiting">${(s.remain || []).map((p) => `${p.avatar} ${escapeHtml(p.name)}`).join("、")}</p>
      <p class="host-tip">同じお題でもう一回指名します。</p>
      ${
        isHost
          ? `<button class="btn" data-act="next" ${ui.busy ? "disabled" : ""}>同じお題でもう一回</button>`
          : `<p class="wait">主催者の操作待ち…</p>`
      }
    </div>
    ${drinkBoardHtml(s.drinkBoard)}`;
}

function renderGameover() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  let title = "ゲーム終了";
  let msg = "";
  if (s.resultKind === "all_paired") {
    title = "全員成立！";
    msg = "飲む人はいません。運命の人、揃いました。";
  } else if (s.resultKind === "cannot_pair") {
    title = "これ以上ペアができない";
    msg = "残った人が飲みます。";
  } else {
    title = "最後まで残った人";
    msg = "残った人が1杯。";
  }
  return `
    ${screenHeadHtml()}
    <div class="banner drink">${escapeHtml(title)}</div>
    <div class="topic">${escapeHtml(s.topic?.text || "")}</div>
    ${arenaHtml(s)}
    <div class="panel">
      <p class="sub" style="margin-top:0">${escapeHtml(msg)}</p>
      ${
        (s.drinks || []).length
          ? `<div class="section-title">飲む人</div>${s.drinks
              .map(
                (d) =>
                  `<div class="player-row"><div class="av">${d.avatar}</div><div class="nm">${escapeHtml(d.name)}</div><div>${d.cups}杯</div></div>`
              )
              .join("")}`
          : ""
      }
      ${pairHtml(s)}
      ${
        isHost
          ? `<button class="btn" data-act="again" ${ui.busy ? "disabled" : ""}>ロビーに戻る</button>`
          : `<p class="wait">主催者の操作待ち…</p>`
      }
    </div>
    ${drinkBoardHtml(s.drinkBoard)}`;
}

function gameHtml() {
  const s = ui.state;
  if (!s) return renderJoining();
  if (s.phase === "pick_topic") return renderPickTopic();
  if (s.phase === "choosing") return renderChoosing();
  if (s.phase === "reveal") return renderReveal();
  if (s.phase === "result") return renderResult();
  if (s.phase === "gameover") return renderGameover();
  return renderLobby();
}

function tablePhase(phase) {
  return ["reveal", "result", "gameover"].includes(phase);
}

function render() {
  const s = ui.state;
  app.classList.toggle("wide", tablePhase(s?.phase));

  if (ui.view === "home") {
    ui.arenaKey = "";
    app.innerHTML = renderHome();
    return;
  }
  if (ui.view === "joining") {
    ui.arenaKey = "";
    app.innerHTML = renderJoining();
    return;
  }
  if (ui.view === "rules") {
    app.innerHTML = renderRules();
    return;
  }
  if (ui.view === "lobby" || s?.phase === "lobby") {
    ui.arenaKey = "";
    app.innerHTML = renderLobby();
    return;
  }

  const key = s ? `${s.round}-${s.mode}-${s.phase}` : "";
  const keep = key === ui.arenaKey && s?.phase === "reveal" && document.getElementById("arena");
  if (!keep) {
    app.innerHTML = gameHtml();
    ui.arenaKey = key;
    if (document.getElementById("arena")) setupArena(s);
  } else {
    updatePorts(s);
    const styleRow = app.querySelector(".style-row");
    if (styleRow && (s.revealedIds || []).length) styleRow.remove();
    const actions = document.getElementById("host-actions");
    if (actions) {
      const left = (s.expectedCount || 0) - (s.revealedIds || []).length;
      const allDone = left <= 0;
      const isHost = s.you?.isHost;
      actions.innerHTML = `
        ${
          isHost && allDone
            ? `<button class="btn" data-act="finish" ${ui.busy ? "disabled" : ""}>結果へ</button>`
            : `<p class="wait">${allDone ? "結果待ち…" : s.revealStyle === "one" ? `残り ${left} 人` : ""}</p>`
        }
        ${
          isHost
            ? `<button class="btn ghost" data-act="back-topic" ${ui.busy ? "disabled" : ""}>お題選択に戻る</button>`
            : ""
        }
        ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}`;
    }
  }
  if (s?.phase === "reveal") syncRevealLines(s);
}

async function onClick(e) {
  const av = e.target.closest("[data-av]");
  if (av) {
    ui.avatar = av.dataset.av;
    render();
    return;
  }
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act;
  const s = ui.state;

  if (act === "rules") {
    ui.rulesBack = ui.view;
    ui.view = "rules";
    render();
    return;
  }
  if (act === "rules-back") {
    ui.view = ui.rulesBack || "home";
    render();
    return;
  }
  if (act === "party") return goBackToParty();
  if (act === "create") {
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
    return;
  }
  if (act === "join") {
    const codeEl = document.getElementById("join-code");
    ui.joinCode = (codeEl?.value || ui.joinCode).toUpperCase();
    if (!ui.name.trim()) {
      ui.error = "なまえを入れてね";
      render();
      return;
    }
    saveProfile();
    const res = await emit("join_room", {
      code: ui.joinCode,
      name: ui.name,
      avatar: ui.avatar,
    });
    if (res?.ok) {
      saveSession(res.code, res.playerId);
      history.replaceState({}, "", `?room=${res.code}`);
    }
    return;
  }
  if (act === "mode") return emit("set_mode", { mode: btn.dataset.mode });
  if (act === "style") return emit("set_reveal_style", { style: btn.dataset.style });
  if (act === "gender") {
    return emit("set_gender", { gender: btn.dataset.gender, targetId: btn.dataset.who });
  }
  if (act === "add-bot") return emit("add_bot");
  if (act === "remove-bot") return emit("remove_bot", { botId: btn.dataset.id });
  if (act === "kick") return emit("kick_player", { playerId: btn.dataset.id });
  if (act === "start") return emit("start_game");
  if (act === "topic") return emit("pick_topic", { topicId: btn.dataset.id });
  if (act === "refresh") return emit("refresh_topics");
  if (act === "custom-topic") return emit("pick_custom_topic", { text: ui.customTopic });
  if (act === "target") {
    ui.pickId = btn.dataset.id;
    render();
    return;
  }
  if (act === "submit-pick") return emit("submit_pick", { targetId: ui.pickId });
  if (act === "pick-for") return emit("host_pick_for", { playerId: btn.dataset.id });
  if (act === "reveal-one") return emit("reveal_one", { playerId: btn.dataset.id });
  if (act === "reveal-all") return emit("reveal_all");
  if (act === "back-topic") return emit("back_to_topic");
  if (act === "finish") return emit("finish_reveal");
  if (act === "next") return emit("next_round");
  if (act === "again") return emit("back_to_lobby");
  if (!s) return;
}

function onInput(e) {
  if (e.target.id === "name") ui.name = e.target.value;
  if (e.target.id === "join-code") ui.joinCode = e.target.value.toUpperCase();
  if (e.target.id === "custom-topic") ui.customTopic = e.target.value;
}

app.addEventListener("click", onClick);
app.addEventListener("input", onInput);
render();
