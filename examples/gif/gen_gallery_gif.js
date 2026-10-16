// 把工具頁下方的範例卡片區塊做成無縫循環的 GIF（課程介紹頁等行銷素材用）
//   node gen_gallery_gif.js [頁面縮放=1.5] [輸出資料夾=D:/CSH/Design/BatoPixel]
//
// 不是錄螢幕，而是用同一批素材直接合成：
//   1. 卡片清單與文字：和編譯站同樣的規則（station/catalog.js）讀 examples/8x8 的官方範例（檔名＝標題、@desc＝說明）
//   2. 不動的部分（背景、標題、卡片框、說明文字）交給 render_gallery_bg.ps1 用 GDI+ 畫（需要字型引擎）
//   3. 會動的縮圖由這裡逐格貼上（每個 LED 像素放大成整數倍的方塊，邊緣銳利），再自行編碼 GIF
// 縮圖都是 28 格（build_thumbs.js 固定），GIF 就是 28 格 × 0.1 秒，四張同時回到起點、無縫循環。
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");
const { decodePng, writePng } = require("../png.js");

const HERE = __dirname, EX = path.join(HERE, "..");
const ZOOM = Number(process.argv[2] || 1.5);
const OUT_DIR = process.argv[3] || "D:/CSH/Design/BatoPixel";
const DELAY_CS = 10;                            // 每格 0.1 秒，與頁面上的卡片動畫相同

// ── 1. 卡片清單：8×8 的官方範例（規則同編譯站，見 station/catalog.js），縮圖是 .ino 旁邊的同名 .png ──
const { listExamples } = require("../../station/catalog.js");
const cards = listExamples(EX, 8, { official: true })
  .map((e) => ({ title: e.title, desc: e.desc, png: e.file.replace(/\.ino$/i, ".png") }))
  .filter((c) => fs.existsSync(c.png));
if (!cards.length) { console.log("examples/ 裡沒有帶縮圖的範例"); process.exit(1); }

// ── 2. 靜態背景 ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bp_gif_"));
const cfgPath = path.join(tmp, "cfg.json"), bmpPath = path.join(tmp, "bg.bmp"), layoutPath = path.join(tmp, "layout.json");
fs.writeFileSync(cfgPath, JSON.stringify({
  scale: ZOOM, title: "範例（點一下載入並執行）",
  cards: cards.map((c) => ({ title: c.title, desc: c.desc })),
}));
const psOut = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
  path.join(HERE, "render_gallery_bg.ps1"), "-In", cfgPath, "-OutBmp", bmpPath, "-OutLayout", layoutPath]).toString().trim();
console.log("  " + psOut);
const layout = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
const thumbs = [].concat(layout.thumbs);

function readBmp(file) {                        // 24-bit BI_RGB，列由下往上、每列補齊 4 bytes
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), h = b.readInt32LE(22);
  if (b.readUInt16LE(28) !== 24 || b.readUInt32LE(30) !== 0) throw new Error("背景需為 24-bit BI_RGB BMP");
  const H = Math.abs(h), stride = Math.ceil((w * 3) / 4) * 4, px = Buffer.alloc(w * H * 3);
  for (let y = 0; y < H; y++) {
    const sy = h > 0 ? H - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const s = off + sy * stride + x * 3, d = (y * w + x) * 3;
      px[d] = b[s + 2]; px[d + 1] = b[s + 1]; px[d + 2] = b[s];
    }
  }
  return { w, h: H, px };
}
const bg = readBmp(bmpPath);
fs.rmSync(tmp, { recursive: true, force: true });

// ── 3. 逐格合成 ──
const sprites = cards.map((c) => decodePng(c.png));
const counts = sprites.map((s) => s.w / 8);
const lcm = (a, b) => { const g = (x, y) => (y ? g(y, x % y) : x); return (a * b) / g(a, b); };
const N = counts.reduce(lcm);
if (N > 120) console.log("  ⚠️ 縮圖格數 " + counts.join("/") + " 的最小公倍數是 " + N + "，GIF 會很長");

const inRound = (px, py, size, r) => {         // 像素中心是否在圓角正方形內（硬邊，不做反鋸齒）
  const cx = px < r ? r : px > size - r ? size - r : px;
  const cy = py < r ? r : py > size - r ? size - r : py;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
};
function composite(f) {
  const img = Buffer.from(bg.px);
  thumbs.forEach((t, i) => {
    const s = sprites[i], k = f % counts[i], cell = t.size / 8;
    for (let y = 0; y < t.size; y++) for (let x = 0; x < t.size; x++) {
      if (!inRound(x + 0.5, y + 0.5, t.size, layout.radius)) continue;
      const si = (Math.floor(y / cell) * s.w + k * 8 + Math.floor(x / cell)) * 3;
      const d = ((t.y + y) * bg.w + t.x + x) * 3;
      img[d] = s.px[si]; img[d + 1] = s.px[si + 1]; img[d + 2] = s.px[si + 2];
    }
  });
  return img;
}
// 起點：GIF 第一格常被當成預覽圖（暫停、信件、社群縮圖），靜態備用圖也用它。
// 循環是無縫的，起點可以任意挪；挑「四張卡裡亮燈最少的那張，亮燈數最多」的那一格，
// 避免跑馬燈剛好在字還沒進場的全黑畫面。
const litOf = (s, k) => { let n = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (y * s.w + k * 8 + x) * 3; if (s.px[i] | s.px[i + 1] | s.px[i + 2]) n++; } return n; };
let START = 0, bestScore = -1;
for (let f = 0; f < N; f++) {
  const score = Math.min(...sprites.map((s, i) => litOf(s, f % counts[i])));
  if (score > bestScore) { bestScore = score; START = f; }
}
console.log("  起點第 " + START + " 格（該格四張卡最少也亮 " + bestScore + " 顆）");
const frames = Array.from({ length: N }, (_, f) => composite((START + f) % N));

