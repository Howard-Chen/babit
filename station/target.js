// 這份程式現在是哪一個部署目標、哪一版（編譯站的 GET /version，工具頁的角落顯示）。
// 三個目標，同一份程式碼：
//   dev      開發版：147 的 repo。沒有版本檔，版本＝git 的 commit（加上有沒有還沒 commit 的修改）
//   offline  離線版：學員電腦上的安裝資料夾。dev/publish.sh 發佈時寫 version.json
//   cloud    雲端版：整班共用的主機。cloud/build.sh 建映像時寫 version.json；
//            在開發的 repo 測雲端模式時用環境變數 BATOPIXEL_TARGET=cloud（版本照樣問 git）
// 版本檔（repo 根目錄的 version.json，不進開發 repo 的版控）：{"target":"offline","source":"<commit 前 7 碼>","date":"YYYY-MM-DD"}
const { execFile } = require("child_process");

const LABELS = { dev: "開發版", offline: "離線版", cloud: "雲端版" };
const isTarget = (t) => typeof t === "string" && Object.prototype.hasOwnProperty.call(LABELS, t);
const COMMIT = /^[0-9a-f]{7,40}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const commitOf = (s) => (typeof s === "string" && COMMIT.test(s) ? s.slice(0, 7) : null);
const dayOf = (s) => (typeof s === "string" && DAY.test(s) ? s : null);

// 版本檔的內容（字串）→ 物件；沒有、讀不懂、目標不是三個之一都回 null（當成沒有版本檔）
function readVersionFile(file) {
  let v = null;
  try { v = JSON.parse(file); } catch (_) {}
  return v && typeof v === "object" && isTarget(v.target) ? v : null;
}

// 現在是哪個目標（編譯站啟動時就要知道，所以不問 git）：環境變數 > 版本檔 > 開發版
function resolveTarget({ file, envTarget }) {
  const v = readVersionFile(file);
  return isTarget(envTarget) ? envTarget : v ? v.target : "dev";
}

// file：version.json 的內容（沒有這個檔就給 null）；envTarget：環境變數 BATOPIXEL_TARGET；
// git：沒有版本檔時才呼叫，回 { commit, dirty, date } 或 null（見 gitInfo）
// 回 { target, label, source, dirty, date }：認不得的內容一律留空（null），不照抄——這些字會顯示在工具頁上
async function resolveVersion({ file, envTarget, git }) {
  const v = readVersionFile(file);
  const target = resolveTarget({ file, envTarget });
  if (v) return { target, label: LABELS[target], source: commitOf(v.source), dirty: false, date: dayOf(v.date) };
  let g = null;
  try { g = await git(); } catch (_) {}
  g = g || {};
  return { target, label: LABELS[target], source: commitOf(g.commit), dirty: typeof g.dirty === "boolean" ? g.dirty : null, date: dayOf(g.date) };
}

// 問 git：root 那個 repo 現在的 commit、最後一次 commit 的日期、有沒有還沒 commit 的修改（含沒加進版控的新檔）。
// 沒裝 git、不是 repo、逾時：回 null
function gitInfo(root) {
  const git = (args) => new Promise((resolve) => {
    execFile("git", ["-C", root].concat(args), { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve(err ? null : String(stdout)));
  });
  return Promise.all([git(["log", "-1", "--format=%H %cs"]), git(["status", "--porcelain"])]).then(([log, status]) => {
    if (log == null || status == null) return null;
    const [commit, date] = log.trim().split(" ");
    return { commit, date, dirty: status.trim() !== "" };
  });
}

module.exports = { LABELS, resolveTarget, resolveVersion, gitInfo };
