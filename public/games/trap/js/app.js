const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰", "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖", "👻", "🎃", "👽", "🤖"];
const socket = io("/trap", {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
});

const app = document.getElementById("app");

const ui = {
  view: "home",
  rulesBack: "home",
  rulesTab: "howto",
  name: localStorage.getItem("trap_name") || "",
  avatar: localStorage.getItem("trap_avatar") || AVATARS[0],
  joinCode: "",
  error: "",
  state: null,
  busy: false,
  selectedInstanceId: null,
  targetId: null,
  gravePicks: [],
  graveOptions: [],
  exchangeMyId: null,
  exchangeTheirIdx: null,
  exchangeTheirId: null,
  mode: null,
  catalog: null,
  announceId: null,
  announceVisible: false,
  carryPickId: null,
};

const params = new URLSearchParams(location.search);
if (params.get("room")) ui.joinCode = params.get("room").toUpperCase();

const SESSION_KEY = "trap_session";
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
    if (hasPartySession() || ui.joinCode) {
      localStorage.setItem(PARTY_KEY, JSON.stringify({ code, playerId }));
    }
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

fetch("/api/trap/cards")
  .then((r) => r.json())
  .then((d) => {
    ui.catalog = d;
    render();
  })
  .catch(() => {});

let announceHideTimer = null;

socket.on("state", (state) => {
  ui.state = state;
  ui.error = "";
  if (ui.view !== "rules") {
    if (state.phase === "lobby") ui.view = "lobby";
    else ui.view = "game";
  }
  if (!state.yourTurn && !state.pitouPicking && !state.discardPending) {
    ui.selectedInstanceId = null;
    ui.mode = null;
    ui.targetId = null;
    ui.gravePicks = [];
  }
  if (state.discardPending) {
    ui.mode = "discard";
    if (
      !state.discardHand?.some((c) => c.instanceId === ui.selectedInstanceId)
    ) {
      ui.selectedInstanceId = null;
    }
  } else if (ui.mode === "discard") {
    ui.mode = null;
  }
  if (state.phase !== "result") ui.carryPickId = null;
  if (state.announce?.id && state.announce.id !== ui.announceId) {
    ui.announceId = state.announce.id;
    ui.announceVisible = true;
    clearTimeout(announceHideTimer);
    const hold = state.announce.type === "thinking" ? 8000 : 5500;
    announceHideTimer = setTimeout(() => {
      ui.announceVisible = false;
      render();
    }, hold);
  }
  render();
});

function emit(event, data = {}) {
  return new Promise((resolve) => {
    ui.busy = true;
    render();
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
        if (res.needGravePick && res.graveOptions) {
          ui.mode = "grave";
          ui.graveOptions = res.graveOptions;
        }
      }
      render();
      resolve(res || { ok: false });
    });
  });
}

function saveProfile() {
  localStorage.setItem("trap_name", ui.name.trim());
  localStorage.setItem("trap_avatar", ui.avatar);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function selectedCard() {
  const id = ui.selectedInstanceId;
  if (!id) return null;
  return (
    ui.state?.myHand?.find((c) => c.instanceId === id) ||
    ui.state?.pitouHand?.find((c) => c.instanceId === id) ||
    null
  );
}

function otherPlayers() {
  const s = ui.state;
  const excludeId = s?.pitouPicking ? s.holderId : s?.you;
  return (s?.players || []).filter((p) => p.id !== excludeId);
}

/** カードの対象。タイマン中は選ばれた相手だけ */
function targetPlayers() {
  const s = ui.state;
  const others = otherPlayers();
  if (!s?.taimanPair) return others;
  const pair = new Set(s.taimanPair);
  return others.filter((p) => pair.has(p.id));
}

function playersHtml(players, { canRemove = false } = {}) {
  const ann = ui.state?.announce;
  return `<div class="players">${players
    .map((p) => {
      const flags = [];
      if (p.hasDrink) flags.push('<span class="badge drink">酒</span>');
      if (p.isHost) flags.push('<span class="badge">主催</span>');
      if (p.isBot) flags.push('<span class="badge">PC</span>');
      if (p.invincible) flags.push('<span class="badge status">無敵</span>');
      if (p.hasNagabuchi) flags.push('<span class="badge status">長渕</span>');
      if (p.bomberImmune) flags.push('<span class="badge immune">免除</span>');
      if (p.bondName)
        flags.push(
          `<span class="badge bond">運命⇔${escapeHtml(p.bondName)}</span>`
        );
      if (p.stealthTurns > 0)
        flags.push(`<span class="badge status">ステルス${p.stealthTurns}</span>`);
      if (p.clockTurns > 0)
        flags.push(`<span class="badge">止${p.clockTurns}</span>`);
      if (ui.state?.pitouControllerId && p.id === ui.state.pitouControllerId)
        flags.push('<span class="badge status">ピトー</span>');
      const think = ui.state?.botThinking;
      const isCardSpeaker =
        ui.announceVisible && ann && ann.playerId === p.id && ann.type === "card";
      const isLoseSpeaker =
        ui.announceVisible && ann && ann.playerId === p.id && ann.type === "lose";
      const isThinking = think?.playerId === p.id;
      const isSpeaker = isCardSpeaker || isLoseSpeaker || isThinking;
      const mini = isThinking
        ? `<div class="mini-bubble thinking">考え中…</div>`
        : isCardSpeaker && ann.result === "success"
          ? `<div class="mini-bubble success">成功！</div>`
          : isCardSpeaker && ann.result === "fail"
            ? `<div class="mini-bubble fail">失敗…</div>`
            : isCardSpeaker
              ? `<div class="mini-bubble"><strong>${escapeHtml(
                  ann.cardName || ""
                )}</strong>を使った</div>`
              : isLoseSpeaker
                ? `<div class="mini-bubble lose">負け！</div>`
                : "";
      return `<div class="player-chip ${p.hasDrink ? "has-drink" : ""} ${
        p.isBot ? "bot" : ""
      } ${isSpeaker ? "speaking" : ""} ${p.connected ? "" : "off"}">
        ${mini}
        <div class="av">${p.avatar}</div>
        <div class="nm">${escapeHtml(p.name)}</div>
        <div class="meta">手札 ${p.handCount ?? "—"}・累計 ${
          p.drinkTotal ?? 0
        }杯<br/>${flags.join(" ")}</div>
        ${
          canRemove && p.id !== ui.state?.you
            ? `<button type="button" class="btn ghost" style="padding:4px 8px;font-size:0.7rem;margin-top:6px" data-kick="${p.id}">削除</button>`
            : ""
        }
      </div>`;
    })
    .join("")}</div>`;
}

