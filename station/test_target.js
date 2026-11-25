// 「現在是哪個部署目標、哪一版」的單元測試（不用開編譯站）：node station/test_target.js
// 三個目標：開發版（147 的 repo）、離線版（學員電腦，發佈時寫的 version.json）、雲端版（整班共用的主機）。
// 工具頁的角落會顯示這個結果，所以不能認錯：版本檔優先、沒有版本檔才問 git、亂寫的內容不能原樣放出去。
const fs = require("fs"), os = require("os"), path = require("path");
const { LABELS, resolveTarget, resolveVersion, gitInfo } = require("./target.js");

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? "  ok   " : "  FAIL ") + msg); };
const show = (v) => JSON.stringify(v);
const GIT = { commit: "a2f1d46c0ffee0123456789abcdef0123456789a", dirty: true, date: "2026-11-20" };

(async () => {
  console.log("── 開發的 repo（沒有版本檔）：問 git");
  {
    let asked = 0;
    const v = await resolveVersion({ file: null, envTarget: "", git: async () => { asked++; return GIT; } });
    say(v.target === "dev" && v.label === "開發版", "目標是開發版：" + show(v));
    say(v.source === "a2f1d46" && v.dirty === true && v.date === "2026-11-20" && asked === 1, "版本＝commit 的前 7 碼，還有「有沒有還沒 commit 的修改」與日期");
    const clean = await resolveVersion({ file: null, envTarget: undefined, git: async () => Object.assign({}, GIT, { dirty: false }) });
    say(clean.dirty === false, "工作目錄乾淨時 dirty 是 false");
  }

  console.log("── 離線版（發佈時寫的 version.json）：照版本檔，不問 git");
  {
    let asked = 0;
    const v = await resolveVersion({ file: '{"target":"offline","source":"6be6fdc","date":"2026-11-20"}\n', envTarget: "", git: async () => { asked++; return GIT; } });
    say(v.target === "offline" && v.label === "離線版" && v.source === "6be6fdc" && v.date === "2026-11-20", "目標、版本、日期照版本檔：" + show(v));
    say(v.dirty === false && asked === 0, "發佈出去的就是那個 commit：dirty 是 false，也沒有去問 git（學員的安裝資料夾也是 git repo，問了會拿到公開 repo 的 commit）");
  }

  console.log("── 雲端版");
  {
    let v = await resolveVersion({ file: '{"target":"cloud","source":"0123abc","date":"2026-11-29"}', envTarget: "", git: async () => GIT });
    say(v.target === "cloud" && v.label === "雲端版" && v.source === "0123abc", "映像裡的版本檔寫 cloud：" + show(v));
    v = await resolveVersion({ file: null, envTarget: "cloud", git: async () => GIT });
    say(v.target === "cloud" && v.label === "雲端版" && v.source === "a2f1d46" && v.dirty === true, "開發的 repo 用環境變數開成雲端模式（測試用）：目標是雲端版，版本還是問 git");
    v = await resolveVersion({ file: '{"target":"offline","source":"6be6fdc","date":"2026-11-20"}', envTarget: "cloud", git: async () => GIT });
    say(v.target === "cloud" && v.source === "6be6fdc", "環境變數蓋過版本檔的目標，版本照版本檔");
  }

  console.log("── 認不得的內容不能原樣放出去（工具頁會顯示這些字）");
  {
    for (const [what, file] of [["不是 JSON", "<html>"], ["是陣列", "[1,2]"], ["是 null", "null"], ["空的", ""]]) {
      const v = await resolveVersion({ file, envTarget: "", git: async () => GIT });
      say(v.target === "dev" && v.source === "a2f1d46", `版本檔${what}：當成沒有版本檔（開發版，問 git）`);
    }
    let v = await resolveVersion({ file: '{"target":"prod","source":"6be6fdc","date":"2026-11-20"}', envTarget: "", git: async () => GIT });
    say(v.target === "dev" && v.label === "開發版" && v.source === "a2f1d46", "版本檔的目標不是三個之一：當成沒有版本檔：" + show(v));
    v = await resolveVersion({ file: '{"target":"offline","source":"<b>x</b>","date":"昨天"}', envTarget: "", git: async () => GIT });
    say(v.target === "offline" && v.source === null && v.date === null, "版本、日期的格式不對：留空，不照抄：" + show(v));
    v = await resolveVersion({ file: '{"target":"offline","source":1234567,"date":20261120}', envTarget: "", git: async () => GIT });
    say(v.source === null && v.date === null, "版本、日期不是字串：留空");
    v = await resolveVersion({ file: null, envTarget: "prod", git: async () => GIT });
    say(v.target === "dev", "環境變數不是三個之一：不理它");
    v = await resolveVersion({ file: null, envTarget: "", git: async () => null });
    say(v.target === "dev" && v.source === null && v.dirty === null && v.date === null, "問不到 git（沒裝、不是 repo）：版本留空，照樣回目標：" + show(v));
    v = await resolveVersion({ file: null, envTarget: "", git: async () => { throw new Error("git 壞了"); } });
    say(v.target === "dev" && v.source === null, "問 git 出錯：一樣留空，不會讓編譯站出錯");
    v = await resolveVersion({ file: null, envTarget: "", git: async () => ({ commit: "not-a-hash", dirty: "yes", date: "x" }) });
    say(v.source === null && v.dirty === null && v.date === null, "git 回的東西格式不對：留空");
  }
  say(Object.keys(LABELS).sort().join() === "cloud,dev,offline", "三個目標的名稱：" + show(LABELS));

  console.log("── 編譯站啟動時就要知道目標（不問 git）：跟 /version 回的一樣");
  {
    const cases = [[null, ""], [null, "cloud"], [null, "prod"], ['{"target":"offline","source":"6be6fdc","date":"2026-11-20"}', ""],
                   ['{"target":"offline","source":"6be6fdc","date":"2026-11-20"}', "cloud"], ['{"target":"cloud"}', undefined], ["<html>", ""], ['{"target":"prod"}', "offline"]];
    const got = [];
    for (const [file, envTarget] of cases) {
      const quick = resolveTarget({ file, envTarget }), full = (await resolveVersion({ file, envTarget, git: async () => GIT })).target;
      got.push(quick + (quick === full ? "" : "≠" + full));
    }
    say(got.join() === "dev,cloud,dev,offline,cloud,cloud,dev,offline", "八種組合：" + got.join("、"));
  }

  console.log("── 真的去問 git");
  {
    const here = await gitInfo(path.join(__dirname, ".."));
    say(!!here && /^[0-9a-f]{40}$/.test(here.commit) && typeof here.dirty === "boolean" && /^\d{4}-\d{2}-\d{2}$/.test(here.date),
        "這個 repo：" + show(here));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "babit_target_"));
    try { say((await gitInfo(dir)) === null, "不是 repo 的資料夾：回 null"); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  console.log(bad ? "\n" + bad + " 項不符 → FAIL" : "\n全部通過 → PASS");
  process.exitCode = bad ? 1 : 0;
})();
