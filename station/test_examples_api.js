// 範例庫 API 的驗收：node station/test_examples_api.js（需先啟動編譯站）
const fs = require("fs"), path = require("path");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";
const EX = path.join(__dirname, "..", "examples");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const get = (p) => fetch(STATION + p);
const pngSize = (buf) => (buf.length > 24 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : [0, 0]);   // IHDR 的寬、高

(async () => {
  try { await get("/"); } catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message + "\n請先啟動 station\\run_station.ps1");
    process.exit(1);
  }

  console.log("── 範例清單");
  const list8 = await (await get("/examples?size=8")).json();
  const official8 = list8.filter((e) => e.category !== "我的範例");
  say(JSON.stringify(official8.map((e) => [e.category, e.title])) ===
      JSON.stringify([["基本", "彩虹流動"], ["基本", "小綠人"], ["基本", "英文跑馬燈"], ["感測器", "沙漏番茄鐘"], ["感測器", "FFT頻譜"]]),
      "8×8：" + official8.map((e) => e.category + "／" + e.title).join("、"));
  say(official8.every((e) => e.id.startsWith("8x8/") && e.desc && e.thumb === "/thumb?id=" + encodeURIComponent(e.id)),
      "每個範例都有 id、說明、縮圖網址");
  const list16 = await (await get("/examples?size=16")).json();
  say(JSON.stringify(list16.filter((e) => e.category !== "我的範例").map((e) => e.title)) === JSON.stringify(["彩虹流動", "小綠人", "中文跑馬燈", "沙漏番茄鐘", "FFT頻譜"]),
      "16×16：" + list16.map((e) => e.title).join("、"));
  say((await get("/examples?size=12")).status === 400, "size 不是 8／16：400");

  console.log("── 範例原始碼與縮圖");
  const first = official8[0];
  const src = await get("/example?id=" + encodeURIComponent(first.id));
  say(src.status === 200 && (await src.text()).includes("#define PANEL 8"), "讀得到 " + first.id);
  for (const id of ["../station/server", "8x8/../../station/server", "8x8/沒有這個", ""]) {
    const r = await get("/example?id=" + encodeURIComponent(id));
    say(r.status === 404, `「${id}」→ 404`);
  }
  for (const [ex, n] of [[first, 8], [list16[0], 16]]) {
    const r = await get(ex.thumb);
    const [w, h] = pngSize(Buffer.from(await r.arrayBuffer()));
    say(r.status === 200 && r.headers.get("content-type") === "image/png" && w === n * 28 && h === n,
        `${ex.id} 的縮圖 ${w}×${h}（期望 ${n * 28}×${n}）`);
  }

  console.log("── 新增範例（存到 我的範例）");
  const MY = path.join(EX, "8x8", "我的範例");
  const made = [];                                   // 測試建立的檔案，最後刪掉
  const save = async (body) => {
    const r = await fetch(STATION + "/examples",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json() };
  };
  const GOOD = '// 測試\n#define PANEL 8\n#include "BatoPixel.h"\n\nvoid setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(seconds() * 4, 0, RED);\n  show();\n}\n';
  const idOf = (file) => "8x8/我的範例/" + path.basename(file, ".ino");
  try {
    const name = "測試_api_" + process.pid;
    const file = path.join(MY, name + ".ino");
    made.push(file);
    let r = await save({ size: 8, name, code: GOOD });
    say(r.status === 200 && r.j.ok && r.j.id === "8x8/我的範例/" + name && fs.existsSync(file), "存檔：200、id、檔案在 examples/8x8/我的範例");
    const list = await (await get("/examples?size=8")).json();
    say(list.some((e) => e.category === "我的範例" && e.title === name) && list[list.length - 1].category === "我的範例",
        "清單裡出現，「我的範例」排在最後");
    r = await save({ size: 8, name, code: GOOD });
    say(r.status === 409 && !!r.j.error, "同名不覆蓋：409「" + r.j.error + "」");
    r = await save({ size: 8, name, code: GOOD.replace("RED", "BLUE"), overwrite: true });
    say(r.status === 200 && fs.readFileSync(file, "utf8").includes("BLUE"), "overwrite: true 才覆蓋");
    for (const [badName, why] of [["", "空白"], ["a/b", "斜線"], ["..", "點"], ["CON", "Windows 保留名稱"], ["x:y", "冒號"], ["好".repeat(41), "超過 40 字"]]) {
      r = await save({ size: 8, name: badName, code: GOOD });
      say(r.status === 400 && !!r.j.error, "名稱不合法（" + why + "）：400「" + r.j.error + "」");
    }
    r = await save({ size: 16, name: name + "_16", code: GOOD });
    say(r.status === 400 && /8×8/.test(r.j.error), "PANEL 跟尺寸不符：400「" + r.j.error + "」");
    r = await save({ size: 8, name: name + "_np", code: GOOD.replace("#define PANEL 8\n", "") });
    say(r.status === 400 && /PANEL/.test(r.j.error), "沒寫 PANEL：400「" + r.j.error + "」");
    r = await save({ size: 8, name: name + "_empty", code: "  \n" });
    say(r.status === 400, "空程式：400");
    say(!fs.existsSync(path.join(MY, "a")), "名稱有斜線時沒有建出子資料夾");

    console.log("── 學員範例的縮圖（編譯站產生、快取）");
    let t0 = Date.now();
    let png = await get("/thumb?id=" + encodeURIComponent(idOf(file)));
    let [w, h] = pngSize(Buffer.from(await png.arrayBuffer()));
    say(png.status === 200 && w === 224 && h === 8, `我的範例的縮圖自動產生 ${w}×${h}（${Date.now() - t0} ms）`);
    t0 = Date.now();
    png = await get("/thumb?id=" + encodeURIComponent(idOf(file)));
    say(png.status === 200 && Date.now() - t0 < 500, `第二次直接用快取（${Date.now() - t0} ms）`);

    const direct = path.join(MY, "測試_直接寫入_" + process.pid + ".ino");   // AI 直接寫進資料夾、沒經過「新增範例」
    made.push(direct);
    fs.writeFileSync(direct, GOOD.replace("RED", "GREEN"));
    png = await get("/thumb?id=" + encodeURIComponent(idOf(direct)));
    say(png.status === 200, "直接寫進資料夾的範例也有縮圖");

    console.log("── 改自己的範例：存回（PUT）、刪除（DELETE），只能動「我的範例」");
    const put = async (id, code) => {
      const res = await fetch(STATION + "/example?id=" + encodeURIComponent(id),
        { method: "PUT", headers: { "content-type": "text/plain; charset=utf-8" }, body: code });
      return { status: res.status, j: await res.json().catch(() => ({})) };
    };
    const del = async (id) => {
      const res = await fetch(STATION + "/example?id=" + encodeURIComponent(id), { method: "DELETE" });
      return { status: res.status, j: await res.json().catch(() => ({})) };
    };
    const OFFICIAL_ID = "8x8/1_基本/01_彩虹流動";
    const official = path.join(EX, "8x8", "1_基本", "01_彩虹流動.ino");
    const officialBefore = fs.readFileSync(official, "utf8");
    const listed = await (await get("/examples?size=8")).json();
    say(listed.find((e) => e.id === idOf(file))?.mine === true && listed.find((e) => e.id === OFFICIAL_ID)?.mine === false,
        "清單標出哪些是自己的範例（mine）");
    r = await put(idOf(file), GOOD.replace("RED", "YELLOW"));
    say(r.status === 200 && r.j.ok && fs.readFileSync(file, "utf8").includes("YELLOW"), "存回自己的範例：200、檔案換成新程式");
    r = await put(OFFICIAL_ID, GOOD);
    say(r.status === 403 && fs.readFileSync(official, "utf8") === officialBefore, "官方範例不能存回：403「" + r.j.error + "」，檔案沒變");
    r = await put("8x8/我的範例/../1_基本/01_彩虹流動", GOOD);
    say(r.status === 403 && fs.readFileSync(official, "utf8") === officialBefore, "用 ../ 繞到官方範例也擋下（" + r.status + "）");
    r = await put(idOf(file), GOOD.replace("#define PANEL 8", "#define PANEL 16"));
    say(r.status === 400 && /16×16/.test(r.j.error || "") && fs.readFileSync(file, "utf8").includes("YELLOW"),
        "PANEL 換成別的尺寸不能存回：400「" + r.j.error + "」，檔案沒變");
    r = await put(idOf(file), "  \n");
    say(r.status === 400 && fs.readFileSync(file, "utf8").includes("YELLOW"), "空程式不能存回：400");
    r = await put("8x8/我的範例/不存在_" + process.pid, GOOD);
    say(r.status === 404, "存回不存在的範例：404");
    r = await del(OFFICIAL_ID);
    say(r.status === 403 && fs.existsSync(official), "官方範例不能刪：403「" + r.j.error + "」");
    r = await del("8x8/我的範例/../1_基本/01_彩虹流動");
    say(r.status === 403 && fs.existsSync(official), "用 ../ 繞到官方範例也不能刪（" + r.status + "）");
    r = await del(idOf(file));
    say(r.status === 200 && r.j.ok && !fs.existsSync(file), "刪除自己的範例：200、檔案不見了");
    say(!(await (await get("/examples?size=8")).json()).some((e) => e.id === idOf(file)), "清單裡也不見了");
    r = await del(idOf(file));
    say(r.status === 404, "再刪一次：404");

    const hang = path.join(MY, "測試_卡住_" + process.pid + ".ino");          // 純無窮迴圈：只有執行緒逾時救得了
    made.push(hang);
    fs.writeFileSync(hang, GOOD.replace("dot(seconds() * 4, 0, RED);", "volatile int spin = 0;\n  for (;;) { spin++; }"));
    t0 = Date.now();
    const pending = get("/thumb?id=" + encodeURIComponent(idOf(hang)));
    await new Promise((ok) => setTimeout(ok, 1000));
    const ta = Date.now();
    const alive = (await get("/examples?size=8")).ok, aliveMs = Date.now() - ta;
    const hr = await pending;
    say(hr.status === 404 && alive && aliveMs < 2000,
        `卡住的程式：縮圖 ${hr.status}（${Date.now() - t0} ms），等的時候編譯站照常回應（${aliveMs} ms）`);
  } finally {
    for (const f of made) fs.rmSync(f, { force: true });
  }

  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）
})();
