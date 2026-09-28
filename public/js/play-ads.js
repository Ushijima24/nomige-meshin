const COUNT_KEY = "nomige_finished_plays";
const OPEN_KEY = "nomige_open_finish";
export const PLAYS_PER_AD = 10;

export function reduceFinish(prev, sig, every = PLAYS_PER_AD) {
  if (!sig) return { open: null, count: prev.count, ad: false };
  if (prev.open === sig) return { open: prev.open, count: prev.count, ad: false };
  const count = prev.count + 1;
  return { open: sig, count, ad: count > 0 && count % every === 0 };
}

function readCount() {
  const n = Number(localStorage.getItem(COUNT_KEY) || "0");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function notePlayFinished(sig) {
  const next = reduceFinish(
    { open: sessionStorage.getItem(OPEN_KEY), count: readCount() },
    sig
  );
  if (next.open) sessionStorage.setItem(OPEN_KEY, next.open);
  else sessionStorage.removeItem(OPEN_KEY);
  if (next.count !== readCount()) localStorage.setItem(COUNT_KEY, String(next.count));
  if (next.ad) showAd(next.count);
  return next;
}

function showAd(count) {
  const native = window.nomigeShowInterstitial;
  if (typeof native === "function") {
    Promise.resolve(native(count)).catch(() => showStandInAd(count));
    return;
  }
  showStandInAd(count);
}

function showStandInAd(count) {
  if (document.getElementById("nomige-ad")) return;
  const overlay = document.createElement("div");
  overlay.id = "nomige-ad";
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:9999",
    "background:rgba(12,8,16,.92)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "font-family:'M PLUS Rounded 1c',sans-serif",
  ].join(";");
  overlay.innerHTML = `
    <div style="width:min(420px,100%);background:#24182c;color:#fff;border-radius:20px;padding:28px 22px;text-align:center;box-shadow:0 16px 40px rgba(0,0,0,.35)">
      <div style="font-size:.8rem;letter-spacing:.12em;opacity:.7">広告</div>
      <p style="font-size:1.35rem;font-weight:800;margin:12px 0 8px">このスマホで${count}回、遊び終わりました</p>
      <p style="margin:0 0 20px;opacity:.8;line-height:1.5">ここに本番の広告が入ります。アプリの広告設定が済むまでは、この画面が代わりです。</p>
      <button type="button" id="nomige-ad-close" style="appearance:none;border:0;border-radius:999px;background:#ff5d8f;color:#fff;font-weight:800;font-size:1rem;padding:12px 28px;cursor:pointer">とじる</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#nomige-ad-close").addEventListener("click", () => overlay.remove());
}

if (typeof window !== "undefined") {
  window.nomigeNotePlayFinished = notePlayFinished;
}
