// 除錯模式的內建程式「零件檢查」：node station/test_debug.js（需先啟動編譯站）
// 工具頁按「🔧 除錯模式」會從 GET /debug-sketch 拿這支程式（第一行的 PANEL 換成目前的燈板尺寸）。
// 課堂上每個人把它燒進板子，把板子上的零件都試一次：燈板分成幾塊，一塊檢查一個零件——
//   四個角落＝按鈕 1–4、橫的長條＝旋鈕、中間左＝麥克風、正中間＝蜂鳴器、中間右＝傾斜；
//   還沒試是各自的顏色（暗的），試過沒問題變綠，偵測到沒接好閃紅；全部過關整面放彩虹。
// 這裡用預覽實跑：開機的燈板檢查（紅綠藍白）、每一塊怎麼過關、序列埠印的字、全部過關；板子端要編得過。
const { loadModule } = require("./load_module.js");
const STATION = process.env.BATOPIXEL_STATION || "http://127.0.0.1:8930";

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const post = async (kind, code) => (await fetch(STATION + "/compile/" + kind,
  { method: "POST", headers: { "content-type": "text/plain; charset=utf-8" }, body: code })).json();
const firstError = (log) => (log || "").split(/\r?\n/).find((l) => /error/.test(l)) || "";

// 每一塊在畫面上的位置（跟程式裡的配置表一樣）：[x, y, 寬, 高]
const LAYOUT = {
  8:  { btn: [[0, 0, 3, 2], [5, 0, 3, 2], [0, 6, 3, 2], [5, 6, 3, 2]], knob: [0, 2, 8, 1], mic: [0, 3, 3, 3], buzz: [3, 3, 2, 2], tilt: [5, 3, 3, 3] },
  16: { btn: [[0, 0, 7, 3], [9, 0, 7, 3], [0, 13, 7, 3], [9, 13, 7, 3]], knob: [0, 4, 16, 2], mic: [0, 7, 6, 5], buzz: [7, 7, 2, 5], tilt: [10, 7, 6, 5] },
};
const isGreen = ([r, g, b]) => g >= 60 && r <= g * 0.45 && b <= g * 0.45;
const isRed = ([r, g, b]) => r >= 60 && g <= r * 0.3 && b <= r * 0.3;
const isWhite = ([r, g, b]) => r >= 200 && g >= 200 && b >= 200;
const isDark = ([r, g, b]) => r + g + b === 0;
const isBright = ([r, g, b]) => r + g + b >= 380;

