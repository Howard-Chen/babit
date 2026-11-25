// 請求把關的單元測試（不用開編譯站）：node station/test_gate.js
// 把關＝誰送來的請求編譯站才收（gate.js）。離線版只收這台電腦上的工具頁；雲端版另外收「對外的網址」，
// 而且會花力氣的請求要帶課堂代碼。整合起來的行為（真的開編譯站）在 test_security.js 與 test_cloud.js。
const { parseOrigins, createGate, clientOf } = require("./gate.js");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const req = (method, headers) => ({ method, headers: Object.assign({}, headers) });
const thrown = (fn) => { try { fn(); return ""; } catch (e) { return e.message; } };

console.log("── 對外的網址（BATOPIXEL_ORIGINS）怎麼讀");
{
  let o = parseOrigins("");
  say(o.origins.size === 0 && o.hosts.size === 0, "沒設定：沒有對外的網址");
  o = parseOrigins(" https://class.bato.tw , http://Lab.Example:8080/ ");
  say([...o.origins].join() === "https://class.bato.tw,http://lab.example:8080" && [...o.hosts].join() === "class.bato.tw,lab.example:8080",
      "逗號分開、前後空白與結尾的 / 不影響、大小寫不分：" + [...o.origins].join("、"));
  o = parseOrigins("https://class.bato.tw:443");
  say([...o.origins].join() === "https://class.bato.tw" && [...o.hosts].join() === "class.bato.tw", "寫了預設的連接埠（443）：跟瀏覽器送來的一樣是不帶連接埠的");
  for (const [what, text] of [["沒寫 https://", "class.bato.tw"], ["帶路徑", "https://class.bato.tw/tool"], ["帶參數", "https://class.bato.tw/?a=1"],
                              ["不是網頁的協定", "ftp://class.bato.tw"], ["帶帳號", "https://a:b@class.bato.tw"], ["萬用字元", "https://*.bato.tw"], ["中間空的", "https://a.example,,https://b.example"]]) {
    const why = thrown(() => parseOrigins(text));
    say(/BATOPIXEL_ORIGINS/.test(why), `${what}（${text}）：不猜，直接報錯「${why.split("\n")[0]}」`);
  }
}

console.log("── 離線版／開發版：只收這台電腦上的工具頁（跟原本一樣）");
{
  const gate = createGate({ port: 8930 });
  const ok = (r) => gate(r) === null, no = (r, status) => { const g = gate(r); return !!g && g.status === status && !!g.error; };
  say(ok(req("GET", { host: "localhost:8930" })) && ok(req("GET", { host: "127.0.0.1:8930" })) && ok(req("GET", { host: "[::1]:8930" })), "Host 是 localhost／127.0.0.1／[::1] 加自己的連接埠：收");
  say(ok(req("GET", { host: "LOCALHOST:8930" })), "Host 大小寫不分");
  say(no(req("GET", { host: "evil.example" }), 403) && no(req("GET", { host: "localhost:8931" }), 403) && no(req("GET", { host: "localhost" }), 403) && no(req("GET", {}), 403),
      "別的網域、別的連接埠、沒帶連接埠、沒有 Host：403");
  say(ok(req("POST", { host: "localhost:8930" })), "沒帶 Origin 的 POST（測試程式、命令列工具）：收");
  say(ok(req("POST", { host: "localhost:8930", origin: "http://localhost:8930", "sec-fetch-site": "same-origin" })), "工具頁自己送的 POST：收");
  say(no(req("POST", { host: "localhost:8930", origin: "https://evil.example" }), 403) && no(req("POST", { host: "localhost:8930", origin: "null" }), 403), "Origin 是別的網站、或是 null（沙箱裡的頁面）：403");
  say(no(req("POST", { host: "localhost:8930", "sec-fetch-site": "cross-site" }), 403) && no(req("PUT", { host: "localhost:8930", "sec-fetch-site": "same-site" }), 403), "Sec-Fetch-Site 不是 same-origin／none：403");
  say(ok(req("POST", { host: "localhost:8930", "sec-fetch-site": "none" })), "Sec-Fetch-Site 是 none：收");
  say(ok(req("GET", { host: "localhost:8930", origin: "https://evil.example" })) && ok(req("HEAD", { host: "localhost:8930", "sec-fetch-site": "cross-site" })), "GET／HEAD 不看 Origin（別的網站讀不到回應）");
  say(no(req("GET", { host: "class.bato.tw" }), 403), "沒設定對外的網址：不收那個 Host");
  say(ok(req("POST", { host: "localhost:8930", "x-babit-code": "whatever" })), "沒設定課堂代碼：帶不帶都收");
}

