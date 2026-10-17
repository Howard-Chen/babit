// 編譯排隊的單元測試（不用開編譯站）：node station/test_fw_queue.js
// 背景預編只留最新的一個：排隊中的直接作廢，正在編的也停掉（學員已經換了程式）。
// 明確要求的（燒錄、縮圖）不作廢也不停；排隊中的燒錄要用正在編的那份結果時，那份也不停。
const { createFwQueue } = require("./fw_queue");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const tick = () => new Promise((r) => setImmediate(r));
const WAITING = "還在等";
const now = (p) => Promise.race([p, tick().then(() => WAITING)]);

// 假的 arduino-cli：記下開始的順序，測試放行才結束；收到「停掉」就馬上回 superseded（跟真的編譯站一樣）
function fakeCompiler() {
  const started = [], stopped = [], gates = {};
  const run = (code, signal) => {
    started.push(code);
    return new Promise((resolve, reject) => {
      gates[code] = { resolve, reject };
      if (signal) signal.addEventListener("abort", () => { stopped.push(code); resolve({ ok: false, superseded: true, code }); });
    });
  };
  const finish = (code) => gates[code] && gates[code].resolve({ ok: true, code });
  const fail = (code, e) => gates[code] && gates[code].reject(e);
  return { run, started, stopped, finish, fail };
}

// 等的編譯一直沒開始時，promise 永遠不會結束、node 直接收工——先當失敗，跑完才改成通過
let done = false;
process.exitCode = 1;
process.on("exit", () => { if (!done) console.log("\n測試卡住：有一個編譯一直沒開始（被跳過了？）"); });

(async () => {
  console.log("── 一次只編一個，結果各自回給要求的人");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("A", false), b = q("B", false);
    await tick();
    say(f.started.join() === "A", "B 等 A 編完才開始（開始過：" + f.started.join() + "）");
    f.finish("A");
    say((await a).code === "A", "A 的結果回給 A");
    await tick();
    say(f.started.join() === "A,B", "A 編完換 B（開始過：" + f.started.join() + "）");
    f.finish("B");
    say((await b).code === "B", "B 的結果回給 B");
  }

  console.log("── 背景預編：排隊中的作廢，正在編的也停掉");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("A", true);                          // 馬上開始
    await tick();
    const b = q("B", true);                          // 更新的背景預編 → 正在編的 A 停掉；B 排隊
    const c = q("C", true);                          // 再更新的 → 排隊中的 B 作廢
    const rb = await now(b);
    say(rb !== WAITING && rb.superseded === true && rb.ok === false, "排隊中的 B 馬上回 { ok:false, superseded:true }（得到 " + JSON.stringify(rb) + "）");
    const ra = await now(a);
    say(ra !== WAITING && ra.superseded === true && f.stopped.join() === "A", "正在編的 A 收到「停掉」，回 superseded（得到 " + JSON.stringify(ra) + "）");
    await tick();
    say(f.started.join() === "A,C", "B 不會真的去編：A 停掉後直接換 C（開始過：" + f.started.join() + "）");
    f.finish("C");
    say((await c).code === "C", "C 的結果回給 C");
  }

  console.log("── 還沒開始就被停掉的：不會真的去編");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("A", true);                          // 輪到它了，但 run 還沒呼叫
    const b = q("B", true);                          // 同一個時間點就來了更新的
    const ra = await a;
    say(ra.superseded === true && !f.started.includes("A"), "A 回 superseded，沒有呼叫編譯（開始過：" + f.started.join() + "）");
    await tick();
    f.finish("B");
    say((await b).code === "B", "接著編 B");
  }

  console.log("── 明確要求（燒錄）不會被背景預編作廢或停掉");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const x = q("X", false);                         // 燒錄：正在編
    const y = q("Y", true);                          // 背景預編
    const z = q("Z", true);                          // 更新的背景預編 → Y 作廢，X 照常
    const ry = await now(y);
    say(ry !== WAITING && ry.superseded === true, "Y 被 Z 取代");
    say((await now(x)) === WAITING && !f.stopped.length, "正在編的燒錄 X 不會被停掉");
    f.finish("X");
    say((await x).code === "X", "X 照常回結果");
    await tick();
    say(f.started.join() === "X,Z", "X 之後編 Z，Y 沒有編（開始過：" + f.started.join() + "）");
    f.finish("Z"); await z;
  }

  console.log("── 排隊中的燒錄要同一段程式：正在編的背景預編不停（燒錄要用它的結果）");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("P", true);                          // 背景預編 P：正在編
    const flash = q("P", false);                     // 按了燒錄，要的也是 P
    const n = q("Q", true);                          // 學員又換了程式
    say((await now(a)) === WAITING && !f.stopped.length, "P 繼續編，沒有被 Q 停掉");
    f.finish("P");
    say((await a).ok === true, "P 照常編完");
    await tick();
    say(f.started.join() === "P,P", "接著是燒錄要的 P（開始過：" + f.started.join() + "）");
    f.finish("P"); await flash; await tick();
    f.finish("Q"); await n;
  }

  console.log("── 新的背景預編跟正在編的是同一段程式：不停");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("P", true);
    const b = q("P", true);
    say((await now(a)) === WAITING && !f.stopped.length, "正在編的 P 不停");
    f.finish("P"); await a; await tick();
    f.finish("P"); await b;
  }

  console.log("── 編譯丟出例外：回 ok:false，後面的照常編");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("A", false), b = q("B", false);
    await tick();
    f.fail("A", new Error("arduino-cli 不見了"));
    const ra = await a;
    say(ra.ok === false && /arduino-cli 不見了/.test(ra.log), "A 回 { ok:false, log }（得到 " + JSON.stringify(ra) + "）");
    await tick();
    say(f.started.join() === "A,B", "B 照常開始（開始過：" + f.started.join() + "）");
    f.finish("B");
    say((await b).code === "B", "B 照常回結果");
  }

  done = true;
  console.log(bad ? `\n${bad} 項失敗` : "\n全部通過");
  process.exitCode = bad ? 1 : 0;
})();
