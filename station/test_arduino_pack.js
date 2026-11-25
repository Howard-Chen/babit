// 「匯出 Arduino 資料夾／匯入 zip」打包規則的單元測試：node station/test_arduino_pack.js（不需要編譯站）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { zipWrite, zipRead } = require("./zip.js");
const { validSketchName, exportName, packSketch, unpackSketch } = require("./arduino_export.js");

let bad = 0;
function check(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { bad++; console.log("  FAIL " + name + "\n       " + e.message.split("\n").join("\n       ")); }
}

const CODE = '// 生命遊戲\n// @desc 康威的生命遊戲\n#define PANEL 16\n#include "BatoPixel.h"\n\nvoid setup() {\n  begin();\n}\n\nvoid loop() {\n  show();\n}\n';
const LIB = fs.readFileSync(path.join(__dirname, "..", "firmware", "BatoPixelS0", "BatoPixel.h"));
const files = (buf) => Object.fromEntries(zipRead(buf).map((e) => [e.name, e]));

check("草稿名稱照 Arduino 的規定：英數字、底線、點、減號，開頭不能是點或減號，最多 63 個字", () => {
  for (const ok of ["babit_1120_01", "a", "_x", "Babit-2.final", "9lives", "x".repeat(63)]) assert.strictEqual(validSketchName(ok), null, ok);
  for (const no of ["", "生命遊戲", "my sketch", "-x", ".x", "x.", "a/b", "a\\b", "x".repeat(64), "con", "COM1", null, 5])
    assert.ok(typeof validSketchName(no) === "string" && validSketchName(no), String(no));
});

check("自動編號的名稱：babit_月日_序號（序號至少兩位）", () => {
  assert.strictEqual(exportName(new Date(2026, 10, 29), 1), "babit_1129_01");
  assert.strictEqual(exportName(new Date(2026, 0, 5), 12), "babit_0105_12");
  assert.strictEqual(exportName(new Date(2026, 11, 5), 123), "babit_1205_123");
  assert.strictEqual(validSketchName(exportName(new Date(), 7)), null);
});

check("匯出的 zip：同名資料夾裡有 .ino、BatoPixel.h、src/Adafruit_NeoPixel、README.txt", () => {
  const f = files(packSketch({ name: "babit_1120_01", code: CODE }));
  const names = Object.keys(f);
  assert.ok(names.every((n) => n.startsWith("babit_1120_01/")), "所有檔案都要在同名資料夾裡：" + names.join("、"));
  assert.strictEqual(f["babit_1120_01/babit_1120_01.ino"].read().toString("utf8"), CODE);
  assert.ok(f["babit_1120_01/BatoPixel.h"].read().equals(LIB), "BatoPixel.h 要跟 firmware/BatoPixelS0 那一份一樣");
  for (const n of ["Adafruit_NeoPixel.h", "Adafruit_NeoPixel.cpp", "esp.c", "COPYING", "COPYING.GPL"])
    assert.ok(f["babit_1120_01/src/Adafruit_NeoPixel/" + n], "少了 src/Adafruit_NeoPixel/" + n);
  // 授權條文要完整：LGPL-3.0 是加在 GPL-3.0 上面的附加條款，兩份都要附
  const lic = (n) => f["babit_1120_01/src/Adafruit_NeoPixel/" + n].read().toString("utf8");
  assert.ok(/GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(lic("COPYING")), "COPYING 要是 LGPL-3.0 條文");
  assert.ok(/^\s*GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(lic("COPYING.GPL")) && lic("COPYING.GPL").includes("END OF TERMS AND CONDITIONS"),
            "COPYING.GPL 要是 GPL-3.0 全文");
  assert.strictEqual(names.filter((n) => /\.ino$/i.test(n)).length, 1, "只能有一個 .ino（src 底下不能放 .ino）");
});