console.log("── 雲端版：另外收對外的網址");
{
  const gate = createGate({ port: 8930, origins: "https://class.bato.tw", classCode: "" });
  const ok = (r) => gate(r) === null, no = (r, status) => { const g = gate(r); return !!g && g.status === status; };
  say(ok(req("GET", { host: "class.bato.tw" })) && ok(req("POST", { host: "class.bato.tw", origin: "https://class.bato.tw", "sec-fetch-site": "same-origin" })), "對著對外網址送來的：收");
  say(ok(req("GET", { host: "localhost:8930" })), "主機自己（localhost）檢查用的請求：照收");
  say(no(req("POST", { host: "class.bato.tw", origin: "http://class.bato.tw" }), 403), "Origin 是 http 的同一個網域（不是設定的 https）：403");
  say(no(req("POST", { host: "class.bato.tw", origin: "https://evil.example" }), 403) && no(req("GET", { host: "evil.example" }), 403), "別的網站、別的網域：403");
  say(no(req("GET", { host: "class.bato.tw:8930" }), 403), "對外的網域加上編譯站的連接埠：403（設定的網址沒有連接埠）");
}

console.log("── 課堂代碼：會花力氣的請求（GET／HEAD 以外）要帶對");
{
  const gate = createGate({ port: 8930, origins: "https://class.bato.tw", classCode: "夏天abc123" });
  const base = { host: "class.bato.tw", origin: "https://class.bato.tw" };
  const g = (extra, method = "POST") => gate(req(method, Object.assign({}, base, extra)));
  // 標頭的值只能是 Latin-1：工具頁把代碼用 encodeURIComponent 編過再放進標頭
  say(g({ "x-babit-code": encodeURIComponent("夏天abc123") }) === null, "帶對代碼：收");
  for (const [what, extra] of [["沒帶", {}], ["帶錯", { "x-babit-code": "abc123" }], ["空的", { "x-babit-code": "" }], ["多了空白", { "x-babit-code": encodeURIComponent("夏天abc123 ") }],
                               ["編碼壞掉", { "x-babit-code": "%E5%A4" }]]) {
    const r = g(extra);
    say(!!r && r.status === 401 && r.needCode === true && !!r.error, `${what}：401，回應註明要代碼「${r && r.error}」`);
  }
  say(g({}, "GET") === null && g({}, "HEAD") === null, "看頁面、看範例（GET／HEAD）：不用代碼");
  say(g({ "x-babit-code": encodeURIComponent("夏天abc123") }, "PUT") === null && !!g({}, "DELETE"), "PUT／DELETE 也要代碼");
  const r = gate(req("POST", { host: "class.bato.tw", origin: "https://evil.example", "x-babit-code": encodeURIComponent("夏天abc123") }));
  say(!!r && r.status === 403, "別的網站就算帶對代碼也不收（403，先看是誰送的）");
  const local = createGate({ port: 8930, classCode: "abc123" });
  say(!!local(req("POST", { host: "localhost:8930" })) && local(req("POST", { host: "localhost:8930", "x-babit-code": "abc123" })) === null, "從主機自己送的也一樣要代碼");
}

console.log("── 是誰送的（X-Babit-Client）：排隊時每個人各排各的");
{
  say(clientOf(req("POST", { "x-babit-client": "k3J9_abc-XYZ" })) === "k3J9_abc-XYZ", "英數字、底線、連字號：照用");
  say(clientOf(req("POST", {})) === "" && clientOf(req("POST", { "x-babit-client": "" })) === "", "沒帶：空字串（全部算同一個人）");
  say(clientOf(req("POST", { "x-babit-client": "怪 代號<>" })) === "" && clientOf(req("POST", { "x-babit-client": "a b" })) === "" && clientOf(req("POST", { "x-babit-client": "x".repeat(41) })) === "",
      "格式不對（別的字元、太長）：當成沒帶");
  say(clientOf(req("POST", { "x-babit-client": ["a", "b"] })) === "", "不是字串：當成沒帶");
}

console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
process.exitCode = bad ? 1 : 0;
