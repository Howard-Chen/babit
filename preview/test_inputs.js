// 旋鈕、按鈕、亮度、麥克風靈敏度的驗證：node preview/test_inputs.js（需先啟動編譯站）
//
// 板子上的旋鈕與兩顆按鈕交給學員程式決定用途（knob.value()、button1／button2 的 pressed()／clicked()），
// 函式庫不會自己拿來做事；亮度 brightness(k) 與麥克風靈敏度 audio.sensitivity(k) 也由程式設定。
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
