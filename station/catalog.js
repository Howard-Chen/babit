// 範例庫：examples/8x8、examples/16x16 底下的 .ino。子資料夾＝分類（工具頁分組顯示），檔名＝卡片標題。
// 編譯站、縮圖產生器、驗收測試、GIF 產生器共用這裡的規則。
const fs = require("fs"), path = require("path");

const SIZE_DIRS = { 8: "8x8", 16: "16x16" };
const MY_DIR = "我的範例";          // 「＋ 新增範例」存在這裡；不進版控（.gitignore），git pull 才不會衝突

// 資料夾與檔名開頭的排序編號（01_、1_）與副檔名不顯示
const displayName = (s) => s.replace(/\.ino$/i, "").replace(/^\d+[_\s.-]+/, "") || s;

// 範例的 id：相對 examples 的路徑、斜線分隔、不含 .ino（例：8x8/1_基本/01_彩虹流動）
const exampleId = (root, file) => path.relative(root, file).split(path.sep).join("/").replace(/\.ino$/i, "");

// 讀一個範例的資料：檔頭註解（第一個非註解行之前）裡的 @desc、@loop
function exampleMeta(root, file) {
  const id = exampleId(root, file);
  const parts = id.split("/");                  // [尺寸資料夾, 分類…, 檔名]
  const cats = parts.slice(1, -1);
  const name = parts[parts.length - 1];
  let desc = "", loop = null;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*\/\/\s?(.*)$/);
    if (!m) break;
    const body = m[1].trim();
    const d = body.match(/^@desc\s+(.*)$/);
    if (d) desc = d[1].trim();
    const l = body.match(/^@loop\s+([\d.]+)/);
    if (l) loop = parseFloat(l[1]);
  }
  const mine = cats[0] === MY_DIR;
  // 排序：官方分類照資料夾名稱（開頭編號決定順序）→ 直接放在尺寸資料夾裡的 →「我的範例」
  const catKey = !cats.length ? "￾" : (mine ? "￿" : "") + cats.join("/");
  return { id, file, title: displayName(name), desc, loop, category: cats.map(displayName).join(" / "), mine,
           sortKey: catKey + "\u0000" + name };
}

// 某個尺寸的所有範例（含子資料夾），依分類排好；official＝不含「我的範例」
function listExamples(root, size, { official = false } = {}) {
  const out = [];
  (function walk(dir) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ino$/i.test(e.name)) out.push(exampleMeta(root, p));
    }
  })(path.join(root, SIZE_DIRS[size]));
  return out.filter((e) => !(official && e.mine))
            .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
}

// 頁面傳回來的 id 換成檔案路徑；不在範例庫裡、不是 .ino、檔案不存在都回 null（擋掉 ../ 之類的路徑）
function resolveExample(root, id) {
  if (typeof id !== "string" || !id || id.includes("\0")) return null;
  const base = path.resolve(root);
  const f = path.resolve(base, id + ".ino");
  if (!f.startsWith(base + path.sep)) return null;
  try { return fs.statSync(f).isFile() ? f : null; } catch (_) { return null; }
}

// 範例名稱就是檔名：Windows 與 Mac 都不能用的字元、Windows 保留名稱、點開頭或結尾都擋掉。回傳中文原因，合法回 null
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function validName(name) {
  if (typeof name !== "string" || !name) return "請輸入範例名稱";
  if (name.length > 40) return "名稱最多 40 個字";
  if (/[\\/:*?"<>|\x00-\x1f]/.test(name)) return "名稱不能有這些符號：\\ / : * ? \" < > |";
  if (/^\.|\.$/.test(name)) return "名稱不能用點（.）開頭或結尾";
  if (RESERVED.test(name)) return "這個名稱是 Windows 保留的，請換一個";
  return null;
}

module.exports = { SIZE_DIRS, MY_DIR, displayName, exampleId, exampleMeta, listExamples, resolveExample, validName };
