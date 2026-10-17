#!/bin/bash
# 按兩下安裝 babit（Mac）：工具鏈用這個資料夾裡的（BABIT_PACK＝這個檔案所在的資料夾），
# 安裝程式（install.sh）與 babit 程式本身從 GitHub 下載。
# 隨身碟比學員少：安裝程式說「可以拔下來」之後就能拔。所以整支包在 main 裡（bash 先讀完整支才開始跑，
# 之後不會再回隨身碟讀這個檔案），工作位置也先換到家目錄。
# 測試用：BABIT_SCRIPT_URL 改安裝程式的網址（預設是 GitHub main 分支的 install.sh）。
main() {
  BABIT_PACK="$(cd "$(dirname "$0")" && pwd)" || exit 1
  export BABIT_PACK
  cd "$HOME" 2>/dev/null || cd /
  URL="${BABIT_SCRIPT_URL:-https://raw.githubusercontent.com/Howard-Chen/babit/main/install.sh}"
  TMP="$(mktemp "${TMPDIR:-/tmp}/babit-install.XXXXXX")"
  if curl -fsSL "$URL" -o "$TMP"; then
    bash "$TMP"
  else
    echo
    echo "  【安裝沒有完成】下載不到安裝程式：請確認網路連線，再按兩下一次。"
    echo "  把這段訊息拍照給老師。"
  fi
  rm -f "$TMP"
  echo
  read -n 1 -s -r -p "  按任意鍵關閉視窗…"
  echo
}
main "$@"; exit $?
