// 編譯站另開的執行緒：把預覽模組跑成縮圖 sprite（見 thumb.js），結果傳回主執行緒。
// 學員的程式就算卡住，也只卡住這個執行緒；主執行緒時間到就把它停掉（server.js 的 renderInWorker）。
const { parentPort, workerData } = require("worker_threads");
const { loadModule } = require("./load_module.js");
const { renderThumb } = require("./thumb.js");

loadModule(workerData.js)
  .then((m) => parentPort.postMessage({ ok: true, png: renderThumb(m, workerData.code).png }))
  .catch((e) => parentPort.postMessage({ ok: false, error: String((e && e.message) || e) }));
