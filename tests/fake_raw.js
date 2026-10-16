// 測試用：在本機模擬 raw.githubusercontent.com，回應格式跟 GitHub 一樣（text/plain; charset=utf-8）。
// 用法：node tests/fake_raw.js <要提供的資料夾> <連接埠>
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 8936);
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  const ok = p.startsWith(root) && fs.existsSync(p) && fs.statSync(p).isFile();
  res.writeHead(ok ? 200 : 404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(ok ? fs.readFileSync(p) : "404: Not Found");
}).listen(port, "127.0.0.1");
