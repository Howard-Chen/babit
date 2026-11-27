// 音高（audio.pitch()）的驗證：BATOPIXEL_STATION=http://127.0.0.1:8939 node preview/test_pitch.js（需先啟動編譯站）
//
// audio.pitch() 回傳麥克風現在聽到的音高（基頻，Hz）；太小聲或聽不出音高（雜音、沒有聲音）時回傳 0。
// 給「跟著唱的音高動」的作品用：頻譜（audio.band()）一段約半個八度，分不出差一個音。
// 這裡餵合成的聲音（16 kHz，跟板子的麥克風、工具頁重新取樣後一樣），實跑 WASM 核對量到的頻率，並確認板子端也編得過。
const { loadModule } = require("../station/load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";
const RATE = 16000, PER_FRAME = 267;      // 每 1/60 秒大約進來 267 筆取樣

// 第一格的三個顏色＝音高 ×10 拆成三個位元組（核對學員程式讀到的值）；第二格＝同一格問兩次是不是一樣；
// 第三格＝照 AGENTS.md 教的公式換成音名（0 Do、2 Re、4 Mi、5 Fa、7 Sol、9 La、11 Si；聽不出來是 99）
const SKETCH = `
#define PANEL 8
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  float hz = audio.pitch();
  long p = (long)(hz * 10 + 0.5f);
  clear();
  dot(0, 0, rgb((p >> 16) & 255, (p >> 8) & 255, p & 255));
  dot(1, 0, rgb(audio.pitch() == hz ? 1 : 0, hz > 0 ? 1 : 0, 0));
  int n = (int)roundf(12 * log2f(hz / 261.63f));
  dot(2, 0, rgb(hz > 0 ? ((n % 12) + 12) % 12 : 99, 0, 0));
  show();
}
`;

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const errors = (log) => (log || "").split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 6).join("\n");
async function compile(kind, code) {
  const r = await fetch(STATION + "/compile/" + kind,
    { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code });
  return r.json();
}
const cents = (a, b) => 1200 * Math.log2(a / b);

