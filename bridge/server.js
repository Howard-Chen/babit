// BatoPixel Art-Net 橋（本地獨立服務，與編譯站分離）
// 規格見 vault：技術_ARTNET控制器規格與測試.md 區塊四
//
// 瀏覽器（ws://127.0.0.1:8940）──192 bytes 8×8 RGB──▶ 本服務
//   ① 2×2 放大 → 16×16  ② 燈序查找表  ③ 顏色順序  ④ 切 universe 組 ArtDMX  ⑤ 節流 40fps
//                                                   ──UDP 6454──▶ 192.168.0.9
// 零相依：dgram 送 UDP，WebSocket 伺服器自行實作（Node 只內建客戶端）。
const dgram = require("dgram");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ───────────────────────── 設定 ─────────────────────────
const CFG_PATH = path.join(__dirname, "config.json");
const cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
if (process.env.BATOPIXEL_ARTNET_TARGET) cfg.target = process.env.BATOPIXEL_ARTNET_TARGET;  // 測試用
if (process.env.BATOPIXEL_ARTNET_PORT) cfg.port = Number(process.env.BATOPIXEL_ARTNET_PORT);

const W = cfg.layout.width, H = cfg.layout.height;
const NPIX = cfg.pixels;                        // 實體像素數（256）
const S = cfg.scale;                            // 邏輯→實體放大倍率（2）
const SW = W / S, SH = H / S;                   // 邏輯畫面尺寸（8×8）
const PPU = cfg.pixelsPerUniverse;              // 每 universe 像素數（170，已實測）
// 起始位址偏移：控制器認定「面板第 0 顆」對應 universe 0 的第 POFF 顆（channel POFF×3＋1）。
// 實測 2026-09-02：pixel 0 不亮、fill 0 只亮 88 顆 → 控制器有 DMX 式起始位址，面板從 u0 中段開始，
// 其餘延續到 u1。實體像素 n 的全域索引 g＝n＋POFF，universe＝⌊g/PPU⌋、offset＝g mod PPU。
let POFF = cfg.pixelOffset | 0;
let NUNI = Math.ceil((NPIX + POFF) / PPU);      // universe 數（偏移後仍為 2）
const ORDER = { RGB:[0,1,2], GRB:[1,0,2], BRG:[2,0,1], RBG:[0,2,1], GBR:[1,2,0], BGR:[2,1,0] };
let ord = ORDER[cfg.colorOrder] || ORDER.RGB;

// ───────────────────────── 燈序映射 ─────────────────────────
// 內部表示一律是查找表 map[邏輯索引] = 實體像素索引（-1 ＝ 不對應任何 LED）。
// origin／axis／serpentine 只是「產生查找表」的便利函式；config.map 非 null 時直接覆寫，
// 用來表達控制器位址空間有間隙、分段等參數描述不了的情況。
function buildMap(layout) {
  const m = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let px = layout.origin.includes("right")  ? W - 1 - x : x;
    let py = layout.origin.includes("bottom") ? H - 1 - y : y;
    let major, minor, minorLen;
    if (layout.axis === "column") { major = px; minor = py; minorLen = H; }
    else                          { major = py; minor = px; minorLen = W; }
    if (layout.serpentine && (major & 1)) minor = minorLen - 1 - minor;
    m[y * W + x] = major * minorLen + minor;
  }
  return m;
}
let map = (Array.isArray(cfg.map) && cfg.map.length === W * H)
  ? Int16Array.from(cfg.map) : buildMap(cfg.layout);

