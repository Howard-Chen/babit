// BatoPixel 編譯站 — 零相依 Node HTTP 服務
// GET  /                  → 工具頁 app.html
// GET  /vendor/*          → 本地資產（esptool-js bundle）
// POST /compile/preview   → 學員的 .ino → 補函式原型 → emcc → {ok, js, ms}
//                           ?bg=1＝工具頁按執行送的：排隊中的被更新的作廢，回 {ok:false, superseded:true}（fw_queue.js）
// POST /compile/firmware  → 學員的 .ino → arduino-cli → merged.bin 裁掉 0xFF padding → {ok, key, ms, size}
//                           ?bg=1＝工具頁的背景預編：排隊中的作廢、正在編的也停掉（fw_queue.js）
// GET  /firmware/<key>    → 韌體二進位（快取）
// GET  /examples?size=8   → 範例清單 [{id, title, desc, category, mine, thumb}]（規則見 catalog.js；mine＝在「我的範例」裡）
// GET  /example?id=…      → 範例原始碼
// PUT  /example?id=…      → 存回自己的範例（內容＝程式）；DELETE /example?id=… → 刪除。只限「我的範例」，官方範例回 403
// GET  /thumb?id=…        → 範例縮圖 PNG（官方範例旁邊的，或工具頁上傳過的；沒有回 404，編譯站自己不算）
// PUT  /thumb?id=…&k=…   → 工具頁上傳算好的縮圖（內容＝PNG；k＝清單給的 thumbKey）
// POST /examples          → 新增範例 {size, name, code, overwrite?} → 存到 examples/<尺寸>/我的範例/<name>.ino
// POST /export/arduino    → 把程式打包成 Arduino IDE 可以直接開的資料夾（zip，含函式庫；規則見 arduino_export.js）
//                           ?name=＝資料夾名稱（只能英數字；沒給就自動編號 babit_月日_序號）
//                           ?title=＝作品名稱（匯出當時的範例名稱，可省略；寫進 README.txt，匯入時讀回來）
// POST /import/arduino    → 讀那種 zip（內容＝zip 檔），回 {ok, code, title, size, folder}；只讀不存，存成範例由工具頁再呼叫 POST /examples
// POST /examples/check    → 只檢查 {size, name, code} 能不能存成範例（名稱、燈板尺寸），不存；雲端版的工具頁存進瀏覽器之前用
// GET  /ai-guide          → 給 AI 的說明書（repo 根目錄的 AGENTS.md），工具頁「複製給 AI 的說明」用
// GET  /debug-sketch      → 除錯模式的內建程式「零件檢查」（firmware/panel_tests/sensors.ino）
// GET  /version           → 現在是哪個部署目標、哪一版 {target, label, source, dirty, date}（target.js），工具頁的角落顯示
// 燈板（#define PANEL）與接口（#define PORT）寫在學員程式裡，編譯站不收硬體參數。
// 編譯前先檢查最常見的格式問題（sketch_prep.js），直接回中文說明；編譯錯誤拿掉暫存路徑與色碼，學員可以整段貼給 AI。
// 啟動：run_station.ps1。連接埠預設 8930，可用 BATOPIXEL_PORT 改（開發時另開一個編譯站用）。
//
// 三個部署目標用同一份程式（見 target.js）。開發版、離線版：只綁 127.0.0.1，只給這台電腦上的工具頁用，自己的範例存在
// examples/<尺寸>/我的範例。雲端版（整班共用的主機）不一樣的地方都在這個檔案裡用 CLOUD 標出來：
//   - 不存任何人的東西：存範例、改範例、刪範例、上傳縮圖一律回 403，清單只列官方範例；自己的範例存在學員的瀏覽器（工具頁做）
//   - 會花力氣的請求要帶課堂代碼、只收對外網址送來的請求（gate.js）
//   - 同時編好幾份、每個人各排各的、排隊的份數有上限（fw_queue.js）；編譯要等的時候持續送空白，中間的代理伺服器才不會切斷
// 雲端版的設定（環境變數；容器的 compose 檔會設好）：
//   BATOPIXEL_TARGET=cloud     部署目標（映像裡的 version.json 已經寫了；在開發的 repo 測雲端模式時用這個指定）
//   BATOPIXEL_BIND             綁哪個位址（預設 127.0.0.1；容器裡是 0.0.0.0，對外只經過 Cloudflare Tunnel）
//   BATOPIXEL_ORIGINS          對外的網址，例如 https://class.bato.tw（多個用逗號分開）
//   BATOPIXEL_CLASS_CODE       課堂代碼（雲端版一定要設）
//   BATOPIXEL_FW_SLOTS、BATOPIXEL_PREVIEW_SLOTS   同時編幾份韌體、幾份預覽（預設各 1）
//   BATOPIXEL_BEAT_MS          編譯要等的時候每隔多久送一個空白（雲端版預設 10000，其他預設 0＝不送）
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { normalize, prepareSketch, checkSketch, panelOf } = require("./sketch_prep.js");
const { SIZE_DIRS, MY_DIR, exampleId, listExamples, resolveExample, validName } = require("./catalog.js");
const { resolveTools } = require("./toolpaths.js");
const { createFwQueue } = require("./fw_queue.js");
const { cleanStaleBuilds, buildCacheDirs, pruneSince, findBuildDir } = require("./build_cleanup.js");
const { validSketchName, exportName, packSketch, unpackSketch } = require("./arduino_export.js");
const { FRAMES: THUMB_FRAMES } = require("./thumb.js");      // 縮圖的格數（工具頁算的縮圖要一樣）
const { outsideDeps } = require("./deps_check.js");
const { resolveTarget, resolveVersion, gitInfo } = require("./target.js");
const { createGate, clientOf } = require("./gate.js");

