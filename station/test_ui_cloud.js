// 雲端版工具頁的操作驗收（puppeteer）：node station/test_ui_cloud.js
// 自己開一個雲端模式的編譯站（連接埠 8949）再關掉，不用先啟動；電腦要有工具鏈。puppeteer 的來源跟 test_ui.js 一樣。
// 8949 被別的站佔用時（147 上別的對話自己開的編譯站）：BATOPIXEL_UI_CLOUD_PORT=8945 node station/test_ui_cloud.js
// 檢查雲端版跟離線版不一樣的地方：標題旁邊的版本、課堂代碼、自己的範例存在瀏覽器（重新整理還在、別人看不到、主機沒有多出檔案）、
// 草稿自動存、匯入匯出、不能燒錄的瀏覽器開頁就提醒、不連這台電腦的 Art-Net 橋。
const { createRequire } = require("module");
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { spawn } = require("child_process");
const puppeteer = createRequire(process.env.BATOPIXEL_PUPPETEER || "D:/CSH/Design/package.json")("puppeteer");
const { packSketch } = require("./arduino_export.js");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.BATOPIXEL_UI_CLOUD_PORT) || 8949, BASE = "http://127.0.0.1:" + PORT, CODE = "夏天abc123";
const MY = [path.join(ROOT, "examples", "8x8", "我的範例"), path.join(ROOT, "examples", "16x16", "我的範例"), path.join(__dirname, "cache", "thumbs")];
const NAME = "雲端測試_" + process.pid;
const prog = (n, body) => `// 測試\n// @desc 雲端版測試用\n#define PANEL ${n}\n#include "BatoPixel.h"\n\n${body}`;
const OKBODY = "void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(seconds() * 3, 0, RED);\n  show();\n}\n";

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listing = () => MY.map((d) => { try { return fs.readdirSync(d).sort().join("|"); } catch (_) { return ""; } }).join(" ／ ");
const alive = () => new Promise((resolve) => {
  const r = http.get(BASE + "/version", (res) => { res.resume(); resolve(res.statusCode === 200); });
  r.on("error", () => resolve(false));
});

