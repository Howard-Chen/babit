// 在 node 裡載入編譯站回傳的預覽模組（emcc 產生的 JS，wasm 內嵌在裡面）。
// emcc 的程式在 node 底下會用到 require、__dirname，所以寫成暫存檔再 require，用完就刪掉。
// 縮圖產生（thumb_worker.js）與各支測試共用。opts 直接交給模組，例如 { print: (行) => … } 接住程式的 Serial 輸出。
const fs = require("fs"), os = require("os"), path = require("path");

async function loadModule(js, opts) {
  const f = path.join(os.tmpdir(), "babit_" + process.pid + "_" + Math.random().toString(36).slice(2) + ".js");
  fs.writeFileSync(f, js + "\nmodule.exports = createBatoPixel;\n");
  try {
    return await require(f)(opts || {});
  } finally {
    delete require.cache[require.resolve(f)];
    fs.unlinkSync(f);
  }
}

module.exports = { loadModule };
