#!/bin/bash
# babit 啟動器（Mac）：用可攜版 git 更新、啟動編譯站、打開工具頁。在 Finder 按兩下（第一次可能要按右鍵→打開）。
# 測試用：BATOPIXEL_PORT（預設 8930）、BABIT_NO_BROWSER=1（不開瀏覽器）。尚未在 Mac 上實測。
# 桌面上的是安裝程式放的 symlink：先找出這個檔案真正的位置，才找得到程式資料夾
SELF="$0"
while [ -L "$SELF" ]; do
  L="$(readlink "$SELF")"
  case "$L" in /*) SELF="$L" ;; *) SELF="$(dirname "$SELF")/$L" ;; esac
done
cd "$(dirname "$SELF")" || exit 1
ROOT="$(pwd)"
PORT="${BATOPIXEL_PORT:-8930}"
URL="http://localhost:$PORT"
echo
echo "  babit 點陣動畫工具"
echo "  ------------------------------------------"

G="$ROOT/tools/git"
if [ -x "$G/bin/git" ]; then
  echo "  檢查更新…"
  if ! GIT_EXEC_PATH="$G/libexec/git-core" GIT_TEMPLATE_DIR="$G/share/git-core/templates" \
       "$G/bin/git" -C "$ROOT" pull --ff-only --quiet; then
    echo "  沒有更新（沒有網路，或改過檔案），用目前的版本。"
  fi
fi

NODE="$(ls -d "$ROOT"/tools/emsdk/node/*/bin/node 2>/dev/null | head -1)"
[ -n "$NODE" ] || NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "  找不到 node，請重新執行安裝（install.sh）。"
  read -r -p "  按 Enter 關閉" _
  exit 1
fi

open_page() { [ "${BABIT_NO_BROWSER:-}" = 1 ] || open "$URL"; }
if curl -s -o /dev/null -m 1 "$URL/"; then open_page; exit 0; fi
echo "  啟動編譯站…（關掉這個視窗＝停止編譯站）"
BATOPIXEL_PORT="$PORT" "$NODE" "$ROOT/station/server.js" &
for _ in $(seq 1 30); do curl -s -o /dev/null -m 1 "$URL/" && break; sleep 0.5; done
open_page
wait
