// 給 AI 的說明書（AGENTS.md）驗收：node station/test_ai_guide.js（需先啟動編譯站）
// 說明書裡的每段 ```cpp 程式都是完整的程式：AI 會照著寫，所以每一段都要兩端編得過、
// 預覽跑起來有畫面、沒有「預覽正常、板子會出問題」的提醒。工具頁「複製給 AI 的說明」拿到的要是同一份。
const fs = require("fs"), path = require("path");
const { loadModule } = require("./load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";
const GUIDE = path.join(__dirname, "..", "AGENTS.md");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const post = async (kind, code) => (await fetch(STATION + "/compile/" + kind,
  { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code })).json();
const firstError = (log) => (log || "").split(/\r?\n/).find((l) => /error/.test(l)) || "";

(async () => {
  const text = fs.readFileSync(GUIDE, "utf8").replace(/\r\n/g, "\n");
  let served;
  try { served = await fetch(STATION + "/ai-guide"); } catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message);
    process.exit(1);
  }
  say(served.status === 200 && (await served.text()).replace(/\r\n/g, "\n") === text, "GET /ai-guide 回傳 AGENTS.md 的內容");
  for (const must of ["#define PANEL", '#include "BatoPixel.h"', "seconds()", "show()", "delay()", "我的範例", "@desc", "#define PORT"])
    say(text.includes(must), "說明書有寫到「" + must + "」");

  const blocks = [...text.matchAll(/```cpp\n([\s\S]*?)```/g)].map((m) => m[1]);
  say(blocks.length >= 4, "完整程式範例 " + blocks.length + " 段");
  for (const [i, code] of blocks.entries()) {
    const title = (code.match(/^\/\/\s*(.+)$/m) || [, "第 " + (i + 1) + " 段"])[1];
    const pv = await post("preview", code);
    if (!pv.ok) { say(false, title + "：預覽編譯失敗 " + firstError(pv.log)); continue; }
    const m = await loadModule(pv.js);
    const ptr = m._bp_framebuffer(), n = m._bp_width();
    let litMax = 0, thrown = null;
    try {
      for (let f = 0; f < 180; f++) {
        m._bp_tick(f / 60);
        const fb = m.HEAPU8.subarray(ptr, ptr + n * n * 3);
        let lit = 0;
        for (let k = 0; k < n * n; k++) if (fb[k * 3] | fb[k * 3 + 1] | fb[k * 3 + 2]) lit++;
        litMax = Math.max(litMax, lit);
      }
    } catch (e) { thrown = String(e.message || e); }
    say(!thrown && litMax > 0 && m._bp_warn() === 0,
        `${title}：預覽跑 3 秒，最多亮 ${litMax} 顆、提醒代碼 ${thrown ? "（中止：" + thrown + "）" : m._bp_warn()}`);
    const fw = await post("firmware", code);
    say(!!fw.ok, `${title}：板子端編譯` + (fw.ok ? "" : " → " + firstError(fw.log)));
  }
  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）
})();
