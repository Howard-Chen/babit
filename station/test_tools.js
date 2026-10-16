// 找工具的單元測試：node station/test_tools.js（不需要編譯站、不需要真的工具）
// 用假的檔案系統模擬三種電腦：學員的 Windows（C:\babit）、開發機 147、學員的 Mac（~/babit）。
const assert = require("assert");
const path = require("path");
const { resolveTools } = require("./toolpaths.js");

let bad = 0;
function check(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { bad++; console.log("  FAIL " + name + "\n       " + e.message.split("\n").join("\n       ")); }
}

// files：存在的檔案（完整路徑）；資料夾是否存在、裡面有什麼由檔案路徑推得
function fakeFs(files, p) {
  const exists = (f) => files.includes(f) || files.some((x) => x.startsWith(f + p.sep));
  const readdir = (dir) => {
    const kids = new Set();
    for (const f of files) if (f.startsWith(dir + p.sep)) kids.add(f.slice(dir.length + 1).split(p.sep)[0]);
    if (!kids.size) throw new Error("ENOENT " + dir);
    return [...kids];
  };
  return { exists, readdir };
}

check("學員的 Windows（C:\\babit\\tools）：全部用安裝資料夾裡的工具，arduino-cli 帶 config", () => {
  const T = "C:\\babit\\tools";
  const files = [
    T + "\\emsdk\\python\\3.13.3_64bit\\python.exe", T + "\\emsdk\\node\\24.19.0_64bit\\node.exe",
    T + "\\emsdk\\upstream\\emscripten\\emcc.py", T + "\\arduino-cli\\arduino-cli.exe", T + "\\arduino-cli.yaml",
    "C:\\Program Files\\Arduino CLI\\arduino-cli.exe",     // 學員自己裝過 Arduino 也不用它
  ];
  const r = resolveTools({ root: "C:\\babit\\station", platform: "win32", env: {}, ...fakeFs(files, path.win32) });
  assert.strictEqual(r.emsdk, T + "\\emsdk");
  assert.strictEqual(r.python, T + "\\emsdk\\python\\3.13.3_64bit\\python.exe");
  assert.strictEqual(r.node, T + "\\emsdk\\node\\24.19.0_64bit\\node.exe");
  assert.strictEqual(r.emcc, T + "\\emsdk\\upstream\\emscripten\\emcc.py");
  assert.strictEqual(r.cli, T + "\\arduino-cli\\arduino-cli.exe");
  assert.deepStrictEqual(r.cliArgs, ["--config-file", T + "\\arduino-cli.yaml"]);
  assert.strictEqual(r.delimiter, ";");
  assert.strictEqual(r.firmwarePath, null);
});

check("開發機 147（沒有 tools\\）：用 D:\\CSH\\CODE\\emsdk 與 Program Files 的 arduino-cli，不帶 config", () => {
  const E = "D:\\CSH\\CODE\\emsdk";
  const files = [E + "\\python\\3.13.3_64bit\\python.exe", E + "\\node\\24.19.0_64bit\\node.exe",
                 E + "\\upstream\\emscripten\\emcc.py", "C:\\Program Files\\Arduino CLI\\arduino-cli.exe"];
  const r = resolveTools({ root: "D:\\CSH\\CODE\\batopixel\\station", platform: "win32", env: {}, ...fakeFs(files, path.win32) });
  assert.strictEqual(r.emsdk, E);
  assert.strictEqual(r.cli, "C:\\Program Files\\Arduino CLI\\arduino-cli.exe");
  assert.deepStrictEqual(r.cliArgs, []);
});

check("學員的 Mac（~/babit/tools）：bin/python3、bin/node、PATH 用冒號、韌體編譯要加 python 的資料夾", () => {
  const T = "/Users/kid/babit/tools";
  const files = [T + "/emsdk/python/3.13.3_64bit/bin/python3", T + "/emsdk/node/24.19.0_64bit/bin/node",
                 T + "/emsdk/upstream/emscripten/emcc.py", T + "/arduino-cli/arduino-cli", T + "/arduino-cli.yaml"];
  const r = resolveTools({ root: "/Users/kid/babit/station", platform: "darwin", env: { HOME: "/Users/kid" }, ...fakeFs(files, path.posix) });
  assert.strictEqual(r.python, T + "/emsdk/python/3.13.3_64bit/bin/python3");
  assert.strictEqual(r.node, T + "/emsdk/node/24.19.0_64bit/bin/node");
  assert.strictEqual(r.cli, T + "/arduino-cli/arduino-cli");
  assert.deepStrictEqual(r.cliArgs, ["--config-file", T + "/arduino-cli.yaml"]);
  assert.strictEqual(r.delimiter, ":");
  assert.strictEqual(r.firmwarePath, T + "/emsdk/python/3.13.3_64bit/bin");
});

check("環境變數 BATOPIXEL_EMSDK、BATOPIXEL_ARDUINO_CLI 優先", () => {
  const E = "E:\\my\\emsdk", T = "C:\\babit\\tools";
  const files = [E + "\\python\\3.13.3_64bit\\python.exe", E + "\\node\\24.19.0_64bit\\node.exe", E + "\\upstream\\emscripten\\emcc.py",
                 T + "\\emsdk\\upstream\\emscripten\\emcc.py", "E:\\cli\\arduino-cli.exe", T + "\\arduino-cli\\arduino-cli.exe"];
  const r = resolveTools({ root: "C:\\babit\\station", platform: "win32",
                           env: { BATOPIXEL_EMSDK: E, BATOPIXEL_ARDUINO_CLI: "E:\\cli\\arduino-cli.exe" }, ...fakeFs(files, path.win32) });
  assert.strictEqual(r.emsdk, E);
  assert.strictEqual(r.cli, "E:\\cli\\arduino-cli.exe");
});

check("什麼都沒有：錯誤訊息是中文、提示重新安裝", () => {
  assert.throws(() => resolveTools({ root: "C:\\babit\\station", platform: "win32", env: {}, ...fakeFs([], path.win32) }),
                /找不到 emsdk[\s\S]*install\.ps1/);
});

console.log(bad ? "\n" + bad + " 項失敗 → FAIL" : "\n全部通過 → PASS");
process.exit(bad ? 1 : 0);
