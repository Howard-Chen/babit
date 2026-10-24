// 官方範例的雙目標驗收：node examples/test_examples.js（需先啟動編譯站 station\run_station.ps1）
//
// examples/8x8、examples/16x16 底下每個官方範例（「我的範例」不算）都做這些事：
//   1. 送預覽端（emcc／WASM）編譯，確認編出來的尺寸跟資料夾一致（程式的 #define PANEL）
//   2. 實跑 WASM 60fps 一個循環（檔頭 @loop，預設 2.8 秒），檢查「大部分時間有畫面、會動、亮度看得見」，
//      而且沒有「預覽正常、板子會出問題」的提醒（少 begin()／show()、多次 show()）
//   3. 旁邊的縮圖 .png 跟現在跑出來的一模一樣（不是就跑 node examples/build_thumbs.js）
//   4. 送板子端（arduino-cli／Xtensa）編譯 —— 證明同一段程式兩端都成立
//   5. 取 6 個時間點的畫面，拼成 examples/preview.png 供肉眼確認（每列一個範例）
//   6. 旋鈕、按鈕 1、按鈕 2 都有作用（範例的慣例：旋鈕調快慢或強弱、按鈕 1 換內容、按鈕 2 換顏色），
//      而且旋鈕轉到最左畫面還在動（停住會被以為壞掉）
// 有 DURATION 的範例（番茄鐘）另外檢查：按按鈕 1 → 清空、0.5 秒注到九分滿、20 秒漏完、最後只留一顆水滴。
// 用到 audio.band() 的範例（頻譜類）另外注入 70Hz 正弦波（8 段、16 段的最低一段都包含 70Hz）：
//   最低頻那一欄要長到接近滿格、最高頻那一欄幾乎不亮；停掉聲音半秒後要回到沒有麥克風時的畫面。
// 用到 tilt 的範例（重力類）另外用 bp_tilt_set 指定「右邊往下」：畫面的亮度重心要偏右。
const fs = require("fs"), path = require("path");
const { writePng } = require("./png.js");
const { listExamples } = require("../station/catalog.js");
const { loadModule } = require("../station/load_module.js");
const { renderThumb, loopOf } = require("../station/thumb.js");

const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";
const HERE = __dirname;
const SHOT_AT = [0.35, 0.80, 1.25, 1.70, 2.15, 2.60];   // 拼圖取樣時間點（秒）
const RATE = 16000;                                // 與板子 I²S 及瀏覽器重取樣後一致

async function compile(kind, code) {
  const r = await fetch(STATION + "/compile/" + kind,
    { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code });
  if (!r.ok) return { ok: false, log: "error: 編譯站回應 " + r.status };
  return r.json();
}

function firstErrors(log, n = 5) {
  return (log || "").split(/\r?\n/).filter((l) => /error/.test(l)).slice(0, n).join("\n");
}

const lit = (fb, n) => { let c = 0; for (let i = 0; i < n * n; i++) if (fb[i * 3] | fb[i * 3 + 1] | fb[i * 3 + 2]) c++; return c; };
const colLit = (fb, n, x) => { let c = 0; for (let y = 0; y < n; y++) { const s = (y * n + x) * 3; if (fb[s] | fb[s + 1] | fb[s + 2]) c++; } return c; };
// 亮度加權的水平重心，-1（最左）到 1（最右）
const centerX = (fb, n) => {
  let sx = 0, w = 0;
  for (let i = 0; i < n * n; i++) { const v = fb[i * 3] + fb[i * 3 + 1] + fb[i * 3 + 2]; sx += v * (i % n); w += v; }
  return w ? (sx / w) / ((n - 1) / 2) - 1 : 0;
};

