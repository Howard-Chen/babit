// 範例庫規則的單元測試：node station/test_catalog.js（不需要編譯站）
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { SIZE_DIRS, MY_DIR, displayName, listExamples, resolveExample, validName } = require("./catalog.js");

let bad = 0;
function check(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { bad++; console.log("  FAIL " + name + "\n       " + e.message.split("\n").join("\n       ")); }
}

// 測試用的範例資料夾：tmp/ex（範例庫）＋ tmp/outside.ino（範例庫外面，不能被讀到）
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "babit_catalog_"));
const ROOT = path.join(TMP, "ex");
const put = (rel, text) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
put("8x8/1_基本/01_彩虹流動.ino", "// 彩虹流動\n// @desc 整面彩虹\n// @loop 3.6\n#define PANEL 8\n// 這行在檔頭之後，不算\n");
put("8x8/1_基本/02_英文跑馬燈.ino", "// 英文跑馬燈\n// @desc HELLO\n#define PANEL 8\n");
put("8x8/2_感測器/01_沙漏流水.ino", "// 沙漏\n#define PANEL 8\n");
put("8x8/" + MY_DIR + "/貓.ino", "#define PANEL 8\n");
put("8x8/頂層.ino", "#define PANEL 8\n");
put("8x8/.hidden/x.ino", "#define PANEL 8\n");
put("8x8/1_基本/說明.txt", "不是範例\n");
put("16x16/1_基本/01_彩虹流動.ino", "#define PANEL 16\n");
fs.writeFileSync(path.join(TMP, "outside.ino"), "// 範例庫外面的檔案\n");

check("SIZE_DIRS／MY_DIR", () => {
  assert.deepStrictEqual(SIZE_DIRS, { 8: "8x8", 16: "16x16" });
  assert.strictEqual(MY_DIR, "我的範例");
});

check("displayName 去掉開頭的編號與 .ino", () => {
  assert.strictEqual(displayName("01_彩虹流動.ino"), "彩虹流動");
  assert.strictEqual(displayName("1_基本"), "基本");
  assert.strictEqual(displayName("我的範例"), "我的範例");
  assert.strictEqual(displayName("2024年作品"), "2024年作品");
});

check("8×8：依分類排好、隱藏資料夾與非 .ino 不算、「我的範例」排最後", () => {
  const list = listExamples(ROOT, 8).map((e) => [e.category, e.title]);
  assert.deepStrictEqual(list, [["基本", "彩虹流動"], ["基本", "英文跑馬燈"], ["感測器", "沙漏流水"], ["", "頂層"], ["我的範例", "貓"]]);
});

check("official：不含「我的範例」", () => {
  assert.deepStrictEqual(listExamples(ROOT, 8, { official: true }).map((e) => e.title), ["彩虹流動", "英文跑馬燈", "沙漏流水", "頂層"]);
});

check("檔頭：@desc、@loop、id、mine", () => {
  const [a] = listExamples(ROOT, 8);
  assert.strictEqual(a.id, "8x8/1_基本/01_彩虹流動");
  assert.strictEqual(a.desc, "整面彩虹");
  assert.strictEqual(a.loop, 3.6);
  assert.strictEqual(a.mine, false);
  assert.strictEqual(listExamples(ROOT, 8).pop().mine, true);
  assert.strictEqual(listExamples(ROOT, 8)[2].desc, "");
});

check("16×16 與不存在的尺寸資料夾", () => {
  assert.deepStrictEqual(listExamples(ROOT, 16).map((e) => e.id), ["16x16/1_基本/01_彩虹流動"]);
  fs.rmSync(path.join(ROOT, "16x16"), { recursive: true });
  assert.deepStrictEqual(listExamples(ROOT, 16), []);
});

check("resolveExample：只認範例庫裡存在的 .ino", () => {
  assert.strictEqual(resolveExample(ROOT, "8x8/1_基本/01_彩虹流動"), path.join(ROOT, "8x8", "1_基本", "01_彩虹流動.ino"));
  assert.strictEqual(resolveExample(ROOT, "../outside"), null);
  assert.strictEqual(resolveExample(ROOT, "8x8/1_基本/../../../outside"), null);
  assert.strictEqual(resolveExample(ROOT, "8x8/沒有這個"), null);
  assert.strictEqual(resolveExample(ROOT, "8x8/1_基本"), null);
  assert.strictEqual(resolveExample(ROOT, "8x8/1_基本/01_彩虹流動.ino"), null);
  assert.strictEqual(resolveExample(ROOT, ""), null);
  assert.strictEqual(resolveExample(ROOT, null), null);
  assert.strictEqual(resolveExample(ROOT, "a\0b"), null);
});

check("validName：合法的名稱", () => {
  for (const ok of ["我的彩虹", "my rainbow 2", "好".repeat(40), "小貓（第二版）"]) assert.strictEqual(validName(ok), null, ok);
});

check("validName：不合法的名稱都有中文原因", () => {
  const BAD = ["", "a/b", "a\\b", "x:y", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b", "a\tb",
               "CON", "con", "COM1", "lpt9", "nul.txt", ".x", "x.", "..", "好".repeat(41)];
  for (const name of BAD) {
    const why = validName(name);
    assert.ok(typeof why === "string" && why.length > 0, JSON.stringify(name) + " 應該不合法");
  }
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log(bad ? "\n" + bad + " 項失敗 → FAIL" : "\n全部通過 → PASS");
process.exit(bad ? 1 : 0);
