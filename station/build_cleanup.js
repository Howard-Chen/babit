// 清掉舊的編譯暫存。舊版編譯站每編一次韌體，arduino-cli 就在建置快取的 sketches 資料夾留一份（約 18 MB，之後不會再用到；
// 2026-10-17 量到：學員版用兩天 43 份 795 MB，147 開發機 302 份 5.6 GB）。現在韌體固定放在 station/tmp/<連接埠>/fw/sketch 編，
// arduino-cli 一直用同一個建置資料夾；編譯站啟動時在背景清掉以前留下的。只刪 build.options.json 的 sketchLocation 在 station/tmp/[連接埠/]fw<數字>/ 底下的，
// 學員自己用 Arduino IDE 編的不碰。
const fs = require("fs"), path = require("path");

const OURS = /[\\/]station[\\/]tmp[\\/](\d+[\\/])?fw\d+[\\/][^\\/]+[\\/]?$/;

async function staleBuildDirs(cacheDir) {
  let ents;
  try { ents = await fs.promises.readdir(cacheDir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const d = path.join(cacheDir, e.name);
    try {
      const o = JSON.parse(await fs.promises.readFile(path.join(d, "build.options.json"), "utf8"));
      if (typeof o.sketchLocation === "string" && OURS.test(o.sketchLocation)) out.push(d);
    } catch (_) {}
  }
  return out;
}

async function dirSize(d) {
  let s = 0;
  try {
    for (const e of await fs.promises.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      s += e.isDirectory() ? await dirSize(p) : (await fs.promises.stat(p)).size;
    }
  } catch (_) {}
  return s;
}

// 刪掉幾份、共多少 bytes；刪不掉的略過（可能正被別的程式開著）。用非同步的檔案操作：編譯站照常回應
async function cleanStaleBuilds(cacheDirs) {
  let n = 0, bytes = 0;
  for (const c of cacheDirs) {
    for (const d of await staleBuildDirs(c)) {
      const b = await dirSize(d);
      try { await fs.promises.rm(d, { recursive: true, force: true }); n++; bytes += b; } catch (_) {}
    }
  }
  return { n, bytes };
}

// 舊版編譯站用過的建置快取：安裝版在 tools/arduino/cache（arduino-cli.yaml 設的），開發機是 arduino-cli 的預設位置
function buildCacheDirs({ tools, env = process.env, platform = process.platform }) {
  const home = env.USERPROFILE || env.HOME || "";
  const dflt = platform === "win32" ? env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "arduino", "sketches")
             : platform === "darwin" ? home && path.join(home, "Library", "Caches", "arduino", "sketches")
             : home && path.join(home, ".cache", "arduino", "sketches");
  return [path.join(tools, "arduino", "cache", "sketches"), dflt].filter(Boolean);
}

// 韌體編到一半被停掉（學員換了程式）或逾時：這次寫進建置資料夾的檔案可能只寫了一半，留著的話下次 arduino-cli 會當成編好的拿去用、
// 連結失敗。只刪 since（這次開始編的時間）之後寫的；之前編好的（函式庫等）照常沿用，下一次還是很快
function pruneSince(dir, since) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pruneSince(p, since);
    else { try { if (fs.statSync(p).mtimeMs >= since) fs.rmSync(p, { force: true }); } catch (_) {} }
  }
}

// 某個 sketch 在 arduino-cli 快取裡的建置資料夾（看 build.options.json 的 sketchLocation；Windows 路徑不分大小寫）
function findBuildDir(cacheDirs, sketchPath) {
  const want = path.resolve(sketchPath).toLowerCase();
  for (const c of cacheDirs) {
    let ents;
    try { ents = fs.readdirSync(c, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      try {
        const o = JSON.parse(fs.readFileSync(path.join(c, e.name, "build.options.json"), "utf8"));
        if (typeof o.sketchLocation === "string" && path.resolve(o.sketchLocation).toLowerCase() === want) return path.join(c, e.name);
      } catch (_) {}
    }
  }
  return null;
}

module.exports = { staleBuildDirs, cleanStaleBuilds, buildCacheDirs, pruneSince, findBuildDir };
