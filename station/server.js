// BatoPixel 編譯站 — 零相依 Node HTTP 服務
// GET  /                  → 工具頁 app.html
// GET  /vendor/*          → 本地資產（esptool-js bundle）
// POST /compile/preview   → 學員的 .ino → 補函式原型 → emcc → {ok, js, ms}
// POST /compile/firmware  → 學員的 .ino → arduino-cli → merged.bin 裁掉 0xFF padding → {ok, key, ms, size}
//                           ?bg=1＝工具頁的背景預編：排隊中的被更新的取代，回 {ok:false, superseded:true}（fw_queue.js）
// GET  /firmware/<key>    → 韌體二進位（快取）
// GET  /examples?size=8   → 範例清單 [{id, title, desc, category, mine, thumb}]（規則見 catalog.js；mine＝在「我的範例」裡）
// GET  /example?id=…      → 範例原始碼
// PUT  /example?id=…      → 存回自己的範例（內容＝程式）；DELETE /example?id=… → 刪除。只限「我的範例」，官方範例回 403
// GET  /thumb?id=…        → 範例縮圖 PNG
// POST /examples          → 新增範例 {size, name, code, overwrite?} → 存到 examples/<尺寸>/我的範例/<name>.ino
// GET  /ai-guide          → 給 AI 的說明書（repo 根目錄的 AGENTS.md），工具頁「複製給 AI 的說明」用
// GET  /debug-sketch      → 除錯模式的內建程式「感應器檢查」（firmware/panel_tests/sensors.ino）
// 燈板（#define PANEL）與接口（#define PORT）寫在學員程式裡，編譯站不收硬體參數。
// 編譯前先檢查最常見的格式問題（sketch_prep.js），直接回中文說明；編譯錯誤拿掉暫存路徑與色碼，學員可以整段貼給 AI。
// 只綁 127.0.0.1。啟動：run_station.ps1。連接埠預設 8930，可用 BATOPIXEL_PORT 改（開發時另開一個編譯站用）。
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { Worker } = require("worker_threads");
const { normalize, prepareSketch, checkSketch, panelOf } = require("./sketch_prep.js");
const { SIZE_DIRS, MY_DIR, exampleId, listExamples, resolveExample, validName } = require("./catalog.js");
const { resolveTools } = require("./toolpaths.js");
const { createFwQueue } = require("./fw_queue.js");

const ROOT = __dirname;
const FW = path.join(ROOT, "..", "firmware", "BatoPixelS0");
const WRAPPER = path.join(ROOT, "..", "preview", "wrapper.cpp");
// ── 工具：emsdk（預覽）與 arduino-cli（韌體）──────────────────────────
// 先找 babit 安裝資料夾裡的 tools/（學員電腦，install.ps1／install.sh 放的），再找開發機的位置；見 toolpaths.js。
// 可用環境變數覆寫：BATOPIXEL_EMSDK、BATOPIXEL_ARDUINO_CLI、BATOPIXEL_FQBN、BATOPIXEL_PORT
const TOOLS = resolveTools({ root: ROOT, exists: fs.existsSync, readdir: fs.readdirSync });
const EMSDK = TOOLS.emsdk;
// emcc.exe 只是無輸出的 stub；實際要用 emsdk 內建 python 跑 emcc.py
const EMPY = TOOLS.python, EMNODE = TOOLS.node, EMCC_PY = TOOLS.emcc;

// 不設 EM_CONFIG：emcc 自己找 .emscripten；指定不同路徑格式會被判定為設定變更而清空快取。
// 只替子行程補 PATH——系統 PATH 常逼近 cmd 的 2047 上限，emsdk_env.bat 的 append 會被靜默吃掉。
// python 目錄不可漏：emcc.py 重建系統函式庫時會內部呼叫 emcc.exe stub，該 stub 需要它。
const EM_ENV = {
  PATH: [path.join(EMSDK, "upstream", "emscripten"), path.join(EMSDK, "upstream", "bin"),
         path.dirname(EMNODE), path.dirname(EMPY)].join(TOOLS.delimiter) + TOOLS.delimiter + process.env.PATH,
  EMSDK: EMSDK,
  EMSDK_PYTHON: EMPY,
  EMSDK_NODE: EMNODE,
};

