// 對 Art-Net 橋下測試指令（映射判定用），走 WebSocket，Node 24 內建客戶端。
//   node cmd.js pixel <實體索引> [r g b]      點亮一顆（不套燈序映射，套顏色順序）
//   node cmd.js raw <universe> <channel> v1 v2 v3 ...   直接寫 channel（1 起算），繞過所有映射
//   node cmd.js fill <universe> [value]       整個 universe 512 channel 填同值，數亮幾顆
//   node cmd.js sweep [from] [to] [ms]        逐顆點亮，看走線與位址間隙（Ctrl+C 停）
//   node cmd.js marks u:off:色 ...            多點多色標記，色＝r g b w y m c（例 0:0:r 0:159:g 1:0:w）
//   node cmd.js config k=v ...                即時改設定（pixelOffset=82、layout.serpentine=false、padTo512=true）
//   node cmd.js blackout                      全暗並解除測試保持
//   node cmd.js status                        印出目前狀態
const [, , type, ...rest] = process.argv;
const n = rest.map(Number);
const PORT = process.env.BATOPIXEL_BRIDGE_WS || 8940;
let msg;
switch (type) {
  case "pixel":    msg = { type, index: n[0] | 0, rgb: [n[1] ?? 40, n[2] ?? 0, n[3] ?? 0] }; break;
  case "raw":      msg = { type, universe: n[0] | 0, channel: n[1] | 0, values: n.slice(2) }; break;
  case "fill":     msg = { type, universe: n[0] | 0, value: n[1] ?? 30 }; break;
  case "sweep":    msg = { type, from: n[0] ?? 0, to: n[1] ?? 255, interval: n[2] ?? 500 }; break;
  case "marks": {   // node cmd.js marks 0:0:r 0:159:g 1:0:w ...  （universe:offset:顏色字母）
    const C = { r:[60,0,0], g:[0,60,0], b:[0,0,60], w:[40,40,40], y:[60,60,0], m:[60,0,60], c:[0,60,60] };
    msg = { type, marks: rest.map((t) => { const [u, o, k] = t.split(":"); return { u: +u, o: +o, rgb: C[k] || C.r }; }) };
    break;
  }
  case "config": {  // node cmd.js config pixelOffset=82 layout.serpentine=false padTo512=true
    msg = { type };
    for (const kv of rest) {
      const [k, raw] = kv.split("=");
      const v = raw === "true" ? true : raw === "false" ? false : raw === "null" ? null : isNaN(+raw) ? raw : +raw;
      if (k.startsWith("layout.")) { (msg.layout = msg.layout || {})[k.slice(7)] = v; } else msg[k] = v;
    }
    break;
  }
  case "blackout": case "status": msg = { type }; break;
  default:
    console.log("用法：node cmd.js pixel|raw|fill|sweep|blackout|status ...（見檔頭註解）");
    process.exit(1);
}
const ws = new WebSocket("ws://127.0.0.1:" + PORT);
ws.onerror = () => { console.error("連不上橋：先跑 run_bridge.ps1"); process.exit(1); };
ws.onopen = () => {
  ws.send(JSON.stringify(msg));
  if (type === "sweep") { console.log("掃描中，Ctrl+C 停止"); return; }
  ws.send(JSON.stringify({ type: "status" }));
  setTimeout(() => process.exit(0), 400);
};
ws.onmessage = (e) => console.log(String(e.data));
