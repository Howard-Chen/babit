// 匯出 Arduino 資料夾／匯入 zip 的驗收：node station/test_arduino_export.js（需先啟動編譯站，電腦要有 arduino-cli 與 esp32 套件）
//   1. POST /export/arduino 回傳的 zip：結構、檔名、錯誤處理
//   2. 把 zip 解到暫存資料夾，用「沒裝任何函式庫」的 Arduino 環境實際編譯——跟學員剛裝好 Arduino IDE 與 esp32 開發板套件一樣：
//      設定都對 → 編得過；USB CDC On Boot 沒開、開發板選錯 → 用中文訊息擋下
//   3. POST /import/arduino 把 zip 讀回程式、作品名稱、燈板尺寸；不寫進編譯站的任何資料夾
const fs = require("fs"), os = require("os"), path = require("path");
const { execFile, execFileSync, spawnSync } = require("child_process");
const { zipRead, zipWrite } = require("./zip.js");
const { resolveTools } = require("./toolpaths.js");

const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";
const EX = path.join(__dirname, "..", "examples");
const CODE = fs.readFileSync(path.join(EX, "16x16", "1_基本", "04_生命遊戲.ino"), "utf8").replace(/\r\n/g, "\n");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const post = (p, body, type) => fetch(STATION + p, { method: "POST", headers: { "content-type": type || "text/plain; charset=utf-8" }, body });
const myFiles = () => ["8x8", "16x16"].flatMap((d) => {
  try { return fs.readdirSync(path.join(EX, d, "我的範例")).map((f) => d + "/" + f); } catch (_) { return []; }
}).sort().join("|");