const CLI = TOOLS.cli;
// 韌體編譯的環境：Mac 要能找到 python3（ESP32 核心的 gen_esp32part.py）
const CLI_ENV = TOOLS.firmwarePath
  ? Object.assign({}, process.env, { PATH: TOOLS.firmwarePath + TOOLS.delimiter + process.env.PATH })
  : process.env;
const FQBN = process.env.BATOPIXEL_FQBN || "esp32:esp32:esp32s3:CDCOnBoot=cdc";
const PORT = Number(process.env.BATOPIXEL_PORT) || 8930;
// 暫存資料夾依連接埠分開：同一個資料夾開兩個編譯站時，啟動清暫存才不會刪到對方正在編譯的檔案
const TMP = path.join(ROOT, "tmp", String(PORT));

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let seq = 0;
let previewQueue = Promise.resolve();   // 預覽與韌體各自排隊，韌體慢不擋預覽
const enqueueFirmware = createFwQueue(compileFirmware);
const fwCache = new Map();              // sha1(學員程式＋函式庫) → { bin }
const FW_CACHE_MAX = 6;

const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");

// merged.bin 是整顆 4MB flash 映像，尾端幾乎全是 0xFF——裁到實際內容（4KB 對齊）
function trimFF(buf) {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0xff) end--;
  end = Math.min(buf.length, Math.ceil(end / 4096) * 4096);
  return buf.subarray(0, end);
}

// 錯誤訊息整理成學員（和他的 AI）看得懂的樣子：拿掉色碼、暫存資料夾路徑、編譯指令的回音
function cleanLog(log, dirs) {
  let s = String(log).replace(/\x1b\[[0-9;]*m/g, "");
  for (const d of dirs) for (const v of [d, d.replace(/\\/g, "/")]) s = s.split(v + "\\").join("").split(v + "/").join("");
  s = s.replace(/[A-Za-z]:[\\/][^\r\n:]*?[\\/]sketches[\\/][0-9A-Fa-f]+[\\/]sketch[\\/]/g, "");   // arduino-cli 的建置暫存
  return s.split(/\r?\n/).filter((l) => !/^(Command failed:|emcc: error: ')/.test(l)).join("\n").trim();
}

// 預覽要匯出給網頁的函式（wrapper.cpp 裡標了 EMSCRIPTEN_KEEPALIVE 的那些）
const EXPORTS = ["_bp_tick", "_bp_framebuffer", "_bp_fps", "_bp_width", "_bp_height", "_bp_pin", "_bp_warn",
  "_bp_tilt_set", "_bp_audio_buffer", "_bp_audio_capacity", "_bp_audio_set_rate", "_bp_audio_commit",
  "_bp_audio_level", "_bp_audio_band", "_bp_audio_beat", "_bp_audio_bands", "_bp_audio_sens", "_bp_audio_scale"];

// 預覽：學員的 .ino 補上函式原型（Arduino 編譯時會自動做的事）存成 student.cpp，wrapper.cpp 把它 #include 進來
function compilePreview(code) {
  return new Promise((resolve) => {
    const dir = path.join(TMP, "b" + (++seq));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "student.cpp"), prepareSketch(code), "utf8");
    const out = path.join(dir, "out.js");
    // 直接 execFile 呼叫 emcc.py，不經過 shell：
    // cmd /c 對「開頭是引號」的指令有特殊解析規則，會把路徑拆壞。
    const args = [
      WRAPPER, "-I", dir, "-I", FW, "-O1",
      "-sMODULARIZE=1", "-sEXPORT_NAME=createBatoPixel", "-sSINGLE_FILE=1",
      "-sEXPORTED_FUNCTIONS=" + EXPORTS.join(","),
      "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32", "-o", out,
    ];
    const t0 = Date.now();
    execFile(
      EMPY, [EMCC_PY].concat(args),
      { timeout: 120000, maxBuffer: 32 * 1024 * 1024, env: Object.assign({}, process.env, EM_ENV) },
      (err, stdout, stderr) => {
        let res;
        if (err) res = { ok: false, log: cleanLog([stderr, stdout, err.message].filter(Boolean).join("\n"), [dir, FW, path.dirname(WRAPPER)]) };
        else res = { ok: true, js: fs.readFileSync(out, "utf8"), ms: Date.now() - t0 };
        fs.rmSync(dir, { recursive: true, force: true });
        resolve(res);
      }
    );
  });
}

// 預覽編譯排隊（一次只跑一個 emcc）；之後縮圖產生也走這裡
function queuePreview(code) {
  const p = previewQueue.then(() => compilePreview(code));
  previewQueue = p.catch(() => {});
  return p;
}

// 快取鍵必須包含函式庫，不能只用學員程式：
// 否則改了 BatoPixel.h（例如色序、腳位）後燒同一段程式，會拿到改之前的舊韌體。
function librarySignature() {
  try { return fs.readFileSync(path.join(FW, "BatoPixel.h"), "utf8"); } catch (_) { return ""; }
}

// 韌體：學員的 .ino 原封不動交給 arduino-cli（它自己會補函式原型），旁邊放一份函式庫
function compileFirmware(code) {
  return new Promise((resolve) => {
    // 快取鍵＝學員程式＋函式庫：任一改變都要重編，否則會燒到舊韌體
    const key = sha1(code + "\0" + librarySignature());
    const hit = fwCache.get(key);
    if (hit) { resolve({ ok: true, key, ms: 0, cached: true, size: hit.bin.length }); return; }
    const dir = path.join(TMP, "fw" + (++seq));
    const sk = path.join(dir, "sketch");               // arduino-cli 規定：資料夾名稱＝.ino 檔名
    fs.mkdirSync(sk, { recursive: true });
    fs.writeFileSync(path.join(sk, "sketch.ino"), code, "utf8");
    fs.copyFileSync(path.join(FW, "BatoPixel.h"), path.join(sk, "BatoPixel.h"));
    const out = path.join(dir, "out");
    const t0 = Date.now();
    execFile(
      CLI, TOOLS.cliArgs.concat(["compile", "--no-color", "--fqbn", FQBN, "--output-dir", out, sk]),
      { timeout: 180000, maxBuffer: 32 * 1024 * 1024, env: CLI_ENV },
      (err, stdout, stderr) => {
        let res;
        if (err) {
          res = { ok: false, log: cleanLog((stderr || "") + "\n" + (stdout || ""), [sk]) };
        } else {
          const merged = path.join(out, "sketch.ino.merged.bin");
          if (!fs.existsSync(merged)) {
            res = { ok: false, log: "merged.bin not found（esp32 core 版本行為改變？）" };
          } else {
            const bin = Buffer.from(trimFF(fs.readFileSync(merged)));
            fwCache.set(key, { bin });
            while (fwCache.size > FW_CACHE_MAX) fwCache.delete(fwCache.keys().next().value);
            res = { ok: true, key, ms: Date.now() - t0, size: bin.length };
          }
        }
        fs.rmSync(dir, { recursive: true, force: true });
        resolve(res);
      }
    );
  });
}

function readBody(req, cb) {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > 1e6) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", () => cb(Buffer.concat(chunks).toString("utf8")));
}