const ROOT = __dirname;
const REPO = path.join(ROOT, "..");
// ── 部署目標 ─────────────────────────────────────────────────────────
// 版本檔（repo 根目錄的 version.json）是發佈離線版、建雲端版映像時寫的；開發的 repo 裡沒有。規則見 target.js
let VERSION_FILE = null;
try { VERSION_FILE = fs.readFileSync(path.join(REPO, "version.json"), "utf8"); } catch (_) {}
const TARGET = resolveTarget({ file: VERSION_FILE, envTarget: process.env.BATOPIXEL_TARGET });
const CLOUD = TARGET === "cloud";
// 設定不對就不啟動：要在開機時發現，不是上課連不上才發現
const fatal = (msg) => { console.error("編譯站沒有啟動：" + msg); process.exit(1); };
if (CLOUD && !process.env.BATOPIXEL_CLASS_CODE) fatal("雲端版一定要設課堂代碼（環境變數 BATOPIXEL_CLASS_CODE），不然網路上任何人都能用這台主機編譯");
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
const BIND = process.env.BATOPIXEL_BIND || "127.0.0.1";
const count = (v, dflt) => { const n = Math.floor(Number(v)); return n >= 1 && n <= 32 ? n : dflt; };
const FW_SLOTS = count(process.env.BATOPIXEL_FW_SLOTS, 1), PREVIEW_SLOTS = count(process.env.BATOPIXEL_PREVIEW_SLOTS, 1);
const BEAT_MS = process.env.BATOPIXEL_BEAT_MS !== undefined && process.env.BATOPIXEL_BEAT_MS !== ""
  ? Math.max(0, Math.floor(Number(process.env.BATOPIXEL_BEAT_MS)) || 0) : (CLOUD ? 10000 : 0);
// 每個人最多排幾份（正在編的不算）。工具頁正常用最多排兩三份；離線版全部請求算同一個人，不設上限
const MAX_WAITING = CLOUD ? 8 : Infinity;
// 一份程式最多編多久（毫秒），超過就連同編譯器開的子程序一起停掉。程式可以讓編譯器在「編譯的時候」做大量計算
// （constexpr、很深的樣板），一份編上幾十秒到幾分鐘（審查時實測）。雲端版整班共用，上限短：最多佔一個槽這麼久；
// 離線版是學員自己的電腦，慢的電腦第一次編比較久，維持原本寬鬆的上限。可用 BATOPIXEL_PREVIEW_TIMEOUT、BATOPIXEL_FW_TIMEOUT 改
const limitMs = (v, dflt) => { const n = Math.floor(Number(v)); return n >= 500 ? n : dflt; };
const PREVIEW_TIMEOUT = limitMs(process.env.BATOPIXEL_PREVIEW_TIMEOUT, CLOUD ? 20000 : 120000);
const FW_TIMEOUT = limitMs(process.env.BATOPIXEL_FW_TIMEOUT, CLOUD ? 90000 : 180000);
const tooSlow = (limit) => `error: 這段程式編譯超過 ${Math.round(limit / 1000)} 秒，編譯站把它停掉了。` +
  "通常是程式在「編譯的時候」做了很大量的計算（constexpr、很深的樣板或巨集）：請 AI 改成在 setup() 裡計算。";
