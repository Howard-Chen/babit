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
  for (const must of ["#define PANEL", '#include "BatoPixel.h"', "seconds()", "show()", "delay()", "我的範例", "@desc", "#define PORT",
                      "button3", "button4", "buzzer.beep(", "buzzer.tone(", "buzzer.off()", "buzzer.playing()", "buzzer.ready()", "NOTE_C7",
                      // 只看說明書寫程式的 AI 實際卡住、猜錯的地方（2026-11-23 找 3 個代理人試寫的結果）
                      "1 在左、2 在右", "不是毫秒", "`tone()`", "pitches.h", "音量不能調", "同一格裡問幾次答案都一樣", "randomSeed()", "學員沒要求時不要做暫停"])
    say(text.includes(must), "說明書有寫到「" + must + "」");
  // 燈條（2026-11-24，聖誕花圈課）：另一個接口接一條燈條，寫法與「學員沒提到就不要加」都要講到
  for (const must of ["#define STRIP", "strip.dot(", "strip.fill(", "strip.clear()", "strip.fade(", "strip.brightness(", "燈條預覽", "學員說有接燈條時才用", "不要自己開 `Adafruit_NeoPixel`"])
    say(text.includes(must), "說明書有寫到「" + must + "」");
  // 新版的板子（2026-11）沒有 C 接口：那支腳是按鈕 4，說明書不能再教 AI 寫 PORT C
  say(!/PORT C\b|（或 `C`）|A／B／C/.test(text), "說明書沒有再提 C 接口");

  const blocks = [...text.matchAll(/```cpp\n([\s\S]*?)```/g)].map((m) => m[1]);
  say(blocks.length >= 5, "完整程式範例 " + blocks.length + " 段");
  say(blocks.some((b) => b.includes("buzzer.beep(") && b.includes("buzzer.playing()")), "有一段示範蜂鳴器：嗶一聲，以及一個音接一個音的旋律（用 playing() 判斷，不用迴圈等）");
  say(blocks.some((b) => /#define STRIP \d+/.test(b) && b.includes("strip.dot(") && b.includes("strip.fade(") && !/Adafruit_NeoPixel/.test(b)),
      "有一段示範燈條：#define STRIP、strip.dot()、strip.fade()，沒有自己開 Adafruit_NeoPixel");
  // 蜂鳴器的範例是 AI 最會照著延伸的地方：旋律要有連續兩個一樣的音（沒有休息會黏成一個長音）、音的數目跟著陣列算、
  // 音在這顆蜂鳴器最大聲的第 7 個八度，「按著才響」只在放開的那一格 off()
  const song = blocks.find((b) => b.includes("SONG[]")) || "";
  say(/NOTE_(\w+), NOTE_\1\b/.test(song) && /sizeof\(SONG\)/.test(song) && !/NOTE_\w+[1-5]\b/.test(song) && !/else\s+buzzer\.off\(\)/.test(song),
      "蜂鳴器的範例：旋律裡有連續兩個一樣的音、音的數目用 sizeof 算、沒有用到第 5 個八度以下的音、沒有「沒按就每一格 off()」的寫法");
  if (song) {
    const pv = await post("preview", song);
    if (!pv.ok) say(false, "蜂鳴器的範例預覽編譯失敗 " + firstError(pv.log));
    else {
      const m = await loadModule(pv.js);
      const segs = [];                                      // 蜂鳴器響的每一段：[頻率, 幾格]
      let f = 0;
      const run = (frames, b1, b2, b3) => {
        m._bp_input_set(0.5, b1, b2, b3, 0);
        for (let i = 0; i < frames; i++) {
          m._bp_tick(++f / 60);
          const hz = Math.round(m._bp_buzzer_hz()), last = segs[segs.length - 1];
          if (last && last[0] === hz) last[1]++; else segs.push([hz, 1]);
        }
      };
      run(10, 0, 0, 0); run(1, 0, 1, 0); run(200, 0, 0, 0);     // 按一下按鈕 2：播旋律
      const notes = segs.filter((s) => s[0] > 0);
      say(notes.length === 7 && notes[0][0] === notes[1][0] && notes.slice(0, 6).every((s) => s[1] >= 10 && s[1] <= 16) && notes[6][1] > notes[5][1] * 1.7,
          "範例的旋律實際播出來：7 個音各自分開（連續兩個一樣的音中間有斷開），最後一個音是兩拍（" + notes.map((s) => s[0] + "Hz×" + s[1]).join("、") + "）");
      const before = segs.length;
      run(1, 0, 0, 1); run(40, 0, 0, 1);                        // 按住按鈕 3：一直響
      const held = segs[segs.length - 1];
      run(10, 0, 0, 0);                                         // 放開：停
      say(held[0] > 0 && held[1] >= 40 && segs[segs.length - 1][0] === 0 && segs.length === before + 2,
          "範例的「按著才響」：按住的 40 格都在響（" + held[0] + " Hz），放開就停");
      run(1, 1, 0, 0); run(3, 0, 0, 0);
      say(segs[segs.length - 1][0] > 0, "放開之後按鈕 1 的嗶聲照樣響（沒有被每一格的 off() 砍掉）");
    }
  }
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
