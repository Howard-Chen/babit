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
function functionSignature(head) {
  const h = head.replace(/\s+/g, " ").trim();
  if (!h || h.includes("=") || NOT_FUNC.test(h)) return null;     // 有 = 的是初始值（陣列、lambda）或預設參數
  const m = h.match(/^(.*?)([A-Za-z_]\w*)\s*\((.*)\)\s*(?:const\s*)?$/);
  if (!m) return null;
  const ret = m[1].trim(), name = m[2];
  if (!ret || KEYWORDS.has(name) || ret.endsWith("::")) return null; // 沒有回傳型別、關鍵字、類別成員都不是
  return { sig: h, name };
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
  for (const m of masked.matchAll(/\btypedef\b[^;]*?\b([A-Za-z_]\w*)\s*;/g)) names.add(m[1]);
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
  const late = [...after].filter((t) => !before.has(t));
  const lateType = (f) => late.find((t) => new RegExp("\\b" + t + "\\b").test(f.sig));
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

// 編譯前先檢查最常見的格式問題，回傳中文說明（沒問題回 null）。
// 這幾種錯誤編譯器只會給一長串英文，零基礎的學員（和他的 AI）看不出要改哪裡。
function checkSketch(code) {
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
  // 自己開 Adafruit_NeoPixel 接在主燈板的接口：會跟函式庫搶同一片燈板，而且繞過亮度保護
  const PORT_PINS = { A: 2, B: 3, C: 4 };
  const pm = s.match(/^[ \t]*#[ \t]*define[ \t]+PORT[ \t]+([A-Ca-c])\b/m);
  const mainPort = pm ? pm[1].toUpperCase() : "A", mainPin = PORT_PINS[mainPort];
  const consts = {};                                   // 腳位常數：#define LED_PIN 2、const int LED_PIN = 2;
  for (const c of m.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(\d+)[ \t]*$/gm)) consts[c[1]] = Number(c[2]);
  for (const c of m.matchAll(/\b(?:const|constexpr)\s+(?:unsigned\s+)?(?:int|uint8_t|uint16_t|int16_t|byte|long|short)\s+(\w+)\s*=\s*(\d+)\s*;/g)) consts[c[1]] = Number(c[2]);
  for (const n of m.matchAll(/\bAdafruit_NeoPixel\b[^;(]*\(\s*[^,()]+,\s*(\w+)\s*[,)]/g)) {
    const pin = /^\d+$/.test(n[1]) ? Number(n[1]) : consts[n[1]];
    if (pin === mainPin) {
      const others = Object.keys(PORT_PINS).filter((k) => k !== mainPort).map((k) => `${k}（GPIO${PORT_PINS[k]}）`).join("或");
      return `第 ${lineAt(n.index)} 行自己開的 Adafruit_NeoPixel 接在主燈板的接口 ${mainPort}（GPIO${mainPin}）：主燈板由函式庫控制（含亮度保護），多接的燈板請接 ${others}。`;
    }
  }
  const { lateUse } = analyze(code);
  if (lateUse)
    return `「${lateUse.type}」要寫在第一個函式（通常是 setup()）的前面：${lateUse.fn}() 的宣告用到它，板子編譯時會把函式的宣告提到最前面，型別要先出現。`;
  return null;
}

module.exports = { normalize, maskComments, sketchPrototypes, prepareSketch, panelOf, checkSketch };