const CELL = 112, GAP = 6, MARGIN = 6;             // 拼圖每格 112 px：8×8 放大 14 倍、16×16 放大 7 倍
function montage(rows) {                           // rows[r] = { n, shots: [N*N*3 bytes, ...] }
  const cols = Math.max(...rows.map((r) => r.shots.length));
  const W = MARGIN * 2 + cols * CELL + (cols - 1) * GAP;
  const H = MARGIN * 2 + rows.length * CELL + (rows.length - 1) * GAP;
  const img = Buffer.alloc(W * H * 3, 0x12);       // 深底，格線自然留白
  rows.forEach((row, r) => row.shots.forEach((fb, c) => {
    const n = row.n, scale = CELL / n;
    const ox = MARGIN + c * (CELL + GAP), oy = MARGIN + r * (CELL + GAP);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const s = (((y / scale) | 0) * n + ((x / scale) | 0)) * 3;
      const d = ((oy + y) * W + ox + x) * 3;
      img[d] = fb[s]; img[d + 1] = fb[s + 1]; img[d + 2] = fb[s + 2];
    }
  }));
  return { W, H, img };
}

(async () => {
  const rows = [];
  let bad = 0;
  const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "    ok   " : "    FAIL ") + msg); };

  const ONLY = process.env.BATOPIXEL_EXAMPLE || "";   // 只測名稱含這段字的範例（開發時用，例：BATOPIXEL_EXAMPLE=小綠人）
  for (const N of [8, 16]) for (const ex of listExamples(HERE, N, { official: true })) {
    if (ONLY && !ex.id.includes(ONLY)) continue;
    const code = fs.readFileSync(ex.file, "utf8");
    const loop = loopOf(code), bytes = N * N * 3;
    console.log("\n── " + ex.id + "（" + N + "×" + N + "）──");

    let pv;
    try { pv = await compile("preview", code); } catch (e) {
      console.log("  連不上編譯站 " + STATION + "：" + e.message + "\n  請先啟動 station\\run_station.ps1（或跑 BatoPixel.bat）");
      process.exit(1);
    }
    say(!!pv.ok, "預覽端編譯" + (pv.ok ? "（" + (pv.js.length / 1024).toFixed(0) + "KB）" : "\n" + firstErrors(pv.log)));
    if (!pv.ok) { rows.push({ n: N, shots: SHOT_AT.map(() => Buffer.alloc(bytes)) }); continue; }

    const m = await loadModule(pv.js);
    const got = m._bp_width();
    say(got === N, "程式的 PANEL 是 " + got + "（資料夾 " + N + "×" + N + "）");
    if (got !== N) { rows.push({ n: N, shots: SHOT_AT.map(() => Buffer.alloc(bytes)) }); continue; }
    const ptr = m._bp_framebuffer();
    const read = () => Buffer.from(m.HEAPU8.subarray(ptr, ptr + bytes));

    // 60fps 跑一個循環（至少涵蓋所有取樣點），忠實重現播放器的呼叫節奏
    const ticks = Math.ceil(Math.max(loop, SHOT_AT[SHOT_AT.length - 1]) * 60) + 1;
    const shots = [], counts = [];
    let next = 0, peak = 0, prev = null, changes = 0;
    for (let f = 0; f < ticks; f++) {
      const t = f / 60;
      m._bp_tick(t);
      const fb = read();
      counts.push(lit(fb, N));
      peak = Math.max(peak, ...fb);
      if (prev && !fb.equals(prev)) changes++;
      prev = fb;
      if (next < SHOT_AT.length && t >= SHOT_AT[next]) { shots.push(fb); next++; }
    }
    rows.push({ n: N, shots });

    const litPct = Math.round(100 * counts.filter((c) => c > 0).length / counts.length);
    say(litPct >= 80, "大部分時間有畫面（有亮燈的格數佔 " + litPct + "%，最多亮 " + Math.max(...counts) + " 顆）");
    say(changes >= 5, "畫面會動（一個循環內換了 " + changes + " 次畫面）");
    say(peak >= 60, "亮度有到可見範圍（峰值 " + peak + "）");
    say(m._bp_warn() === 0, "沒有提醒（begin()、show() 都寫對了；提醒代碼 " + m._bp_warn() + "）");

    const sib = ex.file.replace(/\.ino$/i, ".png");
    const fresh = renderThumb(await loadModule(pv.js), code).png;
    say(fs.existsSync(sib) && fs.readFileSync(sib).equals(fresh),
        "縮圖是最新的" + (fs.existsSync(sib) ? "" : "（沒有縮圖）") + "——不是就跑 node examples/build_thumbs.js");

    if (/audio\.band\s*\(/.test(code)) {           // 頻譜類：注入 70Hz，再停掉
      const ref = await loadModule(pv.js);          // 對照組：同一段程式、全程沒有聲音
      for (let f = 0; f < ticks; f++) ref._bp_tick(f / 60);
      const refRead = () => Buffer.from(ref.HEAPU8.subarray(ref._bp_framebuffer(), ref._bp_framebuffer() + bytes));
      const cap = m._bp_audio_capacity(), abuf = m._bp_audio_buffer();
      const ch = new Float32Array(cap);
      m._bp_audio_set_rate(RATE);
      let ph = 0, f = ticks;
      for (let k = 0; k < 30; k++, f++) {
        for (let i = 0; i < cap; i++) { ch[i] = 0.5 * Math.sin(ph); ph += 2 * Math.PI * 70 / RATE; }
        m.HEAPF32.set(ch, abuf >> 2);
        m._bp_audio_commit(cap);
        m._bp_tick(f / 60);
        ref._bp_tick(f / 60);
      }
      const fb = read();
      say(m._bp_audio_level() > 0.2, "注入 70Hz 後 audio.level() 有反應（" + m._bp_audio_level().toFixed(2) + "）");
      say(colLit(fb, N, 0) >= N * 3 / 4, "最低頻那一欄長到接近滿格（" + colLit(fb, N, 0) + "/" + N + "）");
      say(colLit(fb, N, N - 1) <= N / 4, "最高頻那一欄幾乎不亮（" + colLit(fb, N, N - 1) + "/" + N + "），能量沒有亂跑");
      shots[SHOT_AT.length - 1] = fb;               // 最後一格換成「有聲音」的畫面
      for (let k = 0; k < 60; k++, f++) { m._bp_tick(f / 60); ref._bp_tick(f / 60); }
      say(read().equals(refRead()), "停掉聲音一秒後回到沒有麥克風時的畫面");
      console.log("    （註：拼圖最後一格是注入 70Hz 時的畫面，前面是沒有麥克風的畫面）");
    }

    if (/\btilt\./.test(code)) {                   // 重力類：右邊往下 60°，最後半秒的平均重心要偏右
      const tm = await loadModule(pv.js), tp = tm._bp_framebuffer();
      tm._bp_tilt_set(0.866, 0.5);
      let cx = 0;
      for (let f = 0; f < 150; f++) {
        tm._bp_tick(f / 60);
        if (f >= 120) cx += centerX(Buffer.from(tm.HEAPU8.subarray(tp, tp + bytes)), N) / 30;
      }
      say(cx > 0.15, "tilt 指定右邊往下時，畫面重心偏右（" + cx.toFixed(2) + "）");
    }

    {                                               // 旋鈕、兩顆按鈕每個範例都要有作用；旋鈕轉到最左畫面也還在動（停住會被以為壞掉）
      const spectrum = /audio\.band\s*\(/.test(code);
      // 跑到 until 秒，回傳每一格的畫面。press＝1／2：在 1.0 秒按一下那顆按鈕；
      // sound：頻譜類注入小聲的 100Hz（靈敏度旋鈕要有聲音才看得出差別）
      const run = async (knob, press, until, sound) => {
        const mm = await loadModule(pv.js), p = mm._bp_framebuffer();
        const cap = mm._bp_audio_capacity(), abuf = mm._bp_audio_buffer(), ch = new Float32Array(cap);
        mm._bp_audio_set_rate(RATE);
        let ph = 0;
        const frames = [];
        for (let f = 0; f <= until * 60; f++) {
          const down = f === 60;
          mm._bp_input_set(knob, press === 1 && down ? 1 : 0, press === 2 && down ? 1 : 0);
          if (sound) {
            for (let i = 0; i < cap; i++) { ch[i] = 0.02 * Math.sin(ph); ph += 2 * Math.PI * 100 / RATE; }
            mm.HEAPF32.set(ch, abuf >> 2);
            mm._bp_audio_commit(cap);
          }
          mm._bp_tick(f / 60);
          frames.push(Buffer.from(mm.HEAPU8.subarray(p, p + bytes)));
        }
        return frames;
      };
      // 比 1.25～1.5 秒之間幾格：只比一格的話，循環動畫可能剛好播到同一格（例如小綠人慢三倍時剛好也在第 8 格）
      const AT = [75, 80, 85, 90];
      const differs = (a, b) => AT.some((i) => !a[i].equals(b[i]));
      const base = await run(0.5, 0, 1.5, spectrum);
      say(differs(await run(0.5, 1, 1.5, spectrum), base), "按鈕 1 有作用（按下後畫面跟沒按不一樣）");
      say(differs(await run(0.5, 2, 1.5, spectrum), base), "按鈕 2 有作用");
      say(differs(await run(0, 0, 1.5, spectrum), base), "旋鈕有作用（轉到最左跟中間的畫面不一樣）");
      const slow = await run(0, 0, 5, false);
      let moves = 0;
      for (let f = 1; f < slow.length; f++) if (!slow[f].equals(slow[f - 1])) moves++;
      say(moves >= 5, "旋鈕轉到最左畫面還在動（5 秒內換了 " + moves + " 次畫面）");
    }

    if (/\bDURATION\b/.test(code)) {                // 番茄鐘：1.0 秒按按鈕 1 → 清空、0.5 秒注到九分滿、20 秒漏完、閃三下、留一顆水滴
      const hm = await loadModule(pv.js), hp = hm._bp_framebuffer();
      const marks = { cleared: 1.0 + 2 / 60, full: 1.7, half: 11.5, done: 24.5 }, got = {};
      for (let f = 0; f <= 25 * 60; f++) {
        hm._bp_input_set(0.5, f === 60 ? 1 : 0, 0);
        hm._bp_tick(f / 60);
        for (const [k, t] of Object.entries(marks))
          if (f === Math.round(t * 60)) got[k] = lit(Buffer.from(hm.HEAPU8.subarray(hp, hp + bytes)), N);
      }
      const NN = N * N;
      say(got.cleared <= NN * 0.3, "按下按鈕 1：先清空再注水（" + got.cleared + "/" + NN + " 格亮）");
      say(got.full >= NN * 0.8, "0.5 秒內注到九分滿（" + got.full + "/" + NN + "）");
      say(got.half >= NN * 0.3 && got.half <= NN * 0.65, "漏到一半時剩一半左右（" + got.half + "/" + NN + "）");
      say(got.done > 0 && got.done <= NN * 0.1, "漏完後只留一顆會呼吸的水滴（" + got.done + "/" + NN + "）");
    }

    if (/\bSTART_DIGITS\b/.test(code)) {            // 小綠人：1.0 秒按按鈕 1 → 綠燈倒數 10 秒 → 紅燈 10 秒 → 回到綠燈；按鈕 2 換成數字燈
      // 跑到最後一個時間點：b2At＝第幾格按按鈕 2（-1＝不按），1.0 秒按按鈕 1；回傳各時間點的畫面，以及 8.2–15.9 秒每格亮幾顆
      const sim = async (b2At, marks) => {
        const sm = await loadModule(pv.js), sp = sm._bp_framebuffer(), got = { lits: [] };
        const end = Math.round(Math.max(...Object.values(marks)) * 60);
        for (let f = 0; f <= end; f++) {
          sm._bp_input_set(0.5, f === 60 ? 1 : 0, f === b2At ? 1 : 0);
          sm._bp_tick(f / 60);
          const fb = Buffer.from(sm.HEAPU8.subarray(sp, sp + bytes));
          if (f >= 492 && f <= 954) got.lits.push(lit(fb, N));
          for (const [k, t] of Object.entries(marks)) if (f === Math.round(t * 60)) got[k] = fb;
        }
        return got;
      };
      const rg = (fb) => { let r = 0, g = 0; for (let i = 0; i < N * N; i++) { r += fb[i * 3]; g += fb[i * 3 + 1]; } return { r, g }; };
      const cols = (fb) => {                         // 有亮的是哪幾欄
        const s = new Set();
        for (let i = 0; i < N * N; i++) if (fb[i * 3] | fb[i * 3 + 1] | fb[i * 3 + 2]) s.add(i % N);
        return [...s].sort((a, b) => a - b);
      };
      // 1.0 秒按按鈕 1：綠燈 1–16 秒、紅燈 16–21 秒、21 秒起又是綠燈倒數（一直循環）
      const man = await sim(-1, { walk: 4, stop: 17, again: 22 });
      const [w, s, a] = [rg(man.walk), rg(man.stop), rg(man.again)];
      say(w.g > w.r && s.r > s.g * 4 && a.g > a.r, "小綠人燈：按按鈕 1 後綠燈倒數 → 15 秒後小紅人 → 紅燈 5 秒後又是綠燈倒數");
      const dark = man.lits.filter((n) => n === 0).length;
      say(dark > 0 && dark < man.lits.length, "小綠人燈：綠燈最後幾秒會閃（8.2–15.9 秒有 " + dark + "/" + man.lits.length + " 格全暗）");
      const num = await sim(30, { wait: 0.8, ten: 1.5, one: 15.5, red: 17, again: 22 });
      const [wt, ten, red, ag] = [rg(num.wait), rg(num.ten), rg(num.red), rg(num.again)];
      const tens = (fb) => cols(fb).some((x) => x < N / 2) && cols(fb).some((x) => x >= N / 2);   // 左右兩邊都有亮（兩位數）
      say(tens(num.wait) && wt.r > wt.g && wt.g > 0, "數字燈：還沒按按鈕 1 時停在黃色的 15");
      say(tens(num.ten) && ten.r > ten.g && ten.g > 0, "數字燈：綠燈倒數一開始是黃色的兩位數（15）");
      say(cols(num.one).length === 1, "數字燈：倒數到 1 時只亮一直排（十位不亮）");
      say(red.g === 0 && red.r > 0, "數字燈：紅燈倒數是紅色數字");
      say(ag.r > ag.g && ag.g > 0, "數字燈：紅燈之後又是黃色的綠燈倒數");
      const edge = ["wait", "ten", "one", "red", "again"].every((k) => !cols(num[k]).includes(0) && !cols(num[k]).includes(N - 1));
      say(edge, "數字燈：最左、最右兩排都不亮");
      // 數字放在中間：有亮的欄左右對稱（差一欄以內）。「1」只亮一直排、本來就偏右，不算
      const mid = (fb) => { const c = cols(fb); return (c[0] + c[c.length - 1]) / 2; };
      const centers = ["wait", "red", "again"].map((k) => mid(num[k]));
      say(centers.every((m) => Math.abs(m - (N - 1) / 2) <= 1), "數字燈：數字放在中間（中心在第 " + centers.join("、") + " 欄）");
    }

    const fw = await compile("firmware", code);
    say(!!fw.ok, "板子端編譯" + (fw.ok ? "（" + (fw.size ? (fw.size / 1024).toFixed(0) + "KB" : "ok") + "）" : "\n" + firstErrors(fw.log)));
  }

  const { W, H, img } = montage(rows);
  const out = path.join(HERE, "preview.png");
  writePng(out, W, H, img);
  console.log("\n畫面拼圖：" + out + "（" + W + "×" + H + "，每列一個範例，左到右為時間 " +
              SHOT_AT.map((s) => s.toFixed(2) + "s").join("／") + "）");
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）
})();
