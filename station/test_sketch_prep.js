// 學員程式前處理的單元測試：node station/test_sketch_prep.js（不需要編譯站）
const assert = require("assert");
const { prepareSketch, sketchPrototypes, maskComments, checkSketch, panelOf } = require("./sketch_prep.js");

let bad = 0;
function check(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { bad++; console.log("  FAIL " + name + "\n       " + e.message.split("\n").join("\n       ")); }
}
// 輸出裡第二個 #line（第一個是最前面的 #line 1）
const lineDirective = (out) => (out.split("\n").slice(1).find((l) => l.startsWith("#line ")) || "");

const HEAD = `// 測試
#define PANEL 8
#include "BatoPixel.h"
`;
const OK = HEAD + "void setup() { begin(); }\nvoid loop() { show(); }\n";

console.log("── 補函式原型");

check("loop 後面才定義的函式：補原型，#line 接回原本的行號", () => {
  const code = HEAD + `
void setup() { begin(); }

void loop() {
  dot(0, 0, pick(3));
  show();
}

Color pick(int i) { return hsv(i * 30, 255, 255); }
`;
  const out = prepareSketch(code);
  assert.ok(out.startsWith('#line 1 "sketch.ino"\n'), "第一行要是 #line 1");
  assert.deepStrictEqual(sketchPrototypes(code), ["void setup();", "void loop();", "Color pick(int i);"]);
  assert.strictEqual(lineDirective(out), '#line 5 "sketch.ino"', "setup() 在原本的第 5 行");
  assert.ok(out.endsWith(code.slice(code.indexOf("void setup"))), "插入點之後的程式原封不動");
});

check("註解、字串、字元常數裡的大括號與分號不影響判斷", () => {
  const code = HEAD + `
const char* MSG = "{ not a block; }";   // 字串裡的 {
char brace = '{';
/* void fake() { } */
// void fake2() {
void setup() { begin(); }
void loop() { show(); }
`;
  assert.deepStrictEqual(sketchPrototypes(code), ["void setup();", "void loop();"]);
});

check("struct、陣列初始值、lambda、類別成員、樣板、預設參數都不補", () => {
  const code = HEAD + `
struct Ball { float x, y; void move() { x += 1; } };
const int TABLE[] = { 1, 2, 3 };
auto twice = [](int v) { return v * 2; };
void Ball2::go() { }
template <typename T> T big(T a, T b) { return a > b ? a : b; }
int add(int a, int b = 1) { return a + b; }
void setup() { begin(); }
void loop() { show(); }
`;
  assert.deepStrictEqual(sketchPrototypes(code), ["void setup();", "void loop();"]);
});

check("回傳型別換行、指標回傳、static 都認得", () => {
  const code = HEAD + `
static float
ease(float t) { return t * t; }
const Color* palette(int i) { return nullptr; }
void setup() { begin(); }
void loop() { show(); }
`;
  assert.deepStrictEqual(sketchPrototypes(code),
    ["static float ease(float t);", "const Color* palette(int i);", "void setup();", "void loop();"]);
});

check("型別在第一個函式後面才宣告：用到它的函式不補原型", () => {
  const code = HEAD + `
void setup() { begin(); }
struct Spark { float x; };
void moveSpark(Spark& s) { s.x += 1; }
void loop() { show(); }
`;
  assert.deepStrictEqual(sketchPrototypes(code), ["void setup();", "void loop();"]);
});

check("沒有函式：只在最前面加 #line 1", () => {
  const code = HEAD + "int x = 1;\n";
  assert.strictEqual(prepareSketch(code), '#line 1 "sketch.ino"\n' + code);
});

check("Windows 換行（\\r\\n）先換成 \\n，行號一樣對", () => {
  const code = (HEAD + "\nvoid setup() { begin(); }\nvoid loop() { show(); }\n").replace(/\n/g, "\r\n");
  const out = prepareSketch(code);
  assert.ok(!out.includes("\r"), "不能留下 \\r");
  assert.strictEqual(lineDirective(out), '#line 5 "sketch.ino"');
});

check("maskComments 不改變長度與換行位置；keepStrings 只遮註解", () => {
  const s = 'int a; // 中文註解 {\nchar c = \'}\'; /* 多\n行 */ const char* s = "x\\"y";\nint n = 1\'000;\n';
  const m = maskComments(s);
  assert.strictEqual(m.length, s.length);
  assert.ok([...m].every((c, i) => (c === "\n") === (s[i] === "\n")), "換行位置要一樣");
  assert.ok(!m.includes("{") && !m.includes("}"), "註解與字元常數裡的大括號要遮掉");
  assert.ok(m.includes("1'000"), "數字分隔符號不是字元常數");
  assert.strictEqual(maskComments('a "x//y" // c\n', true), 'a "x//y"     \n');
});

console.log("── 編譯前檢查");

check("格式正確：沒有問題（PORT 寫在前面也可以）", () => {
  assert.strictEqual(checkSketch(OK), null);
  assert.strictEqual(checkSketch(OK.replace("#define PANEL 8\n", "#define PANEL 8\n#define PORT B\n")), null);
});

