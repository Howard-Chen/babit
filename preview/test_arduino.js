// Arduino 相容層的數值語意驗證：node preview/test_arduino.js（需先啟動編譯站 station\run_station.ps1）
//
// 為什麼需要這支測試：相容層「編譯得過」不等於「算得對」。min／max 初版寫成
// -> decltype(a < b ? a : b)，編譯完全正常，但兩引數同型別時條件運算子產生左值，
// decltype 得到 int&，於是回傳區域參數的參考，實測 min(7, 3) 回 0。
// 只看編譯結果永遠抓不到這種 bug，所以這裡把計算結果編進像素、實跑 WASM 逐項比對。
// 程式照學員的格式寫（setup()／loop()），最後一個函式故意寫在 loop() 後面：預覽要跟 Arduino 一樣自動補原型。
//
// 期望值全部依「Arduino 自己的定義」手算，所以預覽對上＝與板子一致。
const { loadModule } = require("../station/load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

const SKETCH = `
#define PANEL 8
#include "BatoPixel.h"

Adafruit_NeoPixel extra(64, 3, NEO_GRB + NEO_KHZ800);   // 學員自己多開一片燈板（燈板 B）

void setup() {
  begin();
}

void loop() {
  clear();
  randomSeed(1);
  dot(0, 0, rgb(millis() / 100, micros() / 100000, seconds() * 10));
  dot(1, 0, rgb(map(3, 0, 7, 0, 255), map(5, 0, 10, 0, 2), map(1, 0, 0, 77, 200)));
  dot(2, 0, rgb(constrain(300, 0, 200), constrain(-5, 0, 200), constrain(50, 0, 200)));
  dot(3, 0, rgb(min(7, 3), max(7, 3), min(2.9f, 5) * 10));
  dot(4, 0, rgb(abs(-3.5f) * 10, sq(4), abs(-7)));
  dot(5, 0, rgb(radians(180.0f) * 10, degrees(PI), TWO_PI * 10));
  dot(6, 0, rgb(random(200), bitRead(5, 0) + bitRead(5, 2), random(10, 20)));
  dot(7, 0, rgb(lowByte(513), highByte(513), bit(3)));
  byte b = 200; word w = 513; boolean f = true;
  dot(0, 1, rgb(b, w % 256, f ? 1 : 0));
  String s = String("ab") + String(42);
  dot(1, 1, rgb(s.length(), s.toInt(), String("7").toInt()));
  dot(2, 1, rgb(String(3.5, 1).length(), s.charAt(0), sq(3)));
  pinMode(1, INPUT_PULLUP); pinMode(1, INPUT_PULLDOWN);   // ESP32 才有的 INPUT_PULLDOWN 也要編得過
  pinMode(1, OUTPUT); digitalWrite(1, HIGH);
  dot(0, 2, rgb(analogRead(1), digitalRead(1), 9));
  extra.begin(); extra.setBrightness(20); extra.clear();
  extra.setPixelColor(0, extra.Color(1, 2, 3)); extra.setPixelColor(1, 4, 5, 6);
  extra.fill(extra.Color(0, 0, 9)); extra.show();
  dot(0, 3, rgb(extra.numPixels(), extra.Color(0, 0, 7), extra.Color(0, 9, 0) >> 8));
  dot(1, 3, rgb(tripled(7), 0, 0));
  show();
}

int tripled(int v) { return v * 3; }   // 寫在 loop() 後面：預覽要跟 Arduino 一樣自動補原型
`;

const T = 2.5;                       // 固定時間點，讓 millis()／micros()／seconds() 有確定期望值
// [像素, 通道(0=r,1=g,2=b), 期望值, 說明]
const EXPECT = [
  [0, 0, 25, "millis() = t*1000 = 2500，取 /100"],
  [0, 1, 25, "micros() = t*1e6 = 2500000，取 /100000"],
  [0, 2, 25, "seconds() = t = 2.5，乘 10"],
  [1, 0, 109, "map(3,0,7,0,255) 整數運算 765/7 = 109"],
  [1, 1, 1, "map(5,0,10,0,2) = 1（Arduino 的整數截斷）"],
  [1, 2, 77, "map 除零防護回 out_min"],
  [2, 0, 200, "constrain 上夾"],
  [2, 1, 0, "constrain 下夾"],
  [2, 2, 50, "constrain 範圍內不變"],
  [3, 0, 3, "min(7,3)（回傳參考的 bug 會變 0）"],
  [3, 1, 7, "max(7,3)"],
  [3, 2, 29, "min(2.9f,5)*10 混型別不得退化成整數"],
  [4, 0, 35, "abs(-3.5f)*10 浮點絕對值（30 代表退化成整數 abs）"],
  [4, 1, 16, "sq(4)"],
  [4, 2, 7, "abs(-7)"],
  [5, 0, 31, "radians(180)*10 = 31.4 截斷"],
  [5, 1, 180, "degrees(PI)"],
  [5, 2, 62, "TWO_PI*10 = 62.8 截斷"],
  [6, 1, 2, "bitRead(5,0) + bitRead(5,2)"],
  [7, 0, 1, "lowByte(513)"],
  [7, 1, 2, "highByte(513)"],
  [7, 2, 8, "bit(3)"],
  [8, 0, 200, "byte b = 200"],
  [8, 1, 1, "word 513 % 256"],
  [8, 2, 1, "boolean true"],
  [9, 0, 4, 'String("ab") + String(42) 長度 4'],
  [9, 2, 7, 'String("7").toInt()'],
  [10, 0, 3, 'String(3.5, 1) = "3.5" 長度 3'],
  [10, 1, 97, "charAt(0) = 'a' = 97"],
  [10, 2, 9, "sq(3)"],
  [16, 0, 0, "analogRead 樁回 0"],
  [16, 1, 0, "digitalRead 樁回 0"],
  [16, 2, 9, "腳位操作在預覽是空動作，後面照常畫"],
  [24, 0, 64, "多開燈板：Adafruit_NeoPixel 在預覽編得過，numPixels() 照實回傳"],
  [24, 1, 7, "Adafruit_NeoPixel::Color 打包與板子相同（藍在最低 8 位）"],
  [24, 2, 9, "Color 的綠在第 8–15 位"],
  [25, 0, 21, "loop() 後面才定義的函式（預覽自動補原型）"],
];
const RANGE = [
  [6, 0, 0, 199, "random(200) 落在 0..199"],
  [6, 2, 10, 19, "random(10,20) 落在 10..19"],
];

(async () => {
  let j;
  try {
    const r = await fetch(STATION + "/compile/preview",
      { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: SKETCH });
    j = await r.json();
  } catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message + "\n請先啟動 station\\run_station.ps1（或跑 BatoPixel.bat）");
    process.exit(1);
  }
  if (!j.ok) {
    console.log("編譯失敗：\n" + (j.log || "").split(/\r?\n/).filter((l) => /error/.test(l)).slice(0, 8).join("\n"));
    process.exit(1);
  }

  const m = await loadModule(j.js);
  const ptr = m._bp_framebuffer();
  m._bp_tick(T);                     // 第一格：先跑 setup()，再跑 loop()
  const fb = Array.from(m.HEAPU8.subarray(ptr, ptr + 192));

  const ch = ["r", "g", "b"];
  let bad = 0;
  for (const [px, c, exp, why] of EXPECT) {
    const got = fb[px * 3 + c], ok = got === exp;
    if (!ok) bad++;
    console.log((ok ? "  ok   " : "  FAIL ") + ("px" + px + "." + ch[c]).padEnd(7) +
                "得 " + String(got).padStart(3) + " 期望 " + String(exp).padStart(3) + "   " + why);
  }
  for (const [px, c, lo, hi, why] of RANGE) {
    const got = fb[px * 3 + c], ok = got >= lo && got <= hi;
    if (!ok) bad++;
    console.log((ok ? "  ok   " : "  FAIL ") + ("px" + px + "." + ch[c]).padEnd(7) +
                "得 " + String(got).padStart(3) + " 範圍 " + lo + ".." + hi + "   " + why);
  }
  const warn = m._bp_warn();
  if (warn !== 0) bad++;
  console.log((warn === 0 ? "  ok   " : "  FAIL ") + "沒有提醒（begin()、show() 都有寫）：提醒代碼 " + warn);
  const total = EXPECT.length + RANGE.length + 1;
  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部 " + total + " 項符合 Arduino 語意 → PASS"));
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）
})();
