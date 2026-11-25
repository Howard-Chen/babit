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

  // ── 以下是多人共用（雲端版）的排法：同時編好幾份、每個人各排各的 ──
  // 假的編譯器多記一件事：每份工作用的是第幾個槽
  function fakePool() {
    const f = fakeCompiler(), slotOf = {}, running = new Set();
    let maxRunning = 0;
    const run = (code, signal, slot) => {
      slotOf[code] = slot;
      running.add(code);
      maxRunning = Math.max(maxRunning, running.size);
      return f.run(code, signal).finally(() => running.delete(code));
    };
    return Object.assign({}, f, { run, slotOf, running, max: () => maxRunning });
  }

  console.log("── 同時編好幾份（slots）：不同人的工作一起跑，各用各的槽");
  {
    const f = fakePool(), q = createFwQueue(f.run, { slots: 2 });
    const a = q("A", false, "甲"), b = q("B", false, "乙"), c = q("C", false, "丙");
    await tick();
    say(f.started.join() === "A,B" && f.slotOf.A !== f.slotOf.B && [0, 1].includes(f.slotOf.A) && [0, 1].includes(f.slotOf.B),
        `兩個槽：A、B 同時開始，用不同的槽（A 用 ${f.slotOf.A}、B 用 ${f.slotOf.B}），C 在等（開始過：${f.started.join()}）`);
    const slotA = f.slotOf.A;
    f.finish("A"); await a; await tick();
    say(f.started.join() === "A,B,C" && f.slotOf.C === slotA, `A 編完，C 接著用 A 空出來的槽（${f.slotOf.C}）`);
    f.finish("B"); f.finish("C"); await b; await c;
    say(f.max() === 2, "同時在編的最多 2 份（實際最多 " + f.max() + "）");
  }

  console.log("── 每個人同時只編一份：自己的第二份要等，不會佔掉別人的槽");
  {
    const f = fakePool(), q = createFwQueue(f.run, { slots: 3 });
    const a1 = q("甲1", false, "甲"), a2 = q("甲2", false, "甲"), b1 = q("乙1", false, "乙");
    await tick();
    say(f.started.join() === "甲1,乙1", "三個槽：甲的第一份和乙的一起跑，甲的第二份等甲的第一份（開始過：" + f.started.join() + "）");
    f.finish("甲1"); await a1; await tick();
    say(f.started.join() === "甲1,乙1,甲2", "甲的第一份編完，才輪到甲的第二份");
    f.finish("甲2"); f.finish("乙1"); await a2; await b1;
  }

  console.log("── 背景預編「只留最新的」只看同一個人：別人的不受影響");
  {
    const f = fakePool(), q = createFwQueue(f.run, { slots: 2 });
    const a = q("甲舊", true, "甲"), b = q("乙舊", true, "乙");
    await tick();
    const a2 = q("甲新", true, "甲");                  // 甲換了程式 → 只停甲的
    const ra = await now(a);
    say(ra !== WAITING && ra.superseded === true && f.stopped.join() === "甲舊", "甲送了新的：甲正在編的舊的停掉（停掉過：" + f.stopped.join() + "）");
    say((await now(b)) === WAITING, "乙正在編的不受影響");
    await tick();
    say(f.started.join() === "甲舊,乙舊,甲新", "甲的新的接著編（開始過：" + f.started.join() + "）");
    const b2 = q("乙新A", true, "乙"), b3 = q("乙新B", true, "乙");   // 乙排隊中的舊背景作廢，只留最新
    const rb2 = await now(b2);
    say(rb2 !== WAITING && rb2.superseded === true, "乙排隊中的背景預編被自己更新的取代");
    f.finish("甲新"); await a2; await tick(); await tick();
    f.finish("乙新B"); await b3; await now(b);
  }

  console.log("── 輪流：一個人排了一長串，別人不用等他全部編完");
  {
    const f = fakePool(), q = createFwQueue(f.run, { slots: 1 });
    const x1 = q("甲1", false, "甲"), x2 = q("甲2", false, "甲"), x3 = q("甲3", false, "甲");
    await tick();
    const y1 = q("乙1", false, "乙");
    f.finish("甲1"); await x1; await tick();
    say(f.started.join() === "甲1,乙1", "只有一個槽：甲的第一份編完先換乙，不是甲的第二份（開始過：" + f.started.join() + "）");
    f.finish("乙1"); await y1; await tick();
    f.finish("甲2"); await x2; await tick();
    f.finish("甲3"); await x3;
    say(f.started.join() === "甲1,乙1,甲2,甲3", "之後甲的照原本的順序（開始過：" + f.started.join() + "）");
  }

  console.log("── 每個人排隊的份數有上限（雲端版 maxWaiting）：超過的馬上回「忙」，不會一個人塞滿編譯站");
  {
    const f = fakePool(), q = createFwQueue(f.run, { slots: 1, maxWaiting: 2 });
    const a1 = q("甲1", false, "甲"), a2 = q("甲2", false, "甲"), a3 = q("甲3", false, "甲");   // 甲1 正在編，甲2、甲3 在排
    await tick();
    const r4 = await now(q("甲4", false, "甲"));
    say(r4 !== WAITING && r4.ok === false && r4.busy === true && !("log" in r4), "甲已經排了 2 份：再送的馬上回 { ok:false, busy:true }，沒有 log（不是程式有錯）：" + JSON.stringify(r4));
    const rbg = await now(q("甲背景", true, "甲"));
    say(rbg !== WAITING && rbg.busy === true, "背景的請求也一樣（他排隊中沒有舊的背景請求可以換）");
    const b1 = q("乙1", false, "乙");
    say((await now(b1)) === WAITING, "別人不受影響：乙照常排隊");
    f.finish("甲1"); await a1; await tick();
    say(f.started.join() === "甲1,乙1", "被拒絕的沒有進佇列：接著編的是乙（開始過：" + f.started.join() + "）");
    const r5 = await now(q("甲5", false, "甲"));            // 甲1 編完了：甲排隊中的還是 2 份（甲2、甲3）
    say(r5 !== WAITING && r5.busy === true, "正在編的不算在排隊的份數裡：甲還是排了 2 份，再送照樣回忙");
    f.finish("乙1"); await b1; await tick();
    f.finish("甲2"); await a2; await tick();
    const a6 = q("甲6", false, "甲");                       // 甲3 正在編，排隊中的是 0 份
    say((await now(a6)) === WAITING, "排隊的消化掉了：又可以送");
    f.finish("甲3"); await a3; await tick();
    f.finish("甲6"); await a6;
  }
  {
    const f = fakePool(), q = createFwQueue(f.run, { slots: 1, maxWaiting: 1 });
    const a1 = q("甲1", false, "甲"), old = q("甲舊背景", true, "甲");   // 甲1 正在編，舊背景在排（剛好到上限）
    await tick();
    const fresh = q("甲新背景", true, "甲");
    const rold = await now(old);
    say(rold !== WAITING && rold.superseded === true && (await now(fresh)) === WAITING, "到上限時送新的背景請求：換掉他排隊中舊的那個（份數沒變），不算超過");
    f.finish("甲1"); await a1; await tick();
    f.finish("甲新背景"); await fresh;
  }
  {
    const f = fakePool(), q = createFwQueue(f.run, { slots: 1 });
    const jobs = Array.from({ length: 30 }, (_, i) => q("A" + i, false));
    await tick();
    say((await now(jobs[29])) === WAITING, "沒設上限（離線版）：排幾份都收");
    for (let i = 0; i < 30; i++) { f.finish("A" + i); await jobs[i]; await tick(); }
  }

  console.log("── 沒說是誰的（離線版）跟以前一樣：全部算同一個人，一次一份、照順序");
  {
    const f = fakePool(), q = createFwQueue(f.run);
    const a = q("A", false), b = q("B", false);
    await tick();
    say(f.started.join() === "A" && f.slotOf.A === 0, "預設一個槽、槽號 0（開始過：" + f.started.join() + "）");
    f.finish("A"); await a; await tick();
    f.finish("B"); await b;
    say(f.max() === 1, "同時只編一份");
  }

  done = true;
  console.log(bad ? `\n${bad} 項失敗` : "\n全部通過");
  process.exitCode = bad ? 1 : 0;
})();