check("README.txt：寫明先解壓縮、開發板、USB CDC On Boot、草稿名稱；Windows 記事本打得開（BOM＋CRLF）", () => {
  const raw = files(packSketch({ name: "babit_1120_01", code: CODE }))["babit_1120_01/README.txt"].read();
  assert.ok(raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), "開頭要有 UTF-8 BOM");
  const t = raw.toString("utf8");
  for (const kw of ["ESP32S3 Dev Module", "USB CDC On Boot", "Enabled", "babit_1120_01.ino", "esp32", "BOOT",
                    "解壓縮全部", "BatoPixel.h: No such file", "Hardware CDC and JTAG", "COPYING.GPL", "約 2 GB", "約 8 GB", "Octal"]) assert.ok(t.includes(kw), "README 少了「" + kw + "」");
  assert.ok(t.indexOf("解壓縮全部") < t.indexOf("ESP32S3 Dev Module"), "解壓縮要寫在選開發板之前");
  assert.ok(!/[^\r]\n/.test(t), "每一行都要用 CRLF 換行");
  assert.ok(!t.includes("{NAME}"), "名稱要代換掉");
});

check("程式的換行統一成 LF、結尾補一個換行（學員電腦上的程式可能是 CRLF）", () => {
  const f = files(packSketch({ name: "x1", code: "// a\r\n#define PANEL 8\r\nvoid setup(){}" }));
  assert.strictEqual(f["x1/x1.ino"].read().toString("utf8"), "// a\n#define PANEL 8\nvoid setup(){}\n");
});

check("名稱不合規定就不打包", () => {
  assert.throws(() => packSketch({ name: "生命遊戲", code: CODE }), /名稱/);
});

check("匯入自己匯出的 zip：程式原樣回來，作品名稱取第一行註解，燈板尺寸取 #define PANEL", () => {
  const r = unpackSketch(packSketch({ name: "babit_1120_01", code: CODE }));
  assert.deepStrictEqual(r, { code: CODE, folder: "babit_1120_01", title: "生命遊戲", size: 16 });
});

check("第一行不是作品名稱（沒有註解、是 @desc、名稱不能當檔名）就用資料夾名稱", () => {
  const pack = (code) => unpackSketch(packSketch({ name: "babit_0101_02", code })).title;
  assert.strictEqual(pack('#define PANEL 8\n#include "BatoPixel.h"\n'), "babit_0101_02");
  assert.strictEqual(pack('// @desc 只有說明\n#define PANEL 8\n'), "babit_0101_02");
  assert.strictEqual(pack('// 這個名稱有斜線 a/b\n#define PANEL 8\n'), "babit_0101_02");
  assert.strictEqual(pack("// " + "長".repeat(41) + "\n#define PANEL 8\n"), "babit_0101_02");
});

check("學員重新壓縮過的 zip 也收：檔案直接放在最上層、帶 BOM、CRLF、macOS 的 __MACOSX 與 .DS_Store", () => {
  const z = zipWrite([
    { name: "my_sketch.ino", data: "﻿// 我的彩虹\r\n#define PANEL 8\r\n" },
    { name: "BatoPixel.h", data: "x" },
    { name: "__MACOSX/._my_sketch.ino", data: "junk" },
    { name: "__MACOSX/x/x.ino", data: "#define PANEL 8\n" },     // 只有「__MACOSX 不看」這條規則擋得到
    { name: "._x.ino", data: "#define PANEL 8\n" },              // 只有「點開頭的不看」這條規則擋得到
    { name: ".DS_Store", data: "junk" },
  ]);
  assert.deepStrictEqual(unpackSketch(z), { code: "// 我的彩虹\n#define PANEL 8\n", folder: "my_sketch", title: "我的彩虹", size: 8 });
});

