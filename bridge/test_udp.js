// 不用硬體的協定層驗證：在本機 127.0.0.1:6454 監聽，解析橋送來的 ArtDMX 封包。
// 用法：另開視窗以 BATOPIXEL_ARTNET_TARGET=127.0.0.1 跑橋，再 node test_udp.js
// 檢查：標頭／位元組序／universe 切分／Length 510+258／GRB／2x2 放大＋蛇行映射／節流。
const dgram = require("dgram");
const sock = dgram.createSocket("udp4");
const seen = {};                       // universe → { ok, len, seq, lit:[實體像素索引...] }
let t0 = null, frames = 0;
sock.on("message", (b) => {
  const id = b.subarray(0, 8).toString("latin1");
  const op = b.readUInt16LE(8), ver = b.readUInt16BE(10), seq = b[12];
  const uni = b[14] | (b[15] << 8), len = b.readUInt16BE(16);
  const data = b.subarray(18, 18 + len);
  const lit = [];
  for (let i = 0; i + 2 < data.length; i += 3)
    if (data[i] | data[i + 1] | data[i + 2]) lit.push({ px: uni * 170 + i / 3, bytes: [data[i], data[i + 1], data[i + 2]] });
  const ok = id === "Art-Net\0" && op === 0x5000 && ver === 14 && b.length === 18 + len && (len & 1) === 0;
  seen[uni] = { ok, len, seq, lit };
  if (uni === 0) { frames++; if (!t0) t0 = Date.now(); }
});
sock.bind(6454, "127.0.0.1", () => console.log("監聽 127.0.0.1:6454 …（10 秒後彙整）"));
setTimeout(() => {
  const secs = t0 ? (Date.now() - t0) / 1000 : 0;
  console.log("\n=== 彙整 ===");
  for (const u of Object.keys(seen).sort()) {
    const s = seen[u];
    console.log("universe " + u + ": 標頭" + (s.ok ? "正確" : "錯誤") + "  Length=" + s.len + "  seq=" + s.seq +
                "  亮的實體像素=" + JSON.stringify(s.lit.map(l => l.px)) +
                (s.lit.length ? "  第一顆位元組=[" + s.lit[0].bytes + "]" : ""));
  }
  console.log("universe 0 共 " + frames + " 幀 / " + secs.toFixed(1) + " 秒 ≈ " + (frames / Math.max(secs, 0.001)).toFixed(1) + " fps");
  process.exit(0);
}, 10000);
