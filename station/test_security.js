// 編譯站的安全性驗收：node station/test_security.js（需先啟動編譯站）
//   1. 奇怪的網址不會讓編譯站當掉
//   2. 只接受對著自己（localhost／127.0.0.1）送來的請求：別的網域名稱指到這台電腦（DNS rebinding）不收
//   3. 會改東西或花力氣的請求（POST／PUT／DELETE）只收工具頁自己送的：學員開著編譯站時逛到別的網站，那個網站不能偷偷叫編譯站做事
//   4. 編譯站不執行學員的程式：存成範例、要縮圖都不會在這台電腦上跑那份程式（縮圖由工具頁在瀏覽器的沙箱裡算好再上傳）
const fs = require("fs"), os = require("os"), path = require("path");
const http = require("http"), net = require("net");
const { encodePng } = require("../examples/png.js");

const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";
const U = new URL(STATION), PORT = Number(U.port) || 80;
const EX = path.join(__dirname, "..", "examples");
const MY = path.join(EX, "8x8", "我的範例");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };

// 可以自己指定 Host、Origin 的請求（fetch 不讓人改這兩個）。回 { status, body, json }；連不上回 { status: 0, error }
function req(method, p, { headers = {}, body = null, host } = {}) {
  return new Promise((resolve) => {
    const h = Object.assign({}, headers);
    if (host !== undefined) h.Host = host;
    if (body != null && h["Content-Length"] === undefined) h["Content-Length"] = Buffer.byteLength(body);
    const r = http.request({ hostname: U.hostname, port: PORT, method, path: p, headers: h, agent: false, timeout: 20000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch (_) {}
        resolve({ status: res.statusCode, body: buf, json, type: res.headers["content-type"] || "", headers: res.headers });
      });
    });
    r.on("timeout", () => { r.destroy(new Error("逾時")); });
    r.on("error", (e) => resolve({ status: 0, error: e.message }));
    if (body != null) r.write(body);
    r.end();
  });
}
// 直接寫一行請求（連 Node 的 http 都送不出去的那種怪網址）。回第一行回應，或 "（連線被關掉）"
function raw(text) {
  return new Promise((resolve) => {
    const s = net.connect(PORT, U.hostname);
    let got = "";
    const done = () => { s.destroy(); resolve(got.split("\r\n")[0] || "（連線被關掉）"); };
    s.setTimeout(5000, done);
    s.on("connect", () => s.write(text));
    s.on("data", (c) => { got += c.toString("latin1"); if (got.includes("\r\n")) done(); });
    s.on("error", done);
    s.on("close", done);
  });
}
const alive = async () => (await req("GET", "/examples?size=8")).status === 200;
const GOOD = '// 測試\n#define PANEL 8\n#include "BatoPixel.h"\n\nvoid setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(seconds() * 4, 0, RED);\n  show();\n}\n';
const idOf = (name) => "8x8/我的範例/" + name;
const q = encodeURIComponent;