check("舊版 draw(t) 寫法：說明要改寫", () => {
  assert.match(checkSketch("void draw(float t) {\n  dot(0, 0, RED);\n}\n"), /舊版/);
});

check("沒有 loop()", () => {
  assert.match(checkSketch(HEAD + "void setup() { begin(); }\n"), /void loop\(\)/);
});

check("沒寫 PANEL（註解掉的也不算）", () => {
  assert.match(checkSketch(OK.replace("#define PANEL 8\n", "")), /#define PANEL 8/);
  assert.match(checkSketch(OK.replace("#define PANEL 8", "// #define PANEL 8")), /#define PANEL 8/);
});

check("沒有 #include \"BatoPixel.h\"", () => {
  assert.match(checkSketch(OK.replace('#include "BatoPixel.h"\n', "")), /#include/);
});

check("#define PANEL、PORT 寫在 #include 後面", () => {
  assert.match(checkSketch('#include "BatoPixel.h"\n#define PANEL 8\nvoid setup() {}\nvoid loop() {}\n'), /PANEL 要寫在/);
  assert.match(checkSketch(OK + "#define PORT B\n"), /PORT 要寫在/);
});

check("panelOf 讀出 PANEL", () => {
  assert.strictEqual(panelOf(OK), 8);
  assert.strictEqual(panelOf(OK.replace("PANEL 8", "PANEL 16")), 16);
  assert.strictEqual(panelOf("int x;"), null);
  assert.strictEqual(panelOf("// #define PANEL 16\nint x;"), null);
});

console.log("── 編譯前檢查：預覽正常、板子出事（或繞過保護）的寫法");
const withLoop = (body, head = "") => HEAD.replace("#define PANEL 8\n", "#define PANEL 8\n" + head) +
  "void setup() { begin(); }\nvoid loop() {\n" + body + "\n  show();\n}\n";

check("用了函式庫內部的 bp_ 名稱（例如直接改 bp_strip 的亮度）", () => {
  assert.match(checkSketch(withLoop("  bp_strip.setBrightness(255);")), /bp_strip/);
  assert.strictEqual(checkSketch(withLoop('  Serial.println("bp_strip");  // bp_x')), null, "字串與註解裡的不算");
});

check("delay 的其他寫法：vTaskDelay、(delay)(…)、esp_rom_delay_us，訊息帶行號", () => {
  assert.match(checkSketch(withLoop("  vTaskDelay(10);")), /第 6 行.*vTaskDelay/);
  assert.match(checkSketch(withLoop("  (delay)(100);")), /delay/);
  assert.match(checkSketch(withLoop("  esp_rom_delay_us(500);")), /esp_rom_delay_us/);
});

check("while (!Serial)：接行動電源時會卡住", () => {
  const code = HEAD + "void setup() {\n  begin();\n  while (!Serial) {}\n}\nvoid loop() { show(); }\n";
  assert.match(checkSketch(code), /while \(!Serial\)/);
  assert.match(checkSketch(code.replace("while (!Serial) {}", "while(!Serial);")), /while \(!Serial\)/);
});

check("自己開 Adafruit_NeoPixel 接主燈板的接口：擋下（會繞過亮度保護）", () => {
  const extra = (pin) => "Adafruit_NeoPixel extra(64, " + pin + ", NEO_GRB + NEO_KHZ800);\n";
  const prog = (head, pin) => HEAD.replace("#define PANEL 8\n", "#define PANEL 8\n" + head) + extra(pin) +
    "void setup() { begin(); extra.begin(); }\nvoid loop() { show(); }\n";
  assert.match(checkSketch(prog("", 2)), /主燈板/, "沒寫 PORT：主燈板是 A＝GPIO2");
  assert.strictEqual(checkSketch(prog("", 3)), null, "接 B 可以");
  assert.strictEqual(checkSketch(prog("#define PORT B\n", 2)), null, "主燈板改接 B 時，A 可以多接");
  assert.match(checkSketch(prog("#define PORT B\n", 3)), /主燈板/);
  assert.match(checkSketch(prog("#define LED_PIN 2\n", "LED_PIN")), /主燈板/, "腳位用 #define 的常數也要認得");
});

check("型別寫在第一個函式後面、又用在函式的參數裡：板子會編不過，先用中文擋下", () => {
  const late = HEAD + "void setup() { begin(); }\nstruct Spark { float x; };\nvoid moveSpark(Spark& s) { s.x += 1; }\nvoid loop() { show(); }\n";
  assert.match(checkSketch(late), /Spark.*第一個函式/);
  const bodyOnly = HEAD + "void setup() { begin(); }\nstruct Spark { float x; };\nSpark s;\nvoid loop() { s.x += 1; show(); }\n";
  assert.strictEqual(checkSketch(bodyOnly), null, "只在函式裡面用到就沒關係");
});

console.log(bad ? "\n" + bad + " 項失敗 → FAIL" : "\n全部通過 → PASS");
process.exit(bad ? 1 : 0);