// ── 4. GIF 編碼 ──
function medianCut(hist, maxN) {               // 超過 256 色時才用；每格各自的調色盤
  let boxes = [hist];
  while (boxes.length < maxN) {
    let bi = -1, best = -1, bc = 0;
    boxes.forEach((bx, i) => {
      if (bx.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of bx) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > best) { best = hi - lo; bi = i; bc = c; }
      }
    });
    if (bi < 0) break;
    const bx = boxes[bi].sort((a, b) => a[bc] - b[bc]);
    const total = bx.reduce((s, p) => s + p[3], 0);
    let acc = 0, cut = 1;
    for (let j = 0; j < bx.length - 1; j++) { acc += bx[j][3]; if (acc >= total / 2) { cut = j + 1; break; } }
    boxes.splice(bi, 1, bx.slice(0, cut), bx.slice(cut));
  }
  return boxes.map((bx) => {
    const t = bx.reduce((s, p) => s + p[3], 0);
    return [0, 1, 2].map((c) => Math.round(bx.reduce((s, p) => s + p[c] * p[3], 0) / t));
  });
}

function indexRegion(img, x0, y0, w, h) {
  const counts2 = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y0 + y) * bg.w + x0 + x) * 3, key = (img[s] << 16) | (img[s + 1] << 8) | img[s + 2];
    counts2.set(key, (counts2.get(key) || 0) + 1);
  }
  let palette, lookup = new Map();
  if (counts2.size <= 256) {
    palette = [...counts2.keys()].map((k) => [k >> 16, (k >> 8) & 255, k & 255]);
    palette.forEach((c, i) => lookup.set((c[0] << 16) | (c[1] << 8) | c[2], i));
  } else {
    palette = medianCut([...counts2].map(([k, n]) => [k >> 16, (k >> 8) & 255, k & 255, n]), 256);
    for (const k of counts2.keys()) {
      const r = k >> 16, g = (k >> 8) & 255, b = k & 255;
      let bi = 0, bd = Infinity;
      palette.forEach((p, i) => { const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; bi = i; } });
      lookup.set(k, bi);
    }
  }
  const idx = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y0 + y) * bg.w + x0 + x) * 3;
    idx[y * w + x] = lookup.get((img[s] << 16) | (img[s + 1] << 8) | img[s + 2]);
  }
  return { palette, idx, exact: counts2.size <= 256, colors: counts2.size };
}

// LZW：照 omggif 的編碼器寫。碼長遞增要在「插入會溢位的第一個新碼之前」，
// 表滿（4096）時送 clear code 重來——這兩處時機錯了，解碼端就會整張花掉。
function lzw(idx, minCodeSize) {
  const out = [];
  let cur = 0, shift = 0;
  const emit = (code, size) => {
    cur |= code << shift; shift += size;
    while (shift >= 8) { out.push(cur & 0xff); cur >>>= 8; shift -= 8; }
  };
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let next = eoi + 1, size = minCodeSize + 1;
  const table = new Int32Array(4096 * 256).fill(-1);
  const used = [];
  emit(clear, size);
  let ib = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = (ib << 8) | k, code = table[key];
    if (code >= 0) { ib = code; continue; }
    emit(ib, size);
    if (next === 4096) {
      emit(clear, size);
      for (const u of used) table[u] = -1;
      used.length = 0;
      next = eoi + 1; size = minCodeSize + 1;
    } else {
      if (next >= (1 << size)) size++;
      table[key] = next++; used.push(key);
    }
    ib = k;
  }
  emit(ib, size);
  emit(eoi, size);
  if (shift > 0) out.push(cur & 0xff);
  return out;
}

