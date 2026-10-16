// 範例卡片的動畫縮圖：把預覽模組照板子的節奏（60fps）跑一遍，取 28 格排成一列的 sprite（寬 N×28、高 N）。
// 頁面用 CSS steps() 播放（格數＝圖寬÷圖高，每格 0.1 秒），開頁不必編譯任何東西。
// 28 格平均取自第三個循環（前兩個讓有狀態的程式穩定，例如頻譜長條的落下）；循環長度看檔頭 `// @loop 秒數`，預設 2.8 秒。
// 卡片都是 28 格，範例區塊錄成 GIF（examples/gif/）時才會同時回到起點、無縫循環。
// 取樣點在每格起點後 1 個 tick，避開「每 0.1 秒換一格」的程式剛好換格的瞬間；多取一格（下一循環的第 1 格）算首尾差。
const { encodePng } = require("../examples/png.js");

const FRAMES = 28, LOOP = 2.8, FPS = 60;

const loopOf = (code) => {
  const m = String(code).match(/^\s*\/\/\s*@loop\s+([\d.]+)/m);
  return m ? parseFloat(m[1]) : LOOP;
};
const lit = (fb, n) => { let c = 0; for (let i = 0; i < n * n; i++) if (fb[i * 3] | fb[i * 3 + 1] | fb[i * 3 + 2]) c++; return c; };
const maxDiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };

// m：剛載入、還沒跑過的預覽模組（見 load_module.js）
function renderThumb(m, code) {
  const N = m._bp_width(), ptr = m._bp_framebuffer(), bytes = N * N * 3;
  const loop = loopOf(code);
  const at = Array.from({ length: FRAMES + 1 }, (_, k) => Math.round((2 + k / FRAMES) * loop * FPS) + 1);
  const shots = [];
  for (let i = 0, next = 0; next < at.length; i++) {
    m._bp_tick(i / FPS);
    if (i === at[next]) { shots.push(Buffer.from(m.HEAPU8.subarray(ptr, ptr + bytes))); next++; }
  }
  const seam = maxDiff(shots.pop(), shots[0]);
  const W = N * FRAMES, img = Buffer.alloc(W * N * 3, 0);
  shots.forEach((fb, i) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const s = (y * N + x) * 3, d = (y * W + i * N + x) * 3;
      img[d] = fb[s]; img[d + 1] = fb[s + 1]; img[d + 2] = fb[s + 2];
    }
  });
  return { png: encodePng(W, N, img), N, loop, seam, litMax: Math.max(...shots.map((fb) => lit(fb, N))) };
}

module.exports = { FRAMES, loopOf, renderThumb };