check("舊版 Windows 工具壓的 zip（資料夾用反斜線分隔）也收", () => {
  const z = zipWrite([
    { name: "proj\\proj.ino", data: "// 主程式\n#define PANEL 8\n" },
    { name: "proj\\BatoPixel.h", data: "x" },
    { name: "proj\\src\\Adafruit_NeoPixel\\esp.c", data: "x" },
  ]);
  assert.deepStrictEqual(unpackSketch(z), { code: "// 主程式\n#define PANEL 8\n", folder: "proj", title: "主程式", size: 8 });
});

check("匯出時帶作品名稱：寫進 README.txt，匯入時優先用它（不是程式第一行的註解）", () => {
  const z = packSketch({ name: "babit_1120_01", code: CODE, title: "我的彩虹" });
  const readme = files(z)["babit_1120_01/README.txt"].read().toString("utf8");
  assert.ok(/^作品名稱：我的彩虹\r$/m.test(readme), "README 要有一行「作品名稱：我的彩虹」");
  assert.ok(!readme.includes("{TITLE}"), "名稱要代換掉");
  assert.deepStrictEqual(unpackSketch(z), { code: CODE, folder: "babit_1120_01", title: "我的彩虹", size: 16 });
  // 作品名稱原樣寫進去：裡面剛好有說明檔樣板用的記號也不會被換掉
  for (const odd of ["我的{NAME}作品", "{TITLE}", "100% 彩虹 (v2)"])
    assert.strictEqual(unpackSketch(packSketch({ name: "babit_1120_01", code: CODE, title: odd })).title, odd);
});

check("沒帶作品名稱、或名稱不能當範例名稱：README 不寫那一行，匯入時用程式第一行的註解", () => {
  for (const title of [undefined, "", "a/b", "名".repeat(41), "@desc", 5]) {
    const z = packSketch({ name: "babit_1120_01", code: CODE, title });
    const readme = files(z)["babit_1120_01/README.txt"].read().toString("utf8");
    assert.ok(!readme.includes("作品名稱") && !readme.includes("{TITLE}"), "不該有作品名稱那一行（" + String(title).slice(0, 8) + "）");
    assert.strictEqual(unpackSketch(z).title, "生命遊戲");
  }
});

check("README 的作品名稱不能用、或 README 在別的資料夾：不採用，退回程式第一行的註解", () => {
  const withReadme = (dir, line) => unpackSketch(zipWrite([
    { name: "p/p.ino", data: CODE },
    { name: dir + "/README.txt", data: "﻿Babit 燈板程式（Arduino 資料夾）：p\r\n" + line + "\r\n" },
  ])).title;
  assert.strictEqual(withReadme("p", "作品名稱：學員改的名字"), "學員改的名字");
  assert.strictEqual(withReadme("p", "作品名稱：a/b"), "生命遊戲");
  assert.strictEqual(withReadme("p", "作品名稱：" + "名".repeat(41)), "生命遊戲");
  assert.strictEqual(withReadme("p", "作品名稱："), "生命遊戲");
  assert.strictEqual(withReadme("q", "作品名稱：別的資料夾"), "生命遊戲");
});

check("用資料夾名稱當作品名稱時也要能當範例名稱：太長就截短，不能用就叫「匯入的作品」", () => {
  const title = (name) => unpackSketch(zipWrite([{ name, data: "#define PANEL 8\n" }])).title;
  const long = "a".repeat(50);
  assert.strictEqual(title(`${long}/${long}.ino`), "a".repeat(40));
  assert.strictEqual(title("x./x..ino"), "匯入的作品");
  assert.strictEqual(title("con/con.ino"), "匯入的作品");
  assert.strictEqual(title("a:b.ino"), "匯入的作品");
});

