// 清掉舊的編譯暫存的單元測試（不用開編譯站）：node station/test_build_cleanup.js
// 只刪編譯站自己留下的（sketchLocation 在 station/tmp/[連接埠/]fw<數字>/ 底下），學員自己用 Arduino IDE 編的不碰
const fs = require("fs"), os = require("os"), path = require("path");
const { cleanStaleBuilds, buildCacheDirs, pruneSince, findBuildDir } = require("./build_cleanup");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };

(async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "babit-cache-"));
  const make = (name, opts) => {
    const d = path.join(cache, name);
    fs.mkdirSync(path.join(d, "sketch"), { recursive: true });
    fs.writeFileSync(path.join(d, "sketch", "sketch.ino.bin"), Buffer.alloc(1000));
    if (opts !== undefined) fs.writeFileSync(path.join(d, "build.options.json"), typeof opts === "string" ? opts : JSON.stringify(opts));
    return d;
  };
  try {
    console.log("── 只刪編譯站留下的建置資料夾");
    const old1 = make("old1", { sketchLocation: "D:\\babit-test\\station\\tmp\\8938\\fw106\\sketch", fqbn: "esp32:esp32:esp32s3" });
    const old2 = make("old2", { sketchLocation: "D:\\CSH\\CODE\\batopixel\\station\\tmp\\fw8\\BatoPixelS0" });   // 更早的版本（沒有連接埠）
    const old3 = make("old3", { sketchLocation: "/Users/s/babit/station/tmp/8930/fw3/sketch" });                  // Mac
    const ide = make("ide", { sketchLocation: "C:\\Users\\s\\Documents\\Arduino\\blink" });
    const near = make("near", { sketchLocation: "C:\\x\\station\\tmp\\8930\\fwlike\\sketch" });
    const none = make("none");
    const broken = make("broken", "{ not json");
    const r = await cleanStaleBuilds([cache, path.join(cache, "沒有這個資料夾")]);
    say(!fs.existsSync(old1) && !fs.existsSync(old2) && !fs.existsSync(old3), "編譯站留下的三份（Windows、更早的版本、Mac）都刪掉");
    say(r.n === 3 && r.bytes >= 3000, `回報刪了幾份、多大（${r.n} 份、${r.bytes} bytes）`);
    say(fs.existsSync(ide), "學員自己用 Arduino IDE 編的不碰");
    say(fs.existsSync(near), "路徑像但不是 fw<數字> 的不碰");
    say(fs.existsSync(none) && fs.existsSync(broken), "沒有或壞掉的 build.options.json 不碰");

    console.log("── 編到一半被停掉：只刪這次寫進去的檔案（可能只寫了一半），之前編好的留著沿用");
    const build = path.join(cache, "build");
    fs.mkdirSync(path.join(build, "libraries", "Wire"), { recursive: true });
    const oldObj = path.join(build, "libraries", "Wire", "Wire.cpp.o");
    const oldOpts = path.join(build, "build.options.json");
    fs.writeFileSync(oldObj, "old"); fs.writeFileSync(oldOpts, "{}");
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(oldObj, past, past); fs.utimesSync(oldOpts, past, past);
    const since = Date.now() - 1000;
    const newObj = path.join(build, "sketch", "sketch.ino.cpp.o");
    fs.mkdirSync(path.dirname(newObj), { recursive: true });
    fs.writeFileSync(newObj, "half");
    pruneSince(build, since);
    say(!fs.existsSync(newObj), "這次寫的（sketch.ino.cpp.o）刪掉");
    say(fs.existsSync(oldObj) && fs.existsSync(oldOpts), "之前編好的（函式庫的 .o、build.options.json）留著");
    pruneSince(path.join(cache, "沒有這個資料夾"), since);
    say(true, "資料夾不存在也不會出錯");

    console.log("── 找出某個 sketch 在 arduino-cli 快取裡的建置資料夾（停掉時要刪的就是它）");
    const sk = path.join(cache, "station", "tmp", "8930", "fw", "sketch");
    const ours = make("ours", { sketchLocation: sk.toUpperCase() });        // Windows 不分大小寫
    make("other", { sketchLocation: path.join(cache, "else", "sketch") });
    say(findBuildDir([path.join(cache, "沒有"), cache], sk) === ours, "找到 sketchLocation 一樣的那一份（不分大小寫）");
    say(findBuildDir([cache], path.join(cache, "nope")) === null, "找不到就回 null");

    console.log("── 要找哪些快取資料夾");
    const win = buildCacheDirs({ tools: "C:\\babit\\tools", platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\s\\AppData\\Local", USERPROFILE: "C:\\Users\\s" } });
    say(win.includes(path.join("C:\\babit\\tools", "arduino", "cache", "sketches")) && win.includes(path.join("C:\\Users\\s\\AppData\\Local", "arduino", "sketches")),
        "Windows：安裝資料夾的 tools/arduino/cache 與 arduino-cli 預設的 LOCALAPPDATA（" + win.join("、") + "）");
    const mac = buildCacheDirs({ tools: "/Users/s/babit/tools", platform: "darwin", env: { HOME: "/Users/s" } });
    say(mac.length === 2 && mac.some((d) => d.includes("Library")), "Mac：tools/arduino/cache 與 ~/Library/Caches/arduino（" + mac.join("、") + "）");
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
  }
  console.log(bad ? `\n${bad} 項失敗` : "\n全部通過");
  process.exitCode = bad ? 1 : 0;
})();
