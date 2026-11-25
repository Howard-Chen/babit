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
  // 建議改接哪裡：只講新版板子（2026-11）也有的接口。GPIO4 在新版是按鈕 4，不能再叫學員把燈板接到「C」
  assert.match(checkSketch(prog("", 2)), /多接的燈板請接 B（GPIO3）。$/, "主燈板在 A：只建議 B");
  assert.match(checkSketch(prog("#define PORT B\n", 3)), /多接的燈板請接 A（GPIO2）。$/, "主燈板在 B：只建議 A");
  // 第一、二版的板子有 C 接口（GPIO4）：舊程式寫 PORT C 時，主燈板在 GPIO4 照樣認得
  assert.match(checkSketch(prog("#define PORT C\n", 4)), /主燈板的接口 C（GPIO4）.*多接的燈板請接 A（GPIO2）或B（GPIO3）。$/);
  assert.strictEqual(checkSketch(prog("#define PORT C\n", 2)), null, "主燈板在 C（舊板子）時，A 可以多接");
});

check("燈條（#define STRIP）：寫的位置、跟自己開的 Adafruit_NeoPixel 搶同一個接口或同一個名字", () => {
  const withStrip = (head) => HEAD.replace("#define PANEL 8\n", "#define PANEL 8\n" + head + "#define STRIP 60\n");
  const body = "void setup() { begin(); }\nvoid loop() { strip.fill(RED); show(); }\n";
  assert.strictEqual(checkSketch(withStrip("") + body), null, "正常的寫法沒有問題");
  assert.match(checkSketch(OK + "#define STRIP 60\n"), /^#define STRIP 要寫在 #include "BatoPixel\.h" 的前面。$/);
  // 燈條的接口由函式庫控制（含限流）：自己再開一個 Adafruit_NeoPixel 接同一個接口會搶同一條燈條
  const extra = (name, pin) => "Adafruit_NeoPixel " + name + "(60, " + pin + ", NEO_GRB + NEO_KHZ800);\n";
  const lineOf = (code) => code.split("\n").findIndex((l) => l.startsWith("Adafruit_NeoPixel")) + 1;
  const onB = withStrip("") + extra("ring", 3) + body;
  assert.match(checkSketch(onB), new RegExp("^第 " + lineOf(onB) + " 行自己開的 Adafruit_NeoPixel 接在燈條的接口 B（GPIO3）：.*strip\\.dot\\("), "燈板在 A：燈條是 B");
  assert.match(checkSketch(withStrip("#define PORT B\n") + extra("ring", 2) + body), /接在燈條的接口 A（GPIO2）/, "燈板在 B：燈條是 A");
  assert.match(checkSketch(withStrip("#define PORT C\n") + extra("ring", 2) + body), /接在燈條的接口 A（GPIO2）/, "燈板在 C（舊板子）：燈條是 A");
  assert.match(checkSketch(withStrip("") + extra("ring", 2) + body), /主燈板/, "接主燈板的接口：照舊說主燈板");
  assert.strictEqual(checkSketch(withStrip("#define PORT C\n") + extra("ring", 3) + body), null, "舊板子燈板在 C、燈條在 A：B 還可以自己多接");
  // 沒寫 STRIP：另一個接口照舊可以自己接（見上一項）
  assert.strictEqual(checkSketch(HEAD + extra("strip", 3) + "void setup() { begin(); strip.begin(); }\nvoid loop() { show(); }\n"), null, "沒寫 STRIP 時 strip 這個名字可以自己用");
  // 寫了 STRIP：strip 是函式庫準備好的燈條，自己再宣告一個同名的會撞名（編譯器只會給英文的 redefinition）
  const named = withStrip("#define PORT C\n") + extra("strip", 3) + body;
  assert.match(checkSketch(named), new RegExp("^第 " + lineOf(named) + " 行宣告了叫 strip 的變數：.*#define STRIP"), "撞名比接口先講");
});

check("蜂鳴器用 Arduino 的 tone()／noTone()：擋下並說明改用 buzzer（板子上那是另一套，跟預覽不一樣）", () => {
  const body = (line) => HEAD + "void setup() {\n  begin();\n}\nvoid loop() {\n  " + line + "\n  show();\n}\n";
  const t = checkSketch(body("tone(8, 440, 200);"));
  assert.match(t, /^第 8 行用了 tone\(\)：/, "說明是第幾行");
  assert.match(t, /buzzer\.beep\(頻率, 秒\)/, "說明改用什麼");
  assert.match(t, /不用寫腳位/);
  assert.doesNotMatch(t, /seconds\(\)|動畫不能停下來等/, "不是「不能等」那一類的訊息（工具頁會照那個訊息叫 AI 改用 seconds()）");
  assert.match(checkSketch(body("noTone(BUZZER_PIN);")), /^第 8 行用了 noTone\(\)：.*buzzer\.off\(\)/);
  assert.match(checkSketch(body("if (button1.clicked()) tone (10, NOTE_C7);")), /用了 tone\(\)/, "名字和括號中間有空白");
  assert.match(checkSketch(body("::tone(10, 440);")), /用了 tone\(\)/, "寫成 ::tone 也一樣");
  // 這些不是 Arduino 的 tone()
  assert.strictEqual(checkSketch(body("buzzer.tone(440);")), null, "buzzer.tone() 是函式庫的");
  assert.strictEqual(checkSketch(body("buzzer . tone(440);")), null, "點的前後有空白也是");
  assert.strictEqual(checkSketch(body("float tone = 440; buzzer.beep(tone, 0.1f);")), null, "自己的變數叫 tone");
  assert.strictEqual(checkSketch(body("// tone(8, 440);")), null, "註解裡的不算");
  assert.strictEqual(checkSketch(body('Serial.println("tone(8, 440)");')), null, "字串裡的不算");
  assert.strictEqual(checkSketch(body("int halftone(int x);")), null, "名字裡剛好有 tone 的別的函式");
  // 學員自己寫了叫 tone 的函式：函式庫把這個名字拿去用了，用整數去呼叫會被函式庫擋下，所以一樣請他改名（訊息要講到）
  const own = checkSketch(HEAD + "void tone(float hz) { buzzer.beep(hz, 0.1f); }\nvoid setup() {\n  begin();\n}\nvoid loop() {\n  show();\n}\n");
  assert.match(own, /^第 4 行用了 tone\(\)：.*如果 tone 是你自己寫的函式.*換一個名字/);
});

check("常見的 Arduino 蜂鳴器寫法會撞到函式庫的名字：先用中文說明（不然只有英文的編譯錯誤）", () => {
  const top = (decl) => HEAD + decl + "\nvoid setup() {\n  begin();\n}\nvoid loop() {\n  show();\n}\n";
  const b = checkSketch(top("const int buzzer = 8;"));
  assert.match(b, /^第 4 行宣告了叫 buzzer 的變數：/);
  assert.match(b, /buzzer\.beep\(頻率, 秒\)/);
  assert.match(checkSketch(top("int buzzer=10;")), /叫 buzzer 的變數/);
  assert.match(checkSketch(top("#define buzzer 10")), /叫 buzzer 的變數/, "#define 也算");
  const k = checkSketch(top("const uint8_t button1 = 2;"));
  assert.match(k, /^第 4 行宣告了叫 button1 的變數：.*button1\.clicked\(\)/);
  assert.match(checkSketch(top("int button4 = 4;")), /叫 button4 的變數/);
  assert.match(checkSketch(top('#include "pitches.h"')), /^第 4 行的 #include "pitches\.h" 要刪掉：.*NOTE_C4/);
  assert.match(checkSketch(top("#include <pitches.h>")), /pitches\.h.*要刪掉/);
  // 這些沒有撞名
  assert.strictEqual(checkSketch(top("const int BUZZER_PIN = 10;\nint buzzerState = 0;\nint button1Count = 0;\nbool mybutton1 = false;")), null, "名字只是相近");
  assert.strictEqual(checkSketch(top("// int buzzer = 8;")), null, "註解裡的不算");
  assert.strictEqual(checkSketch(HEAD + "void setup() {\n  begin();\n}\nvoid loop() {\n  if (button1.clicked()) buzzer.beep(NOTE_C7, 0.1f);\n  bool b = button1.pressed();\n  show();\n}\n"), null, "正常使用 buzzer、button1");
  // 全域的其他寫法也會撞名：直接初始化、一行宣告好幾個、指標、函式
  assert.match(checkSketch(top("int buzzer(10);")), /^第 4 行宣告了叫 buzzer 的變數/, "直接初始化");
  assert.match(checkSketch(top("int pin = 8, button1 = 8;")), /^第 4 行宣告了叫 button1 的變數/, "一行宣告好幾個");
  assert.match(checkSketch(top("int *button2 = 0;")), /宣告了叫 button2 的變數/, "指標");
  assert.match(checkSketch(top("static const\n  unsigned long\n  buzzer = 3;")), /^第 6 行宣告了叫 buzzer 的變數/, "跨行的宣告：行號是名字那一行");
  // 全域的變數取名 tone：函式庫把 tone 這個名字拿去用了，編譯器只會說一串看不懂的 bp_tone_
  const tn = checkSketch(top("int tone = 2000;"));
  assert.match(tn, /^第 4 行把全域的變數取名叫 tone：.*換一個名字/);
  assert.match(checkSketch(top("const float tone[] = {2000, 2500};")), /取名叫 tone/, "陣列也是");
  // 只有全域的才撞名。參數、struct 的成員、函式裡的區域變數只是把函式庫的名字遮住，兩端都編得過，不能擋
  const fine = (code, why) => assert.strictEqual(checkSketch(code), null, why);
  fine(top("bool hit(int x, int button1) { return x == button1; }"), "函式的第二個參數叫 button1");
  fine(top("bool hit(int button1) { return button1 > 0; }"), "第一個參數叫 button1");
  fine(top("void f(\n  int a,\n  int button2);"), "跨行的函式原型");
  fine(top("struct Settings { bool buzzer; int volume; };\nSettings cfg;"), "struct 的成員叫 buzzer");
  fine(HEAD + "void setup() {\n  begin();\n}\nvoid loop() {\n  bool buzzer = false;\n  int button3 = 0;\n  float tone = 440;\n  show();\n}\n", "函式裡的區域變數");
  fine(top("int level = buzzer.ready() ? 1 : 0;"), "全域的初始值裡用到 buzzer（不是宣告它）");
  // 另一個對話的範例程式用這種替身，讓同一支程式在還沒有蜂鳴器功能的舊版工具也編得過：不能擋
  fine(top("#ifndef NOTE_C7\nstruct QuietBuzzer { void beep(float, float) const {} void off() const {} };\nQuietBuzzer buzzer;\n#endif\n" +
           "#ifndef BP_BTN3_PIN\nstruct NoButton { bool clicked() const { return false; } };\nNoButton button3, button4;\n#endif"), "自訂型別的替身（QuietBuzzer buzzer、NoButton button3）");
});

check("型別寫在第一個函式後面、又用在函式的參數裡：板子會編不過，先用中文擋下", () => {
  const late = HEAD + "void setup() { begin(); }\nstruct Spark { float x; };\nvoid moveSpark(Spark& s) { s.x += 1; }\nvoid loop() { show(); }\n";
  assert.match(checkSketch(late), /Spark.*第一個函式/);
  const bodyOnly = HEAD + "void setup() { begin(); }\nstruct Spark { float x; };\nSpark s;\nvoid loop() { s.x += 1; show(); }\n";
  assert.strictEqual(checkSketch(bodyOnly), null, "只在函式裡面用到就沒關係");
});

console.log("── 編譯前檢查：程式不能讀電腦上的檔案");
// 編譯器會照程式寫的路徑去讀檔：#embed 把整個檔案讀進編出來的東西、#include 會把內容帶進錯誤訊息、
// __has_include 可以探查檔案在不在、組合語言的 .incbin 也能讀檔。學員的程式（包含別人給的）不能用這些碰電腦上的檔案。
const BODY = "void setup() { begin(); }\nvoid loop() { show(); }\n";
const withLine = (line) => HEAD + line + "\n" + BODY;          // 加在第 4 行

check("#embed：不管怎麼寫都擋（訊息帶行號）", () => {
  for (const d of ['#embed "C:/Windows/win.ini"', "  #  embed <x.bin>", '%:embed "a"', '/* a */ #embed "a"', '#em\\\nbed "a"', '#/**/embed "a"',
                   'const char s[] = {\n#embed "../../secret"\n};'])
    assert.match(checkSketch(withLine(d)) || "", /#embed/, d);
  assert.match(checkSketch(withLine('#embed "x"')), /第 4 行/);
});

check("#include 只能引用標頭檔的名稱：絕對路徑、..、磁碟代號、網路路徑、巨集都擋", () => {
  for (const d of ['#include "C:/Windows/win.ini"', '#include "/etc/passwd"', '#include "../../station/server.js"', '#include <../x.h>',
                   '#include "a\\\\b.h"', '#include "//evil/share/x.h"', '#include "\\\\\\\\evil\\\\share\\\\x.h"', '#define F "x.h"\n#include F',
                   '#include "sub/../../x.h"', "#include_next <math.h>", '#import "x.h"', '#include "CON"', '#include "nul.h"', '#include'])
    assert.match(checkSketch(withLine(d)) || "", /#include|#import/, d);
  assert.match(checkSketch(withLine('#include "/etc/passwd"')), /第 4 行/);
});

check("#include 的檔名只能用英數字、底線、點、加減號（用 / 分資料夾）：空白、結尾的點、裝置名稱加空白、後面多寫東西都擋", () => {
  // Windows 開檔前會把每一段結尾的空白與點拿掉：「CON 」就是主控台裝置，編譯器開了它會一直等輸入（實測韌體編譯卡到逾時、整條佇列被擋住）
  for (const d of ['#include "CON "', '#include "NUL "', '#include "con .h"', "#include <CON >", '#include "aux."', '#include "COM1 "', '#include "CONIN$"',
                   '#include "a/.. /b.h"', '#include ".. /x.h"', '#include "x .h"', '#include "foo."', '#include ".hidden"', '#include "a/./b.h"', '#include "a//b.h"',
                   "#include <a/**/../b.h>", '#include "/**/x"', '#include "COM¹"', '#include "名稱.h"', "#include <math.h> x", '#include "a.h" "b.h"', "#include <>", '#include ""'])
    assert.match(checkSketch(withLine(d)) || "", /#include/, d);
});

check("指令的名稱不能用 \\u 開頭的寫法拼出來（編譯器有的會照樣當成 #include 去讀檔）", () => {
  for (const d of ['#\\u0069nclude "C:/Windows/win.ini"', "#\\u0065mbed <x>", '#incl\\u0075de "C:/x"', "# \\U00000069nclude <x>", '%:\\u0069nclude "x"'])
    assert.match(checkSketch(withLine(d)) || "", /指令/, d);
  assert.match(checkSketch(withLine('#\\u0069nclude "x"')), /第 4 行/);
  assert.strictEqual(checkSketch(withLine('#define NL "\\n"\n#define BS \'\\\\\'')), null, "#define 的內容裡有反斜線是正常的");
});

check("正常的 #include 照樣可以：標準函式庫、Arduino 的函式庫、同資料夾的標頭檔、後面有註解", () => {
  for (const d of ["#include <math.h>", "#include <vector>", '#include "Arduino.h"', "#include <Adafruit_NeoPixel.h>", "#include <freertos/FreeRTOS.h>",
                   "#include <bits/stdc++.h>", "#include <esp32-hal.h>", "#include<math.h>", '#include "driver/i2s.h"', "#include <math.h>/* a */ // b", "#include <math.h>   ",
                   '#include <math.h> // 數學', "#  include   <stdint.h>   /* 整數 */", "#pragma once", "#pragma GCC diagnostic ignored \"-Wunused\"",
                   "#define SPEED 3\n#undef SPEED", "#if defined(ESP32)\n#endif", "#ifdef __EMSCRIPTEN__\n#else\n#endif", "#error 這行只是示範", "#line 10"]) {
    const r = checkSketch(withLine(d));
    assert.ok(r === null || !/#include|#pragma|#embed|不能/.test(r), d + " → " + r);
  }
});

check("探查檔案、組合語言、把兩個字接成一個字的巨集：擋下", () => {
  for (const [d, re] of [['#if __has_include("C:/Windows/win.ini")\n#endif', /__has_include/], ['#if __has_embed("x")\n#endif', /__has_embed/],
                         ['asm(".incbin \\"C:/secret\\"");', /asm/], ['__asm__(".incbin \\"x\\"");', /asm/], ["void f() { __asm (\"nop\"); }", /asm/],
                         ["#define GLUE(a, b) a##b", /##/], ["#define GLUE(a, b) a %:%: b", /##/], ["  #  define G(a,b) \\\n   a ## b", /##/],
                         ["/* 註解 */ #define GLUE(a, b) a##b", /##/], ['_Pragma("once")', /_Pragma/],
                         ['#pragma GCC dependency "C:/x"', /#pragma/], ["#pragma comment(lib, \"x\")", /#pragma/]])
    assert.match(checkSketch(withLine(d)) || "", re, d);
});

check("## 只有寫在 #define 裡才擋：用 # 畫圖的字串、註解照樣可以（官方範例的字型就是這樣畫的）", () => {
  for (const d of ['const char* rows[] = {".#.", "#.#", "###", "##."};', "int a = 1; // ## 這行後面的註解", 'const char* fmt = "%:";',
                   "const uint8_t ROW = 0b0110; // .##.", "/* ### 區塊 ### */"])
    assert.strictEqual(checkSketch(withLine(d)), null, d);
  const fs = require("fs"), path = require("path");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const official = walk(path.join(__dirname, "..", "examples")).filter((f) => f.endsWith(".ino") && !f.includes("我的範例"));
  assert.ok(official.length >= 12, "找不到官方範例");
  for (const f of official) assert.strictEqual(checkSketch(fs.readFileSync(f, "utf8")), null, path.basename(f));
});

check("藏在註解或字串後面也擋得到（寧可多擋，不靠分辨字串與註解）", () => {
  // 原始字串裡的引號會騙過「這裡是不是字串」的判斷：後面的 asm 看起來像在字串裡，其實是程式
  assert.match(checkSketch(withLine('const char* s = R"(")"; asm(".incbin \\"x\\""); const char* t = "";')) || "", /asm/);
  assert.match(checkSketch(withLine('const char* s = "/*";\n#embed "secret"\nconst char* t = "*/";')) || "", /#embed/);
  assert.match(checkSketch(withLine('/* 多行註解\n結束 */ #embed "x"')) || "", /#embed/);
  // 上一行用反斜線接到這一行：這一行開頭的 // 其實不是註解的開頭（*\ 接 // 變成 *//，註解在這裡結束）
  assert.match(checkSketch(withLine('/* 註解 *\\\n// asm(".incbin \\"x\\"");')) || "", /asm/);
});

check("看不見的控制字元：編譯器會跳過它們，所以整份程式不能有（實測 NUL、換頁字元都能把 #embed 藏起來）", () => {
  for (const d of ['\0#embed "x"', '\f#embed "x"', '\v#embed "x"', '#em\\\f\nbed "x"', '#em\\\v\nbed "x"', "int a = 1;\x01", "int a\x7f = 1;", "int a = 1;\x1b[0m"])
    assert.match(checkSketch(withLine(d)) || "", /看不見的字元|#embed/, JSON.stringify(d));
  assert.match(checkSketch(withLine('\0#embed "x"')), /第 4 行/);
  // 各種「看起來是空白」的字放在 # 前面也當成空白看（寧可多擋）
  for (const d of [' #embed "x"', '　#embed "x"', '﻿#embed "x"', '​#embed "x"', '#em\\ \t \nbed "x"'])
    assert.match(checkSketch(withLine(d)) || "", /#embed/, JSON.stringify(d));
  assert.strictEqual(checkSketch(withLine("\tint a = 1;\t// 用 Tab 縮排、中文全形空白　都可以")), null);
});

check("整行都是 // 註解的可以有 ## 與 asm 這些字（AI 常用 ### 當分隔線）", () => {
  assert.strictEqual(checkSketch(withLine("// ### 第一段 ###\n// 這裡不用 asm\n  // #embed 也只是註解")), null);
});

console.log("── 第二道保險：編譯完核對編譯器實際讀了哪些檔案（deps_check.js）");
const { parseDeps, outsideDeps } = require("./deps_check.js");

check("讀得懂編譯器寫的相依檔：換行接續、檔名裡的空白、Windows 的磁碟代號", () => {
  const win = "C:\\Users\\A\\ B\\tmp\\out.o: D:\\babit\\preview\\wrapper.cpp \\\r\n  D:\\babit\\tools\\emsdk\\upstream\\include\\math.h \\\r\n  C:\\Program\\ Files\\x\\y.h\r\n";
  assert.deepStrictEqual(parseDeps(win), ["D:\\babit\\preview\\wrapper.cpp", "D:\\babit\\tools\\emsdk\\upstream\\include\\math.h", "C:\\Program Files\\x\\y.h"]);
  assert.deepStrictEqual(parseDeps("out.o: /opt/babit/preview/wrapper.cpp \\\n /opt/babit/tools/emsdk/a\\ b.h\n"), ["/opt/babit/preview/wrapper.cpp", "/opt/babit/tools/emsdk/a b.h"]);
  assert.deepStrictEqual(parseDeps(""), []);
});

check("編譯站以外的檔案挑得出來（Windows 不分大小寫、../ 先算成實際位置）", () => {
  const roots = ["D:\\babit\\station\\tmp\\8930\\b7", "D:\\babit\\firmware\\BatoPixelS0", "D:\\babit\\preview", "D:\\babit\\tools\\emsdk"];
  const ok = "x.o: D:\\babit\\preview\\wrapper.cpp d:\\BABIT\\station\\tmp\\8930\\b7\\student.cpp D:\\babit\\firmware\\BatoPixelS0\\BatoPixel.h D:\\babit\\tools\\emsdk\\upstream\\x.h\n";
  assert.deepStrictEqual(outsideDeps(ok, roots, { win: true }), []);
  const leak = ok.trim() + " C:\\Windows\\win.ini D:\\babit\\station\\tmp\\8930\\b7\\..\\..\\..\\server.js D:\\babit\\preview2\\x.h\n";
  assert.deepStrictEqual(outsideDeps(leak, roots, { win: true }), ["C:\\Windows\\win.ini", "D:\\babit\\station\\tmp\\8930\\b7\\..\\..\\..\\server.js", "D:\\babit\\preview2\\x.h"]);
  const px = ["/opt/babit/station/tmp/8930/b7", "/opt/babit/firmware/BatoPixelS0", "/opt/babit/preview", "/opt/babit/tools/emsdk"];
  assert.deepStrictEqual(outsideDeps("x.o: /opt/babit/preview/wrapper.cpp /etc/passwd /opt/babit/Preview/x.h\n", px, { win: false }), ["/etc/passwd", "/opt/babit/Preview/x.h"]);
});

console.log("── 編譯前檢查：很長、很怪的程式也要馬上檢查完（不能讓編譯站卡住）");
// 以前這幾種輸入的處理時間跟長度的平方成正比：幾百 KB 的程式會讓編譯站幾分鐘沒回應
const timed = (label, code, limit = 1500) => {
  const t0 = Date.now();
  checkSketch(code);
  prepareSketch(code);
  const ms = Date.now() - t0;
  assert.ok(ms < limit, `${label}：${ms} ms（上限 ${limit} ms）`);
  return ms;
};
check("程式太長（超過 300 KB）直接說明，不檢查內容", () => {
  const r = checkSketch(OK + "// " + "長".repeat(310000) + "\n");
  assert.match(r || "", /太長/);
  assert.strictEqual(checkSketch(OK + "// " + "a".repeat(200000) + "\n"), null, "200 KB 的程式照常檢查");
});
check("重複幾萬次的怪內容：檢查與補原型都在 1.5 秒內做完", () => {
  const fill = (unit, bytes) => unit.repeat(Math.floor(bytes / unit.length));
  const N = 290000;
  const cases = {
    "typedef 沒有分號": OK + fill("typedef x ", N),
    "函式呼叫沒有收尾": OK + fill("x(", N),
    "Adafruit_NeoPixel 沒有括號": OK + fill("Adafruit_NeoPixel ", N),
    "一大堆函式和後面才宣告的型別": HEAD + "void setup() { begin(); }\nvoid loop() { show(); }\n" + fill("struct T%d { int a; };\nvoid f%d(T%d& t) { }\n".replace(/%d/g, "9"), N),
    "很多不同的型別與函式": HEAD + "void setup() { begin(); }\nvoid loop() { show(); }\n" +
      Array.from({ length: 6000 }, (_, i) => `struct T${i} { int a; };\nvoid f${i}(T${i}& t) { }\n`).join(""),
    "大括號只開不關": OK + fill("{ ", N),
    "註解只開不關": OK + "/*" + fill("* ", N),
    "一行裡一大堆註解": OK + fill("/**/", N) + "\n",
    "一大堆註解結尾": OK + fill("*/", N) + "\n",
    "字串只開不關": OK + fill('"\n', N),
    "一行很長的空白": OK + "//a" + " ".repeat(N) + "b\n",
    "括號加空白": OK + fill("(   ", N),
    "一大堆 #define": OK + fill("#define A 1\n", N),
    "一大堆反斜線接續": OK + fill("\\\n", N),
    // 蜂鳴器那幾條檢查（tone()、變數取名叫 buzzer）用到的往回看、連續空白
    "一大堆 buzzer.tone 加空白": OK + fill("buzzer .   tone   ", N),
    "一大堆成員的 tone()": OK + "void f() {\n" + fill("b.tone(1);", N) + "\n}\n",
    "tone 前面很長的空白": OK + "void f() { b ." + " ".repeat(N) + "tone(1); }\n",
    "一大堆 const int 沒有名字": OK + fill("const static int   ", N),
    "int 後面很長的空白": OK + "int" + " ".repeat(N) + "x;\n",
    // 2026-11-23 第二輪檢查實測：一長串修飾詞讓舊的寫法（正規表示式）卡 20 秒
    "一大堆 const（每個一行）": OK + "#if 0\n" + fill("const\n", N),
    "一大堆 static": OK + fill("static ", N),
    "一大堆 volatile（每個一行）": OK + fill("volatile\n", N),
    "一大堆 const 加 Tab": OK + fill("const\t", N),
    "同一句裡一大堆 buzzer": OK + "int x = " + fill("buzzer + ", N) + "0;\n",
    "一大堆全域的 tone": OK + fill("tone ", N),
    "一大堆 unsigned": OK + fill("unsigned ", N),
  };
  const slow = [];
  for (const [label, code] of Object.entries(cases)) {
    try { timed(label, code); } catch (e) { slow.push(e.message); }
  }
  assert.strictEqual(slow.length, 0, "\n" + slow.join("\n"));
});
check("一行裡塞幾萬個「註解結尾＋指令」：每個位置都要看，但不能每次都把整行重看一遍（300 毫秒內）", () => {
  // 審查時量到：*/#define 重複到 300 KB 要 0.9–1.3 秒，而且長度加倍、時間變四倍；幾個這種請求就能讓編譯站好幾秒不回應
  const fill = (unit, bytes) => unit.repeat(Math.floor(bytes / unit.length));
  const slow = [];
  for (const unit of ["*/#define ", "*/%:define", "*/#include ", "*/#pragma ", "*/#x ", "*/# ", "*/#\\", "/**/#define A "]) {
    try { timed("一大堆「" + unit + "」", OK + fill(unit, 290000) + "\n", 300); } catch (e) { slow.push(e.message); }
  }
  assert.strictEqual(slow.length, 0, "\n" + slow.join("\n"));
});

console.log(bad ? "\n" + bad + " 項失敗 → FAIL" : "\n全部通過 → PASS");
process.exit(bad ? 1 : 0);