check("作品有好幾個分頁（同一個資料夾裡還有別的 .ino、.h、.cpp）：不匯入，請學員先併回主程式", () => {
  const main = { name: "proj/proj.ino", data: "// 主程式\n#define PANEL 8\n" };
  for (const tab of ["helper.ino", "util.h", "draw.cpp"])
    assert.throws(() => unpackSketch(zipWrite([main, { name: "proj/" + tab, data: "x" }])), new RegExp("分頁.*" + tab.replace(".", "\\.")), tab);
  // 函式庫（BatoPixel.h、src 底下的檔案）、說明、Arduino IDE 自己存的設定檔不算分頁
  const ok = zipWrite([main, { name: "proj/BatoPixel.h", data: "x" }, { name: "proj/src/Adafruit_NeoPixel/esp.c", data: "x" },
                       { name: "proj/README.txt", data: "x" }, { name: "proj/sketch.yaml", data: "x" }]);
  assert.strictEqual(unpackSketch(ok).title, "主程式");
});

check("程式大到工具存不下來：匯入時就用中文說明（不會等到存成範例時才斷線）", () => {
  const head = "// 大作品\n#define PANEL 8\n";
  const zipOf = (n) => zipWrite([{ name: "b/b.ino", data: head + "//" + "A".repeat(n) + "\n" }]);
  assert.strictEqual(unpackSketch(zipOf(600000)).title, "大作品");
  assert.throws(() => unpackSketch(zipOf(990000)), /太大/);
  // 控制字元在存檔的格式裡一個要佔六個位元組：200 KB 的檔案也可能存不下來
  assert.throws(() => unpackSketch(zipWrite([{ name: "b/b.ino", data: head + "//" + "\x01".repeat(200000) + "\n" }])), /太大/);
  // 謊報大小：原樣存了 1.9 MB，目錄卻寫 10 bytes
  const liar = zipWrite([{ name: "b/b.ino", data: Buffer.concat([Buffer.from(head), require("crypto").randomBytes(1900000)]) }]);
  liar.writeUInt32LE(10, liar.readUInt32LE(liar.length - 22 + 16) + 24);
  assert.throws(() => unpackSketch(liar), /太大/);
});

check("匯入得到的作品名稱一定能當範例名稱（各種奇怪的 zip）", () => {
  const { validName } = require("./catalog.js");
  const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;     // 被切成一半的表情符號
  const emoji42 = "a" + "😀".repeat(20) + "b";                 // 42 個單位：截到 40 會切在表情符號中間
  const cases = [
    [{ name: "a/a.ino", data: "// " + "長".repeat(40) + "\n#define PANEL 8\n" }],
    [{ name: "§Ú/§Ú.ino", data: "#define PANEL 8\n" }],
    [{ name: "a b/a b.ino", data: "//   \n#define PANEL 8\n" }],
    [{ name: ("z".repeat(39) + ".") + "/" + ("z".repeat(39) + ".") + "z.ino", data: "#define PANEL 8\n" }],
    // 名稱前後有空白：存成範例時編譯站會先去掉空白再檢查，去掉之後變成不能用的名稱（點開頭、點結尾、保留名稱、空的）
    [{ name: " .x.ino", data: "#define PANEL 8\n" }],
    [{ name: "   .ino", data: "#define PANEL 8\n" }],
    [{ name: "abc. .ino", data: "#define PANEL 8\n" }],
    [{ name: "CON /CON .ino", data: "#define PANEL 8\n" }],
    [{ name: "  前後有空白  .ino", data: "#define PANEL 8\n" }],
    [{ name: emoji42 + "/" + emoji42 + ".ino", data: "#define PANEL 8\n" }],
  ];
  const got = cases.map((c) => unpackSketch(zipWrite(c)).title);
  for (const t of got) {
    assert.strictEqual(t, t.trim(), "「" + t + "」前後不該有空白（存成範例時會被去掉，名稱就對不上）");
    assert.strictEqual(validName(t), null, "「" + t + "」不能當範例名稱");
    assert.ok(!LONE.test(t), "「" + t + "」裡有被切成一半的表情符號");
  }
  assert.deepStrictEqual(got.slice(4), ["匯入的作品", "匯入的作品", "匯入的作品", "匯入的作品", "前後有空白", "a" + "😀".repeat(19)]);
});

