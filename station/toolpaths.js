// 找編譯站要用的工具：emsdk（網頁預覽）與 arduino-cli（韌體）。
// 先找 babit 安裝資料夾裡的 tools/（install.ps1／install.sh 從隨身碟裝的，學員電腦），再找開發機的位置（147）。
// 環境變數 BATOPIXEL_EMSDK、BATOPIXEL_ARDUINO_CLI 永遠優先。Windows 與 Mac 的執行檔名稱、PATH 分隔符號不同。
// 純函式：檔案系統由呼叫端傳入（exists、readdir），單元測試可以假造兩種平台的安裝配置。
const path = require("path");

function resolveTools({ root, platform = process.platform, env = process.env, exists, readdir }) {
  const win = platform === "win32";
  const p = win ? path.win32 : path.posix;
  const tools = p.join(root, "..", "tools");
  const home = env.USERPROFILE || env.HOME || "";
  const first = (list, what) => {
    for (const c of list) if (c && exists(c)) return c;
    throw new Error("找不到 " + what + "。已試過：\n  " + list.filter(Boolean).join("\n  ") +
                    "\n請重新執行安裝（install.ps1／install.sh），或設定對應的環境變數");
  };
  // emsdk 裡的 python、node 資料夾帶版本號（例：python/3.13.3_64bit）→ 挑第一個有執行檔的
  const versioned = (base, rel) => {
    let dirs;
    try { dirs = readdir(base).slice().sort(); } catch (_) { return null; }
    for (const d of dirs) { const f = p.join(base, d, rel); if (exists(f)) return f; }
    return null;
  };
  const emsdk = first([env.BATOPIXEL_EMSDK, p.join(tools, "emsdk"),
                       ...(win ? ["D:\\CSH\\CODE\\emsdk", "C:\\emsdk"] : []), home && p.join(home, "emsdk")], "emsdk");
  const python = first([versioned(p.join(emsdk, "python"), win ? "python.exe" : "bin/python3")], "emsdk 的 python");
  const node = first([versioned(p.join(emsdk, "node"), win ? "node.exe" : "bin/node")], "emsdk 的 node");
  const emcc = first([p.join(emsdk, "upstream", "emscripten", "emcc.py")], "emcc.py");
  const cli = first([env.BATOPIXEL_ARDUINO_CLI, p.join(tools, "arduino-cli", win ? "arduino-cli.exe" : "arduino-cli"),
    ...(win ? ["C:\\Program Files\\Arduino CLI\\arduino-cli.exe", "C:\\Program Files (x86)\\Arduino CLI\\arduino-cli.exe",
               env.LOCALAPPDATA && p.join(env.LOCALAPPDATA, "Programs", "Arduino CLI", "arduino-cli.exe")]
            : ["/opt/homebrew/bin/arduino-cli", "/usr/local/bin/arduino-cli"])], "arduino-cli");
  const cfg = p.join(tools, "arduino-cli.yaml");
  return {
    emsdk, python, node, emcc, cli,
    // 安裝版：ESP32 核心與函式庫都在 tools/arduino 底下（config 指過去），不碰學員自己的 Arduino 資料夾
    cliArgs: exists(cfg) ? ["--config-file", cfg] : [],
    delimiter: win ? ";" : ":",
    // Mac：ESP32 核心用 python3 跑 gen_esp32part.py（Windows 是 .exe）→ 韌體編譯時把 emsdk 的 python 放進 PATH，
    // 學員不必裝 Apple 開發者工具
    firmwarePath: win ? null : p.dirname(python),
  };
}

module.exports = { resolveTools };
