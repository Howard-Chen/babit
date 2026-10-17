// 工具頁的操作驗收（puppeteer）：node station/test_ui.js（需先啟動編譯站）
// puppeteer 預設借 147 的 D:/CSH/Design 安裝（BATOPIXEL_PUPPETEER 可指向別的 package.json）。
const { createRequire } = require("module");
const fs = require("fs"), path = require("path");
const puppeteer = createRequire(process.env.BATOPIXEL_PUPPETEER || "D:/CSH/Design/package.json")("puppeteer");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const prog = (n, body) => `// 測試\n#define PANEL ${n}\n#include "BatoPixel.h"\n\n${body}`;
const OKBODY = "void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(0, 0, RED);\n  show();\n}\n";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const dialogs = [];
  let dismissNext = false;           // 下一個確認視窗按「取消」（測試保留目前程式的選擇）
  page.on("dialog", (d) => {         // 確認視窗預設按「確定」，並記下跳過哪些
    dialogs.push(d.message());
    if (dismissNext) { dismissNext = false; d.dismiss(); } else d.accept();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fwReqs = [], prevReqs = [];  // 頁面送出的韌體／預覽編譯請求（背景預編、按執行的預覽要帶 bg=1，燒錄不帶）
  page.on("request", (r) => {
    if (r.url().includes("/compile/firmware")) fwReqs.push(r.url());
    if (r.url().includes("/compile/preview")) prevReqs.push(r.url());
  });
  const status = () => page.$eval("#status", (el) => el.textContent);
  const text = (sel) => page.$eval(sel, (el) => el.textContent);
  const visible = (sel) => page.$eval(sel, (el) => !el.hidden && el.offsetParent !== null);
  const labels = () => page.$$eval(".glabel", (els) => els.map((e) => e.textContent));
  const titles = () => page.$$eval(".card .cname", (els) => els.map((e) => e.textContent));
  const editor = () => page.$eval("#code", (el) => el.value);
  const waitStatus = (re, timeout = 30000) =>
    page.waitForFunction((s) => new RegExp(s).test(document.getElementById("status").textContent), { timeout }, re.source);
  const setCodeAndRun = async (code) => {
    await page.$eval("#code", (el, v) => { el.value = v; }, code);
    await page.$eval("#status", (el) => { el.textContent = ""; });
    await page.click("#run");
    await waitStatus(/執行中|失敗|停止/);
  };

  try {
    await page.goto(STATION, { waitUntil: "load" });

    // 1. 開頁：8×8、範例分組、第一個範例自動載入並執行；硬體設定頁已拿掉
    await page.waitForFunction(() => window.__bp && window.__bp.mod && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    say(await page.$eval("#sz8", (el) => el.classList.contains("on")), "開頁是 8×8");
    say(JSON.stringify(await labels()) === JSON.stringify(["基本", "感測器"]), "8×8 範例分組：" + (await labels()).join("、"));
    say((await editor()).includes("#define PANEL 8") && (await editor()).includes("彩虹流動"), "編輯區載入 8×8 的第一個範例");
    say(!(await page.$("#hwbtn")) && !(await page.$("#hw")), "硬體設定頁已拿掉");

    // 2. 切到 16×16：換一組範例、載入第一個、預覽變 16×16
    await page.click("#sz16");
    await page.waitForFunction(() => window.__bp.n === 16 && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    say((await titles()).includes("中文跑馬燈"), "16×16 範例有中文跑馬燈");
    say((await editor()).includes("#define PANEL 16"), "編輯區換成 16×16 的範例");
    say(await page.$eval("#sz16", (el) => el.classList.contains("on")), "16×16 鍵亮著");

    // 3. 16×16 模式貼上 8×8 的程式：跳尺寸不符的提醒（預覽照程式顯示 8×8）
    await setCodeAndRun(prog(8, OKBODY));
    say(await visible("#warn") && (await text("#warn")).includes("8×8 燈板用的"), "PANEL 不符時跳提醒：" + (await text("#warn")).slice(0, 40));

    // 4. 重新整理頁面：記得上次選的 16×16。改過程式後切回 8×8：不跳確認、程式留著、範例庫換成 8×8、提醒這段程式是 16×16 的
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__bp && window.__bp.n === 16 && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    say(await page.$eval("#sz16", (el) => el.classList.contains("on")), "重新整理後還是 16×16");
    await page.$eval("#code", (el) => { el.value += "\n// 改過"; });
    const kept = await editor();
    dialogs.length = 0;
    await page.click("#sz8");
    await page.waitForFunction(() => document.getElementById("sz8").classList.contains("on") &&
      [...document.querySelectorAll(".card .cname")].some((e) => e.textContent === "英文跑馬燈"), { timeout: 10000 });
    say(!dialogs.length && (await editor()) === kept, "改過的程式切換尺寸後還在（不跳確認）");
    say((await text("#warn")).includes("16×16 燈板用的"), "切到 8×8 後提醒這段程式是 16×16 的");

    // 5. delay()：編譯失敗、最上面一行說明怎麼辦、可以複製錯誤訊息
    await setCodeAndRun(prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  delay(100);\n  show();\n}\n"));
    say(await visible("#logwrap") && (await text("#log")).startsWith("程式用了 delay()"), "delay() 的說明在錯誤訊息最上面");
    await page.click("#copylog");
    say((await page.evaluate(() => window.__bpCopied || "")).includes("不能用 delay()"), "「複製錯誤訊息」複製到完整訊息");
    await setCodeAndRun(prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  delayMicroseconds(500000);\n  show();\n}\n"));
    say((await text("#log")).startsWith("程式用了 delayMicroseconds()"), "delayMicroseconds() 也擋下並說明");

    // 6. loop() 沒有 show()：琥珀色提醒
    await setCodeAndRun(prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(0, 0, RED);\n}\n"));
    await page.waitForFunction(() => !document.getElementById("warn").hidden, { timeout: 5000 }).catch(() => {});
    say((await text("#warn")).includes("show()"), "loop() 沒有 show() 時提醒");

    // 7. 用迴圈等時間：預覽停下並說明原因，頁面不會卡死
    await setCodeAndRun(prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  unsigned long t0 = millis();\n  while (millis() - t0 < 500) {}\n  show();\n}\n"));
    await waitStatus(/預覽停止/, 5000).catch(() => {});
    say((await status()).includes("預覽停止") && (await text("#log")).includes("一直在等時間"), "用迴圈等時間：預覽停下並說明原因");

    // 7b. 用迴圈等拍手：同一格裡聲音不會變，預覽停下並說明（頁面不會卡死）
    await setCodeAndRun(prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  while (!audio.beat()) {\n    fade(0.9f);\n  }\n  show();\n}\n"));
    await waitStatus(/預覽停止/, 5000).catch(() => {});
    say((await text("#log")).includes("等聲音、傾斜或按鈕"), "用迴圈等拍手：預覽停下並說明原因");

    // 8. 舊版 draw(t)：中文說明
    await setCodeAndRun("void draw(float t) {\n  dot(0, 0, RED);\n}\n");
    say((await text("#log")).includes("舊版"), "舊版 draw(t) 寫法有中文說明");

    // 9. 新增範例：把編輯區的程式存到 8×8／我的範例，卡片出現在「我的範例」分組
    const NAME = "測試範例_ui";
    const saved = path.join(__dirname, "..", "examples", "8x8", "我的範例", NAME + ".ino");
    try {
      await setCodeAndRun(prog(8, OKBODY));
      await page.click("#addex");
      say(await visible("#addpanel") && (await text("#exnote")).includes("8×8／我的範例"), "按「＋ 新增範例」打開存檔面板");
      await page.type("#exname", NAME);
      await page.click("#exsave");
      await page.waitForFunction((n) => [...document.querySelectorAll(".card .cname")].some((e) => e.textContent === n), { timeout: 10000 }, NAME);
      say((await labels()).includes("我的範例") && fs.existsSync(saved), "存檔後出現在「我的範例」，檔案在 examples/8x8/我的範例");
      say(await page.$eval(".card.on .cname", (el) => el.textContent) === NAME, "剛存的卡片亮著");
      // 同名再存一次：確認覆蓋（確認視窗按確定）
      await page.$eval("#status", (el) => { el.textContent = ""; });
      await page.click("#addex");
      await page.$eval("#exname", (el) => { el.value = ""; });
      await page.type("#exname", NAME);
      await page.click("#exsave");
      await waitStatus(/已存成範例/, 10000);
      say(true, "同名範例確認後覆蓋");
      // 名稱不合法：面板裡顯示原因
      await page.click("#addex");
      await page.$eval("#exname", (el) => { el.value = ""; });
      await page.type("#exname", "a/b");
      await page.click("#exsave");
      await page.waitForFunction(() => !document.getElementById("exerr").hidden, { timeout: 5000 });
      say((await text("#exerr")).includes("符號"), "名稱有 / 時說明原因：" + (await text("#exerr")));
      await page.click("#excancel");
      say(!(await visible("#addpanel")), "取消會收起面板");
    } finally {
      fs.rmSync(saved, { force: true });
    }

    // 9b. 範例檔是 CRLF 換行（學員電腦用 git 取出的檔案就是這樣）：載入後沒改過，換別的範例不跳「會蓋掉」確認
    const CRLF = "測試_CRLF";
    const crlfFile = path.join(__dirname, "..", "examples", "8x8", "我的範例", CRLF + ".ino");
    const clickCard = async (name) => {
      await page.$eval("#status", (el) => { el.textContent = ""; });
      await page.evaluate((n) => [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cname").textContent === n).click(), name);
      await waitStatus(/執行中|失敗|停止/);
    };
    try {
      fs.mkdirSync(path.dirname(crlfFile), { recursive: true });
      fs.writeFileSync(crlfFile, prog(8, OKBODY).replace(/\n/g, "\r\n"));
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction((n) => [...document.querySelectorAll(".card .cname")].some((e) => e.textContent === n) &&
        /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 }, CRLF);
      await clickCard(CRLF);
      dialogs.length = 0;
      await clickCard("英文跑馬燈");
      say(!dialogs.length && (await editor()).includes("跑馬燈"), "CRLF 換行的範例載入後沒改過：換範例不跳確認" + (dialogs.length ? "（跳了：" + dialogs[0] + "）" : ""));
    } finally {
      fs.rmSync(crlfFile, { force: true });
    }

    // 9c. 改自己的範例：選到「我的範例」的卡片才有「🗑 刪除」，程式改過才有「💾 存回」；官方範例都沒有
    const MINE = "測試_存回";
    const mineFile = path.join(__dirname, "..", "examples", "8x8", "我的範例", MINE + ".ino");
    const editCode = (from, to) => page.$eval("#code", (el, a, b) => {
      el.value = el.value.replace(a, b);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, from, to);
    try {
      fs.mkdirSync(path.dirname(mineFile), { recursive: true });
      fs.writeFileSync(mineFile, prog(8, OKBODY));
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction((n) => [...document.querySelectorAll(".card .cname")].some((e) => e.textContent === n) &&
        /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 }, MINE);
      await clickCard("彩虹流動");
      await editCode("255, 255", "255, 200");
      say(!(await visible("#exupdate")) && !(await visible("#exdelete")), "官方範例（改過也一樣）：沒有「存回」「刪除」");
      dialogs.length = 0;
      await clickCard(MINE);
      say(await visible("#exdelete") && !(await visible("#exupdate")), "選到自己的範例：有「刪除」，還沒改所以沒有「存回」");
      await editCode("RED", "BLUE");
      say(await visible("#exupdate") && (await text("#exupdate")).includes(MINE), "改了程式：出現「" + (await text("#exupdate")) + "」");
      await page.$eval("#status", (el) => { el.textContent = ""; });
      await page.click("#exupdate");
      await waitStatus(/已存回/, 10000);
      say(fs.readFileSync(mineFile, "utf8").includes("BLUE") && !(await visible("#exupdate")), "按「存回」：檔案換成新程式，按鈕收起來");
      await editCode("BLUE", "GREEN");
      await page.$eval("#status", (el) => { el.textContent = ""; });
      await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
      await waitStatus(/已存回/, 10000);
      say(fs.readFileSync(mineFile, "utf8").includes("GREEN"), "Ctrl+S 也會存回");
      dialogs.length = 0;
      await page.click("#exdelete");
      await page.waitForFunction((n) => ![...document.querySelectorAll(".card .cname")].some((e) => e.textContent === n), { timeout: 10000 }, MINE);
      say(dialogs.length === 1 && dialogs[0].includes(MINE) && !fs.existsSync(mineFile),
          "按「刪除」先問（" + (dialogs[0] || "沒有問") + "），確定後檔案與卡片都不見");
      say((await editor()).includes("GREEN") && !(await visible("#exdelete")), "刪掉後程式還留在編輯區，刪除鈕收起來");
      dialogs.length = 0;
      await clickCard("彩虹流動");
      say(dialogs.length === 1, "刪掉後換範例會先問，編輯區的程式不會悄悄不見");
    } finally {
      fs.rmSync(mineFile, { force: true });
    }

    // 10. 複製給 AI 的說明（AGENTS.md）
    await page.click("#aiguide");
    await page.waitForFunction(() => (window.__bpCopied || "").includes("#define PANEL") && /已複製/.test(document.getElementById("status").textContent), { timeout: 5000 });
    say(true, "複製給 AI 的說明");

    // 10b. 旋鈕與按鈕：預覽下方的滑桿＝knob.value()、按一下按鈕＝clicked()、按住＝pressed()；brightness() 調低時預覽變暗
    await setCodeAndRun(prog(8, "int clicks = 0;\n\nvoid setup() {\n  begin();\n}\n\nvoid loop() {\n  if (button1.clicked()) clicks++;\n" +
      "  clear();\n  dot(0, 0, rgb(knob.value() * 200, clicks * 10, button2.pressed() ? 255 : 0));\n  brightness(0.3f);\n  show();\n}\n"));
    const px0 = () => page.evaluate(() => Array.from(window.__bp.mod.HEAPU8.subarray(window.__bp.ptr, window.__bp.ptr + 3)));
    const frames = (n) => page.evaluate((k) => new Promise((ok) => { const go = () => (k-- > 0 ? requestAnimationFrame(go) : ok()); go(); }), n);
    say(await visible("#knob") && await visible("#btn1") && await visible("#btn2"), "預覽下方有旋鈕滑桿與兩顆按鈕");
    await page.$eval("#knob", (el) => { el.value = "25"; el.dispatchEvent(new Event("input")); });
    await frames(4);
    say((await px0())[0] === 50 && (await text("#knobv")) === "25%", "滑桿拉到 25%：knob.value() = 0.25（畫成 " + (await px0())[0] + "）");
    await page.click("#btn1"); await frames(4);
    await page.click("#btn1"); await frames(4);
    say((await px0())[1] === 20, "按兩下按鈕 1：clicked() 算到 2 次（畫成 " + (await px0())[1] + "）");
    const b2 = await page.$("#btn2"), box = await b2.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await frames(4);
    const held = (await px0())[2];
    await page.mouse.up(); await frames(4);
    say(held === 255 && (await px0())[2] === 0, "按住按鈕 2：pressed() 是 true，放開變 false");
    const canvasRed = await page.evaluate(() => document.getElementById("m").getContext("2d").getImageData(30, 30, 1, 1).data[0]);
    const fbRed = (await px0())[0];
    say(Math.abs(canvasRed - Math.round(fbRed * 0.5)) <= 2, "brightness(0.3)：預覽畫成預設亮度（60%）的一半（" + fbRed + " → " + canvasRed + "）");

    // 10c. 除錯模式：載入「感應器檢查」程式，右邊換成序列埠文字視窗；沒接板子時顯示預覽程式的 Serial 輸出
    // 先試「取消」：保留學員自己的程式，只打開文字視窗，看它自己用 Serial 印的東西
    await setCodeAndRun(prog(8, 'void setup() {\n  begin();\n}\n\nvoid loop() {\n  Serial.println("我的除錯訊息");\n  show();\n}\n'));
    dialogs.length = 0; dismissNext = true;
    await page.click("#debug");
    await page.waitForFunction(() => !document.getElementById("serialwrap").hidden, { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => document.getElementById("serialout").textContent.includes("我的除錯訊息"), { timeout: 5000 }).catch(() => {});
    say(dialogs.length === 1 && (await editor()).includes("我的除錯訊息") && (await text("#serialout")).includes("我的除錯訊息"),
        "進除錯模式時按「取消」：保留自己的程式，文字視窗顯示它用 Serial 印的東西");
    await page.click("#debug");
    await page.$eval("#code", (el) => { el.value = el.value + "\n"; });   // 程式改過：載入前要先問（這次按確定）
    dialogs.length = 0;
    await page.click("#debug");
    await page.waitForFunction(() => /^\/\/ 感應器檢查/.test(document.getElementById("code").value) &&
      /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    say(dialogs.length === 1, "程式改過時，進除錯模式前先問（" + (dialogs[0] || "沒有問") + "）");
    say(await visible("#serialwrap") && !(await visible("#m")), "除錯模式：右邊的燈板預覽換成文字視窗");
    say((await page.$eval("#code", (el) => el.value)).includes("#define PANEL 8"), "載入的程式跟著目前的燈板尺寸（8×8）");
    await page.waitForFunction(() => (document.getElementById("serialout").textContent.match(/旋鈕/g) || []).length >= 3, { timeout: 10000 }).catch(() => {});
    const out = await text("#serialout");
    say((out.match(/旋鈕/g) || []).length >= 3 && out.includes("按鈕1") && out.includes("傾斜"), "沒接板子時顯示預覽程式印出的數值（" + out.split("\n")[0].slice(0, 30) + "…）");
    say((await text("#serialconn")) === "連線板子", "有「連線板子」按鈕");
    await page.click("#serialclear");
    say((await text("#serialout")).length < out.length, "「清除」會清掉文字");
    await page.click("#debug");
    say(await visible("#m") && !(await visible("#serialwrap")), "再按一次除錯模式：回到燈板預覽");

    // 11. 截圖給使用者看（station/tmp 不進版控）
    await page.click("#addex");
    await page.screenshot({ path: path.join(__dirname, "tmp", "ui_babit.png") });
    await page.click("#excancel");

    // 12. 背景預編帶 bg=1（編譯站只留最新的一個在排隊，連點範例不會讓燒錄等一長串）；按燒錄送的不帶，不會被取代
    const allBg = fwReqs.every((u) => u.endsWith("?bg=1"));
    say(fwReqs.length > 0 && allBg,
        `背景預編都帶 bg=1（${fwReqs.length} 次）` + (allBg ? "" : "：" + fwReqs.find((u) => !u.endsWith("?bg=1")).replace(STATION, "")));
    await page.evaluate(() => {      // 不真的跳出選序列埠的視窗
      const no = () => Promise.reject(new Error("測試：不選序列埠"));
      if (navigator.serial) navigator.serial.requestPort = no;
      else Object.defineProperty(navigator, "serial", { value: { requestPort: no } });
    });
    const sent = fwReqs.length;
    await page.click("#flash");
    for (let i = 0; i < 50 && fwReqs.length === sent; i++) await new Promise((r) => setTimeout(r, 100));
    say(fwReqs.length > sent && !fwReqs[sent].includes("bg="), "按燒錄送的韌體編譯不帶 bg：" + (fwReqs[sent] || "沒有送出").replace(STATION, ""));

    // 12b. 連點三個範例：只跑最後一個（預覽跑的就是編輯區那段程式，前面的結果回來也不會蓋過去）；按執行送的預覽帶 bg=1
    await page.$eval("#status", (el) => { el.textContent = ""; });
    for (const t of ["彩虹流動", "按鈕切換模式", "英文跑馬燈"])
      await page.evaluate((n) => [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cname").textContent === n).click(), t);
    const settled = await page.waitForFunction(() => window.__bp && window.__bp.code === document.getElementById("code").value &&
      /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 }).then(() => true, () => false);
    say(settled && (await editor()).includes("英文跑馬燈"), "連點三個範例：預覽跑的是最後一個（編輯區那段）");
    const allBgPreview = prevReqs.every((u) => u.endsWith("?bg=1"));
    say(prevReqs.length > 0 && allBgPreview, `按執行送的預覽都帶 bg=1（${prevReqs.length} 次）` + (allBgPreview ? "" : "：" + prevReqs.find((u) => !u.endsWith("?bg=1")).replace(STATION, "")));

    // ── 第二部分（Task 8）插在這一行上面 ──

    say(!errors.length, "頁面沒有 JavaScript 錯誤" + (errors.length ? "：" + errors.join("；") : ""));
  } finally {
    await browser.close();
  }
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;   // 跟其他測試一致：不用 process.exit() 硬結束
})();