// 誰送來的請求才收（gate.js）
let gate;
try { gate = createGate({ port: PORT, origins: process.env.BATOPIXEL_ORIGINS, classCode: process.env.BATOPIXEL_CLASS_CODE }); }
catch (e) { fatal(e.message); }
// 暫存資料夾依連接埠分開：同一個資料夾開兩個編譯站時，啟動清暫存才不會刪到對方正在編譯的檔案
const TMP = path.join(ROOT, "tmp", String(PORT));
// 韌體照槽分開編（見 compileFirmware）：槽 0 在 tmp/<連接埠>/fw（離線版只有這一個，位置跟以前一樣），其他的在 fw-slot<槽號>。
// 資料夾名稱不能是「fw 加數字」：那是舊版每編一次留一份的樣子，啟動時會被當成舊暫存清掉（build_cleanup.js）
const fwPlace = (slot) => {
  const tag = slot ? "fw-slot" + slot : "fw", dir = path.join(TMP, tag);
  // mark＝韌體編到一半的記號（內容＝開始編的時間）：編譯站在編譯中被關掉，下次啟動時補刪那次寫了一半的建置檔案
  return { sketch: path.join(dir, "sketch"), out: path.join(dir, "out"), temp: path.join(dir, "temp"),
           mark: path.join(ROOT, "tmp", PORT + "." + tag + "-compiling") };
};
// 同時編好幾份時，每個槽的 arduino-cli 用自己的暫存資料夾（temp）。Windows 上它產生函式原型用的 ctags 會在暫存資料夾開一個
// 名稱不夠獨特的檔案，幾個 ctags 同時起來就撞名：「ctags: cannot open temporary file : File exists」，那一份編譯就失敗
// （147 實測：三份同時編，約三成會有一份失敗）。只有一個槽（離線版）不會同時跑兩個，照舊用系統的暫存資料夾
function fwEnv(place) {
  if (FW_SLOTS < 2) return CLI_ENV;
  fs.rmSync(place.temp, { recursive: true, force: true });       // 上一份留下的暫存順便清掉
  fs.mkdirSync(place.temp, { recursive: true });
  const env = {};
  for (const k of Object.keys(CLI_ENV)) if (!/^(?:tmp|temp|tmpdir)$/i.test(k)) env[k] = CLI_ENV[k];   // Windows 的環境變數不分大小寫
  return Object.assign(env, { TMP: place.temp, TEMP: place.temp, TMPDIR: place.temp });
}
const BUILD_CACHES = buildCacheDirs({ tools: path.join(ROOT, "..", "tools") });
try {
  for (const name of fs.readdirSync(path.join(ROOT, "tmp"))) {
    const m = name.match(/^(\d+)\.fw(?:-slot(\d+))?-compiling$/);
    if (!m || Number(m[1]) !== PORT) continue;
    const place = fwPlace(Number(m[2] || 0));
    try {
      const since = Number(fs.readFileSync(place.mark, "utf8"));
      const d = since && findBuildDir(BUILD_CACHES, place.sketch);
      if (d) pruneSince(d, since - 2000);
    } catch (_) {}
    fs.rmSync(place.mark, { force: true });
  }
} catch (_) {}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let seq = 0;
// 預覽與韌體各自排隊（韌體慢不擋預覽），規則見 fw_queue.js。回給工具頁的結果帶上用的是第幾個槽
const enqueueFirmware = createFwQueue((code, signal, slot) => compileFirmware(code, signal, slot).then((r) => Object.assign(r, { slot })),
                                      { slots: FW_SLOTS, maxWaiting: MAX_WAITING });
const fwCache = new Map();              // sha1(學員程式＋函式庫) → { bin }
// 編好的韌體留幾份。雲端版整班共用：太少的話，別人編的會把自己剛編好、還沒下載的那份擠掉
const FW_CACHE_MAX = CLOUD ? 64 : 6;

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
    const out = path.join(dir, "out.js"), deps = path.join(dir, "deps.d");
    // 直接 execFile 呼叫 emcc.py，不經過 shell：
    // cmd /c 對「開頭是引號」的指令有特殊解析規則，會把路徑拆壞。
    // -MD -MF：順便寫出編譯器實際讀了哪些檔案，編完核對（見下面）
    const args = [
      WRAPPER, "-I", dir, "-I", FW, "-O1",
      "-sMODULARIZE=1", "-sEXPORT_NAME=createBatoPixel", "-sSINGLE_FILE=1",
      "-sEXPORTED_FUNCTIONS=" + EXPORTS.join(","),
      "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32", "-MD", "-MF", deps, "-o", out,
    ];
    const t0 = Date.now();
    // 編太久就停掉：emcc 是一支 python 程式，真正在算的是它開的 clang，所以要整串一起停（只停 emcc 的話 clang 會留在背景繼續算）
    let slow = false;
    const timer = setTimeout(() => { slow = true; killTree(child.pid); }, PREVIEW_TIMEOUT);
    const child = execFile(
      EMPY, [EMCC_PY].concat(args),
      // Mac、Linux：自成一個程式群組，停的時候整群一起停
      { maxBuffer: 32 * 1024 * 1024, env: Object.assign({}, process.env, EM_ENV), detached: process.platform !== "win32" },
      (err, stdout, stderr) => {
        clearTimeout(timer);
        let res;
        if (slow) res = { ok: false, log: tooSlow(PREVIEW_TIMEOUT) };
        else if (err) res = { ok: false, log: cleanLog([stderr, stdout, err.message].filter(Boolean).join("\n"), [dir, FW, path.dirname(WRAPPER)]) };
        else {
          // 第二道保險：編出來的東西交給頁面之前，核對編譯器只讀了編譯站自己的檔案（暫存資料夾、函式庫、預覽的外殼、emsdk）。
          // 學員的程式不能讀電腦上的檔案，正常情況在編譯前就被 checkSketch 擋下，走不到這裡
          let strays = null;
          try { strays = outsideDeps(fs.readFileSync(deps, "utf8"), [dir, FW, path.dirname(WRAPPER), EMSDK]); } catch (_) {}
          if (!strays || strays.length) {
            console.error("預覽編譯讀了編譯站以外的檔案，結果不交給頁面：" + (strays ? strays.join("、") : "讀不到相依檔"));
            res = { ok: false, log: "error: 這段程式引用了不能用的檔案，沒有辦法預覽。" };
          } else res = { ok: true, js: fs.readFileSync(out, "utf8"), ms: Date.now() - t0 };
        }
        fs.rmSync(dir, { recursive: true, force: true });
        resolve(res);
      }
    );
  });
}