(async () => {
  if (!(await alive())) { console.log("連不上編譯站 " + STATION + "\n請先啟動 station\\run_station.ps1"); process.exit(1); }
  const made = [], thumbs = [];                // 測試建的範例檔、上傳的縮圖（鑰匙），最後刪掉
  const marker = path.join(os.tmpdir(), "babit_sec_marker_" + process.pid + ".txt").split(path.sep).join("/");
  const probe = path.join(os.tmpdir(), "babit_sec_probe_" + process.pid + ".txt").split(path.sep).join("/");
  const body = async () => {
    console.log("── 奇怪的網址不會讓編譯站當掉");
    for (const p of ["/vendor/..", "/vendor/.", "/vendor/", "/vendor/%2e%2e", "/vendor/..%2f..%2fserver.js", "/vendor/esptool-bundle.js/..",
                     "/firmware/..", "/firmware/.", "/thumb?id=..", "/example?id=%00", "/%", "/examples?size=%E0%A4%A"]) {
      const r = await req("GET", p);
      say(r.status >= 400 && r.status < 500 && (await alive()), `GET ${p} → ${r.status || r.error}，編譯站還活著`);
    }
    const line = await raw("GET http://[ HTTP/1.1\r\nHost: " + U.host + "\r\n\r\n");
    say(/ 4\d\d /.test(line) && (await alive()), "網址壞掉的請求（GET http://[）→ " + line + "，編譯站還活著");
    const vendorOk = await req("GET", "/vendor/" + fs.readdirSync(path.join(__dirname, "vendor")).find((f) => f.endsWith(".js")));
    say(vendorOk.status === 200 && vendorOk.body.length > 1000, "正常的 /vendor 檔案照樣拿得到（" + (vendorOk.body || []).length + " bytes）");
    if (!(await alive())) { say(false, "編譯站已經當掉，後面的檢查不做了"); return; }

    console.log("── 只收對著自己送來的請求（Host）");
    for (const host of ["localhost:" + PORT, "127.0.0.1:" + PORT, "[::1]:" + PORT]) {
      const r = await req("GET", "/examples?size=8", { host });
      say(r.status === 200, `Host: ${host} → ${r.status}`);
    }
    for (const host of ["evil.example:" + PORT, "evil.example", "127.0.0.1.evil.example:" + PORT, "localhost.evil.example:" + PORT, "127.0.0.1:" + (PORT + 1)]) {
      const r = await req("GET", "/examples?size=8", { host });
      const p = await req("POST", "/compile/preview", { host, body: GOOD, headers: { "Content-Type": "text/plain" } });
      say(r.status === 403 && p.status === 403, `Host: ${host} → GET ${r.status}、POST ${p.status}`);
    }
    // 沒有 Host 的請求（要自己寫一行才送得出來）：HTTP/1.1 規定一定要有，HTTP/1.0 可以沒有，兩種都不收
    const noHost11 = await raw("GET /examples?size=8 HTTP/1.1\r\n\r\n"), noHost10 = await raw("GET /examples?size=8 HTTP/1.0\r\n\r\n");
    say(/ 4\d\d /.test(noHost11) && / 4\d\d /.test(noHost10), `沒有 Host → HTTP/1.1：${noHost11}；HTTP/1.0：${noHost10}`);

    console.log("── 會改東西的請求只收工具頁自己送的（Origin）");
    const name = "測試_sec_" + process.pid, file = path.join(MY, name + ".ino");
    made.push(file);
    const saveBody = (n) => JSON.stringify({ size: 8, name: n, code: GOOD });
    const SAME = ["http://127.0.0.1:" + PORT, "http://localhost:" + PORT];
    const FOREIGN = ["http://evil.example", "https://evil.example:" + PORT, "http://127.0.0.1:" + (PORT + 1), "http://localhost", "null", "http://127.0.0.1." + PORT + ".evil.example"];
    for (const origin of FOREIGN) {
      const r = await req("POST", "/examples", { headers: { Origin: origin, "Content-Type": "text/plain" }, body: saveBody(name) });
      say(r.status === 403 && !fs.existsSync(file), `Origin: ${origin} 的 POST /examples → ${r.status}，沒有寫出檔案`);
    }
    let r = await req("POST", "/examples", { headers: { Origin: SAME[0], "Content-Type": "application/json" }, body: saveBody(name) });
    say(r.status === 200 && fs.existsSync(file), `Origin: ${SAME[0]}（工具頁自己）→ ${r.status}，存檔成功`);
    r = await req("PUT", "/example?id=" + q(idOf(name)), { headers: { Origin: SAME[1], "Content-Type": "text/plain" }, body: GOOD.replace("RED", "BLUE") });
    say(r.status === 200, `Origin: ${SAME[1]}（工具頁自己）的 PUT → ${r.status}`);
    r = await req("POST", "/compile/preview", { headers: { "Content-Type": "text/plain" }, body: GOOD });
    say(r.status === 200 && r.json && r.json.ok === true, "沒有 Origin（測試程式、命令列工具）→ " + r.status + "，照常編譯");
    const before = fs.readFileSync(file, "utf8");
    const evil = { Origin: "http://evil.example", "Content-Type": "text/plain" };
    const tries = [
      ["PUT", "/example?id=" + q(idOf(name)), GOOD],
      ["DELETE", "/example?id=" + q(idOf(name)), null],
      ["POST", "/compile/preview", GOOD],
      ["POST", "/compile/preview?bg=1", GOOD],
      ["POST", "/compile/firmware?bg=1", GOOD],
      ["POST", "/export/arduino?name=x1", GOOD],
      ["POST", "/import/arduino", "PK"],
      ["PUT", "/thumb?id=" + q(idOf(name)) + "&k=x", "x"],
    ];
    for (const [m, p, body] of tries) {
      const x = await req(m, p, { headers: evil, body });
      say(x.status === 403, `別的網站送的 ${m} ${p.split("?")[0]} → ${x.status}`);
    }
    say(fs.existsSync(file) && fs.readFileSync(file, "utf8") === before, "範例檔沒有被別的網站改掉或刪掉");
    r = await req("GET", "/examples?size=8", { headers: { Origin: "http://evil.example" } });
    say(r.status === 200 && !("access-control-allow-origin" in (r.headers || {})), "只讀的 GET 不擋（瀏覽器本來就不讓別的網站讀回應）→ " + r.status);
    // 瀏覽器另外會標明請求是從哪種地方送的（Sec-Fetch-Site）：有帶的話要是同一個來源，或使用者自己開的（none）
    for (const [site, want] of [["cross-site", 403], ["same-site", 403], ["same-origin", 200], ["none", 200]]) {
      const x = await req("POST", "/compile/preview", { headers: { "Sec-Fetch-Site": site, "Content-Type": "text/plain" }, body: GOOD });
      say(x.status === want, `Sec-Fetch-Site: ${site} 的 POST → ${x.status}（應該是 ${want}）`);
    }

    console.log("── 工具頁不能被別的網站框進去");
    r = await req("GET", "/");
    const hd = r.headers || {};
    say(r.status === 200 && /deny/i.test(hd["x-frame-options"] || "") && /frame-ancestors 'none'/.test(hd["content-security-policy"] || "") &&
        hd["cross-origin-opener-policy"] === "same-origin",
        `頁面的回應帶著「不准被框」的標頭（X-Frame-Options: ${hd["x-frame-options"]}；CSP: ${hd["content-security-policy"]}；COOP: ${hd["cross-origin-opener-policy"]}）`);

    console.log("── 程式不能讀編譯站那台電腦上的檔案");
    // 在暫存資料夾放一個有記號的檔案，用各種寫法叫編譯器去讀它：都要在編譯前就用中文擋下，回應裡不能出現檔案的內容
    const secret = "BABIT-SECRET-" + process.pid;
    fs.writeFileSync(probe, secret + "\n");
    const up5 = "../../../../../" + path.relative(path.parse(probe).root, probe).split(path.sep).join("/");
    const readers = [
      ["#embed 絕對路徑", 'const char leak[] = {\n#embed "' + probe + '"\n, 0};'],
      ["#embed 相對路徑（../）", 'const char leak[] = {\n#embed "' + up5 + '"\n, 0};'],
      ["#include 絕對路徑", '#include "' + probe + '"'],
      ["#include 用巨集", '#define F "' + probe + '"\n#include F'],
      ["__has_include 探查", '#if __has_include("' + probe + '")\n#error EXISTS\n#else\n#error MISSING\n#endif'],
      ["組合語言 .incbin", 'asm(".incbin \\"' + probe + '\\"");'],
    ];
    for (const [what, extra] of readers) {
      const code = GOOD.replace("void setup()", extra + "\nvoid setup()");
      const res = [];
      for (const ep of ["/compile/preview", "/compile/firmware?bg=1", "/export/arduino?name=x1"]) {
        const x = await req("POST", ep, { headers: { "Content-Type": "text/plain" }, body: code });
        const msg = String((x.json || {}).log || (x.json || {}).error || "");
        res.push(x.json && x.json.ok === false && /第 \d+ 行/.test(msg) && !x.body.toString("latin1").includes(secret) && !/EXISTS|MISSING/.test(msg));
      }
      say(res.every(Boolean), `${what}：預覽、韌體、匯出都在編譯前擋下，回應裡沒有檔案內容` + (res.every(Boolean) ? "" : "（" + res.join("、") + "）"));
    }
    r = await req("POST", "/compile/preview", { headers: { "Content-Type": "text/plain" }, body: GOOD.replace("void setup()", "#include <math.h>\n#include <vector>\nvoid setup()") });
    say(r.status === 200 && r.json && r.json.ok === true, "正常的 #include <math.h>、<vector> 照樣編得過");

    console.log("── 編譯站不執行學員的程式");
    // 這份程式夾帶一段 JavaScript：在 node 裡執行的話會寫出一個記號檔。記號檔出現＝編譯站在這台電腦上跑了學員的程式
    const evilCode = GOOD.replace("begin();", "begin();\n  EM_ASM({ try { require('fs').writeFileSync('" + marker + "', 'x'); } catch (e) {} });");
    const evilName = "測試_sec_夾帶_" + process.pid, evilFile = path.join(MY, evilName + ".ino");
    made.push(evilFile);
    r = await req("POST", "/examples", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size: 8, name: evilName, code: evilCode }) });
    say(r.status === 200, "存一份夾帶 JavaScript 的範例（" + r.status + "）");
    const t0 = Date.now();
    const th = await req("GET", "/thumb?id=" + q(idOf(evilName)));
    const list = (await req("GET", "/examples?size=8")).json || [];
    await new Promise((ok) => setTimeout(ok, 4000));                     // 留時間給「如果它真的跑去編譯、執行」
    say(th.status === 404 && Date.now() - t0 < 6000, `要這個範例的縮圖 → ${th.status}（編譯站不替它算圖）`);
    say(!fs.existsSync(marker), "記號檔沒有出現：編譯站沒有執行那段 JavaScript");

    console.log("── 縮圖由工具頁算好再上傳");
    const mine = list.find((e) => e.id === idOf(evilName)) || {}, official = list.find((e) => !e.mine) || {};
    say(/^[0-9a-f]{40}$/.test(mine.thumbKey || "") && official.thumbKey === undefined, "清單裡自己的範例帶著縮圖的鑰匙（thumbKey），官方範例沒有");
    const rgb = Buffer.alloc(224 * 8 * 3, 0);
    for (let i = 0; i < rgb.length; i += 3) rgb[i] = (i / 3) % 256;
    const png = encodePng(224, 8, rgb);
    const putThumb = (id, k, body, headers) => req("PUT", "/thumb?id=" + q(id) + "&k=" + q(k), { headers: Object.assign({ "Content-Type": "image/png" }, headers), body });
    r = await putThumb(idOf(evilName), "0".repeat(40), png);
    say(r.status === 409, "鑰匙不對（程式已經改過）→ " + r.status);
    r = await putThumb(idOf(evilName), mine.thumbKey, Buffer.from("這不是圖"));
    say(r.status === 400, "不是 PNG → " + r.status);
    r = await putThumb(idOf(evilName), mine.thumbKey, encodePng(100, 8, Buffer.alloc(100 * 8 * 3)));
    say(r.status === 400, "尺寸不對（100×8）→ " + r.status);
    r = await putThumb(idOf(evilName), mine.thumbKey, encodePng(448, 16, Buffer.alloc(448 * 16 * 3)));
    say(r.status === 400, "尺寸跟燈板不合（8×8 的範例傳 16 高的圖）→ " + r.status);
    r = await putThumb(idOf(evilName), mine.thumbKey, Buffer.concat([png, Buffer.alloc(600 * 1024, 1)]));
    say(r.status === 413 || r.status === 0, "太大（600 KB）→ " + (r.status || "連線被關掉"));
    r = await putThumb(official.id, "0".repeat(40), png);
    const noKey = await req("PUT", "/thumb?id=" + q(official.id), { headers: { "Content-Type": "image/png" }, body: png });
    say(r.status === 403 && noKey.status === 403, `官方範例的縮圖不能換（帶鑰匙 ${r.status}、不帶鑰匙 ${noKey.status}）`);
    r = await req("PUT", "/thumb?id=" + q(idOf(evilName)), { headers: { "Content-Type": "image/png" }, body: png });
    say(r.status === 409, "自己的範例沒帶鑰匙 → " + r.status);
    const strays = [path.join(__dirname, ".."), __dirname, process.cwd()].flatMap((d) => fs.readdirSync(d).filter((f) => /^null\.\d+\.tmp$/.test(f)));
    say(strays.length === 0, "沒有留下寫壞的暫存檔" + (strays.length ? "：" + strays.join("、") : ""));
    r = await putThumb("8x8/我的範例/沒有這個_" + process.pid, mine.thumbKey, png);
    say(r.status === 404, "沒有這個範例 → " + r.status);
    r = await putThumb(idOf(evilName), mine.thumbKey, png);
    thumbs.push(mine.thumbKey);
    say(r.status === 200 && r.json && r.json.ok === true, "格式、尺寸、鑰匙都對 → " + r.status);
    r = await req("GET", "/thumb?id=" + q(idOf(evilName)));
    say(r.status === 200 && r.type === "image/png" && r.body.equals(png), "之後要縮圖就拿到剛剛上傳的那一張（" + r.status + "、" + r.body.length + " bytes）");
    // 程式改了：舊縮圖不再適用
    // 內容要是從來沒出現過的（加上現在的時間）：縮圖照程式內容認，以前有過同樣內容的縮圖就會直接拿到
    r = await req("PUT", "/example?id=" + q(idOf(evilName)), { headers: { "Content-Type": "text/plain" }, body: GOOD.replace("RED", "GREEN") + "// " + Date.now() + "\n" });
    const list2 = (await req("GET", "/examples?size=8")).json || [];
    const mine2 = list2.find((e) => e.id === idOf(evilName)) || {};
    r = await req("GET", "/thumb?id=" + q(idOf(evilName)));
    say(/^[0-9a-f]{40}$/.test(mine2.thumbKey || "") && mine2.thumbKey !== mine.thumbKey && r.status === 404, "程式改過之後鑰匙換新、舊縮圖不再給（" + r.status + "）");
    say(await alive(), "做完這些編譯站照常回應");
  };
  try { await body(); } finally {
    for (const f of made) fs.rmSync(f, { force: true });
    for (const k of thumbs) fs.rmSync(path.join(__dirname, "cache", "thumbs", k + ".png"), { force: true });
    fs.rmSync(marker, { force: true });
    fs.rmSync(probe, { force: true });
  }
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;
})();
