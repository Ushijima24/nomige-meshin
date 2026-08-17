const AVATARS = ["🦊", "🐻", "🐱", "🐸", "🐼", "🐷", "🦁", "🐨", "🐵", "🐰", "🐯", "🐮", "🐶", "🐺", "🦝", "🐔", "🐧", "🦄", "🐙", "🦖", "👻", "🎃", "👽", "🤖"];
const socket = io("/seikai-jinrou", {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
});

const app = document.getElementById("app");
const ui = {
  view: "home",
  rulesBack: "home",
  name: localStorage.getItem("seikai_name") || "",
  avatar: localStorage.getItem("seikai_avatar") || AVATARS[0],
  joinCode: "",
  error: "",
  state: null,
  answer: "",
  selectedGroupId: null,
  selectedExileId: null,
  busy: false,
};

const params = new URLSearchParams(location.search);
if (params.get("room")) ui.joinCode = params.get("room").toUpperCase();

const SESSION_KEY = "seikai_session";
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
  if (state.phase !== "answering") ui.answer = "";
  if (state.phase !== "review") ui.selectedGroupId = null;
  if (state.wolfVoteStage !== "host") ui.selectedExileId = null;
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
  localStorage.setItem("seikai_name", ui.name.trim());
  localStorage.setItem("seikai_avatar", ui.avatar);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMmSs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

let timerTick = null;
function bindTimer() {
  clearInterval(timerTick);
  const el = document.getElementById("timer");
  const endsAt = ui.state?.timer?.endsAt;
  if (!el || !endsAt) return;
  const update = () => {
    const left = Math.max(0, endsAt - Date.now());
    el.textContent = formatMmSs(left);
    el.classList.toggle("low", left > 0 && left <= 10000);
  };
  update();
  timerTick = setInterval(update, 200);
}

function drinkBoardHtml(board) {
  if (!board?.length) return "";
  return `<div class="drink-board"><div class="drink-board-title">🍺 累計罰杯</div>${board
    .map(
      (p) => `<div class="drink-board-row"><span>${p.avatar} ${escapeHtml(p.name)}</span><span>${p.totalCups}杯</span></div>`
    )
    .join("")}</div>`;
}

function rulesBodyHtml() {
  return `
    <div class="panel howto">
      <div class="section-title">このゲームは何？</div>
      <p class="sub" style="margin:0">1人だけ<strong>人狼</strong>、あとは市民。お題に一番沿った答え（<strong>ベストアンサー</strong>）を決め、そのあと人狼を当てる飲みゲー。</p>
    </div>
    <div class="panel howto">
      <div class="section-title">1ラウンドの流れ</div>
      <ol>
        <li>主催者がお題を<strong>3つから選ぶ</strong>。役職は参加者から毎回ランダム。人狼だけ自分の役が分かる</li>
        <li>お題が配られたら、主催者が<strong>タイマー開始</strong> → 1分で1人1回答</li>
        <li>人狼はベストアンサーになってはいけない</li>
        <li>答えが全員バラバラなら、投票でベストアンサーを決める</li>
        <li>同じ答えの被りがあるときは、主催者がその回答をベストアンサーにする</li>
        <li>ベストアンサー以外から人狼を投票。最多票が人狼なら人狼の負け（1杯）</li>
        <li>同数トップなら、そこに入れてない人だけが再投票。それでも割れなければ主催者が追放する人を決める</li>
        <li>当てられなかったら、ベストアンサーでも人狼指名でもない市民だけが飲む</li>
      </ol>
    </div>
    <div class="panel howto">
      <div class="section-title">罰杯</div>
      <ul>
        <li>人狼がベストアンサーになった／人狼が最多票（追放） → 人狼が1杯</li>
        <li>人狼を逃した → 市民のうち、BAでも指名人狼でもない人だけ</li>
        <li>再投票は「誰が人狼に入れたか」の飲み判定には使わない。最終の指名だけ見る</li>
      </ul>
    </div>`;
}

function partyBackHtml() {
  if (ui.state) {
    return `<button type="button" class="linkish" id="btn-party">← パーティーに戻る</button>`;
  }
  const href = hasPartySession() ? partyHomeUrl() : "/";
  return `<a class="back" href="${href}">← パーティーに戻る</a>`;
}

function screenHeadHtml() {
  return `<div class="screen-head">
    ${partyBackHtml()}
    <button type="button" class="linkish" id="open-rules">📖 遊び方</button>
  </div>`;
}

