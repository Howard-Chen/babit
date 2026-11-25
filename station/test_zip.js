// zip 讀寫的單元測試：node station/test_zip.js（不需要編譯站；有 py 的話另外測跟 Python zipfile 互通）
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");
const { zipWrite, zipRead } = require("./zip.js");

let bad = 0;
function check(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { bad++; console.log("  FAIL " + name + "\n       " + e.message.split("\n").join("\n       ")); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "babit_zip_"));
const big = "void loop() { show(); }\n".repeat(400);                       // 重複很多的內容：一定壓得比原本小
const rnd = require("crypto").randomBytes(300);                            // 亂數壓不小：原樣存
// 把 zip 目錄（中央目錄）裡第一個檔案「解開後的大小」改掉：做出謊報大小的 zip
const lieSize = (z, n) => { const out = Buffer.from(z); out.writeUInt32LE(n, out.readUInt32LE(out.length - 22 + 16) + 24); return out; };
const ENTRIES = [
  { name: "babit_1120_01/babit_1120_01.ino", data: "// 生命遊戲\n#define PANEL 16\n" + big },
  { name: "babit_1120_01/BatoPixel.h", data: "#pragma once\n" },
  { name: "babit_1120_01/src/Adafruit_NeoPixel/esp.c", data: rnd },
  { name: "babit_1120_01/README.txt", data: "" },
];

check("寫出來再讀回去：檔名、內容、順序都一樣", () => {
  const got = zipRead(zipWrite(ENTRIES));
  assert.deepStrictEqual(got.map((e) => e.name), ENTRIES.map((e) => e.name));
  for (let i = 0; i < ENTRIES.length; i++)
    assert.ok(got[i].read().equals(Buffer.from(ENTRIES[i].data)), ENTRIES[i].name + " 內容不一樣");
});

check("重複多的內容有壓縮（整包比原始內容小很多）", () => {
  assert.ok(zipWrite(ENTRIES).length < Buffer.byteLength(big) / 4);
});

check("同樣的輸入（指定同一個時間）產生一模一樣的 zip", () => {
  const d = new Date(2026, 10, 20, 9, 30, 0);
  assert.ok(zipWrite(ENTRIES, { date: d }).equals(zipWrite(ENTRIES, { date: d })));
});

check("不是 zip、被截斷的 zip：丟出錯誤，不會當掉或回傳半套", () => {
  assert.throws(() => zipRead(Buffer.from("這不是 zip 檔")), /zip/i);
  assert.throws(() => zipRead(Buffer.alloc(0)), /zip/i);
  const z = zipWrite(ENTRIES);
  assert.throws(() => zipRead(z.subarray(0, z.length - 30)), /zip/i);
});

check("上限：檔案數太多、解開後太大都擋下來", () => {
  const many = zipWrite(Array.from({ length: 30 }, (_, i) => ({ name: "f" + i + ".txt", data: "x" })));
  assert.throws(() => zipRead(many, { maxEntries: 10 }), /太多/);
  const z = zipWrite([{ name: "bomb.ino", data: "A".repeat(200000) }]);
  const e = zipRead(z, { maxEntrySize: 1000 })[0];
  assert.throws(() => e.read(), /太大/);
});

check("壓不小的內容原樣存、壓得小的才壓縮（兩種寫法都有測到）", () => {
  const z = zipWrite([{ name: "a.bin", data: rnd }]);
  assert.strictEqual(z.readUInt16LE(8), 0, "亂數內容應該原樣存（壓縮法 0）");
  assert.strictEqual(zipWrite([{ name: "a.ino", data: big }]).readUInt16LE(8), 8, "重複多的內容應該壓縮（壓縮法 8）");
});

check("謊報大小的 zip：目錄寫 10 bytes、實際解開 5 MB（壓縮炸彈）也擋下來", () => {
  const z = lieSize(zipWrite([{ name: "liar.ino", data: "A".repeat(5e6) }]), 10);
  assert.throws(() => zipRead(z, { maxEntrySize: 1000 })[0].read(), /太大/);
});

check("謊報大小的 zip：原樣存的檔案實際比上限大，也擋下來", () => {
  const z = lieSize(zipWrite([{ name: "liar.bin", data: require("crypto").randomBytes(5000) }]), 10);
  assert.strictEqual(z.readUInt16LE(8), 0, "這個測試要用原樣存的檔案");
  assert.throws(() => zipRead(z, { maxEntrySize: 1000 })[0].read(), /太大/);
});