// 板子上才會走到的那幾段（一定要有傾斜感測器、板子用的說明文字）在預覽裡也跑得到：把程式開頭的 ON_BOARD 改成 1。
// 預覽沒有傾斜感測器（測試不指定的話）＝板子上的感測器沒接好；bp_buzzer_present(0)＝沒有蜂鳴器
const asBoard = (code) => {
  const out = code.replace(/^#define ON_BOARD 0\b/m, "#define ON_BOARD 1");
  if (out === code) throw new Error("零件檢查程式裡找不到 #define ON_BOARD 0");
  return out;
};

// 第一、二版的板子（沒有按鈕 3、4 和蜂鳴器）：把程式開頭的 OLD_BOARD 改成 1
const asOld = (code) => {
  const out = code.replace(/^#define OLD_BOARD 0\b/m, "#define OLD_BOARD 1");
  if (out === code) throw new Error("零件檢查程式裡找不到 #define OLD_BOARD 0");
  return out;
};

// 把編好的預覽模組包成好用的樣子：逐格跑、讀某一塊的顏色、收序列埠印的字
async function boot(js) {
  const lines = [];
  let frame = 0;
  const bytes = {};                  // 每一格印了幾個位元組（UTF-8，含換行）
  const m = await loadModule(js, { print: (s) => { lines.push(s); bytes[frame] = (bytes[frame] || 0) + Buffer.byteLength(s) + 1; } });
  const N = m._bp_width(), ptr = m._bp_framebuffer(), L = LAYOUT[N];
  const inp = { knob: 0.5, b: [0, 0, 0, 0] };
  const apply = () => m._bp_input_set(inp.knob, inp.b[0], inp.b[1], inp.b[2], inp.b[3]);
  // 餵一格的聲音：amp＝振幅（0–1），256 筆、16 kHz，跟板子的麥克風一樣
  let phase = 0, bg = null;
  const feed = (amp) => {
    m._bp_audio_set_rate(16000);
    const a = new Float32Array(256);
    for (let i = 0; i < 256; i++) { a[i] = amp * Math.sin(phase); phase += 2 * Math.PI * 2000 / 16000; }
    m.HEAPF32.set(a, m._bp_audio_buffer() >> 2);
    m._bp_audio_commit(256);
  };
  // background(振幅)：之後每一格都有這麼小的聲音進來（板子的麥克風一直在收音）；background(null)＝不再收音
  const background = (amp) => { bg = amp; };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { if (bg !== null) feed(bg); frame++; m._bp_tick(frame / 60); } };
  const px = (x, y) => Array.from(m.HEAPU8.subarray(ptr + (y * N + x) * 3, ptr + (y * N + x) * 3 + 3));
  const cells = ([x, y, w, h]) => { const out = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push(px(x + i, y + j)); return out; };
  // 這一塊是什麼狀態：多數格子是白＝正在動作、綠＝過關、紅＝有問題，其他＝還沒試
  const state = (box) => {
    const c = cells(box), n = c.length;
    if (c.filter(isWhite).length > n / 2) return "白";
    if (c.filter(isGreen).length > n / 2) return "綠";
    if (c.filter(isRed).length > n / 2) return "紅";
    return c.every(isDark) ? "黑" : "待測";
  };
  // 按一下按鈕：回傳按著那一格的樣子與蜂鳴器的頻率，放開後多跑 0.2 秒
  const press = (i) => {
    inp.b[i] = 1; apply(); tick();
    const during = state(L.btn[i]), hz = m._bp_buzzer_hz();
    inp.b[i] = 0; apply(); tick(12);
    return { during, hz };
  };
  const knob = (k) => { inp.knob = k; apply(); tick(3); };
  // 這幾格的聲音是 amp 這麼大（不管背景音量）
  const sound = (amp, frames) => {
    for (let f = 0; f < frames; f++) { feed(amp); frame++; m._bp_tick(frame / 60); }
  };
  const said = (re) => lines.some((l) => re.test(l));
  const lastStatus = () => lines.filter((l) => l.startsWith("零件檢查")).pop() || "";
  const hold = (i, on) => { inp.b[i] = on ? 1 : 0; apply(); };
  // 印最多的那一格印了幾個位元組：板子的 USB 序列埠一格塞太多會丟字（函式庫把暫存區加大了，這裡再守一道）
  const maxFrameBytes = () => Math.max(0, ...Object.values(bytes));
  return { m, N, L, lines, tick, px, cells, state, press, hold, knob, sound, background, said, lastStatus, maxFrameBytes, frameNo: () => frame };
}
const FRAME_BYTES = 250;

(async () => {
  let r;
  try { r = await fetch(STATION + "/debug-sketch"); } catch (e) {
    console.log("連不上編譯站 " + STATION + "：" + e.message);
    process.exitCode = 1;
    return;
  }
  const code = r.status === 200 ? await r.text() : "";
  say(r.status === 200 && /^\/\/ 零件檢查/.test(code), "GET /debug-sketch 拿到「零件檢查」程式（HTTP " + r.status + "）");
  say(/^[ \t]*#define[ \t]+PANEL[ \t]+8\b/m.test(code), "程式寫 #define PANEL 8（工具頁載入時換成目前的燈板尺寸）");
  if (!code) { console.log("\n" + bad + " 項不符 → FAIL"); process.exitCode = 1; return; }

  const pv = await post("preview", code);
  say(pv.ok, "預覽編譯" + (pv.ok ? "" : "：" + firstError(pv.log)));
  if (pv.ok) {
    const s = await boot(pv.js);
    const { m, L } = s;

    console.log("── 開機先檢查燈板：整面依序亮紅、綠、藍、白（壞掉的燈、顏色順序不對一眼看得出來）");
    const wipe = [];
    for (const at of [12, 36, 60, 84]) { while (s.frameNo() < at) s.tick(); wipe.push(s.px(0, 0).join() + "／" + s.px(7, 7).join()); }
    say(wipe.join(" ") === "255,0,0／255,0,0 0,255,0／0,255,0 0,0,255／0,0,255 255,255,255／255,255,255", "0.2、0.6、1.0、1.4 秒：" + wipe.join(" → "));

    console.log("── 之後燈板分成幾塊，一塊一個零件；還沒試的都不是綠色");
    while (s.frameNo() < 150) s.tick();
    const idle = { 按鈕1: s.state(L.btn[0]), 按鈕2: s.state(L.btn[1]), 按鈕3: s.state(L.btn[2]), 按鈕4: s.state(L.btn[3]), 旋鈕: s.state(L.knob), 麥克風: s.state(L.mic), 蜂鳴器: s.state(L.buzz), 傾斜: s.state(L.tilt) };
    say(Object.values(idle).every((v) => v === "待測"), "八塊都亮著、都還沒過關：" + JSON.stringify(idle));
    const pips = L.btn.map((b) => s.cells(b).filter(isBright).length);
    say(pips.join() === "1,2,3,4", "按鈕的四塊用亮點的數目標出是第幾顆（" + pips.join("、") + " 點）");
    say(/^零件檢查 0\/7/.test(s.lastStatus()), "序列埠每半秒印一行現況，開頭是過關幾項（預覽沒有傾斜感測器，算 7 項）：" + s.lastStatus().slice(0, 60) + "…");
    for (const must of ["旋鈕", "原始", "跳動", "按鈕", "麥克風", "傾斜", "蜂鳴器"])
      if (!s.lastStatus().includes(must)) say(false, "現況那一行要有「" + must + "」：" + s.lastStatus());
    say(s.said(/四個角落.*按鈕/) && s.said(/綠色.*過關/) && s.said(/白色＝.*按著/), "也印出每一塊是什麼零件、顏色的意思（含「白色＝正按著」）");
    say(!s.cells(L.tilt).some(isWhite), "預覽沒有傾斜感測器：傾斜那一塊不畫白點（模擬出來的假數值不拿來顯示）");

    console.log("── 按鈕：按下去那一塊變白、嗶一聲（四顆音高不同），放開變綠");
    const hzs = [];
    for (let i = 0; i < 4; i++) {
      const p = s.press(i);
      hzs.push(p.hz);
      say(p.during === "白" && s.state(L.btn[i]) === "綠" && s.said(new RegExp("✓ 按鈕 " + (i + 1) + " 過關")), `按鈕 ${i + 1}：按著是${p.during}、放開後是${s.state(L.btn[i])}，印出「✓ 按鈕 ${i + 1} 過關」`);
    }
    say(new Set(hzs).size === 4 && hzs.every((h) => h >= 2000 && h <= 3200), "四顆按鈕各一個音，都在蜂鳴器最大聲的 2000–3200 Hz（" + hzs.join("、") + "）");
    say(s.state(L.buzz) === "綠" && s.said(/✓ 蜂鳴器過關/), "蜂鳴器：有偵測到、也響過了 → 變綠");

    console.log("── 旋鈕：長條跟著旋鈕變長，轉到過最左和最右才過關");
    const lit = (k) => { s.knob(k); return s.cells(L.knob).filter(isBright).length; };
    const half = lit(0.5), quarter = lit(0.25);
    say(half === 4 && quarter === 2 && s.state(L.knob) === "待測", `轉到一半亮 ${half} 格、四分之一亮 ${quarter} 格；還沒轉到兩端，沒過關`);
    s.knob(0.0);
    say(s.state(L.knob) === "待測", "只轉到最左：還沒過關");
    s.knob(1.0);
    say(s.state(L.knob) !== "待測" && s.said(/✓ 旋鈕過關/), "再轉到最右：過關");

    console.log("── 麥克風：要先安靜、再有大的聲音才過關（一直很吵或一直沒聲音都不算）");
    say(s.state(L.mic) === "待測" && /麥克風 …/.test(s.lastStatus()), "還沒收到聲音：沒過關");
    s.sound(0.0005, 90);
    say(s.state(L.mic) === "待測", "只有很小的聲音：沒過關");
    s.sound(0.5, 30);
    say(s.said(/✓ 麥克風過關/), "出現大的聲音：過關（這是最後一項，畫面馬上換成慶祝的彩虹；變綠在下一段看）");
    s.tick(40);
    say(/^零件檢查 7\/7/.test(s.lastStatus()) && s.said(/全部過關/), "預覽的 7 項都過了：印出全部過關（" + s.lastStatus().slice(0, 12) + "）");
    say(s.said(/全部過關.*要重測：再按一次「▶ 執行」/), "全部過關那一行說明怎麼重測（預覽：再按一次執行）");
    say(s.maxFrameBytes() <= FRAME_BYTES, `整段過程每一格最多印 ${s.maxFrameBytes()} 位元組（上限 ${FRAME_BYTES}）`);
  }

  if (pv.ok) {
    const s = await boot(pv.js);
    s.tick(150);
    s.sound(0.5, 240);
    say(s.state(s.L.mic) === "待測" && !s.said(/✓ 麥克風過關/) && /麥克風 … 音量 1\.00/.test(s.lastStatus()),
        "一開始就一直滿格（沒接好的麥克風會這樣）：4 秒了還是沒過關（" + (s.lastStatus().match(/麥克風[^｜]*/) || [""])[0] + "）");
    s.sound(0.0005, 60);
    say(s.said(/✓ 麥克風過關/), "之後安靜下來：有大有小，才過關");
  }

  console.log("── 全部過關：整面放彩虹慶祝，之後回到全部是綠色的畫面");
  if (pv.ok) {
    const s = await boot(pv.js);
    const { L } = s;
    s.tick(150);
    for (let i = 0; i < 4; i++) s.press(i);
    s.knob(0.0); s.knob(1.0);
    s.sound(0.0005, 90);
    s.sound(0.5, 6);
    const colors = new Set();
    for (let i = 0; i < 30; i++) { s.sound(0.5, 1); colors.add(s.px(3, 3).join()); }
    say(colors.size >= 10, "慶祝的時候畫面在變（中間那一格半秒內有 " + colors.size + " 種顏色）");
    s.tick(300);
    const after = [...L.btn, L.knob, L.mic, L.buzz].map((b) => s.state(b));
    say(after.every((v) => v === "綠"), "慶祝完：按鈕、旋鈕、麥克風、蜂鳴器都是綠的（" + after.join("") + "）");
    say(s.m._bp_warn() === 0, "沒有提醒（begin()、show() 都有寫）：提醒代碼 " + s.m._bp_warn());
  }

  console.log("── 文字視窗不洗版：說明偶爾印一次，「還沒過」的清單有變才印");
  if (pv.ok) {
    const s = await boot(pv.js);
    const count = (re) => s.lines.filter((l) => re.test(l)).length;
    s.tick(480);                                              // 8 秒，什麼都不碰
    say(count(/^燈板上：/) === 1 && count(/^顏色：/) === 1 && count(/^還沒過：/) === 1,
        `前 8 秒「燈板上：…」印 ${count(/^燈板上：/)} 次、「顏色：…」印 ${count(/^顏色：/)} 次、「還沒過：…」印 ${count(/^還沒過：/)} 次（各一次）`);
    s.tick(720);                                              // 到第 20 秒
    // 燒完之後工具頁要過幾秒才接上板子，開機那一次的說明常常沒收到：開頭 20 秒內多印兩次，之後 30 秒一次
    say(count(/^燈板上：/) === 3 && count(/^顏色：/) === 3, `開頭 20 秒內說明共印 3 次（第 1.6、8.6、15.6 秒；實際 ${count(/^燈板上：/)} 次）：晚幾秒才接上的工具頁也看得到`);
    const todo = () => s.lines.filter((l) => /^還沒過：/.test(l)).pop() || "";
    say(/按鈕 1、2、3、4（各按一下）/.test(todo()) && /旋鈕（從最左轉到最右）/.test(todo()) && /麥克風（預覽要先按「🎤 開啟麥克風」）/.test(todo()) && !/傾斜/.test(todo()),
        "清單寫出每一項怎麼試（預覽沒有傾斜感測器，不列）：" + todo());
    const before = count(/^還沒過：/);
    s.press(0);
    say(count(/^還沒過：/) === before + 1 && /按鈕 2、3、4（各按一下）/.test(todo()) && !/蜂鳴器/.test(todo()), "按了按鈕 1：馬上印新的清單，按鈕 1 和蜂鳴器不在裡面了（" + todo().slice(0, 24) + "…）");
    s.tick(660);
    say(count(/^還沒過：/) === before + 2, "之後每 10 秒提醒一次還沒過的（又印了 " + (count(/^還沒過：/) - before - 1) + " 次）");
    s.tick(1800);                                             // 再 30 秒
    say(count(/^燈板上：/) === 4, `20 秒以後說明 30 秒才印一次（到第 61 秒共 ${count(/^燈板上：/)} 次）`);
    say(count(/^零件檢查 /) >= 115, "現況那一行照樣每半秒一行（給工具頁畫成清單；" + count(/^零件檢查 /) + " 行）");
    s.press(1); s.press(2);
    say(/^還沒過：按鈕 4（按一下）/.test(todo()), "只剩一顆按鈕沒過：寫「按鈕 4（按一下）」，不寫「各按一下」（" + todo().slice(0, 16) + "…）");
    say(s.maxFrameBytes() <= FRAME_BYTES, `每一格最多印 ${s.maxFrameBytes()} 位元組（上限 ${FRAME_BYTES}：說明、清單、現況分在不同格印）`);
  }

  console.log("── 好幾段文字剛好落在同一格：分開在不同格印（板子的 USB 序列埠一格塞太多會丟字）");
  if (pv.ok) {
    // 找出「說明」和「現況」各在第幾格印，再重跑一次，剛好在那一格按按鈕（過關的兩行也要印）
    const probe = await boot(pv.js);
    let legendAt = 0, statusAt = 0;
    for (let f = 1; f <= 200; f++) {
      const before = probe.lines.length;
      probe.tick();
      const got = probe.lines.slice(before);
      if (!legendAt && got.some((l) => /^燈板上：/.test(l))) legendAt = f;
      if (legendAt && !statusAt && f > legendAt + 10 && got.some((l) => /^零件檢查 /.test(l))) statusAt = f;
    }
    const s = await boot(pv.js);
    s.tick(legendAt - 1);
    s.hold(0, true); s.tick(); s.hold(0, false);              // 「說明」要印的那一格按下按鈕 1
    s.tick(statusAt - legendAt - 1);
    s.hold(1, true); s.tick(); s.hold(1, false);              // 「現況」要印的那一格按下按鈕 2
    s.tick(20);
    say(legendAt > 0 && statusAt > legendAt && s.said(/✓ 按鈕 1 過關/) && s.said(/✓ 蜂鳴器過關/) && s.said(/✓ 按鈕 2 過關/) && s.said(/^燈板上：/) && s.said(/^顏色：/),
        `第 ${legendAt} 格（說明）、第 ${statusAt} 格（現況）各按一次按鈕：過關的訊息、說明、現況一行都沒少`);
    say(s.maxFrameBytes() <= FRAME_BYTES, `擠在一起的那幾格最多也只印 ${s.maxFrameBytes()} 位元組（上限 ${FRAME_BYTES}：後面的往下一格排）`);
  }

  console.log("── 按鈕一直是按著的（卡住、焊錫連在一起）：那一塊從白色變成閃紅，文字說明");
  if (pv.ok) {
    const s = await boot(pv.js);
    const { L } = s;
    s.tick(150);
    s.hold(1, true); s.tick(60);
    say(s.state(L.btn[1]) === "白" && !s.said(/一直是按著/), "按著 1 秒：白色（正常的按著）");
    const seen = new Set();
    for (let i = 0; i < 180; i++) { s.tick(); seen.add(s.state(L.btn[1])); }
    say(seen.has("紅") && s.said(/✗ 按鈕 2 一直是按著的/) && /按鈕 1 … 2 ✗/.test(s.lastStatus()),
        "按著超過 3 秒：那一塊閃紅（看到：" + [...seen].join("、") + "），印出「✗ 按鈕 2 一直是按著的…」，現況標 ✗");
    s.hold(1, false); s.tick(40);
    say(s.state(L.btn[1]) === "綠" && /按鈕 1 … 2 ✓/.test(s.lastStatus()), "放開：恢復正常（按過了，是綠的）");
  }

  console.log("── 板子上才有的狀況（把程式的 ON_BOARD 改成 1，在預覽裡跑板子那幾段）");
  const pvb = await post("preview", asBoard(code));
  say(pvb.ok, "ON_BOARD＝1 的版本預覽編得過" + (pvb.ok ? "" : "：" + firstError(pvb.log)));
  if (pvb.ok) {
    // 傾斜感測器沒接好（板子上一定要有）＋沒有蜂鳴器：兩塊都閃紅，而且錯開來閃（8×8 這兩塊緊貼著，同時閃會連成一片）
    const s = await boot(pvb.js);
    const { m, L } = s;
    s.background(0.0005);                                     // 板子的麥克風一直在收音（很小的聲音）
    s.tick(2); m._bp_buzzer_present(0); s.tick(150);
    let both = 0, tiltRed = 0, buzzRed = 0, dot = 0;
    for (let i = 0; i < 120; i++) {
      s.tick();
      const a = s.state(L.tilt) === "紅", b = s.state(L.buzz) === "紅";
      if (a) tiltRed++; if (b) buzzRed++; if (a && b) both++;
      if (s.cells(L.tilt).some(isWhite)) dot++;
    }
    say(tiltRed > 20 && buzzRed > 20 && both === 0, `傾斜和蜂鳴器都沒偵測到：兩塊都閃紅，錯開來閃（傾斜亮 ${tiltRed} 格、蜂鳴器亮 ${buzzRed} 格、同時亮 ${both} 格）`);
    say(dot === 0, "沒偵測到傾斜感測器：那一塊不畫白點（不然模擬的假數值會讓白點自己晃，看起來像有在動）");
    say(/^零件檢查 0\/8/.test(s.lastStatus()) && /傾斜 ✗ 沒偵測到/.test(s.lastStatus()) && /蜂鳴器 ✗ 沒偵測到/.test(s.lastStatus()) && !/x[+-]\d/.test(s.lastStatus()),
        "現況：板子算 8 項，傾斜、蜂鳴器標「✗ 沒偵測到」，不印假的 x、y（" + s.lastStatus().replace(/^.*｜麥克風/, "…｜麥克風") + "）");
    say(s.said(/✗ 沒偵測到傾斜感測器/) && s.said(/^✗ 沒偵測到蜂鳴器：檢查蜂鳴器和旁邊電阻的焊點。.*第一、二版.*OLD_BOARD 改成 1/),
        "文字說明：檢查蜂鳴器的焊點；板子下緣沒有按鈕（第一、二版）就把程式的 OLD_BOARD 改成 1 再燒");
    const todo = () => s.lines.filter((l) => /^還沒過：/.test(l)).pop() || "";
    say(/麥克風（先安靜、再拍手）/.test(todo()) && !/蜂鳴器/.test(todo()) && !/傾斜/.test(todo()),
        "沒有蜂鳴器時，麥克風的提示不叫學員「讓蜂鳴器響」；沒偵測到的傾斜、蜂鳴器不列在「還沒過」（另外有 ✗ 的說明）：" + todo());
    say(/按鈕 1、2、3、4（各按一下）/.test(todo()), "沒偵測到蜂鳴器也照樣要按按鈕 3、4（預設當成第三版的板子，不自己猜是舊板子）");
    // 板子的麥克風沒有啟動（I²S 沒起來，跟焊點無關）：標 ✗、請學員重新開機，不叫學員去按預覽的「開啟麥克風」
    s.background(null); s.tick(60);
    say(/麥克風 ✗ 沒有啟動/.test(s.lastStatus()) && s.said(/^✗ 麥克風沒有啟動：.*RESET/) && !s.said(/開啟麥克風/) && !s.said(/麥克風沒有啟動.*焊點/),
        "板子的麥克風沒有啟動：現況標「✗ 沒有啟動」，說明按 RESET 重來（" + (s.lastStatus().match(/麥克風[^｜]*/) || [""])[0] + "）");
    s.background(0.0005); s.tick(10);
    // 按鈕 1、2、旋鈕、麥克風、傾斜都過了，蜂鳴器沒偵測到、按鈕 3、4 沒按：不能自己當成舊板子說過關（蜂鳴器沒焊好的第三版也是這樣）
    s.press(0); s.press(1); s.knob(0.0); s.knob(1.0);
    s.sound(0.0005, 90); s.sound(0.5, 30);
    for (const [x, y] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) { m._bp_tilt_set(x, y); s.tick(5); }
    s.tick(30);
    say(/^零件檢查 5\/8/.test(s.lastStatus()) && /蜂鳴器 ✗ 沒偵測到/.test(s.lastStatus()) && !s.said(/過關了|全部過關/),
        "其他五項都過了、蜂鳴器沒偵測到：停在 5/8，不說過關（" + s.lastStatus().slice(0, 12) + "）");
    say(s.maxFrameBytes() <= FRAME_BYTES, `每一格最多印 ${s.maxFrameBytes()} 位元組（上限 ${FRAME_BYTES}）`);
  }

  console.log("── 第一、二版的板子（程式的 OLD_BOARD 改成 1）：沒有按鈕 3、4 和蜂鳴器，只算有的那幾項");
  const pvo = await post("preview", asOld(asBoard(code)));
  say(pvo.ok, "OLD_BOARD＝1 的版本預覽編得過" + (pvo.ok ? "" : "：" + firstError(pvo.log)));
  if (pvo.ok) {
    const s = await boot(pvo.js);
    const { m, L } = s;
    s.background(0.0005);
    s.tick(2); m._bp_buzzer_present(0); m._bp_tilt_set(0, 0); s.tick(150);
    const seen = new Set();
    for (let i = 0; i < 60; i++) { s.tick(); for (const b of [L.btn[2], L.btn[3], L.buzz]) seen.add(s.state(b)); }
    say([...seen].join() === "黑", "按鈕 3、4 和蜂鳴器那三塊不亮（看到：" + [...seen].join("、") + "）");
    say(/^零件檢查 0\/5｜按鈕 1 … 2 …｜旋鈕 /.test(s.lastStatus()) && !/蜂鳴器|[34] …/.test(s.lastStatus()) && !/｜$/.test(s.lastStatus()),
        "現況：算 5 項，不列按鈕 3、4 和蜂鳴器（" + s.lastStatus().replace(/｜旋鈕.*｜傾斜/, "｜旋鈕…｜傾斜") + "）");
    s.tick(600);
    const todo = s.lines.filter((l) => /^還沒過：/.test(l)).pop() || "";
    say(!s.said(/蜂鳴器/) && /^還沒過：按鈕 1、2（各按一下）/.test(todo) && s.said(/^燈板上：上面兩個角落＝按鈕 1、2/),
        "說明和「還沒過」都只講這塊板子有的零件，沒有提到蜂鳴器（" + todo.slice(0, 20) + "…）");
    s.press(0); s.press(1); s.knob(0.0); s.knob(1.0);
    s.sound(0.0005, 90); s.sound(0.5, 30);
    for (const [x, y] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) { m._bp_tilt_set(x, y); s.tick(5); }
    s.tick(30);
    say(s.said(/^★ 全部過關（5\/5）/) && /^零件檢查 5\/5/.test(s.lastStatus()), "五項都過了：全部過關（" + s.lastStatus().slice(0, 12) + "）");
    const n = s.lines.length;
    s.tick(1300);
    const after = s.lines.slice(n).filter((l) => /^✗|^還沒過/.test(l));
    say(after.length === 0, "過關之後 20 秒：沒有再印 ✗ 或「還沒過」" + (after.length ? "（印了：" + after[0].slice(0, 30) + "…）" : ""));
    say(s.maxFrameBytes() <= FRAME_BYTES, `每一格最多印 ${s.maxFrameBytes()} 位元組（上限 ${FRAME_BYTES}）`);
  }
  // 燈板接在 C 接口（只有第一、二版的板子有 C 接口；工具頁會把原本程式的 #define PORT 帶過來）：自動當成第一、二版
  const pvc = await post("preview", code.replace(/^([ \t]*#define[ \t]+PANEL[ \t]+8\b.*)$/m, "$1\n#define PORT C"));
  say(pvc.ok, "加上 #define PORT C 也編得過" + (pvc.ok ? "" : "：" + firstError(pvc.log)));
  if (pvc.ok) {
    const s = await boot(pvc.js);
    s.tick(150);
    say(/^零件檢查 0\/4｜按鈕 1 … 2 …｜旋鈕 /.test(s.lastStatus()), "PORT C：不用改 OLD_BOARD 就當成第一、二版（預覽算 4 項：按鈕 1、2、旋鈕、麥克風）：" + s.lastStatus().slice(0, 24) + "…");
  }

  console.log("── 板子的麥克風沒焊好：一直沒聲音、或一直滿格，過一陣子標 ✗ 並說明檢查焊點");
  if (pvb.ok) {
    const s = await boot(pvb.js);
    const { L } = s;
    s.m._bp_tilt_set(0, 0);
    s.background(0);                                          // 一直在收音，但讀到的都是 0（資料腳沒焊好會這樣）
    s.tick(600);
    say(/麥克風 … 音量 0\.00/.test(s.lastStatus()) && !s.said(/^✗ 麥克風/), "前 10 秒沒聲音：還只是「…」（學員可能還沒拍手）");
    s.tick(780);                                              // 到第 23 秒
    const seen = new Set();
    for (let i = 0; i < 60; i++) { s.tick(); seen.add(s.state(L.mic)); }
    say(/麥克風 ✗ 沒聽到聲音/.test(s.lastStatus()) && seen.has("紅") && s.said(/^✗ 麥克風一直沒聽到聲音：.*拍手.*焊點/),
        "超過 20 秒都沒聲音：現況標「✗ 沒聽到聲音」、那一塊閃紅（看到：" + [...seen].join("、") + "），說明先拍手、還是沒有就檢查焊點");
    const todo = s.lines.filter((l) => /^還沒過：/.test(l)).pop() || "";
    say(!/麥克風/.test(todo), "這時「還沒過」不再列麥克風（已經有 ✗ 的說明）：" + todo.slice(0, 40) + "…");
    s.sound(0.5, 30); s.tick(40);
    say(/麥克風 ✓/.test(s.lastStatus()) && s.state(L.mic) === "綠", "之後拍手有反應：✗ 收起來、過關（" + (s.lastStatus().match(/麥克風[^｜]*/) || [""])[0] + "）");
  }
  if (pvb.ok) {
    const s = await boot(pvb.js);
    s.m._bp_tilt_set(0, 0);
    s.background(0.5);                                        // 一直滿格
    s.tick(360);
    say(/麥克風 … 音量 1\.00/.test(s.lastStatus()) && !s.said(/^✗ 麥克風/), "滿格 6 秒：還只是「…」");
    s.tick(420);                                              // 到第 13 秒
    say(/麥克風 ✗ 一直滿格/.test(s.lastStatus()) && s.said(/^✗ 麥克風的音量一直是滿格：檢查麥克風模組的焊點/),
        "超過 10 秒一直滿格：現況標「✗ 一直滿格」，說明檢查焊點（" + (s.lastStatus().match(/麥克風[^｜]*/) || [""])[0] + "）");
  }
  if (pv.ok) {
    const s = await boot(pv.js);
    s.background(0);
    s.tick(1800);
    say(!/麥克風 ✗/.test(s.lastStatus()) && !s.said(/^✗ 麥克風/), "預覽（電腦的麥克風）安靜 30 秒：不標 ✗（" + (s.lastStatus().match(/麥克風[^｜]*/) || [""])[0] + "）");
  }
  if (pvb.ok) {
    // 第三版的板子全部過關：說明怎麼重測（板子：按 RESET）
    const s = await boot(pvb.js);
    const { m } = s;
    s.background(0.0005);
    m._bp_tilt_set(0, 0);                                     // 傾斜感測器是好的（板子平放）
    s.tick(150);
    // 先只試按鈕 1、2、旋鈕、傾斜、麥克風（按鈕 3、4 還沒按）：偵測得到蜂鳴器＝第三版的板子，不能說「有的零件都過關了」
    s.press(0); s.press(1);
    s.knob(0.0); s.knob(1.0);
    for (const [x, y] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) { m._bp_tilt_set(x, y); s.tick(5); }
    s.sound(0.0005, 90); s.sound(0.5, 30); s.tick(30);
    say(/^零件檢查 6\/8/.test(s.lastStatus()) && !s.said(/全部過關/),
        "有蜂鳴器的板子，按鈕 3、4 還沒按（" + s.lastStatus().slice(0, 12) + "）：還沒全部過關");
    s.press(2); s.press(3); s.tick(30);
    say(s.said(/^★ 全部過關（8\/8）.*要重測：按板子上的 RESET 鍵/), "板子全部過關（8/8）：說明要重測就按板子上的 RESET 鍵");
    say(!s.said(/第一、二版|OLD_BOARD/), "有蜂鳴器的板子不會提到第一、二版");
    const todo = s.lines.filter((l) => /^還沒過：/.test(l))[0] || "";
    say(/麥克風（先安靜、再拍手或讓蜂鳴器響）/.test(todo) && /傾斜（往四個邊各斜一下）/.test(todo) && /蜂鳴器（按任一顆按鈕）/.test(todo), "板子的「還沒過」清單：" + todo);
    say(s.maxFrameBytes() <= FRAME_BYTES, `每一格最多印 ${s.maxFrameBytes()} 位元組（上限 ${FRAME_BYTES}）`);
  }
  if (pvb.ok) {
    // 蜂鳴器沒偵測到，但按鈕 3 按得到：一定是第三版的板子，蜂鳴器的說明只講檢查焊點，不再提第一、二版
    const s = await boot(pvb.js);
    const { m } = s;
    s.background(0.0005);
    s.tick(2); m._bp_buzzer_present(0); s.tick(150);
    s.press(2);
    const n = s.lines.length;
    s.tick(700);                                              // 超過 10 秒：定期的提醒一定又印過
    const again = s.lines.slice(n).filter((l) => /^✗ 沒偵測到蜂鳴器/.test(l));
    say(again.length > 0 && again.every((l) => /檢查蜂鳴器和旁邊電阻的焊點/.test(l) && !/第一、二版|OLD_BOARD/.test(l)),
        "按得到按鈕 3 之後，蜂鳴器的說明只剩「檢查焊點」：" + (again[0] || "（沒印）"));
    say(!s.said(/全部過關/), "蜂鳴器沒偵測到：不算全部過關");
  }

  console.log("── 傾斜：板子上有感測器才算一項；四個方向都倒過才過關");
  if (pv.ok) {
    const s = await boot(pv.js);
    const { m, L } = s;
    s.tick(150);
    m._bp_tilt_set(0, 1); s.tick(40);
    say(/^零件檢查 0\/8/.test(s.lastStatus()), "有傾斜感測器（測試用指定的值）：總共變成 8 項（" + s.lastStatus().slice(0, 12) + "）");
    m._bp_tilt_set(0.9, 0); s.tick(5); m._bp_tilt_set(-0.9, 0); s.tick(5);
    say(s.state(L.tilt) === "待測", "只往左、往右、正放：還沒過關");
    m._bp_tilt_set(0, -0.9); s.tick(5);
    say(s.state(L.tilt) === "綠" && s.said(/✓ 傾斜過關/), "上下顛倒也試過：過關");
  }

  console.log("── 偵測到沒接好：那一塊閃紅，序列埠說明要檢查哪裡");
  if (pv.ok) {
    const s = await boot(pv.js);
    const { m, L } = s;
    if (typeof m._bp_buzzer_present !== "function") say(false, "測試要能假裝板子上沒有蜂鳴器（bp_buzzer_present）");
    else {
      s.tick(2);
      m._bp_buzzer_present(0);
      s.tick(150);
      const seen = new Set();
      for (let i = 0; i < 60; i++) { s.tick(); seen.add(s.state(L.buzz)); }
      say(seen.has("紅") && !seen.has("綠") && s.said(/✗ 沒偵測到蜂鳴器/), "沒有蜂鳴器（第一、二版的板子，或沒焊好）：蜂鳴器那一塊閃紅（看到：" + [...seen].join("、") + "）");
      s.press(0);
      s.tick(30);
      say(s.state(L.buzz) !== "綠" && /蜂鳴器 ✗/.test(s.lastStatus()), "按了按鈕也不會變綠，現況那一行標 ✗");
      for (let i = 1; i < 4; i++) s.press(i);
      s.knob(0.0); s.knob(1.0);
      s.sound(0.0005, 90); s.sound(0.5, 40);
      say(/^零件檢查 6\/7/.test(s.lastStatus()) && !s.said(/全部過關/), "其他六項都過了也不算全部過關（" + s.lastStatus().slice(0, 12) + "）：蜂鳴器沒接好不能放彩虹");
      const n = s.lines.length;
      s.tick(700);
      const tail = s.lines.slice(n);
      say(tail.some((l) => /^✗ 沒偵測到蜂鳴器/.test(l)) && !tail.some((l) => /^還沒過：/.test(l)),
          "只剩沒偵測到的蜂鳴器：定期提醒只印那一行 ✗，不印空的「還沒過：」");
    }
  }

  const pv16 = await post("preview", code.replace(/^([ \t]*#define[ \t]+PANEL[ \t]+)8\b/m, "$116"));
  say(pv16.ok, "換成 16×16 也編得過" + (pv16.ok ? "" : "：" + firstError(pv16.log)));
  if (pv16.ok) {
    console.log("── 16×16：一樣的幾塊，塊跟塊之間留一排不亮的空隙");
    const s = await boot(pv16.js);
    const { L } = s;
    s.tick(150);
    const all = [...L.btn, L.knob, L.mic, L.buzz, L.tilt].map((b) => s.state(b));
    say(all.every((v) => v === "待測"), "八塊都亮著（" + all.join("、") + "）");
    const rowDark = (y) => Array.from({ length: 16 }, (_, x) => s.px(x, y)).every(isDark);
    say(rowDark(3) && rowDark(6) && rowDark(12), "第 3、6、12 排是空隙（整排不亮）");
    const pips = L.btn.map((b) => s.cells(b).filter(isBright).length);
    say(pips.join() === "1,2,3,4", "按鈕的亮點數目一樣是 1、2、3、4（" + pips.join("、") + "）");
    for (let i = 0; i < 4; i++) s.press(i);
    say(L.btn.every((b) => s.state(b) === "綠"), "四顆按鈕按過都變綠");
  }

  const fw = await post("firmware", code);
  say(fw.ok, "板子端編譯（8×8）" + (fw.ok ? "" : "：" + firstError(fw.log)));
  const fw16 = await post("firmware", code.replace(/^([ \t]*#define[ \t]+PANEL[ \t]+)8\b/m, "$116"));
  say(fw16.ok, "板子端編譯（16×16）" + (fw16.ok ? "" : "：" + firstError(fw16.log)));
  const fwOld = await post("firmware", asOld(code));
  say(fwOld.ok, "板子端編譯（OLD_BOARD＝1，第一、二版的板子）" + (fwOld.ok ? "" : "：" + firstError(fwOld.log)));

  console.log("\n" + (bad ? bad + " 項不符 → FAIL" : "全部通過 → PASS"));
  process.exitCode = bad ? 1 : 0;   // 不用 process.exit()：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗
})();
