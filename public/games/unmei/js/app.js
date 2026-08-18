const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰", "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖", "👻", "🎃", "👽", "🤖"];
const AVATAR_COLORS = {
  "🦊": "#ff9a3d",
  "🐻": "#d08a4a",
  "🐱": "#ffd24a",
  "🐸": "#6dff6a",
  "🐼": "#f2f2f2",
  "🐷": "#ff8fbf",
  "🦁": "#ffc14d",
  "🐨": "#9eb0c8",
  "🐵": "#e89b5c",
  "🐰": "#ffd0ea",
  "🐯": "#ff7a2e",
  "🐮": "#fff1c2",
  "🐶": "#e8b86d",
  "🐺": "#8aa0c0",
  "🦝": "#c9b49a",
  "🐔": "#ff5c5c",
  "🐧": "#5ec8ff",
  "🦄": "#d39bff",
  "🐙": "#ff6ea8",
  "🦖": "#4ee08a",
  "👻": "#e6e6ff",
  "🎃": "#ff9f2e",
  "👽": "#7dffb0",
  "🤖": "#7ecbff",
};
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
  arenaBox: { w: 100, h: 100 },
  drawnFrom: new Set(),
  drawnBatchSeq: 0,
  stampedFrom: new Set(),
  stampedPairs: new Set(),
  stampSpots: [],
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

function emit(event, data = {}, opts = {}) {
  const lock = opts.lock === true;
  return new Promise((resolve) => {
    if (lock) ui.busy = true;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ui.busy = false;
      ui.error = ui.error || "応答がありません。もう一度押してね";
      render();
      resolve({ ok: false, error: ui.error });
    }, 8000);
    socket.emit(event, data, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ui.busy = false;
      if (res && !res.ok) {
        ui.error = res.error || "エラー";
        render();
      } else if (res?.ok) {
        ui.error = "";
      }
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
    </div>
    <div class="panel howto">
      <div class="section-title">流れ</div>
      <ol>
        <li>主催者がモードを選んで開始</li>
        <li>お題は「一緒に〇〇するなら」など、2人ですること</li>
        <li>お題が出たら、一番合う人を1人指名（他の人には見えない）</li>
        <li>${
          love
            ? "男女に分かれて座り、相手の席だけ指名できる"
            : "自分以外なら誰でも指名。円形に座る"
        }</li>
        <li>指名したら開票。主催者が人を押すと、矢印の線が伸びて誰を選んだか分かる</li>
        <li>開票は「1人ずつ」か「全員一気」（開票画面で選べる）</li>
        <li>両方の線を見てから成立／不成立が分かる。両思いならその2人は抜けられる</li>
        <li>残った人が3人以上なら<strong>同じお題でもう一回</strong>。1人または2人になったら、残った人が1杯</li>
      </ol>
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
          ? `<button class="btn" data-act="start" ${!s.canStart ? "disabled" : ""}>ゲーム開始（${s.minPlayers}人〜）</button>`
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
                     `<button type="button" class="topic-choice" data-act="topic" data-id="${t.id}">${escapeHtml(t.text)}</button>`
                 )
                 .join("")}
             </div>
             <button class="btn ghost" data-act="refresh">お題を入れ替える</button>
             <label style="margin-top:12px">オリジナルお題</label>
             <input type="text" id="custom-topic" maxlength="40" placeholder="例：この中で一緒に飲みに行くなら誰？" value="${escapeHtml(ui.customTopic)}" />
             <button class="btn" data-act="custom-topic">このお題で始める</button>
             ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}`
          : `<p class="wait">主催者がお題を選んでいます…</p>`
      }
    </div>`;
}