// 預覽編譯排隊（離線版一次只跑一個 emcc；雲端版可以同時跑幾個，每份有自己的暫存資料夾）。工具頁按執行送的（bg）只有最新的有用：
// 排隊中的作廢；正在編的照常編完（一份才一兩秒，中途停掉 emcc 可能留下它快取的鎖）。不帶 bg 的（工具頁算縮圖用的）照順序編、不作廢
const enqueuePreview = createFwQueue(compilePreview, { slots: PREVIEW_SLOTS, maxWaiting: MAX_WAITING });

// 快取鍵必須包含函式庫，不能只用學員程式：
// 否則改了 BatoPixel.h（例如色序、腳位）後燒同一段程式，會拿到改之前的舊韌體。
function librarySignature() {
  try { return fs.readFileSync(path.join(FW, "BatoPixel.h"), "utf8"); } catch (_) { return ""; }
}

// 韌體：學員的 .ino 原封不動交給 arduino-cli（它自己會補函式原型），旁邊放一份函式庫。
// 固定放在 station/tmp/<連接埠>/fw/sketch 編：arduino-cli 看 sketch 的位置決定建置資料夾，位置固定就一直用同一個（重開編譯站也一樣）——
// 沿用上次的結果（147：第一次 35 秒、之後約 18 秒），也不會每編一次就在它的快取多一份（舊版每次一份約 18 MB，見 build_cleanup.js）。
// 不用 --build-path：自訂建置資料夾時 arduino-cli 第一次會連 ESP32 核心一起重編（147 上 80 秒）。
// signal 中止（學員已經換了程式，見 fw_queue.js）就停掉整個 arduino-cli 連同它開的編譯器，再刪掉這次寫進建置資料夾的檔案
// （可能只寫了一半；留著的話下次會被當成編好的、連結失敗），之前編好的留著。編到一半編譯站被關掉的，下次啟動時補刪（FW_MARK）。
// 也不用 --clean：它連 ESP32 核心的快取都不用。
// slot＝用第幾個槽（fw_queue.js）：同時編的每一份有自己的 sketch 資料夾（arduino-cli 的建置資料夾也就各自一個，不會互相蓋）。
// 離線版只有槽 0。每個槽第一次編比較久（要建自己的建置資料夾，ESP32 核心是共用的不用重編），之後一樣沿用上次的結果
function compileFirmware(code, signal, slot = 0) {
  const place = fwPlace(slot), FW_SKETCH = place.sketch, FW_MARK = place.mark;   // arduino-cli 規定：資料夾名稱＝.ino 檔名
  const pruneFwBuild = (since) => { const d = findBuildDir(BUILD_CACHES, FW_SKETCH); if (d) pruneSince(d, since - 2000); };   // 2 秒：檔案時間的精度
  return new Promise((resolve) => {
    // 快取鍵＝學員程式＋函式庫：任一改變都要重編，否則會燒到舊韌體
    const key = sha1(code + "\0" + librarySignature());
    const hit = fwCache.get(key);
    if (hit) { resolve({ ok: true, key, ms: 0, cached: true, size: hit.bin.length }); return; }
    if (signal && signal.aborted) { resolve({ ok: false, superseded: true }); return; }
    const out = place.out;
    fs.mkdirSync(FW_SKETCH, { recursive: true });
    fs.rmSync(out, { recursive: true, force: true });  // 這次編失敗時，不能讀到上一次的 merged.bin
    fs.writeFileSync(path.join(FW_SKETCH, "sketch.ino"), code, "utf8");
    fs.copyFileSync(path.join(FW, "BatoPixel.h"), path.join(FW_SKETCH, "BatoPixel.h"));
    const args = TOOLS.cliArgs.concat(["compile", "--no-color", "--fqbn", FQBN, "--output-dir", out, FW_SKETCH]);
    const t0 = Date.now();
    fs.writeFileSync(FW_MARK, String(t0));
    let stopped = false, slow = false;
    const stop = () => { stopped = true; killTree(child.pid); };
    // 編太久也是整串停掉（arduino-cli 連同它開的編譯器）
    const timer = setTimeout(() => { slow = true; killTree(child.pid); }, FW_TIMEOUT);
    const child = execFile(
      CLI, args,
      // Mac、Linux：自成一個程式群組，停的時候整群一起停
      { maxBuffer: 32 * 1024 * 1024, env: fwEnv(place), detached: process.platform !== "win32" },
      (err, stdout, stderr) => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", stop);
        if (stopped || slow) pruneFwBuild(t0);   // 停掉或編太久：這次寫了一半的建置檔案不能留
        fs.rmSync(FW_MARK, { force: true });
        let res;
        if (stopped) {
          res = { ok: false, superseded: true };
        } else if (slow) {
          res = { ok: false, log: tooSlow(FW_TIMEOUT) };
        } else if (err) {
          res = { ok: false, log: cleanLog((stderr || "") + "\n" + (stdout || ""), [FW_SKETCH]) };
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
        resolve(res);
      }
    );
    if (signal) signal.addEventListener("abort", stop, { once: true });
  });
}

