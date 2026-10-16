// 除錯模式的內建程式「感應器檢查」：node station/test_debug.js（需先啟動編譯站）
// 工具頁按「🔧 除錯模式」會從 GET /debug-sketch 拿這支程式（第一行的 PANEL 換成目前的燈板尺寸），
// 燒進板子後每 0.2 秒用序列埠印一行旋鈕、按鈕、傾斜、聲音的數值，工具頁的文字視窗顯示出來。
// 這裡驗證：拿得到、兩端都編得過、預覽跑起來真的會印出那幾項（預覽的 Serial 輸出在除錯模式也會顯示）。
const { loadModule } = require("./load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const post = async (kind, code) => (await fetch(STATION + "/compile/" + kind,
  { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code })).json();
const firstError = (log) => (log || "").split(/\r?\n/).find((l) => /error/.test(l)) || "";

(async () => {
  let r;
  try { r = await fetch(STATION + "/debug-sketch"); } catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message);
    process.exitCode = 1;
    return;
  }
  const code = r.status === 200 ? await r.text() : "";
  say(r.status === 200 && /^\/\/ 感應器檢查/.test(code), "GET /debug-sketch 拿到「感應器檢查」程式（HTTP " + r.status + "）");
  say(/^[ \t]*#define[ \t]+PANEL[ \t]+8\b/m.test(code), "程式寫 #define PANEL 8（工具頁載入時換成目前的燈板尺寸）");
  if (!code) { console.log("\n" + bad + " 項不符 → FAIL"); process.exitCode = 1; return; }

  const pv = await post("preview", code);
  say(pv.ok, "預覽編譯" + (pv.ok ? "" : "：" + firstError(pv.log)));
  if (pv.ok) {
    const lines = [];
    const m = await loadModule(pv.js, { print: (s) => lines.push(s) });
    for (let i = 1; i <= 40; i++) m._bp_tick(i / 60);                // 跑 0.67 秒
    const last = lines.filter((l) => l.includes("旋鈕")).pop() || "";
    say(lines.length >= 2, "預覽每 0.2 秒印一行（0.67 秒印了 " + lines.length + " 行）");
    for (const must of ["旋鈕", "原始", "跳動", "按鈕1", "按鈕2", "傾斜", "聲音", "旋鈕腳位"])
      say(last.includes(must), "每一行都有「" + must + "」");
    console.log("       例：" + last);
    say(m._bp_warn() === 0, "沒有提醒（begin()、show() 都有寫）：提醒代碼 " + m._bp_warn());
  }
  const pv16 = await post("preview", code.replace(/^([ \t]*#define[ \t]+PANEL[ \t]+)8\b/m, "$116"));
  say(pv16.ok, "換成 16×16 也編得過" + (pv16.ok ? "" : "：" + firstError(pv16.log)));
  const fw = await post("firmware", code);
  say(fw.ok, "板子端編譯" + (fw.ok ? "" : "：" + firstError(fw.log)));

  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部通過 → PASS"));
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗
})();