function json(res, obj, codeNum) {
  res.writeHead(codeNum || 200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

// ── 範例庫 ───────────────────────────────────────────────────────────
// 內容就是 examples/8x8、examples/16x16 資料夾（規則見 catalog.js）：子資料夾＝分類，.ino 檔名＝卡片標題，
// 檔頭 `// @desc 一句話` ＝卡片說明。每次請求都重掃，學員（或他的 AI）新增的檔案重新整理頁面就出現。
const EXAMPLES = path.resolve(ROOT, "..", "examples");

// 縮圖：官方範例在 .ino 旁邊有同名 .png（examples/build_thumbs.js 產生）就直接用；
// 沒有的（學員的範例、AI 直接寫進資料夾的）由編譯站編譯、跑一遍，存進 station/cache/thumbs。
// 快取鍵＝程式內容＋函式庫，程式改了自動換新；編不過或卡住的記下來，不會每次開頁都重試。
const THUMB_CACHE = path.join(ROOT, "cache", "thumbs");
const thumbJobs = new Map();            // 快取鍵 → 進行中的 Promise（同一張圖同時被要很多次只做一次）
const thumbFailed = new Set();

function thumbFor(file) {
  const sib = file.replace(/\.ino$/i, ".png");
  if (fs.existsSync(sib)) return Promise.resolve(fs.readFileSync(sib));
  const code = fs.readFileSync(file, "utf8");
  const key = sha1(code + "\0" + librarySignature());
  const cached = path.join(THUMB_CACHE, key + ".png");
  if (fs.existsSync(cached)) return Promise.resolve(fs.readFileSync(cached));
  if (thumbFailed.has(key)) return Promise.resolve(null);
  if (!thumbJobs.has(key)) thumbJobs.set(key, makeThumb(code, key, cached).finally(() => thumbJobs.delete(key)));
  return thumbJobs.get(key);
}

async function makeThumb(code, key, cached) {
  const r = checkSketch(code) ? { ok: false } : await queuePreview(code);
  const png = r.ok ? await renderInWorker(r.js, code) : null;
  if (!png) { thumbFailed.add(key); return null; }
  fs.mkdirSync(THUMB_CACHE, { recursive: true });
  const tmp = cached + "." + process.pid + ".tmp";      // 先寫暫存再改名：另一個編譯站同時在讀也不會讀到一半
  fs.writeFileSync(tmp, png);
  fs.renameSync(tmp, cached);
  return png;
}

// 縮圖在另一個執行緒跑：學員的程式就算是純無窮迴圈，時間到也只停掉那個執行緒，編譯站照常回應
function renderInWorker(js, code, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const w = new Worker(path.join(ROOT, "thumb_worker.js"), { workerData: { js, code } });
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      w.terminate();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    w.once("message", (m) => finish(m && m.ok ? Buffer.from(m.png) : null));
    w.once("error", () => finish(null));
    w.once("exit", () => finish(null));
  });
}