// 停掉一個程式和它開的所有子程式（arduino-cli 會再開好幾個編譯器）
function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {});
  else { try { process.kill(-pid, "SIGKILL"); } catch (_) { try { process.kill(pid, "SIGKILL"); } catch (_) {} } }
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

// 讀二進位的內容（匯入的 zip）。超過 limit 就不留、把剩下的讀完後回 null（讓呼叫的人回一個看得懂的錯誤）；
// 大到離譜（超過 limit 的 4 倍）直接切斷連線
function readBodyRaw(req, limit, cb) {
  const chunks = [];
  let size = 0, over = false;
  req.on("data", (c) => {
    size += c.length;
    if (size > limit * 4) { req.destroy(); return; }
    if (size > limit) { over = true; chunks.length = 0; return; }
    chunks.push(c);
  });
  req.on("end", () => cb(over ? null : Buffer.concat(chunks)));
}

function json(res, obj, codeNum) {
  res.writeHead(codeNum || 200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

// ── 範例庫 ───────────────────────────────────────────────────────────
// 內容就是 examples/8x8、examples/16x16 資料夾（規則見 catalog.js）：子資料夾＝分類，.ino 檔名＝卡片標題，
// 檔頭 `// @desc 一句話` ＝卡片說明。每次請求都重掃，學員（或他的 AI）新增的檔案重新整理頁面就出現。
const EXAMPLES = path.resolve(ROOT, "..", "examples");

// 縮圖：官方範例在 .ino 旁邊有同名 .png（examples/build_thumbs.js 產生）就直接用。
// 沒有的（學員的範例、AI 直接寫進資料夾的）由工具頁算：編譯站只負責編譯，工具頁在瀏覽器的沙箱裡把預覽跑一遍、
// 排成縮圖再 PUT 上來，存進 station/cache/thumbs，下次開頁直接用。
// 編譯站自己不算縮圖：算縮圖要把那份程式跑一遍，而學員的程式（包含別人給的 zip）可以夾帶 JavaScript，
// 在這裡跑等於讓它在這台電腦上執行任意指令。瀏覽器的沙箱碰不到電腦上的檔案。
// 快取鍵＝程式內容＋函式庫，程式改了自動換新（舊的那張就不再給）。
const THUMB_CACHE = path.join(ROOT, "cache", "thumbs");
const THUMB_MAX = 200 * 1024;                 // 上傳的縮圖上限；16×16、28 格的 PNG 實際只有幾 KB
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 範例檔的縮圖在哪：{ sib: 旁邊那張官方縮圖（沒有就是 null）, key, cached: 快取檔的路徑 }
function thumbPlace(file) {
  const sib = file.replace(/\.ino$/i, ".png");
  if (fs.existsSync(sib)) return { sib, key: null, cached: null };
  const key = sha1(fs.readFileSync(file, "utf8") + "\0" + librarySignature());
  return { sib: null, key, cached: path.join(THUMB_CACHE, key + ".png") };
}
function readThumb(file) {
  const t = thumbPlace(file);
  const f = t.sib || (CLOUD ? null : t.cached);          // 雲端版只有官方範例旁邊的那張（自己的範例不在主機上，縮圖也不在）
  try { return fs.readFileSync(f); } catch (_) { return null; }
}

// 工具頁上傳算好的縮圖。只收「這個範例現在這份程式」的（k＝清單給的 thumbKey），格式與尺寸要對：
// PNG、8 位元 RGB 或 RGBA、高＝燈板的格數、寬＝高 × 縮圖的格數
function saveThumb(id, k, png) {
  const file = resolveExample(EXAMPLES, id);
  if (!file) return { status: 404, ok: false, error: "找不到這個範例" };
  const t = thumbPlace(file);
  if (t.sib) return { status: 403, ok: false, error: "官方範例的縮圖不能換" };
  if (typeof k !== "string" || k !== t.key) return { status: 409, ok: false, error: "這個範例的程式已經改過了，縮圖要重算" };
  // 燈板格數看範例放在哪個尺寸的資料夾（id 的第一段），不去解析程式：#define PANEL (8) 這種寫法編得過但解析不出來
  const n = Number(Object.keys(SIZE_DIRS).find((size) => String(id).startsWith(SIZE_DIRS[size] + "/")));
  const okPng = png.length >= 33 && png.subarray(0, 8).equals(PNG_MAGIC) && png.readUInt32BE(8) === 13 && png.toString("latin1", 12, 16) === "IHDR" &&
    png[24] === 8 && (png[25] === 2 || png[25] === 6) && png[28] === 0;
  if (!okPng) return { status: 400, ok: false, error: "縮圖要是 PNG（8 位元 RGB 或 RGBA）" };
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (!n || h !== n || w !== n * THUMB_FRAMES) return { status: 400, ok: false, error: `縮圖的尺寸要是 ${(n || 0) * THUMB_FRAMES}×${n || 0}（收到 ${w}×${h}）` };
  fs.mkdirSync(THUMB_CACHE, { recursive: true });
  const tmp = t.cached + "." + process.pid + ".tmp";      // 先寫暫存再改名：另一個編譯站同時在讀也不會讀到一半
  fs.writeFileSync(tmp, png);
  fs.renameSync(tmp, t.cached);
  return { status: 200, ok: true };
}

// ── 新增範例（工具頁「＋ 新增範例」）─────────────────────────────────────
// 能不能存成範例：名稱能不能用、燈板尺寸對不對。回 { status, ok:false, error }，或 { ok:true, size, name, code（整理過換行的）, overwrite }。
// 離線版接著存檔（saveExample）；雲端版的工具頁只問這個（POST /examples/check），過了自己存進瀏覽器——兩邊的規則是同一份
function checkExample(body) {
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
  return { ok: true, size, name, code: normalize(code), overwrite: b.overwrite === true };
}

// 把編輯區的程式存到 examples/<尺寸>/我的範例/<名稱>.ino。只會寫進「我的範例」，官方範例不會被蓋掉。
function saveExample(body) {
  const c = checkExample(body);
  if (!c.ok) return c;
  const dir = path.join(EXAMPLES, SIZE_DIRS[c.size], MY_DIR);
  const file = path.join(dir, c.name + ".ino");
  if (fs.existsSync(file) && !c.overwrite) return { status: 409, ok: false, error: "已經有同名的範例" };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, c.code, "utf8");
  return { status: 200, ok: true, id: exampleId(EXAMPLES, file) };
}

// 這個範例檔是不是在「我的範例」裡。用解析後的實際路徑判斷（8x8/我的範例/../1_基本/… 這種 id 會繞到官方範例）
function inMyDir(file) {
  const rel = path.relative(EXAMPLES, file).split(path.sep);    // [尺寸資料夾, 我的範例, …, 檔名]
  return rel.length >= 3 && rel[1] === MY_DIR;
}
// 雲端版不存任何人的東西：主機的「我的範例」資料夾裡就算有檔案（不該有），也當成不存在
const shownExample = (id) => { const f = resolveExample(EXAMPLES, id); return f && !(CLOUD && inMyDir(f)) ? f : null; };
const NO_SAVE = "雲端版不把範例存在主機上：自己的範例存在你這台電腦的瀏覽器裡。看到這個訊息請重新整理頁面再試";

// ── 改自己的範例（工具頁「💾 存回」「🗑 刪除」）：只能動「我的範例」裡的，官方範例不會被改到 ──
function myExample(id) {
  const f = resolveExample(EXAMPLES, id);
  if (!f) return { status: 404, error: "找不到這個範例" };
  if (!inMyDir(f)) return { status: 403, error: "官方範例不能改也不能刪；要改請按「＋ 新增範例」存成自己的範例" };
  const size = Number(Object.keys(SIZE_DIRS).find((k) => SIZE_DIRS[k] === path.relative(EXAMPLES, f).split(path.sep)[0]));
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
    // thumbKey：沒有官方縮圖的範例才有。工具頁拿不到縮圖（404）時自己算，上傳時帶這把鑰匙（見 saveThumb）
    // 雲端版只列官方範例：自己的範例在學員的瀏覽器裡，由工具頁接在清單後面
    json(res, listExamples(EXAMPLES, size).filter((e) => !(CLOUD && e.mine)).map((e) => {
      const item = { id: e.id, title: e.title, desc: e.desc, category: e.category, mine: e.mine,
                     thumb: "/thumb?id=" + encodeURIComponent(e.id) };
      let key = null;
      try { key = thumbPlace(e.file).key; } catch (_) {}        // 剛好被刪掉的檔案：當成沒有鑰匙
      if (key) item.thumbKey = key;
      return item;
    }));
    return true;
  }
  if (url === "/example") {
    const f = shownExample(query.get("id"));
    if (!f) { res.writeHead(404); res.end("no such example"); return true; }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(fs.readFileSync(f));
    return true;
  }
  if (url === "/thumb") {
    const f = shownExample(query.get("id"));
    const png = f ? readThumb(f) : null;                       // 只讀現成的圖；沒有就是 404，由工具頁算（見上面縮圖那一段）
    if (!png) { res.writeHead(404); res.end(); return true; }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    res.end(png);
    return true;
  }
  return false;
}