function renderChoosing() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  const canPick = s.you?.active && s.targets?.length;
  const selected = ui.pickId || s.myPick;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">${s.round}回戦</span><span>指名 ${s.pickedCount}/${s.expectedCount}</span></div>
    <div class="topic">${escapeHtml(s.topic?.text || "")}</div>
    ${
      canPick
        ? `<div class="panel">
            <div class="section-title">${s.hasPicked ? "指名を変えられるよ" : "1人をタップして指名"}</div>
            <div class="pick-grid">${(s.targets || [])
              .map(
                (p) =>
                  `<button type="button" class="pick-card ${selected === p.id ? "on" : ""}" data-act="target" data-id="${p.id}">
                    <span class="pick-av">${p.avatar}</span>
                    <span class="pick-name">${escapeHtml(p.name)}</span>
                  </button>`
              )
              .join("")}</div>
            <p class="host-tip" style="margin:8px 0 0">人をタップすると指名されます</p>
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
      ${
        isHost && s.canClosePicks
          ? `<button class="btn" data-act="close-picks">この人数で開票する（${s.pickedCount}人）</button>`
          : ""
      }
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
  return AVATAR_COLORS[p?.avatar] || "#ffe08a";
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function seatOf(id) {
  return (ui.state?.seats || []).find((s) => s.id === id);
}

function syncArenaBox() {
  const arena = document.getElementById("arena");
  const svg = document.getElementById("lines");
  if (!arena || !svg) return ui.arenaBox;
  const r = arena.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  ui.arenaBox = { w, h };
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  return ui.arenaBox;
}

function lineGeom(fromId, toId) {
  const a = seatOf(fromId);
  const b = seatOf(toId);
  const { w, h } = ui.arenaBox || { w: 100, h: 100 };
  let x1 = (a.portX / 100) * w;
  let y1 = (a.portY / 100) * h;
  let x2 = (b.portX / 100) * w;
  let y2 = (b.portY / 100) * h;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  x1 += ux * 18;
  y1 += uy * 18;
  x2 -= ux * 24;
  y2 -= uy * 24;
  const sign = fromId < toId ? 1 : -1;
  const ox = -uy * 12 * sign;
  const oy = ux * 12 * sign;
  return { x1: x1 + ox, y1: y1 + oy, x2: x2 + ox, y2: y2 + oy };
}

function animateDots(svg, x1, y1, x2, y2, color) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(12, Math.floor(dist / 14));
  const delay = Math.max(70, 2200 / n);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = svgEl("circle", {
      cx: x1 + (x2 - x1) * t,
      cy: y1 + (y2 - y1) * t,
      r: i === n ? 6.2 : 5.2,
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

function addArrow(svg, x1, y1, x2, y2, color) {
  const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const g = svgEl("g", {
    transform: `translate(${x2} ${y2}) rotate(${deg})`,
  });
  const path = svgEl("path", {
    d: "M 0 0 L -18 -10 L -12 0 L -18 10 Z",
    fill: color,
    stroke: "#140c22",
    "stroke-width": "1.4",
    "stroke-linejoin": "round",
  });
  g.appendChild(path);
  svg.appendChild(g);
}

function addMidChevrons(svg, x1, y1, x2, y2, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  for (const t of [0.36, 0.64]) {
    const g = svgEl("g", {
      transform: `translate(${x1 + dx * t} ${y1 + dy * t}) rotate(${deg})`,
    });
    const path = svgEl("path", {
      d: "M 7 0 L -6 -5 L -6 5 Z",
      fill: color,
    });
    g.appendChild(path);
    svg.appendChild(g);
  }
}

function addLineEnd(svg, x1, y1, x2, y2, color) {
  addArrow(svg, x1, y1, x2, y2, color);
  addMidChevrons(svg, x1, y1, x2, y2, color);
}

function pairKey(a, b) {
  return [a, b].sort().join(":");
}

function stampPos(fromId, toId) {
  let a = seatOf(fromId);
  let b = seatOf(toId);
  if (!a || !b) return { x: 50, y: 22 };
  const pa = playerById(fromId);
  if (ui.state?.mode === "love" && pa?.gender !== "female") {
    const tmp = a;
    a = b;
    b = tmp;
  }
  const lx = b.portX - a.portX;
  const ly = b.portY - a.portY;
  const len = Math.hypot(lx, ly) || 1;
  let px = -ly / len;
  let py = lx / len;
  const mx = (a.portX + b.portX) / 2;
  const my = (a.portY + b.portY) / 2;
  if (
    Math.hypot(mx - px * 14 - 50, my - py * 14 - 50) >
    Math.hypot(mx + px * 14 - 50, my + py * 14 - 50)
  ) {
    px = -px;
    py = -py;
  }
  const t = 0.22;
  let x = a.portX + lx * t + px * 16;
  let y = a.portY + ly * t + py * 16;
  if (x > 38 && x < 62 && y > 38 && y < 62) {
    x += px * 22;
    y += py * 22;
  }
  x = Math.min(86, Math.max(14, x));
  y = Math.min(84, Math.max(16, y));
  const used = ui.stampSpots || [];
  for (let n = 0; n < 12; n++) {
    const tooCenter = x > 38 && x < 62 && y > 38 && y < 62;
    const hit = used.some((u) => Math.hypot(u.x - x, u.y - y) < 16);
    if (!tooCenter && !hit) break;
    y = Math.min(82, Math.max(18, y + (n % 2 === 0 ? 12 : -12)));
    x = Math.min(84, Math.max(16, x + px * 8));
  }
  used.push({ x, y });
  ui.stampSpots = used;
  return { x, y };
}

function tryJudgeStamps() {
  const picks = ui.state?.revealedPicks || [];
  for (const pick of picks) {
    if (!pick.judged || !pick.toId || !ui.drawnFrom.has(pick.fromId)) continue;
    const otherHasLine = picks.some((p) => p.fromId === pick.toId);
    if (otherHasLine && !ui.drawnFrom.has(pick.toId)) continue;
    if (pick.mutual) {
      const key = pairKey(pick.fromId, pick.toId);
      if (ui.stampedPairs.has(key)) continue;
      ui.stampedPairs.add(key);
      const pos = stampPos(pick.fromId, pick.toId);
      stampAt(pos.x, pos.y, true);
    } else {
      if (ui.stampedFrom.has(pick.fromId)) continue;
      ui.stampedFrom.add(pick.fromId);
      const pos = stampPos(pick.fromId, pick.toId);
      stampAt(pos.x, pos.y, false);
    }
  }
}

function stampAt(midX, midY, ok) {
  const fx = document.getElementById("fx");
  if (!fx) return;
  const el = document.createElement("div");
  el.className = `stamp ${ok ? "ok" : "ng"}`;
  if (ok) {
    el.innerHTML = `<span class="heart-bg" aria-hidden="true">♥♥♥♥♥♥♥♥</span><span class="stamp-txt">成立</span>`;
  } else {
    el.innerHTML = `<span class="stamp-txt">不成立</span>`;
  }
  el.style.left = `${midX}%`;
  el.style.top = `${midY}%`;
  fx.appendChild(el);
}

function drawPickLineInstant(fromId, toId) {
  const svg = document.getElementById("lines");
  const a = seatOf(fromId);
  const b = seatOf(toId);
  if (!svg || !a || !b) return;
  const g = lineGeom(fromId, toId);
  const color = lineColor(fromId);
  const dist = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
  const n = Math.max(10, Math.floor(dist / 16));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    svg.appendChild(
      svgEl("circle", {
        cx: g.x1 + (g.x2 - g.x1) * t,
        cy: g.y1 + (g.y2 - g.y1) * t,
        r: i === n ? 6.2 : 5.2,
        fill: color,
      })
    );
  }
  addLineEnd(svg, g.x1, g.y1, g.x2, g.y2, color);
}

function drawPickLine(fromId, toId) {
  const svg = document.getElementById("lines");
  const a = seatOf(fromId);
  const b = seatOf(toId);
  if (!svg || !a || !b) return 0;
  const g = lineGeom(fromId, toId);
  const color = lineColor(fromId);
  const ms = animateDots(svg, g.x1, g.y1, g.x2, g.y2, color);
  setTimeout(() => {
    addLineEnd(svg, g.x1, g.y1, g.x2, g.y2, color);
    tryJudgeStamps();
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
  ui.stampedFrom = new Set();
  ui.stampedPairs = new Set();
  ui.stampSpots = [];
  syncArenaBox();

  for (const seat of s.seats || []) {
    const p = playerById(seat.id);
    if (!p) continue;
    const wrap = document.createElement("div");
    wrap.className = `seat ${genderClass(p)}`;
    wrap.style.left = `${seat.x}%`;
    wrap.style.top = `${seat.y}%`;
    wrap.dataset.id = seat.id;
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
    port.title = `${p.name}を開票`;
    port.setAttribute("aria-label", `${p.name}を開票`);
    port.innerHTML = `<span class="port-arrow">➤</span>`;
    seatsEl.appendChild(port);
  }
  updatePorts(s);
  if (s.phase === "result" || s.phase === "gameover") {
    for (const pick of s.revealedPicks || []) {
      ui.drawnFrom.add(pick.fromId);
      drawPickLineInstant(pick.fromId, pick.toId);
    }
    tryJudgeStamps();
  }
}

function updatePorts(s) {
  const isHost = s.you?.isHost;
  const oneByOne = s.revealStyle === "one" && s.phase === "reveal";
  const hidden = new Set(s.anonHiddenIds || []);
  document.querySelectorAll(".port").forEach((port) => {
    const id = port.dataset.id;
    const done = (s.revealedIds || []).includes(id) || hidden.has(id);
    const can = isHost && oneByOne && !done;
    port.classList.toggle("done", done);
    port.classList.toggle("off", !can);
    port.classList.toggle("pulse", can);
  });
  document.querySelectorAll(".seat").forEach((seat) => {
    const id = seat.dataset.id;
    if (!id) return;
    const done = (s.revealedIds || []).includes(id) || hidden.has(id);
    const can = isHost && oneByOne && !done;
    seat.classList.toggle("tap", can);
    seat.classList.toggle("done", done);
  });
}

function syncRevealLines(s) {
  const last = s.lastReveal;
  const animating = new Set();
  const batchStyle = last?.style === "all" || last?.style === "anon_female";
  if (batchStyle && last.batch && last.seq !== ui.drawnBatchSeq) {
    for (const ev of last.batch) {
      animating.add(ev.fromId);
      if (ev.toId) animating.add(ev.toId);
    }
  } else if (last && last.style !== "all" && last.style !== "anon_female" && last.fromId && !ui.drawnFrom.has(last.fromId)) {
    animating.add(last.fromId);
  }

  for (const pick of s.revealedPicks || []) {
    if (ui.drawnFrom.has(pick.fromId) || animating.has(pick.fromId)) continue;
    ui.drawnFrom.add(pick.fromId);
    drawPickLineInstant(pick.fromId, pick.toId);
  }

  if (batchStyle && last.batch && last.seq !== ui.drawnBatchSeq) {
    ui.drawnBatchSeq = last.seq;
    (last.batch || []).forEach((ev, i) => {
      if (!ui.drawnFrom.has(ev.fromId)) {
        ui.drawnFrom.add(ev.fromId);
        setTimeout(() => {
          drawPickLine(ev.fromId, ev.toId);
        }, i * 700);
      }
      if (ev.mutual && ev.toId && !ui.drawnFrom.has(ev.toId)) {
        ui.drawnFrom.add(ev.toId);
        setTimeout(() => {
          drawPickLine(ev.toId, ev.fromId);
        }, i * 700 + 320);
      }
    });
    tryJudgeStamps();
    return;
  }
  if (last && last.style !== "all" && last.style !== "anon_female" && last.fromId && !ui.drawnFrom.has(last.fromId)) {
    ui.drawnFrom.add(last.fromId);
    drawPickLine(last.fromId, last.toId);
  }
  tryJudgeStamps();
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

function hostActionsHtml(s) {
  const isHost = s.you?.isHost;
  const left = s.remainingReveal ?? Math.max(0, (s.expectedCount || 0) - (s.revealedIds || []).length);
  const allDone = left <= 0;
  if (!isHost) {
    return `<p class="wait">${allDone ? "結果待ち…" : s.revealStyle === "one" ? `残り ${left} 人` : ""}</p>`;
  }
  return `
    ${
      s.anonReport
        ? `<p class="host-tip">GMのみ: 成立 ${s.anonReport.matchCount}組を表示。非公開 ${s.anonReport.hiddenCount}人${
            s.anonReport.hiddenNames?.length ? `（${s.anonReport.hiddenNames.map(escapeHtml).join("、")}）` : ""
          }</p>`
        : ""
    }
    ${
      allDone
        ? `<button class="btn" data-act="finish">結果へ</button>`
        : `<p class="wait">${s.revealStyle === "one" ? `残り ${left} 人` : "線が伸びています…"}</p>
           ${
             s.canSkipReveal
               ? `<button class="btn" data-act="skip-result">${
                   (s.revealedIds || []).length || (s.anonHiddenIds || []).length
                     ? "残りをスキップして次へ"
                     : "開票せずに次の回戦へ"
                 }</button>`
               : ""
           }`
    }
    <button class="btn ghost" data-act="back-topic">お題選択に戻る</button>`;
}

function renderReveal() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar">
      <span class="pill">${s.round}回戦 開票</span>
      <span>${s.revealStyle === "all" ? "全員一気" : "1人ずつ"}</span>
    </div>
    <div class="topic">${escapeHtml(s.topic?.text || "")}</div>
    ${
      isHost && s.phase === "reveal" && !(s.revealedIds || []).length && !(s.anonHiddenIds || []).length
        ? `<div class="style-row" style="margin-bottom:10px">
            <button type="button" class="${s.revealStyle === "one" ? "on" : ""}" data-act="style" data-style="one">人を選んで開票</button>
            <button type="button" data-act="reveal-all">全員一気に開票</button>
            ${
              s.mode === "love" && s.canAnonFemale
                ? `<button type="button" class="on" data-act="anon-female">女性匿名開票（GMのみ）</button>`
                : ""
            }
          </div>`
        : s.canAnonFemale
          ? `<div class="style-row" style="margin-bottom:10px">
              <button type="button" class="on" data-act="anon-female">女性匿名開票（GMのみ）</button>
            </div>`
          : ""
    }
    <p class="host-tip">${
      isHost
        ? s.revealStyle === "all" || (s.revealedIds || []).length || (s.anonHiddenIds || []).length
          ? "線の矢印が、誰に向かっているかを表します。両方の線が出てから成立／不成立が出ます"
          : "黄色い矢印ボタンを押すと、その人の線が伸びます。ラブモードはGMだけ「女性匿名開票」が使えます"
        : "主催者が開票しています。矢印の向きを見てね"
    }</p>
    ${arenaHtml(s)}
    <div id="host-actions">
    ${hostActionsHtml(s)}
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
          ? `<button class="btn" data-act="next">同じお題でもう一回</button>
             <button class="btn ghost" data-act="back-topic">お題選択に戻る</button>`
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
          ? `<button class="btn" data-act="back-topic">お題選択に戻る</button>
             <button class="btn ghost" data-act="again">ロビーに戻る</button>`
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
    if (styleRow && ((s.revealedIds || []).length || (s.anonHiddenIds || []).length) && !s.canAnonFemale) {
      styleRow.remove();
    }
    const actions = document.getElementById("host-actions");
    if (actions) {
      actions.innerHTML = `${hostActionsHtml(s)}${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}`;
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
  if (!btn) return;
  if (btn.hasAttribute("disabled") || btn.classList.contains("off")) return;
  e.preventDefault();
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
    return emit("submit_pick", { targetId: ui.pickId });
  }
  if (act === "submit-pick") return emit("submit_pick", { targetId: ui.pickId });
  if (act === "close-picks") return emit("close_picks");
  if (act === "pick-for") return emit("host_pick_for", { playerId: btn.dataset.id });
  if (act === "reveal-one") return emit("reveal_one", { playerId: btn.dataset.id });
  if (act === "reveal-all") return emit("reveal_all");
  if (act === "anon-female") return emit("anon_female_reveal");
  if (act === "back-topic") return emit("back_to_topic");
  if (act === "finish") return emit("finish_reveal");
  if (act === "skip-result") return emit("finish_reveal", { skip: true });
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
