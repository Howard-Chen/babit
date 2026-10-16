// 韌體編譯排隊的單元測試（不用開編譯站）：node station/test_fw_queue.js
// 背景預編只留最新的一個在排隊；已經開始的、明確要求的（燒錄）都不作廢。
const { createFwQueue } = require("./fw_queue");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const tick = () => new Promise((r) => setImmediate(r));
const WAITING = "還在等";

// 假的 arduino-cli：記下開始的順序，測試放行才結束
function fakeCompiler() {
  const started = [], gates = {};
  const run = (code) => {
    started.push(code);
    return new Promise((resolve, reject) => { gates[code] = { resolve, reject }; });
  };
  const finish = (code) => gates[code] && gates[code].resolve({ ok: true, code });
  const fail = (code, e) => gates[code] && gates[code].reject(e);
  return { run, started, finish, fail };
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

  console.log("── 背景預編：排隊中的被更新的取代");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("A", true);                          // 馬上開始
    const b = q("B", true);                          // 排隊中
    const c = q("C", true);                          // 更新的背景預編 → B 作廢
    const rb = await Promise.race([b, tick().then(() => WAITING)]);
    say(rb !== WAITING && rb.superseded === true && rb.ok === false,
      "B 馬上回 { ok:false, superseded:true }，不用等 A 編完（得到 " + JSON.stringify(rb) + "）");
    const ra = await Promise.race([a, tick().then(() => WAITING)]);
    say(ra === WAITING, "已經開始的 A 不作廢，照常編到完");
    f.finish("A");
    say((await a).code === "A", "A 編完照常回結果");
    await tick();
    say(f.started.join() === "A,C", "B 不會真的去編：A 之後直接換 C（開始過：" + f.started.join() + "）");
    f.finish("C");
    say((await c).code === "C", "C 的結果回給 C");
  }

  console.log("── 明確要求（燒錄）不會被背景預編取代");
  {
    const f = fakeCompiler(), q = createFwQueue(f.run);
    const a = q("A", true);                          // 正在編
    const x = q("X", false);                         // 燒錄：排在 A 後面
    const y = q("Y", true);                          // 背景預編
    const z = q("Z", true);                          // 更新的背景預編 → Y 作廢，X 不受影響
    const ry = await Promise.race([y, tick().then(() => WAITING)]);
    say(ry !== WAITING && ry.superseded === true, "Y 被 Z 取代");
    f.finish("A"); await a; await tick();
    say(f.started.join() === "A,X", "A 之後編燒錄要的 X（開始過：" + f.started.join() + "）");
    f.finish("X");
    say((await x).code === "X", "X 照常回結果");
    await tick();
    say(f.started.join() === "A,X,Z", "最後編 Z，Y 沒有編（開始過：" + f.started.join() + "）");
    f.finish("Z"); await z;
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