function renderRules() {
  return `
    <div class="screen-head">
      ${partyBackHtml()}
      <button type="button" class="linkish" id="rules-back">← 戻る</button>
    </div>
    <h1>遊び方</h1>
    <p class="sub">朝までそれ正解人狼</p>
    ${rulesBodyHtml()}
    <button type="button" class="btn ghost" id="rules-back-bottom">戻る</button>`;
}

function renderHome() {
  return `
    <p>${partyBackHtml()}</p>
    <h1>朝までそれ正解人狼</h1>
    <p class="sub">人狼はベストアンサーになるな。お題に一番沿った答えと人狼を当てる。</p>
    <p style="margin:0 0 12px"><button type="button" class="linkish" id="open-rules">📖 遊び方</button></p>
    <div class="panel">
      <label>なまえ</label>
      <input type="text" id="name" maxlength="12" placeholder="例：たろう" value="${escapeHtml(ui.name)}" />
      <label>アバター</label>
      <div class="avatars">${AVATARS.map(
        (a) =>
          `<button type="button" data-av="${a}" class="${ui.avatar === a ? "on" : ""}">${a}</button>`
      ).join("")}</div>
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
      <button class="btn" id="btn-create" ${ui.busy ? "disabled" : ""}>ルームを作る（主催）</button>
      <label style="margin-top:8px">ルームコードで参加</label>
      <input type="text" id="join-code" maxlength="6" placeholder="ABCD" value="${escapeHtml(ui.joinCode)}" style="text-transform:uppercase;letter-spacing:.15em" />
      <button class="btn join" id="btn-join" ${ui.busy ? "disabled" : ""}>ルームに入る</button>
    </div>`;
}

function renderJoining() {
  return `
    <p>${partyBackHtml()}</p>
    <h1>朝までそれ正解人狼</h1>
    <p class="wait">ゲームに入っています…</p>`;
}

function renderLobby() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  return `
    <h1>朝までそれ正解人狼</h1>
    <div class="lobby-actions">
      ${
        isHost
          ? `<button class="btn" id="btn-start" ${s.players.length < 3 || ui.busy ? "disabled" : ""}>ゲーム開始（3人〜）</button>
             <button class="btn ghost" id="btn-party" ${ui.busy ? "disabled" : ""}>パーティーに戻る</button>`
          : `<p class="wait">主催者の開始待ち…</p>
             ${hasPartySession() ? `<p class="sub" style="margin:0;text-align:center">主催者がパーティーに戻すまで待ってね</p>` : ""}`
      }
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>
    ${rulesBodyHtml()}`;
}

function roleHtml(s) {
  if (s.you?.role === "wolf") {
    return `<div class="role wolf"><div class="who">あなたは人狼</div><div class="hint">ベストアンサーになってはいけない。無難すぎず、一番にはならない答えを。</div></div>`;
  }
  if (s.you?.role === "citizen") {
    return `<div class="role citizen"><div class="who">あなたは市民</div><div class="hint">お題に一番沿った答えを出して、あとで人狼を見つけろ。</div></div>`;
  }
  return "";
}

function topicHtml(s) {
  if (!s.topic?.text) return "";
  return `<div class="topic">${escapeHtml(s.topic.text)}</div>`;
}

function pickCardHtml({ id, avatar, name, answer, attr = "data-vote", selected = false }) {
  return `<button type="button" class="pick-card ${selected ? "on" : ""}" ${attr}="${id}">
    <span class="pick-av">${avatar}</span>
    <span class="pick-name">${escapeHtml(name)}</span>
    <span class="pick-ans">${escapeHtml(answer || "—")}</span>
  </button>`;
}

