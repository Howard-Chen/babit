// 韌體編譯排隊：arduino-cli 一次只跑一個。
// 背景預編（頁面每次預覽成功就先編好韌體，按燒錄才快）只留最新的一個在排隊：學員連點幾個範例時，
// 前面還沒開始的直接作廢（回 { ok:false, superseded:true }），不然按燒錄要等前面一整串編完
// （2026-10-16 跑介面測試時踩到：排了一長串，後面的請求等到逾時）。已經開始的不中斷；明確要求的（燒錄）一律不作廢。
function createFwQueue(run) {
  const waiting = [];                          // 還沒開始的，照順序
  let busy = false;

  function next() {
    const job = waiting.shift();
    if (!job) { busy = false; return; }
    busy = true;
    Promise.resolve()
      .then(() => run(job.code))
      .then(job.settle, (e) => job.settle({ ok: false, log: String(e) }))
      .then(next);
  }

  return function enqueue(code, bg) {
    let settle;
    const done = new Promise((r) => { settle = r; });
    if (bg) {
      const i = waiting.findIndex((j) => j.bg);
      if (i >= 0) waiting.splice(i, 1)[0].settle({ ok: false, superseded: true });
    }
    waiting.push({ code, bg, settle });
    if (!busy) next();
    return done;
  };
}

module.exports = { createFwQueue };
