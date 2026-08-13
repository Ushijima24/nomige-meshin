/**
 * お題 = questions/images/ の写真
 * メタ（問題文・？位置）= questions/meta.json
 *
 * meta.json 例:
 * {
 *   "弁当1.jpg": {
 *     "prompt": "右上に入るのは？",
 *     "hole": { "x": 58, "y": 8, "w": 30, "h": 34 }
 *   }
 * }
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const questionsDir = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "public",
  "games",
  "image-match",
  "questions"
);
const imagesDir = path.join(questionsDir, "images");
const metaPath = path.join(questionsDir, "meta.json");
const configPath = path.join(questionsDir, "config.json");
const legacyHolesPath = path.join(questionsDir, "holes.json");

export const DEFAULT_PROMPT = "ここに入るのは？";
const DEFAULT_HOLE = { x: 58, y: 10, w: 32, h: 36 };

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) || {};
  } catch {
    return {};
  }
}

/** テスト中だけ true。本番前に config.json で false に */
export function isTestNewFirst() {
  return readConfig().testNewFirst === true;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeHole(hole) {
  const h = hole || {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  // はみ出し許可（例: y: -2 で上にずらす）
  return {
    x: clamp(num(h.x, DEFAULT_HOLE.x), -20, 95),
    y: clamp(num(h.y, DEFAULT_HOLE.y), -20, 95),
    w: clamp(num(h.w, DEFAULT_HOLE.w), 10, 90),
    h: clamp(num(h.h, DEFAULT_HOLE.h), 10, 120),
  };
}

function readMeta() {
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, "utf8")) || {};
    }
    // 旧 holes.json 互換
    if (fs.existsSync(legacyHolesPath)) {
      const holes = JSON.parse(fs.readFileSync(legacyHolesPath, "utf8")) || {};
      const meta = {};
      for (const [k, v] of Object.entries(holes)) {
        meta[k] = v?.hole || v?.x != null ? { hole: v.hole || v } : { hole: DEFAULT_HOLE };
      }
      return meta;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/** AI / 手動で meta を書き出す用 */
export function writeMeta(meta) {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
}

function listImageFiles() {
  if (!fs.existsSync(imagesDir)) return [];
  const files = fs
    .readdirSync(imagesDir)
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
    .filter((f) => !f.startsWith("."));

  const cfg = readConfig();
  const order = Array.isArray(cfg.order) ? cfg.order.filter((f) => files.includes(f)) : [];

  if (order.length) {
    // config.order で明示指定（テスト時の1問目固定用）
    const rest = files
      .filter((f) => !order.includes(f))
      .map((f) => ({
        f,
        mtime: fs.statSync(path.join(imagesDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .map((x) => x.f);
    return [...order, ...rest];
  }

  if (isTestNewFirst()) {
    // テスト時: 新しいファイルが先頭（1問目）
    return files
      .map((f) => ({
        f,
        mtime: fs.statSync(path.join(imagesDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .map((x) => x.f);
  }

  return files.sort((a, b) => a.localeCompare(b, "ja"));
}

function metaFor(filename, meta) {
  const base = path.parse(filename).name;
  const entry = meta[filename] || meta[base] || {};
  // 旧形式: 直接 hole 座標だけ
  if (entry.x != null && !entry.hole) {
    return {
      prompt: DEFAULT_PROMPT,
      hole: normalizeHole(entry),
    };
  }
  return {
    prompt: entry.prompt || DEFAULT_PROMPT,
    hole: normalizeHole(entry.hole),
  };
}

export function loadQuestions() {
  const meta = readMeta();
  return listImageFiles().map((filename) => {
    const base = path.parse(filename).name;
    const m = metaFor(filename, meta);
    return {
      id: `local-${base}`,
      note: base,
      image: `/games/image-match/questions/images/${encodeURIComponent(filename)}`,
      prompt: m.prompt,
      hole: m.hole,
    };
  });
}

function hasFixedOrder() {
  const cfg = readConfig();
  return isTestNewFirst() || (Array.isArray(cfg.order) && cfg.order.length > 0);
}

export function shuffleDeck() {
  const list = loadQuestions();
  if (hasFixedOrder()) {
    // テスト時 / order 指定時は並びを固定
    return list;
  }
  return [...list].sort(() => Math.random() - 0.5);
}

/** テスト中に1問目を差し替えたとき、進行中ルームのデッキを合わせる */
export function alignDeckIfTesting(room) {
  if (!hasFixedOrder()) return;
  if (!room?.questions?.length) return;
  if (room.qIndex !== 0) return;
  if (room.phase === "lobby" || room.phase === "done") return;
  const fresh = shuffleDeck();
  if (!fresh.length) return;
  if (fresh[0].id !== room.questions[0]?.id) {
    room.questions = fresh;
  }
}

export function publicQuestion(q, index, remainingAfter) {
  // 毎回 meta を読み直す（調整がすぐ反映されるように）
  const latest = loadQuestions().find((x) => x.id === q.id || x.image === q.image);
  const src = latest || q;
  return {
    id: src.id,
    prompt: src.prompt || DEFAULT_PROMPT,
    image: src.image,
    hole: normalizeHole(src.hole),
    index,
    remainingAfter: remainingAfter ?? 0,
  };
}

export function questionCount() {
  return listImageFiles().length;
}

export { imagesDir, metaPath };
