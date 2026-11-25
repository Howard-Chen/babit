// 雲端模式的驗收：node station/test_cloud.js（自己開兩個編譯站再關掉，不用先啟動；電腦要有工具鏈）
//   一個照預設開（開發版／離線版的行為），一個用環境變數開成雲端模式：
//   BATOPIXEL_TARGET=cloud        部署目標（正式的雲端版由映像裡的 version.json 決定，這裡用環境變數指定）
//   BATOPIXEL_ORIGINS=https://…   對外的網址：除了 localhost 以外，也收對著這個網址送來的請求
//   BATOPIXEL_CLASS_CODE=…        課堂代碼：會花力氣的請求（編譯、匯出、匯入）要帶對代碼
//   BATOPIXEL_FW_SLOTS=3          同時編幾份韌體
// 檢查：/version、對外網址的把關、課堂代碼、不寫伺服器的資料夾、每個人各排各的同時編譯、編譯久的時候持續送資料
const fs = require("fs"), path = require("path"), http = require("http");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const MY8 = path.join(ROOT, "examples", "8x8", "我的範例");
const DEV_PORT = 8947, CLOUD_PORT = 8948;
const PUBLIC = "https://class.example.test", CODE = "abc123";
const GOOD = '// 測試\n#define PANEL 8\n#include "BatoPixel.h"\n\nvoid setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(seconds() * 4, 0, RED);\n  show();\n}\n';

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };

