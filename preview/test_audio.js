// 聲音分析器數值驗證：node test_audio.js
// 餵入已知頻率的合成正弦波，檢查能量是否落在正確的頻段。
// 這份測試模擬 INMP441 會送來的資料形態（時域波形，-1..1），
// 因此板子到手後可用同一組頻率交叉比對兩端結果。
const createBatoPixel = require("./web/batopixel.js");

const RATE = 16000;           // 與板子及瀏覽器重新取樣後的目標取樣率一致
const CASES = [               // 頻率 → 預期頻段（邊界 60/150/300/550/1000/1800/3200/5500/9000）
  { hz: 100,  band: 0 },
  { hz: 220,  band: 1 },
  { hz: 400,  band: 2 },
  { hz: 750,  band: 3 },
  { hz: 1400, band: 4 },
  { hz: 2500, band: 5 },
  { hz: 4000, band: 6 },
  { hz: 7000, band: 7 },
];

createBatoPixel().then((m) => {
  m._bp_audio_set_rate(RATE);
  const cap = m._bp_audio_capacity();
  const ptr = m._bp_audio_buffer();
  const nBands = m._bp_audio_bands();
  const chunk = new Float32Array(cap);
  let phase = 0, t = 0, pass = 0;

  const feed = (hz, frames) => {
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < cap; i++) {
        chunk[i] = 0.5 * Math.sin(phase);
        phase += 2 * Math.PI * hz / RATE;
      }
      m.HEAPF32.set(chunk, ptr >> 2);
      m._bp_audio_commit(cap);
      m._bp_tick(t);            // 內含 bp_audio_analyze()
      t += 1 / 60;
    }
  };

  console.log("freq    expect  peak  value   bands");
  for (const c of CASES) {
    phase = 0;
    feed(c.hz, 12);             // 餵幾格讓自動增益穩定
    const b = [];
    for (let i = 0; i < nBands; i++) b.push(m._bp_audio_band(i));
    const peak = b.indexOf(Math.max(...b));
    const ok = peak === c.band;
    if (ok) pass++;
    console.log(
      String(c.hz).padStart(5) + "Hz" +
      String(c.band).padStart(7) +
      String(peak).padStart(6) + (ok ? " ok " : " NG ") +
      b[peak].toFixed(2).padStart(6) + "   " +
      b.map((v) => v.toFixed(2)).join(" ")
    );
  }

  // 粉紅噪音：能量隨頻率遞減，最接近真實音樂／人聲的頻譜形狀。
  // 這一項才是「實際使用時八行會不會都亮」的檢驗——線性刻度時只有低音會亮。
  let p0=0,p1=0,p2=0,p3=0,p4=0,p5=0,p6=0;
  const pink = () => {                      // Paul Kellett 粉紅噪音濾波器
    const w = Math.random() * 2 - 1;
    p0 = 0.99886*p0 + w*0.0555179; p1 = 0.99332*p1 + w*0.0750759;
    p2 = 0.96900*p2 + w*0.1538520; p3 = 0.86650*p3 + w*0.3104856;
    p4 = 0.55000*p4 + w*0.5329522; p5 = -0.7616*p5 - w*0.0168980;
    const out = (p0+p1+p2+p3+p4+p5+p6+w*0.5362) * 0.11;
    p6 = w * 0.115926;
    return out;
  };
  for (let f = 0; f < 60; f++) {
    for (let i = 0; i < cap; i++) chunk[i] = pink();
    m.HEAPF32.set(chunk, ptr >> 2);
    m._bp_audio_commit(cap);
    m._bp_tick(t); t += 1 / 60;
  }
  const pinkB = [];
  for (let i = 0; i < nBands; i++) pinkB.push(m._bp_audio_band(i));
  const rows = pinkB.map((v) => Math.round(v * 8));
  const pinkOk = pinkB.every((v) => v > 0.25);
  console.log(String.fromCharCode(10) + "粉紅噪音（近似真實音樂）");
  console.log("  值 =", pinkB.map((v) => v.toFixed(2)).join(" "));
  console.log("  對應行數 =", rows.join(" "), "/ 8", pinkOk ? "ok（八段都看得見）" : "NG（有頻段太低）");

  // 微弱環境噪音（振幅約 0.001，遠低於雜訊閘 0.006）：
  // 這是實際回報的問題——安靜房間時自動增益把底噪放大到整面亮。
  for (let f = 0; f < 90; f++) {
    for (let i = 0; i < cap; i++) chunk[i] = pink() * 0.02;
    m.HEAPF32.set(chunk, ptr >> 2);
    m._bp_audio_commit(cap);
    m._bp_tick(t); t += 1 / 60;
  }
  const faint = [];
  for (let i = 0; i < nBands; i++) faint.push(m._bp_audio_band(i));
  const faintMax = Math.max(...faint);
  const faintLvl = m._bp_audio_level();
  const faintOk = faintMax < 0.25 && faintLvl < 0.4;
  console.log(String.fromCharCode(10) + "微弱環境噪音（安靜房間）");
  console.log("  值 =", faint.map((v) => v.toFixed(2)).join(" "), "音量 =", faintLvl.toFixed(2));
  console.log("  ", faintOk ? "ok（維持暗的，沒被增益放大）" : "NG（噪音被放大）");

  // 靜音時所有頻段應接近 0（驗證雜訊閘與全域增益沒有把噪音放大到滿格）
  phase = 0;
  for (let f = 0; f < 40; f++) {
    chunk.fill(0);
    m.HEAPF32.set(chunk, ptr >> 2);
    m._bp_audio_commit(cap);
    m._bp_tick(t); t += 1 / 60;
  }
  const quiet = [];
  for (let i = 0; i < nBands; i++) quiet.push(m._bp_audio_band(i));
  const quietMax = Math.max(...quiet);
  const quietOk = quietMax < 0.1;
  console.log("\n靜音時最大頻段值 =", quietMax.toFixed(4), quietOk ? "ok" : "NG（應接近 0）");

  // 靈敏度倍率（板子上的旋鈕，照音樂節原型：對數映射 1/16–16，中點 1）：除在雜訊閘上。
  // 同一個音，倍率越大越容易有反應；轉到底等於關閉。預覽沒有旋鈕，平常固定 1。
  const tone = (amp, k) => {
    m._bp_audio_sens(k);
    for (let f = 0; f < 60; f++) {
      for (let i = 0; i < cap; i++) { chunk[i] = amp * Math.sin(phase); phase += 2 * Math.PI * 400 / RATE; }
      m.HEAPF32.set(chunk, ptr >> 2);
      m._bp_audio_commit(cap);
      m._bp_tick(t); t += 1 / 60;
    }
    let mx = 0;
    for (let i = 0; i < nBands; i++) mx = Math.max(mx, m._bp_audio_band(i));
    return mx;
  };
  const SENS = [
    { amp: 0.04,  k: 1,      on: true,  why: "中間位置：一般音量看得到" },
    { amp: 0.04,  k: 0.0625, on: false, why: "轉到底：同樣音量全暗（等於關閉）" },
    { amp: 0.002, k: 1,      on: false, why: "中間位置：很小聲看不到" },
    { amp: 0.002, k: 16,     on: true,  why: "轉到頂：很小聲也看得到" },
  ];
  let sensOk = true;
  console.log("\n靈敏度倍率（旋鈕）");
  for (const s of SENS) {
    const v = tone(s.amp, s.k);
    const ok = s.on ? v > 0.3 : v < 0.05;
    if (!ok) sensOk = false;
    console.log("  振幅 " + String(s.amp).padEnd(6) + "倍率 " + String(s.k).padEnd(7) + "→ 最大頻段 " + v.toFixed(2) + (ok ? " ok  " : " NG  ") + s.why);
  }
  // 漸進：模擬板子（INMP441 的雜訊閘 0.002、滿版參考音量 0.02），用粉紅噪音當音樂，
  // 旋鈕每轉一個八度頻譜都要跟著變，不能只在某個位置突然熄掉或撐滿
  // （2026-10-14 實機回報「怎麼轉變化都不大」：只動雜訊閘時，自動增益會把頻譜撐滿，旋鈕等於開關）
  let pss = 0;
  for (let i = 0; i < 20000; i++) { const v = pink(); pss += v * v; }
  const pinkRms = Math.sqrt(pss / 20000);
  m._bp_audio_scale(0.002, 0.02);
  const pinkMean = (k, rms, frames) => {
    m._bp_audio_sens(k);
    let acc = 0, cnt = 0;
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < cap; i++) chunk[i] = pink() * rms / pinkRms;
      m.HEAPF32.set(chunk, ptr >> 2);
      m._bp_audio_commit(cap);
      m._bp_tick(t); t += 1 / 60;
      if (f >= frames / 2) { let s = 0; for (let b = 0; b < nBands; b++) s += m._bp_audio_band(b); acc += s / nBands; cnt++; }
    }
    return acc / cnt;
  };
  const GRAD = [
    { name: "一般音樂", rms: 0.005, ks: [1, 2, 4] },
    { name: "大聲",     rms: 0.02,  ks: [0.25, 0.5, 1] },
  ];
  for (const g of GRAD) {
    pinkMean(16, g.rms, 1500);                           // 先讓自動增益跟上這個音量（前面測試的大聲峰值約 5 秒才退掉）
    const top = pinkMean(16, g.rms, 120);
    const steps = g.ks.map((k) => ({ k, v: pinkMean(k, g.rms, 120) }));
    const off = pinkMean(0.0625, g.rms, 120);
    let ok = top > 0.8 && off < 0.05;
    for (let i = 1; i < steps.length; i++) if (steps[i].v - steps[i - 1].v < 0.1) ok = false;
    if (!ok) sensOk = false;
    console.log("  板子＋" + g.name + "（rms " + g.rms + "）倍率 " + steps.map((s) => s.k + " → " + s.v.toFixed(2)).join("、") +
                "；轉到頂 " + top.toFixed(2) + "、轉到底 " + off.toFixed(2) +
                (ok ? "  ok  一路跟著變" : "  NG  沒有跟著變（旋鈕等於開關）"));
  }
  m._bp_audio_scale(0.01, 0);                            // 換回預覽的刻度
  m._bp_audio_sens(1);

  const allOk = pass === CASES.length && quietOk && pinkOk && faintOk && sensOk;
  console.log("\n" + pass + "/" + CASES.length + " 頻段對應正確 → " + (allOk ? "PASS" : "FAIL"));
  process.exit(allOk ? 0 : 1);
});
