// 編譯完核對編譯器實際讀了哪些檔案（編譯時加 -MD -MF 產生的相依檔，Makefile 的格式），有沒有編譯站以外的。
// 這是第二道保險。「學員的程式不能讀電腦上的檔案」第一道在 sketch_prep.js 的 checkSketch：編譯前就用中文擋下。
// 萬一那邊有漏（例如編譯器多了新的讀檔寫法），這裡在把編出來的東西交給頁面之前再攔一次——
// #embed 讀的檔案、#include 的檔案都會列在相依檔裡（2026-11-20 用 emsdk 6.0.8 實測）。
const path = require("path");

// 相依檔的內容 → 檔案清單。格式：「目標: 檔案 檔案 \（換行）檔案 …」，檔名裡的空白寫成「\ 」
function parseDeps(text) {
  const joined = String(text).replace(/\\\r?\n/g, " ");
  const colon = joined.search(/:(?=\s)/);          // 目標後面的冒號（後面是空白）；Windows 路徑 C:\ 的冒號後面不是空白
  if (colon < 0) return [];
  const body = joined.slice(colon + 1), files = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && body[i + 1] === " ") { cur += " "; i++; }
    else if (c === "$" && body[i + 1] === "$") { cur += "$"; i++; }
    else if (c === " " || c === "\t" || c === "\r" || c === "\n") { if (cur) files.push(cur); cur = ""; }
    else cur += c;
  }
  if (cur) files.push(cur);
  return files;
}

// 不在 roots（允許的資料夾）底下的檔案。win：路徑照 Windows 的規則看（不分大小寫、反斜線）
function outsideDeps(text, roots, { win = process.platform === "win32" } = {}) {
  const P = win ? path.win32 : path.posix;
  const norm = (p) => { const r = P.resolve(p); return win ? r.toLowerCase() : r; };
  const allowed = roots.map(norm);
  return parseDeps(text).filter((f) => { const r = norm(f); return !allowed.some((a) => r === a || r.startsWith(a + P.sep)); });
}

module.exports = { parseDeps, outsideDeps };
