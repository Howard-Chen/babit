// 燈條（另一個接口接一條 WS2812 燈條）的驗證：BATOPIXEL_STATION=http://127.0.0.1:8939 node preview/test_strip.js（需先啟動編譯站）
//
// 程式開頭寫 #define STRIP 60 ＝ 另一個接口接了 60 顆的燈條（燈板在 A 燈條就是 B，燈板在 B 燈條就是 A）。
// 用 strip.dot(第幾顆, 顏色)、strip.fill(顏色)、strip.clear()、strip.fade(k)、strip.brightness(0–1) 畫，show() 跟燈板一起送出。
// 預覽沒有硬體：工具頁經 bp_strip_buffer／bp_strip_count 讀燈條的內容畫成一排。
// 這裡實跑 WASM 逐格比對，核對燈條有算進限流，並確認板子端也編得過。
const { loadModule } = require("../station/load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

// 按鈕 1＝整條填色、按鈕 2＝清掉、按鈕 3＝變暗一半、按鈕 4＝燈條亮度 0.25；旋鈕轉到最右＝燈板亮度 0.1
const SKETCH = `
#define PANEL 8
#define STRIP 60
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  if (button1.clicked()) strip.fill(rgb(10, 20, 30));
  if (button2.clicked()) strip.clear();
  if (button3.clicked()) strip.fade(0.5f);
  if (button4.clicked()) strip.brightness(0.25f);
  if (knob.value() > 0.9f) brightness(0.1f);
  strip.dot(0, RED);
  strip.dot(STRIP - 1, BLUE);
  strip.dot(2.6f, GREEN);
  strip.dot(-1, WHITE);
  strip.dot(STRIP, WHITE);
  int n = 0;
  for (int i = 0; i < STRIP; i++) n++;
  clear();
  dot(0, 0, rgb(n, 0, 0));
  show();
}
`;
// 沒寫 STRIP 的程式：strip 這個名字沒有被函式庫用掉（Adafruit 的範例都把燈條取名叫 strip，AI 常照著寫）
const OWN_STRIP = `
#define PANEL 8
#include "BatoPixel.h"

Adafruit_NeoPixel strip(60, 3, NEO_GRB + NEO_KHZ800);

void setup() {
  begin();
  strip.begin();
  strip.setBrightness(20);
}

void loop() {
  strip.setPixelColor(0, strip.Color(255, 0, 0));
  strip.show();
  dot(0, 0, RED);
  show();
}
`;
const withStrip = (n) => SKETCH.replace("#define STRIP 60", "#define STRIP" + (n === "" ? "" : " " + n));

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const errors = (log) => (log || "").split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 6).join("\n");
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