// ── 新增範例（工具頁「＋ 新增範例」）─────────────────────────────────────
// 把編輯區的程式存到 examples/<尺寸>/我的範例/<名稱>.ino。只會寫進「我的範例」，官方範例不會被蓋掉。
function saveExample(body) {
  let b;
  try { b = JSON.parse(body); } catch (_) { return { status: 400, ok: false, error: "格式錯誤" }; }
  if (!b || typeof b !== "object") return { status: 400, ok: false, error: "格式錯誤" };
  const size = b.size;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const code = typeof b.code === "string" ? b.code : "";
  if (!SIZE_DIRS[size]) return { status: 400, ok: false, error: "燈板只能是 8×8 或 16×16" };
  const bad = validName(name);
  if (bad) return { status: 400, ok: false, error: bad };
  if (!code.trim()) return { status: 400, ok: false, error: "編輯區是空的，沒有程式可以存" };
  const p = panelOf(code);
  if (p == null) return { status: 400, ok: false, error: `程式最前面要寫 #define PANEL ${size}，才知道是哪一種燈板的範例` };
  if (p !== size) return { status: 400, ok: false, error: `這段程式是 ${p}×${p} 燈板的（#define PANEL ${p}），不能存到 ${size}×${size} 的範例；要存請先切換到 ${p}×${p}` };
  const dir = path.join(EXAMPLES, SIZE_DIRS[size], MY_DIR);
  const file = path.join(dir, name + ".ino");
  if (fs.existsSync(file) && b.overwrite !== true) return { status: 409, ok: false, error: "已經有同名的範例" };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, normalize(code), "utf8");
  return { status: 200, ok: true, id: exampleId(EXAMPLES, file) };
}

// ── 改自己的範例（工具頁「💾 存回」「🗑 刪除」）：只能動「我的範例」裡的，官方範例不會被改到 ──
// 用解析後的實際路徑判斷（8x8/我的範例/../1_基本/… 這種 id 會繞到官方範例）
function myExample(id) {
  const f = resolveExample(EXAMPLES, id);
  if (!f) return { status: 404, error: "找不到這個範例" };
  const rel = path.relative(EXAMPLES, f).split(path.sep);       // [尺寸資料夾, 我的範例, …, 檔名]
  if (rel.length < 3 || rel[1] !== MY_DIR) return { status: 403, error: "官方範例不能改也不能刪；要改請按「＋ 新增範例」存成自己的範例" };
  const size = Number(Object.keys(SIZE_DIRS).find((k) => SIZE_DIRS[k] === rel[0]));
  return { file: f, size };
}

function updateExample(id, code) {
  const m = myExample(id);
  if (m.error) return { status: m.status, ok: false, error: m.error };
  if (!code.trim()) return { status: 400, ok: false, error: "編輯區是空的，沒有程式可以存" };
  const p = panelOf(code);
  if (p == null) return { status: 400, ok: false, error: `程式最前面要寫 #define PANEL ${m.size}，才知道是哪一種燈板的範例` };
  if (p !== m.size) return { status: 400, ok: false, error: `這段程式是 ${p}×${p} 燈板的（#define PANEL ${p}），不能存回 ${m.size}×${m.size} 的範例；要存請切換到 ${p}×${p} 再按「＋ 新增範例」` };
  fs.writeFileSync(m.file, normalize(code), "utf8");
  return { status: 200, ok: true, id };
}