// ───────────────────────── ArtDMX 封包 ─────────────────────────
// 標頭 18 bytes，同一封包混用兩種位元組序（最常見的實作錯誤來源）：
//   OpCode 小端序、ProtVer 與 Length 大端序。
let seq = new Uint8Array(NUNI).fill(1);
// ───────────────────────── 亮度與電流上限 ─────────────────────────
// brightness：只套在「瀏覽器畫面 → 燈板」路徑（預覽畫面不受影響；測試指令送的是原值）。
// maxCurrentMa：每次送出前估算整面電流（每個 channel 255 ≈ maPerLed/3，另加每顆待機電流），
// 超過上限就把這一包等比例壓低。套在送出層，所以 fill／raw／marks 測試也受保護；
// 只縮放送出的封包、不動 uniBuf，保持模式 10Hz 重送才不會層層遞減。
const bri      = () => Math.min(1, Math.max(0, Number(cfg.brightness ?? 1) || 0));
const maxMa    = () => Number(cfg.maxCurrentMa) || 0;               // 0＝不設上限
const maPerLed = () => Number(cfg.maPerLed) || 60;                  // WS2812 全白約 60mA
const idleMa   = () => Number(cfg.idleMaPerLed ?? 1);               // 全暗時每顆仍約 1mA
let powerScale = 1;
function estimateMa(lens) {
  let sum = 0;
  for (let u = 0; u < NUNI; u++) {
    const b = uniBuf[u], n = lens ? lens[u] : uniLen(u);
    for (let i = 0; i < n; i++) sum += b[i];
  }
  return sum / 255 * (maPerLed() / 3) + NPIX * idleMa();
}
function artdmx(u, data, len) {
  const buf = Buffer.alloc(18 + len);            // alloc 已補零，"Art-Net" 後的 0x00 結尾自然成立
  buf.write("Art-Net", 0, "latin1");
  buf.writeUInt16LE(0x5000, 8);                  // OpCode（小端序 → 實際位元組 00 50）
  buf.writeUInt16BE(14, 10);                     // ProtVer（大端序 → 00 0E）
  // Sequence：規格定義 0＝停用序號檢查。預設用 0——「保持重送」與「橋重啟從 1 重數」都可能被
  // 有做序號檢查的控制器當成舊封包丟掉（2026-09-02 重啟後七色標記全暗的嫌犯）。要遞增就設 config.sequence=true。
  if (cfg.sequence) { buf[12] = seq[u]; seq[u] = seq[u] >= 255 ? 1 : seq[u] + 1; } else buf[12] = 0;
  buf[13] = 0;                                   // Physical，僅供參考
  const addr = cfg.startUniverse + u;            // 15-bit：Net(7) : SubUni(8)
  buf[14] = addr & 0xff;                         // SubUni（wire value，非軟體 UI 顯示的 1 起算編號）
  buf[15] = cfg.net & 0x7f;                      // Net
  buf.writeUInt16BE(len, 16);                    // Length（大端序，偶數）
  if (powerScale < 1) { for (let i = 0; i < len; i++) buf[18 + i] = (data[i] * powerScale + 0.5) | 0; }
  else data.copy(buf, 18, 0, len);
  return buf;
}
// universe u 要送的 channel 數＝該 universe 內「最後一顆用到的 offset」＋1 再 ×3（DMX 資料只能從 channel 1 起算，
// 偏移前的 channel 補 0 一起送）。POFF=0 → 510／258；POFF=82 → 510／504。
const uniLen = (u) => {
  if (cfg.padTo512) return 512;
  const lastGlobal = Math.min((u + 1) * PPU, POFF + NPIX) - 1;
  return (lastGlobal - u * PPU + 1) * 3;
};
const sock = dgram.createSocket("udp4");
// 先綁定再開廣播旗標：target 若是 x.x.x.255 這種廣播位址，沒開會 EACCES。
// 廣播的附帶好處：同一台電腦上的 Art-Net Monitor 也收得到我們的封包，可直接比對。
sock.bind(0, "0.0.0.0", () => { try { sock.setBroadcast(true); } catch (_) {} });
let uniBuf = Array.from({ length: NUNI }, () => Buffer.alloc(512));
function applyOffset(newOff) {            // 執行期改 pixelOffset 時重算 universe 數與緩衝
  POFF = newOff | 0;
  NUNI = Math.ceil((NPIX + POFF) / PPU);
  uniBuf = Array.from({ length: NUNI }, () => Buffer.alloc(512));
  seq = new Uint8Array(NUNI).fill(1);
}
const stats = { sent: 0, dropped: 0, fpsWindow: 0, fps: 0, maRaw: 0, maOut: 0, capped: 0 };

