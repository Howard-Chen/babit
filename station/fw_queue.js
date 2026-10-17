// 編譯排隊（韌體、預覽各一條）：一次只跑一個。
// 背景的請求（bg：工具頁每次預覽成功就先編韌體、每次按執行送的預覽）只有最新的有用：學員連點幾個範例時，
// 排隊中的舊請求直接作廢（回 { ok:false, superseded:true }），正在編的舊請求也停掉（2026-10-16 跑介面測試時踩到：
// 排了一長串，後面的請求等到逾時；正在編的韌體一份要幾十秒）。
// 不停的情況：明確要求的（燒錄、縮圖）、跟新請求同一段程式、排隊中的燒錄正要用它的結果。
// run(code, signal)：signal 中止時 run 要盡快結束（編譯站會停掉 arduino-cli）；不理 signal 的就照常跑完。
function createFwQueue(run) {
  const waiting = [];                          // 還沒開始的，照順序
  let current = null;                          // 正在跑的

  function next() {
    const job = waiting.shift();
    current = job || null;
    if (!job) return;
    job.ctl = new AbortController();
    Promise.resolve()
      .then(() => (job.ctl.signal.aborted ? { ok: false, superseded: true } : run(job.code, job.ctl.signal)))
      .then(job.settle, (e) => job.settle({ ok: false, log: String(e) }))
      .then(next);
  }

  return function enqueue(code, bg) {
    let settle;
    const done = new Promise((r) => { settle = r; });
    if (bg) {
      const i = waiting.findIndex((j) => j.bg);
      if (i >= 0) waiting.splice(i, 1)[0].settle({ ok: false, superseded: true });
      if (current && current.bg && current.code !== code && !waiting.some((j) => !j.bg && j.code === current.code)) current.ctl.abort();
    }
    waiting.push({ code, bg, settle });
    if (!current) next();
    return done;
  };
}

module.exports = { createFwQueue };