// ── 現在是哪個部署目標、哪一版（GET /version）──────────────────────────────
// 開發的 repo 每次問 git（commit、有沒有還沒 commit 的修改會變），2 秒內不重問；有版本檔的（離線版、雲端版的映像）不用問 git
let versionNow = null, versionAt = 0;
function currentVersion() {
  if (!versionNow || Date.now() - versionAt > 2000) {
    versionAt = Date.now();
    versionNow = resolveVersion({ file: VERSION_FILE, envTarget: process.env.BATOPIXEL_TARGET, git: () => gitInfo(REPO) });
  }
  return versionNow;
}

// ── 編譯的回應 ───────────────────────────────────────────────────────
// 編譯站忙的時候要排隊，編韌體本身也要幾秒到幾十秒。雲端版先把回應的開頭送出去，之後每隔 BEAT_MS 送一個空白：
// 中間的代理伺服器（Cloudflare 等 100 秒沒收到資料就切斷）才不會以為斷線。JSON 前面的空白不影響解析。
// BEAT_MS 是 0（開發版、離線版）就跟以前一樣，等到結果一次回。
function replyCompile(req, res, kind, queued) {
  const t0 = Date.now();
  let beat = null;
  if (BEAT_MS) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    beat = setInterval(() => { if (!res.writableEnded && !res.destroyed) res.write(" "); }, BEAT_MS);
    res.on("close", () => clearInterval(beat));
  }
  queued.then((r) => {
    if (r.busy) r = Object.assign({}, r, { error: "編譯站現在很忙，等幾秒再按一次" });   // 這個人排隊的份數到上限（fw_queue.js）
    if (CLOUD) {                                                 // 主機上看得到每一份編了多久、等了多久（docker logs）
      const how = r.ok ? (r.cached ? "快取" : "ok") : r.superseded ? "作廢" : r.busy ? "忙" : "錯誤";
      console.log(`${new Date().toISOString().slice(11, 19)}Z ${kind} ${(clientOf(req) || "-").slice(0, 8)} ${how} 共 ${Date.now() - t0}ms` +
                  (r.ms != null ? `（編 ${r.ms}ms）` : "") + (r.slot != null ? ` 槽${r.slot}` : ""));
    }
    if (beat) { clearInterval(beat); res.end(JSON.stringify(r)); }
    else json(res, r);
  });
}