async function compile(kind, code) {
  const r = await fetch(STATION + "/compile/" + kind,
    { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code });
  return r.json();
}
const fn = (m, name) => (typeof m["_" + name] === "function" ? m["_" + name] : () => NaN);

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
  const fb = m._bp_framebuffer();
  const panel = (i) => Array.from(m.HEAPU8.subarray(fb + i * 3, fb + i * 3 + 3));
  const count = fn(m, "bp_strip_count")(), sb = fn(m, "bp_strip_buffer")();
  const led = (i) => Array.from(m.HEAPU8.subarray(sb + i * 3, sb + i * 3 + 3)).join();
  let frame = 0;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { frame++; m._bp_tick(frame / 60); } };
  const press = (b1, b2, b3, b4) => { m._bp_input_set(0.5, b1, b2, b3, b4); tick(); m._bp_input_set(0.5, 0, 0, 0, 0); tick(); };

  console.log("── 畫燈條");
  tick();
  say(count === 60 && sb > 0, "#define STRIP 60：預覽知道燈條有 60 顆（" + count + "），拿得到它的內容");
  say(panel(0).join() === "60,0,0", "STRIP 可以當數字用（for (i < STRIP) 跑了 " + panel(0)[0] + " 次），燈板照常畫");
  say(led(0) === "255,0,0" && led(59) === "0,0,255", "strip.dot(0, RED)、strip.dot(STRIP - 1, BLUE)：第一顆紅、最後一顆藍（" + led(0) + "｜" + led(59) + "）");
  say(led(3) === "0,255,0" && led(2) === "0,0,0", "strip.dot(2.6, GREEN)：小數自動取整到第 3 顆（" + led(3) + "）");
  say(led(1) === "0,0,0" && led(58) === "0,0,0", "strip.dot(-1, …)、strip.dot(STRIP, …)：超出燈條的忽略，旁邊的燈沒有被動到");
  press(1, 0, 0, 0);
  say(led(10) === "10,20,30" && led(58) === "10,20,30", "strip.fill(顏色)：整條同一個顏色（" + led(10) + "）");
  say(led(0) === "255,0,0", "……之後再畫的點蓋在上面（第一顆還是紅的）");
  press(0, 0, 1, 0);
  say(led(10) === "5,10,15", "strip.fade(0.5)：整條變暗一半（" + led(10) + "）");
  press(0, 1, 0, 0);
  say(led(10) === "0,0,0" && led(0) === "255,0,0", "strip.clear()：整條熄滅（" + led(10) + "）");
  say(panel(1).join() === "0,0,0", "畫燈條不會動到燈板");

  console.log("── 燈條的亮度（跟燈板分開）");
  const sbri = fn(m, "bp_strip_brightness");
  say(near(sbri(), 0.6) && near(m._bp_brightness(), 0.6), "沒設定：燈條跟燈板一樣是預設的 0.6（" + sbri() + "）");
  press(0, 0, 0, 1);
  say(near(sbri(), 0.25) && near(m._bp_brightness(), 0.6), "strip.brightness(0.25)：只調燈條（燈條 " + sbri() + "、燈板 " + m._bp_brightness() + "）");
  m._bp_input_set(0.95, 0, 0, 0, 0); tick(); m._bp_input_set(0.5, 0, 0, 0, 0); tick();
  say(near(sbri(), 0.25) && near(m._bp_brightness(), 0.1), "brightness(0.1)：只調燈板（燈條 " + sbri() + "、燈板 " + m._bp_brightness() + "）");
  say(m._bp_warn() === 0, "沒有提醒：提醒代碼 " + m._bp_warn());

  console.log("── 接口：燈條用 A、B 裡燈板沒用的那一個");
  const spin = fn(m, "bp_strip_pin");
  say(m._bp_pin() === 2 && spin() === 3, "沒寫 PORT：燈板 A（GPIO" + m._bp_pin() + "）、燈條 B（GPIO" + spin() + "）");
  for (const [port, panelPin, stripPin] of [["B", 3, 2], ["C", 4, 2]]) {
    const r = await compile("preview", SKETCH.replace("#define PANEL 8", "#define PANEL 8\n#define PORT " + port));
    if (!r.ok) { say(false, "PORT " + port + " 加燈條要編得過：" + errors(r.log)); continue; }
    const mp = await loadModule(r.js);
    say(mp._bp_pin() === panelPin && fn(mp, "bp_strip_pin")() === stripPin,
        "#define PORT " + port + "：燈板 GPIO" + mp._bp_pin() + "、燈條 GPIO" + fn(mp, "bp_strip_pin")() + "（應為 " + panelPin + "、" + stripPin + "）");
  }

  console.log("── 限流：燈條算進整台的電流（係數見 BatoPixel.h「電流估算」）");
  // 8×8：全滅時整台 60 mA；燈條每顆待機 1 mA、每色全亮 13.5 mA（5050 燈珠，先用 8×8 燈板的實測值，燈條到貨後校正）
  const base = m._bp_current_ma(0, 0), sma = fn(m, "bp_strip_current_ma");
  say(near(base, 60 + 60 * 1.0), "全滅時整台的電流含燈條待機：60＋60×1＝120 mA（" + base + "）");
  say(near(sma(60 * 765, 255), 60 * 3 * 13.5, 0.5), "60 顆全白、亮度全開：燈條 2430 mA（" + sma(60 * 765, 255) + "）");
  say(near(sma(60 * 765, 12), 60 * 3 * 13.5 * 12 / 255, 0.5), "亮度 12（接電腦的預設）：照比例 " + sma(60 * 765, 12).toFixed(1) + " mA");
  const est = base + sma(60 * 765, 255);
  say(near(m._bp_current_k(est, 0), (450 - 120) / (est - 120), 0.001) && near(m._bp_current_k(est, 1), (1500 - 120) / (est - 120), 0.001),
      "超過上限就等比調暗，待機的底數不動：接電腦 ×" + m._bp_current_k(est, 0).toFixed(3) + "、接充電器 ×" + m._bp_current_k(est, 1).toFixed(3));
  say(m._bp_current_k(base + 100, 0) === 1, "沒超過上限：不調暗");

  console.log("── 送到燈條的資料：色序、亮度、限流的調暗（板子送出前每顆算三個位元組，bp_strip_wire）");
  // 板子端燈條自己開 RMT 通道送（不經過 Adafruit_NeoPixel），所以色序和亮度的換算是函式庫自己做的：這裡核對算出來的位元組
  const order = fn(m, "bp_strip_order")(), wire = fn(m, "bp_strip_wire");
  const bytes = (r, g, b, k, bri, ord = order) => [0, 1, 2].map((j) => wire(r, g, b, k, bri, ord, j)).join();
  say(order === 0x52, "預設色序是 GRB（Adafruit 的 NEO_GRB＝0x52；現在 0x" + Number(order).toString(16) + "）");
  say(bytes(10, 20, 30, 1, 255) === "20,10,30", "GRB：顏色 (10,20,30) 送出去的順序是綠、紅、藍（" + bytes(10, 20, 30, 1, 255) + "）");
  say(bytes(10, 20, 30, 1, 255, 0x06) === "10,20,30", "色序改成 RGB（NEO_RGB＝0x06）：照紅、綠、藍送（" + bytes(10, 20, 30, 1, 255, 0x06) + "）");
  say(bytes(200, 100, 50, 1, 127) === "50,100,25", "亮度 127：每個顏色 ×128÷256（跟 Adafruit 的 setBrightness 同一個算法；" + bytes(200, 100, 50, 1, 127) + "）");
  say(bytes(255, 255, 255, 1, 12) === "12,12,12" && bytes(255, 255, 255, 1, 0) === "0,0,0", "亮度 12（接電腦的預設）：全白送 12；亮度 0：全部是 0");
  say(bytes(200, 100, 50, 0.5, 255) === "50,100,25", "限流要調暗一半（k＝0.5）：先把顏色乘 0.5 再送（" + bytes(200, 100, 50, 0.5, 255) + "）");

  console.log("── 沒寫 STRIP 的程式不受影響");
  const plain = await compile("preview", OWN_STRIP);
  if (!plain.ok) say(false, "沒寫 STRIP、自己開 Adafruit_NeoPixel 取名 strip 的程式要編得過：" + errors(plain.log));
  else {
    const mo = await loadModule(plain.js);
    mo._bp_tick(1 / 60);
    say(fn(mo, "bp_strip_count")() === 0 && fn(mo, "bp_strip_buffer")() === 0 && fn(mo, "bp_strip_pin")() === -1,
        "預覽知道沒有燈條（0 顆）；strip 這個名字學員可以自己用");
    say(near(mo._bp_current_ma(0, 0), 60), "全滅時整台的電流照舊 60 mA（" + mo._bp_current_ma(0, 0) + "）");
  }

  console.log("── STRIP 寫錯：兩端都在編譯時用中文說明");
  const hint = (log) => ((log || "").split(/\r?\n/).find((l) => /STRIP/.test(l) && /error/.test(l)) || "").trim().slice(0, 120);
  for (const n of ["0", "301", "", "-5"]) {
    const r = await compile("preview", withStrip(n));
    say(!r.ok && /STRIP 是燈條有幾顆燈.*1 到 300/.test(r.log || ""), "#define STRIP " + (n || "（沒寫數字）") + "：" + (hint(r.log) || "沒有擋下"));
  }
  const prot = await compile("preview", SKETCH.replace("#define STRIP 60", "#define STRIP 60\n#define BP_STRIP_MA_PER_COLOR 1"));
  say(!prot.ok && /電源上限/.test(prot.log || ""), "燈條的電流係數跟其他電源上限一樣，程式裡不能改");

  console.log("── 板子端");
  const f = await compile("firmware", SKETCH);
  say(f.ok, "板子端編譯（燈板 8×8 在 A、燈條 60 顆在 B）" + (f.ok ? "" : "：\n" + errors(f.log)));
  const f16 = await compile("firmware", SKETCH.replace("#define PANEL 8", "#define PANEL 16\n#define PORT B").replace("#define STRIP 60", "#define STRIP 300"));
  say(f16.ok, "板子端編譯（燈板 16×16 在 B、燈條 300 顆在 A）" + (f16.ok ? "" : "：\n" + errors(f16.log)));
  const fo = await compile("firmware", OWN_STRIP);
  say(fo.ok, "沒寫 STRIP、自己開 Adafruit_NeoPixel 取名 strip：板子端照樣編得過" + (fo.ok ? "" : "：\n" + errors(fo.log)));
  const fbad = await compile("firmware", withStrip("0"));
  say(!fbad.ok && /STRIP 是燈條有幾顆燈/.test(fbad.log || ""), "STRIP 寫錯：板子端也擋下（" + (hint(fbad.log) || "沒有擋下") + "）");

  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部通過 → PASS"));
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗
})();