(async () => {
  const before = listing();
  const station = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: Object.assign({}, process.env, { BATOPIXEL_PORT: String(PORT), BATOPIXEL_BIND: "127.0.0.1", BATOPIXEL_TARGET: "cloud", BATOPIXEL_ORIGINS: "",
                                          BATOPIXEL_CLASS_CODE: CODE, BATOPIXEL_FW_SLOTS: "2", BATOPIXEL_PREVIEW_SLOTS: "2", BATOPIXEL_BEAT_MS: "300" }),
    stdio: ["ignore", "ignore", "inherit"] });
  let browser = null;
  const zipFile = path.join(os.tmpdir(), `babit_cloud_${process.pid}.zip`);
  let fwPending = 0;
  try {
    for (let i = 0; i < 60 && !(await alive()); i++) await sleep(300);
    if (!(await alive())) { say(false, "雲端模式的編譯站沒有啟動"); return; }
    browser = await puppeteer.launch({ headless: true });

    // 開一個「學員」：各自的瀏覽器資料（context）。answers＝跳出輸入框（課堂代碼）時依序回答的內容，null＝按取消
    const open = async (url, answers = [], prepare = null) => {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1400, height: 900 });
      const s = { page, dialogs: [], errors: [], reqs: [], dismissNext: false };
      page.on("dialog", (d) => {
        s.dialogs.push(d.type() + "：" + d.message());
        if (d.type() === "prompt") { const a = answers.length ? answers.shift() : CODE; if (a === null) d.dismiss(); else d.accept(a); }
        else if (s.dismissNext) { s.dismissNext = false; d.dismiss(); }
        else d.accept();
      });
      page.on("pageerror", (e) => s.errors.push(e.message));
      page.on("request", (r) => {
        const u = new URL(r.url());
        if (u.pathname === "/compile/firmware") fwPending++;
        s.reqs.push({ method: r.method(), path: u.pathname, search: u.search, headers: r.headers() });
      });
      const settled = (r) => { if (new URL(r.url()).pathname === "/compile/firmware") fwPending--; };
      page.on("requestfinished", settled);
      page.on("requestfailed", settled);
      if (prepare) await prepare(page);
      await page.goto(url, { waitUntil: "load" });
      s.status = () => page.$eval("#status", (el) => el.textContent);
      s.text = (sel) => page.$eval(sel, (el) => el.textContent);
      s.shown = (sel) => page.$eval(sel, (el) => !el.hidden && el.offsetParent !== null);
      s.labels = () => page.$$eval(".glabel", (els) => els.map((e) => e.textContent));
      s.titles = () => page.$$eval(".card .cname", (els) => els.map((e) => e.textContent));
      s.editor = () => page.$eval("#code", (el) => el.value);
      s.lit = () => page.$$eval(".card.on .cname", (els) => els.map((e) => e.textContent).join("、"));
      s.waitStatus = (re, timeout = 60000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("status").textContent), { timeout }, re.source);
      s.running = (timeout = 60000) => page.waitForFunction(() => window.__bp && window.__bp.mod && /執行中/.test(document.getElementById("status").textContent), { timeout });
      s.thumbOf = (name) => page.evaluate((n) => {
        const c = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === n);
        return c ? c.querySelector(".thumb").style.backgroundImage : null;
      }, name);
      s.reload = async () => { s.reqs.length = 0; await page.reload({ waitUntil: "load" }); };
      return s;
    };

    console.log("── 開頁：標題旁邊顯示雲端版與版本；要課堂代碼才能編譯");
    const A = await open(BASE, ["不是這個", CODE]);
    await A.running();
    const verText = await A.text("#ver");
    say(/^雲端版 · [0-9a-f]{7}/.test(verText) && (await A.shown("#ver")), "標題旁邊：" + verText);
    say(A.dialogs.length === 2 && /^prompt：請輸入課堂代碼/.test(A.dialogs[0]) && /^prompt：課堂代碼不對/.test(A.dialogs[1]),
        "開頁跳出輸入框問課堂代碼；打錯再問一次（" + A.dialogs.join(" → ") + "）");
    say(/執行中/.test(await A.status()), "代碼對了：第一個範例照常執行（" + (await A.status()) + "）");
    const sent = A.reqs.filter((r) => r.path.startsWith("/compile/"));
    say(sent.length > 0 && sent.every((r) => /^[a-z0-9]{16}$/.test(r.headers["x-babit-client"] || "")), "編譯請求都帶這個瀏覽器的代號（" + (sent[0] || { headers: {} }).headers["x-babit-client"] + "）");
    say(sent[sent.length - 1].headers["x-babit-code"] === encodeURIComponent(CODE), "代碼放在標頭裡（中文先編碼）");
    await A.reload();
    await A.running();
    say(A.dialogs.length === 2, "代碼記在瀏覽器裡：重新整理不用再輸入");
    say(!(await A.labels()).includes("我的範例") && (await A.labels()).length >= 2, "範例庫只有官方範例：" + (await A.labels()).join("、"));
    say(await A.page.evaluate(() => window.__bpArt.ws === null && window.__bpArt.retry === null), "沒有去連這台電腦的 Art-Net 橋");

    console.log("── 自己的範例存在瀏覽器：存、縮圖、重新整理還在；主機上沒有多出檔案");
    await A.page.$eval("#code", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, prog(8, OKBODY));
    await A.page.click("#addex");
    say(/這個瀏覽器/.test(await A.text("#exnote")), "新增範例的說明提到存在這個瀏覽器、可以匯出帶走");
    await A.page.type("#exname", NAME);
    A.reqs.length = 0;
    await A.page.click("#exsave");
    await A.waitStatus(/已存成範例/);
    say((await A.labels()).includes("我的範例") && (await A.lit()) === NAME, "卡片出現在「我的範例」而且亮著（" + (await A.lit()) + "）");
    await A.page.waitForFunction((n) => {
      const c = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === n);
      return c && c.querySelector(".thumb").style.backgroundImage.includes("data:image/png");
    }, { timeout: 60000 }, NAME).catch(() => {});
    say(String(await A.thumbOf(NAME)).includes("data:image/png"), "縮圖在這個頁面算出來");
    say((await A.page.$eval(".card.on", (el) => el.title)).split("\n")[1] === "雲端版測試用", "卡片的說明（滑鼠提示）取自程式檔頭的 @desc");
    say(A.reqs.some((r) => r.method === "POST" && r.path === "/examples/check") && !A.reqs.some((r) => r.method !== "GET" && ["/examples", "/example", "/thumb"].includes(r.path)),
        "存的時候只請編譯站檢查名稱與尺寸（/examples/check），沒有送出存檔、上傳縮圖的請求");
    say(listing() === before, "主機的「我的範例」與縮圖快取沒有多出檔案");
    // 同名的已經有了：先問要不要覆蓋，按取消就不動
    await A.page.$eval("#code", (el) => { el.value += "\n// 第二份"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await A.page.click("#addex");
    await A.page.$eval("#exname", (el) => { el.value = ""; });
    await A.page.type("#exname", NAME);
    A.dialogs.length = 0;
    A.dismissNext = true;
    await A.page.click("#exsave");
    for (let i = 0; i < 50 && !A.dialogs.length; i++) await sleep(100);
    say(A.dialogs.length === 1 && /已經有了/.test(A.dialogs[0]), "再存一個同名的：先問要不要覆蓋（" + (A.dialogs[0] || "沒有問") + "）");
    await A.page.click("#excancel");
    await A.page.$eval("#code", (el) => { el.value = el.value.replace("\n// 第二份", ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
    await sleep(600);
    await A.reload();
    await A.running();
    say((await A.titles()).includes(NAME) && (await A.lit()) === NAME && (await A.editor()).includes("seconds() * 3") && !(await A.editor()).includes("第二份"),
        "重新整理：範例還在（沒有被同名的蓋掉）、卡片亮著、編輯區是那段程式");
    say(String(await A.thumbOf(NAME)).includes("data:image/png") && !A.reqs.some((r) => r.search.includes("thumb=1")), "縮圖跟範例存在一起：重新整理不用重算");

    console.log("── 草稿自動存：改到一半重新整理，程式還在");
    await A.page.$eval("#code", (el) => { el.value += "\n// 改到一半"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await A.reload();                                         // 改完馬上重新整理（不等自動存的那零點幾秒）
    await A.running();
    say((await A.editor()).endsWith("// 改到一半") && (await A.lit()) === NAME, "改完馬上重新整理：編輯區還是改到一半的程式，卡片亮著");
    say((await A.shown("#exupdate")) && (await A.text("#exupdate")).includes(NAME), "還記得是改過沒存的：「💾 存回」還在");
    A.reqs.length = 0;
    await A.page.click("#exupdate");
    await A.waitStatus(/已存回/);
    for (let i = 0; i < 100 && !A.reqs.some((r) => r.search.includes("thumb=1")); i++) await sleep(100);
    say(A.reqs.some((r) => r.search.includes("thumb=1")), "存回之後縮圖照新的程式重算");
    await sleep(600);
    await A.reload();
    await A.running();
    say((await A.editor()).endsWith("// 改到一半") && !(await A.shown("#exupdate")), "存回之後重新整理：程式是新的，不再顯示「💾 存回」");
    // 存回的內容真的進了瀏覽器的範例庫（不是只留在草稿）：先載入別的範例，再點回來
    const other = (await A.titles())[0];
    await A.page.evaluate((t) => [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === t).click(), other);
    await A.page.waitForFunction((t) => [...document.querySelectorAll(".card.on .cname")].some((e) => e.textContent === t), { timeout: 30000 }, other);
    await A.page.evaluate((t) => [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === t).click(), NAME);
    await A.page.waitForFunction((t) => [...document.querySelectorAll(".card.on .cname")].some((e) => e.textContent === t), { timeout: 30000 }, NAME);
    await A.running();
    say((await A.editor()).endsWith("// 改到一半"), "載入別的範例再點回來：拿到的是存回之後的程式");
    await A.page.$eval("#code", (el) => { el.value = el.value.replace("#define PANEL 8", "#define PANEL 16"); el.dispatchEvent(new Event("input", { bubbles: true })); });
    await A.page.click("#exupdate");
    await A.waitStatus(/存回失敗/);
    say(/16×16/.test(await A.status()), "把 16×16 的程式存回 8×8 的範例：擋下並說明（" + (await A.status()).slice(0, 40) + "…）");
    await A.page.$eval("#code", (el) => { el.value = el.value.replace("#define PANEL 16", "#define PANEL 8"); el.dispatchEvent(new Event("input", { bubbles: true })); });

    console.log("── 別人（另一個瀏覽器）：看不到我的範例；網址帶 #c=代碼 就不用輸入");
    const B = await open(BASE + "/#c=" + encodeURIComponent(CODE), [null]);
    await B.running();
    say(B.dialogs.length === 0 && (await B.page.evaluate(() => location.hash)) === "", "網址帶代碼：沒有跳輸入框，代碼也從網址列拿掉了");
    say(!(await B.titles()).includes(NAME) && !(await B.labels()).includes("我的範例"), "別人的範例庫沒有我的範例");
    const idA = A.reqs.concat(sent).map((r) => r.headers["x-babit-client"]).find(Boolean), idB = (B.reqs.find((r) => r.headers["x-babit-client"]) || { headers: {} }).headers["x-babit-client"];
    say(!!idA && !!idB && idA !== idB, "兩個瀏覽器的代號不同（排隊時各排各的）");

    console.log("── 刪除、匯入、匯出");
    await A.page.click("#exdelete");
    await A.waitStatus(/已刪除/);
    await sleep(600);
    await A.reload();
    await A.running();
    say(!(await A.titles()).includes(NAME) && (await A.editor()).includes("// 改到一半"), "刪除後重新整理：卡片沒了，程式還在編輯區（草稿）");
    fs.writeFileSync(zipFile, packSketch({ name: "babit_1120_01", code: prog(16, OKBODY).replace("* 3", "* 5"), title: "匯入_cloud" }));
    const first = (await A.titles())[0];
    await A.page.evaluate((t) => [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === t).click(), first);   // 先載入官方範例（確認視窗按確定）
    await A.running();
    A.reqs.length = 0;
    await (await A.page.$("#eximportfile")).uploadFile(zipFile);
    await A.waitStatus(/已匯入成範例/);
    await A.page.waitForFunction(() => window.__bp.n === 16, { timeout: 30000 }).catch(() => {});
    say(/匯入_cloud/.test(await A.status()) && (await A.lit()) === "匯入_cloud" && (await A.editor()).includes("* 5") && (await A.page.evaluate(() => window.__bp.n)) === 16,
        "匯入 zip：存進瀏覽器、切到 16×16、載入並執行（" + (await A.status()) + "）");
    say(!A.reqs.some((r) => r.method !== "GET" && r.path === "/examples") && listing() === before, "匯入也沒有存到主機");
    A.reqs.length = 0;
    await A.page.click("#exexport");
    await A.waitStatus(/已匯出|匯出失敗/);
    const ex = A.reqs.find((r) => r.path === "/export/arduino");
    say(/已匯出/.test(await A.status()) && !!ex && ex.headers["x-babit-code"] === encodeURIComponent(CODE) && decodeURIComponent(ex.search).includes("title=匯入_cloud"),
        "匯出 Arduino 資料夾：帶課堂代碼與作品名稱（" + (await A.status()).slice(0, 30) + "…）");
    await A.page.click("#exdelete");
    await A.waitStatus(/已刪除/);

    console.log("── 不能燒錄的瀏覽器、沒輸入代碼");
    const C = await open(BASE, [null], (page) => page.evaluateOnNewDocument(() => { delete Navigator.prototype.serial; }));
    await C.waitStatus(/課堂代碼/);
    say(/要輸入課堂代碼才能執行/.test(await C.status()) && C.dialogs.length === 1, "輸入框按取消：不執行，狀態列說明要代碼（" + (await C.status()) + "）");
    say((await C.shown("#warn")) && /不能把程式燒進板子/.test(await C.text("#warn")), "沒有 Web Serial 的瀏覽器：開頁就提醒要用 Chrome 或 Edge（" + (await C.text("#warn")).slice(0, 30) + "…）");
    say((await C.titles()).length >= 6, "沒有代碼也看得到官方範例（" + (await C.titles()).length + " 張卡片）");

    say(!A.errors.length && !B.errors.length && !C.errors.length, "三個頁面都沒有 JavaScript 錯誤" + (A.errors.concat(B.errors, C.errors).length ? "：" + A.errors.concat(B.errors, C.errors).join("；") : ""));
    say(listing() === before, "整個過程主機上沒有多出任何範例或縮圖");
  } catch (e) {
    say(false, "測試中斷（等不到預期的畫面）：" + String((e && e.message) || e).split("\n")[0]);
  } finally {
    for (let i = 0; i < 180 && fwPending > 0; i++) await sleep(500);   // 等背景編的韌體編完再關，不留下編到一半的程序
    if (browser) await browser.close();
    station.kill();
    fs.rmSync(zipFile, { force: true });
    await sleep(300);
    fs.rmSync(path.join(__dirname, "tmp", String(PORT)), { recursive: true, force: true });
    for (const f of fs.readdirSync(path.join(__dirname, "tmp"))) if (f.startsWith(PORT + ".fw")) fs.rmSync(path.join(__dirname, "tmp", f), { force: true });
  }
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;
})();