function sendUniverses(lens) {   // 送出 uniBuf 目前內容；lens[u] 覆寫長度（fill 測試用）
  const ma = estimateMa(lens), cap = maxMa(), idle = NPIX * idleMa();
  powerScale = (cap > 0 && ma > cap) ? Math.max(0, (cap - idle) / (ma - idle)) : 1;
  stats.maRaw = Math.round(ma); stats.maOut = Math.round(powerScale < 1 ? cap : ma);
  if (powerScale < 1) stats.capped++;
  for (let u = 0; u < NUNI; u++)
    sock.send(artdmx(u, uniBuf[u], lens ? lens[u] : uniLen(u)), cfg.port, cfg.target);
  stats.sent++; stats.fpsWindow++;
}
// 實體像素陣列（RGB 邏輯色）→ 各 universe 的 DMX 資料（套用顏色順序）
function physToUniverses(phys) {
  for (const b of uniBuf) b.fill(0);
  for (let n = 0; n < NPIX; n++) {
    const g = n + POFF, u = (g / PPU) | 0, d = (g - u * PPU) * 3, s = n * 3;
    if (u >= NUNI) break;
    const buf = uniBuf[u];
    buf[d] = phys[s + ord[0]]; buf[d + 1] = phys[s + ord[1]]; buf[d + 2] = phys[s + ord[2]];
  }
}
// 瀏覽器送來的 8×8 邏輯畫面 → 放大 → 查找表 → 實體像素陣列
const phys = new Uint8Array(NPIX * 3);
function frameToPhys(fb) {
  phys.fill(0);
  const k = bri();
  for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++) {
    const pi = map[ly * W + lx];
    if (pi < 0 || pi >= NPIX) continue;          // 未映射的邏輯像素不寫入任何 channel
    const s = (((ly / S) | 0) * SW + ((lx / S) | 0)) * 3, d = pi * 3;
    phys[d] = (fb[s] * k + 0.5) | 0; phys[d + 1] = (fb[s + 1] * k + 0.5) | 0; phys[d + 2] = (fb[s + 2] * k + 0.5) | 0;
  }
  return phys;
}

// ───────────────────────── 節流與測試保持 ─────────────────────────
let lastSent = 0;
let hold = null;                 // 測試模式：{ kind, lens } ── 保持送出 uniBuf 內容，忽略瀏覽器畫面
let holdTimer = null, sweepTimer = null;

function onFrame(fb) {
  if (hold) { stats.dropped++; return; }
  if (fb.length !== SW * SH * 3) { stats.dropped++; return; }
  // 無漂移的累加式節流：放行後把基準往前推一個週期，而不是重設為 now。
  // 來源 60fps（16.7ms）配 25ms 週期，若用「距上次 ≥25ms」會變成每兩格放一格＝30fps；
  // 累加式則以「過、過、跳」落在真正的 40。閒置過久則重新對齊，避免積欠後爆量放行。
  const now = Date.now(), period = 1000 / cfg.fps;
  if (now - lastSent > period * 4) lastSent = now - period;
  if (now - lastSent < period) { stats.dropped++; return; }
  lastSent += period;
  physToUniverses(frameToPhys(fb));
  sendUniverses();
}
function startHold(kind, lens) {
  hold = { kind, lens: lens || null };
  clearInterval(holdTimer);
  sendUniverses(hold.lens);
  holdTimer = setInterval(() => sendUniverses(hold.lens), 100);   // 10Hz 重送，讓控制器維持畫面
}
function stopHold() {
  clearInterval(holdTimer); clearInterval(sweepTimer);
  holdTimer = sweepTimer = null; hold = null;
}
function blackout() {
  stopHold();
  for (const b of uniBuf) b.fill(0);
  sendUniverses();
}

