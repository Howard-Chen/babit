// 匯出 Arduino 資料夾／匯入 zip 的打包規則（編譯站的 /export/arduino、/import/arduino 用）。
// 匯出的 zip 照 Arduino 的草稿規格，解壓縮後 Arduino IDE 可以直接開、直接上傳，不需要 Babit 工具：
//   <名稱>/<名稱>.ino            學員的程式（主檔一定要跟資料夾同名）
//   <名稱>/BatoPixel.h           函式庫（firmware/BatoPixelS0 那一份）
//   <名稱>/src/Adafruit_NeoPixel 燈條函式庫的原始碼（firmware/arduino_export/src，固定 1.15.5）——學員不用另外裝函式庫
//   <名稱>/README.txt            Arduino IDE 的設定與上傳步驟；第二行「作品名稱：…」是匯出當時那張範例卡片的名稱
// 名稱只能用英數字（Arduino 的規定），所以匯出時自動編號（babit_月日_序號）。
// 匯入時作品名稱依序取：README.txt 的「作品名稱：」→ 程式第一行的註解（// 名稱）→ 資料夾（.ino）的名稱 → 「匯入的作品」。
const fs = require("fs"), path = require("path");
const { zipWrite, zipRead } = require("./zip.js");
const { normalize, panelOf } = require("./sketch_prep.js");
const { validName } = require("./catalog.js");

const FW_LIB = path.join(__dirname, "..", "firmware", "BatoPixelS0", "BatoPixel.h");
const ASSETS = path.join(__dirname, "..", "firmware", "arduino_export");
const TITLE_LINE = "作品名稱：";
const FALLBACK_TITLE = "匯入的作品";
// 匯入後工具頁會把程式用 JSON 送到 POST /examples 存成範例，那邊的上限是 1e6 bytes：留一點空間給名稱與外框
const MAX_CODE_JSON = 950000;
// 能不能當範例名稱（也就是「我的範例」裡的檔名）；@ 開頭的是 @desc 這類標記，不是名稱
const usableTitle = (s) => typeof s === "string" && !!s && !s.startsWith("@") && !validName(s);
// 截到最多 n 個字：不把表情符號切成一半、結尾不留空白
const clip = (s, n) => s.slice(0, n).replace(/[\uD800-\uDBFF]$/, "").trim();

// Arduino 草稿名稱：開頭是英數字或底線，後面可以有英數字、底線、點、減號，最多 63 個字，不能用點結尾。
// 回傳中文原因，合法回 null
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function validSketchName(name) {
  if (typeof name !== "string" || !name) return "匯出的名稱不能是空的";
  if (name.length > 63) return "匯出的名稱最多 63 個字";
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)) return "匯出的名稱只能用英文、數字、底線、點、減號，開頭要是英文、數字或底線";
  if (name.endsWith(".")) return "匯出的名稱不能用點（.）結尾";
  if (RESERVED.test(name)) return "這個名稱是 Windows 保留的，請換一個";
  return null;
}

// 自動編號：babit_月日_序號（同一天第幾次匯出）
const two = (n) => String(n).padStart(2, "0");
const exportName = (date, seq) => `babit_${two(date.getMonth() + 1)}${two(date.getDate())}_${two(seq)}`;

function listFiles(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else out.push(r);
  }
  return out;
}

// 打包成 zip（Buffer）。名稱不合規定就丟出錯誤。
// title：作品名稱（匯出當時那張範例卡片的名稱），寫進 README.txt 讓匯入時讀回來；沒有、或不能當範例名稱就不寫
function packSketch({ name, code, title, date }) {
  const why = validSketchName(name);
  if (why) throw new Error(why);
  let ino = normalize(code);
  if (!ino.endsWith("\n")) ino += "\n";
  // 說明檔的樣板：{NAME}＝資料夾名稱、{TITLE}＝作品名稱（沒有作品名稱就整行拿掉）。一次換完，換進去的字不會再被當成記號
  const hasTitle = usableTitle(title);
  const readme = fs.readFileSync(path.join(ASSETS, "README.txt"), "utf8").replace(/^﻿/, "").split(/\r\n?|\n/)
    .filter((l) => hasTitle || !l.includes("{TITLE}"))
    .map((l) => l.replace(/\{(NAME|TITLE)\}/g, (_, k) => (k === "NAME" ? name : title))).join("\r\n");
  const entries = [
    { name: `${name}/${name}.ino`, data: ino },
    { name: `${name}/BatoPixel.h`, data: fs.readFileSync(FW_LIB) },
  ];
  for (const f of listFiles(path.join(ASSETS, "src"))) entries.push({ name: `${name}/src/${f}`, data: fs.readFileSync(path.join(ASSETS, "src", f)) });
  entries.push({ name: `${name}/README.txt`, data: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(readme, "utf8")]) });
  return zipWrite(entries, date ? { date } : {});
}