function deleteExample(id) {
  const m = myExample(id);
  if (m.error) return { status: m.status, ok: false, error: m.error };
  fs.unlinkSync(m.file);
  return { status: 200, ok: true };
}

function serveExamples(req, res, url, query) {
  if (url === "/examples") {
    const size = Number(query.get("size"));
    if (!SIZE_DIRS[size]) { json(res, { ok: false, error: "size 只能是 8 或 16" }, 400); return true; }
    json(res, listExamples(EXAMPLES, size).map((e) => ({
      id: e.id, title: e.title, desc: e.desc, category: e.category, mine: e.mine,
      thumb: "/thumb?id=" + encodeURIComponent(e.id),
    })));
    return true;
  }
  if (url === "/example") {
    const f = resolveExample(EXAMPLES, query.get("id"));
    if (!f) { res.writeHead(404); res.end("no such example"); return true; }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(fs.readFileSync(f));
    return true;
  }
  if (url === "/thumb") {
    const f = resolveExample(EXAMPLES, query.get("id"));
    if (!f) { res.writeHead(404); res.end(); return true; }
    thumbFor(f).then((png) => {
      if (!png) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
      res.end(png);
    }).catch(() => { res.writeHead(500); res.end(); });
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const url = u.pathname;
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(path.join(ROOT, "app.html")));
    return;
  }
  if (req.method === "GET" && serveExamples(req, res, url, u.searchParams)) return;
  if (req.method === "GET" && url === "/debug-sketch") {
    fs.readFile(path.join(ROOT, "..", "firmware", "panel_tests", "sensors.ino"), (err, buf) => {
      if (err) { res.writeHead(404); res.end("sensors.ino not found"); return; }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(buf);
    });
    return;
  }
  if (req.method === "GET" && url === "/ai-guide") {
    fs.readFile(path.join(ROOT, "..", "AGENTS.md"), (err, buf) => {
      if (err) { res.writeHead(404); res.end("AGENTS.md not found"); return; }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(buf);
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/vendor/")) {
    const name = path.basename(req.url);   // 防路徑跳脫
    const fp = path.join(ROOT, "vendor", name);
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(fs.readFileSync(fp));
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/firmware/")) {
    const key = path.basename(req.url);
    const hit = fwCache.get(key);
    if (!hit) { json(res, { ok: false, log: "韌體快取不存在，請重新編譯" }, 404); return; }
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": hit.bin.length });
    res.end(hit.bin);
    return;
  }
  if ((req.method === "PUT" || req.method === "DELETE") && url === "/example") {
    const id = u.searchParams.get("id");
    const reply = (fn) => {
      let r;
      try { r = fn(); } catch (e) { r = { status: 500, ok: false, error: (req.method === "PUT" ? "存回" : "刪除") + "失敗：" + e.message }; }
      const { status, ...rest } = r;
      json(res, rest, status);
    };
    if (req.method === "PUT") readBody(req, (code) => reply(() => updateExample(id, code)));
    else reply(() => deleteExample(id));
    return;
  }
  if (req.method === "POST" && url === "/examples") {
    readBody(req, (body) => {
      let r;
      try { r = saveExample(body); } catch (e) { r = { status: 500, ok: false, error: "存檔失敗：" + e.message }; }
      const { status, ...rest } = r;
      json(res, rest, status);
    });
    return;
  }
  if (req.method === "POST" && url === "/compile/preview") {
    readBody(req, (code) => {
      const bad = checkSketch(code);
      if (bad) { json(res, { ok: false, log: "error: " + bad }); return; }
      queuePreview(code)
        .then((r) => json(res, r))
        .catch((e) => json(res, { ok: false, log: String(e) }, 500));
    });
    return;
  }
  if (req.method === "POST" && url === "/compile/firmware") {
    readBody(req, (code) => {
      const bad = checkSketch(code);
      if (bad) { json(res, { ok: false, log: "error: " + bad }); return; }
      enqueueFirmware(code, u.searchParams.get("bg") === "1").then((r) => json(res, r));
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Babit 編譯站 → http://localhost:${PORT}`);
  console.log(`  工具：emsdk ${EMSDK}；arduino-cli ${CLI}${TOOLS.cliArgs.length ? "（" + TOOLS.cliArgs[1] + "）" : ""}`);
});