function start(port, env) {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")],
    { env: Object.assign({}, process.env, { BATOPIXEL_PORT: String(port), BATOPIXEL_BIND: "127.0.0.1" }, env), stdio: ["ignore", "ignore", "inherit"] });
  return child;
}
// 可以自己指定 Host、Origin 的請求。回 { status, text, json }
function req(port, method, p, { headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const h = Object.assign({}, headers);
    if (body != null) h["Content-Length"] = Buffer.byteLength(body);
    const r = http.request({ hostname: "127.0.0.1", port, method, path: p, headers: h, agent: false, timeout: 240000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    r.on("timeout", () => r.destroy(new Error("逾時")));
    r.on("error", (e) => resolve({ status: 0, text: "", json: null, error: e.message }));
    if (body != null) r.write(body);
    r.end();
  });
}
const up = async (port) => {
  for (let i = 0; i < 60; i++) {
    if ((await req(port, "GET", "/examples?size=8")).status === 200) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};

(async () => {
  const dev = start(DEV_PORT, { BATOPIXEL_TARGET: "", BATOPIXEL_ORIGINS: "", BATOPIXEL_CLASS_CODE: "" });
  const cloud = start(CLOUD_PORT, { BATOPIXEL_TARGET: "cloud", BATOPIXEL_ORIGINS: PUBLIC, BATOPIXEL_CLASS_CODE: CODE,
                                    BATOPIXEL_FW_SLOTS: "3", BATOPIXEL_PREVIEW_SLOTS: "2", BATOPIXEL_BEAT_MS: "300" });
  const made = [];
  const C = (extra) => Object.assign({ "X-Babit-Code": CODE, "Content-Type": "text/plain; charset=utf-8" }, extra);
  try {
    if (!(await up(DEV_PORT)) || !(await up(CLOUD_PORT))) { say(false, "編譯站沒有啟動"); return; }

    console.log("── 部署目標與版本（/version）");
    let d = (await req(DEV_PORT, "GET", "/version")).json || {}, c = (await req(CLOUD_PORT, "GET", "/version")).json || {};
    say(d.target === "dev" && d.label === "開發版" && /^[0-9a-f]{7}$/.test(d.source || ""), `照預設開：${d.label}（${d.target}）· ${d.source}`);
    say(c.target === "cloud" && c.label === "雲端版" && c.source === d.source, `雲端模式：${c.label}（${c.target}）· ${c.source}，版本跟開發版同一個 commit`);

    console.log("── 對外的網址：收對著它送來的請求，別的照樣不收");
    const pub = { Host: "class.example.test", Origin: PUBLIC };
    let r = await req(CLOUD_PORT, "POST", "/compile/preview", { headers: C(pub), body: GOOD });
    say(r.status === 200 && r.json && r.json.ok === true, `Host／Origin 是 ${PUBLIC}：${r.status}，照常編譯`);
    r = await req(CLOUD_PORT, "POST", "/compile/preview", { headers: C({ Host: "class.example.test", Origin: "https://evil.example" }), body: GOOD });
    say(r.status === 403, "Origin 是別的網站：" + r.status);
    r = await req(CLOUD_PORT, "GET", "/examples?size=8", { headers: { Host: "evil.example" } });
    say(r.status === 403, "Host 是別的網域：" + r.status);
    r = await req(DEV_PORT, "GET", "/examples?size=8", { headers: { Host: "class.example.test" } });
    say(r.status === 403, "沒設定對外網址的編譯站不收那個 Host：" + r.status);

    console.log("── 課堂代碼：編譯、匯出、匯入要帶對代碼；看頁面與範例不用");
    for (const [what, headers] of [["沒帶", {}], ["帶錯", { "X-Babit-Code": "nope" }]]) {
      r = await req(CLOUD_PORT, "POST", "/compile/preview", { headers, body: GOOD });
      say(r.status === 401 && r.json && r.json.needCode === true && !!r.json.error, `${what}代碼的編譯：${r.status}「${(r.json || {}).error}」`);
    }
    r = await req(CLOUD_PORT, "POST", "/export/arduino?name=x1", { body: GOOD });
    say(r.status === 401, "沒帶代碼的匯出：" + r.status);
    r = await req(CLOUD_PORT, "GET", "/");
    const list = await req(CLOUD_PORT, "GET", "/examples?size=8");
    say(r.status === 200 && r.text.includes("<title>") && list.status === 200 && Array.isArray(list.json) && list.json.length >= 6, "不帶代碼也看得到頁面和官方範例");
    r = await req(DEV_PORT, "POST", "/compile/preview", { body: GOOD });
    say(r.status === 200 && r.json.ok === true, "沒設定代碼的編譯站不用帶：" + r.status);

    console.log("── 雲端版不寫伺服器的資料夾：自己的範例存在學員的瀏覽器");
    const name = "測試_cloud_" + process.pid, file = path.join(MY8, name + ".ino");
    made.push(file);
    r = await req(CLOUD_PORT, "POST", "/examples", { headers: C({ "Content-Type": "application/json" }), body: JSON.stringify({ size: 8, name, code: GOOD }) });
    say(r.status === 403 && !fs.existsSync(file) && /瀏覽器/.test((r.json || {}).error || ""), `存範例：${r.status}「${(r.json || {}).error}」，沒有寫出檔案`);
    fs.mkdirSync(MY8, { recursive: true });
    fs.writeFileSync(file, GOOD);                          // 伺服器的資料夾裡就算有檔案，雲端版也不列、不讓人改
    const id = encodeURIComponent("8x8/我的範例/" + name);
    const cl = (await req(CLOUD_PORT, "GET", "/examples?size=8")).json || [], dl = (await req(DEV_PORT, "GET", "/examples?size=8")).json || [];
    say(!cl.some((e) => e.mine) && dl.some((e) => e.mine && e.title === name), "範例清單：雲端版只列官方的；一般的編譯站列得到「我的範例」");
    for (const [m, p, body] of [["PUT", "/example?id=" + id, GOOD.replace("RED", "BLUE")], ["DELETE", "/example?id=" + id, null], ["PUT", "/thumb?id=" + id + "&k=x", "x"]]) {
      r = await req(CLOUD_PORT, m, p, { headers: C(), body });
      say(r.status === 403, `${m} ${p.split("?")[0]}：${r.status}`);
    }
    say(fs.existsSync(file) && fs.readFileSync(file, "utf8") === GOOD, "資料夾裡的檔案沒有被動到");
    const src = await req(CLOUD_PORT, "GET", "/example?id=" + id), th = await req(CLOUD_PORT, "GET", "/thumb?id=" + id);
    say(src.status === 404 && th.status === 404 && (await req(DEV_PORT, "GET", "/example?id=" + id)).text === GOOD, "主機資料夾裡「我的範例」的程式與縮圖，雲端版也不給讀（404）；一般的編譯站讀得到");
    const first = cl[0] || {};
    say((await req(CLOUD_PORT, "GET", "/example?id=" + encodeURIComponent(first.id))).text.includes("#define PANEL 8") &&
        (await req(CLOUD_PORT, "GET", first.thumb || "/x")).status === 200, "官方範例的程式與縮圖照常給");

    console.log("── 存進瀏覽器之前，名稱與尺寸的檢查還是編譯站做（POST /examples/check，只檢查不存）");
    for (const port of [CLOUD_PORT, DEV_PORT]) {
      const who = port === CLOUD_PORT ? "雲端版" : "一般的編譯站";
      const chk = (b) => req(port, "POST", "/examples/check", { headers: C({ "Content-Type": "application/json" }), body: JSON.stringify(b) });
      const okName = "測試_check_" + process.pid, okFile = path.join(MY8, okName + ".ino");
      made.push(okFile);
      r = await chk({ size: 8, name: okName, code: GOOD });
      say(r.status === 200 && r.json.ok === true && !fs.existsSync(okFile), `${who}：名稱與程式都可以 → ok，而且沒有寫出檔案`);
      r = await chk({ size: 8, name: "a/b", code: GOOD });
      const badName = r.status === 400 && r.json.ok === false && !!r.json.error;
      r = await chk({ size: 16, name: okName, code: GOOD });
      say(badName && r.status === 400 && /8×8/.test(r.json.error || ""), `${who}：名稱不能用、程式的燈板尺寸不對 → 400 與說明「${(r.json || {}).error}」`);
    }

    console.log("── 每個人各排各的、同時編好幾份（3 個槽）；編譯久的時候持續送資料");
    const t0 = Date.now();
    const fw = await Promise.all(["甲", "乙", "丙"].map((who, i) =>
      req(CLOUD_PORT, "POST", "/compile/firmware", { headers: C({ "X-Babit-Client": "client_" + i }), body: GOOD + "// " + who + " " + t0 + "\n" })));
    const slots = fw.map((x) => (x.json || {}).slot);
    say(fw.every((x) => x.status === 200 && x.json && x.json.ok === true), `三個人同時編韌體都成功（${Math.round((Date.now() - t0) / 1000)} 秒）` +
        (fw.find((x) => !(x.json && x.json.ok)) ? "：" + String(((fw.find((x) => !(x.json && x.json.ok)) || {}).json || {}).log || "").slice(0, 300) : ""));
    say(new Set(slots).size === 3 && slots.every((s) => [0, 1, 2].includes(s)), "各用各的槽（" + slots.join("、") + "）：是同時編，不是排成一列");
    say(fw.some((x) => /^\s+\{/.test(x.text)), "編譯要等的時候先持續送空白（中間的代理伺服器才不會以為斷線），最後才是結果");
    r = await req(CLOUD_PORT, "POST", "/compile/preview", { headers: C({ "X-Babit-Client": "bad id<>" }), body: GOOD });
    say(r.status === 200 && r.json.ok === true, "代號格式不對：當成沒帶，照常編譯");
    r = await req(CLOUD_PORT, "POST", "/compile/firmware", { headers: C({ "X-Babit-Client": "client_9" }), body: GOOD + "// 甲 " + t0 + "\n" });
    say(r.status === 200 && r.json.ok === true && r.json.cached === true && [0, 1, 2].includes(r.json.slot), "別人編過同一份：直接拿現成的（cached），不重編");
    r = await req(DEV_PORT, "POST", "/compile/firmware", { body: GOOD + "// dev " + t0 + "\n" });
    say(r.status === 200 && r.json.ok === true && r.json.slot === 0, "一般的編譯站只有一個槽（槽號 " + (r.json || {}).slot + "）");

    console.log("── 一個人塞不滿編譯站：排隊的份數有上限，超過的馬上回「忙」");
    const many = await Promise.all(Array.from({ length: 14 }, (_, i) =>
      req(CLOUD_PORT, "POST", "/compile/preview", { headers: C({ "X-Babit-Client": "flood" }), body: GOOD + "// 塞 " + i + " " + t0 + "\n" })));
    const busy = many.filter((x) => x.json && x.json.busy === true), fine = many.filter((x) => x.json && x.json.ok === true);
    say(busy.length === 5 && fine.length === 9 && busy.every((x) => x.status === 200 && !!x.json.error && !("log" in x.json)),
        `同一個人一口氣送 14 份預覽：1 份在編＋8 份排隊照常編完（${fine.length}），其餘 ${busy.length} 份回忙「${((busy[0] || {}).json || {}).error || ""}」`);
    r = await req(CLOUD_PORT, "POST", "/compile/preview", { headers: C({ "X-Babit-Client": "someone_else" }), body: GOOD });
    say(r.status === 200 && r.json.ok === true, "別人不受影響");
    const manyDev = await Promise.all(Array.from({ length: 14 }, (_, i) => req(DEV_PORT, "POST", "/compile/preview", { body: GOOD + "// 塞 " + i + " " + t0 + "\n" })));
    say(manyDev.every((x) => x.json && x.json.ok === true), "一般的編譯站沒有這個上限：14 份都編");

    console.log("── 編譯太久的程式準時停掉（連同編譯器開的子程序），不擋到別人");
    {
      // 另開一個上限調得很短的雲端編譯站：預覽 3 秒、韌體 1.5 秒（正常的韌體編譯一定超過，剛好拿來測）
      const SLOW_PORT = DEV_PORT - 2;
      const slow = start(SLOW_PORT, { BATOPIXEL_TARGET: "cloud", BATOPIXEL_ORIGINS: "", BATOPIXEL_CLASS_CODE: CODE, BATOPIXEL_FW_SLOTS: "1", BATOPIXEL_PREVIEW_SLOTS: "2",
                                      BATOPIXEL_BEAT_MS: "0", BATOPIXEL_PREVIEW_TIMEOUT: "3000", BATOPIXEL_FW_TIMEOUT: "1500" });
      try {
        if (!(await up(SLOW_PORT))) say(false, "上限調短的編譯站沒有啟動");
        else {
          // 編譯的時候做大量計算的程式（每一個 constexpr 都要編譯器當場算 50 萬步）：147 上要編二十幾秒
          const heavy = '#define PANEL 8\n#include "BatoPixel.h"\n' +
            "constexpr unsigned spin(unsigned s, unsigned n) { unsigned x = s; for (unsigned i = 0; i < n; i++) x = x * 1103515245u + 12345u; return x; }\n" +
            Array.from({ length: 80 }, (_, i) => `constexpr unsigned v${i} = spin(${i}u + ${t0 % 1000}u, 500000u);`).join("\n") +
            "\nunsigned sum() { return 0" + Array.from({ length: 80 }, (_, i) => " + v" + i).join("") + "; }\n" +
            "void setup() { begin(); }\nvoid loop() { if (sum() & 1) clear(); show(); }\n";
          const tA = Date.now();
          const pHeavy = req(SLOW_PORT, "POST", "/compile/preview", { headers: C({ "X-Babit-Client": "slow_a" }), body: heavy });
          await new Promise((res) => setTimeout(res, 300));
          const tB = Date.now();
          const quick = await req(SLOW_PORT, "POST", "/compile/preview", { headers: C({ "X-Babit-Client": "slow_b" }), body: GOOD });
          const quickMs = Date.now() - tB;
          const hv = await pHeavy, heavyMs = Date.now() - tA;
          say(hv.status === 200 && hv.json && hv.json.ok === false && /編譯超過 3 秒/.test(hv.json.log || "") && heavyMs < 9000,
              `預覽編太久：${(heavyMs / 1000).toFixed(1)} 秒就回「${String((hv.json || {}).log || "").slice(0, 34)}…」`);
          say(quick.json && quick.json.ok === true && quickMs < 3000, `這期間別人的預覽照常編（${quickMs} ms）`);
          // 被停掉的那份，編譯器（emcc 開的 clang）也要跟著停，不能留在背景繼續吃 CPU
          const leftover = async () => {
            if (process.platform !== "win32") return 0;
            const { execFileSync } = require("child_process");
            const q = `@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*tmp\\${SLOW_PORT}\\*' -and $_.Name -notlike 'node*' -and $_.Name -notlike 'powershell*' }).Count`;   // 不算編譯站自己與這行查詢
            return Number(execFileSync("powershell", ["-NoProfile", "-Command", q], { encoding: "utf8" }).trim()) || 0;
          };
          let left = await leftover();
          for (let i = 0; i < 10 && left; i++) { await new Promise((res) => setTimeout(res, 500)); left = await leftover(); }
          say(left === 0, "停掉之後沒有留下還在跑的編譯器（" + left + " 個）");
          const tF = Date.now();
          r = await req(SLOW_PORT, "POST", "/compile/firmware", { headers: C({ "X-Babit-Client": "slow_a" }), body: GOOD + "// 逾時 " + t0 + "\n" });
          const fwMs = Date.now() - tF;
          say(r.status === 200 && r.json && r.json.ok === false && /編譯超過 2 秒/.test(r.json.log || "") && fwMs < 9000, `韌體編太久：${(fwMs / 1000).toFixed(1)} 秒就回「${String((r.json || {}).log || "").slice(0, 34)}…」`);
          left = await leftover();
          for (let i = 0; i < 10 && left; i++) { await new Promise((res) => setTimeout(res, 500)); left = await leftover(); }
          say(left === 0, "韌體那邊也沒有留下還在跑的編譯器（" + left + " 個）");
          r = await req(SLOW_PORT, "POST", "/compile/preview", { headers: C({ "X-Babit-Client": "slow_a" }), body: GOOD });
          say(r.json && r.json.ok === true, "之後編譯站照常工作");
        }
      } finally {
        slow.kill();
        await new Promise((res) => setTimeout(res, 300));
        fs.rmSync(path.join(__dirname, "tmp", String(SLOW_PORT)), { recursive: true, force: true });
      }
    }

    console.log("── 設定不對就不啟動（開機時就發現，不是上課才發現）");
    for (const [what, env, re] of [
      ["雲端模式沒設課堂代碼", { BATOPIXEL_TARGET: "cloud", BATOPIXEL_ORIGINS: PUBLIC, BATOPIXEL_CLASS_CODE: "" }, /BATOPIXEL_CLASS_CODE/],
      ["對外的網址寫錯", { BATOPIXEL_TARGET: "cloud", BATOPIXEL_ORIGINS: "class.example.test", BATOPIXEL_CLASS_CODE: CODE }, /BATOPIXEL_ORIGINS/]]) {
      const out = await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(__dirname, "server.js")],
          { env: Object.assign({}, process.env, { BATOPIXEL_PORT: String(DEV_PORT - 1), BATOPIXEL_BIND: "127.0.0.1" }, env), stdio: ["ignore", "ignore", "pipe"] });
        let err = "";
        child.stderr.on("data", (c) => { err += c; });
        const t = setTimeout(() => child.kill(), 8000);
        child.on("exit", (code) => { clearTimeout(t); resolve({ code, err }); });
      });
      say(out.code === 1 && re.test(out.err), `${what}：不啟動（exit ${out.code}）「${out.err.trim().split("\n")[0]}」`);
    }
  } catch (e) {
    say(false, "測試中斷：" + String((e && e.stack) || e).split("\n").slice(0, 3).join(" ／ "));
  } finally {
    for (const f of made) fs.rmSync(f, { force: true });
    dev.kill();
    cloud.kill();
    for (const port of [DEV_PORT, CLOUD_PORT]) fs.rmSync(path.join(__dirname, "tmp", String(port)), { recursive: true, force: true });
  }
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;
})();
