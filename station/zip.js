// 最小的 zip 讀寫（零相依，只用 Node 內建的 zlib）：給「匯出 Arduino 資料夾」與「匯入 zip」用（arduino_export.js）。
// 寫：每個檔案用 deflate 壓，壓不小的原樣存；檔名用 UTF-8。
// 讀：照檔尾的中央目錄讀，所以「大小寫在資料後面」的 zip（macOS 壓縮程式、串流寫出的）也讀得到。
// 不支援：加密、ZIP64（超過 4 GB 或 65535 個檔）、deflate 以外的壓縮法——學員的作品 zip 不會用到。
const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// entries：[{ name: "資料夾/檔名", data: Buffer 或字串 }]，照順序寫。date 省略就用現在的時間
function zipWrite(entries, { date = new Date() } = {}) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = (Math.max(0, date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), "utf8");
    const packed = raw.length ? zlib.deflateRawSync(raw, { level: 9 }) : raw;
    const deflate = packed.length < raw.length;
    const body = deflate ? packed : raw;
    const crc = crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);                       // 解開需要的版本 2.0
    head.writeUInt16LE(0x0800, 6);                   // 檔名是 UTF-8
    head.writeUInt16LE(deflate ? 8 : 0, 8);
    head.writeUInt16LE(dosTime, 10);
    head.writeUInt16LE(dosDate, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE((3 << 8) | 20, 4);             // 由 Unix 製作：解開後才有正常的檔案權限
    head.copy(cen, 6, 4, 30);                        // 版本、旗標、壓縮法、時間、CRC、大小、檔名長度：跟本地標頭一樣
    cen.writeUInt16LE(0, 32);                        // 註解長度
    cen.writeUInt16LE(0, 34);                        // 起始磁碟
    cen.writeUInt16LE(0, 36);                        // 內部屬性
    cen.writeUInt32LE((e.name.endsWith("/") ? 0o40755 : 0o100644) * 65536, 38);
    cen.writeUInt32LE(offset, 42);
    locals.push(head, name, body);
    centrals.push(cen, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([cd, end]));
}

const bad = (why) => new Error("zip 檔讀不懂：" + why);

// 回傳檔案清單 [{ name, size, read() }]（不含資料夾項目）；read() 才真的解壓縮。
// maxEntries、maxEntrySize：擋掉塞了一大堆檔案、或解開後超大的 zip
function zipRead(buf, { maxEntries = 500, maxEntrySize = 4 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw bad("檔案太小或不是 zip");
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw bad("找不到目錄（不是 zip，或檔案不完整）");
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdOff === 0xffffffff) throw bad("不支援 ZIP64");
  if (cdOff + cdSize > eocd) throw bad("目錄位置不對（檔案不完整）");
  if (total > maxEntries) throw new Error("zip 裡的檔案太多（" + total + " 個）");
  const out = [];
  let p = cdOff;
  for (let n = 0; n < total; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== 0x02014b50) throw bad("目錄內容不完整");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    if (p + 46 + nlen > eocd) throw bad("目錄內容不完整");
    const nameBuf = buf.subarray(p + 46, p + 46 + nlen);
    let name = nameBuf.toString("utf8");
    if (!(flags & 0x0800) && name.includes("�")) name = nameBuf.toString("latin1");   // 沒標 UTF-8 又解不出來：照原位元組留著
    p += 46 + nlen + elen + clen;
    if (name.endsWith("/")) continue;
    out.push({
      name, size: usize,
      read() {
        if (flags & 1) throw bad("有密碼的 zip 不能匯入");
        if (csize === 0xffffffff || usize === 0xffffffff) throw bad("不支援 ZIP64");
        if (usize > maxEntrySize) throw new Error("zip 裡的「" + name + "」太大");
        if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) throw bad("檔案內容的位置不對");
        const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
        if (start + csize > buf.length) throw bad("檔案內容不完整");
        const data = buf.subarray(start, start + csize);
        // 目錄寫的大小是檔案自己說的，不能信：上限用實際的內容量再擋一次，大小對不上就當成損毀
        let raw;
        if (method === 0) {
          if (csize > maxEntrySize) throw new Error("zip 裡的「" + name + "」太大");
          raw = Buffer.from(data);
        } else if (method === 8) {
          try { raw = zlib.inflateRawSync(data, { maxOutputLength: maxEntrySize }); }
          catch (e) {
            if (e && e.code === "ERR_BUFFER_TOO_LARGE") throw new Error("zip 裡的「" + name + "」太大");
            throw bad("解壓縮失敗");
          }
        } else throw bad("不支援的壓縮方式");
        if (raw.length !== usize) throw bad("檔案大小不符（檔案損毀）");
        if (crc32(raw) !== crc) throw bad("內容檢查碼不符（檔案損毀）");
        return raw;
      },
    });
  }
  return out;
}

module.exports = { zipWrite, zipRead, crc32 };