check("用 tar 在資料夾裡壓縮的 zip（檔名前面多了 ./）也收", () => {
  const flat = zipWrite([
    { name: "./", data: "" },
    { name: "./my_sketch.ino", data: "// 我的彩虹\n#define PANEL 8\n" },
    { name: "./BatoPixel.h", data: "x" },
    { name: "./README.txt", data: "Babit 燈板程式\r\n作品名稱：彩虹二號\r\n" },
  ]);
  assert.deepStrictEqual(unpackSketch(flat), { code: "// 我的彩虹\n#define PANEL 8\n", folder: "my_sketch", title: "彩虹二號", size: 8 });
  const nested = zipWrite([
    { name: "./proj/proj.ino", data: "// 主程式\n#define PANEL 8\n" },
    { name: "./proj//BatoPixel.h", data: "x" },
    { name: "./proj/helper.txt", data: "x" },
  ]);
  assert.deepStrictEqual(unpackSketch(nested), { code: "// 主程式\n#define PANEL 8\n", folder: "proj", title: "主程式", size: 8 });
  // 分頁的判斷也要認得同一個資料夾的不同寫法
  assert.throws(() => unpackSketch(zipWrite([{ name: "./proj/proj.ino", data: "#define PANEL 8\n" }, { name: "proj/./helper.ino", data: "x" }])), /分頁/);
});

check("第一行是幾十萬個空白的怪檔案（壓成 zip 不到 1 KB）：馬上處理完，不會卡住編譯站", () => {
  // 以前取作品名稱的寫法遇到這種內容，處理時間跟長度的平方成正比：70 萬個空白要兩分鐘，期間編譯站完全沒回應
  const z = zipWrite([{ name: "x/x.ino", data: "//a" + " ".repeat(700000) + "b\n#define PANEL 8\n" }]);
  assert.ok(z.length < 2000, "zip 應該很小（" + z.length + " bytes）");
  const t0 = Date.now();
  const r = unpackSketch(z);
  const ms = Date.now() - t0;
  assert.ok(ms < 1000, `花了 ${ms} ms`);
  assert.strictEqual(r.title, "a", "名稱只看第一行的前 300 個字");
  const many = zipWrite([{ name: "y/y.ino", data: "//" + " \t".repeat(300000) + "\n#define PANEL 8\n" }]);
  const t1 = Date.now();
  assert.strictEqual(unpackSketch(many).title, "y");
  assert.ok(Date.now() - t1 < 1000, `全是空白的第一行花了 ${Date.now() - t1} ms`);
});

check("zip 裡有好幾個 .ino：只有一個跟資料夾同名就用它；分不出來就請學員一次匯入一個", () => {
  const one = zipWrite([
    { name: "proj/proj.ino", data: "// 主程式\n#define PANEL 8\n" },
    { name: "proj/backup/old.ino", data: "// 舊的\n#define PANEL 8\n" },
  ]);
  assert.strictEqual(unpackSketch(one).title, "主程式");
  const two = zipWrite([
    { name: "a/a.ino", data: "#define PANEL 8\n" },
    { name: "b/b.ino", data: "#define PANEL 8\n" },
  ]);
  assert.throws(() => unpackSketch(two), /好幾個/);
});

check("不能匯入的 zip 給中文原因：不是 zip、沒有 .ino、不是 Babit 的程式（沒有 #define PANEL）", () => {
  assert.throws(() => unpackSketch(Buffer.from("hello")), /zip/);
  assert.throws(() => unpackSketch(zipWrite([{ name: "a/readme.txt", data: "x" }])), /找不到 \.ino/);
  assert.throws(() => unpackSketch(zipWrite([{ name: "a/a.ino", data: "void setup(){}\nvoid loop(){}\n" }])), /#define PANEL/);
});

console.log(bad ? "\n" + bad + " 項失敗 → FAIL" : "\n全部通過 → PASS");
process.exit(bad ? 1 : 0);