function renderPickTopic() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">ラウンド ${s.round}</span><span>お題選び</span></div>
    <div class="panel">
      <div class="section-title">お題を選ぶ</div>
      ${
        isHost
          ? `<p class="host-tip">3つから1つ選ぶと、みんなにお題が配られるよ</p>
             <div class="topic-choices">
               ${(s.topicChoices || [])
                 .map(
                   (t) =>
                     `<button type="button" class="topic-choice" data-topic="${t.id}" ${ui.busy ? "disabled" : ""}>${escapeHtml(t.text)}</button>`
                 )
                 .join("")}
             </div>
             <button class="btn ghost" id="btn-refresh-topics" ${ui.busy ? "disabled" : ""}>お題を入れ替える</button>
             ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}`
          : `<p class="wait">主催者がお題を選んでいます…</p>`
      }
    </div>`;
}

function renderAnswering() {
  const s = ui.state;
  const running = s.timer?.running;
  const left = running ? Math.max(0, s.timer.endsAt - Date.now()) : null;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">ラウンド ${s.round}</span><span>${s.answeredCount}/${s.expectedCount} 回答</span></div>
    ${roleHtml(s)}
    ${topicHtml(s)}
    ${
      running
        ? `<div class="timer ${left <= 10000 ? "low" : ""}" id="timer">${formatMmSs(left)}</div>`
        : `<div class="timer idle">タイマー待機中</div>`
    }
    <div class="panel">
      ${
        s.hasAnswered
          ? `<p class="wait">回答済み<br/><span style="color:var(--accent)">あなた: ${escapeHtml(s.myAnswer || "")}</span></p>`
          : `<label>あなたの回答（1人1つ）</label>
             <input type="text" id="answer" maxlength="40" placeholder="1つだけ言ってね" value="${escapeHtml(ui.answer)}" />
             ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
             <button class="btn" id="btn-answer" ${ui.busy ? "disabled" : ""}>送信</button>`
      }
      ${
        s.you?.isHost && !running
          ? `<button class="btn join" id="btn-timer" ${ui.busy ? "disabled" : ""}>タイマー開始（1分）</button>`
          : ""
      }
      ${
        s.you?.isHost
          ? `<button class="btn ghost" id="btn-close" ${ui.busy ? "disabled" : ""}>回答をしめ切る</button>`
          : ""
      }
    </div>`;
}

function renderReview() {
  const s = ui.state;
  const isHost = s.you?.isHost;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">答え合わせ</span><span>ラウンド ${s.round}</span></div>
    ${topicHtml(s)}
    <div class="panel">
      <p class="host-tip">${
        isHost
          ? s.hasDuplicates
            ? "被りがある回答をタップしてベストアンサーに。違う意味ならタップ2つでまとめ／↩で分離"
            : "全員バラバラ。ベストアンサー投票へ進めてね。同じ意味なら2つタップでまとめられる"
          : "主催者が被りを見ています…"
      }</p>
      <div class="groups">
        ${(s.groups || [])
          .map(
            (g) => `
          <div class="group-card ${g.duplicated ? "dup" : ""} ${ui.selectedGroupId === g.id ? "selected" : ""}" data-group="${g.id}">
            <div class="glabel">「${escapeHtml(g.label)}」 ×${g.members.length}${g.duplicated ? " ·被り" : ""}</div>
            <div class="members">${g.members
              .map(
                (m) => `<span class="member">${m.avatar} ${escapeHtml(m.name)}
                  ${isHost && g.members.length > 1 ? `<button type="button" class="split" data-split="${m.id}">↩</button>` : ""}
                </span>`
              )
              .join("")}</div>
          </div>`
          )
          .join("")}
      </div>
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
      ${
        isHost
          ? s.hasDuplicates
            ? `<button class="btn" id="btn-pick-ba" ${
                ui.busy || !(s.groups || []).find((g) => g.id === ui.selectedGroupId)?.duplicated
                  ? "disabled"
                  : ""
              }>この回答をベストアンサーにする</button>`
            : `<button class="btn" id="btn-ba-vote" ${ui.busy ? "disabled" : ""}>ベストアンサー投票へ</button>`
          : ""
      }
    </div>`;
}

function renderVoteBa() {
  const s = ui.state;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">ベストアンサー投票</span><span>${s.voteCount}/${s.voteExpected}</span></div>
    ${topicHtml(s)}
    <div class="panel">
      ${
        s.hasVoted
          ? `<p class="wait">投票済み！ほかの人を待ってるよ</p>`
          : `<p class="host-tip">一番お題に沿っている回答を選んでね</p>
             <div class="pick-grid">${s.players
               .filter((p) => p.connected)
               .map((p) => {
                 const g = (s.groups || []).find((x) => x.members.some((m) => m.id === p.id));
                 return pickCardHtml({
                   id: p.id,
                   avatar: p.avatar,
                   name: p.name,
                   answer: g?.label || "",
                 });
               })
               .join("")}</div>`
      }
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>`;
}

