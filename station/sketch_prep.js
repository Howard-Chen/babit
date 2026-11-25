// 學員程式（.ino）的文字處理：編譯前檢查、預覽端補函式原型。
//
// 為什麼要補原型：Arduino 編譯 .ino 時，會自動在第一個函式前面插入所有函式的宣告，
// 所以函式可以「先用、後定義」（AI 常把小工具函式寫在 loop() 後面）。預覽用 emcc 照一般 C++ 編譯，
// 不補的話，同一份程式板子編得過、預覽卻失敗。補完再加 #line，錯誤訊息的行號才對得上學員看到的行號。

// 換行統一成 \n（Windows 貼上的程式是 \r\n）
const normalize = (code) => String(code).replace(/\r\n?/g, "\n");

// 註解、字串、字元常數換成空白（長度與換行不變），掃描大括號、分號時才不會被裡面的符號騙到。
// keepStrings＝true 時只遮註解、字串原樣保留（檢查 #include "BatoPixel.h" 用）。
// 1'000 這種數字分隔符號的單引號前面是英數字，不當成字元常數。
function maskComments(src, keepStrings = false) {
  let out = "";
  const n = src.length;
  const keep = (k) => (keepStrings || src[k] === "\n" ? src[k] : " ");
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && d === "*") {
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      if (i < n) { out += "  "; i += 2; }
    } else if (c === '"' || (c === "'" && !/\w/.test(src[i - 1] || ""))) {
      out += keep(i); i++;
      while (i < n && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\" && i + 1 < n) { out += keep(i) + keep(i + 1); i += 2; continue; }
        out += keep(i); i++;
      }
      if (i < n && src[i] === c) { out += keep(i); i++; }
    } else {
      out += c; i++;
    }
  }
  return out;
}

// 前處理指令（#include、#define…，含行尾反斜線接續的下一行）整行換成空白
function maskDirectives(s) {
  const lines = s.split("\n");
  let cont = false;
  for (let k = 0; k < lines.length; k++) {
    if (cont || /^\s*#/.test(lines[k])) {
      cont = /\\\s*$/.test(lines[k]);
      lines[k] = " ".repeat(lines[k].length);
    }
  }
  return lines.join("\n");
}

// 最外層一段「{ 前面的文字」是不是函式定義的開頭；是的話回傳 { sig：宣告（不含分號）, name：函式名稱 }
const NOT_FUNC = /^(?:struct|class|enum|union|namespace|typedef|template|extern|using)\b/;
const KEYWORDS = new Set(["if", "for", "while", "switch", "return", "sizeof", "catch", "do", "else", "operator"]);
// 逐字找，不用「任意字＋名稱＋(＋任意字＋)」這種正規表示式：遇到很長又不成對的內容，它的時間跟長度的平方成正比
function functionSignature(head) {
  if (head.length > 4000) return null;                            // 函式的宣告不會這麼長
  const h = head.replace(/\s+/g, " ").trim();
  if (!h || h.includes("=") || NOT_FUNC.test(h)) return null;     // 有 = 的是初始值（陣列、lambda）或預設參數
  if (!(h.endsWith(")") || h.endsWith(") const") || h.endsWith(")const"))) return null;
  // 名稱＝第一個「前面緊接著識別字」的左括號，前面的那個識別字
  for (let p = h.indexOf("("); p >= 0; p = h.indexOf("(", p + 1)) {
    let e = p;
    if (e > 0 && h[e - 1] === " ") e--;
    let b = e;
    while (b > 0 && /\w/.test(h[b - 1])) b--;
    while (b < e && /\d/.test(h[b])) b++;                         // 識別字不能用數字開頭
    if (b === e) continue;
    const ret = h.slice(0, b).trim(), name = h.slice(b, e);
    if (!ret || KEYWORDS.has(name) || ret.endsWith("::")) return null; // 沒有回傳型別、關鍵字、類別成員都不是
    return { sig: h, name };
  }
  return null;
}

// 找出最外層的函式定義：[{ start（宣告第一個字的位置）, sig, name }]
function findFunctions(masked) {
  const found = [];
  let depth = 0, stmt = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === "{") {
      if (depth === 0) {
        const head = masked.slice(stmt, i);
        const f = functionSignature(head);
        if (f) found.push({ start: stmt + (head.length - head.trimStart().length), sig: f.sig, name: f.name });
      }
      depth++;
    } else if (c === "}") {
      if (depth > 0) depth--;
      if (depth === 0) stmt = i + 1;
    } else if (c === ";" && depth === 0) {
      stmt = i + 1;
    }
  }
  return found;
}

