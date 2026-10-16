// S1 數值驗證：node test_node.js
// 預期：t=0 時 (0,0) 的 hue=(0+0)*20+0=0 → 純紅 255,0,0；t 改變畫面要跟著變。
const createBatoPixel = require("./web/batopixel.js");
createBatoPixel().then((m) => {
  const ptr = m._bp_framebuffer();
  const snap = (t) => { m._bp_tick(t); return Array.from(m.HEAPU8.subarray(ptr, ptr + 192)); };
  const a = snap(0.0);
  const b = snap(1.0);
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);
  const animated = a.some((v, i) => v !== b[i]);
  console.log("px(0,0) @t=0 :", a.slice(0, 3).join(","), "(expect 255,0,0)");
  console.log("px(7,7) @t=0 :", a.slice(189, 192).join(","));
  console.log("sum @t=0 =", sum(a), "; sum @t=1 =", sum(b), "; animated =", animated);
  const ok = sum(a) > 0 && animated && a[0] === 255 && a[1] === 0 && a[2] === 0;
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
});