function renderVoteWolf() {
  const s = ui.state;
  const ba = (s.bestAnswer?.members || [])
    .map((m) => `${m.avatar} ${m.name}`)
    .join("、");
  const stage = s.wolfVoteStage || "first";
  const tiedNames = (s.wolfTied || [])
    .map((p) => `${p.avatar} ${p.name}`)
    .join("、");
  const pill =
    stage === "runoff" ? "再投票" : stage === "host" ? "追放" : "人狼投票";
  const meta =
    stage === "runoff"
      ? `残り ${s.revoteLeft}人`
      : stage === "host"
        ? "主催者"
        : `${s.voteCount}/${s.voteExpected}`;

  let body = "";
  if (stage === "host") {
    body = s.you?.isHost
      ? `<p class="host-tip">まだ同数。話し合ってから、追放する人を選んでボタンを押してね<br/>${escapeHtml(tiedNames)}</p>
         <div class="pick-grid">${(s.wolfCandidates || [])
           .map((p) =>
             pickCardHtml({
               id: p.id,
               avatar: p.avatar,
               name: p.name,
               answer: p.answer,
               attr: "data-exile",
               selected: ui.selectedExileId === p.id,
             })
           )
           .join("")}</div>
         <button class="btn danger" id="btn-exile" ${ui.busy || !ui.selectedExileId ? "disabled" : ""}>この人を追放する</button>`
      : `<p class="wait">同数のまま。主催者が追放する人を決めています…<br/>${escapeHtml(tiedNames)}</p>`;
  } else if (s.hasVoted) {
    body = s.voteKept
      ? `<p class="wait">同数トップに入れた票はそのまま。再投票を待ってるよ</p>`
      : `<p class="wait">投票済み！ほかの人を待ってるよ</p>`;
  } else if (stage === "runoff") {
    body = `<p class="host-tip">同数トップ: ${escapeHtml(tiedNames)}<br/>ここに入れてない人だけ、この中から再投票</p>
      <div class="pick-grid">${(s.wolfCandidates || [])
        .map((p) =>
          pickCardHtml({
            id: p.id,
            avatar: p.avatar,
            name: p.name,
            answer: p.answer,
          })
        )
        .join("")}</div>`;
  } else {
    body = `<p class="ba-note">ベストアンサー: 「${escapeHtml(s.bestAnswer?.label || "")}」${ba ? `（${escapeHtml(ba)}）` : ""}</p>
      <p class="vote-lead">選ばれなかった人から<br/>怪しい人を投票して</p>
      <div class="pick-grid">${(s.wolfCandidates || [])
        .map((p) =>
          pickCardHtml({
            id: p.id,
            avatar: p.avatar,
            name: p.name,
            answer: p.answer,
          })
        )
        .join("")}</div>`;
  }

  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">${pill}</span><span>${meta}</span></div>
    ${topicHtml(s)}
    <div class="panel">
      ${body}
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
    </div>`;
}

function renderResult() {
  const s = ui.state;
  let banner = "";
  if (s.resultKind === "wolf_caught") {
    banner = `<div class="result-banner caught">人狼を見つけた！人狼の1人飲み</div>`;
  } else if (s.resultKind === "wolf_ba") {
    banner = `<div class="result-banner wolf_ba">人狼がベストアンサー…人狼の負け</div>`;
  } else {
    banner = `<div class="result-banner escape">人狼を逃した…市民の罰杯</div>`;
  }
  const missNote =
    s.resultKind === "wolf_escape" && s.accused
      ? `<p class="miss-note">${s.accused.avatar} ${escapeHtml(s.accused.name)} は<br/>人狼ではありませんでした</p>`
      : "";
  const drinks = (s.drinks || []).length
    ? `<div class="drink-list">${s.drinks
        .map(
          (d) =>
            `<div class="drink-item"><span>${d.avatar} ${escapeHtml(d.name)}</span><span class="cups">🍺 ×${d.cups}</span></div>`
        )
        .join("")}</div>`
    : `<p class="wait">飲む人なし</p>`;
  return `
    ${screenHeadHtml()}
    <div class="meta-bar"><span class="pill">結果</span><span>ラウンド ${s.round}</span></div>
    ${banner}
    ${missNote}
    <div class="panel">
      <p class="sub" style="margin:0 0 8px">人狼は ${s.wolf?.avatar || ""} ${escapeHtml(s.wolf?.name || "?")}</p>
      <p class="sub" style="margin:0 0 8px">ベストアンサー「${escapeHtml(s.bestAnswer?.label || "")}」</p>
      ${s.accused ? `<p class="sub" style="margin:0 0 12px">人狼指名 ${s.accused.avatar} ${escapeHtml(s.accused.name)}</p>` : ""}
      ${drinks}
      ${drinkBoardHtml(s.drinkBoard)}
      ${ui.error ? `<div class="error">${escapeHtml(ui.error)}</div>` : ""}
      ${
        s.you?.isHost
          ? `<button class="btn" id="btn-next" ${ui.busy ? "disabled" : ""}>次のラウンド</button>`
          : `<p class="wait">主催者の「次へ」待ち…</p>`
      }
    </div>`;
}

function render() {
  let html = "";
  if (ui.view === "rules") html = renderRules();
  else if (ui.view === "joining") html = renderJoining();
  else if (ui.view === "home" || !ui.state) html = renderHome();
  else if (ui.state.phase === "lobby") html = renderLobby();
  else if (ui.state.phase === "pick_topic") html = renderPickTopic();
  else if (ui.state.phase === "answering") html = renderAnswering();
  else if (ui.state.phase === "review") html = renderReview();
  else if (ui.state.phase === "vote_ba") html = renderVoteBa();
  else if (ui.state.phase === "vote_wolf") html = renderVoteWolf();
  else if (ui.state.phase === "result") html = renderResult();
  else html = renderHome();
  app.innerHTML = html;
  bindEvents();
  bindTimer();
}

function bindEvents() {
  document.getElementById("open-rules")?.addEventListener("click", () => {
    ui.rulesBack = !ui.state || ui.view === "home" ? "home" : ui.state.phase === "lobby" ? "lobby" : "game";
    ui.view = "rules";
    render();
  });
  const backRules = () => {
    if (ui.rulesBack === "lobby" && ui.state?.phase === "lobby") ui.view = "lobby";
    else if (ui.state) ui.view = ui.state.phase === "lobby" ? "lobby" : "game";
    else ui.view = "home";
    render();
  };
  document.getElementById("rules-back")?.addEventListener("click", backRules);
  document.getElementById("rules-back-bottom")?.addEventListener("click", backRules);

  document.getElementById("name")?.addEventListener("input", (e) => {
    ui.name = e.target.value;
  });
  document.getElementById("join-code")?.addEventListener("input", (e) => {
    ui.joinCode = e.target.value.toUpperCase();
  });
  document.querySelectorAll("[data-av]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.avatar = b.getAttribute("data-av");
      render();
    })
  );
  document.getElementById("btn-create")?.addEventListener("click", async () => {
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
  document.getElementById("btn-join")?.addEventListener("click", async () => {
    if (!ui.name.trim()) {
      ui.error = "なまえを入れてね";
      render();
      return;
    }
    saveProfile();
    const res = await emit("join_room", { code: ui.joinCode, name: ui.name, avatar: ui.avatar });
    if (res?.ok) {
      saveSession(res.code, res.playerId);
      history.replaceState({}, "", `?room=${res.code}`);
    }
  });
  document.getElementById("btn-start")?.addEventListener("click", () => emit("start_game"));
  document.getElementById("btn-party")?.addEventListener("click", () => goBackToParty());
  document.querySelectorAll("[data-topic]").forEach((btn) => {
    btn.addEventListener("click", () => emit("pick_topic", { topicId: btn.dataset.topic }));
  });
  document.getElementById("btn-refresh-topics")?.addEventListener("click", () => emit("refresh_topics"));

  const answerEl = document.getElementById("answer");
  if (answerEl) {
    answerEl.addEventListener("input", (e) => {
      ui.answer = e.target.value;
    });
    answerEl.focus();
  }
  document.getElementById("btn-answer")?.addEventListener("click", () =>
    emit("submit_answer", { text: ui.answer })
  );
  document.getElementById("btn-timer")?.addEventListener("click", () => emit("start_timer"));
  document.getElementById("btn-close")?.addEventListener("click", () => emit("close_answers"));

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
  document.getElementById("btn-pick-ba")?.addEventListener("click", () => {
    if (!ui.selectedGroupId) return;
    emit("host_pick_ba", { groupId: ui.selectedGroupId });
  });
  document.getElementById("btn-ba-vote")?.addEventListener("click", () => emit("start_ba_vote"));
  document.querySelectorAll("[data-vote]").forEach((btn) => {
    btn.addEventListener("click", () => emit("cast_vote", { targetId: btn.dataset.vote }));
  });
  document.querySelectorAll("[data-exile]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.selectedExileId = btn.dataset.exile;
      render();
    });
  });
  document.getElementById("btn-exile")?.addEventListener("click", () => {
    if (!ui.selectedExileId) return;
    emit("host_pick_accused", { targetId: ui.selectedExileId });
  });
  document.getElementById("btn-next")?.addEventListener("click", () => emit("next_round"));
}

render();
