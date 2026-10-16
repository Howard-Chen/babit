// 產生官方範例的卡片縮圖：node examples/build_thumbs.js（需先啟動編譯站）
// examples/8x8、examples/16x16 底下每個官方範例（「我的範例」不算），在 .ino 旁邊存一張同名 .png：
// 28 格 sprite，真的程式實跑出來的畫面（做法見 station/thumb.js）。
// 新增或修改官方範例後跑一次；examples/test_examples.js 會檢查縮圖是不是最新的。
const fs = require("fs");
const { listExamples } = require("../station/catalog.js");
const { loadModule } = require("../station/load_module.js");
const { renderThumb } = require("../station/thumb.js");

const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";
const HERE = __dirname;
const firstError = (log) => ((log || "").split(/\r?\n/).find((l) => /error/.test(l)) || "").slice(0, 100);

(async () => {
  let bad = 0, made = 0;
  for (const size of [8, 16]) {
    for (const ex of listExamples(HERE, size, { official: true })) {
      const code = fs.readFileSync(ex.file, "utf8");
      let j;
      try {
        const r = await fetch(STATION + "/compile/preview",
          { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code });
        j = await r.json();
      } catch (e) {
        console.log("  連不上編譯站 " + STATION + "：" + e.message + "\n  請先啟動 station\\run_station.ps1（或跑 BatoPixel.bat）");
        process.exit(1);
      }
      if (!j.ok) { bad++; console.log("  FAIL " + ex.id + " 編譯失敗：" + firstError(j.log)); continue; }
      const m = await loadModule(j.js);
      if (m._bp_width() !== size) { bad++; console.log("  FAIL " + ex.id + " 程式的 PANEL 是 " + m._bp_width() + "，跟資料夾不符"); continue; }
      const t = renderThumb(m, code);
      if (!t.litMax) { bad++; console.log("  FAIL " + ex.id + " 每一格都是全黑"); continue; }
      fs.writeFileSync(ex.file.replace(/\.ino$/i, ".png"), t.png);
      made++;
      console.log("  ok   " + ex.id + "（" + t.png.length + " bytes，循環 " + t.loop + " 秒，最多亮 " + t.litMax + " 顆，首尾差 " + t.seam + "）" +
                  (t.seam > 40 ? "\n       ⚠️ 首尾差很大：縮圖循環會跳一下，檢查 @loop 是否等於程式的循環長度" : ""));
    }
  }
  console.log(bad ? "\n" + bad + " 張縮圖有問題" : "\n" + made + " 張縮圖完成");
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）
})();
