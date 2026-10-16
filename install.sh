#!/bin/bash
# babit 安裝（Mac）：工具鏈從隨身碟的「babit安裝包」離線裝進 ~/babit，程式本身用 git 從 GitHub 下載（幾 MB）。
# 學員按兩下安裝包裡的 Mac安裝.command，或在「終端機」貼上這一行：
#   curl -fsSL https://raw.githubusercontent.com/Howard-Chen/babit/main/install.sh | bash
# 可用環境變數改設定（測試用）：BABIT_DEST、BABIT_PACK、BABIT_REPO、BABIT_BRANCH、BABIT_NO_SHORTCUT=1、BABIT_NEED_GB
# 重跑是安全的：已經裝好的部分會略過；上次中斷（關視窗、拔隨身碟、沒網路）裝到一半的部分會整個重來。
# 尚未在 Mac 上實測（2026-10-16 只在 Windows 的 Git Bash 模擬過：tests/install_mac.sh）。
set -uo pipefail
DEST="${BABIT_DEST:-$HOME/babit}"
REPO="${BABIT_REPO:-https://github.com/Howard-Chen/babit.git}"
BRANCH="${BABIT_BRANCH:-main}"
say() { echo "  $*"; }
fail() { echo; echo "  【安裝沒有完成】$*"; echo "  把這段訊息拍照給老師。"; echo; exit 1; }

echo
say "babit 安裝"
say "------------------------------------------"

# 1. 哪一種 Mac：Apple 晶片或 Intel（在 Rosetta 底下跑時 uname 會說 x86_64，要另外問）
case "$(uname -m)" in
  arm64) PLAT=mac-arm64 ;;
  x86_64) PLAT=mac-intel
          [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ] && PLAT=mac-arm64 ;;
  *) fail "不支援這台電腦（$(uname -m)）" ;;
esac
# Apple 晶片要有 Rosetta 2：arduino-cli 每次編板子的程式都會跑 ctags，而 Mac 版的 ctags 只有 Intel 版
if [ "$PLAT" = mac-arm64 ] && ! arch -x86_64 /usr/bin/true 2>/dev/null; then
  fail "這台 Mac 還沒裝 Rosetta 2（編譯板子的程式需要）：在終端機貼上 sudo softwareupdate --install-rosetta --agree-to-license，輸入電腦的登入密碼，裝好再執行一次"
fi

# 2. 安裝位置要是英文路徑：中文路徑會讓板子端（arduino-cli）編譯失敗
case "$DEST" in *[!\ -~]*) fail "安裝位置要是英文路徑（現在是 $DEST）" ;; esac

