// 建置雲端版映像時跑一次（cloud/Dockerfile）：開編譯站，把預覽與每一個韌體槽都先編過一次，再關掉。
// ESP32 核心的編譯結果、每個槽自己的建置資料夾（tools/arduino/cache）就留在映像裡，主機開起來後學員第一次燒錄不用多等。
// 編不過就讓映像建置失敗：工具鏈有問題要在建置時發現，不是上課時。
// 槽數：環境變數 BABIT_WARM_SLOTS（預設 6）。上課時設的 BATOPIXEL_FW_SLOTS 不超過這個數，每個槽就都是熱的。
const fs = require("fs"), path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.BATOPIXEL_PORT || "8930";
const STATION = "http://127.0.0.1:" + PORT;
const SLOTS = Math.max(1, Math.min(16, Number(process.env.BABIT_WARM_SLOTS) || 6));
const CODE = "warmup";          // 雲端版一定要課堂代碼：暖機時用一個臨時的，上課用的由 compose 的 .env 設
const code = fs.readFileSync(path.join(ROOT, "firmware", "BatoPixelS0", "BatoPixelS0.ino"), "utf8");
const secs = (t0) => Math.round((Date.now() - t0) / 100) / 10;

async function compile(what, body, client) {
  const r = await fetch(STATION + "/compile/" + what, { method: "POST", headers: { "X-Babit-Code": CODE, "X-Babit-Client": client }, body });
  const j = await r.json();
  if (!j.ok) throw new Error(what + " 編不過：\n" + String(j.log || j.error || JSON.stringify(j)).slice(0, 2000));
  return j;
}

(async () => {
  // 建映像的機器可能很慢（第一次要編 ESP32 核心）：時間上限放寬，上課時用的是編譯站預設的上限
  const station = spawn(process.execPath, [path.join(ROOT, "station", "server.js")], { stdio: "inherit",
    env: Object.assign({}, process.env, { BATOPIXEL_CLASS_CODE: CODE, BATOPIXEL_FW_SLOTS: String(SLOTS), BATOPIXEL_BEAT_MS: "0",
                                          BATOPIXEL_FW_TIMEOUT: "900000", BATOPIXEL_PREVIEW_TIMEOUT: "300000" }) });
  let fail = null;
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try { up = (await fetch(STATION + "/examples?size=8")).ok; } catch (_) {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    if (!up) throw new Error("編譯站沒有啟動");
    const v = await (await fetch(STATION + "/version")).json();
    if (v.target !== "cloud" || !v.source) throw new Error("映像裡的版本檔不對（要用 cloud/build.sh 建）：" + JSON.stringify(v));
    console.log(`暖機：${v.label} · ${v.source}`);
    let t0 = Date.now();
    await compile("preview", code, "warm_preview");
    console.log(`暖機：預覽編譯 ${secs(t0)} 秒`);
    // 先單獨編一份：ESP32 核心這時候才編，編好放進共用的快取；之後每個槽都拿現成的
    t0 = Date.now();
    await compile("firmware", code, "warm_0");
    console.log(`暖機：韌體第一份（含 ESP32 核心）${secs(t0)} 秒`);
    // 再同時送出每個槽一份（內容各不相同才不會拿快取），把每個槽自己的建置資料夾建好
    t0 = Date.now();
    const jobs = await Promise.all(Array.from({ length: SLOTS }, (_, i) => compile("firmware", code + "\n// 暖機 " + i + "\n", "warm_" + i)));
    const used = [...new Set(jobs.map((j) => j.slot))].sort((a, b) => a - b);
    console.log(`暖機：${SLOTS} 個槽同時編 ${secs(t0)} 秒（用到的槽：${used.join("、")}）`);
    if (used.length !== SLOTS) throw new Error(`應該 ${SLOTS} 個槽都編到，實際只有 ${used.length} 個`);
  } catch (e) { fail = e; }
  station.kill("SIGTERM");
  await new Promise((r) => station.once("exit", r));
  if (fail) { console.error("暖機失敗：" + fail.message); process.exit(1); }
  // 編譯站自己的暫存不用留（韌體的建置結果在 arduino-cli 的快取裡）
  fs.rmSync(path.join(ROOT, "station", "tmp"), { recursive: true, force: true });
})();