// ───────────────────────── 測試指令（映射判定用） ─────────────────────────
function onCommand(text, socket) {
  let c; try { c = JSON.parse(text); } catch (_) { return; }
  switch (c.type) {
    case "raw": {                 // 繞過所有映射，直接寫指定 universe 的指定 channel（1 起算）
      for (const b of uniBuf) b.fill(0);
      const u = c.universe | 0;
      if (u >= 0 && u < NUNI && Array.isArray(c.values)) {
        const start = Math.max(1, c.channel | 0) - 1;
        c.values.forEach((v, i) => { if (start + i < 512) uniBuf[u][start + i] = v & 0xff; });
      }
      startHold("raw " + JSON.stringify([c.universe, c.channel, c.values]),
                Array.from({ length: NUNI }, () => 512));   // 探測用一律送滿 512
      break;
    }
    case "marks": {               // 多個 universe 的指定 offset 同時點不同顏色，一次看出區塊大小與位址間隙
      for (const b of uniBuf) b.fill(0);
      for (const m of (Array.isArray(c.marks) ? c.marks : [])) {
        const u = m.u | 0, o = m.o | 0, rgb = Array.isArray(m.rgb) ? m.rgb : [40, 0, 0];
        if (u < 0 || u >= NUNI || o < 0 || o >= 170) continue;
        const d = o * 3;                          // 套顏色順序，讓「紅」看起來真的是紅
        uniBuf[u][d] = rgb[ord[0]]; uniBuf[u][d + 1] = rgb[ord[1]]; uniBuf[u][d + 2] = rgb[ord[2]];
      }
      startHold("marks x" + (c.marks ? c.marks.length : 0), Array.from({ length: NUNI }, () => 512));
      break;
    }
    case "pixel": {               // 點亮指定「實體像素索引」，套顏色順序、不套燈序映射
      const p = new Uint8Array(NPIX * 3);
      const i = c.index | 0, rgb = Array.isArray(c.rgb) ? c.rgb : [40, 0, 0];
      if (i >= 0 && i < NPIX) { p[i * 3] = rgb[0]; p[i * 3 + 1] = rgb[1]; p[i * 3 + 2] = rgb[2]; }
      physToUniverses(p);
      startHold("pixel " + i);
      break;
    }
    case "fill": {                // 指定 universe 全部 512 channel 填同值，數亮幾顆
      for (const b of uniBuf) b.fill(0);
      const u = c.universe | 0, v = (c.value == null ? 30 : c.value) & 0xff;
      const lens = Array.from({ length: NUNI }, (_, k) => k === u ? 512 : uniLen(k));
      if (u >= 0 && u < NUNI) uniBuf[u].fill(v);
      startHold("fill u" + u + "=" + v, lens);
      break;
    }
    case "sweep": {               // 逐顆點亮，看整體走線路徑與位址間隙
      const from = c.from | 0, to = c.to == null ? NPIX - 1 : c.to | 0, iv = c.interval || 500;
      const rgb = Array.isArray(c.rgb) ? c.rgb : [40, 0, 0];
      let i = from;
      stopHold();
      const step = () => {
        const p = new Uint8Array(NPIX * 3);
        if (i >= 0 && i < NPIX) { p[i * 3] = rgb[0]; p[i * 3 + 1] = rgb[1]; p[i * 3 + 2] = rgb[2]; }
        physToUniverses(p);
        hold = { kind: "sweep " + i + "/" + to, lens: null };
        sendUniverses();
        console.log("sweep → 實體像素", i);
        broadcast({ type: "sweep", index: i });
        if (i >= to) { clearInterval(sweepTimer); sweepTimer = null; return; }
        i++;
      };
      step();
      sweepTimer = setInterval(step, iv);
      break;
    }
    case "blackout": blackout(); break;
    case "config": {              // 執行期覆寫設定（映射測試時免重啟）
      delete c.type;
      const layoutPatch = c.layout; delete c.layout;
      Object.assign(cfg, c);
      if (layoutPatch) Object.assign(cfg.layout, layoutPatch);
      if ("pixelOffset" in c) applyOffset(c.pixelOffset);
      ord = ORDER[cfg.colorOrder] || ord;
      map = (Array.isArray(cfg.map) && cfg.map.length === W * H) ? Int16Array.from(cfg.map) : buildMap(cfg.layout);
      console.log("config 已更新：", JSON.stringify(c), layoutPatch ? JSON.stringify(layoutPatch) : "");
      break;
    }
    case "status": sendStatus(socket); break;
  }
}