// 一個請求出錯不能拖垮整個編譯站：沒接住的例外在這裡變成 500（已經開始回應的就直接結束），編譯站繼續服務
const server = http.createServer((req, res) => {
  try { handle(req, res); }
  catch (e) {
    console.error("請求處理出錯：" + req.method + " " + req.url + "\n" + ((e && e.stack) || e));
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(res.headersSent && res.writableEnded ? undefined : JSON.stringify({ ok: false, error: "編譯站內部錯誤" }));
  }
});

function handle(req, res) {
  let u;
  try { u = new URL(req.url, "http://localhost"); } catch (_) { u = null; }
  // 網址要是「/路徑?參數」的原樣：絕對網址、帶 .. 或 . 的路徑（會被整理成別的路徑）都不收
  if (!u || u.pathname !== req.url.split("?")[0]) { json(res, { ok: false, error: "網址格式不對" }, 400); return; }
  // 誰送來的請求才收（gate.js）：只給這台電腦上的工具頁；雲端版另外收對外的網址，會花力氣的請求要帶課堂代碼
  const no = gate(req);
  if (no) { const { status, ...rest } = no; req.resume(); json(res, Object.assign({ ok: false }, rest), status); return; }
  const url = u.pathname;
  if (req.method === "GET" && url === "/version") {
    currentVersion().then((v) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(v));
    });
    return;
  }
  // 雲端版不存任何人的東西（存範例、改範例、刪範例、上傳縮圖）
  if (CLOUD && ((url === "/example" && (req.method === "PUT" || req.method === "DELETE")) ||
                (url === "/examples" && req.method === "POST") || (url === "/thumb" && req.method === "PUT"))) {
    req.resume();
    json(res, { ok: false, error: NO_SAVE }, 403);
    return;
  }
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    // 工具頁不能被別的網站框進去（iframe）：框它的網站可以把頁面裡的縮圖沙箱換成自己的頁面，攔走送進沙箱的東西、回傳假縮圖。
    // COOP：別的網站開的視窗也拿不到這一頁的控制權
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY",
                         "Content-Security-Policy": "frame-ancestors 'none'", "Cross-Origin-Opener-Policy": "same-origin",
                         "X-Content-Type-Options": "nosniff" });
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

  if (req.method === "GET" && url.startsWith("/vendor/")) {
    // 只給 station/vendor 資料夾裡現有的檔案（照清單比對名稱，不拿請求的字串去組路徑）
    const name = url.slice("/vendor/".length);
    const have = fs.readdirSync(path.join(ROOT, "vendor"), { withFileTypes: true }).some((e) => e.isFile() && e.name === name);
    if (!have) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(fs.readFileSync(path.join(ROOT, "vendor", name)));
    return;
  }
  if (req.method === "GET" && url.startsWith("/firmware/")) {
    const key = url.slice("/firmware/".length);
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
  if (req.method === "POST" && url === "/examples/check") {
    readBody(req, (body) => {
      let c;
      try { c = checkExample(body); } catch (e) { c = { status: 500, ok: false, error: "檢查失敗：" + e.message }; }
      json(res, c.ok ? { ok: true, name: c.name, code: c.code } : { ok: false, error: c.error }, c.ok ? 200 : c.status);
    });
    return;
  }
  if (req.method === "PUT" && url === "/thumb") {
    readBodyRaw(req, THUMB_MAX, (png) => {
      if (!png) { json(res, { ok: false, error: "縮圖太大" }, 413); return; }
      let r;
      try { r = saveThumb(u.searchParams.get("id"), u.searchParams.get("k"), png); }
      catch (e) { r = { status: 500, ok: false, error: "存縮圖失敗：" + e.message }; }
      const { status, ...rest } = r;
      json(res, rest, status);
    });
    return;
  }
  if (req.method === "POST" && url === "/export/arduino") {
    readBody(req, (code) => {
      const bad = checkSketch(code);
      if (bad) { json(res, { ok: false, error: bad }, 400); return; }
      const name = u.searchParams.get("name") || exportName(new Date(), 1);
      const why = validSketchName(name);
      if (why) { json(res, { ok: false, error: why }, 400); return; }
      // title：匯出當時那張範例卡片的名稱（可省略）。寫進 README.txt，匯入時讀回來；不能當範例名稱的 packSketch 會略過
      let zip;
      try { zip = packSketch({ name, code, title: u.searchParams.get("title") || "" }); }
      catch (e) { json(res, { ok: false, error: "匯出失敗：" + e.message }, 500); return; }
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length,
                           "Content-Disposition": `attachment; filename="${name}.zip"`, "Cache-Control": "no-store" });
      res.end(zip);
    });
    return;
  }
  if (req.method === "POST" && url === "/import/arduino") {
    readBodyRaw(req, 2 * 1024 * 1024, (buf) => {
      if (!buf) { json(res, { ok: false, error: "檔案太大（上限 2 MB）：請選從 Babit 工具匯出的 zip" }, 413); return; }
      let r;
      try { r = unpackSketch(buf); } catch (e) { json(res, { ok: false, error: e.message }, 400); return; }
      json(res, Object.assign({ ok: true }, r));
    });
    return;
  }
  if (req.method === "POST" && url === "/compile/preview") {
    readBody(req, (code) => {
      const bad = checkSketch(code);
      if (bad) { json(res, { ok: false, log: "error: " + bad }); return; }
      replyCompile(req, res, "預覽", enqueuePreview(code, u.searchParams.get("bg") === "1", clientOf(req)));
    });
    return;
  }
  if (req.method === "POST" && url === "/compile/firmware") {
    readBody(req, (code) => {
      const bad = checkSketch(code);
      if (bad) { json(res, { ok: false, log: "error: " + bad }); return; }
      replyCompile(req, res, "韌體", enqueueFirmware(code, u.searchParams.get("bg") === "1", clientOf(req)));
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
}

server.listen(PORT, BIND, () => {
  console.log(`Babit 編譯站 → http://localhost:${PORT}`);
  currentVersion().then((v) => console.log(`  部署目標：${v.label}${v.source ? " · " + v.source : ""}${v.dirty ? "（有還沒 commit 的修改）" : ""}`));
  if (CLOUD) console.log(`  雲端模式：綁 ${BIND}:${PORT}；對外的網址 ${process.env.BATOPIXEL_ORIGINS || "（沒設定：只有主機自己連得到）"}；` +
                         `同時編 ${FW_SLOTS} 份韌體、${PREVIEW_SLOTS} 份預覽；課堂代碼已設定`);
  console.log(`  工具：emsdk ${EMSDK}；arduino-cli ${CLI}${TOOLS.cliArgs.length ? "（" + TOOLS.cliArgs[1] + "）" : ""}`);
  // 背景清掉舊版每編一次就留一份的編譯暫存（build_cleanup.js），不擋編譯站
  cleanStaleBuilds(BUILD_CACHES).then(({ n, bytes }) => {
    if (n) console.log(`  清掉 ${n} 份舊的編譯暫存（${Math.round(bytes / 1048576)} MB）`);
  });
});