// 從 zip 找出學員的程式。回傳 { code, folder, title, size }；不能匯入就丟出錯誤（中文原因）。
// 只讀 .ino（和 README.txt 裡的作品名稱），zip 裡的函式庫不用（工具用自己那一份）。
// 學員重新壓縮過的 zip 也收：檔案直接放在最上層、多了 __MACOSX、舊版 Windows 工具用反斜線分隔資料夾等等
function unpackSketch(buf) {
  const files = zipRead(buf, { maxEntries: 300, maxEntrySize: 1024 * 1024 }).map((e) => {
    const parts = e.name.split(/[\\/]/).filter((p) => p && p !== ".");      // 用 tar 壓的 zip 檔名前面會多一個 ./
    return { entry: e, parts, file: parts[parts.length - 1], dir: parts.slice(0, -1).join("/") };
  }).filter((f) => f.parts.length && !f.parts.some((p) => p.startsWith(".") || p === "__MACOSX"));      // macOS 壓縮時自己加的東西不看
  const inos = files.filter((f) => /\.ino$/i.test(f.file)).map((f) => {
    const base = f.file.replace(/\.ino$/i, "");
    return Object.assign(f, { base, main: f.parts.length >= 2 && f.parts[f.parts.length - 2] === base });   // 跟資料夾同名＝Arduino 的主檔
  });
  if (!inos.length) throw new Error("zip 裡找不到 .ino 程式：請選從 Babit 工具匯出的 zip");
  const mains = inos.filter((i) => i.main);
  const pick = mains.length === 1 ? mains[0] : (inos.length === 1 ? inos[0] : null);
  if (!pick) throw new Error("zip 裡有好幾個 .ino，不知道要匯入哪一個：請一次匯入一個作品的 zip");
  // 同一個資料夾裡還有別的程式檔＝學員在 Arduino IDE 加了分頁。工具的範例是單一檔案，只匯入主檔的話分頁裡的程式會不見
  const tabs = files.filter((f) => f !== pick && f.dir === pick.dir && /\.(ino|pde|h|hh|hpp|c|cpp|s)$/i.test(f.file) && !/^batopixel\.h$/i.test(f.file));
  if (tabs.length) throw new Error("這個作品有好幾個分頁（" + tabs.slice(0, 3).map((f) => f.file).join("、") + (tabs.length > 3 ? "…" : "") +
    "），Babit 工具只收單一檔案的程式：請在 Arduino IDE 把分頁的內容貼回主程式，再壓縮一次");
  const code = normalize(pick.entry.read().toString("utf8").replace(/^﻿/, ""));
  if (Buffer.byteLength(JSON.stringify(code)) > MAX_CODE_JSON) throw new Error("這個程式太大了，Babit 工具存不下來（上限大約 900 KB）");
  const size = panelOf(code);
  if (size == null) throw new Error("這個 .ino 最前面沒有 #define PANEL 8（或 16），不是 Babit 的程式");
  // 作品名稱：同一個資料夾的 README.txt 寫的（匯出當時的範例名稱）→ 程式第一行的註解（// 名稱）→ 資料夾（.ino）的名稱。
  // 每一個都先去掉前後的空白（存成範例時編譯站也會去掉），要能當範例名稱才採用；都不行就用固定的名稱
  let noted = "";
  const readme = files.find((f) => f.dir === pick.dir && /^readme\.txt$/i.test(f.file));
  if (readme) {
    let text = "";
    try { text = readme.entry.read().toString("utf8"); } catch (_) {}      // 說明檔讀不了不影響匯入
    const m = text.split(/\r\n?|\n/).find((l) => l.replace(/^﻿/, "").startsWith(TITLE_LINE));
    if (m) noted = m.replace(/^﻿/, "").slice(TITLE_LINE.length).trim();
  }
  // 第一行只看前 300 個字、不用會來回試的正規表示式：一行幾十萬個空白的怪檔案會讓那種寫法卡住編譯站好幾分鐘
  const nl = code.indexOf("\n"), line0 = code.slice(0, Math.min(nl < 0 ? code.length : nl, 300)).trimStart();
  const first = line0.startsWith("//") ? line0.slice(2).trim() : "";
  const title = [noted, first, pick.base, clip(pick.base.trim(), 40)].map((s) => s.trim()).find(usableTitle) || FALLBACK_TITLE;
  return { code, folder: pick.base, title, size };
}

module.exports = { validSketchName, exportName, packSketch, unpackSketch };
