// 請求的把關：誰送來的請求編譯站才收。
// 離線版／開發版：編譯站只給這台電腦上的工具頁用。
//   Host：只收對著 localhost／127.0.0.1（加自己的連接埠）送來的請求。別的網域名稱被指到 127.0.0.1（DNS rebinding）時，
//         瀏覽器送來的 Host 是那個網域，在這裡擋掉。
//   Origin：會改東西或花力氣的請求（GET、HEAD 以外）只收工具頁自己送的。學員開著編譯站時逛到別的網站，
//         那個網站可以不經同意就對 localhost 送 POST（瀏覽器只是不讓它讀回應），所以要看是誰送的。
//         沒帶 Origin 的（測試程式、命令列工具）照收：瀏覽器跨站送 POST 一定會帶。
// 雲端版：編譯站放在網路上給整班共用，多兩件事。
//   對外的網址（BATOPIXEL_ORIGINS，例如 https://class.bato.tw）：對著它送來的請求也收，Host、Origin 的規則一樣。
//   課堂代碼（BATOPIXEL_CLASS_CODE）：GET、HEAD 以外的請求（編譯、匯出、匯入）要在 X-Babit-Code 帶對代碼，不然回 401。
//         看頁面、看官方範例不用代碼。網址誰都連得到，代碼擋掉不是這堂課的人來用這台主機編譯。
const crypto = require("crypto");

// 讀 BATOPIXEL_ORIGINS：逗號分開的網址，每個只能是「http(s)://網域[:連接埠]」。
// 回 { origins, hosts }：瀏覽器送來的 Origin、Host 會長的樣子（小寫、預設的連接埠不寫）。
// 寫錯就丟錯誤（編譯站啟動時就停下來）：設定錯了要在開機時發現，不是上課連不上才發現
function parseOrigins(text) {
  const origins = new Set(), hosts = new Set();
  const list = String(text || "").trim();
  if (!list) return { origins, hosts };
  for (const raw of list.split(",")) {
    const item = raw.trim();
    let u = null;
    try { u = new URL(item); } catch (_) {}
    const plain = u && (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password &&
                  u.pathname === "/" && !u.search && !u.hash && !item.includes("*") && !/[?#]/.test(item);
    if (!plain) throw new Error(`BATOPIXEL_ORIGINS 的「${item}」看不懂：每個網址要寫成 https://網域（可加 :連接埠），不能有路徑，多個用逗號分開`);
    origins.add(u.origin);
    hosts.add(u.host);
  }
  return { origins, hosts };
}

// 兩個字串是不是一樣。比的時間不隨「前面幾個字對了」而變（先各自雜湊成一樣長）
function sameText(a, b) {
  const h = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

// 回一個檢查函式：check(req) → null（收）或 { status, error, needCode? }（不收，照這個回）
function createGate({ port, origins = "", classCode = "" }) {
  const pub = parseOrigins(origins);
  const selfHosts = ["localhost", "127.0.0.1", "[::1]"].map((h) => h + ":" + port);
  const hosts = new Set(selfHosts.concat([...pub.hosts]));
  const okOrigins = new Set(selfHosts.map((h) => "http://" + h).concat([...pub.origins]));
  const local = pub.hosts.size === 0;
  const code = String(classCode || "");
  return function check(req) {
    const h = req.headers || {};
    if (!hosts.has(String(h.host || "").toLowerCase())) return { status: 403, error: local ? "這個編譯站只收對著 localhost 送來的請求" : "這個編譯站不收對著這個網址送來的請求" };
    if (req.method === "GET" || req.method === "HEAD") return null;
    const origin = h.origin, site = h["sec-fetch-site"];
    if (origin !== undefined && !okOrigins.has(String(origin).toLowerCase())) return { status: 403, error: "這個編譯站只收工具頁自己送來的請求" };
    if (site !== undefined && site !== "same-origin" && site !== "none") return { status: 403, error: "這個編譯站只收工具頁自己送來的請求" };
    if (code) {
      // 標頭只能放 Latin-1 的字：工具頁把代碼用 encodeURIComponent 編過才送
      let got = null;
      try { got = decodeURIComponent(String(h["x-babit-code"] === undefined ? "" : h["x-babit-code"])); } catch (_) {}
      if (got === null || !sameText(got, code)) return { status: 401, needCode: true, error: got ? "課堂代碼不對，請再輸入一次" : "請輸入課堂代碼（老師會公布）" };
    }
    return null;
  };
}

// 是誰送的（工具頁在 X-Babit-Client 帶一個隨機代號）：排隊時每個人各排各的（fw_queue.js）。
// 只收英數字、底線、連字號，最多 40 個字；沒帶或格式不對回空字串（全部算同一個人）
function clientOf(req) {
  const v = (req.headers || {})["x-babit-client"];
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : "";
}

module.exports = { parseOrigins, createGate, clientOf };
