// 編譯排隊（韌體、預覽各一條）。
// 離線版（學員自己的電腦）：一個槽、一個人，一次只跑一個。
// 雲端版（整班共用）：好幾個槽同時編（slots）、每個人各排各的（client）。兩種是同一套規則，離線版就是「一個槽、所有請求算同一個人」。
//
// 規則：
// - 每個人同時只編一份；自己的下一份要等上一份編完（不會一個人佔掉好幾個槽）。
// - 背景的請求（bg：工具頁每次預覽成功就先編韌體、每次按執行送的預覽）每個人只有最新的有用：學員連點幾個範例時，
//   他排隊中的舊請求直接作廢（回 { ok:false, superseded:true }），他正在編的舊請求也停掉（2026-10-16 跑介面測試時踩到：
//   排了一長串，後面的請求等到逾時；正在編的韌體一份要幾十秒）。別人的請求不受影響。
// - 不停的情況：明確要求的（燒錄、縮圖）、跟新請求同一段程式、他排隊中的燒錄正要用它的結果。
// - 輪流：有空槽時先給最久沒輪到的人，同一個人的照送來的順序。一個人排了一長串，別人不用等他全部編完。
// - 每個人排隊的份數可以設上限（maxWaiting，雲端版用；正在編的那份不算）：超過的馬上回 { ok:false, busy:true }，
//   不進佇列——一個人（或一支亂送請求的程式）塞不滿編譯站。工具頁正常用最多排兩三份；離線版不設上限。
// run(code, signal, slot)：signal 中止時 run 要盡快結束（編譯站會停掉 arduino-cli）；不理 signal 的就照常跑完。
//   slot＝這份工作用第幾個槽（0 起算）：同一時間不會有兩份工作用同一個槽，韌體的建置資料夾照槽分開。
function createFwQueue(run, { slots = 1, maxWaiting = Infinity } = {}) {
  const waiting = [];                            // 還沒開始的，照送來的順序
  const running = new Array(slots).fill(null);   // 每個槽正在跑的工作
  const served = new Map();                      // 這個人上次輪到是第幾號（輪流用）
  let turn = 0;

  const busy = (client) => running.some((j) => j && j.client === client);

  function pump() {
    for (;;) {
      const slot = running.indexOf(null);
      if (slot < 0) return;
      let pick = -1;
      for (let i = 0; i < waiting.length; i++) {
        if (busy(waiting[i].client)) continue;
        if (pick < 0 || (served.get(waiting[i].client) || 0) < (served.get(waiting[pick].client) || 0)) pick = i;
      }
      if (pick < 0) return;
      const job = waiting.splice(pick, 1)[0];
      running[slot] = job;
      served.delete(job.client);                 // 重新放到最後面：Map 照放進去的順序排，人太多時刪最舊的
      served.set(job.client, ++turn);
      if (served.size > 2000) served.delete(served.keys().next().value);
      job.ctl = new AbortController();
      Promise.resolve()
        .then(() => (job.ctl.signal.aborted ? { ok: false, superseded: true } : run(job.code, job.ctl.signal, slot)))
        .then(job.settle, (e) => job.settle({ ok: false, log: String(e) }))
        .then(() => { running[slot] = null; pump(); });
    }
  }

  // client：是誰送的（雲端版由工具頁帶一個代號）；沒給就全部算同一個人
  return function enqueue(code, bg, client = "") {
    // 他排隊中的舊背景請求會被這份換掉（份數不變），所以不算進去
    const i = bg ? waiting.findIndex((j) => j.bg && j.client === client) : -1;
    const mine = waiting.reduce((n, j) => n + (j.client === client ? 1 : 0), 0) - (i >= 0 ? 1 : 0);
    if (mine >= maxWaiting) return Promise.resolve({ ok: false, busy: true });
    let settle;
    const done = new Promise((r) => { settle = r; });
    if (bg) {
      if (i >= 0) waiting.splice(i, 1)[0].settle({ ok: false, superseded: true });
      const cur = running.find((j) => j && j.client === client);
      if (cur && cur.bg && cur.code !== code && !waiting.some((j) => !j.bg && j.client === client && j.code === cur.code)) cur.ctl.abort();
    }
    waiting.push({ code, bg, client, settle });
    pump();
    return done;
  };
}

module.exports = { createFwQueue };