# 3. 找隨身碟上的安裝包
PACK="${BABIT_PACK:-}"
if [ -z "$PACK" ]; then
  for d in /Volumes/*/babit安裝包 "$HOME/Desktop/babit安裝包"; do
    if [ -d "$d/$PLAT" ]; then PACK="$d"; break; fi
  done
fi
{ [ -n "$PACK" ] && [ -d "$PACK/$PLAT" ]; } || fail "找不到隨身碟上的「babit安裝包」資料夾：請插上隨身碟再執行一次"
SRC="$PACK/$PLAT"
say "安裝包：$PACK（$PLAT）"
say "安裝位置：$DEST"

# 磁碟空間：第一次安裝約要 11 GB（裝完約 8.5 GB，安裝時另外暫放 1.9 GB 的 ESP32 壓縮檔），先檢查，免得裝到一半才失敗；
# ESP32 核心已經裝好（重跑）就不檢查
NEED_GB="${BABIT_NEED_GB:-11}"
if [ ! -d "$DEST/tools/arduino/data/packages/esp32/hardware/esp32/3.3.11" ]; then
  d="$DEST"; while [ ! -d "$d" ]; do d="$(dirname "$d")"; done
  FREE_GB=$(df -Pk "$d" | awk 'NR==2 { printf "%d", $4 / 1048576 }')
  [ "${FREE_GB:-0}" -ge "$NEED_GB" ] || fail "磁碟空間不夠：要 $NEED_GB GB，只剩 ${FREE_GB:-?} GB。清出空間再執行一次"
fi
TOOLS="$DEST/tools"
mkdir -p "$TOOLS" || fail "建立資料夾失敗：$TOOLS"

unpack() {  # 壓縮檔 目的地 [去掉幾層]；macOS 的 tar 是 bsdtar，zip、tar.gz、tar.xz 都解得開
  mkdir -p "$2" || fail "建立資料夾失敗：$2"
  if [ -n "${3:-}" ]; then tar -xf "$1" -C "$2" --strip-components "$3"; else tar -xf "$1" -C "$2"; fi \
    || fail "解壓縮失敗：$1"
}
# 第一個存在的檔案。呼叫時萬用字元放在引號外（"$SRC"/git/*.tar.gz）：隨身碟名稱常有空格（NO NAME、USB DISK）
pick() { local f; for f in "$@"; do [ -e "$f" ] && { printf '%s\n' "$f"; return 0; }; done; return 1; }
# 工具解壓完才寫完成記號：主程式在壓縮檔裡排得很前面，解到一半被中斷（關視窗、拔隨身碟、沒電）時它已經在了，
# 不能拿它判斷有沒有裝好。沒有記號就把資料夾整個刪掉重解
installed() { [ -f "$1/.babit-ok" ]; }
mark_done() { : > "$1/.babit-ok"; }

# 4. 可攜版 git（GitHub Desktop 用的 dugite-native）→ tools/git
G="$TOOLS/git"
if ! installed "$G"; then
  say "安裝 git（可攜版）…"
  F="$(pick "$SRC"/git/dugite-native-*.tar.gz)" || fail "安裝包不完整：找不到 $PLAT/git/dugite-native-*.tar.gz"
  rm -rf "$G"
  unpack "$F" "$G"
  mark_done "$G"
fi
export GIT_EXEC_PATH="$G/libexec/git-core" GIT_TEMPLATE_DIR="$G/share/git-core/templates"
GIT="$G/bin/git"

# 5. babit 程式：安裝位置裡已經有 tools/，不能 git clone，改用 init＋fetch＋checkout（只拿最新一版）。
#    裝好了＝程式在、git 也讀得到這一版。git init 一跑 .git 就在了，所以不能看 .git：
#    上次下載失敗或中斷只留下 .git 時，把它刪掉重來（checkout -f 蓋過下載到一半的檔案）
if [ -f "$DEST/station/server.js" ] && "$GIT" -C "$DEST" rev-parse --verify -q HEAD >/dev/null 2>&1; then
  say "程式已經在了，略過下載（之後打開 babit 會自動更新）"
else
  say "下載 babit 程式…"
  rm -rf "$DEST/.git"
  "$GIT" -C "$DEST" init -q || fail "下載程式失敗（git init）"
  "$GIT" -C "$DEST" remote add origin "$REPO" || fail "下載程式失敗（git remote）"
  "$GIT" -C "$DEST" fetch --depth 1 origin "$BRANCH" || fail "下載程式失敗：請確認網路連線（$REPO）"
  "$GIT" -C "$DEST" checkout -q -f -B "$BRANCH" --track "origin/$BRANCH" || fail "下載程式失敗（git checkout）"
fi

# 6. arduino-cli、ESP32 核心 3.3.11、Adafruit NeoPixel：全部從安裝包離線安裝
AC="$TOOLS/arduino-cli/arduino-cli"
if ! installed "$TOOLS/arduino-cli"; then
  say "安裝 arduino-cli…"
  F="$(pick "$SRC"/arduino-cli/arduino-cli_*.tar.gz)" || fail "安裝包不完整：找不到 $PLAT/arduino-cli/arduino-cli_*.tar.gz"
  rm -rf "$TOOLS/arduino-cli"
  unpack "$F" "$TOOLS/arduino-cli"
  mark_done "$TOOLS/arduino-cli"
fi
ARD="$TOOLS/arduino"
CFG="$TOOLS/arduino-cli.yaml"
# build_cache：每次編譯的暫存與核心快取預設在使用者資料夾；收進安裝資料夾（已確認是英文路徑），跟 Windows 版一致
cat > "$CFG" <<EOF
board_manager:
  additional_urls:
    - https://espressif.github.io/arduino-esp32/package_esp32_index.json
directories:
  data: $ARD/data
  user: $ARD/user
  downloads: $ARD/staging
build_cache:
  path: $ARD/cache
library:
  enable_unsafe_install: true
updater:
  enable_notification: false
EOF
# arduino-cli 每次執行都會檢查 data 裡有沒有 library_index.json，沒有就連網下載（4 MB）；
# 我們只裝隨身碟裡的 Adafruit NeoPixel（--zip-path），用不到這份索引，放一份空的就不必連網
mkdir -p "$ARD/data"
[ -f "$ARD/data/library_index.json" ] || echo '{"libraries":[]}' > "$ARD/data/library_index.json"
if [ ! -d "$ARD/data/packages/esp32/hardware/esp32/3.3.11" ]; then
  mkdir -p "$ARD/data" "$ARD/staging/packages"
  cp "$PACK/package_index.json" "$PACK/package_esp32_index.json" "$ARD/data/" || fail "複製套件清單失敗"
  say "複製 ESP32 工具鏈（約 1.9 GB）…"
  find "$SRC/esp32" "$SRC/builtin" -type f ! -name '*checksums*' -exec cp {} "$ARD/staging/packages/" \; \
    || fail "複製 ESP32 工具鏈失敗"
  say "安裝 ESP32 核心 3.3.11（解壓縮，要幾分鐘，請不要關掉視窗）…"
  "$AC" --config-file "$CFG" core install esp32:esp32@3.3.11 || fail "安裝 ESP32 核心失敗"
fi
if ! ls -d "$ARD"/user/libraries/Adafruit_NeoPixel* >/dev/null 2>&1; then
  "$AC" --config-file "$CFG" lib install --zip-path "$PACK/libraries/Adafruit_NeoPixel-1.15.5.zip" \
    || fail "安裝 Adafruit NeoPixel 失敗"
fi

# 7. emsdk（網頁預覽的編譯器）：照 emsdk 的資料夾配置直接解開，不必跑 emsdk.py（Mac 不一定有 python）。
#    .emscripten 在四個壓縮檔都解完後才寫，拿它當完成記號
EM="$TOOLS/emsdk"
if [ ! -f "$EM/.emscripten" ]; then
  say "安裝網頁預覽編譯器（emsdk 6.0.8，要幾分鐘，請不要關掉視窗）…"
  PYA="$(pick "$SRC"/emsdk/python-*.tar.gz)" || fail "安裝包不完整：找不到 $PLAT/emsdk/python-*.tar.gz"
  NODEA="$(pick "$SRC"/emsdk/node-*.tar.gz)" || fail "安裝包不完整：找不到 $PLAT/emsdk/node-*.tar.gz"
  WASMA="$(pick "$SRC"/emsdk/wasm-binaries*.tar.xz)" || fail "安裝包不完整：找不到 $PLAT/emsdk/wasm-binaries*.tar.xz"
  rm -rf "$EM"
  unpack "$PACK/emsdk-6.0.8.zip" "$EM" 1
  unpack "$PYA" "$EM/python/3.13.3_64bit" 1
  unpack "$NODEA" "$EM/node/24.19.0_64bit" 1
  unpack "$WASMA" "$EM/upstream" 1
  cat > "$EM/.emscripten" <<'EOF'
NODE_JS = '$CFGDIR/node/24.19.0_64bit/bin/node'
PYTHON = '$CFGDIR/python/3.13.3_64bit/bin/python3'
LLVM_ROOT = '$CFGDIR/upstream/bin'
BINARYEN_ROOT = '$CFGDIR/upstream'
EMSCRIPTEN_ROOT = '$CFGDIR/upstream/emscripten'
EOF
fi
# 隔離屬性：從隨身碟解開的檔案通常沒有；有的話拿掉，免得 Gatekeeper 擋下未簽章的工具
xattr -dr com.apple.quarantine "$TOOLS" 2>/dev/null || true

# 8. 先編一次（emscripten 建系統函式庫、arduino-cli 編 ESP32 核心），編完 staging 就刪掉
say "第一次編譯（網頁預覽與板子，約 2–5 分鐘）…"
PY="$(pick "$EM"/python/*/bin/python3)" || fail "找不到 emsdk 的 python：請重新執行安裝"
NODEX="$(pick "$EM"/node/*/bin/node)" || fail "找不到 emsdk 的 node：請重新執行安裝"
NODEBIN="$(dirname "$NODEX")"
export PATH="$EM/upstream/emscripten:$EM/upstream/bin:$NODEBIN:$(dirname "$PY"):$PATH"
mkdir -p "$DEST/preview/web"
cp "$DEST/firmware/BatoPixelS0/BatoPixelS0.ino" "$DEST/preview/web/student.cpp"
"$PY" "$EM/upstream/emscripten/emcc.py" "$DEST/preview/wrapper.cpp" -I "$DEST/preview/web" -I "$DEST/firmware/BatoPixelS0" \
  -O1 -sMODULARIZE=1 -sEXPORT_NAME=createBatoPixel -sSINGLE_FILE=1 -o "$DEST/preview/web/batopixel.js" \
  || fail "網頁預覽編譯器測試失敗"
"$AC" --config-file "$CFG" compile --fqbn esp32:esp32:esp32s3:CDCOnBoot=cdc "$DEST/firmware/BatoPixelS0" \
  || fail "板子端編譯測試失敗"
rm -rf "$ARD/staging"

# 9. 桌面捷徑（指到 babit.command 的連結）
chmod +x "$DEST/babit.command" "$DEST/install.sh" 2>/dev/null
if [ "${BABIT_NO_SHORTCUT:-}" != 1 ]; then
  ln -sf "$DEST/babit.command" "$HOME/Desktop/babit.command" && say "桌面多了一個「babit.command」。"
fi
echo
say "完成！按兩下桌面的 babit.command 就能開始（第一次可能要按右鍵→打開）。"
echo