const bytes = [];
const u16 = (v) => bytes.push(v & 0xff, (v >> 8) & 0xff);
bytes.push(...Buffer.from("GIF89a", "latin1"));
u16(bg.w); u16(bg.h); bytes.push(0x00, 0, 0);            // 不用全域調色盤，每格各帶一張
bytes.push(0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0", "latin1"), 0x03, 0x01, 0x00, 0x00, 0x00);   // 無限循環

// 第 0 格整張；之後只編「涵蓋四個縮圖的那一條」，其餘沿用上一格（disposal=1）
const bx0 = Math.min(...thumbs.map((t) => t.x)), by0 = Math.min(...thumbs.map((t) => t.y));
const bx1 = Math.max(...thumbs.map((t) => t.x + t.size)), by1 = Math.max(...thumbs.map((t) => t.y + t.size));
let quantized = 0, maxColors = 0;
frames.forEach((img, f) => {
  const [x0, y0, w, h] = f === 0 ? [0, 0, bg.w, bg.h] : [bx0, by0, bx1 - bx0, by1 - by0];
  const { palette, idx, exact, colors } = indexRegion(img, x0, y0, w, h);
  if (!exact) quantized++;
  maxColors = Math.max(maxColors, colors);
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
  bytes.push(0x21, 0xf9, 0x04, 0x04); u16(DELAY_CS); bytes.push(0x00, 0x00);   // GCE：disposal 1、無透明
  bytes.push(0x2c); u16(x0); u16(y0); u16(w); u16(h); bytes.push(0x80 | (bits - 1));
  for (let i = 0; i < 1 << bits; i++) { const c = palette[i] || [0, 0, 0]; bytes.push(c[0], c[1], c[2]); }
  const minCode = Math.max(2, bits);
  bytes.push(minCode);
  const data = lzw(idx, minCode);
  for (let i = 0; i < data.length; i += 255) {
    const n = Math.min(255, data.length - i);
    bytes.push(n);
    for (let j = 0; j < n; j++) bytes.push(data[i + j]);
  }
  bytes.push(0x00);
});
bytes.push(0x3b);

fs.mkdirSync(OUT_DIR, { recursive: true });
const tag = "batopixel-examples-" + Math.round(ZOOM * 100);
const gifPath = path.join(OUT_DIR, tag + ".gif");
fs.writeFileSync(gifPath, Buffer.from(bytes));
writePng(path.join(OUT_DIR, tag + ".png"), bg.w, bg.h, frames[0]);   // 靜態備用圖（第 0 格）
console.log("  " + N + " 格 × " + DELAY_CS * 10 + "ms，" + bg.w + "×" + bg.h + "，最多 " + maxColors + " 色" +
            (quantized ? "（" + quantized + " 格超過 256 色已量化）" : "（每格都是原色，無量化）"));
console.log("  → " + gifPath + "（" + (fs.statSync(gifPath).size / 1024).toFixed(0) + " KB）");
console.log("  → " + path.join(OUT_DIR, tag + ".png") + "（靜態備用圖）");

// ── 5. 自我驗證：用 GDI+ 把 GIF 每一格解回來，和合成結果逐點比對（LZW 或調色盤錯了這裡會抓到） ──
const pts = [];
thumbs.forEach((t) => { for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) pts.push([Math.floor(t.x + t.size * fx), Math.floor(t.y + t.size * fy)]); });
pts.push([Math.floor(bg.w / 2), 3], [thumbs[0].x + 4, bg.h - 8]);           // 兩個非縮圖的點
const ptsArg = pts.map((p) => p.join(",")).join(";");
const ps = [
  "Add-Type -AssemblyName System.Drawing",
  "$img = [System.Drawing.Image]::FromFile('" + gifPath.replace(/\\/g, "/") + "')",
  "$fd = [System.Drawing.Imaging.FrameDimension]::Time",
  "$n = $img.GetFrameCount($fd)",
  "$d = $img.GetPropertyItem(0x5100).Value",
  "$pts = '" + ptsArg + "'.Split(';') | ForEach-Object { ,($_.Split(',') | ForEach-Object { [int]$_ }) }",
  "$rows = for ($i = 0; $i -lt $n; $i++) { [void]$img.SelectActiveFrame($fd, $i); $bm = [System.Drawing.Bitmap]$img;",
  "  ($pts | ForEach-Object { $c = $bm.GetPixel($_[0], $_[1]); '{0},{1},{2}' -f $c.R, $c.G, $c.B }) -join ';' }",
  "$delays = for ($i = 0; $i -lt $n; $i++) { [BitConverter]::ToInt32($d, $i * 4) }",
  "Write-Output ($n.ToString() + '|' + ($delays -join ',') + '|' + ($rows -join '#'))",
].join("\n");
const res = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps]).toString().trim();
const [nStr, delayStr, rowStr] = res.split("|");
const decoded = rowStr.split("#").map((r) => r.split(";"));
let bad = 0;
decoded.forEach((row, f) => row.forEach((v, j) => {
  const [x, y] = pts[j], i = (y * bg.w + x) * 3, want = frames[f][i] + "," + frames[f][i + 1] + "," + frames[f][i + 2];
  if (v !== want) { if (bad < 5) console.log("    ✗ 第 " + f + " 格 (" + x + "," + y + ") 解出 " + v + "，應為 " + want); bad++; }
}));
const delays = delayStr.split(",").map(Number);
console.log("  驗證：Windows 解出 " + nStr + " 格、延遲 " + [...new Set(delays)].join("/") + "（1/100 秒）；" +
            (pts.length * decoded.length) + " 個取樣點" + (bad ? " " + bad + " 個不符 → FAIL" : "全部相符 → PASS"));
if (bad || Number(nStr) !== N) process.exit(1);