check("目錄寫的大小跟實際內容不一樣（沒超過上限）：當成損毀的檔案，不回傳內容", () => {
  const stored = lieSize(zipWrite([{ name: "a.bin", data: rnd }]), 10);
  assert.throws(() => zipRead(stored)[0].read(), /大小不符/);
  const packed = lieSize(zipWrite([{ name: "a.ino", data: big }]), 10);
  assert.throws(() => zipRead(packed)[0].read(), /大小不符/);
});

check("內容被改過（檢查碼對不上）：當成損毀的檔案，不回傳內容", () => {
  const z = zipWrite([{ name: "a.bin", data: rnd }]);
  const i = z.indexOf(rnd.subarray(0, 16));
  assert.ok(i > 0, "找不到資料區");
  z[i + 50] ^= 1;
  assert.throws(() => zipRead(z)[0].read(), /檢查碼/);
});

check("資料夾項目（名稱結尾是 /）不當成檔案回傳", () => {
  const z = zipWrite([{ name: "a/", data: "" }, { name: "a/b.ino", data: "x" }]);
  assert.deepStrictEqual(zipRead(z).map((e) => e.name), ["a/b.ino"]);
});

// ── 跟別的工具互通：Python 的 zipfile（學員電腦上的壓縮程式產生的 zip 也是這幾種寫法）──
let py = null;
for (const c of ["py", "python3"]) { try { execFileSync(c, ["--version"], { stdio: "ignore" }); py = c; break; } catch (_) {} }
if (!py) console.log("  （找不到 python，跳過互通測試）");
else {
  const runPy = (code, args) => execFileSync(py, ["-X", "utf8", "-c", code].concat(args), { encoding: "utf8" });

  check("Python 讀得懂我們寫的 zip（testzip 沒有壞檔，內容一樣）", () => {
    const f = path.join(TMP, "ours.zip");
    fs.writeFileSync(f, zipWrite(ENTRIES));
    const out = runPy(
      "import sys, zipfile, json\n" +
      "z = zipfile.ZipFile(sys.argv[1])\n" +
      "print(json.dumps({'bad': z.testzip(), 'names': z.namelist(), 'ino': z.read(z.namelist()[0]).decode('utf-8')[:21]}))\n", [f]);
    const j = JSON.parse(out);
    assert.strictEqual(j.bad, null);
    assert.deepStrictEqual(j.names, ENTRIES.map((e) => e.name));
    assert.strictEqual(j.ino, "// 生命遊戲\n#define PANEL");
  });

  check("我們讀得懂 Python 寫的 zip：壓縮的、原樣存的、中文檔名", () => {
    const f = path.join(TMP, "py.zip");
    runPy(
      "import sys, zipfile\n" +
      "z = zipfile.ZipFile(sys.argv[1], 'w')\n" +
      "z.writestr('proj/proj.ino', '// 測試\\n' + 'int x;\\n' * 500, zipfile.ZIP_DEFLATED)\n" +
      "z.writestr('proj/存檔.txt', '中文內容', zipfile.ZIP_STORED)\n" +
      "z.close()\n", [f]);
    const got = zipRead(fs.readFileSync(f));
    assert.deepStrictEqual(got.map((e) => e.name), ["proj/proj.ino", "proj/存檔.txt"]);
    assert.strictEqual(got[0].read().toString("utf8"), "// 測試\n" + "int x;\n".repeat(500));
    assert.strictEqual(got[1].read().toString("utf8"), "中文內容");
  });

  check("我們讀得懂「大小寫在資料後面」的 zip（macOS 壓縮程式、串流寫出的 zip 都是這種）", () => {
    const f = path.join(TMP, "stream.zip");
    runPy(
      "import sys, zipfile, io\n" +
      "class NoSeek(io.RawIOBase):\n" +
      "    def __init__(self, f): self.f = f\n" +
      "    def writable(self): return True\n" +
      "    def write(self, b): return self.f.write(b)\n" +
      "with open(sys.argv[1], 'wb') as raw:\n" +
      "    z = zipfile.ZipFile(NoSeek(raw), 'w', zipfile.ZIP_DEFLATED)\n" +
      "    z.writestr('m/m.ino', '#define PANEL 8\\n' * 100)\n" +
      "    z.writestr('__MACOSX/m/._m.ino', 'junk')\n" +
      "    z.close()\n", [f]);
    const got = zipRead(fs.readFileSync(f));
    assert.deepStrictEqual(got.map((e) => e.name), ["m/m.ino", "__MACOSX/m/._m.ino"]);
    assert.strictEqual(got[0].read().toString("utf8"), "#define PANEL 8\n".repeat(100));
  });
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(bad ? "\n" + bad + " 項失敗 → FAIL" : "\n全部通過 → PASS");
process.exit(bad ? 1 : 0);