// 一段程式裡宣告的型別名稱（struct／class／enum／union X、typedef … X;、using X =）
function declaredTypes(masked) {
  const names = new Set();
  for (const m of masked.matchAll(/\b(?:struct|class|union|enum(?:\s+class)?)\s+([A-Za-z_]\w*)/g)) names.add(m[1]);
  // typedef … 名稱;：從 typedef 找到下一個分號，取分號前面的最後一個識別字。
  // 不用一條正規表示式掃到底：沒有分號的怪內容會讓它每遇到一個 typedef 就掃到檔尾一次
  let from = 0;
  for (const m of masked.matchAll(/\btypedef\b/g)) {
    if (m.index < from) continue;                                 // 還在上一段 typedef 裡面
    const end = masked.indexOf(";", m.index);
    if (end < 0) break;
    from = end + 1;
    if (end - m.index > 2000) continue;                           // 這麼長的不是一般的 typedef
    const id = /([A-Za-z_]\w*)\s*$/.exec(masked.slice(m.index + 7, end));
    if (id) names.add(id[1]);
  }
  for (const m of masked.matchAll(/\busing\s+([A-Za-z_]\w*)\s*=/g)) names.add(m[1]);
  return names;
}

// 找出要補的原型與插入點（第一個函式所在那一行的開頭）。
// 用到「插入點之後才宣告的型別」的函式不補原型：補了預覽反而編譯失敗。
// 板子端的 arduino-cli 不管怎樣都會把它的宣告提到最前面而編譯失敗，所以記在 lateUse，編譯前就用中文擋下（見 checkSketch）。
function analyze(code) {
  const src = normalize(code);
  const masked = maskDirectives(maskComments(src));
  const fns = findFunctions(masked);
  if (!fns.length) return { src, at: -1, line: 0, protos: [], lateUse: null };
  const at = src.lastIndexOf("\n", fns[0].start - 1) + 1;
  const line = src.slice(0, at).split("\n").length;                 // 插入點是第幾行（從 1 算）
  const before = declaredTypes(masked.slice(0, at)), after = declaredTypes(masked.slice(at));
  const late = new Set([...after].filter((t) => !before.has(t)));
  // 宣告裡出現的識別字有沒有在 late 裡（查表，不替每個函式、每個型別各組一條正規表示式）
  const lateType = (f) => (late.size ? (f.sig.match(/[A-Za-z_]\w*/g) || []).find((t) => late.has(t)) : undefined);
  const lateFn = fns.find(lateType);
  const protos = fns.filter((f) => !lateType(f)).map((f) => f.sig + ";");
  return { src, at, line, protos, lateUse: lateFn ? { type: lateType(lateFn), fn: lateFn.name } : null };
}

const sketchPrototypes = (code) => analyze(code).protos;

// 把學員的 .ino 變成預覽端可以直接編譯的 C++：補上原型，再用 #line 把行號接回學員看到的行號
function prepareSketch(code, file = "sketch.ino") {
  const { src, at, line, protos } = analyze(code);
  const top = `#line 1 "${file}"\n`;
  if (at < 0) return top + src;
  return top + src.slice(0, at) + protos.join("\n") + "\n" + `#line ${line} "${file}"\n` + src.slice(at);
}

