// 旋鈕、按鈕、亮度、麥克風靈敏度的驗證：node preview/test_inputs.js（需先啟動編譯站）
//
// 板子上的旋鈕與按鈕交給學員程式決定用途（knob.value()、button1／button2 的 pressed()／clicked()），
// 函式庫不會自己拿來做事；亮度 brightness(k) 與麥克風靈敏度 audio.sensitivity(k) 也由程式設定。
// （這裡測按鈕 1、2；第三版板子多的按鈕 3、4 與蜂鳴器在 test_buttons_buzzer.js）
// 預覽沒有硬體：工具頁的旋鈕滑桿與按鈕經 bp_input_set（wrapper 匯出）傳進來。這裡直接呼叫它、實跑 WASM 逐項比對。
const { loadModule } = require("../station/load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

const SKETCH = `
#define PANEL 8
#include "BatoPixel.h"

int clicks1 = 0, clicks2 = 0;

void setup() {
  begin();
}

void loop() {
  if (button1.clicked()) clicks1++;
  if (button2.clicked()) clicks2++;
  clear();
  dot(0, 0, rgb(knob.value() * 200, button1.pressed() ? 1 : 0, button2.pressed() ? 1 : 0));
  dot(1, 0, rgb(clicks1, clicks2, button1.clicked() ? 1 : 0));
  brightness(knob.value());
  audio.sensitivity(knob.value());
  show();
}
`;
// 用迴圈等按鈕：同一格裡按鈕不會變，跟等聲音、傾斜一樣，預覽要停下並說明
const WAITING = `
#define PANEL 8
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  while (!button1.clicked()) {
    fade(0.9f);
  }
  show();
}
`;

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const near = (a, b) => Math.abs(a - b) < 1e-3;

async function compile(kind, code) {
  const r = await fetch(STATION + "/compile/" + kind,
    { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code });
  return r.json();
}

(async () => {
  let j;
  try { j = await compile("preview", SKETCH); }
  catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message);
    process.exitCode = 1;
    return;
  }
  if (!j.ok) {
    console.log("預覽編譯失敗：\n" + (j.log || "").split(/\r?\n/).slice(0, 12).join("\n"));
    process.exitCode = 1;
    return;
  }
  const m = await loadModule(j.js);
  const ptr = m._bp_framebuffer();
  const px = (i) => Array.from(m.HEAPU8.subarray(ptr + i * 3, ptr + i * 3 + 3));
  let t = 0;
  const tick = () => { t += 1 / 60; m._bp_tick(t); };

  say(near(m._bp_brightness(), 0.6), "亮度預設 60%（沒呼叫 brightness() 時跟以前一樣）：" + m._bp_brightness().toFixed(3));
  tick();
  say(px(0)[0] === 100, "旋鈕預設在中間：knob.value() = 0.5（畫成 " + px(0)[0] + "）");
  say(px(0)[1] === 0 && px(0)[2] === 0 && px(1)[0] === 0 && px(1)[1] === 0, "沒按按鈕：pressed() 與 clicked() 都是 false");
  say(near(m._bp_sensitivity(), 1.0), "audio.sensitivity(0.5)＝靈敏度 x1（旋鈕在中間跟以前一樣）：x" + m._bp_sensitivity().toFixed(3));

  m._bp_input_set(0.25, 1, 0); tick();
  say(px(0)[0] === 50, "旋鈕轉到 1/4：knob.value() = 0.25（畫成 " + px(0)[0] + "）");
  say(px(0)[1] === 1 && px(1)[0] === 1 && px(1)[2] === 1, "按下按鈕 1：pressed() 是 true，這一格 clicked() 是 true（點擊 " + px(1)[0] + " 次）");
  say(near(m._bp_brightness(), 0.25), "brightness(knob.value())：亮度跟著旋鈕 " + m._bp_brightness().toFixed(3));
  say(near(m._bp_sensitivity(), 0.25), "audio.sensitivity(0.25)：靈敏度 x0.25（對數刻度，0＝最不靈敏、1＝最靈敏）：x" + m._bp_sensitivity().toFixed(3));

  tick();
  say(px(0)[1] === 1 && px(1)[0] === 1 && px(1)[2] === 0, "按著不放：pressed() 還是 true，clicked() 只在按下那一格是 true");

  m._bp_input_set(0.25, 0, 1); tick();
  say(px(0)[1] === 0 && px(0)[2] === 1 && px(1)[1] === 1, "放開 1、按下 2：兩顆按鈕各自分開算");

  m._bp_input_set(0.25, 1, 0); tick();
  say(px(1)[0] === 2, "再按一次按鈕 1：點擊次數變 2（得 " + px(1)[0] + "）");
  say(m._bp_warn() === 0, "沒有提醒（begin()、show() 都有寫）：提醒代碼 " + m._bp_warn());

  // 燈條實際亮度（0–255，板子用的 bp_led_bri）：接 PD＝亮度 × 160；接電腦＝亮度 × 20，
  // 但程式自己調暗（比預設 0.6 暗）時不跟著壓那麼暗：最少是預設接電腦時的 12，也不會比接 PD 時亮
  const want = [[0.6, 1, 96], [1, 1, 160], [0.24, 1, 38], [0.12, 1, 19],
                [0.6, 0, 12], [1, 0, 20], [0.8, 0, 16], [0.24, 0, 12], [0.12, 0, 12], [0.05, 0, 8], [0, 0, 0]];
  const lv = (k, pd) => (typeof m._bp_led_level === "function" ? m._bp_led_level(k, pd) : NaN);
  const got = want.map(([k, pd]) => lv(k, pd));
  say(want.every(([, , v], i) => got[i] === v),
      "燈條亮度：" + want.map(([k, pd, v], i) => `${k}${pd ? " PD" : " 接電腦"}＝${got[i]}${got[i] === v ? "" : "（應為 " + v + "）"}`).join("、"));

  // 電流估算與限流（板子的 bp_show 每格用；預覽不限流，這裡直接呼叫 wrapper 匯出的函式）。
  // 照 2026-11-12 電流表實測：16×16（2020 燈珠）每色全亮 6.5 mA、全滅時整台（含 ESP32）130 mA；
  // 8×8（5050 燈珠）每色全亮 13.5 mA、全滅時整台 60 mA。上限是整台的電流，兩種燈板一樣：接電腦 450、充電器 1500
  // （所有燈板壓在 1.5 A 以內：16×16 全白 2.2 A 停 20 秒燈板太燙）。
  // sum＝這格所有燈的 r＋g＋b，bri＝燈條亮度（0–255）
  const fn = (mod, name) => (typeof mod["_" + name] === "function" ? mod["_" + name] : () => NaN);
  const curMa = (mod, sum, bri) => fn(mod, "bp_current_ma")(sum, bri);
  const capMa = (mod, pd) => fn(mod, "bp_current_limit")(pd);
  const scaleK = (mod, est, pd) => fn(mod, "bp_current_k")(est, pd);
  const limited = (mod, sum, bri, pd) => {     // 限流後的電流：底數不動，其餘等比調暗
    const base = curMa(mod, 0, bri), est = curMa(mod, sum, bri);
    return base + (est - base) * scaleK(mod, est, pd);
  };
  const r0 = (x) => Math.round(x);
  const WHITE = 765;                            // 一顆全白的 r＋g＋b
  const j16 = await compile("preview", SKETCH.replace("#define PANEL 8", "#define PANEL 16"));
  if (!j16.ok) say(false, "16×16 預覽編譯失敗：\n" + (j16.log || "").split(/\r?\n/).slice(0, 8).join("\n"));
  else {
    const m16 = await loadModule(j16.js);
    const off = r0(curMa(m16, 0, 96)), w16 = r0(curMa(m16, 256 * WHITE, 16)), chk = r0(curMa(m16, 128 * WHITE, 38));
    say(off === 130 && w16 === 443 && chk === 502,
        `16×16 估算對得上電流表：全滅 ${off}（實測 130）、全白亮度 16 ${w16}（實測 450）、半面全白亮度 38 ${chk}（實測 500）`);
    say(capMa(m16, 1) === 1500 && capMa(m16, 0) === 450,
        `16×16 上限是整台的電流：充電器 ${capMa(m16, 1)}、接電腦 ${capMa(m16, 0)} mA（應為 1500、450）`);
    const pdFull = r0(limited(m16, 256 * WHITE, 160, 1)), pdHalf = r0(limited(m16, 256 * WHITE, 80, 1));
    const usbFull = r0(limited(m16, 256 * WHITE, 20, 0));
    say(pdFull === 1500 && pdHalf === 1500 && usbFull === 450 && scaleK(m16, curMa(m16, 256 * WHITE, 40), 1) === 1,
        `16×16 限流：全白 1.0、0.5 充電器壓到 ${pdFull}、${pdHalf}，接電腦全白 1.0 壓到 ${usbFull} mA；沒超過上限的畫面（全白 0.25）不調暗`);
  }
  const off8 = r0(curMa(m, 0, 96)), w8 = r0(curMa(m, 64 * WHITE, 16));
  const red8 = r0(curMa(m, 64 * 255, 160)), chk8 = r0(curMa(m, 32 * WHITE, 96));
  say(off8 === 60 && w8 === 223 && red8 === 602 && chk8 === 548,
      `8×8 估算對得上電流表：全滅 ${off8}（實測 60）、全白亮度 16 ${w8}（實測 220）、單色亮度 160 ${red8}（實測 610）、半面全白亮度 96 ${chk8}（實測 530）`);
  say(capMa(m, 1) === 1500 && capMa(m, 0) === 450,
      `8×8 上限是整台的電流：充電器 ${capMa(m, 1)}、接電腦 ${capMa(m, 0)} mA（應為 1500、450）`);
  const pd8 = r0(limited(m, 64 * WHITE, 160, 1));
  say(pd8 === 1500 && scaleK(m, curMa(m, 64 * WHITE, 20), 0) === 1 && scaleK(m, curMa(m, 64 * WHITE, 80), 1) === 1,
      `8×8 限流：全白 1.0 充電器壓到 ${pd8} mA；全白 0.5 充電器、全白 1.0 接電腦都不會超過上限`);

  // 用迴圈等按鈕：預覽中止這一格
  const w = await compile("preview", WAITING);
  if (!w.ok) say(false, "等按鈕的程式應該編得過（預覽執行時才停下）");
  else {
    const mw = await loadModule(w.js);
    let stuck = "";
    try { mw._bp_tick(0.1); } catch (e) { stuck = String(e && e.message || e); }
    say(/babit-stuck-3/.test(stuck), "用迴圈等按鈕：預覽中止這一格（" + (stuck || "沒有停下") + "）");
  }

  // 板子端也要編得過
  const f = await compile("firmware", SKETCH);
  say(f.ok, "板子端編譯（旋鈕、按鈕、亮度、靈敏度）" + (f.ok ? "" : "：\n" + (f.log || "").split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 6).join("\n")));

  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部通過 → PASS"));
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗
})();