(async () => {
  try { await fetch(STATION + "/"); } catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message + "\n請先啟動 station\\run_station.ps1");
    process.exit(1);
  }
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "babit_ardu_"));
  try {
    console.log("── 匯出");
    let r = await post("/export/arduino?name=babit_1120_01", CODE);
    const zip = Buffer.from(await r.arrayBuffer());
    say(r.status === 200 && r.headers.get("content-type") === "application/zip" &&
        /filename="babit_1120_01\.zip"/.test(r.headers.get("content-disposition") || ""),
        "回傳 zip，下載檔名 babit_1120_01.zip（" + r.status + "、" + zip.length + " bytes）");
    let files = {};
    try { files = Object.fromEntries(zipRead(zip).map((e) => [e.name, e])); } catch (e) { say(false, "zip 讀不懂：" + e.message); }
    const names = Object.keys(files);
    say(names.length > 0 && names.every((n) => n.startsWith("babit_1120_01/")), "所有檔案都在同名資料夾 babit_1120_01/ 裡（" + names.length + " 個檔）");
    const ino = files["babit_1120_01/babit_1120_01.ino"];
    say(!!ino && ino.read().toString("utf8") === CODE, "babit_1120_01.ino 就是送出去的程式");
    say(["BatoPixel.h", "README.txt", "src/Adafruit_NeoPixel/Adafruit_NeoPixel.h", "src/Adafruit_NeoPixel/Adafruit_NeoPixel.cpp", "src/Adafruit_NeoPixel/esp.c"]
          .every((n) => files["babit_1120_01/" + n]), "附上 BatoPixel.h、README.txt、src/Adafruit_NeoPixel");

    r = await post("/export/arduino", CODE);
    say(r.status === 200 && /filename="babit_\d{4}_\d{2,}\.zip"/.test(r.headers.get("content-disposition") || ""),
        "沒給名稱就自動編號（" + (r.headers.get("content-disposition") || r.status) + "）");
    for (const [name, why] of [["生命遊戲", "中文"], ["a b", "空白"], ["../x", "斜線"], ["x".repeat(64), "超過 63 字"], ["x.", "點結尾"]]) {
      r = await post("/export/arduino?name=" + encodeURIComponent(name), CODE);
      const j = await r.json().catch(() => ({}));
      say(r.status === 400 && j.ok === false && !!j.error, "名稱不合 Arduino 規定（" + why + "）：400「" + j.error + "」");
    }
    r = await post("/export/arduino?name=ok_name", "void setup() {}\nvoid loop() {}\n");
    let j = await r.json().catch(() => ({}));
    say(r.status === 400 && j.ok === false && !!j.error, "程式格式不對（少了 PANEL 與函式庫）不匯出：400「" + String(j.error).split("\n")[0] + "」");
    // 作品名稱（匯出當時那張範例卡片的名稱）：寫進 README.txt，匯入時讀回來
    const readmeOf = (buf) => { try { return zipRead(buf).find((e) => /\/README\.txt$/.test(e.name)).read().toString("utf8"); } catch (_) { return ""; } };
    r = await post("/export/arduino?name=babit_1120_02&title=" + encodeURIComponent("我的彩虹"), CODE);
    const zipTitled = Buffer.from(await r.arrayBuffer());
    say(r.status === 200 && /^作品名稱：我的彩虹\r$/m.test(readmeOf(zipTitled)), "帶作品名稱匯出：README.txt 第二行寫「作品名稱：我的彩虹」");
    r = await post("/import/arduino", zipTitled, "application/zip");
    j = await r.json().catch(() => ({}));
    say(r.status === 200 && j.title === "我的彩虹" && j.code === CODE, "匯入這個 zip：作品名稱是「" + j.title + "」（README 寫的，不是程式第一行的「生命遊戲」）");
    r = await post("/export/arduino?name=babit_1120_03&title=" + encodeURIComponent("a/b"), CODE);
    const zipBadTitle = Buffer.from(await r.arrayBuffer());
    say(r.status === 200 && readmeOf(zipBadTitle).includes("babit_1120_03.ino") && !readmeOf(zipBadTitle).includes("作品名稱"),
        "作品名稱不能當範例名稱（有斜線）：照樣匯出，只是不寫名稱（" + r.status + "）");

    console.log("── 用乾淨的 Arduino 環境編譯匯出的資料夾（沒裝任何函式庫）");
    const T = resolveTools({ root: __dirname, exists: fs.existsSync, readdir: fs.readdirSync });
    const toolEnv = T.firmwarePath ? Object.assign({}, process.env, { PATH: T.firmwarePath + T.delimiter + process.env.PATH }) : process.env;
    // 開發板套件用編譯站那一份（T.cliArgs 是編譯站的設定檔，只拿來問套件裝在哪）；
    // 乾淨環境的指令一律只帶下面這份測試自己的設定檔——學員版的設定檔指到有裝函式庫的資料夾，混著用就不乾淨了
    const dataDir = execFileSync(T.cli, T.cliArgs.concat(["config", "get", "directories.data"]), { encoding: "utf8" }).trim();
    const fwd = (p) => p.split(path.sep).join("/");
    // ESP32 核心的編譯快取留在 station/tmp（不進版控）：第一次約 80 秒，之後每次約 20 秒
    const CACHE = path.join(__dirname, "tmp", "arduino_export_cache");
    fs.mkdirSync(path.join(TMP, "user", "libraries"), { recursive: true });
    fs.writeFileSync(path.join(TMP, "cli.yaml"),
      `directories:\n  data: ${fwd(dataDir)}\n  user: ${fwd(path.join(TMP, "user"))}\nbuild_cache:\n  path: ${fwd(CACHE)}\nupdater:\n  enable_notification: false\n`);
    for (const e of Object.values(files)) {
      const f = path.join(TMP, "sketch", e.name);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, e.read());
    }
    const sketch = path.join(TMP, "sketch", "babit_1120_01");
    // 編譯用非同步的方式跑：用 spawnSync 會把 node 整個卡住十幾秒，期間編譯站關掉閒置的連線，下一個請求就會 ECONNRESET
    const compile = (fqbn, tag, extra = []) => new Promise((done) => {
      const t0 = Date.now();
      execFile(T.cli, ["--config-file", path.join(TMP, "cli.yaml"), "compile", "--no-color", "--fqbn", fqbn,
                       "--build-path", path.join(TMP, "build", tag)].concat(extra, [sketch]),
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: toolEnv },
        (err, stdout, stderr) => done({ ok: !err, out: (stdout || "") + (stderr || ""), sec: Math.round((Date.now() - t0) / 1000) }));
    });
    const libs = spawnSync(T.cli, ["--config-file", path.join(TMP, "cli.yaml"), "lib", "list"], { encoding: "utf8", env: toolEnv });
    say(libs.status === 0 && !/NeoPixel/i.test(libs.stdout || ""), "測試環境沒有裝 Adafruit NeoPixel（只靠資料夾自己帶的那一份）" +
        (libs.status === 0 ? "" : "：lib list 失敗 " + String(libs.stderr || libs.error || "").slice(0, 120)));
    let c = await compile("esp32:esp32:esp32s3:CDCOnBoot=cdc", "ok");
    say(c.ok, "開發板 ESP32S3 Dev Module、USB CDC On Boot 開：編得過（" + c.sec + " 秒）" +
              (c.ok ? "" : "\n" + c.out.split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 4).join("\n")));
    c = await compile("esp32:esp32:esp32s3", "nocdc");
    say(!c.ok && c.out.includes("USB CDC On Boot") && c.out.includes("Enabled"),
        "USB CDC On Boot 沒開（Arduino IDE 的預設）：中文訊息擋下，講明要選 Enabled" + (c.ok ? "（結果編過了）" : ""));
    c = await compile("esp32:esp32:esp32c3", "c3");
    say(!c.ok && c.out.includes("ESP32S3 Dev Module"), "開發板選錯（ESP32C3）：中文訊息擋下，講明要選 ESP32S3 Dev Module" + (c.ok ? "（結果編過了）" : ""));
    // 別的 ESP32-S3 板子：晶片一樣，但腳位對應、快閃記憶體設定可能不同，燒進去不一定開得了機
    c = await compile("esp32:esp32:esp32s3box", "box");
    say(!c.ok && c.out.includes("ESP32S3 Dev Module"), "選了別的 ESP32-S3 板子（ESP32-S3-Box）：中文訊息擋下，講明要選 ESP32S3 Dev Module" + (c.ok ? "（結果編過了）" : ""));
    // 開發板清單裡的「ESP32S3 Dev Module Octal (WROOM2)」：名稱幾乎一樣，但快閃記憶體的接法不同，燒進燈板會開不了機
    c = await compile("esp32:esp32:esp32s3-octal:CDCOnBoot=cdc", "octal");
    say(!c.ok && c.out.includes("Octal") && c.out.includes("ESP32S3 Dev Module"),
        "選到名稱很像的 ESP32S3 Dev Module Octal (WROOM2)：中文訊息擋下，講明不是後面有 Octal 的那一個" + (c.ok ? "（結果編過了）" : ""));
    // USB Mode 改成 USB-OTG：板子判斷不出接的是電腦還是充電器（限流會用錯）
    c = await compile("esp32:esp32:esp32s3:CDCOnBoot=cdc,USBMode=default", "otg");
    say(!c.ok && c.out.includes("USB Mode") && c.out.includes("Hardware CDC and JTAG"),
        "USB Mode 被改成 USB-OTG (TinyUSB)：中文訊息擋下，講明要選 Hardware CDC and JTAG" + (c.ok ? "（結果編過了）" : ""));
    // 要試別的板子的人可以自己關掉這些檢查（#define BP_ANY_BOARD）——檢查只是擋選錯，不是把函式庫鎖死
    const inoFile = path.join(sketch, "babit_1120_01.ino");
    const inoText = fs.readFileSync(inoFile, "utf8");
    fs.writeFileSync(inoFile, "#define BP_ANY_BOARD\n" + inoText);
    c = await compile("esp32:esp32:esp32s3box", "anyboard", ["--preprocess"]);      // 只跑前處理（#error 在這一步就會擋），不用整個編完
    say(c.ok && !c.out.includes("ESP32S3 Dev Module"), "程式最前面寫 #define BP_ANY_BOARD：不再擋開發板（前處理 " + c.sec + " 秒）" +
        (c.ok ? "" : "\n" + c.out.split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 3).join("\n")));
    fs.writeFileSync(inoFile, inoText);

    console.log("── 匯入");
    const before = myFiles();
    r = await post("/import/arduino", zip, "application/zip");
    j = await r.json().catch(() => ({}));
    say(r.status === 200 && j.ok && j.code === CODE && j.title === "生命遊戲" && j.size === 16 && j.folder === "babit_1120_01",
        "匯入剛剛匯出的 zip：程式原樣、作品名稱「" + j.title + "」、燈板 " + j.size + "×" + j.size);
    r = await post("/import/arduino", zipWrite([{ name: "x/readme.txt", data: "hi" }]), "application/zip");
    j = await r.json().catch(() => ({}));
    say(r.status === 400 && j.ok === false && /\.ino/.test(j.error || ""), "zip 裡沒有 .ino：400「" + j.error + "」");
    r = await post("/import/arduino", Buffer.from("這不是 zip"), "application/zip");
    j = await r.json().catch(() => ({}));
    say(r.status === 400 && j.ok === false && /zip/.test(j.error || ""), "不是 zip：400「" + j.error + "」");
    let big = null;
    try { r = await post("/import/arduino", Buffer.alloc(3 * 1024 * 1024, 65), "application/zip"); big = r.status; } catch (_) { big = "連線被關掉"; }
    say(big === 413 || big === "連線被關掉", "超過 2 MB 的檔案不收（" + big + "）");
    say((await fetch(STATION + "/examples?size=8")).ok, "收到過大的檔案之後編譯站照常回應");
    say(myFiles() === before, "匯入只是把程式讀出來，不會自己寫進「我的範例」");
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）
})();
