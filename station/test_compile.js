// 學員程式格式與錯誤訊息的驗收：node station/test_compile.js（需先啟動編譯站）
//
// 零基礎學員把 AI 寫的程式貼進來，最常撞到的是這幾種：
//   格式錯（沒寫 PANEL、#define 寫在 #include 後面、舊版 draw(t)）→ 編譯前就回中文說明
//   用了 delay()、PANEL／PORT 寫錯 → 函式庫在編譯時擋下，訊息是中文、行號對得上
//   loop() 裡用迴圈等時間、把 show() 寫在迴圈裡 → 預覽中止這一格（不能把頁面卡死）
//   少了 begin()／show()、一次 loop() 呼叫多次 show() → 預覽照跑，但記下來給網頁提醒
// 也確認：函式寫在 loop() 後面兩端都編得過、PORT 對到正確的腳位、錯誤訊息裡沒有暫存路徑與色碼。
const fs = require("fs"), path = require("path");
const { loadModule } = require("./load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

const post = async (kind, code) => {
  const r = await fetch(STATION + "/compile/" + kind,
    { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code });
  return r.json();
};
const firstError = (log) => (log || "").split(/\r?\n/).find((l) => /error/.test(l)) || (log || "").slice(0, 120);
const prog = (body, head = "#define PANEL 8\n") => "// 測試\n" + head + '#include "BatoPixel.h"\n\n' + body;
const OKBODY = "void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(0, 0, RED);\n  show();\n}\n";
const clean = (log) => !/station[\\/]tmp/.test(log) && !/\x1b\[/.test(log) && !/Command failed/.test(log);

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };

(async () => {
  try { await fetch(STATION + "/"); } catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message + "\n請先啟動 station\\run_station.ps1");
    process.exit(1);
  }

  console.log("── 編譯前檢查（中文說明，兩個端點都擋，不必真的編譯）");
  const PRE = [
    ["沒寫 #define PANEL", '#include "BatoPixel.h"\n\n' + OKBODY, "#define PANEL 8"],
    ["#define PANEL 寫在 #include 後面", '#include "BatoPixel.h"\n#define PANEL 8\n\n' + OKBODY, "PANEL 要寫在"],
    ["#define PORT 寫在 #include 後面", prog(OKBODY) + "#define PORT B\n", "PORT 要寫在"],
    ["舊版 draw(t) 寫法", "void draw(float t) {\n  dot(0, 0, RED);\n}\n", "舊版"],
    ["沒有 loop()", prog("void setup() {\n  begin();\n}\n"), "void loop()"],
    ["struct 寫在 setup() 後面又用在參數裡（板子會編不過）",
     prog("void setup() {\n  begin();\n}\n\nstruct Spark { float x; };\nvoid moveSpark(Spark& s) { s.x += 1; }\n\nvoid loop() {\n  show();\n}\n"), "第一個函式"],
    ["vTaskDelay()", prog("void setup() {\n  begin();\n}\n\nvoid loop() {\n  vTaskDelay(10);\n  show();\n}\n"), "vTaskDelay"],
    ["直接改 bp_strip 的亮度", prog("void setup() {\n  begin();\n}\n\nvoid loop() {\n  bp_strip.setBrightness(255);\n  show();\n}\n"), "bp_strip"],
  ];
  for (const [name, code, want] of PRE) for (const kind of ["preview", "firmware"]) {
    const t0 = Date.now(), j = await post(kind, code), ms = Date.now() - t0;
    say(!j.ok && (j.log || "").includes(want) && ms < 3000, `${kind}：${name} →「${want}」（${ms} ms）`);
  }

  console.log("── 函式庫在編譯時擋下（中文訊息、行號、沒有暫存路徑）");
  const DELAY = prog("void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(0, 0, RED);\n  delay(500);\n  show();\n}\n");
  const LIB = [
    ["delay()（第 11 行）", DELAY, ["不能用 delay()", "sketch.ino:11"]],
    ["PANEL 12", prog(OKBODY, "#define PANEL 12\n"), ["PANEL 只能是 8 或 16"]],
    ["PORT D", prog(OKBODY, "#define PANEL 8\n#define PORT D\n"), ["PORT 只能是 A、B 或 C"]],
    ["改電源上限（#define BP_USB_MAX_MA 5000）", prog(OKBODY, "#define PANEL 8\n#define BP_USB_MAX_MA 5000\n"), ["電源上限"]],
    ["delayMicroseconds()（第 11 行）",
     prog("void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(0, 0, RED);\n  delayMicroseconds(500000);\n  show();\n}\n"),
     ["不能用 delayMicroseconds()", "sketch.ino:11"]],
  ];
  for (const [name, code, wants] of LIB) for (const kind of ["preview", "firmware"]) {
    const j = await post(kind, code), log = j.log || "";
    const miss = wants.filter((w) => !log.includes(w));
    say(!j.ok && !miss.length && clean(log),
        `${kind}：${name} → ` + (miss.length ? "缺「" + miss.join("、") + "」：" + firstError(log)
                                             : clean(log) ? "訊息與行號都在" : "訊息裡還有暫存路徑或色碼"));
  }
  const LINE = prog("void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(0, 0, RED);\n  notDefined();\n  show();\n}\n");
  const lj = await post("preview", LINE);
  say(!lj.ok && (lj.log || "").includes("sketch.ino:11:"), "預覽的錯誤行號對到學員看到的第 11 行：" + firstError(lj.log));

  console.log("── 正確的程式兩端都編得過");
  const BIG = prog("void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(twice(2), 0, RED);\n  show();\n}\n\nint twice(int v) { return v * 2; }\n",
                   "#define PANEL 16\n#define PORT b\n");
  const bp = await post("preview", BIG);
  if (bp.ok) {
    const m = await loadModule(bp.js);
    say(m._bp_width() === 16 && m._bp_pin() === 3,
        `預覽：函式寫在 loop() 後面、PANEL 16、PORT b → ${m._bp_width()}×${m._bp_width()}、GPIO${m._bp_pin()}`);
  } else say(false, "預覽：函式寫在 loop() 後面 → 編譯失敗：" + firstError(bp.log));
  // 板子這段用工具頁背景預編的方式送（bg=1），順便確認排隊中的背景預編會被更新的取代、馬上回。
  // 加一行時間註解讓第一個一定要真的編（編譯站有快取），第二個才排得到隊
  const BIGU = BIG + "// " + Date.now() + "\n";
  const t0 = Date.now(), stamp = (p) => p.then((j) => ({ j, ms: Date.now() - t0 }));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const fa = stamp(post("firmware?bg=1", BIGU));                    // 正在編
  await pause(300);
  const fb = stamp(post("firmware?bg=1", BIGU + "// 排隊中\n"));     // 排隊中
  await pause(300);
  const fc = stamp(post("firmware?bg=1", BIGU));                    // 更新的背景預編 → 排隊中的作廢
  const [a, b, c] = await Promise.all([fa, fb, fc]);
  const bf = a.j;
  say(!!bf.ok, "板子：同一段程式" + (bf.ok ? "（" + Math.round(bf.size / 1024) + " KB）" : " → 編譯失敗：" + firstError(bf.log)));
  say(b.j.superseded === true && b.ms < a.ms,
      `背景預編：排隊中的被更新的取代，馬上回（${b.ms} ms；正在編的那個 ${a.ms} ms 才編完）` + (b.j.superseded ? "" : "：得到 " + JSON.stringify(b.j).slice(0, 80)));
  say(!!c.j.ok && c.j.key === bf.key, "最新的背景預編照常完成（跟正在編的同一段程式，直接拿快取）");
  for (const [head, pin] of [["#define PANEL 8\n", 2], ["#define PANEL 8\n#define PORT A\n", 2], ["#define PANEL 8\n#define PORT C\n", 4]]) {
    const j = await post("preview", prog(OKBODY, head));
    const got = j.ok ? (await loadModule(j.js))._bp_pin() : "（編譯失敗）";
    say(got === pin, `${head.trim().replace(/\n/g, "＋")} → GPIO${got}（期望 ${pin}）`);
  }
  const TESTS = path.join(__dirname, "..", "firmware", "panel_tests");
  for (const f of fs.readdirSync(TESTS).filter((f) => f.endsWith(".ino"))) {
    const j = await post("preview", fs.readFileSync(path.join(TESTS, f), "utf8"));
    say(!!j.ok, "燈板接線測試 " + f + (j.ok ? "" : " → " + firstError(j.log)));
  }

  console.log("── 預覽執行時的保護與提醒");
  const RUN = [
    ["正常的程式", OKBODY, 0, null],
    ["setup() 沒有 begin()", "void setup() {\n}\n\nvoid loop() {\n  show();\n}\n", 1, null],
    ["loop() 沒有 show()", "void setup() {\n  begin();\n}\n\nvoid loop() {\n  dot(0, 0, RED);\n}\n", 2, null],
    ["loop() 呼叫兩次 show()", "void setup() {\n  begin();\n}\n\nvoid loop() {\n  show();\n  show();\n}\n", 4, null],
    ["用迴圈等時間", "void setup() {\n  begin();\n}\n\nvoid loop() {\n  unsigned long t0 = millis();\n  while (millis() - t0 < 500) {}\n  show();\n}\n", null, "babit-stuck-1"],
    ["show() 寫在迴圈裡", "void setup() {\n  begin();\n}\n\nvoid loop() {\n  for (int i = 0; ; i++) {\n    dot(i % 8, 0, RED);\n    show();\n  }\n}\n", null, "babit-stuck-2"],
    ["用迴圈等拍手", "void setup() {\n  begin();\n}\n\nvoid loop() {\n  while (!audio.beat()) {\n    fade(0.9f);\n  }\n  show();\n}\n", null, "babit-stuck-3"],
    ["用迴圈等傾斜", "void setup() {\n  begin();\n}\n\nvoid loop() {\n  while (tilt.x() < 5) {}\n  show();\n}\n", null, "babit-stuck-3"],
  ];
  for (const [name, body, warn, stuck] of RUN) {
    const j = await post("preview", prog(body));
    if (!j.ok) { say(false, name + " → 編譯失敗：" + firstError(j.log)); continue; }
    const m = await loadModule(j.js);
    let thrown = null;
    try { for (let f = 0; f < 5; f++) m._bp_tick(f / 60); } catch (e) { thrown = String((e && e.message) || e); }
    if (stuck) say(!!thrown && thrown.includes(stuck), `${name} → 預覽中止這一格（${thrown || "沒有中止"}）`);
    else say(!thrown && m._bp_warn() === warn, `${name} → 提醒代碼 ${m._bp_warn()}（期望 ${warn}）${thrown ? "，卻丟出 " + thrown : ""}`);
  }

  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）
})();
