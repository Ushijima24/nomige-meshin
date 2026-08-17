const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰", "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖", "👻", "🎃", "👽", "🤖"];
const socket = io("/rank-bj", {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
});

const app = document.getElementById("app");

const ui = {
  view: "home",
  rulesBack: "home",
  name: localStorage.getItem("rankbj_name") || "",
  avatar: localStorage.getItem("rankbj_avatar") || AVATARS[0],
  joinCode: "",
  error: "",
  state: null,
  busy: false,
  answer: "",
  searchQ: "",
  gmFilter: "",
  showResultList: false,
};

const params = new URLSearchParams(location.search);
if (params.get("room")) ui.joinCode = params.get("room").toUpperCase();

const SESSION_KEY = "rankbj_session";
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
  return code ? `/?room=${encodeURIComponent(code)}` : "/";
}
function tryRejoin() {
  const sess = loadSession();
  if (!sess?.code || !sess?.playerId) return;
  socket.emit("rejoin", { code: sess.code, playerId: sess.playerId }, (res) => {
    if (res?.ok) {
      saveSession(res.code, res.playerId);
      history.replaceState({}, "", `?room=${res.code}`);
      return;
    }
    clearSession();
    if (hasPartySession()) {
      location.href = partyHomeUrl(loadPartySession()?.code);
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
  location.href = partyHomeUrl(code || loadPartySession()?.code || ui.state?.code);
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
    if (state.phase === "lobby") ui.view = "lobby";
    else ui.view = "game";
  }
  if (!state.canAnswer) ui.answer = "";
  if (state.phase !== "result") ui.showResultList = false;
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
  localStorage.setItem("rankbj_name", ui.name.trim());
  localStorage.setItem("rankbj_avatar", ui.avatar);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function me() {
  return ui.state?.players?.find((p) => p.id === ui.state.you);
}

function cardHtml(c) {
  if (c.hidden) {
    return `<div class="rank-card">
      <div class="num">？</div>
      <div class="iname">未公開</div>
    </div>`;
  }
  return `<div class="rank-card ${c.bust ? "bust" : ""}">
    <div class="num">${c.miss ? "圏外" : `${c.rank}位`}</div>
    <div class="iname">${escapeHtml(c.name)}</div>
  </div>`;
}

function playersHtml(players, { canRemove = false } = {}) {
  return `<div class="players">${players
    .map((p) => {
      const flags = [];
      if (p.isHost) flags.push('<span class="badge host">GM</span>');
      if (p.isBot) flags.push('<span class="badge">PC</span>');
      if (p.waiting) flags.push('<span class="badge">入力中</span>');
      else if (ui.state.phase === "playing" && p.actedThisDraw && !ui.state.dealRevealed)
        flags.push('<span class="badge host">済</span>');
      if (p.busted) flags.push('<span class="badge drink">バースト</span>');
      if (p.stood && !p.busted && ui.state.draw === 2)
        flags.push('<span class="badge">ステイ</span>');
      if (p.drinksThisRound)
        flags.push(`<span class="badge drink">今回${p.drinksThisRound}杯</span>`);
      if ((p.drinkTotal || 0) > 0)
        flags.push(`<span class="badge drink">累計${p.drinkTotal}杯</span>`);
      const cls = [
        p.waiting ? "turn" : "",
        p.busted ? "bust" : "",
        p.total === 21 ? "bj" : "",
        p.connected ? "" : "off",
      ].join(" ");
      return `<div class="player-chip ${cls}">
        <div class="av">${p.avatar}</div>
        <div class="nm">${escapeHtml(p.name)}</div>
        <div class="meta">${
          ui.state.phase === "lobby"
            ? `累計 ${p.drinkTotal || 0}杯`
            : `合計 ${p.total}　累計 ${p.drinkTotal || 0}杯`
        }<br/>${flags.join(" ")}</div>
        ${
          ui.state.phase !== "lobby" && (p.cards || []).length
            ? `<div class="mini-hand">${p.cards
                .map((c) =>
                  c.hidden
                    ? `<span class="mini-card">？</span>`
                    : `<span class="mini-card ${c.bust ? "bust" : ""}"><b>${
                        c.miss ? "圏外" : c.rank
                      }</b>${escapeHtml(c.name)}</span>`
                )
                .join("")}</div>`
            : ""
        }
        ${
          canRemove && p.id !== ui.state?.you
            ? `<button type="button" class="btn ghost" style="padding:4px 8px;font-size:0.7rem;margin-top:6px" data-kick="${p.id}">削除</button>`
            : ""
        }
      </div>`;
    })
    .join("")}</div>`;
}

function openRules(back = "home") {
  ui.rulesBack = back;
  ui.view = "rules";
  render();
}

function rulesBtnHtml() {
  return `<button type="button" class="btn ghost" id="open-rules" style="margin-bottom:14px">📖 遊び方</button>`;
}

function renderRules() {
  return `
    <button type="button" class="back linkish" id="rules-back">← 戻る</button>
    <h1>遊び方</h1>
    <p class="sub">ランキングBJ — はじめてでもわかる説明</p>
    <div class="panel">
      <div class="section-title">このゲームは何？</div>
      <p class="sub" style="margin:0;color:var(--text)">みんなのランキングの<strong>順位が点数</strong>になる知識ブラックジャックです。合計<strong>21</strong>を狙います。バーストや最下位になると飲みます。</p>
    </div>
    <div class="panel">
      <div class="section-title">始め方</div>
      <ol class="rules">
        <li>誰か1人がルーム作成（その人が<strong>GM</strong>）</li>
        <li>コードで参加。足りなければPC参加を追加</li>
        <li>2人以上でGMがゲーム開始</li>
      </ol>
    </div>
    <div class="panel">
      <div class="section-title">1ラウンドの流れ</div>
      <ol class="rules">
        <li>GMがお題（ランキング）を1つ選ぶ。そのラウンドは全員同じお題</li>
        <li><strong>1回目</strong>：全員が同時に項目名を入力。順位がカードになる（例: 3位 → 3点）</li>
        <li>GMが回答を確認（合っていれば順位、違えば圏外など）</li>
        <li><strong>2回目</strong>：同じお題でもう1枚引くか、ステイ。1回目に出た項目は使えない</li>
        <li>勝敗と飲酒を見て、次のラウンド or ロビーへ</li>
      </ol>
    </div>
    <div class="panel">
      <div class="section-title">勝ち負け・飲む人</div>
      <ul class="rules">
        <li>合計<strong>21ぴったり</strong>が理想</li>
        <li><strong>22位以上</strong>、または合計<strong>22以上</strong>はバースト（順位は見える）</li>
        <li>バーストした人が飲む。誰もバーストしていなければ<strong>合計が最小</strong>の人が飲む</li>
        <li>同点なら該当者みんな。誰かが21のとき、敗者は<strong>2杯</strong></li>
      </ul>
      <p class="credit">データ出典: <a href="https://ranking.net/" target="_blank" rel="noopener">みんなのランキング</a></p>
    </div>
    <div class="panel">
      <div class="section-title">覚えておくと便利</div>
      <ul class="rules">
        <li>試合中もいつでも「遊び方」からこの説明を開ける</li>
        <li>別アプリを開いても、同じブラウザなら戻ってこれる</li>
        <li>ロビーではGMがメンバー削除できる</li>
      </ul>
    </div>
    <button class="btn ghost" id="rules-back-bottom">戻る</button>
  `;
}

function renderHome() {
  return `
    <a class="back" href="${
      hasPartySession()
        ? partyHomeUrl(loadPartySession()?.code || ui.state?.code)
        : "/"
    }">← パーティー</a>
    <h1>ランキングBJ</h1>
    <p class="sub">みんランの順位がカード。21を狙う知識ブラックジャック。</p>
    ${rulesBtnHtml()}
    <div class="panel">
      <label>なまえ</label>
      <input type="text" id="name" maxlength="12" value="${escapeHtml(ui.name)}" placeholder="例: たろう" />
      <label>アバター</label>
      <div class="avatars">${AVATARS.map(
        (a) =>
          `<button type="button" data-av="${a}" class="${ui.avatar === a ? "on" : ""}">${a}</button>`
      ).join("")}</div>
      <div class="row">
        <button class="btn" id="create" ${ui.busy ? "disabled" : ""}>ルーム作成（GM）</button>
      </div>
      <label style="margin-top:14px">ルームコードで参加</label>
      <input type="text" id="code" maxlength="4" value="${escapeHtml(ui.joinCode)}" placeholder="ABCD" style="text-transform:uppercase" />
      <button class="btn join" id="join" ${ui.busy ? "disabled" : ""}>参加する</button>
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>
    <div class="panel">
      <div class="section-title">ざっくり</div>
      <ul class="rules">
        <li>順位が点数。21を目指す</li>
        <li>バーストや最下位が飲む</li>
        <li>くわしくは上の「遊び方」へ（試合中も見れる）</li>
      </ul>
    </div>`;
}

function renderLobby() {
  const s = ui.state;
  return `
    <h1>ランキングBJ</h1>
    ${rulesBtnHtml()}
    <div class="panel">
      <div class="section-title">参加者 ${s.players.length}/10</div>
      ${playersHtml(s.players, { canRemove: s.isHost })}
      ${
        s.isHost
          ? `<div class="row" style="margin-top:12px">
              <button class="btn ghost" id="add-bot" ${ui.busy || s.players.length >= 10 ? "disabled" : ""}>＋PC参加</button>
            </div>`
          : ""
      }
    </div>
    ${
      s.isHost
        ? `<button class="btn" id="start" ${ui.busy || s.players.length < 2 ? "disabled" : ""}>ゲーム開始</button>`
        : `<p class="sub">GMの開始待ち…</p>`
    }
    ${
      s.isHost
        ? `<button class="btn ghost" id="back-party" ${ui.busy ? "disabled" : ""} style="margin-top:12px">ゲーム選択に戻る</button>`
        : hasPartySession()
          ? `<p class="sub">主催者がゲーム選択に戻すまで待ってね</p>`
          : ""
    }
    ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
  `;
}

function renderPickTopic() {
  const s = ui.state;
  if (!s.isHost) {
    return `<div class="panel">
      <div class="section-title">お題選び中</div>
      <p class="sub">GMがランキングを選んでいます。決まったら全員で同時に答えます。</p>
    </div>`;
  }
  return `<div class="panel">
    <div class="section-title">お題を選ぶ（2回戦まで固定）</div>
    <p class="sub" style="margin-top:0">5件から選ぶか、検索・更新してね。</p>
    <input type="text" id="search-q" value="${escapeHtml(ui.searchQ)}" placeholder="例: ミスチル　動物園　卓球" />
    <div class="row" style="margin-bottom:10px">
      <button class="btn ghost" id="search-topics" ${ui.busy ? "disabled" : ""}>検索</button>
      <button class="btn ghost" id="refresh-topics" ${ui.busy ? "disabled" : ""}>お題更新</button>
    </div>
    ${(s.topicChoices || [])
      .map(
        (t) =>
          `<button class="topic" data-pick="${escapeHtml(t.slug)}" ${ui.busy ? "disabled" : ""}>
            <div class="ttl">${escapeHtml(t.title)}</div>
            <div class="cat">${escapeHtml(t.category || "")}</div>
          </button>`
      )
      .join("")}
  </div>`;
}

function topicPanel() {
  const topic = ui.state.currentTopic;
  if (!topic) return "";
  const banned = ui.state.bannedNames || [];
  return `<div class="panel">
    <div class="section-title">お題　${ui.state.draw}回目 / 2</div>
    <div class="ttl" style="font-weight:800;font-size:1.15rem">${escapeHtml(topic.title)}</div>
    <p class="cat" style="color:var(--muted);font-weight:700;margin:6px 0 0">${escapeHtml(topic.category || "")}　${topic.itemCount || "?"}件</p>
    ${
      banned.length
        ? `<p class="sub" style="margin:8px 0 0">2回目NG: ${banned
            .map((n) => escapeHtml(n))
            .join("、")}</p>`
        : ""
    }
    <p class="credit" style="margin-top:8px"><a href="${escapeHtml(topic.url || "https://ranking.net/")}" target="_blank" rel="noopener">出典: みんなのランキング</a></p>
  </div>`;
}

function renderAnswering() {
  const s = ui.state;
  let body = topicPanel();
  if (s.canAnswer) {
    body += `<div class="panel">
      <div class="section-title">${s.draw === 1 ? "1回目・名前を入力" : "2回目・もう一枚 or ステイ"}</div>
      <p class="sub" style="margin-top:0">${
        s.draw === 1
          ? "全員同時。このランキングに出てくる名前を書いてね"
          : "同じお題でもう一つ答えるか、今の合計でステイ"
      }</p>
      <input type="text" id="answer" value="${escapeHtml(ui.answer)}" placeholder="例: シカマル" maxlength="40" />
      <div class="row">
        <button class="btn" id="submit-answer" ${ui.busy || !ui.answer.trim() ? "disabled" : ""}>決定</button>
        ${
          s.canStay
            ? `<button class="btn ok" id="stand" ${ui.busy ? "disabled" : ""}>ステイ</button>`
            : ""
        }
      </div>
    </div>`;
  } else {
    body += `<div class="panel"><p class="sub" style="margin:0">他の人の入力・判定待ち…</p></div>`;
  }
  return body;
}

function renderJudge() {
  const s = ui.state;
  const waiting = renderAnswering();
  if (!s.isHost) return waiting;
  const cand = s.pending?.candidates || [];
  return `${topicPanel()}<div class="panel">
    <div class="section-title">候補（全順位から絞り込み・残り ${s.pending?.queueLen || 0}）</div>
    <p class="sub" style="margin-top:0">${escapeHtml(s.pending?.playerName || "")}：「${escapeHtml(s.pending?.text || "")}」</p>
    ${
      cand.length
        ? cand
            .map(
              (it) =>
                `<button class="item-row ${it.banned ? "used" : ""}" data-confirm="${escapeHtml(it.key)}" ${
                  it.banned ? "disabled" : ""
                }>
                  <div class="rk">${it.rank}位</div>
                  <div>${escapeHtml(it.name)}${it.banned ? "（1回目）" : ""}</div>
                </button>`
            )
            .join("")
        : `<p class="sub">自動では見つかりませんでした。下の一覧から選ぶか、圏外にしてね。</p>`
    }
    <button class="btn danger" id="miss" ${ui.busy ? "disabled" : ""}>該当なし（圏外=22）</button>
  </div>${gmListPickHtml()}${
    s.canAnswer
      ? `<div class="panel">
          <div class="section-title">自分もまだ回答できる</div>
          <input type="text" id="answer" value="${escapeHtml(ui.answer)}" placeholder="例: シカマル" maxlength="40" />
          <div class="row">
            <button class="btn" id="submit-answer" ${ui.busy || !ui.answer.trim() ? "disabled" : ""}>決定</button>
            ${s.canStay ? `<button class="btn ok" id="stand" ${ui.busy ? "disabled" : ""}>ステイ</button>` : ""}
          </div>
        </div>`
      : ""
  }`;
}

function gmListPickHtml() {
  const items = ui.state.gmItems || [];
  const q = ui.gmFilter.trim();
  const shown = items.filter((it) => !q || it.name.includes(q) || String(it.rank) === q);
  return `<div class="panel">
    <div class="section-title">一覧から選ぶ</div>
    <input type="text" id="gm-filter" value="${escapeHtml(ui.gmFilter)}" placeholder="絞り込み" />
    <div class="gm-list">${shown
      .map(
        (it) =>
          `<button class="item-row ${it.banned ? "used" : ""}" data-confirm="${escapeHtml(it.key)}" ${
            it.banned ? "disabled" : ""
          }>
            <div class="rk">${it.rank}位</div>
            <div>${escapeHtml(it.name)}${it.banned ? "（1回目）" : ""}</div>
          </button>`
      )
      .join("")}</div>
  </div>`;
}

function renderResult() {
  const s = ui.state;
  const r = s.result || {};
  const reason =
    r.reason === "burst"
      ? "バーストした人が飲み"
      : "誰もバーストしなかったので、合計が一番小さい人が飲み";
  const extra = r.has21 ? " ／ 21ぴったりがいるので敗者は2杯" : "";
  return `${topicPanel()}<div class="panel">
    <div class="section-title">結果</div>
    <p class="sub">${reason}${extra}</p>
    ${s.players
      .map((p) => {
        const lose = r.loserIds?.includes(p.id);
        return `<div style="margin:10px 0;padding:10px;border-radius:12px;background:rgba(0,0,0,0.25);border:1px solid ${
          lose ? "var(--danger)" : "var(--line)"
        }">
          <strong>${p.avatar} ${escapeHtml(p.name)}</strong>
          合計 ${p.total}${p.busted ? " バースト" : p.total === 21 ? " ぴったり！" : ""}
          ${lose ? ` → 今回${p.drinksThisRound}杯（累計${p.drinkTotal}杯）` : ` → セーフ（累計${p.drinkTotal}杯）`}
          <div class="hand" style="margin-top:8px">${p.cards.map(cardHtml).join("")}</div>
        </div>`;
      })
      .join("")}
    ${
      s.isHost
        ? `<div class="row">
            <button class="btn" id="next-round" ${ui.busy ? "disabled" : ""}>次のお題</button>
            <button class="btn ghost" id="to-lobby" ${ui.busy ? "disabled" : ""}>ロビーへ</button>
            <button class="btn ghost" id="toggle-result-list">${
              ui.showResultList ? "一覧を閉じる" : "1〜21位"
            }</button>
          </div>`
        : `<div class="row">
            <button class="btn ghost" id="toggle-result-list">${
              ui.showResultList ? "一覧を閉じる" : "1〜21位"
            }</button>
          </div>
          <p class="sub">GMの進行待ち</p>`
    }
    ${
      ui.showResultList
        ? `<div class="gm-list" style="margin-top:12px">${(s.resultItems || [])
            .map(
              (it) =>
                `<div class="item-row">
                  <div class="rk">${it.rank}位</div>
                  <div>${escapeHtml(it.name)}</div>
                </div>`
            )
            .join("")}</div>`
        : ""
    }
  </div>`;
}

function drinkBoardHtml() {
  const players = [...(ui.state?.players || [])].sort(
    (a, b) => (b.drinkTotal || 0) - (a.drinkTotal || 0)
  );
  return `<div class="panel">
    <div class="section-title">累計杯数</div>
    ${players
      .map(
        (p) =>
          `<div class="item-row">
            <div class="rk">${p.drinkTotal || 0}杯</div>
            <div>${p.avatar} ${escapeHtml(p.name)}${
              p.drinksThisRound ? `　(+${p.drinksThisRound})` : ""
            }</div>
          </div>`
      )
      .join("")}
  </div>`;
}

function renderGame() {
  const s = ui.state;
  const you = me();
  const totalCls = you?.busted ? "bust" : you?.total === 21 ? "bj" : "";
  let step = "";
  if (s.phase === "result") step = renderResult();
  else if (s.playStep === "pick_topic") step = renderPickTopic();
  else if (s.playStep === "gm_judge") step = renderJudge();
  else if (s.playStep === "answering") step = renderAnswering();

  return `
    <a class="back" href="${
      hasPartySession()
        ? partyHomeUrl(loadPartySession()?.code || ui.state?.code)
        : "/"
    }">← パーティー</a>
    <h1>ランキングBJ</h1>
    ${rulesBtnHtml()}
    <p class="sub">試合 ${s.match}　${s.draw ? `${s.draw}回目 / 2` : "お題選び"}　コード ${escapeHtml(s.code)}</p>
    <div class="panel">
      <div class="section-title">みんなの手札</div>
      ${playersHtml(s.players)}
    </div>
    <div class="panel">
      <div class="section-title">あなたの合計</div>
      <div class="total-big ${totalCls}">${you?.total ?? 0}</div>
    </div>
    ${step}
    ${drinkBoardHtml()}
    ${
      s.isHost
        ? `<button class="btn ghost" id="to-party" ${ui.busy ? "disabled" : ""}>パーティーに戻る</button>`
        : hasPartySession()
          ? `<p class="sub">主催者がパーティーに戻すまで待ってね</p>`
          : ""
    }
    ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
  `;
}

function render() {
  if (ui.view === "rules") app.innerHTML = renderRules();
  else if (ui.view === "home") app.innerHTML = renderHome();
  else if (ui.view === "lobby") app.innerHTML = renderLobby();
  else app.innerHTML = renderGame();
}

app.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "open-rules") {
    openRules(
      ui.view === "home" ? "home" : ui.view === "lobby" ? "lobby" : "game"
    );
    return;
  }
  if (t.id === "rules-back" || t.id === "rules-back-bottom") {
    if (ui.rulesBack === "lobby" && ui.state?.phase === "lobby") ui.view = "lobby";
    else if (ui.rulesBack === "game" && ui.state) ui.view = "game";
    else if (ui.state?.phase === "lobby") ui.view = "lobby";
    else if (ui.state) ui.view = "game";
    else ui.view = "home";
    render();
    return;
  }
  if (t.dataset.av) {
    ui.avatar = t.dataset.av;
    render();
    return;
  }
  if (t.id === "create") {
    ui.name = document.getElementById("name")?.value || ui.name;
    saveProfile();
    emit("create_room", { name: ui.name, avatar: ui.avatar }).then((res) => {
      if (res?.ok) {
        saveSession(res.code, res.playerId);
        history.replaceState({}, "", `?room=${res.code}`);
      }
    });
    return;
  }
  if (t.id === "join") {
    ui.name = document.getElementById("name")?.value || ui.name;
    ui.joinCode = (document.getElementById("code")?.value || "").toUpperCase();
    saveProfile();
    emit("join_room", { code: ui.joinCode, name: ui.name, avatar: ui.avatar }).then(
      (res) => {
        if (res?.ok) {
          saveSession(res.code, res.playerId);
          history.replaceState({}, "", `?room=${res.code}`);
        }
      }
    );
    return;
  }
  if (t.id === "add-bot") return emit("add_bot");
  if (t.dataset.kick) return emit("kick_player", { playerId: t.dataset.kick });
  if (t.id === "leave-room") {
    emit("leave_room").then(() => {
      clearSession();
      ui.state = null;
      ui.view = "home";
      ui.error = "";
      history.replaceState({}, "", location.pathname);
      render();
    });
    return;
  }
  if (t.id === "start") return emit("start_game");
  if (t.id === "refresh-topics") return emit("refresh_topics");
  if (t.id === "search-topics") {
    ui.searchQ = document.getElementById("search-q")?.value || "";
    return emit("search_topics", { q: ui.searchQ });
  }
  if (t.dataset.pick) return emit("pick_topic", { slug: t.dataset.pick });
  if (t.id === "submit-answer") {
    ui.answer = document.getElementById("answer")?.value || "";
    return emit("submit_answer", { text: ui.answer });
  }
  if (t.dataset.confirm) return emit("gm_confirm", { itemKey: t.dataset.confirm });
  if (t.id === "miss") return emit("gm_confirm", { miss: true });
  if (t.id === "stand") return emit("stand");
  if (t.id === "next-round") return emit("next_round");
  if (t.id === "toggle-result-list") {
    ui.showResultList = !ui.showResultList;
    render();
    return;
  }
  if (t.id === "to-lobby") return emit("back_to_lobby");
  if (t.id === "to-party" || t.id === "back-party") {
    if (confirm("ゲーム選択に戻りますか？累計杯数は持ち越されます。")) {
      emit("back_to_party");
    }
    return;
  }
});

app.addEventListener("input", (e) => {
  if (e.target.id === "name") ui.name = e.target.value;
  if (e.target.id === "code") ui.joinCode = e.target.value.toUpperCase();
  if (e.target.id === "answer") {
    ui.answer = e.target.value;
    const btn = document.getElementById("submit-answer");
    if (btn) btn.disabled = ui.busy || !ui.answer.trim();
  }
  if (e.target.id === "search-q") ui.searchQ = e.target.value;
  if (e.target.id === "gm-filter") {
    ui.gmFilter = e.target.value;
    const keep = e.target;
    const pos = keep.selectionStart;
    render();
    const el = document.getElementById("gm-filter");
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos);
    }
  }
});

app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "answer") {
    e.preventDefault();
    if (ui.answer.trim()) emit("submit_answer", { text: ui.answer });
  }
  if (e.target.id === "search-q") {
    e.preventDefault();
    emit("search_topics", { q: ui.searchQ });
  }
  if (e.target.id === "code") {
    e.preventDefault();
    document.getElementById("join")?.click();
  }
});

render();
