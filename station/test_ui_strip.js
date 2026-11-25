// 工具頁的燈條預覽（puppeteer）：BATOPIXEL_STATION=http://127.0.0.1:8939 node station/test_ui_strip.js（需先啟動編譯站）
//
// 程式開頭寫 #define STRIP 60 ＝ 另一個接口接了一條燈條。這是特定檔期（聖誕花圈課）才用的東西，
// 所以預覽預設收著：燈板預覽下面只有一個「燈條預覽」的收合鈕，點開才畫一排燈；開關狀態記在瀏覽器裡。
// 程式有用燈條但預覽收著時，鈕上會提示「這份程式有幾顆燈條」。除錯模式（零件檢查）不顯示這一塊。
const { createRequire } = require("module");
const puppeteer = createRequire(process.env.BATOPIXEL_PUPPETEER || "D:/CSH/Design/package.json")("puppeteer");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const sketch = (strip, body, head = "") => `// 測試\n#define PANEL 8\n${head}${strip ? "#define STRIP " + strip + "\n" : ""}#include "BatoPixel.h"\n\n` +
  `void setup() {\n  begin();\n}\n\nvoid loop() {\n${body}  dot(0, 0, RED);\n  show();\n}\n`;
const THREE = "  strip.fill(BLUE);\n  strip.dot(0, RED);\n  strip.dot(STRIP - 1, GREEN);\n";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const waitStatus = (re, timeout = 30000) =>
    page.waitForFunction((s) => new RegExp(s).test(document.getElementById("status").textContent), { timeout }, re.source);
  const run = async (code) => {
    await page.$eval("#code", (el, v) => { el.value = v; }, code);
    await page.$eval("#status", (el) => { el.textContent = ""; });
    await page.click("#run");
    await waitStatus(/執行中|失敗|停止/);
    await page.evaluate(() => new Promise((r) => { const t0 = window.__bp.ticks; (function w() { window.__bp.mod && window.__bp.ticks > t0 + 2 ? r() : requestAnimationFrame(w); })(); }));
  };
  const firstRun = () => page.waitForFunction(() => window.__bp && window.__bp.mod && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
  // 收合鈕與燈條畫布現在的樣子
  const box = () => page.evaluate(() => {
    const t = document.getElementById("striptoggle"), c = document.getElementById("stripcv"), n = document.getElementById("stripnote");
    const shown = (el) => !!el && !el.hidden && el.offsetParent !== null;
    return { toggle: shown(t), text: t ? t.textContent : "", open: t ? t.getAttribute("aria-expanded") : null, has: !!t && t.classList.contains("has"),
             canvas: shown(c), w: c ? c.width : 0, h: c ? c.height : 0, cssW: c ? Math.round(c.getBoundingClientRect().width) : 0,
             note: shown(n) ? n.textContent : "", below: t && document.getElementById("m").getBoundingClientRect().bottom <= t.getBoundingClientRect().top };
  });
  // 第 i 顆燈正中間畫的顏色（照工具頁自己的排法 __bpStripLayout 找位置）
  const led = (i) => page.evaluate((i) => {
    const c = document.getElementById("stripcv"), L = window.__bpStripLayout(window.__bp.mod._bp_strip_count());
    const p = L.at(i), d = c.getContext("2d").getImageData(Math.round(p.x + L.w / 2), Math.round(p.y + L.h / 2), 1, 1).data;
    return [d[0], d[1], d[2]].join();
  }, i);
  const layout = (n) => page.evaluate((n) => {
    const L = window.__bpStripLayout(n), ps = Array.from({ length: n }, (_, i) => L.at(i));
    return { w: L.w, h: L.h, width: L.width, height: L.height, rows: new Set(ps.map((p) => p.y)).size,
             right: Math.max(...ps.map((p) => p.x)) + L.w, bottom: Math.max(...ps.map((p) => p.y)) + L.h, left: Math.min(...ps.map((p) => p.x)),
             distinct: new Set(ps.map((p) => p.x + "," + p.y)).size, ordered: ps.every((p, i) => i === 0 || p.y > ps[i - 1].y || (p.y === ps[i - 1].y && p.x > ps[i - 1].x)) };
  }, n);

  try {
    await page.goto(STATION, { waitUntil: "load" });
    await firstRun();

    console.log("── 預設收著");
    let b = await box();
    say(b.toggle && b.open === "false" && !b.canvas && b.below, "燈板預覽下面有「燈條預覽」的收合鈕，預設收著、沒有畫燈條（" + b.text + "）");
    say(/燈條預覽/.test(b.text) && !b.has && !/顆/.test(b.text), "沒有用燈條的程式：鈕上沒有提示");

    console.log("── 程式有用燈條");
    await run(sketch(60, THREE));
    b = await box();
    say(b.open === "false" && !b.canvas, "執行有燈條的程式：預覽還是收著（要自己點開）");
    say(b.has && /60 顆/.test(b.text), "……但鈕上提示這份程式有燈條（" + b.text + "）");
    await page.click("#striptoggle");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    b = await box();
    say(b.open === "true" && b.canvas && b.cssW <= 480 && b.w === b.cssW, "點一下展開：出現一排燈（畫布 " + b.w + "×" + b.h + "）");
    say(/B 接口/.test(b.text) && /60 顆/.test(b.text), "標題寫接在哪個接口、幾顆（" + b.text + "）");
    const L60 = await layout(60);
    say(L60.rows === 1 && L60.ordered && L60.distinct === 60 && L60.left >= 0 && L60.right <= 480 && L60.w >= 4, `60 顆排成一直線、由左到右，放得進預覽的寬度（每顆寬 ${L60.w}，到 ${L60.right}）`);
    say((await led(0)) === "255,0,0" && (await led(59)) === "0,255,0" && (await led(30)) === "0,0,255",
        "顏色跟程式畫的一樣：第一顆紅、最後一顆綠、中間藍（" + (await led(0)) + "｜" + (await led(59)) + "｜" + (await led(30)) + "）");

    console.log("── 亮度、接口、顆數");
    await run(sketch(60, "  strip.brightness(0.3f);\n" + THREE, "#define PORT B\n"));
    const dimmed = (await led(30)).split(",").map(Number);
    b = await box();
    say(dimmed[2] >= 126 && dimmed[2] <= 129 && dimmed[0] === 0, "strip.brightness(0.3)：預覽跟著變暗（預設 0.6 的一半，藍 " + dimmed[2] + "）");
    say(/A 接口/.test(b.text), "燈板改接 B（#define PORT B）：燈條是 A 接口（" + b.text + "）");
    await run(sketch(300, THREE));
    const L300 = await layout(300);
    b = await box();
    say(/300 顆/.test(b.text) && L300.rows > 1 && L300.distinct === 300 && L300.ordered && L300.right <= 480 && L300.w >= 4 && b.h >= L300.bottom,
        `300 顆：一排放不下就折成 ${L300.rows} 排（每顆寬 ${L300.w}），整條都看得到（畫布高 ${b.h}）`);
    say((await led(0)) === "255,0,0" && (await led(299)) === "0,255,0", "折排之後第一顆、最後一顆的顏色還是對的");
    await run(sketch(1, "  strip.fill(WHITE);\n"));
    say((await led(0)) === "255,255,255" && (await layout(1)).w <= 28, "只有 1 顆也畫得出來（不會變成一大塊）");

    console.log("── 開關狀態記得住");
    await page.reload({ waitUntil: "load" });
    await firstRun();
    b = await box();
    say(b.open === "true" && !b.canvas && /沒有用燈條/.test(b.note) && /#define STRIP/.test(b.note), "重新整理後還是展開的；這時的程式沒有燈條：不畫，說明怎麼加（" + b.note + "）");
    await page.click("#striptoggle");
    b = await box();
    say(b.open === "false" && !b.canvas && !b.note, "再點一下收起來");
    await page.reload({ waitUntil: "load" });
    await firstRun();
    say((await box()).open === "false", "收起來也記得住");

    console.log("── 除錯模式（零件檢查）不顯示燈條");
    await page.click("#debug");
    await page.waitForFunction(() => document.querySelector(".right").classList.contains("dbg"), { timeout: 30000 });
    say(!(await box()).toggle, "除錯模式：收合鈕收起來（零件檢查沒有燈條，畫面留給文字視窗）");
    await page.click("#debug");
    await page.waitForFunction(() => !document.querySelector(".right").classList.contains("dbg"), { timeout: 30000 });
    say((await box()).toggle, "離開除錯模式：收合鈕回來");

    say(errors.length === 0, "頁面沒有 JavaScript 錯誤" + (errors.length ? "：" + errors.slice(0, 3).join("；") : ""));
  } catch (e) {
    say(false, "測試中斷：" + e.message);
  } finally {
    await browser.close();
  }
  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部通過 → PASS"));
  process.exitCode = bad ? 1 : 0;
})();