function announceHtml() {
  const a = ui.state?.announce;
  if (!a || !ui.announceVisible) return "";
  const rank = a.rank
    ? `<span class="rank ${escapeHtml(a.rank)}">${escapeHtml(a.rank)}</span>`
    : "";
  const resultMark =
    a.result === "success"
      ? `<div class="announce-result success">成功！</div>`
      : a.result === "fail"
        ? `<div class="announce-result fail">失敗…</div>`
        : "";
  const headline =
    a.type === "card" && a.result === "success"
      ? `${a.name || "?"} の一か八か 成功！`
      : a.type === "card" && a.result === "fail"
        ? `${a.name || "?"} の一か八か 失敗…`
        : a.type === "card"
          ? `${a.name || "?"} が「${a.cardName || "?"}」のカードを使った`
          : a.title || "";
  const cardLine =
    a.type === "card"
      ? `<div class="announce-card">${rank}<div class="announce-card-name">${escapeHtml(
          a.cardName || ""
        )}</div><div class="announce-card-body">${escapeHtml(
          a.body || ""
        )}</div>${resultMark}</div>`
      : `<div class="announce-body">${escapeHtml(a.body || "")}</div>`;
  return `<div class="announce-overlay announce-type-${escapeHtml(
    a.type || "info"
  )} ${a.result ? `announce-result-${escapeHtml(a.result)}` : ""}" aria-live="polite">
    <div class="announce-bubble">
      <div class="announce-who">
        <span class="announce-av">${a.avatar || "🃏"}</span>
        <span class="announce-title">${escapeHtml(headline)}</span>
      </div>
      ${cardLine}
    </div>
  </div>`;
}

function cardButton(
  c,
  { selected = false, disabled = false, dataAttr = "data-card", allowUnusable = false } = {}
) {
  const sparkle = c.sparkle ? "sparkle" : "";
  const uses =
    c.dualUse && c.usesLeft != null
      ? `<div class="uses">残り使用 ${c.usesLeft} 回</div>`
      : "";
  const hold = c.unusable
    ? `<div class="uses">持っているだけで発動（使えない）</div>`
    : "";
  const off = disabled || (c.unusable && !allowUnusable);
  return `<button type="button" class="card rank-${c.rank} ${sparkle} ${
    selected ? "selected" : ""
  } ${c.unusable ? "unusable" : ""}" ${dataAttr}="${c.instanceId}" ${
    off ? "disabled" : ""
  }>
    ${selected ? `<span class="pick-mark">選択中</span>` : ""}
    <span class="rank ${c.rank}">${c.rank}</span>
    <div class="name">${escapeHtml(c.name)}</div>
    <div class="effect">${escapeHtml(c.effect)}</div>
    ${uses}${hold}
  </button>`;
}

function backLinkHtml() {
  if (hasPartySession()) {
    return `<a class="back" href="${partyHomeUrl(
      loadPartySession()?.code || ui.state?.code
    )}">← ゲーム選択に戻る</a>`;
  }
  return `<a class="back" href="/">← ゲーム選択に戻る</a>`;
}

function partyReturnBtnHtml(id = "back-party") {
  if (!ui.state?.isHost) {
    return hasPartySession()
      ? `<p class="sub">主催者がゲーム選択に戻すまで待ってね</p>`
      : "";
  }
  return `<button class="btn ghost" id="${id}" ${
    ui.busy ? "disabled" : ""
  }>ゲーム選択に戻る</button>`;
}

function renderJoining() {
  return `
    <h1>トラップゲーム</h1>
    <p class="sub">ゲームに入っています…</p>
  `;
}

