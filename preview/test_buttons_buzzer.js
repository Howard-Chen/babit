// 四顆按鈕與蜂鳴器的驗證：BATOPIXEL_STATION=http://127.0.0.1:8939 node preview/test_buttons_buzzer.js（需先啟動編譯站）
//
// 第三版的板子（2026-11 改版）多了按鈕 3、4 與一顆蜂鳴器：button3／button4 跟 button1／button2 用法一樣；
// 蜂鳴器用 buzzer.tone(頻率)、buzzer.beep(頻率, 秒)、buzzer.off()、buzzer.playing()、buzzer.ready()。
// 預覽沒有硬體：工具頁的按鈕經 bp_input_set 傳進來，蜂鳴器現在的頻率由 bp_buzzer_hz 給工具頁（工具頁用喇叭發聲）。
// 這裡實跑 WASM 逐格比對，並確認板子端也編得過、腳位跟 PCB 的接線表一樣。
const { loadModule } = require("../station/load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

// 按鈕 1＝嗶 0.1 秒、按鈕 2＝一直響、按鈕 3＝停、按鈕 4＝休息 0.1 秒（不出聲，但還算「在播」）
// 旋鈕轉到最右那一格：嗶完緊接著改成一直響（確認 tone() 會取消 beep() 的計時）
const SKETCH = `
#define PANEL 8
#include "BatoPixel.h"

int clicks[4] = {0, 0, 0, 0};
bool chained = false;

void setup() {
  begin();
}

void loop() {
  if (button1.clicked()) { clicks[0]++; buzzer.beep(1000, 0.1); }
  if (button2.clicked()) { clicks[1]++; buzzer.tone(440); }
  if (button3.clicked()) { clicks[2]++; buzzer.off(); }
  if (button4.clicked()) { clicks[3]++; buzzer.beep(0, 0.1); }
  if (knob.value() > 0.9f && !chained) { chained = true; buzzer.beep(2000, 0.1); buzzer.tone(NOTE_A5); }
  if (knob.value() < 0.1f) buzzer.tone(99999);
  clear();
  dot(0, 0, rgb(buzzer.playing() ? 1 : 0, buzzer.ready() ? 1 : 0, 0));
  dot(1, 0, rgb(clicks[0], clicks[1], clicks[2]));
  dot(2, 0, rgb(clicks[3], button3.pressed() ? 1 : 0, button4.pressed() ? 1 : 0));
  dot(3, 0, rgb(NOTE_A4 == 440 ? 1 : 0, NOTE_C4 == 262 ? 1 : 0, NOTE_C8 == 4186 ? 1 : 0));
  dot(4, 0, rgb(NOTE_CS5 == 554 ? 1 : 0, NOTE_B7 == 3951 ? 1 : 0, button1.pressed() ? 1 : 0));
  show();
}
`;
// 用迴圈等蜂鳴器響完：同一格裡它的狀態不會變，跟等按鈕一樣，預覽要停下並說明
const WAITING = `
#define PANEL 8
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  buzzer.beep(880, 0.2);
  while (buzzer.playing()) {
    fade(0.9f);
  }
  show();
}
`;
// Arduino 內建的 tone()／noTone() 不能用：板子上那是核心自己的一套（另一個工作、自己的佇列、自己接腳位），
// 跟 buzzer 混用會停不下來或叫不響，腳位寫錯還會把麥克風、燈板的腳搶走——預覽卻看不出來。兩端都在編譯時用中文擋下。
// 編譯站在編譯前就會先擋（第幾行、怎麼改，見 test_sketch_prep.js）；這裡用巨集繞過那一關，確認函式庫自己也擋得住
// （學員把匯出的資料夾拿到 Arduino IDE 編的時候只有函式庫這一關）
const ARDUINO_TONE = `
#define PANEL 8
#include "BatoPixel.h"
#define RING tone

void setup() {
  begin();
}

void loop() {
  if (button1.clicked()) RING(10, 660, 100);
  show();
}
`;
const ARDUINO_NOTONE = ARDUINO_TONE.replace("#define RING tone", "#define RING noTone").replace("RING(10, 660, 100)", "RING(10)");
// 自己的變數、函式的參數叫 tone 不受影響（函式庫只擋單獨呼叫的 tone(…)）；buzzer.tone() 照常
const TONE_NAME = `
#define PANEL 8
#include "BatoPixel.h"

float pick(float tone) { return tone * 2; }

void setup() {
  begin();
}

void loop() {
  float tone = 440;
  if (button1.pressed()) buzzer.tone(pick(tone));
  else if (button2.clicked()) buzzer.beep(tone, 0.1f);
  show();
}
`;
// 邊界：頻率太低（板子的硬體設不出 40 Hz 以下）、秒數不是數字、把毫秒當成秒
const EDGE = `
#define PANEL 8
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  if (button1.clicked()) buzzer.tone(25);
  if (button2.clicked()) buzzer.beep(1000, sqrtf(-1.0f));
  if (button3.clicked()) buzzer.beep(1000, 200);
  if (button4.clicked()) buzzer.off();
  if (knob.value() > 0.9f) buzzer.beep(1000, 10);
  show();
}
`;
// 第一版的板子有 C 接口（GPIO4），新版那支腳是按鈕 4：舊程式寫 PORT C 還是要編得過（那時候按鈕 4 停用）
const PORT_C = SKETCH.replace("#define PANEL 8", "#define PANEL 8\n#define PORT C");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const errors = (log) => (log || "").split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 6).join("\n");

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
    console.log("預覽編譯失敗：\n" + (j.log || "").split(/\r?\n/).slice(0, 14).join("\n"));
    console.log("\n1 項不符 → FAIL");
    process.exitCode = 1;
    return;
  }
  const m = await loadModule(j.js);
  const ptr = m._bp_framebuffer();
  const px = (i) => Array.from(m.HEAPU8.subarray(ptr + i * 3, ptr + i * 3 + 3));
  const hz = () => (typeof m._bp_buzzer_hz === "function" ? m._bp_buzzer_hz() : NaN);
  let frame = 0;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { frame++; m._bp_tick(frame / 60); } };
  const set = (k, b1, b2, b3, b4) => m._bp_input_set(k, b1, b2, b3, b4);

  console.log("── 四顆按鈕");
  tick();
  say(px(1).join() === "0,0,0" && px(2).join() === "0,0,0", "沒按：四顆的 pressed()、clicked() 都是 false");
  set(0.5, 0, 0, 1, 0); tick();
  say(px(1)[2] === 1 && px(2)[1] === 1 && px(2)[2] === 0, "按下按鈕 3：button3.pressed() 是 true、這一格 clicked()（點擊 " + px(1)[2] + " 次），按鈕 4 沒動");
  tick();
  say(px(1)[2] === 1 && px(2)[1] === 1, "按著不放：clicked() 只算一次");
  set(0.5, 0, 0, 0, 1); tick();
  say(px(2)[0] === 1 && px(2)[1] === 0 && px(2)[2] === 1, "放開 3、按下 4：button4 各自分開算（點擊 " + px(2)[0] + " 次）");
  set(0.5, 0, 0, 0, 0); tick();
  m._bp_input_set(0.5, 1, 0); tick();
  say(px(4)[2] === 1 && px(2)[1] === 0 && px(2)[2] === 0, "只給三個參數的舊呼叫法（旋鈕、按鈕 1、2）照樣可以：按鈕 3、4 當成沒按");
  set(0.5, 0, 0, 0, 0); tick(12);               // 剛剛按鈕 1 觸發的那一聲嗶完

  console.log("── 蜂鳴器");
  say(px(0)[1] === 1, "buzzer.ready()：預覽一律當成有蜂鳴器");
  say(hz() === 0 && px(0)[0] === 0, "沒叫它響：頻率 0、playing() 是 false（" + hz() + "）");
  set(0.5, 1, 0, 0, 0); tick();
  say(hz() === 1000 && px(0)[0] === 1, "buzzer.beep(1000, 0.1)：開始響 1000 Hz、playing() 是 true（" + hz() + "）");
  set(0.5, 0, 0, 0, 0); tick(4);
  say(hz() === 1000, "0.1 秒還沒到（過了 4 格）：還在響（" + hz() + "）");
  tick(3);
  say(hz() === 0 && px(0)[0] === 0, "過了 0.1 秒：自己停下來、playing() 變回 false（" + hz() + "）");

  set(0.5, 0, 1, 0, 0); tick(); set(0.5, 0, 0, 0, 0); tick(60);
  say(hz() === 440 && px(0)[0] === 1, "buzzer.tone(440)：一直響到叫它停（過了 1 秒還是 " + hz() + "）");
  set(0.5, 0, 0, 1, 0); tick();
  say(hz() === 0 && px(0)[0] === 0, "buzzer.off()：停下來");
  set(0.5, 0, 0, 0, 0); tick();

  set(0.5, 0, 0, 0, 1); tick();
  say(hz() === 0 && px(0)[0] === 1, "buzzer.beep(0, 0.1)＝休息：不出聲，但 playing() 是 true（譜裡的休止符）");
  set(0.5, 0, 0, 0, 0); tick(7);
  say(px(0)[0] === 0, "休息完 playing() 變回 false");

  set(0.95, 0, 0, 0, 0); tick(); set(0.5, 0, 0, 0, 0); tick(30);
  say(hz() === 880, "beep() 之後馬上 tone()：照最後一次的來，不會被前一次的計時停掉（NOTE_A5＝" + hz() + "）");
  set(0.5, 0, 0, 1, 0); tick(); set(0.5, 0, 0, 0, 0); tick();
  set(0.05, 0, 0, 0, 0); tick();
  say(hz() === 20000, "頻率太高：壓在 20000 Hz（" + hz() + "）");
  set(0.5, 0, 0, 1, 0); tick();
  say(px(3).join() === "1,1,1" && px(4)[0] === 1 && px(4)[1] === 1, "音名常數跟 Arduino 的 pitches.h 一樣：NOTE_A4＝440、NOTE_C4＝262、NOTE_C8＝4186、NOTE_CS5＝554、NOTE_B7＝3951");
  say(m._bp_warn() === 0, "沒有提醒（begin()、show() 都有寫）：提醒代碼 " + m._bp_warn());

  console.log("── 腳位（要跟 PCB 的接線表一樣：E:\\kicad\\babit\\tools\\check_netlist.py）");
  const pin = (i) => (typeof m._bp_board_pin === "function" ? m._bp_board_pin(i) : NaN);
  const pins = [0, 1, 2, 3, 4].map(pin);
  say(pins.join() === "8,9,44,4,10", "按鈕 1–4＝GPIO " + pins.slice(0, 4).join("、") + "；蜂鳴器＝GPIO " + pins[4] + "（應為 8、9、44、4；10）");

  console.log("── 用迴圈等蜂鳴器響完：預覽中止這一格");
  const w = await compile("preview", WAITING);
  if (!w.ok) say(false, "等蜂鳴器的程式應該編得過（預覽執行時才停下）：" + errors(w.log));
  else {
    const mw = await loadModule(w.js);
    let stuck = "";
    try { mw._bp_tick(0.1); } catch (e) { stuck = String(e && e.message || e); }
    say(/babit-stuck-3/.test(stuck), "while (buzzer.playing()) 這種寫法：預覽停下（" + (stuck || "沒有停下") + "）");
  }

  console.log("── Arduino 內建的 tone()／noTone()：兩端都在編譯時擋下，說明改用 buzzer");
  const hint = (log) => ((log || "").split(/\r?\n/).find((l) => /buzzer\.beep/.test(l)) || "").trim().slice(0, 140);
  for (const [what, code] of [["tone()", ARDUINO_TONE], ["noTone()", ARDUINO_NOTONE]]) {
    const tp = await compile("preview", code), tf = await compile("firmware", code);
    say(!tp.ok && /蜂鳴器.*buzzer\.beep\(/.test(tp.log || ""), `${what}：預覽編譯失敗，訊息說明改用 buzzer（${hint(tp.log) || "沒有說明"}）`);
    say(!tf.ok && /蜂鳴器.*buzzer\.beep\(/.test(tf.log || ""), `${what}：板子端也一樣擋下（${hint(tf.log) || "沒有說明"}）`);
  }
  const np = await compile("preview", TONE_NAME), nf = await compile("firmware", TONE_NAME);
  say(np.ok && nf.ok, "自己的變數、參數叫 tone，以及 buzzer.tone()：兩端照樣編得過" + (np.ok && nf.ok ? "" : "：\n" + errors(np.ok ? nf.log : np.log)));
  if (np.ok) {
    const mn = await loadModule(np.js);
    mn._bp_tick(1 / 60); mn._bp_input_set(0.5, 1, 0, 0, 0); mn._bp_tick(2 / 60);
    say(mn._bp_buzzer_hz() === 880, "……而且照樣會響（buzzer.tone(pick(440))＝" + mn._bp_buzzer_hz() + " Hz）");
  }

  console.log("── 邊界：太低的頻率、不是數字的秒數、把毫秒當成秒");
  const eg = await compile("preview", EDGE);
  if (!eg.ok) say(false, "邊界測試的程式預覽要編得過：" + errors(eg.log));
  else {
    const me = await loadModule(eg.js);
    let fe = 0;
    const go = (n = 1) => { for (let i = 0; i < n; i++) { fe++; me._bp_tick(fe / 60); } };
    const press = (b1, b2, b3, b4) => { me._bp_input_set(0.5, b1, b2, b3, b4); go(); me._bp_input_set(0.5, 0, 0, 0, 0); };
    go();
    press(1, 0, 0, 0);
    say(me._bp_buzzer_hz() === 40, "buzzer.tone(25)：板子的硬體設不出 40 Hz 以下，兩端都拉到 40 Hz（" + me._bp_buzzer_hz() + "）");
    press(0, 0, 0, 1);
    press(0, 1, 0, 0); go(2);
    say(me._bp_buzzer_hz() === 0, "buzzer.beep(1000, 不是數字)：當成 0 秒，不會變成一直響（過兩格是 " + me._bp_buzzer_hz() + " Hz）");
    me._bp_input_set(0.95, 0, 0, 0, 0); go(); me._bp_input_set(0.5, 0, 0, 0, 0); go();
    say(me._bp_buzzer_hz() === 1000 && (me._bp_warn() & 8) === 0, "buzzer.beep(1000, 10)：10 秒以內不提醒（提醒代碼 " + me._bp_warn() + "）");
    press(0, 0, 0, 1);
    press(0, 0, 1, 0);
    say(me._bp_buzzer_hz() === 1000 && (me._bp_warn() & 8) === 8, "buzzer.beep(1000, 200)：照樣響，但提醒「單位是秒」（很可能把毫秒當成秒；提醒代碼 " + me._bp_warn() + "）");
  }

  console.log("── 舊程式的 #define PORT C（第一、二版板子的 C 接口＝GPIO4，那支腳不能同時當按鈕 4）");
  const pcv = await compile("preview", PORT_C);
  if (!pcv.ok) say(false, "PORT C 的程式預覽要編得過：" + errors(pcv.log));
  else {
    const mc = await loadModule(pcv.js);
    const pc = mc._bp_framebuffer(), pxc = (i) => Array.from(mc.HEAPU8.subarray(pc + i * 3, pc + i * 3 + 3));
    mc._bp_tick(1 / 60); mc._bp_input_set(0.5, 0, 0, 1, 1); mc._bp_tick(2 / 60);
    say(mc._bp_pin() === 4 && pxc(2).join() === "0,1,0" && pxc(1)[2] === 1,
        "預覽跟板子一樣不讀按鈕 4（按下 3、4：按鈕 3 有反應，按鈕 4 的 pressed()、clicked() 都是 false）：" + pxc(2).join());
  }

  console.log("── 板子端");
  const f = await compile("firmware", SKETCH);
  say(f.ok, "板子端編譯（四顆按鈕、蜂鳴器、音名）" + (f.ok ? "" : "：\n" + errors(f.log)));
  const pc = await compile("preview", PORT_C), fc = await compile("firmware", PORT_C);
  say(pc.ok && fc.ok, "舊程式寫 #define PORT C（第一版板子的 C 接口）兩端照樣編得過" + (pc.ok && fc.ok ? "" : "：\n" + errors(pc.ok ? fc.log : pc.log)));
  const bad16 = await compile("preview", SKETCH.replace("#define PANEL 8", "#define PANEL 8\n#define PORT D"));
  say(!bad16.ok && /PORT 只能是 A 或 B/.test(bad16.log || ""), "PORT 寫錯時的說明只提 A、B（新版的板子沒有 C）：" + ((bad16.log || "").split(/\r?\n/).find((l) => /PORT/.test(l)) || "").trim().slice(0, 90));

  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部通過 → PASS"));
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗
})();