(async () => {
  let j;
  try { j = await compile("preview", SKETCH); }
  catch (e) { console.log("連不上編譯站 " + STATION + "：" + e.message); process.exitCode = 1; return; }
  if (!j.ok) {
    console.log("預覽編譯失敗：\n" + (j.log || "").split(/\r?\n/).slice(0, 14).join("\n"));
    console.log("\n1 項不符 → FAIL");
    process.exitCode = 1;
    return;
  }

  // 每個測試用一個新的模組（自動增益、環形緩衝都從頭開始）。wave(第幾筆取樣) 回傳 -1～1
  const session = async (rate = RATE) => {
    const m = await loadModule(j.js);
    m._bp_audio_set_rate(rate);
    const ptr = m._bp_audio_buffer(), fb = m._bp_framebuffer();
    let n = 0, frame = 0;
    const chunk = new Float32Array(PER_FRAME);
    const run = (wave, frames) => {
      for (let f = 0; f < frames; f++) {
        if (wave) {
          for (let i = 0; i < PER_FRAME; i++) chunk[i] = wave(n++);
          m.HEAPF32.set(chunk, ptr >> 2);
          m._bp_audio_commit(PER_FRAME);
        }
        m._bp_tick(++frame / 60);
      }
    };
    const px = (i) => Array.from(m.HEAPU8.subarray(fb + i * 3, fb + i * 3 + 3));
    const sketchHz = () => { const [a, b, c] = px(0); return ((a << 16) | (b << 8) | c) / 10; };
    const hz = () => (typeof m._bp_audio_pitch === "function" ? m._bp_audio_pitch() : NaN);
    return { m, run, px, sketchHz, hz };
  };
  const sine = (f, amp = 0.3) => (i) => amp * Math.sin(2 * Math.PI * f * i / RATE);
  // 像人聲、樂器的聲音：基音加上一串泛音（amps[k] 是第 k+1 個泛音的大小）
  const voice = (f, amps, amp = 0.3) => (i) => { let s = 0; amps.forEach((a, k) => { s += a * Math.sin(2 * Math.PI * f * (k + 1) * i / RATE + k * 0.7); });
    return amp * s / amps.reduce((x, y) => x + Math.abs(y), 0); };
  let seed = 12345;
  const noise = (amp = 0.3) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return amp * (seed / 0x3fffffff - 1); };

  console.log("── 單一個音（正弦波）");
  for (const f of [82.41, 110, 196, 261.63, 440, 523.25, 698.46, 880]) {
    const s = await session();
    s.run(sine(f), 12);
    const got = s.hz(), off = cents(got, f);
    say(Math.abs(off) < 20, `${f} Hz → ${Number(got).toFixed(1)} Hz（差 ${Number(off).toFixed(1)} 音分；一個半音是 100）`);
  }
  {
    const s = await session();
    s.run(sine(440), 12);
    const a = s.hz(), viaSketch = s.sketchHz();
    say(Math.abs(viaSketch - a) <= 0.06 && s.px(1)[0] === 1 && s.px(1)[1] === 1, `學員程式的 audio.pitch() 讀到同一個值（${viaSketch}），同一格問兩次答案一樣`);
    s.run(sine(466.16), 12);
    const b = s.hz();
    say(Math.abs(cents(b, a) - 100) < 25, `換成高一個半音（466.16 Hz）：跟著變，分得出差一個音（${a.toFixed(1)} → ${b.toFixed(1)}，差 ${cents(b, a).toFixed(0)} 音分）`);
  }

  {
    // 說明書教的公式：int n = (int)roundf(12 * log2f(hz / 261.63f)); 音名＝((n % 12) + 12) % 12
    const s = await session(), names = [];
    const cases = [[261.63, 0, "中央 Do"], [293.66, 2, "Re"], [329.63, 4, "Mi"], [349.23, 5, "Fa"], [392, 7, "Sol"], [440, 9, "La"], [493.88, 11, "Si"],
                   [523.25, 0, "高八度的 Do"], [130.81, 0, "低八度的 Do"], [220, 9, "低八度的 La"], [450, 9, "唱得偏高一點的 La"]];
    for (const [f] of cases) { s.run(sine(f), 12); names.push(s.px(2)[0]); }
    s.run(() => 0, 12);
    say(names.join() === cases.map((c) => c[1]).join() && s.px(2)[0] === 99,
        "說明書教的「頻率換音名」公式：" + cases.map((c, i) => c[2] + "→" + names[i]).join("、") + "；聽不出來時程式自己判斷（hz 是 0）");
  }

  console.log("── 有泛音的聲音（人聲、樂器）：量到的是基音，不是泛音");
  for (const [name, f, amps] of [["泛音一個比一個小", 220, [1, 0.5, 0.33, 0.25, 0.2]], ["第二個泛音比基音大", 196, [0.4, 1, 0.5, 0.3]],
                                 ["基音很弱", 146.83, [0.15, 0.8, 1, 0.6, 0.3]], ["高一點的音", 587.33, [1, 0.6, 0.3]]]) {
    const s = await session();
    s.run(voice(f, amps), 12);
    const got = s.hz(), off = cents(got, f);
    say(Math.abs(off) < 20, `${name}（基音 ${f} Hz）→ ${Number(got).toFixed(1)} Hz（差 ${Number(off).toFixed(1)} 音分）`);
  }
  {
    // 滑音：從 200 Hz 慢慢滑到 400 Hz，量到的要跟著上去、每一格都接近當下的頻率
    const s = await session();
    let ph = 0, worst = 0, okFrames = 0, frames = 0;
    for (let f = 0; f < 120; f++) {
      const from = 200 * Math.pow(2, f / 120), to = 200 * Math.pow(2, (f + 1) / 120);
      let k = 0;
      s.run(() => { const hzNow = from + (to - from) * (k++ / PER_FRAME); ph += 2 * Math.PI * hzNow / RATE; return 0.3 * Math.sin(ph); }, 1);
      if (f < 10) continue;
      frames++;
      const got = s.hz(), off = got > 0 ? Math.abs(cents(got, from)) : 9999;
      if (off < 100) okFrames++;
      if (off < 9999) worst = Math.max(worst, off);
    }
    say(okFrames === frames, `滑音 200 → 400 Hz：${okFrames}/${frames} 格跟得上（最多差 ${worst.toFixed(0)} 音分；量的是最近 32 毫秒，會慢一點點）`);
  }

  console.log("── 聽不出音高的時候回傳 0");
  {
    const s = await session();
    s.run(null, 3);
    say(s.hz() === 0 && s.sketchHz() === 0, "沒有聲音進來（沒開麥克風）：0");
    s.run(() => 0, 12);
    say(s.hz() === 0, "有收音但完全安靜：0");
    s.run(sine(440, 0.004), 12);
    say(s.hz() === 0, "太小聲（比雜訊閘還小）：0（" + s.hz() + "）");
    s.run(sine(440), 12);
    say(s.hz() > 400, "變大聲就量得到（" + s.hz().toFixed(1) + " Hz）");
    s.run(null, 40);
    say(s.hz() === 0, "聲音停了半秒以上（關掉麥克風）：回到 0（" + s.hz() + "）");
  }
  {
    const s = await session();
    let zero = 0;
    const N = 120, gen = noise();
    for (let f = 0; f < N; f++) { s.run(gen, 1); if (f >= 10 && s.hz() === 0) zero++; }
    say(zero >= (N - 10) * 0.95, `雜音（沒有音高的聲音，像風聲、氣音）：${zero}/${N - 10} 格是 0`);
  }
  {
    // 拍一下手：很短的一聲雜音，前後安靜
    const s = await session();
    const gen = noise(0.6);
    let got = 0;
    s.run(() => 0, 6);
    for (let f = 0; f < 12; f++) { s.run(f < 2 ? gen : () => 0, 1); if (s.hz() > 0) got++; }
    say(got === 0, "拍手（很短的一聲）：不會被當成一個音（" + got + " 格有值）");
  }

  console.log("── 範圍：大約 70～2000 Hz（人聲、口哨、直笛）；再高的音量成低八度，音名還是對的");
  {
    const s = await session();
    s.run(sine(73.42), 12);
    say(Math.abs(cents(s.hz(), 73.42)) < 25, "很低的音（73.42 Hz，男低音的 D2）：" + s.hz().toFixed(1) + " Hz");
    for (const f of [987.77, 1318.51, 1760, 1975.53]) {
      s.run(sine(f), 12);
      say(Math.abs(cents(s.hz(), f)) < 25, `高音（${f} Hz，口哨、直笛的範圍）：${s.hz().toFixed(1)} Hz（差 ${cents(s.hz(), f).toFixed(1)} 音分）`);
    }
    for (const f of [2500, 3000, 3520]) {
      s.run(sine(f), 12);
      const got = s.hz(), oct = got > 0 ? Math.round(cents(f, got) / 1200) : 0, off = got > 0 ? cents(f, got) - oct * 1200 : 9999;
      say(got > 0 && got <= 2100 && oct >= 1 && Math.abs(off) < 30, `超過 2000 Hz（${f} Hz）：量成低 ${oct} 個八度的 ${got.toFixed(1)} Hz，音名一樣（差 ${Number(off).toFixed(1)} 音分）`);
    }
  }
  {
    // 上限拉高之後，泛音很強的人聲不能被量成泛音
    const s = await session();
    s.run(voice(330, [0.5, 1, 0.9, 0.8, 0.4]), 12);
    say(Math.abs(cents(s.hz(), 330)) < 20, "泛音（660、990、1320 Hz）都比基音大的 330 Hz：還是量到基音（" + s.hz().toFixed(1) + " Hz）");
    s.run(voice(523.25, [0.6, 1, 0.7]), 12);
    say(Math.abs(cents(s.hz(), 523.25)) < 20, "第二個泛音（1046 Hz）比基音大的 523 Hz：還是量到基音（" + s.hz().toFixed(1) + " Hz）");
  }

  console.log("── 板子端");
  const f = await compile("firmware", SKETCH);
  say(f.ok, "板子端編譯" + (f.ok ? "" : "：\n" + errors(f.log)));
  const f16 = await compile("firmware", SKETCH.replace("#define PANEL 8", "#define PANEL 16"));
  say(f16.ok, "板子端編譯（16×16）" + (f16.ok ? "" : "：\n" + errors(f16.log)));

  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部通過 → PASS"));
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗
})();