function renderLobby() {
  const s = ui.state;
  const tab = ui.rulesTab === "cards" ? "cards" : "howto";
  return `
    ${
      s.isHost
        ? `<button type="button" class="back linkish" id="back-party-lobby" ${ui.busy ? "disabled" : ""}>← ゲーム選択に戻る</button>`
        : backLinkHtml()
    }
    <h1>トラップゲーム</h1>
    <div class="panel">
      <div class="section-title">参加者 ${s.players.length}/10</div>
      <div class="players">${(s.players || [])
        .map(
          (p) =>
            `<div class="player-chip ${p.connected === false ? "off" : ""}" style="display:flex;align-items:center;gap:8px;width:100%">
              <span class="av">${p.avatar || "🦊"}</span>
              <span class="nm">${escapeHtml(p.name)}${p.isHost ? " · 主催" : ""}${p.isBot ? " · PC" : ""}</span>
              ${
                s.isHost && p.id !== s.you?.id
                  ? `<button type="button" class="btn ghost" style="padding:4px 8px;font-size:0.7rem;margin-left:auto" data-kick="${p.id}">削除</button>`
                  : ""
              }
            </div>`
        )
        .join("")}</div>
      ${
        s.isHost
          ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
              <button class="btn ghost" id="add-bot" ${ui.busy ? "disabled" : ""}>＋PC参加</button>
              <button class="btn ghost" id="add-bots4" ${ui.busy ? "disabled" : ""}>＋PC×4</button>
            </div>`
          : ""
      }
    </div>
    <div class="lobby-actions">
      ${
        s.isHost
          ? `<button class="btn" id="start" ${
              ui.busy || s.players.length < 2 ? "disabled" : ""
            }>ゲーム開始</button>
             ${
               s.players.length < 2
                 ? `<p class="sub">2人以上必要です（PC参加でもOK）</p>`
                 : ""
             }`
          : `<p class="sub">主催者の開始待ち…</p>
             ${
               hasPartySession()
                 ? `<p class="sub">主催者がゲーム選択に戻すまで待ってね</p>`
                 : ""
             }`
      }
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>
    ${renderRulesTabs()}
    ${tab === "cards" ? renderCardsTab() : renderHowtoTab()}
  `;
}

function openRules(back = "home", tab = "howto") {
  ui.rulesBack = back;
  ui.rulesTab = tab === "cards" ? "cards" : "howto";
  ui.view = "rules";
  render();
}

function catalogByRank() {
  const order = ["SSS", "S", "A", "B", "C"];
  const cards = ui.catalog?.cards || [];
  return order
    .map((rank) => ({
      rank,
      cards: cards.filter((c) => c.rank === rank),
    }))
    .filter((g) => g.cards.length);
}

function renderRulesTabs() {
  const tab = ui.rulesTab === "cards" ? "cards" : "howto";
  return `<div class="rules-tabs" role="tablist">
    <button type="button" class="rules-tab ${
      tab === "howto" ? "on" : ""
    }" data-rules-tab="howto" role="tab" aria-selected="${
      tab === "howto"
    }">遊び方</button>
    <button type="button" class="rules-tab ${
      tab === "cards" ? "on" : ""
    }" data-rules-tab="cards" role="tab" aria-selected="${
      tab === "cards"
    }">カード一覧</button>
  </div>`;
}

/** 試合中など：押すと説明画面の該当タブを開く */
function renderRulesOpenTabs() {
  return `<div class="rules-tabs" style="margin-bottom:12px">
    <button type="button" class="rules-tab" data-open-rules="howto">遊び方</button>
    <button type="button" class="rules-tab" data-open-rules="cards">カード一覧</button>
  </div>`;
}

function renderHowtoTab() {
  return `
    <p class="sub">はじめてでもわかるトラップゲームの説明です。</p>

    <div class="panel howto">
      <div class="section-title">このゲームは何？</div>
      <p>飲み会で遊ぶ<strong>お酒のたらい回し</strong>ゲームです。誰か1人に「酒」が回ってきます。カードでかわしたり増やしたりして、最後に負けた人が飲みます。</p>
    </div>

    <div class="panel howto">
      <div class="section-title">試合の流れ</div>
      <ol class="howto-list">
        <li>全員に手札が<strong>3枚</strong>配られる（必ず「渡せるカード」が1枚以上入る。半沢直樹・倍倍Fightは含めない）</li>
        <li>最初に酒を持つ人は、これまでの<strong>累計杯数が少ない人ほど出やすい</strong></li>
        <li>酒を持っている人の番。カードを1枚使うか、「負けを認める」</li>
        <li>酒を渡せたら次の人へ。渡せない／負けたらその人が飲む</li>
        <li>飲む量は画面の「×杯」。倍化カードなどで増える</li>
        <li>試合が終わったら、主催者が「次の試合」か「ロビーへ」</li>
      </ol>
    </div>

    <div class="panel howto">
      <div class="section-title">カードの種類</div>
      <ul class="howto-list">
        <li><strong>渡す系</strong> … 酒を誰かに渡す（指定／ランダム／確率など）</li>
        <li><strong>自分の番が続く系</strong> … 効果だけ発動して、酒は手元に残る</li>
        <li><strong>持ってるだけ系</strong> … 押せない。試合終了時などに発動（犯罪者・効果なし・自宅警備員）</li>
      </ul>
      <p class="hint">個別の効果は「カード一覧」タブで見られます。ランクが高いほどレアで強い傾向です。</p>
    </div>

    <div class="panel howto">
      <div class="section-title">覚えておくと得なこと</div>
      <ul class="howto-list">
        <li><strong>ステルス・クロック・時限爆弾</strong>は、使ったその瞬間は残り回数を減らさない</li>
        <li><strong>エスコン</strong>は使った人にだけ効く（他の人の「自分の番継続」はそのまま）</li>
        <li><strong>無敵</strong>の人が負けても、本人は飲まず両隣が飲む</li>
        <li><strong>効果なし×2</strong>は無敵・免除を貫通して他全員に飲ませ、運命共同体にも波及する</li>
        <li><strong>犯罪者</strong>はその試合の飲酒を全員分まとめて請け負う（自分負けなら2倍）</li>
      </ul>
    </div>
  `;
}

function renderCardsTab() {
  const rates = ui.catalog?.rates || { SSS: 1, S: 9, A: 20, B: 30, C: 40 };
  const groups = catalogByRank();
  return `
    <p class="sub">手札に出るカードと効果です。</p>
    <div class="panel">
      <div class="section-title">出現率</div>
      <div class="rates">
        <span class="rank SSS">SSS ${rates.SSS}%</span>
        <span class="rank S">S ${rates.S}%</span>
        <span class="rank A">A ${rates.A}%</span>
        <span class="rank B">B ${rates.B}%</span>
        <span class="rank C">C ${rates.C}%</span>
      </div>
    </div>
    <div class="panel">
      <div class="section-title">全カード</div>
      ${
        groups.length
          ? groups
              .map(
                (g) => `
        <div class="card-rank-block">
          <div class="card-rank-head"><span class="rank ${g.rank}">${g.rank}</span></div>
          <div class="card-ref-list">
            ${g.cards
              .map(
                (c) => `
              <div class="card-ref rank-${c.rank}">
                <div class="card-ref-name">${escapeHtml(c.name)}</div>
                <div class="card-ref-effect">${escapeHtml(c.effect)}</div>
              </div>`
              )
              .join("")}
          </div>
        </div>`
              )
              .join("")
          : `<p class="sub">カード情報を読み込み中…</p>`
      }
    </div>
  `;
}

function renderRules() {
  const tab = ui.rulesTab === "cards" ? "cards" : "howto";
  return `
    <button type="button" class="back linkish" id="rules-back">← 戻る</button>
    <h1>${tab === "cards" ? "カード一覧" : "遊び方"}</h1>
    ${renderRulesTabs()}
    ${tab === "cards" ? renderCardsTab() : renderHowtoTab()}
    <button class="btn ghost" id="rules-back-bottom" style="margin-top:8px">戻る</button>
  `;
}

function renderHome() {
  const tab = ui.rulesTab === "cards" ? "cards" : "howto";
  return `
    ${backLinkHtml()}
    <h1>トラップゲーム</h1>
    <p class="sub">お酒をたらい回し。カードでかわして、なすりつけろ。</p>
    <div class="panel">
      <label>なまえ</label>
      <input type="text" id="name" maxlength="12" value="${escapeHtml(
        ui.name
      )}" placeholder="例: たろう" />
      <label>アバター</label>
      <div class="avatars">${AVATARS.map(
        (a) =>
          `<button type="button" data-av="${a}" class="${
            ui.avatar === a ? "on" : ""
          }">${a}</button>`
      ).join("")}</div>
      <div class="row">
        <button class="btn" id="create" ${ui.busy ? "disabled" : ""}>ルーム作成</button>
      </div>
      <label style="margin-top:14px">ルームコードで参加</label>
      <input type="text" id="code" maxlength="4" value="${escapeHtml(
        ui.joinCode
      )}" placeholder="ABCD" style="text-transform:uppercase" />
      <button class="btn join" id="join" ${ui.busy ? "disabled" : ""}>参加する</button>
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>
    <h2 class="rules-inline-title">${tab === "cards" ? "カード一覧" : "遊び方"}</h2>
    ${renderRulesTabs()}
    ${tab === "cards" ? renderCardsTab() : renderHowtoTab()}
  `;
}


function renderModals() {
  const s = ui.state;
  let html = "";

  if (s.peekView) {
    html += `<div class="modal" id="peek-modal"><div class="sheet">
      <div class="section-title">覗き見</div>
      <div class="hand">${s.peekView.hand
        .map((c) => cardButton(c, { disabled: true }))
        .join("")}</div>
      <button class="btn" id="close-peek" style="margin-top:12px">閉じる</button>
    </div></div>`;
  }

  if (ui.mode === "target") {
    const targets = targetPlayers();
    if (targets.length === 1 && !ui.targetId) ui.targetId = targets[0].id;
    html += `<div class="modal"><div class="sheet">
      <div class="section-title">${
        s.taimanPair ? "相手を選ぶ（タイマン中はこの相手のみ）" : "相手を選ぶ"
      }</div>
      <div class="picker">${
        targets.length
          ? targets
              .map(
                (p) =>
                  `<button type="button" data-target="${p.id}" class="${
                    ui.targetId === p.id ? "on" : ""
                  }">${p.avatar} ${escapeHtml(p.name)}</button>`
              )
              .join("")
          : "<p class='sub'>選べる相手がいません</p>"
      }</div>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="confirm-target" ${
          ui.targetId ? "" : "disabled"
        }>決定</button>
        <button class="btn ghost" id="cancel-mode">キャンセル</button>
      </div>
    </div></div>`;
  }

  if (ui.mode === "grave") {
    const opts = ui.graveOptions?.length ? ui.graveOptions : s.graveTop || [];
    html += `<div class="modal"><div class="sheet">
      <div class="section-title">墓地から最大2枚（A以下）</div>
      <div class="hand">${
        opts
          .map((c) =>
            cardButton(c, {
              selected: ui.gravePicks.includes(c.instanceId),
              dataAttr: "data-grave",
            })
          )
          .join("") || "<p class='sub'>なし</p>"
      }</div>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="confirm-grave" ${
          ui.gravePicks.length ? "" : "disabled"
        }>拾う</button>
        <button class="btn ghost" id="cancel-mode">キャンセル</button>
      </div>
    </div></div>`;
  }

  if (ui.mode === "exchange") {
    const myOthers = (
      s.pitouPicking ? s.pitouHand || [] : s.myHand || []
    ).filter((c) => c.instanceId !== ui.selectedInstanceId);
    html += `<div class="modal"><div class="sheet">
      <div class="section-title">1. 相手を選ぶ${
        s.taimanPair ? "（タイマン中はこの相手のみ）" : ""
      }</div>
      <div class="picker">${
        targetPlayers().length
          ? targetPlayers()
              .map(
                (p) =>
                  `<button type="button" data-target="${p.id}" class="${
                    ui.targetId === p.id ? "on" : ""
                  }">${p.avatar} ${escapeHtml(p.name)}（${p.handCount}枚）</button>`
              )
              .join("")
          : "<p class='sub'>選べる相手がいません</p>"
      }</div>
      <div class="section-title" style="margin-top:12px">2. 渡す自分のカード</div>
      <div class="hand">${
        myOthers.length
          ? myOthers
              .map((c) =>
                cardButton(c, {
                  selected: ui.exchangeMyId === c.instanceId,
                  dataAttr: "data-ex-my",
                  allowUnusable: true,
                })
              )
              .join("")
          : "<p class='sub'>交換できる自分のカードが他にありません</p>"
      }</div>
      <p class="sub" style="margin:10px 0 0">相手のカードはランダムで決まります。</p>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="confirm-exchange" ${
          ui.targetId && ui.exchangeMyId ? "" : "disabled"
        }>交換する</button>
        <button class="btn ghost" id="cancel-mode">キャンセル</button>
      </div>
    </div></div>`;
  }

  if (ui.mode === "discard" && s.discardPending) {
    const opts = s.discardHand || [];
    html += `<div class="modal"><div class="sheet">
      <div class="section-title">乗り換え：1枚捨てる</div>
      <p class="sub" style="margin-top:0">引いたカードも含めて、捨てる1枚を選んでください。</p>
      <div class="hand">${
        opts
          .map((c) =>
            cardButton(c, {
              selected: ui.selectedInstanceId === c.instanceId,
              dataAttr: "data-discard",
              allowUnusable: true,
            })
          )
          .join("") || "<p class='sub'>なし</p>"
      }</div>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="confirm-discard" ${
          ui.busy || !ui.selectedInstanceId ? "disabled" : ""
        }>捨てる</button>
      </div>
    </div></div>`;
  }

  return html;
}

function historyPrevHtml(s) {
  // 試合中・結果とも「前の試合」の飲酒を表示（結果画面では最新=今回を除く）
  const list =
    s.phase === "result"
      ? (s.matchHistory || []).slice(1)
      : s.matchHistory || [];
  if (!list.length) return "";
  return `<div class="history-prev">
    <div class="section-title">前の試合の飲酒</div>
    ${list
      .map(
        (m) => `<div class="match">試合${m.matchNumber}
        ${(m.drinks || [])
          .map(
            (d) =>
              `<div class="drink-line">${escapeHtml(d.avatar || "")} ${escapeHtml(
                d.name
              )} … ${d.cups}杯</div>`
          )
          .join("") || '<div class="drink-line">なし</div>'}
      </div>`
      )
      .join("")}
  </div>`;
}

function renderPlaying() {
  const s = ui.state;
  const holder = s.players.find((p) => p.id === s.holderId);
  const me = s.players.find((p) => p.id === s.you);
  const clocked = (me?.clockTurns || 0) > 0;

  let actionPanel = "";
  const pitouLocked =
    s.yourTurn && s.pitouControllerId && s.pitouControllerId !== s.you;
  const holderClocked = (holder?.clockTurns || 0) > 0;
  if (s.pitouPicking) {
    const loseBtn = `<button class="btn danger" id="lose" style="margin-top:10px" ${
      ui.busy ? "disabled" : ""
    }>負けを認める</button>`;
    if (holderClocked) {
      actionPanel = `<div class="panel"><p class="sub" style="margin:0">${escapeHtml(
        holder?.name || "相手"
      )} はクロック中のためカードを選べません。</p>
        ${loseBtn}</div>`;
    } else {
    const hname = holder?.name || "相手";
    actionPanel = `
        <div class="panel">
          <div class="section-title">ネフェルピトー：${escapeHtml(
            hname
          )} の手札から選ぶ</div>
          <p class="sub" style="margin:0 0 10px">この人の番のカードはあなたが選びます。負けを認めることもできます。</p>
          <div class="hand">
            ${(s.pitouHand || [])
              .map((c) =>
                cardButton(c, {
                  selected: ui.selectedInstanceId === c.instanceId,
                  disabled: ui.busy,
                })
              )
              .join("") || "<p class='sub'>手札なし</p>"}
          </div>
          <div class="row" style="margin-top:12px">
            <button class="btn" id="use" ${
              ui.busy ||
              !ui.selectedInstanceId ||
              selectedCard()?.unusable
                ? "disabled"
                : ""
            }>カードを使う</button>
            ${loseBtn}
          </div>
        </div>`;
    }
  } else if (pitouLocked) {
    actionPanel = `<div class="panel"><p class="sub" style="margin:0">ネフェルピトー（${escapeHtml(
      s.players.find((p) => p.id === s.pitouControllerId)?.name || "?"
    )}）がカードを選んでいます。この間は負けを認められません。</p>
        <div class="section-title" style="margin-top:12px">あなたの手札</div>
        <div class="hand">${(s.myHand || [])
          .map((c) => cardButton(c, { disabled: true }))
          .join("")}</div>
      </div>`;
  } else if (s.yourTurn) {
    if (clocked) {
      actionPanel = `<div class="panel"><p class="sub" style="margin:0">クロック中はカード不可。負けを認めるか待機。</p>
        <button class="btn danger" id="lose" style="margin-top:10px" ${
          ui.busy ? "disabled" : ""
        }>負けを認める</button></div>`;
    } else {
      actionPanel = `
        <div class="panel">
          <div class="section-title">あなたの手札</div>
          <div class="hand">
            ${(s.myHand || [])
              .map((c) =>
                cardButton(c, {
                  selected: ui.selectedInstanceId === c.instanceId,
                  disabled: ui.busy,
                })
              )
              .join("") || "<p class='sub'>手札なし → 負けボタン</p>"}
          </div>
          <div class="row" style="margin-top:12px">
            <button class="btn" id="use" ${
              ui.busy ||
              !ui.selectedInstanceId ||
              selectedCard()?.unusable
                ? "disabled"
                : ""
            }>カードを使う</button>
            <button class="btn danger" id="lose" ${
              ui.busy ? "disabled" : ""
            }>負けを認める</button>
          </div>
        </div>`;
    }
  } else {
    actionPanel = `<div class="panel"><p class="sub" style="margin:0">${escapeHtml(
      holder?.name || "?"
    )} の番…</p>
      <div class="section-title" style="margin-top:12px">あなたの手札</div>
      <div class="hand">${(s.myHand || [])
        .map((c) => cardButton(c, { disabled: true }))
        .join("")}</div>
    </div>`;
  }

  const field =
    (s.fieldStatuses || []).length > 0
      ? `<div class="field-status">${s.fieldStatuses
          .map((t) => `<span>${escapeHtml(t)}</span>`)
          .join("")}</div>`
      : "";

  return `
    ${announceHtml()}
    <h1>試合 ${s.matchNumber}</h1>
    ${renderRulesOpenTabs()}
    <div class="hud">
      <div class="stat"><div class="k">飲む量</div><div class="v">×${s.amount}</div></div>
      <div class="stat"><div class="k">酒の場所</div><div class="v" style="font-size:1rem">${escapeHtml(
        holder?.name || "-"
      )}</div></div>
      <div class="stat"><div class="k">時限爆弾</div><div class="v">${
        s.bombCountdown == null ? "-" : `残${s.bombCountdown}`
      }</div></div>
      <div class="stat"><div class="k">直前カード</div><div class="v" style="font-size:0.85rem">${
        s.lastPlayed?.card ? escapeHtml(s.lastPlayed.card.name) : "-"
      }</div></div>
    </div>
    ${field}
    <div class="panel">
      <div class="section-title">場（手札枚数・状態・累計）</div>
      ${playersHtml(s.players)}
    </div>
    ${actionPanel}
    <div class="panel">
      <div class="section-title">この試合の履歴</div>
      <div class="log">${(s.log || [])
        .map((l) => `<div>${escapeHtml(l.text)}</div>`)
        .join("")}</div>
      ${historyPrevHtml(s)}
    </div>
    ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    ${
      s.isHost
        ? `<div class="panel" style="margin-top:28px">
            <button type="button" class="btn ghost" id="abort-match" ${
              ui.busy ? "disabled" : ""
            }>${
              hasPartySession()
                ? "試合を中止してゲーム選択に戻る"
                : "試合を中止してロビーへ"
            }</button>
            ${partyReturnBtnHtml("back-party-play")}
            <p class="sub" style="margin:8px 0 0">ゲーム選択に戻ると累計は持ち越し。主催者のみ。</p>
          </div>`
        : `<div class="panel" style="margin-top:28px">${partyReturnBtnHtml(
            "back-party-play"
          )}</div>`
    }
    ${renderModals()}
  `;
}

function renderResult() {
  const s = ui.state;
  const drinks = s.lastResult?.drinks || [];
  return `
    ${announceHtml()}
    <h1>試合終了</h1>
    ${renderRulesOpenTabs()}
    <div class="panel">
      <div class="section-title">今回の飲酒</div>
      ${
        drinks
          .map((d) => {
            const p = s.players.find((x) => x.id === d.playerId);
            return `<div style="margin:8px 0;font-weight:700">
            ${p?.avatar || ""} ${escapeHtml(p?.name || "?")} …
            <span style="color:var(--accent)">${d.cups}杯</span>
            <div style="font-size:0.75rem;color:var(--muted)">${escapeHtml(
              (d.reasons || []).join(" / ")
            )}</div>
          </div>`;
          })
          .join("") || "<p class='sub'>なし</p>"
      }
    </div>
    <div class="panel">
      <div class="section-title">累計</div>
      ${playersHtml(s.players)}
    </div>
    ${
      s.carryPending
        ? `<div class="panel">
      <div class="section-title">帆龍：次の試合に持ち越すカード</div>
      <p class="sub" style="margin:0 0 10px">手札から1枚選んでください。</p>
      <div class="hand">${(s.carryHand || [])
        .map((c) =>
          cardButton(c, {
            selected: ui.carryPickId === c.instanceId,
            dataAttr: "data-carry",
            allowUnusable: true,
          })
        )
        .join("")}</div>
      <button class="btn" style="margin-top:12px" id="confirm-carry" ${
        ui.busy || !ui.carryPickId ? "disabled" : ""
      }>持ち越す</button>
    </div>`
        : s.carryPickedName
          ? `<div class="panel"><p class="sub" style="margin:0">次の試合に「${escapeHtml(
              s.carryPickedName
            )}」を持ち越します。</p></div>`
          : ""
    }
    ${
      s.carryWaiting?.length && s.isHost
        ? `<p class="sub">持ち越し選択待ち: ${escapeHtml(
            s.carryWaiting.join("・")
          )}（次の試合で未選択は自動）</p>`
        : ""
    }
    <div class="panel">
      <div class="section-title">この試合の履歴</div>
      <div class="log">${(s.log || [])
        .map((l) => `<div>${escapeHtml(l.text)}</div>`)
        .join("")}</div>
      ${historyPrevHtml(s)}
    </div>
    ${
      s.isHost
        ? `<div class="row">
            <button class="btn ok" id="next" ${ui.busy ? "disabled" : ""}>次の試合</button>
            ${
              hasPartySession()
                ? ""
                : `<button class="btn ghost" id="lobby" ${ui.busy ? "disabled" : ""}>ゲームロビーへ</button>`
            }
          </div>
          ${partyReturnBtnHtml("back-party-result")}`
        : `<p class="sub">主催者の操作待ち…</p>${partyReturnBtnHtml(
            "back-party-result"
          )}`
    }
    ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
  `;
}

function render() {
  if (ui.view === "rules") app.innerHTML = renderRules();
  else if (ui.view === "joining") app.innerHTML = renderJoining();
  else if (ui.view === "home") app.innerHTML = renderHome();
  else if (ui.view === "lobby") app.innerHTML = renderLobby();
  else if (ui.state?.phase === "result") app.innerHTML = renderResult();
  else app.innerHTML = renderPlaying();
  bind();
}

async function tryPlay(extra = {}) {
  const card = selectedCard();
  if (!card) return;
  const res = await emit("play_card", {
    instanceId: card.instanceId,
    ...extra,
  });
  if (res.needTarget) {
    ui.mode = "target";
    ui.targetId = null;
    render();
    return;
  }
  if (res.needGravePick) {
    ui.mode = "grave";
    ui.graveOptions = res.graveOptions || [];
    ui.gravePicks = [];
    render();
    return;
  }
  if (res.needExchange) {
    ui.mode = "exchange";
    if (extra.targetId) ui.targetId = extra.targetId;
    if (extra.myCardId) ui.exchangeMyId = extra.myCardId;
    render();
    return;
  }
  if (res.ok) {
    ui.mode = null;
    ui.selectedInstanceId = null;
  }
}

function bind() {
  const goRules = () => {
    openRules(
      ui.view === "home" ? "home" : ui.view === "lobby" ? "lobby" : "game",
      "howto"
    );
  };
  app.querySelector("#open-rules")?.addEventListener("click", goRules);
  app.querySelectorAll("[data-open-rules]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openRules(
        ui.view === "home" ? "home" : ui.view === "lobby" ? "lobby" : "game",
        btn.getAttribute("data-open-rules") === "cards" ? "cards" : "howto"
      );
    });
  });
  app.querySelectorAll("[data-rules-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.rulesTab = btn.getAttribute("data-rules-tab") === "cards" ? "cards" : "howto";
      render();
    });
  });
  const backRules = () => {
    if (ui.rulesBack === "lobby" && ui.state?.phase === "lobby") ui.view = "lobby";
    else if (ui.rulesBack === "game" && ui.state) ui.view = "game";
    else if (ui.state?.phase === "lobby") ui.view = "lobby";
    else if (ui.state) ui.view = "game";
    else ui.view = "home";
    render();
  };
  app.querySelector("#rules-back")?.addEventListener("click", backRules);
  app.querySelector("#rules-back-bottom")?.addEventListener("click", backRules);

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
  app.querySelector("#start")?.addEventListener("click", () => emit("start_game"));
  app.querySelector("#add-bot")?.addEventListener("click", () => emit("add_bot"));
  app.querySelector("#add-bots4")?.addEventListener("click", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await emit("add_bot");
      if (!res.ok) break;
    }
  });
  app.querySelectorAll("[data-kick]").forEach((btn) => {
    btn.addEventListener("click", () =>
      emit("kick_player", { playerId: btn.getAttribute("data-kick") })
    );
  });
  app.querySelector("#leave-room")?.addEventListener("click", async () => {
    await emit("leave_room");
    clearSession();
    ui.state = null;
    ui.view = "home";
    ui.error = "";
    history.replaceState({}, "", location.pathname);
    render();
  });
  app.querySelector("#next")?.addEventListener("click", () => emit("next_match"));
  app.querySelectorAll("[data-carry]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.carryPickId = b.getAttribute("data-carry");
      render();
    })
  );
  app.querySelector("#confirm-carry")?.addEventListener("click", () => {
    if (!ui.carryPickId) return;
    emit("pick_carry", { instanceId: ui.carryPickId });
  });
  app.querySelector("#lobby")?.addEventListener("click", () => emit("back_to_lobby"));
  app.querySelector("#abort-match")?.addEventListener("click", () => {
    const msg = hasPartySession()
      ? "試合を中止してゲーム選択に戻しますか？（進行中の試合は破棄されます）"
      : "試合を中止してロビーに戻しますか？（進行中の試合は破棄されます）";
    if (confirm(msg)) {
      emit("back_to_lobby");
    }
  });
  ["back-party", "back-party-lobby", "back-party-play", "back-party-result"].forEach(
    (id) => {
      app.querySelector(`#${id}`)?.addEventListener("click", () => goBackToParty());
    }
  );
  app.querySelector("#lose")?.addEventListener("click", () => emit("admit_lose"));
  app.querySelector("#close-peek")?.addEventListener("click", () =>
    emit("clear_peek")
  );

  app.querySelectorAll("[data-card]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!ui.state?.yourTurn && !ui.state?.pitouPicking) return;
      const id = b.getAttribute("data-card");
      const c =
        ui.state?.myHand?.find((x) => x.instanceId === id) ||
        ui.state?.pitouHand?.find((x) => x.instanceId === id);
      if (c?.unusable) return;
      ui.selectedInstanceId = id;
      render();
    })
  );

  app.querySelector("#use")?.addEventListener("click", async () => {
    const card = selectedCard();
    if (!card) return;
    if (card.needsExchange) {
      ui.mode = "exchange";
      ui.targetId = ui.targetId || null;
      ui.exchangeMyId = null;
      ui.exchangeTheirIdx = null;
      ui.exchangeTheirId = null;
      const others = (
        ui.state.pitouPicking ? ui.state.pitouHand || [] : ui.state.myHand || []
      ).filter((c) => c.instanceId !== card.instanceId);
      if (others.length === 1) ui.exchangeMyId = others[0].instanceId;
      const only = targetPlayers();
      if (only.length === 1) ui.targetId = only[0].id;
      render();
      return;
    }
    if (card.needsTarget) {
      ui.mode = "target";
      ui.targetId = null;
      const only = targetPlayers();
      if (only.length === 1) ui.targetId = only[0].id;
      render();
      return;
    }
    if (card.needsGravePick) {
      ui.mode = "grave";
      ui.graveOptions = (ui.state.graveTop || []).filter((c) =>
        ["A", "B", "C"].includes(c.rank)
      );
      ui.gravePicks = [];
      render();
      return;
    }
    await tryPlay();
  });

  app.querySelector("#cancel-mode")?.addEventListener("click", () => {
    ui.mode = null;
    render();
  });

  app.querySelectorAll("[data-target]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.targetId = b.getAttribute("data-target");
      ui.exchangeTheirIdx = null;
      ui.exchangeTheirId = null;
      render();
    })
  );

  app.querySelector("#confirm-target")?.addEventListener("click", () =>
    tryPlay({ targetId: ui.targetId })
  );

  app.querySelectorAll("[data-grave]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-grave");
      if (ui.gravePicks.includes(id)) {
        ui.gravePicks = ui.gravePicks.filter((x) => x !== id);
      } else if (ui.gravePicks.length < 2) {
        ui.gravePicks.push(id);
      }
      render();
    })
  );

  app.querySelector("#confirm-grave")?.addEventListener("click", () =>
    tryPlay({ graveInstanceIds: ui.gravePicks })
  );

  app.querySelectorAll("[data-ex-my]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.exchangeMyId = b.getAttribute("data-ex-my");
      render();
    })
  );

  app.querySelectorAll("[data-ex-idx]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.exchangeTheirIdx = Number(b.getAttribute("data-ex-idx"));
      ui.exchangeTheirId = null;
      render();
    })
  );

  app.querySelectorAll("[data-ex-their]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.exchangeTheirId = b.getAttribute("data-ex-their");
      ui.exchangeTheirIdx = null;
      render();
    })
  );

  app.querySelector("#confirm-exchange")?.addEventListener("click", () =>
    tryPlay({
      targetId: ui.targetId,
      myCardId: ui.exchangeMyId,
      theirCardIndex: ui.exchangeTheirIdx,
      theirCardId: ui.exchangeTheirId,
    })
  );

  app.querySelectorAll("[data-discard]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.selectedInstanceId = b.getAttribute("data-discard");
      render();
    })
  );
  app.querySelector("#confirm-discard")?.addEventListener("click", () => {
    if (!ui.selectedInstanceId) return;
    emit("pick_discard", { instanceId: ui.selectedInstanceId });
  });
}

render();