// ───────────────────────── 最小 WebSocket 伺服器（RFC 6455） ─────────────────────────
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set();
const httpSrv = http.createServer((req, res) => {   // 純 HTTP 探測：GET / 回服務資訊
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, service: "batopixel-artnet-bridge", target: cfg.target, universes: NUNI }));
});
httpSrv.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
               "Sec-WebSocket-Accept: " + accept + "\r\n\r\n");
  clients.add(socket);
  console.log("瀏覽器已連線（" + clients.size + "）");
  let acc = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    acc = Buffer.concat([acc, chunk]);
    for (;;) {
      const f = parseFrame(acc);
      if (!f) break;
      acc = acc.subarray(f.total);
      if (f.op === 0x8) { socket.end(); break; }
      if (f.op === 0x9) { socket.write(encodeFrame(0xA, f.payload)); continue; }
      if (f.op === 0x2) onFrame(f.payload);
      else if (f.op === 0x1) onCommand(f.payload.toString("utf8"), socket);
    }
  });
  const bye = () => { if (clients.delete(socket)) console.log("瀏覽器已離線（" + clients.size + "）"); };
  socket.on("close", bye); socket.on("error", bye);
});
function parseFrame(buf) {   // 客戶端→伺服器一律帶遮罩；不處理分片（本用途封包皆為單幀）
  if (buf.length < 2) return null;
  const op = buf[0] & 0x0f, masked = buf[1] & 0x80;
  let len = buf[1] & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  const mlen = masked ? 4 : 0;
  if (buf.length < off + mlen + len) return null;
  let payload = buf.subarray(off + mlen, off + mlen + len);
  if (masked) {
    const m = buf.subarray(off, off + 4), out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3];
    payload = out;
  }
  return { op, payload, total: off + mlen + len };
}
function encodeFrame(op, payload) {   // 伺服器→客戶端不遮罩
  const len = payload.length; let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
function broadcast(obj) {
  const f = encodeFrame(0x1, Buffer.from(JSON.stringify(obj)));
  for (const c of clients) { try { c.write(f); } catch (_) {} }
}
function sendStatus(socket) {
  const s = { type: "status", target: cfg.target + ":" + cfg.port, universes: NUNI,
              sent: stats.sent, dropped: stats.dropped, fps: stats.fps,
              test: hold ? hold.kind : null, map: Array.isArray(cfg.map) ? "table" : "layout",
              brightness: bri(), ma: stats.maOut, maRaw: stats.maRaw, maxMa: maxMa(), capped: stats.capped };
  const f = encodeFrame(0x1, Buffer.from(JSON.stringify(s)));
  if (socket) { try { socket.write(f); } catch (_) {} }
  else for (const c of clients) { try { c.write(f); } catch (_) {} }
}
setInterval(() => { stats.fps = stats.fpsWindow; stats.fpsWindow = 0; if (clients.size) sendStatus(); }, 1000);

// ───────────────────────── 啟動 ─────────────────────────
httpSrv.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error("埠 " + WS_PORT + " 已被占用——是否已有另一個橋在跑？（工作列找最小化的視窗，或改 config.json 的 wsPort）");
  } else console.error("橋啟動失敗：", e.message);
  process.exit(1);
});
sock.on("error", (e) => console.error("UDP 錯誤：", e.message));
const WS_PORT = Number(process.env.BATOPIXEL_BRIDGE_WS) || cfg.wsPort;   // 測試用可改埠
httpSrv.listen(WS_PORT, "127.0.0.1", () => {
  console.log("BatoPixel Art-Net 橋");
  console.log("  瀏覽器接入  ws://127.0.0.1:" + WS_PORT + "   （必須寫 127.0.0.1，Chrome 不把 localhost 當 loopback）");
  console.log("  Art-Net 目標 " + cfg.target + ":" + cfg.port + "  universe " + cfg.startUniverse + "-" +
              (cfg.startUniverse + NUNI - 1) + "，Length " + Array.from({ length: NUNI }, (_, u) => uniLen(u)).join("/"));
  console.log("  亮度 " + Math.round(bri() * 100) + "%  電流上限 " + (maxMa() ? (maxMa() / 1000).toFixed(1) + " A" : "無") + "  （config brightness=／maxCurrentMa= 可即時改）");
  console.log("  起始位址偏移 pixelOffset=" + POFF + "（面板第 0 顆＝u0 第 " + POFF + " 顆，channel " + (POFF * 3 + 1) + "）");
  console.log("  畫面 " + SW + "x" + SH + " → x" + S + " → " + W + "x" + H + "，" + NPIX + " 顆，顏色順序 " + cfg.colorOrder +
              "，節流 " + cfg.fps + " fps，映射來源 " + (Array.isArray(cfg.map) ? "查找表" : "layout 參數"));
  console.log("  測試指令：node cmd.js pixel|raw|fill|sweep|blackout|status");
});
process.on("SIGINT", () => { blackout(); setTimeout(() => process.exit(0), 150); });
