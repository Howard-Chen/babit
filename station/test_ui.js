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
    // 「我的範例」不算：開發機的桌面捷徑開的就是這份工作區，8×8 的「我的範例」隨時可能有巴特自己存的東西
    say(JSON.stringify((await labels()).filter((l) => l !== "我的範例")) === JSON.stringify(["基本", "感測器"]), "8×8 範例分組：" + (await labels()).join("、"));
    say((await editor()).includes("#define PANEL 8") && (await editor()).includes("彩虹流動"), "編輯區載入 8×8 的第一個範例");
    say(!(await page.$("#hwbtn")) && !(await page.$("#hw")), "硬體設定頁已拿掉");
    // 範例卡片：只有縮圖和標題（說明改放在滑鼠提示），每一組排成兩排——範例多了以後不用一直左右拖（2026-11-24）
    const gal = await page.evaluate(() => {
      // 位置用 offsetLeft／offsetTop：選中的那張卡片會往下沉 2 像素（transform），用畫面上的座標會被算成另一排
      const cs = [...document.querySelector(".group").querySelectorAll(".card")].map((c) => { const n = c.querySelector(".cname");
        return { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, name: n.textContent, text: c.textContent.trim(), tip: c.title }; });
      return { cs, descs: document.querySelectorAll(".card .cdesc").length, height: Math.round(document.querySelector(".gallery").getBoundingClientRect().height) };
    });
    say(gal.descs === 0 && gal.cs.every((c) => c.text === c.name), "卡片上只有標題，沒有說明文字（" + gal.cs.slice(0, 3).map((c) => c.text).join("、") + "…）");
    say(gal.cs.every((c) => c.tip.startsWith(c.name)) && gal.cs.some((c) => c.tip.length > c.name.length + 2), "說明放在滑鼠提示：" + (gal.cs[0] || { tip: "" }).tip.replace(/\n/g, "｜").slice(0, 40));
    const rows = [...new Set(gal.cs.map((c) => c.y))];
    say(gal.cs.length >= 3 && rows.length === 2 && gal.cs[1].x === gal.cs[0].x && gal.cs[1].y > gal.cs[0].y && gal.cs[2].x > gal.cs[0].x && gal.cs[2].y === gal.cs[0].y,
        `每一組排兩排、由上而下再往右：第 2 張在第 1 張下面，第 3 張在右邊那一欄的上面（共 ${rows.length} 排）`);
    say(gal.cs[0].w <= 110 && gal.height <= 356, `卡片變窄（寬 ${gal.cs[0].w}，原本 134）、兩排加起來不比原本帶說明的一排高（範例區高 ${gal.height}，原本 356）`);

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
    say((await text("#log")).includes("等聲音、傾斜、按鈕或蜂鳴器"), "用迴圈等拍手：預覽停下並說明原因");

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
    say(await visible("#knob") && await visible("#btn1") && await visible("#btn2") && await visible("#btn3") && await visible("#btn4"), "預覽下方有旋鈕滑桿與四顆按鈕");
    const spots = await page.evaluate(() => ["btn1", "btn2", "btn3", "btn4"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
    say(spots[0][1] === spots[1][1] && spots[2][1] === spots[3][1] && spots[2][1] > spots[0][1] && spots[0][0] === spots[2][0] && spots[1][0] === spots[3][0] && spots[1][0] > spots[0][0],
        "四顆按鈕排成兩排，跟板子一樣：1、2 在上，3、4 在下（" + JSON.stringify(spots) + "）");
    const fits = await page.evaluate(() => { const row = document.getElementById("inputs").getBoundingClientRect(), col = document.querySelector(".right").getBoundingClientRect(); return row.left >= col.left && row.right <= col.right; });
    say(fits, "旋鈕、按鈕那一列沒有超出右邊的欄位");
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

    // 10b2. 按鈕 3、4 與蜂鳴器（2026-11 改版的板子）：預覽用電腦的喇叭發聲，畫面上顯示頻率；預覽停下來就不能還在響
    await setCodeAndRun(prog(8, "int c3 = 0;\n\nvoid setup() {\n  begin();\n}\n\nvoid loop() {\n  if (button3.clicked()) c3++;\n" +
      "  if (button4.pressed()) buzzer.tone(NOTE_A5);\n  else buzzer.off();\n  clear();\n  dot(0, 0, rgb(c3 * 10, 0, 0));\n  show();\n}\n"));
    await page.click("#btn3"); await frames(4);
    await page.click("#btn3"); await frames(4);
    say((await px0())[0] === 20, "按兩下按鈕 3：button3.clicked() 算到 2 次（畫成 " + (await px0())[0] + "）");
    // hz＝程式現在要蜂鳴器響的頻率（畫面上顯示的）；out＝真的送到電腦喇叭的頻率（靜音、還沒點過頁面、分頁收起來時是 0）
    const buzzNow = () => page.evaluate(() => ({ hz: window.__bpBuzz.hz, out: window.__bpBuzz.out, muted: window.__bpBuzz.muted,
      hud: document.getElementById("buzzhud").textContent,
      osc: window.__bpBuzz.osc ? Math.round(window.__bpBuzz.osc.frequency.value) : null, ac: !!window.__bpBuzz.ac }));
    let bz = await buzzNow();
    say(bz.hz === 0 && bz.out === 0 && !/Hz/.test(bz.hud) && /🔔/.test(bz.hud), "還沒叫蜂鳴器響：畫面上沒有頻率（「" + bz.hud + "」）");
    const b4 = await page.$("#btn4"), box4 = await b4.boundingBox();
    await page.mouse.move(box4.x + box4.width / 2, box4.y + box4.height / 2);
    await page.mouse.down(); await frames(6);
    const ringing = await buzzNow();
    // 切到別的分頁時瀏覽器會暫停畫面更新，程式沒機會叫它停：頁面要自己先讓喇叭安靜（不然會一直響到切回來）
    const hiddenOut = await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      const out = window.__bpBuzz.out;
      delete document.visibilityState;
      return out;
    });
    await frames(6);
    const back = await buzzNow();
    await page.mouse.up(); await frames(6);
    const quiet = await buzzNow();
    say(ringing.hz === 880 && ringing.out === 880 && /🔔 880 Hz/.test(ringing.hud) && ringing.ac && ringing.osc === 880, "按住按鈕 4：buzzer.tone(NOTE_A5) → 喇叭發 880 Hz，畫面顯示「" + ringing.hud + "」");
    say(hiddenOut === 0 && back.out === 880, "響到一半切到別的分頁：喇叭馬上安靜；切回來（程式還在叫它響）就繼續響");
    say(quiet.hz === 0 && quiet.out === 0 && !/Hz/.test(quiet.hud), "放開：buzzer.off() → 停、畫面上的頻率消失");

    // 靜音鍵（就是顯示頻率的那一顆）：電腦喇叭不出聲，畫面照樣顯示程式要它響的頻率；再按一次恢復。課堂上十幾台電腦一起響會很吵
    const TONE = (hz) => prog(8, `void setup() {\n  begin();\n}\n\nvoid loop() {\n  buzzer.tone(${hz});\n  clear();\n  dot(0, 0, RED);\n  show();\n}\n`);
    await setCodeAndRun(TONE(880));
    await frames(6);
    bz = await buzzNow();
    say(bz.hz === 880 && bz.out === 880 && !bz.muted, "程式一直叫它響 880 Hz：喇叭在響");
    await page.click("#buzzhud"); await frames(4);
    bz = await buzzNow();
    const stored = () => page.evaluate(() => { try { return localStorage.getItem("babit-buzz-muted"); } catch (_) { return "讀不到"; } });
    say(bz.muted && bz.out === 0 && bz.hz === 880 && /🔕 880 Hz/.test(bz.hud) && (await stored()) === "1",
        "按一下靜音：喇叭不出聲，畫面顯示「" + bz.hud + "」（程式還是在叫它響），而且記在瀏覽器裡");
    await page.click("#buzzhud"); await frames(4);
    bz = await buzzNow();
    say(!bz.muted && bz.out === 880 && /🔔 880 Hz/.test(bz.hud) && (await stored()) !== "1", "再按一下：恢復出聲（「" + bz.hud + "」）");
    const rowFits = await page.evaluate(() => { const row = document.getElementById("inputs").getBoundingClientRect(), col = document.querySelector(".right").getBoundingClientRect(); return row.left >= col.left && row.right <= col.right; });
    say(rowFits, "顯示頻率時，旋鈕、按鈕、靜音鍵那一列沒有超出右邊的欄位");
    // 重新整理頁面：還是靜音
    await page.click("#buzzhud"); await frames(2);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__bp && window.__bp.mod && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    bz = await buzzNow();
    say(bz.muted && /🔕/.test(bz.hud), "靜音之後重新整理頁面：還是靜音（「" + bz.hud + "」）");
    // 瀏覽器規定使用者點過頁面才能出聲。開頁自動執行的程式如果一開始就一直響同一個音，點過頁面之後要聽得到
    // （以前只在頻率改變時才去開喇叭：頻率一直沒變，點了也沒聲音）。這裡用程式去按（不算使用者的操作）
    await page.evaluate((code) => {
      document.getElementById("buzzhud").click();              // 取消靜音
      document.getElementById("code").value = code;
      document.getElementById("run").click();
    }, TONE(2000));
    await page.waitForFunction(() => window.__bpBuzz.hz === 2000, { timeout: 30000 }).catch(() => {});
    await frames(6);
    bz = await buzzNow();
    say(!bz.muted && bz.hz === 2000 && bz.out === 0 && !bz.ac, "還沒點過頁面：程式要它響 2000 Hz，喇叭還不能出聲（畫面照樣顯示「" + bz.hud + "」）");
    await page.mouse.click(4, 4); await frames(6);
    bz = await buzzNow();
    say(bz.out === 2000 && bz.ac && bz.osc === 2000, "在頁面上點一下之後：同一個音開始從喇叭出來（不用等程式換頻率）");
    // 程式改壞了（編譯失敗）：舊的預覽還在跑，但不能繼續響
    await setCodeAndRun(TONE(2000).replace("void loop() {", "void loop( {"));
    await frames(6);
    bz = await buzzNow();
    say(/編譯失敗/.test(await status()) && bz.hz === 0 && bz.out === 0 && !/Hz/.test(bz.hud), "改成編不過的程式：舊的預覽不再出聲（不然一邊看錯誤訊息一邊被吵）");
    await setCodeAndRun(TONE(2000));
    await frames(6);
    say((await buzzNow()).out === 2000, "改回編得過的程式：又響了");
    // 提醒（預覽聽起來正常、板子上會出問題）：把毫秒當成秒、音太低
    await frames(70);
    say(!(await visible("#warn")), "響 2000 Hz：沒有提醒");
    await setCodeAndRun(prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  if (button1.clicked()) buzzer.beep(NOTE_C7, 200);\n  clear();\n  dot(0, 0, RED);\n  show();\n}\n"));
    await page.click("#btn1");
    await page.waitForFunction(() => !document.getElementById("warn").hidden, { timeout: 5000 }).catch(() => {});
    say(/單位是秒/.test(await text("#warn")), "buzzer.beep(頻率, 200)：提醒長度的單位是秒（" + (await text("#warn")).slice(0, 34) + "…）");
    await setCodeAndRun(TONE(262));
    await page.waitForFunction(() => /很小聲/.test(document.getElementById("warn").textContent), { timeout: 5000 }).catch(() => {});
    say(/1000 Hz.*很小聲/.test(await text("#warn")) && !/單位是秒/.test(await text("#warn")),
        "一直響 262 Hz：提醒板子上的蜂鳴器 1000 Hz 以下很小聲（上一支程式的提醒不會留著）");
    await setCodeAndRun(TONE(2000));
    await frames(70);
    say(!(await visible("#warn")), "換回 2000 Hz：提醒消失");
    await setCodeAndRun(prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  buzzer.tone(1000);\n  if (seconds() > 0.5f) { while (millis() < 99999999) {} }\n  show();\n}\n"));
    await waitStatus(/預覽停止/, 8000).catch(() => {});
    await frames(4);
    say((await buzzNow()).hz === 0 && /預覽停止/.test(await status()), "程式卡住、預覽停下來：蜂鳴器也跟著停（不會一直響）");

    // 10c. 除錯模式：載入「零件檢查」程式，右邊換成序列埠文字視窗；沒接板子時顯示預覽程式的 Serial 輸出
    // 先試「取消」：保留學員自己的程式，只打開文字視窗，看它自己用 Serial 印的東西
    // 這支程式的燈板接在 B 接口（#define PORT b，小寫也收）：等一下載入零件檢查時要一起帶過去，不然燈板不會亮
    await setCodeAndRun(prog(8, 'void setup() {\n  begin();\n}\n\nvoid loop() {\n  Serial.println("我的除錯訊息");\n  show();\n}\n')
      .replace("#define PANEL 8\n", "#define PANEL 8\n#define PORT b\n"));
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
    await page.waitForFunction(() => /^\/\/ 零件檢查/.test(document.getElementById("code").value) &&
      /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    say(dialogs.length === 1 && /零件檢查/.test(dialogs[0] || ""), "程式改過時，進除錯模式前先問（" + (dialogs[0] || "沒有問") + "）");
    // 還沒接板子：燈板預覽縮小留在上面（零件檢查的說明講的是「燈板上」的八塊，要看得到），下面是清單和文字視窗
    const canvasBox = () => page.evaluate(() => { const c = document.getElementById("m"), r = c.getBoundingClientRect();
      return { shown: !c.hidden && c.offsetParent !== null, w: Math.round(r.width), h: Math.round(r.height),
               textBottom: Math.round(document.getElementById("serialout").getBoundingClientRect().bottom), view: window.innerHeight }; });
    let cb = await canvasBox();
    say(await visible("#serialwrap") && cb.shown && cb.w === cb.h && cb.w >= 160 && cb.w <= 240 && cb.textBottom <= cb.view,
        `除錯模式（還沒接板子）：燈板預覽縮小（${cb.w}×${cb.h}）留在上面，下面是文字視窗，整個不用捲動就看得到（底部 ${cb.textBottom}／${cb.view}）`);
    // 小螢幕的筆電（1366×768 的瀏覽器裡大約 657 高、1280×720 大約 609 高）：零件檢查要按預覽的按鈕、轉旋鈕、開麥克風，
    // 這一排和靜音鍵、音量儀表都不能被擠到畫面下面（燈板預覽和文字視窗跟著縮）
    for (const [w, h, meter] of [[1366, 657, false], [1366, 657, true], [1280, 609, true]]) {
      await page.setViewport({ width: w, height: h });
      const f = await page.evaluate((on) => {
        document.getElementById("meter").classList.toggle("on", on);
        const bottom = (id) => Math.round(document.getElementById(id).getBoundingClientRect().bottom);
        const c = document.getElementById("m").getBoundingClientRect();
        // 看的是右邊這一欄的東西有沒有在畫面內（1280 寬時左邊那一欄本來就比畫面高，整頁能不能捲不是這裡管的）
        const r = { view: window.innerHeight, inputs: bottom("inputs"), meter: on ? bottom("meter") : 0,
                    top: Math.round(c.top), canvas: Math.round(c.width), text: Math.round(document.getElementById("serialout").getBoundingClientRect().height) };
        document.getElementById("meter").classList.remove("on");
        return r;
      }, meter);
      say(f.inputs <= f.view && f.meter <= f.view && f.top >= 0 && f.canvas >= 100 && f.text >= 80,
          `${w}×${h}${meter ? "、開著音量儀表" : ""}：不用捲動，旋鈕按鈕那一排（底 ${f.inputs}）${meter ? "和儀表（底 " + f.meter + "）" : ""}都在畫面內（高 ${f.view}）；燈板預覽 ${f.canvas}、文字視窗高 ${f.text}`);
    }
    await page.setViewport({ width: 1400, height: 900 });
    cb = await canvasBox();
    say(cb.w === 200 && cb.textBottom <= cb.view, `回到大螢幕：燈板預覽恢復 ${cb.w}，文字視窗一樣看得到`);
    const loaded = await page.$eval("#code", (el) => el.value);
    say(loaded.includes("#define PANEL 8"), "載入的程式跟著目前的燈板尺寸（8×8）");
    say(/^#define PANEL 8[^\n]*\n#define PORT B[^\n]*\n#define OLD_BOARD 0[^\n]*\n#include "BatoPixel\.h"/m.test(loaded),
        "原本的程式燈板接在 B 接口：載入的零件檢查也帶著 #define PORT B（不然燒進去燈板全黑）");
    // 零件檢查每半秒印的那一行現況不放進文字視窗（會一直往上捲），畫成上面釘著的清單：每個零件一格，✓ 過關、… 還沒試、✗ 沒接好
    const panel = () => page.evaluate(() => ({
      shown: !document.getElementById("checkpanel").hidden && document.getElementById("checkpanel").offsetParent !== null,
      title: (document.querySelector("#checkpanel .ctitle") || { textContent: "" }).textContent,
      chips: [...document.querySelectorAll("#checkpanel .chip")].map((c) => (c.classList.contains("ok") ? "✓" : c.classList.contains("bad") ? "✗" : "…") + c.dataset.name) }));
    // 等清單顯示出來、標題符合（收起來的清單裡留著上一次的內容，所以一定要連「有沒有顯示」一起等）
    const waitPanel = (re, timeout = 10000) => page.waitForFunction((s) => {
      const el = document.getElementById("checkpanel"), t = el.querySelector(".ctitle");
      return !el.hidden && !!t && new RegExp(s).test(t.textContent);
    }, { timeout }, re.source).catch(() => {});
    await waitPanel(/項過關/);
    let p = await panel();
    say(p.shown && /0／7/.test(p.title) && p.chips.join() === "…按鈕 1,…按鈕 2,…按鈕 3,…按鈕 4,…旋鈕,…麥克風,…傾斜,…蜂鳴器",
        "文字視窗上面釘著零件清單（" + p.title + "）：" + p.chips.join("　"));
    await page.waitForFunction(() => document.getElementById("serialout").textContent.includes("還沒過："), { timeout: 10000 }).catch(() => {});
    const out = await text("#serialout");
    say(/四個角落＝按鈕/.test(out) && /還沒過：/.test(out) && !/零件檢查 \d\/\d｜/.test(out), "文字視窗只有說明與「還沒過」的清單，每半秒一行的現況不在裡面（不洗版）");
    await page.click("#btn1");
    await page.waitForFunction(() => document.getElementById("serialout").textContent.includes("✓ 按鈕 1 過關"), { timeout: 5000 }).catch(() => {});
    await waitPanel(/2／7/, 5000);
    p = await panel();
    say((await text("#serialout")).includes("✓ 按鈕 1 過關") && /2／7/.test(p.title) && p.chips[0] === "✓按鈕 1" && p.chips[7] === "✓蜂鳴器" && p.chips[1] === "…按鈕 2",
        "除錯模式下預覽的旋鈕、按鈕照樣可以按：按一下按鈕 1，清單上按鈕 1 和蜂鳴器打勾（" + p.title + "），文字視窗印出「✓ 按鈕 1 過關」");
    say((await text("#serialconn")) === "連線板子", "有「連線板子」按鈕");
    await page.click("#serialclear");
    say((await text("#serialout")).length < out.length, "「清除」會清掉文字");
    // 除錯模式開著時切換燈板尺寸：要換成新尺寸的零件檢查，不能悄悄換成範例——「除錯模式」還亮著，按燒錄卻燒進彩虹流動
    // （2026-11-24 巴特實機踩到：板子顯示彩虹、文字只有開機那一行）
    const dbgOn = () => page.$eval("#debug", (el) => el.classList.contains("on"));
    const waitRun = (n) => page.waitForFunction((k) => window.__bp.n === k && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 }, n).catch(() => {});
    await page.click("#sz16");
    await waitRun(16);
    await page.waitForFunction(() => /^\/\/ 零件檢查/.test(document.getElementById("code").value), { timeout: 5000 }).catch(() => {});
    let ed = await editor();
    say(/^\/\/ 零件檢查/.test(ed) && /^#define PANEL 16\b/m.test(ed) && /^#define PORT B\b/m.test(ed) && await dbgOn() && await visible("#serialwrap"),
        "除錯模式開著時切到 16×16：編輯區還是零件檢查（PANEL 換成 16、PORT 照舊），沒有被換成範例（第一行：" + ed.split("\n")[0] + "）");
    say(await page.evaluate(() => /^\/\/ 零件檢查/.test(window.__bp.code || "")), "預覽跑的也是 16×16 的零件檢查");
    await page.click("#sz8");
    await waitRun(8);
    await page.waitForFunction(() => /^#define PANEL 8\b/m.test(document.getElementById("code").value), { timeout: 5000 }).catch(() => {});
    ed = await editor();
    say(/^\/\/ 零件檢查/.test(ed) && /^#define PANEL 8\b/m.test(ed) && await dbgOn(), "切回 8×8：零件檢查跟著換回 PANEL 8");
    // 除錯模式開著時點範例卡片：就是要看那個範例了，離開除錯模式（不然燈還亮著、編輯區卻是範例）
    const cardName = await page.evaluate(() => { const c = document.querySelectorAll(".card")[1]; c.click(); return c.querySelector(".cname").textContent; });
    await page.waitForFunction(() => document.getElementById("serialwrap").hidden && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 }).catch(() => {});
    ed = await editor();
    say(!(await dbgOn()) && !(await visible("#serialwrap")) && !/^\/\/ 零件檢查/.test(ed) && (await page.$eval(".card.on .cname", (el) => el.textContent)) === cardName,
        "除錯模式開著時點範例「" + cardName + "」：載入那個範例，並離開除錯模式（按鈕的燈熄掉、回到燈板預覽）");
    await page.click("#debug");      // 回到除錯模式（範例沒改過：不問，直接載入零件檢查），後面接著測
    await page.waitForFunction(() => /^\/\/ 零件檢查/.test(document.getElementById("code").value) &&
      /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    // 換成別的程式（不印零件檢查的現況）：馬上離開再進除錯模式，一進來不該還看到上一支程式的清單
    await setCodeAndRun(prog(8, 'void setup() {\n  begin();\n}\n\nvoid loop() {\n  Serial.println("別的程式");\n  show();\n}\n'));
    await page.waitForFunction(() => document.getElementById("serialout").textContent.includes("別的程式"), { timeout: 5000 }).catch(() => {});
    await page.click("#debug");
    cb = await canvasBox();
    say(cb.shown && cb.w === 480 && !(await visible("#serialwrap")), "再按一次除錯模式：回到燈板預覽（恢復原本的大小 " + cb.w + "）");
    dialogs.length = 0; dismissNext = true;      // 再進來：程式跟載入的不一樣，會問要不要蓋掉 → 按「取消」留著這支程式
    await page.click("#debug");
    await page.waitForFunction(() => !document.getElementById("serialwrap").hidden, { timeout: 5000 }).catch(() => {});
    say(await visible("#serialwrap") && (await editor()).includes("別的程式") && !(await panel()).shown, "跑別的程式時進除錯模式：不顯示零件清單（不會留著上一支程式的結果）");
    await page.click("#debug");

    // 10d. 除錯模式接上板子（用假的序列埠）：板子印的文字是一段一段送進來的，一行可能切成好幾段、切在一個中文字的中間。
    //      零件檢查的現況一樣畫成清單、不進文字視窗；清單要標明是板子的還是預覽的（學員不能把預覽的 7/7 當成板子過關）
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    dialogs.length = 0;
    await page.click("#debug");
    await page.waitForFunction(() => /^\/\/ 零件檢查/.test(document.getElementById("code").value) &&
      /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
    await waitPanel(/項過關/);
    p = await panel();
    say(p.shown && /^預覽的零件檢查：0／7/.test(p.title), "還沒接板子：清單標明是預覽的（" + p.title + "）");
    say(!/^[ \t]*#define PORT/m.test(await editor()), "原本的程式沒有寫 PORT（接在 A）：載入的零件檢查也不寫");
    await page.evaluate(() => {
      const enc = new TextEncoder();
      let ctl;                       // 每接一次是一個新的序列埠（上一個的資料流已經關了）
      // close() 要一點時間（真的序列埠也是）：拔線時「板子的清單收起來」不能等它關完才做，不然這段空檔裡預覽印的字會跟板子收到一半的那一行接在一起。
      // 這裡故意拖 0.7 秒（比預覽印現況的間隔 0.5 秒長）：等關完才收的話，空檔裡一定會碰到預覽印的那一行
      // 跟真的序列埠一樣：還沒關好（包括正在關）的埠不能再開，open() 會丟 InvalidStateError；同一塊板子在關好之前拿到的是同一個埠
      const newPort = () => {
        const p = { state: "closed", getInfo: () => ({ usbVendorId: 0x303A }),
          open: async () => { if (p.state !== "closed") throw new DOMException("The port is already open.", "InvalidStateError"); p.state = "opened"; },
          close: () => { p.state = "closing"; return new Promise((r) => setTimeout(() => { p.state = "closed"; r(); }, 700)); },
          readable: new ReadableStream({ start(c) { ctl = c; } }) };
        return p;
      };
      let current = null;
      window.__fakeBoard = {
        send: (s) => ctl.enqueue(enc.encode(s)),
        sendCut: (s, at) => { const b = enc.encode(s); ctl.enqueue(b.slice(0, at)); ctl.enqueue(b.slice(at)); },   // 切在第 at 個位元組
        unplug: () => ctl.close(),
        requests: 0,                 // 跳出「選序列埠」視窗的次數
      };
      const serial = navigator.serial || {};
      if (!navigator.serial) Object.defineProperty(navigator, "serial", { value: serial, configurable: true });
      serial.getPorts = async () => [current && current.state !== "closed" ? current : (current = newPort())];
      serial.requestPort = async () => { window.__fakeBoard.requests++; throw new DOMException("沒有選", "NotFoundError"); };
      // 清單的標題每換一次記一筆：斷線那一刻有沒有閃過不對的內容，事後看得出來
      window.__titles = [];
      new MutationObserver(() => {
        const t = (document.querySelector("#checkpanel .ctitle") || { textContent: "" }).textContent;
        if (t && window.__titles[window.__titles.length - 1] !== t) window.__titles.push(t);
      }).observe(document.getElementById("checkpanel"), { childList: true, subtree: true, characterData: true });
    });
    const board = (fn, ...a) => page.evaluate((f, args) => window.__fakeBoard[f](...args), fn, a);
    const outAfter = async (mark) => ((await text("#serialout")).split(mark)[1] || "");
    await page.click("#serialconn");
    await page.waitForFunction(() => document.getElementById("serialconn").textContent === "中斷", { timeout: 5000 }).catch(() => {});
    await pause(700);                // 預覽還在跑、還在印現況：接上板子之後不能再拿來畫清單
    say((await text("#serialconn")) === "中斷" && (await text("#serialout")).includes("── 接上板子 ──") &&
        !(await panel()).shown, "按「連線板子」接上之後：預覽的清單收起來，等板子自己印（按鈕變成「中斷」）");
    say(!(await visible("#inputs")), "接著板子時，預覽用的旋鈕、按鈕那一排收起來（現在看的是板子，要按板子上的按鈕）");
    say(!(await visible("#m")), "接著板子時，縮小的燈板預覽也收起來（看真的燈板）");
    // 接著板子時預覽（零件檢查）還在背景跑：它的蜂鳴器不能從電腦喇叭響（學員會分不出是板子還是電腦在響）
    const previewBeep = async () => {
      const seen = await page.evaluate(() => new Promise((done) => {
        window.__bpInput.latch[1] = true;                      // 預覽的按鈕 2 按一下：零件檢查會嗶一聲（0.12 秒）
        let n = 0, max = 0;
        const go = () => { max = Math.max(max, window.__bpBuzz.hz); if (++n < 12) requestAnimationFrame(go); else done(max); };
        requestAnimationFrame(go);
      }));
      await frames(12);
      return seen;
    };
    const whileBoard = await previewBeep();
    say(whileBoard === 0, "接著板子時預覽的蜂鳴器不出聲（背景的預覽按了按鈕，喇叭的頻率還是 " + whileBoard + "）");
    await board("send", "零件檢");
    await pause(60);
    say((await outAfter("── 接上板子 ──")).trim() === "", "現況那一行才收到開頭：先不顯示（等它收完）");
    await board("sendCut", "查 3/8｜按鈕 1 ✓ 2 ✓ 3 … 4 …｜旋鈕 ✗ 0.97（原始 3980，跳動 4012，腳位浮接）｜麥克風 … 音量 0.02｜傾斜 ✓ x+0.10 y", 20);   // 第 20 個位元組在「✓」的中間
    await pause(60);
    await board("send", "+0.98｜蜂鳴器 ✗\r\n✗ 沒偵測到蜂鳴器：檢查蜂鳴器的焊點\r\n");
    await waitPanel(/3／8/, 5000);
    p = await panel();
    say(p.shown && /^板子的零件檢查：3／8/.test(p.title) && p.chips.join() === "✓按鈕 1,✓按鈕 2,…按鈕 3,…按鈕 4,✗旋鈕,…麥克風,✓傾斜,✗蜂鳴器",
        "板子印的現況（切成三段、其中一刀切在中文字中間）畫成清單（" + p.title + "）：" + p.chips.join("　"));
    const chipOf = (name) => page.evaluate((n) => { const c = [...document.querySelectorAll("#checkpanel .chip")].find((c) => c.dataset.name === n);
      return c ? { text: c.textContent, tip: c.title } : { text: "", tip: "" }; }, name);
    const kc = await chipOf("旋鈕"), mc = await chipOf("麥克風"), tc = await chipOf("傾斜");
    say(kc.text === "✗ 旋鈕 0.97" && /腳位浮接/.test(kc.tip) && mc.text === "… 麥克風 音量 0.02" && tc.text === "✓ 傾斜 x+0.10 y+0.98",
        "格子上有現在的讀值（" + [kc.text, mc.text, tc.text].join("、") + "），括號裡的細節放在滑鼠提示（" + kc.tip + "）");
    // 括號裡的細節（旋鈕的原始讀值、跳動、腳位）另外放一行小字：老師查「旋鈕讀值亂跳」時要一直看著它，滑鼠提示不會跟著更新
    const detail = () => page.evaluate(() => (document.querySelector("#checkpanel .cdetail") || { textContent: "" }).textContent);
    say((await detail()) === "旋鈕：原始 3980，跳動 4012，腳位浮接", "清單下面一行小字是括號裡的細節（" + (await detail()) + "）");
    // 現況那一行的格式跟平常不一樣也不能畫錯：沒偵測到的零件後面接著說明、零件的名字裡有空白、總數是 0
    await board("send", "零件檢查 0/8｜按鈕 1 … 2 … 3 … 4 …｜旋鈕 … 0.50（原始 2047，跳動 3，腳位接好）｜麥克風 ✗ 沒有在收音｜傾斜 ✗ 沒偵測到｜蜂鳴器 ✗ 沒偵測到\n");
    await waitPanel(/^板子的零件檢查：0／8/, 3000);
    p = await panel();
    const mc2 = await chipOf("麥克風"), tc2 = await chipOf("傾斜"), bc2 = await chipOf("蜂鳴器");
    say(p.chips.slice(5).join() === "✗麥克風,✗傾斜,✗蜂鳴器" && mc2.text === "✗ 麥克風 沒有在收音" && tc2.text === "✗ 傾斜 沒偵測到" && bc2.text === "✗ 蜂鳴器 沒偵測到",
        "沒偵測到的零件：紅格，後面寫原因（" + [mc2.text, tc2.text, bc2.text].join("、") + "）");
    await board("send", "零件檢查 1/2｜LED C ✗ 沒接｜蜂鳴器 ✓\n");
    await waitPanel(/^板子的零件檢查：1／2/, 3000);
    p = await panel();
    say(p.chips.join() === "✗LED C,✓蜂鳴器" && (await detail()) === "", "零件的名字裡有空白（LED C ✗ 沒接）：照樣是紅格（" + p.chips.join("、") + "）；沒有括號的細節就不顯示那一行小字");
    await board("send", "零件檢查 0/0｜蜂鳴器 …\n");
    await waitPanel(/^板子的零件檢查：0／0/, 3000);
    say(!/全部過關/.test((await panel()).title), "總數是 0 的現況不會顯示成「全部過關」（" + (await panel()).title + "）");
    let bo = await outAfter("── 接上板子 ──");
    say(bo.includes("✗ 沒偵測到蜂鳴器：檢查蜂鳴器的焊點") && !bo.includes("零件檢") && !bo.includes("3/8"),
        "文字視窗只多了「沒偵測到蜂鳴器」那一行，現況那一行（和它被切開的碎片）不在裡面");
    // 學員自己的程式可能用 Serial.print 不換行：半行也要馬上看得到；看起來像現況那一行開頭的先留著，收完發現不是就照樣顯示
    await board("send", "進度");
    await page.waitForFunction(() => document.getElementById("serialout").textContent.endsWith("進度"), { timeout: 3000 }).catch(() => {});
    say((await text("#serialout")).endsWith("進度"), "還沒換行的半行馬上看得到（Serial.print 不換行）");
    await board("send", "：50%\n零件");
    await pause(150);
    say((await text("#serialout")).endsWith("進度：50%\n"), "同一行後面的字接上去；下一行開頭是「零件」（可能是現況那一行）先不顯示");
    await board("send", "盒子有 3 個\n零件檢查 今天做完了\n");
    await page.waitForFunction(() => document.getElementById("serialout").textContent.includes("今天做完了"), { timeout: 3000 }).catch(() => {});
    say((await text("#serialout")).endsWith("進度：50%\n零件盒子有 3 個\n零件檢查 今天做完了\n"),
        "收完發現不是現況那一行（「零件盒子…」「零件檢查 今天做完了」）：照樣顯示，一個字都沒少");
    await pause(3300);               // 板子超過 3 秒沒印現況（換了別的程式）：清單收起來，不留著舊的結果
    say(!(await panel()).shown, "板子 3 秒沒有再印現況：清單收起來");
    await board("send", "零件檢查 8/8｜按鈕 1 ✓ 2 ✓ 3 ✓ 4 ✓｜旋鈕 ✓ 0.50（原始 2047，跳動 3，腳位接好）｜麥克風 ✓ 音量 0.10｜傾斜 ✓ x+0.00 y+1.00｜蜂鳴器 ✓\n");
    await waitPanel(/8／8/, 3000);
    p = await panel();
    say(p.shown && /^板子的零件檢查：8／8 項過關.*全部過關/.test(p.title) && p.chips.every((c) => c.startsWith("✓")), "又印了：清單回來；八項都過標出全部過關（" + p.title + "）");
    await board("send", "讀值 ");
    await pause(60);
    await board("send", "零件檢查 1/8｜蜂鳴器 ✗\n");
    await page.waitForFunction(() => document.getElementById("serialout").textContent.includes("1/8"), { timeout: 3000 }).catch(() => {});
    say((await text("#serialout")).endsWith("讀值 零件檢查 1/8｜蜂鳴器 ✗\n") && /8／8/.test((await panel()).title),
        "一行的中間出現「零件檢查 …」不是現況那一行：照樣顯示在文字視窗，清單不變");
    // 按「中斷」、板子被拔掉：板子的清單馬上收起來、換回預覽的；板子那邊收到一半的現況要丟掉，不能跟預覽印的接在一起
    const titlesFrom = (n) => page.evaluate((k) => window.__titles.slice(k), n);
    const waitPreviewList = async (mark) => {
      await page.waitForFunction((m) => document.getElementById("serialout").textContent.includes(m), { timeout: 5000 }, mark).catch(() => {});
      await waitPanel(/^預覽的/, 5000);
    };
    await board("send", "零件檢查 9/9｜按鈕 1 ✓");
    await pause(60);
    let seen = (await titlesFrom(0)).length;
    await page.click("#serialconn");
    await pause(150);                // 序列埠還在關（0.7 秒）：按鈕、旋鈕那一排、縮小的燈板預覽不用等它關完就該換回來
    say((await text("#serialconn")) === "連線板子" && await visible("#inputs") && (await canvasBox()).shown,
        "按「中斷」的當下（序列埠還沒關完）：按鈕變回「連線板子」，預覽的旋鈕按鈕和燈板馬上回來");
    await waitPreviewList("── 中斷 ──");
    await pause(700);
    let after = await titlesFrom(seen);
    say((await text("#serialconn")) === "連線板子" && after.length > 0 && after.every((t) => /^預覽的零件檢查：\d／7 項過關$/.test(t)) && !(await outAfter("── 中斷 ──")).includes("9/9"),
        "按「中斷」：清單換回預覽的（" + after.join("、") + "），板子收到一半的那一行丟掉");
    say(await visible("#inputs") && (await canvasBox()).shown && (await canvasBox()).w <= 240, "中斷之後看的是預覽：旋鈕、按鈕那一排和縮小的燈板預覽都回來");
    const afterBoard = await previewBeep();
    say(afterBoard >= 2000, "……預覽的蜂鳴器也恢復出聲（按了按鈕：" + afterBoard + " Hz）");
    // 連點兩下「中斷」（或點了覺得沒反應又點一次）：序列埠還在關，第二下不能變成「連線板子」——
    // 那時去開同一個埠會失敗，接著就跳出選序列埠的視窗
    await page.click("#serialconn");
    await page.waitForFunction(() => document.getElementById("serialconn").textContent === "中斷", { timeout: 5000 }).catch(() => {});
    const connBtn = () => page.evaluate(() => { const b = document.getElementById("serialconn");
      return { text: b.textContent, disabled: b.disabled, port: !!window.__bpDbg.port, requests: window.__fakeBoard.requests, stat: document.getElementById("serialstat").textContent }; });
    await page.click("#serialconn");
    await pause(100);
    const mid = await connBtn();
    await page.click("#serialconn");   // 第二下：序列埠還在關
    await pause(1000);
    const end = await connBtn();
    say(mid.text === "連線板子" && mid.disabled && end.requests === 0 && !end.port && !/連線失敗/.test(end.stat),
        `連點兩下「中斷」：序列埠關好之前按鈕先不能按（${mid.disabled ? "停用" : "可以按"}），第二下不會跳出選序列埠的視窗（跳了 ${end.requests} 次）`);
    say(end.text === "連線板子" && !end.disabled, "序列埠關好之後按鈕恢復，可以再連");
    await page.click("#serialconn");
    await page.waitForFunction(() => document.getElementById("serialconn").textContent === "中斷", { timeout: 5000 }).catch(() => {});
    await board("send", "零件檢查 4/8｜按鈕 1 ✓ 2 ✓ 3 ✓ 4 ✓｜旋鈕 … 0.50（原始 2047，跳動 3，腳位接好）｜麥克風 … 音量 0.10｜傾斜 … x+0.00 y+1.00｜蜂鳴器 …\n零件檢查 9/9｜按鈕 1 ✓");
    await waitPanel(/^板子的零件檢查：4／8/, 3000);
    p = await panel();
    say(p.shown && /^板子的零件檢查：4／8/.test(p.title), "再按「連線板子」：又是板子的清單（" + p.title + "）");
    seen = (await titlesFrom(0)).length;
    await board("unplug");
    await waitPreviewList("── 板子斷線了 ──");
    await pause(700);
    after = await titlesFrom(seen);
    say((await text("#serialout")).includes("── 板子斷線了 ──") && (await text("#serialconn")) === "連線板子" &&
        after.length > 0 && after.every((t) => /^預覽的零件檢查：\d／7 項過關$/.test(t)) && !(await outAfter("── 板子斷線了 ──")).includes("9/9"),
        "板子拔掉：文字視窗說斷線了，清單換回預覽的（" + after.join("、") + "），沒有留著板子的結果");
    // 接著板子的時候直接離開除錯模式：序列埠放開、預覽的旋鈕和按鈕回來
    await pause(300);                // 拔掉的那個埠關好了才接下一個
    await page.click("#serialconn");
    await page.waitForFunction(() => document.getElementById("serialconn").textContent === "中斷", { timeout: 5000 }).catch(() => {});
    const hiddenWhileBoard = !(await visible("#inputs"));
    await page.click("#debug");
    await page.waitForFunction(() => document.getElementById("serialwrap").hidden, { timeout: 5000 }).catch(() => {});
    cb = await canvasBox();
    say(hiddenWhileBoard && cb.shown && cb.w === 480 && !(await visible("#serialwrap")) && await visible("#inputs") && !(await page.evaluate(() => !!window.__bpDbg.port)),
        "接著板子時離開除錯模式：回到燈板預覽（原本的大小），序列埠放開，旋鈕、按鈕那一排回來");
    await page.evaluate(() => { delete navigator.serial.getPorts; delete navigator.serial.requestPort; delete window.__fakeBoard; });

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
    for (const t of ["彩虹流動", "FFT頻譜", "英文跑馬燈"])
      await page.evaluate((n) => [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cname").textContent === n).click(), t);
    const settled = await page.waitForFunction(() => window.__bp && window.__bp.code === document.getElementById("code").value &&
      /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 }).then(() => true, () => false);
    say(settled && (await editor()).includes("英文跑馬燈"), "連點三個範例：預覽跑的是最後一個（編輯區那段）");
    // 工具頁替自己的範例算縮圖時也會送預覽編譯（標 thumb=1，照順序編、不帶 bg）：那些不算在「按執行送的」裡面
    const runReqs = prevReqs.filter((u) => !u.endsWith("?thumb=1"));
    const allBgPreview = runReqs.every((u) => u.endsWith("?bg=1"));
    say(runReqs.length > 0 && allBgPreview, `按執行送的預覽都帶 bg=1（${runReqs.length} 次）` + (allBgPreview ? "" : "：" + runReqs.find((u) => !u.endsWith("?bg=1")).replace(STATION, "")));

    // 12c. 連點範例時，前面點的範例比較晚才拿到（網路慢、電腦忙）：還是最後點的那個贏，不會被晚到的蓋掉。
    //      把「FFT頻譜」的請求攔住晚 800 毫秒放行，依序點 彩虹流動 → FFT頻譜 → 英文跑馬燈
    const slowFft = (r) => {
      if (r.url().includes("/example?id=") && decodeURIComponent(r.url()).includes("FFT")) setTimeout(() => r.continue().catch(() => {}), 800);
      else r.continue().catch(() => {});
    };
    await page.setRequestInterception(true);
    page.on("request", slowFft);
    for (const t of ["彩虹流動", "FFT頻譜", "英文跑馬燈"])
      await page.evaluate((n) => [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cname").textContent === n).click(), t);
    await new Promise((r) => setTimeout(r, 1500));          // 這時候 FFT 的程式已經回來了
    await page.waitForFunction(() => window.__bp && window.__bp.code === document.getElementById("code").value &&
      /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 }).catch(() => {});
    page.off("request", slowFft);
    await page.setRequestInterception(false);
    const litNow = await page.$$eval(".card.on .cname", (els) => els.map((e) => e.textContent).join("、"));
    say((await editor()).includes("英文跑馬燈") && litNow === "英文跑馬燈" && (await page.evaluate(() => window.__bp.code.includes("英文跑馬燈"))),
        "前面點的範例比較晚才拿到：編輯區、亮著的卡片、預覽都還是最後點的那個（亮著：" + litNow + "）");

    // 13. 燒完先送重開訊號、再關序列埠：Mac 關閉序列埠不會讓板子重開，燒完會停在燒錄模式（2026-10-31 課堂）。
    //     另開一頁，把 esptool-js 換成只記錄訊號的假的（不需要板子）；第二次模擬板子一重開 USB 就斷線
    {
      const FAKE = `const t0 = performance.now(), log = (s) => window.__sig.push([s, performance.now() - t0]);
export class Transport {
  constructor() { window.__sig = []; }
  async setDTR(v) { log("DTR=" + (v ? 1 : 0)); }
  async setRTS(v) { log("RTS=" + (v ? 1 : 0)); if (!v && window.__dropOnReset) throw new Error("The device has been lost."); }
  async disconnect() { log("close"); }
}
export class ESPLoader {
  constructor() {}
  async main() { log("main"); }
  async writeFlash(o) { o.reportProgress(0, 1, 1); log("write"); }
}`;
      const fp = await ctx.newPage();
      fp.on("dialog", (d) => d.accept());
      const fpErrors = [];
      fp.on("pageerror", (e) => fpErrors.push(e.message));
      await fp.setRequestInterception(true);
      fp.on("request", (r) => r.url().endsWith("/vendor/esptool-bundle.js")
        ? r.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body: FAKE }) : r.continue());
      await fp.goto(STATION, { waitUntil: "load" });
      await fp.waitForFunction(() => window.__bp && window.__bp.mod && /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
      await fp.evaluate(() => {
        const pick = () => Promise.resolve({});    // 選到的序列埠：Transport 是假的，用不到
        if (navigator.serial) navigator.serial.requestPort = pick;
        else Object.defineProperty(navigator, "serial", { value: { requestPort: pick } });
      });
      const flashOnce = async () => {
        await fp.$eval("#fwstat", (el) => { el.textContent = ""; });
        await fp.click("#flash");
        await fp.waitForFunction(() => /燒錄完成|燒錄失敗/.test(document.getElementById("fwstat").textContent) &&
          !document.getElementById("flash").disabled, { timeout: 240000 });
        return fp.evaluate(() => ({ sig: window.__sig || [], stat: document.getElementById("fwstat").textContent }));
      };
      const seq = (r) => r.sig.map(([s]) => s).join(" → ");
      const at = (r, s) => (r.sig.find(([x]) => x === s) || [s, NaN])[1];
      const WANT = "main → write → DTR=0 → RTS=1 → RTS=0 → close";
      let r = await flashOnce();
      say(seq(r) === WANT && /燒錄完成/.test(r.stat), "燒完先送重開訊號（DTR=0、RTS 拉起再放開）再關序列埠：" + seq(r));
      const pulse = at(r, "RTS=0") - at(r, "RTS=1");
      say(pulse >= 90, `重開訊號的 RTS 拉起約 100 毫秒（${Math.round(pulse)} 毫秒）`);
      await fp.evaluate(() => { window.__dropOnReset = true; });
      r = await flashOnce();
      say(/燒錄完成/.test(r.stat) && seq(r) === WANT, "板子一重開 USB 就斷線（放開 RTS 時出錯）：照樣顯示燒錄完成、關序列埠：" + seq(r));
      say(!fpErrors.length, "燒錄那一頁沒有 JavaScript 錯誤" + (fpErrors.length ? "：" + fpErrors.join("；") : ""));
      await fp.close();
    }

    // 14. 匯出 Arduino 資料夾、匯入 zip（另開一頁，不影響前面的狀態）
    {
      const os = require("os");
      const { zipRead, zipWrite } = require("./zip.js");
      const MY16 = path.join(__dirname, "..", "examples", "16x16", "我的範例");
      const MY8 = path.join(__dirname, "..", "examples", "8x8", "我的範例");
      const IMP = "匯入測試_ui";
      const impFiles = [IMP, IMP + " 2", IMP + " 3"].map((n) => path.join(MY16, n + ".ino"));
      // 這一段匯入的作品名稱都用 IMP 開頭：測試前後把這個開頭的檔案清掉（上次中途被砍留下來的也一起清）
      const cleanImported = () => {
        for (const dir of [MY16, MY8]) {
          let list = [];
          try { list = fs.readdirSync(dir); } catch (_) {}
          for (const f of list) if (f.startsWith(IMP)) fs.rmSync(path.join(dir, f), { force: true });
        }
      };
      cleanImported();
      const TMPD = fs.mkdtempSync(path.join(os.tmpdir(), "babit_uizip_"));
      const ep = await ctx.newPage();
      ep.on("dialog", (d) => d.accept());
      const epErrors = [];
      ep.on("pageerror", (e) => epErrors.push(e.message));
      try {
        await ep.evaluateOnNewDocument(() => { try { localStorage.removeItem("babit.exportSeq"); localStorage.setItem("babit.size", "8"); } catch (_) {} });
        await ep.goto(STATION, { waitUntil: "load" });
        await ep.waitForFunction(() => /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
        // 攔下瀏覽器的下載：頁面用 <a download> 觸發，這裡只記下檔名，不真的存檔
        await ep.evaluate(() => {
          window.__dl = [];
          const orig = HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push(this.download); window.__dlHref = this.href; } else orig.call(this); };
        });
        const epStatus = () => ep.$eval("#status", (el) => el.textContent);
        const epWait = (re, timeout = 30000) =>
          ep.waitForFunction((s) => new RegExp(s).test(document.getElementById("status").textContent), { timeout }, re.source);
        // 匯出的名稱（babit_月日_序號）從送出去的網址讀：日期是頁面自己算的，測試不另外算（跨午夜跑才不會對不上）
        const nameOf = (url) => new URL(url).searchParams.get("name") || "";
        const seqOf = (url) => (nameOf(url).match(/^babit_(\d{4})_(\d{2,})$/) || []).slice(1);     // [月日, 序號]
        const exportOnce = async () => {
          await ep.$eval("#status", (el) => { el.textContent = ""; });
          const [resp] = await Promise.all([ep.waitForResponse((r) => r.url().includes("/export/arduino"), { timeout: 15000 }), ep.click("#exexport")]);
          await epWait(/已匯出|匯出失敗/, 10000);
          // 下載的內容從頁面裡那個 blob 網址讀（puppeteer 讀不到「下載型」回應的內容）
          const buf = resp.ok() ? Buffer.from(await ep.evaluate(async () => {
            const b = new Uint8Array(await (await fetch(window.__dlHref)).arrayBuffer());
            let t = "";
            for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]);
            return btoa(t);
          }), "base64") : null;
          return { url: resp.url(), status: resp.status(), buf };
        };

        say(await ep.$eval("#exexport", (el) => !el.hidden && el.offsetParent !== null) && await ep.$eval("#eximport", (el) => !el.hidden && el.offsetParent !== null),
            "範例區有「匯出 Arduino 資料夾」和「匯入 zip」兩顆按鈕");
        let e1 = await exportOnce();
        const n1 = nameOf(e1.url);
        const [DAY, seq1] = seqOf(e1.url);
        let zf = [];
        try { zf = zipRead(e1.buf); } catch (_) {}
        const names = zf.map((x) => x.name);
        const inoEntry = zf.find((x) => x.name === `${n1}/${n1}.ino`);
        say(e1.status === 200 && seq1 === "01" && names.includes(`${n1}/BatoPixel.h`) && !!inoEntry &&
            inoEntry.read().toString("utf8").trim() === (await ep.$eval("#code", (el) => el.value)).trim(),
            `按匯出：送出編輯區的程式，自動編號 ${n1}，zip 裡是同名資料夾（${names.length} 個檔）`);
        say(JSON.stringify(await ep.evaluate(() => window.__dl)) === JSON.stringify([n1 + ".zip"]) && (await epStatus()).includes(n1 + ".zip"),
            "瀏覽器下載 " + n1 + ".zip，狀態列說明下一步：" + (await epStatus()));
        // 作品名稱：匯出時帶著目前那張範例卡片的名稱，寫進 README.txt（匯入時讀回來）
        const cardNow = await ep.$eval(".card.on .cname", (el) => el.textContent).catch(() => "");
        const readme1 = (() => { try { return zf.find((x) => x.name === `${n1}/README.txt`).read().toString("utf8"); } catch (_) { return ""; } })();
        say(!!cardNow && new URL(e1.url).searchParams.get("title") === cardNow && readme1.includes("作品名稱：" + cardNow + "\r\n"),
            "匯出時帶著目前範例的名稱「" + cardNow + "」，README.txt 寫著「作品名稱：" + cardNow + "」");
        e1 = await exportOnce();
        // 兩次匯出之間剛好跨午夜的話序號會從 01 重來：那種情況不判失敗（名稱格式不對照樣算失敗）
        const seqIs = (u, want) => { const s = seqOf(u); return s.length === 2 && (s[0] !== DAY || s[1] === want); };
        say(seqIs(e1.url, "02"), "再匯出一次：序號加一（" + nameOf(e1.url) + "）");
        // 程式格式不對：不下載、說明原因、序號不跳號
        const goodCode = await ep.$eval("#code", (el) => el.value);
        await ep.$eval("#code", (el) => { el.value = el.value.replace(/#define PANEL \d+/, ""); });
        e1 = await exportOnce();
        say(e1.status === 400 && (await epStatus()).includes("匯出失敗") && (await epStatus()).includes("PANEL") && (await ep.evaluate(() => window.__dl.length)) === 2,
            "程式少了 #define PANEL：不匯出，狀態列說明原因：" + (await epStatus()));
        await ep.$eval("#code", (el, v) => { el.value = v; }, goodCode);
        e1 = await exportOnce();
        say(seqIs(e1.url, "03"), "失敗的那次不佔序號（下一次成功的是 " + nameOf(e1.url) + "）");
        // 在官方範例上改過（或整段貼上別的程式）再匯出：那已經不是那個範例，不帶作品名稱
        const readmeIn = (buf) => { try { return zipRead(buf).find((x) => /\/README\.txt$/.test(x.name)).read().toString("utf8"); } catch (_) { return "讀不到"; } };
        await ep.$eval("#code", (el) => { el.value += "\n// 改過了\n"; el.dispatchEvent(new Event("input")); });
        e1 = await exportOnce();
        say(e1.status === 200 && !new URL(e1.url).searchParams.has("title") && readmeIn(e1.buf).includes(nameOf(e1.url) + ".ino") && !readmeIn(e1.buf).includes("作品名稱"),
            "官方範例改過之後匯出：不帶作品名稱（README.txt 沒有「作品名稱」那一行）");
        await ep.$eval("#code", (el, v) => { el.value = v; el.dispatchEvent(new Event("input")); }, goodCode);

        // 匯入：16×16 的作品 zip（頁面目前在 8×8、編輯區沒改過）→ 存成「我的範例」、切到 16×16、載入並執行
        const impCode = prog(16, OKBODY).replace("// 測試", "// " + IMP);
        const zipFile = path.join(TMPD, "babit_0101_01.zip");
        fs.writeFileSync(zipFile, zipWrite([{ name: "babit_0101_01/babit_0101_01.ino", data: impCode }, { name: "babit_0101_01/BatoPixel.h", data: "x" }]));
        const importOnce = async (file, re) => {
          await ep.$eval("#status", (el) => { el.textContent = ""; });
          await (await ep.$("#eximportfile")).uploadFile(file);
          await epWait(re, 30000);
        };
        await importOnce(zipFile, /已匯入|匯入失敗/);
        const st1 = await epStatus();
        const cardOn = await ep.$eval(".card.on .cname", (el) => el.textContent).catch(() => "");
        say(st1.includes("已匯入") && fs.existsSync(impFiles[0]) && fs.readFileSync(impFiles[0], "utf8") === impCode,
            "匯入 zip：存成 examples/16x16/我的範例/" + IMP + ".ino（" + st1 + "）");
        say(await ep.$eval("#sz16", (el) => el.classList.contains("on")) && cardOn === IMP && (await ep.$eval("#code", (el) => el.value)) === impCode,
            "作品是 16×16 的：頁面切到 16×16，載入並執行，卡片「" + cardOn + "」亮著");
        await ep.waitForFunction(() => window.__bp && window.__bp.n === 16, { timeout: 15000 }).catch(() => {});
        say(await ep.evaluate(() => window.__bp && window.__bp.n) === 16, "預覽跑的是匯入的 16×16 程式");
        // 再匯入同一個 zip：不覆蓋，名稱加編號
        await importOnce(zipFile, /已匯入|匯入失敗/);
        say(fs.existsSync(impFiles[1]) && (await epStatus()).includes(IMP + " 2"), "同名的已經有了：另存成「" + IMP + " 2」，不覆蓋");
        // 編輯區有還沒存的修改：匯入只放進範例庫，編輯區不動
        await ep.$eval("#code", (el) => { el.value += "\n// 我改過了\n"; el.dispatchEvent(new Event("input")); });
        const dirty = await ep.$eval("#code", (el) => el.value);
        await importOnce(zipFile, /已匯入|匯入失敗/);
        say(fs.existsSync(impFiles[2]) && (await ep.$eval("#code", (el) => el.value)) === dirty && (await epStatus()).includes("編輯區") &&
            (await epStatus()).includes("點那張卡片"),
            "編輯區改過還沒存：匯入只放進範例庫，編輯區的程式不動（" + (await epStatus()) + "）");
        // 自己的範例改到一半匯出：還是那個作品，照樣帶作品名稱
        e1 = await exportOnce();
        say(e1.status === 200 && new URL(e1.url).searchParams.get("title") === IMP + " 2" && readmeIn(e1.buf).includes("作品名稱：" + IMP + " 2\r\n"),
            "自己的範例改到一半匯出：照樣帶作品名稱「" + new URL(e1.url).searchParams.get("title") + "」");
        // 編輯區改過、匯入的又是另一種尺寸（8×8）：那張卡片不在目前的範例庫，提示要說「切換到 8×8」才看得到
        const imp8 = IMP + "8";
        const zip8 = path.join(TMPD, "babit_0101_08.zip");
        fs.writeFileSync(zip8, zipWrite([{ name: "babit_0101_08/babit_0101_08.ino", data: prog(8, OKBODY).replace("// 測試", "// " + imp8) }]));
        await importOnce(zip8, /已匯入|匯入失敗/);
        const st8 = await epStatus();
        say(fs.existsSync(path.join(MY8, imp8 + ".ino")) && (await ep.$eval("#code", (el) => el.value)) === dirty &&
            await ep.$eval("#sz16", (el) => el.classList.contains("on")) && st8.includes("切換到 8×8") && !st8.includes("點那張卡片"),
            "編輯區改過、匯入的是另一種尺寸：不切換、不動編輯區，提示切換到 8×8 才看得到（" + st8 + "）");
        // 作品名稱剛好 40 個字（範例名稱的上限）：同名的已經有了，加編號前先截短，不會因為超過 40 個字而失敗
        await ep.$eval("#code", (el, v) => { el.value = v; el.dispatchEvent(new Event("input")); }, impCode);     // 編輯區恢復成沒改過
        const long40 = IMP + "長".repeat(40 - IMP.length);
        const zipLong = path.join(TMPD, "babit_0101_40.zip");
        fs.writeFileSync(zipLong, zipWrite([{ name: "babit_0101_40/babit_0101_40.ino", data: prog(16, OKBODY).replace("// 測試", "// " + long40) }]));
        await importOnce(zipLong, /已匯入|匯入失敗/);
        const stL1 = await epStatus();
        await importOnce(zipLong, /已匯入|匯入失敗/);
        const long2 = long40.slice(0, 38) + " 2";
        say(stL1.includes("已匯入") && fs.existsSync(path.join(MY16, long40 + ".ino")) && fs.existsSync(path.join(MY16, long2 + ".ino")) && (await epStatus()).includes("已匯入"),
            "作品名稱剛好 40 個字、同名的已經有了：截短再加編號（存成 " + long2.length + " 個字的名稱），不會匯入失敗：" + (await epStatus()).slice(0, 60));
        // 截短的地方剛好在表情符號中間：整個表情符號拿掉，不留半個（留半個的話存出來的檔名會對不上，卡片不會亮）
        const emoji40 = IMP + "😀".repeat(16) + "b";               // 7 + 32 + 1 = 40 個單位，第 38 個單位落在表情符號中間
        const zipEmoji = path.join(TMPD, "babit_0101_41.zip");
        fs.writeFileSync(zipEmoji, zipWrite([{ name: "babit_0101_41/babit_0101_41.ino", data: prog(16, OKBODY).replace("// 測試", "// " + emoji40) }]));
        await importOnce(zipEmoji, /已匯入|匯入失敗/);
        await importOnce(zipEmoji, /已匯入|匯入失敗/);
        const emoji2 = IMP + "😀".repeat(15) + " 2";
        const cardEmoji = await ep.$eval(".card.on .cname", (el) => el.textContent).catch(() => "");
        say((await epStatus()).includes("已匯入") && fs.existsSync(path.join(MY16, emoji2 + ".ino")) && cardEmoji === emoji2,
            "截短的地方在表情符號中間：整個表情符號拿掉再加編號，卡片照樣亮著（" + (await epStatus()).slice(0, 50) + "）");
        // 選到很大的檔案（不是作品 zip）：不用送到編譯站，直接說明
        const hugeZip = path.join(TMPD, "huge.zip");
        fs.writeFileSync(hugeZip, Buffer.alloc(9 * 1024 * 1024, 65));
        let importReqs = 0;
        const countReq = (rq) => { if (rq.url().includes("/import/arduino")) importReqs++; };
        ep.on("request", countReq);
        await importOnce(hugeZip, /已匯入|匯入失敗/);
        ep.off("request", countReq);
        say((await epStatus()).includes("匯入失敗") && (await epStatus()).includes("太大") && importReqs === 0,
            "選到 9 MB 的檔案：直接說明檔案太大，不送到編譯站（" + (await epStatus()) + "）");
        // 不是作品 zip：說明原因
        const badZip = path.join(TMPD, "bad.zip");
        fs.writeFileSync(badZip, zipWrite([{ name: "a/readme.txt", data: "x" }]));
        await importOnce(badZip, /已匯入|匯入失敗/);
        say((await epStatus()).includes("匯入失敗") && (await epStatus()).includes(".ino"), "zip 裡沒有程式：" + (await epStatus()));
        say(!epErrors.length, "匯出匯入那一頁沒有 JavaScript 錯誤" + (epErrors.length ? "：" + epErrors.join("；") : ""));
      } finally {
        cleanImported();
        fs.rmSync(TMPD, { recursive: true, force: true });
        await ep.close();
      }
    }

    // 15. 自己的範例的縮圖：工具頁在沙箱裡算好、上傳給編譯站（編譯站不執行學員的程式，見 test_security.js）
    {
      const MY8 = path.join(__dirname, "..", "examples", "8x8", "我的範例");
      const TH = "縮圖測試_ui";
      const cleanThumbTest = () => {
        let list = [];
        try { list = fs.readdirSync(MY8); } catch (_) {}
        for (const f of list) if (f.startsWith(TH)) fs.rmSync(path.join(MY8, f), { force: true });
      };
      cleanThumbTest();
      fs.mkdirSync(MY8, { recursive: true });
      const uniq = "// " + Date.now() + "\n";                 // 內容每次都不一樣：縮圖照程式內容認，才不會拿到以前存的
      const put = (name, code) => fs.writeFileSync(path.join(MY8, TH + name + ".ino"), code + uniq);
      put("_正常", prog(8, OKBODY));
      put("_卡住", prog(8, "void setup() {\n  begin();\n}\n\nvoid loop() {\n  volatile int spin = 1;\n  while (spin) { }\n  show();\n}\n"));
      // 夾帶 JavaScript 的程式：算縮圖時它會在沙箱裡執行，試著叫編譯站存一個範例——不該成功。
      // 用「同步」的請求（XMLHttpRequest 第三個參數 false）：請求一定在沙箱被停掉之前送到編譯站，
      // 沒有多出檔案才代表是編譯站擋下的（用非同步的 fetch 有時候還沒送出沙箱就結束了，測不到東西）。
      // 存範例只看名稱與 #define PANEL，所以同一個請求如果是工具頁自己送的就會成功。
      const planted = path.join(MY8, TH + "_被寫入.ino");
      const sneak = "EM_ASM({ try { var x = new XMLHttpRequest(); x.open('POST', '" + STATION + "/examples', false); " +
                    "x.send(JSON.stringify({ size: 8, name: '" + TH + "_被寫入', code: '#define PANEL 8' })); } catch (e) {} });";
      put("_夾帶", prog(8, OKBODY).replace("begin();", "begin();\n  " + sneak));
      // 官方的彩虹流動抄一份當自己的範例（有 @loop 3.6）：拿工具頁算的縮圖跟 station/thumb.js 算的逐格比對
      const rainbow = fs.readFileSync(path.join(__dirname, "..", "examples", "8x8", "1_基本", "01_彩虹流動.ino"), "utf8").replace(/\r\n/g, "\n") + uniq;
      fs.writeFileSync(path.join(MY8, TH + "_彩虹.ino"), rainbow);
      const tp = await ctx.newPage();
      const tpErrors = [];
      tp.on("pageerror", (e) => tpErrors.push(e.message));
      try {
        await tp.evaluateOnNewDocument(() => { try { localStorage.setItem("babit.size", "8"); } catch (_) {} });
        await tp.goto(STATION, { waitUntil: "load" });
        await tp.waitForFunction(() => /執行中/.test(document.getElementById("status").textContent), { timeout: 30000 });
        const cardThumb = (name) => tp.evaluate((n) => {
          const c = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === n);
          if (!c) return null;
          const th = c.querySelector(".thumb");
          return { bg: th.style.backgroundImage.slice(0, 40), frames: th.style.getPropertyValue("--frames") };
        }, name);
        const title0 = await tp.title();
        await tp.waitForFunction((n) => {
          const c = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === n);
          return c && c.querySelector(".thumb").style.backgroundImage.includes("data:image/png");
        }, { timeout: 30000 }, TH + "_正常").catch(() => {});
        const okCard = await cardThumb(TH + "_正常");
        say(!!okCard && okCard.bg.includes("data:image/png") && okCard.frames === "28",
            "自己的範例沒有現成的縮圖：工具頁自己算出來顯示（28 格）" + (okCard ? "" : "：找不到卡片"));
        // 上傳給編譯站：之後直接拿得到（尺寸 224×8）
        let up = null;
        for (let i = 0; i < 20 && !(up && up.status === 200); i++) {
          up = await fetch(STATION + "/thumb?id=" + encodeURIComponent("8x8/我的範例/" + TH + "_正常"));
          if (up.status !== 200) await new Promise((ok) => setTimeout(ok, 250));
        }
        const upBuf = up && up.status === 200 ? Buffer.from(await up.arrayBuffer()) : Buffer.alloc(0);
        say(upBuf.length > 24 && upBuf.readUInt32BE(16) === 224 && upBuf.readUInt32BE(20) === 8, "算好的縮圖上傳給編譯站存著（" + (up ? up.status : "?") + "、" + upBuf.length + " bytes）");
        // 卡住的程式：時間到就放棄，頁面照常動；夾帶的程式：在沙箱裡什麼都碰不到
        await new Promise((ok) => setTimeout(ok, 9000));
        const t0 = Date.now();
        const stuckCard = await cardThumb(TH + "_卡住"), sneakCard = await cardThumb(TH + "_夾帶");
        say(!!stuckCard && stuckCard.bg === "" && Date.now() - t0 < 2000, "卡住的程式算不出縮圖：卡片留黑底，頁面沒有被卡住（" + (Date.now() - t0) + " 毫秒就回應）");
        // 它的縮圖有算出來＝那段程式（連同夾帶的 JavaScript）確實在沙箱裡跑過，「沒有多出範例檔」才算數
        say(!!sneakCard && sneakCard.bg.includes("data:image/png") && !fs.existsSync(planted) && (await tp.title()) === title0,
            "夾帶 JavaScript 的程式在沙箱裡算縮圖（有算出來）：它送給編譯站的存檔請求被擋下，沒有多出範例檔");
        // 跟 station/thumb.js 的算法一致：同一份程式，工具頁算的縮圖每一個像素都跟 node 算的一樣
        const { loadModule } = require("./load_module.js");
        const { renderThumb } = require("./thumb.js");
        const { decodePng } = require("../examples/png.js");
        const rid = "8x8/我的範例/" + TH + "_彩虹";
        let rUp = null;
        for (let i = 0; i < 40 && !(rUp && rUp.status === 200); i++) {
          rUp = await fetch(STATION + "/thumb?id=" + encodeURIComponent(rid));
          if (rUp.status !== 200) await new Promise((ok) => setTimeout(ok, 250));
        }
        const pagePx = rUp.status !== 200 ? null : await tp.evaluate(async (url) => {
          const im = new Image();
          im.src = url;
          await im.decode();
          const c = document.createElement("canvas");
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          const g = c.getContext("2d");
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data, px = [];
          for (let i = 0; i < d.length; i += 4) px.push(d[i], d[i + 1], d[i + 2]);
          return { w: c.width, h: c.height, px };
        }, "/thumb?id=" + encodeURIComponent(rid) + "&t=" + Date.now());
        const cr = await (await fetch(STATION + "/compile/preview", { method: "POST", body: rainbow })).json();
        const wantPng = path.join(require("os").tmpdir(), "babit_ui_thumb_" + process.pid + ".png");
        let same = false, dims = "";
        try {
          fs.writeFileSync(wantPng, renderThumb(await loadModule(cr.js), rainbow).png);
          const want = decodePng(wantPng);
          dims = pagePx ? `${pagePx.w}×${pagePx.h}` : "沒有上傳";
          same = !!pagePx && pagePx.w === want.w && pagePx.h === want.h && Buffer.from(pagePx.px).equals(want.px);
        } finally { fs.rmSync(wantPng, { force: true }); }
        say(same, "工具頁算的縮圖跟 station/thumb.js 算的每個像素都一樣（彩虹流動，一輪 3.6 秒，" + dims + "）");
        // 重新整理：算好的直接跟編譯站拿；算不出來的（卡住的那份）已經記住，不再自動重跑
        const thumbCompiles = [];
        const countThumb = (rq) => { if (rq.url().includes("/compile/preview?thumb=1")) thumbCompiles.push(rq.url()); };
        tp.on("request", countThumb);
        await tp.reload({ waitUntil: "load" });
        await tp.waitForFunction((n) => {
          const c = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".cname").textContent === n);
          return c && c.querySelector(".thumb").style.backgroundImage !== "";
        }, { timeout: 15000 }, TH + "_正常").catch(() => {});
        const again = await cardThumb(TH + "_正常");
        say(!!again && again.bg.includes("/thumb?id=") && again.frames === "28", "重新整理之後直接用編譯站存的那一張（" + (again ? again.bg : "找不到卡片") + "）");
        await new Promise((ok) => setTimeout(ok, 2500));
        tp.off("request", countThumb);
        say(thumbCompiles.length === 0, "算不出縮圖的那一份已經記住：重新整理不會又自動編譯、重跑它（多送了 " + thumbCompiles.length + " 次）");
        say(!tpErrors.length, "縮圖那一頁沒有 JavaScript 錯誤" + (tpErrors.length ? "：" + tpErrors.join("；") : ""));
      } finally {
        // 測試上傳的縮圖也刪掉（照清單給的鑰匙找檔案），不然每跑一次就在 station/cache/thumbs 多留幾張
        try {
          const list = await (await fetch(STATION + "/examples?size=8")).json();
          for (const e of list) if (e.title.startsWith(TH) && e.thumbKey) fs.rmSync(path.join(__dirname, "cache", "thumbs", e.thumbKey + ".png"), { force: true });
        } catch (_) {}
        cleanThumbTest();
        await tp.close();
      }
    }

    // ── 第二部分（Task 8）插在這一行上面 ──

    say(!errors.length, "頁面沒有 JavaScript 錯誤" + (errors.length ? "：" + errors.join("；") : ""));
  } finally {
    await browser.close();
  }
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;   // 跟其他測試一致：不用 process.exit() 硬結束
})();