// 程式寫的是哪一種燈板（#define PANEL 後面的數字），沒寫回 null
function panelOf(code) {
  const m = maskComments(normalize(code), true).match(/^[ \t]*#[ \t]*define[ \t]+PANEL[ \t]+(\d+)/m);
  return m ? Number(m[1]) : null;
}

// ── 程式不能讀電腦上的檔案 ─────────────────────────────────────────
// 編譯器會照程式寫的路徑去讀檔：#embed 把整個檔案讀進編出來的東西（實測讀得到編譯站那台電腦上任何檔案）、
// #include 一個不是程式的檔案會把內容帶進錯誤訊息、__has_include 可以探查檔案在不在、組合語言的 .incbin 也能讀檔，
// 網路路徑（//主機/…）還會讓電腦對外連線。學員的程式（包含別人給的 zip）不能用這些。
// 這裡的判斷「寧可多擋」：不去分辨一段字是不是在字串或註解裡（原始字串 R"(…)" 這類寫法會騙過那種分辨），
// 只認編譯器一定也這樣看的兩件事——行尾反斜線會把下一行接上來、指令的 # 前面只能有空白與 /* */ 註解。
const MAX_SKETCH = 300 * 1024;                 // 程式長度上限（字數）。官方範例最大的約 20 KB
const BAD_DIRECTIVE = new Set(["embed", "include_next", "import", "include_macros", "__include_macros", "assert", "unassert", "ident", "sccs"]);
const OK_PRAGMA = /^(?:once|pack|push_macro|pop_macro|message|region|endregion|GCC\s+(?:diagnostic|optimize|push_options|pop_options))\b/;
const DEVICE_NAME = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i;        // Windows 的裝置名稱：當檔名會去讀裝置
// #include 的檔名：用 / 分開的每一段只能是英數字、底線、點、加減號，不能用點開頭或結尾（擋掉 .、..、隱藏檔），也不能是裝置名稱。
// 列「可以用的字」而不是「不能用的字」：空白、$、全形字、上標數字這些，作業系統各有各的特殊解讀，列不完——
// 例如「CON 」（結尾一個空白）在 Windows 就是主控台，編譯器開了它會一直等輸入，韌體編譯卡到逾時、後面的人全部排不進去（審查時實測）
const INCLUDE_SEG = /^[A-Za-z0-9_+-][A-Za-z0-9_.+-]*$/;
const okInclude = (f) => f.split("/").every((seg) => INCLUDE_SEG.test(seg) && !seg.endsWith(".") && !DEVICE_NAME.test(seg));
// 不能出現的字（整份程式都看，不管是不是在字串或註解裡）。有了 ## 就能用巨集把這些字拼出來，所以 #define 裡的 ## 也擋（見下面）
const BAD_TOKEN = /\b(__has_include_next|__has_include|__has_embed|_Pragma|__asm__|__asm|asm|incbin)\b/;

// 行尾反斜線接續的行接成一行：[{ text, line（第一行的行號，從 1 算） }]
function logicalLines(src) {
  const phys = src.split("\n"), out = [];
  const spliced = (p) => { let e = p.length; while (e > 0 && (p[e - 1] === " " || p[e - 1] === "\t")) e--; return e > 0 && p[e - 1] === "\\" ? e - 1 : -1; };
  for (let k = 0; k < phys.length;) {
    const line = k + 1, parts = [];
    for (;;) {
      const p = phys[k++], cut = spliced(p);
      if (cut >= 0 && k < phys.length) parts.push(p.slice(0, cut));
      else { parts.push(p); break; }
    }
    out.push({ text: parts.length === 1 ? parts[0] : parts.join(""), line });
  }
  return out;
}

// 各種看起來是空白的字（含全形空白、不換行空白、零寬字元）：放在 # 前面時都當成空白看
const BLANK = /[\s\u0085᠎​-‏⁠﻿]/;
// 看不見的控制字元（Tab 與換行以外）。編譯器會直接跳過它們：實測 # 前面塞一個 NUL、或反斜線後面接換頁字元再換行，
// 都能把 #embed 藏起來不被下面的檢查看到。正常的程式不會有這些字元，所以整份不收
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;

// 有問題回中文說明，沒問題回 null。src 的換行已經統一成 \n
function fileAccessProblem(src) {
  const ctl = CONTROL.exec(src);
  if (ctl) return `第 ${src.slice(0, ctl.index).split("\n").length} 行有看不見的字元（控制字元），請把那一行刪掉重打。`;
  // 跳過空白與完整的 /* */；註解沒有在這一行結束就回行尾（後面的 # 會在註解結束的那一行被看到）
  const blank = (t, i) => {
    for (;;) {
      while (i < t.length && BLANK.test(t[i])) i++;
      if (!t.startsWith("/*", i)) return i;
      const e = t.indexOf("*/", i + 2);
      if (e < 0) return t.length;
      i = e + 2;
    }
  };
  for (const { text: t, line } of logicalLines(src)) {
    // 指令可能出現的位置：這一行的開頭，以及每一個 */ 的後面（# 前面只能有空白與註解）。
    // 一行裡可以有幾萬個這種位置（*/#define 一直重複），所以每個位置只能看指令附近固定長度的字，不能每次把整行重看一遍
    let covered = -1;                          // 前面的檢查已經看過的位置：從那裡面開始會得到一樣的結果，不用重看
    let lastCat = -2;                          // 這一行最後一個 ##（或 %:%:）在哪：用到才算，一行只算一次
    const at = (st) => {
      let i = blank(t, st);
      covered = Math.max(covered, i);
      const hash = t[i] === "#" ? 1 : t.startsWith("%:", i) ? 2 : 0;
      if (!hash) return null;
      i = blank(t, i + hash);
      const name = (/^[A-Za-z_]\w*/.exec(t.slice(i, i + 40)) || [""])[0];
      const end = i + name.length;             // 指令名稱後面的第一個字
      // 名稱裡不能有 \u 這種「用編號寫一個字」的寫法：#include 有的編譯器報了錯還是照樣當成 #include 去讀檔
      if (t[end] === "\\" && end < t.length - 1)
        return `第 ${line} 行的指令看不懂：# 後面要直接寫指令的名稱（例如 #include、#define）。`;
      if (BAD_DIRECTIVE.has(name))
        return name === "embed"
          ? `第 ${line} 行的 #embed 不能用：程式不能把電腦上的檔案讀進來。`
          : `第 ${line} 行的 #${name} 不能用：請改用一般的 #include <標頭檔>。`;
      if (name === "include") {
        // 檔名照編譯器的看法取：引號（或角括號）之間的字原樣算——那裡面的 /* 不是註解。後面只能有空白與註解
        const j = blank(t, end), close = t[j] === '"' ? '"' : t[j] === "<" ? ">" : "";
        const len = close ? t.slice(j + 1, j + 202).indexOf(close) : -1;      // 檔名最長 200 個字
        let ok = len > 0 && okInclude(t.slice(j + 1, j + 1 + len));
        if (ok) { const k = blank(t, j + len + 2); ok = k >= t.length || t.startsWith("//", k); }
        if (!ok) return `第 ${line} 行的 #include 只能寫標頭檔的名稱（例如 #include "BatoPixel.h"、#include <math.h>），不能寫路徑，也不能用巨集代替。`;
      }
      if (name === "pragma") {
        const j = blank(t, end);
        if (!OK_PRAGMA.test(t.slice(j, j + 60))) return `第 ${line} 行的 #pragma 這個工具不支援，請拿掉。`;
      }
      // ##（或另一種寫法 %:%:）只有在 #define 裡才是「把兩個字接成一個字」；用 # 畫圖的字串（"###"）寫在別的地方不受影響
      if (name === "define") {
        if (lastCat === -2) lastCat = Math.max(t.lastIndexOf("##"), t.lastIndexOf("%:%:"));
        if (lastCat >= end) return `第 ${line} 行的 #define 用了 ##（把兩個字接成一個字的巨集寫法）：這個工具不支援，請改用一般的寫法。`;
      }
      return null;
    };
    let msg = at(0);
    for (let k = t.indexOf("*/"); !msg && k >= 0; k = t.indexOf("*/", k + 2)) if (k + 2 > covered) msg = at(k + 2);
    if (msg) return msg;
  }
  // 不能出現的字。整行都是 // 註解的不看——除非上一行用反斜線接下來：那樣這一行開頭的 // 不一定是註解的開頭
  const phys = src.split("\n");
  for (let k = 0; k < phys.length; k++) {
    const p = phys[k];
    if (/^\s*\/\//.test(p) && !(k > 0 && /\\[ \t]*$/.test(phys[k - 1]))) continue;
    const m = BAD_TOKEN.exec(p);
    if (!m) continue;
    const w = m[1];
    if (w.startsWith("__has_")) return `第 ${k + 1} 行用了 ${w}：程式不能探查電腦上的檔案，請拿掉。`;
    if (w === "_Pragma") return `第 ${k + 1} 行用了 _Pragma：這個工具不支援，請拿掉。`;
    return `第 ${k + 1} 行用了 ${w}（組合語言）：這個工具不支援，請拿掉（就算寫在註解或字串裡也要拿掉）。`;
  }
  return null;
}

// 全域用內建型別宣告的名字，剛好是函式庫已經用掉的（buzzer、button1–4、tone、noTone）：回傳 { name, index }，沒有就回 null。
// 只有全域的才撞名：函式的參數、struct 的成員、函式裡的區域變數只是把函式庫的名字遮住，兩端都編得過，不能擋。
// 自訂型別的也不擋（另一個範例用 #ifndef NOTE_C7 … QuietBuzzer buzzer; 當舊版工具的替身，這裡不看 #if）。
// 逐字掃一次（時間跟長度成正比；以前用一條正規表示式，一長串 const 會讓它卡 20 秒）：記住大括號、小括號的深度與這一句從哪裡開始，
// 在深度 0 遇到這幾個名字時，看這一句是不是「修飾詞＋內建型別」開頭、名字是不是在宣告的位置（型別後面，或逗號後面）
const CLASH_NAME = /\b(buzzer|button[1-4]|tone|noTone)\b/g;
const DECL_HEAD = /^\s*(?:(?:const|static|volatile|constexpr|extern|unsigned|signed)\s+){0,6}(?:int|byte|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|short|long|char|float|double|bool|auto|size_t)\b/;
const DECL_SPAN = 400;                           // 一句宣告從開頭到名字最多看這麼長（再長就不是簡單的宣告，不看）
function globalNameClash(m) {
  const text = maskDirectives(m);                // # 開頭的那幾行整行不看（#define 另外檢查）
  let brace = 0, paren = 0, stmt = 0, last = 0, c;
  CLASH_NAME.lastIndex = 0;
  while ((c = CLASH_NAME.exec(text))) {
    for (let i = last; i < c.index; i++) {       // 從上一個名字掃到這一個：更新深度與「這一句從哪裡開始」
      const ch = text.charCodeAt(i);
      if (ch === 123) brace++;                                                           // {
      else if (ch === 125) { if (brace > 0) brace--; if (brace === 0 && paren === 0) stmt = i + 1; }   // }
      else if (ch === 40) paren++;                                                       // (
      else if (ch === 41) { if (paren > 0) paren--; }                                    // )
      else if (ch === 59 && brace === 0 && paren === 0) stmt = i + 1;                    // ;
    }
    last = c.index;
    if (brace !== 0 || paren !== 0 || c.index - stmt > DECL_SPAN) continue;
    const head = text.slice(stmt, c.index), t = DECL_HEAD.exec(head);
    if (!t) continue;
    const between = head.slice(t[0].length);     // 型別和這個名字中間的字
    if (/^(?:\s+(?:int|long|short|char|double)\b)*[\s*&]*$/.test(between) || /,[\s*&]*$/.test(between))
      return { name: c[1], index: c.index };
  }
  return null;
}

// 編譯前先檢查最常見的格式問題，回傳中文說明（沒問題回 null）。
// 這幾種錯誤編譯器只會給一長串英文，零基礎的學員（和他的 AI）看不出要改哪裡。
function checkSketch(code) {
  if (String(code).length > MAX_SKETCH) return `程式太長了（${Math.round(String(code).length / 1024)} KB，上限 ${MAX_SKETCH / 1024} KB）：請刪掉用不到的部分。`;
  const unsafe = fileAccessProblem(normalize(code));
  if (unsafe) return unsafe;
  const s = maskComments(normalize(code), true);
  const pos = (re) => { const m = re.exec(s); return m ? m.index : -1; };
  const inc = pos(/^[ \t]*#[ \t]*include[ \t]*["<]BatoPixel\.h[">]/m);
  const panel = pos(/^[ \t]*#[ \t]*define[ \t]+PANEL\b/m);
  const port = pos(/^[ \t]*#[ \t]*define[ \t]+PORT\b/m);
  if (!/\bvoid\s+setup\s*\(/.test(s) || !/\bvoid\s+loop\s*\(/.test(s)) {
    if (/\bvoid\s+draw\s*\(\s*float\b/.test(s))
      return "這是舊版的寫法（draw(t)）。現在的程式要有 setup() 和 loop()：把這段程式和「給 AI 的說明」一起貼給 AI，請它改寫。";
    return "程式裡要有 void setup() 和 void loop()（格式見「給 AI 的說明」）。";
  }
  if (panel < 0) return "程式最前面要寫 #define PANEL 8（8×8 燈板）或 #define PANEL 16（16×16 燈板）。";
  if (inc < 0) return "程式裡要有 #include \"BatoPixel.h\"，寫在 #define PANEL 那一行的下面。";
  if (panel > inc) return "#define PANEL 要寫在 #include \"BatoPixel.h\" 的前面。";
  if (port > inc) return "#define PORT 要寫在 #include \"BatoPixel.h\" 的前面。";
  const stripAt = pos(/^[ \t]*#[ \t]*define[ \t]+STRIP\b/m);     // 燈條：#define STRIP 幾顆（另一個接口接一條燈條）
  if (stripAt > inc) return "#define STRIP 要寫在 #include \"BatoPixel.h\" 的前面。";

  // 以下是「預覽看起來正常、板子上出事（或繞過燈板保護）」的寫法；字串與註解裡的不算
  const m = maskComments(normalize(code));
  const lineAt = (i) => m.slice(0, i).split("\n").length;
  let x;
  if ((x = /\bbp_\w+/.exec(m)))
    return `第 ${lineAt(x.index)} 行：「${x[0]}」是函式庫內部用的名字，程式裡不能用（燈板的亮度與電流保護在裡面），請只用「給 AI 的說明」列的功能。`;
  // delay() 與 delayMicroseconds() 由函式庫在編譯時擋下（訊息有行號）；這些是它擋不到的其他等待寫法
  if ((x = /\b(vTaskDelay(?:Until)?|esp_rom_delay_us|ets_delay_us)\s*\(|\(\s*(delay|delayMicroseconds)\s*\)\s*\(/.exec(m)))
    return `第 ${lineAt(x.index)} 行用了 ${x[1] || x[2]}()：動畫不能停下來等，請用 seconds() 算出現在這一格該畫什麼（見「給 AI 的說明」）。`;
  if ((x = /\bwhile\s*\(\s*!\s*Serial\s*\)/.exec(m)))
    return `第 ${lineAt(x.index)} 行的 while (!Serial) 要刪掉：沒接電腦（例如接行動電源）時板子會一直等在這裡，燈不會亮；begin() 已經把序列埠開好了。`;
  // 蜂鳴器的常見 Arduino 寫法（AI 沒看說明書時會這樣寫）。函式庫自己也會在編譯時擋 tone()／noTone()（BatoPixel.h），
  // 這裡先擋：訊息有行號，而且連帶把「自己設定蜂鳴器腳位」這件事講清楚
  //   tone()／noTone()：板子上是核心另一套做法，跟 buzzer 混用會停不下來或叫不響；腳位用猜的還會搶走麥克風、燈板、按鈕的腳。
  //   前面是 . 或 -> 的是成員（buzzer.tone()），不算。學員自己寫了叫 tone 的函式也擋：函式庫把這個名字拿去用了
  //   （用整數去呼叫會落到函式庫那個只會報錯的樣板），請他改名
  if ((x = /(?<!(?:\.|->)\s*)\b(noTone|tone)\s*\(/.exec(m)))
    return x[1] === "tone"
      ? `第 ${lineAt(x.index)} 行用了 tone()：這塊板子的蜂鳴器請改用 buzzer.beep(頻率, 秒)（響一下自己停）或 buzzer.tone(頻率)、buzzer.off()，不用寫腳位；設定蜂鳴器腳位的那幾行（pinMode() 等）也要刪掉（見「給 AI 的說明」）。如果 tone 是你自己寫的函式，請換一個名字（例如 playTone）。`
      : `第 ${lineAt(x.index)} 行用了 noTone()：這塊板子的蜂鳴器請改用 buzzer.off()；要響用 buzzer.beep(頻率, 秒) 或 buzzer.tone(頻率)，不用寫腳位（見「給 AI 的說明」）。如果 noTone 是你自己寫的函式，請換一個名字。`;
  //   #include "pitches.h"：這個檔案不在這裡，音名函式庫已經有了
  if ((x = /^[ \t]*#[ \t]*include[ \t]*["<]pitches\.h[">]/m.exec(s)))
    return `第 ${s.slice(0, x.index).split("\n").length} 行的 #include "pitches.h" 要刪掉：NOTE_C4、NOTE_E7 這些音名函式庫已經有了，直接用就好。`;
  //   全域的變數（或 #define）取名叫 buzzer、button1–button4、tone、noTone：跟函式庫已經用掉的名字撞名，編譯器只會給一長串英文
  const clash = globalNameClash(m) || ((x = /^[ \t]*#[ \t]*define[ \t]+(buzzer|button[1-4])\b/m.exec(m)) ? { name: x[1], index: x.index } : null);
  if (clash) {
    const name = clash.name, at = lineAt(clash.index);
    if (name === "tone" || name === "noTone")
      return `第 ${at} 行把全域的變數取名叫 ${name}：這個名字函式庫拿去用了（編譯器會說一串看不懂的 bp_ 開頭的錯誤），請換一個名字，例如 pitch、melody。`;
    return name === "buzzer"
      ? `第 ${at} 行宣告了叫 buzzer 的變數：buzzer 是函式庫已經準備好的蜂鳴器，直接寫 buzzer.beep(頻率, 秒) 就會響，不用設定腳位。請刪掉這一行（以及用到它的 pinMode()），或換一個名字。`
      : `第 ${at} 行宣告了叫 ${name} 的變數：${name} 是函式庫已經準備好的按鈕，直接寫 ${name}.clicked()（剛按下）或 ${name}.pressed()（按著）就能讀，不用設定腳位。請刪掉這一行（以及用到它的 pinMode()、digitalRead()），或換一個名字。`;
  }
  // 自己開 Adafruit_NeoPixel 接在主燈板的接口：會跟函式庫搶同一片燈板，而且繞過亮度保護
  // C（GPIO4）只有第一、二版的板子有，第三版（2026-11）那支腳是按鈕 4：舊程式寫 PORT C 照樣認得，但建議改接的地方只講 A、B
  const PORT_PINS = { A: 2, B: 3, C: 4 }, SPARE_PORTS = ["A", "B"];
  const pm = s.match(/^[ \t]*#[ \t]*define[ \t]+PORT[ \t]+([A-Ca-c])\b/m);
  const mainPort = pm ? pm[1].toUpperCase() : "A", mainPin = PORT_PINS[mainPort];
  const consts = {};                                   // 腳位常數：#define LED_PIN 2、const int LED_PIN = 2;
  for (const c of m.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(\d+)[ \t]*$/gm)) consts[c[1]] = Number(c[2]);
  for (const c of m.matchAll(/\b(?:const|constexpr)\s+(?:unsigned\s+)?(?:int|uint8_t|uint16_t|int16_t|byte|long|short)\s+(\w+)\s*=\s*(\d+)\s*;/g)) consts[c[1]] = Number(c[2]);
  // 寫了 #define STRIP：另一個接口的燈條也由函式庫控制（strip.dot() 那一組，含限流）。燈條用 A、B 裡燈板沒用的那一個（燈板在 C 時是 A）
  const stripPort = stripAt < 0 ? null : (mainPort === "A" ? "B" : "A");
  if (stripPort && (x = /\bAdafruit_NeoPixel\b[\s*&]*\bstrip\b/.exec(m)))
    return `第 ${lineAt(x.index)} 行宣告了叫 strip 的變數：程式開頭寫了 #define STRIP，strip 就是函式庫已經準備好的燈條，直接寫 strip.dot(第幾顆, 顏色) 就能畫，不用自己開 Adafruit_NeoPixel。請刪掉這一行（以及 strip.begin()、strip.show()、setPixelColor() 這些用法）。`;
  for (const n of m.matchAll(/\bAdafruit_NeoPixel\b[^;(]{0,200}\(\s*[^,()]{1,200},\s*(\w+)\s*[,)]/g)) {
    const pin = /^\d+$/.test(n[1]) ? Number(n[1]) : consts[n[1]];
    if (stripPort && pin === PORT_PINS[stripPort])
      return `第 ${lineAt(n.index)} 行自己開的 Adafruit_NeoPixel 接在燈條的接口 ${stripPort}（GPIO${pin}）：程式開頭寫了 #define STRIP，那個接口的燈條由函式庫控制（含亮度保護），直接寫 strip.dot(第幾顆, 顏色) 就能畫。請刪掉這一行。`;
    if (pin === mainPin) {
      const others = SPARE_PORTS.filter((k) => k !== mainPort).map((k) => `${k}（GPIO${PORT_PINS[k]}）`).join("或");
      return `第 ${lineAt(n.index)} 行自己開的 Adafruit_NeoPixel 接在主燈板的接口 ${mainPort}（GPIO${mainPin}）：主燈板由函式庫控制（含亮度保護），多接的燈板請接 ${others}。`;
    }
  }
  const { lateUse } = analyze(code);
  if (lateUse)
    return `「${lateUse.type}」要寫在第一個函式（通常是 setup()）的前面：${lateUse.fn}() 的宣告用到它，板子編譯時會把函式的宣告提到最前面，型別要先出現。`;
  return null;
}

module.exports = { normalize, maskComments, sketchPrototypes, prepareSketch, panelOf, checkSketch };
