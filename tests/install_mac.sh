#!/bin/bash
# Mac 安裝程式與啟動器的情境測試，在 Windows 的 Git Bash 模擬（沒有 Mac 時用；Finder、Gatekeeper 等仍要借 Mac 實測）。
# 安裝包是假的（小小的假壓縮檔，git 轉給開發機的 git），放在名稱有空格的資料夾（像隨身碟的「NO NAME」）：
#   i5 隨身碟名稱有空格　c1 下載程式失敗後重跑　c2 git、emsdk 解壓到一半後重跑
#   i6 M 系列 Mac 沒裝 Rosetta　i7 桌面上的 babit.command 是 symlink
# 用法：bash tests/install_mac.sh（BABIT_TEST_DIR 改暫存位置）。用連接埠 8936。
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${BABIT_TEST_DIR:-${TMPDIR:-/tmp}/babit-tests/mac-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"   # C:/… 寫法的冒號會把 PATH 拆開（下面的替身指令放在 PATH 裡）
BRANCH="$(git -C "$HERE" rev-parse --abbrev-ref HEAD)"
REALPACK="${BABIT_PACK:-$HOME/Desktop/babit安裝包}"
SYSGIT="$(command -v git)"
bad=0
check() { if [ "$1" = 0 ]; then echo "  ok   $2"; else echo "  FAIL $2"; bad=$((bad + 1)); fi; }
echo "暫存資料夾：$WORK"

# 假的安裝包（mac-intel 與 mac-arm64 各一份）：git 轉給開發機的 git；python 一律失敗，所以安裝會停在「網頁預覽編譯器測試失敗」
mkpack() {
  local p="$1" plat="$2" s="$WORK/src-$2"
  mkdir -p "$s/git/bin" "$s/git/libexec/git-core" "$s/git/share/git-core/templates" \
           "$s/py/python-3.13.3-0/bin" "$s/node/node-v24/bin" "$s/wasm/install/emscripten" "$s/wasm/install/bin" "$s/ac"
  printf '#!/bin/bash\nunset GIT_EXEC_PATH GIT_TEMPLATE_DIR\nexec "%s" "$@"\n' "$SYSGIT" > "$s/git/bin/git"
  printf '#!/bin/bash\nexit 1\n' > "$s/py/python-3.13.3-0/bin/python3"
  printf '#!/bin/bash\nexit 1\n' > "$s/node/node-v24/bin/node"
  printf '# fake\n' > "$s/wasm/install/emscripten/emcc.py"
  printf '#!/bin/bash\nexit 0\n' > "$s/ac/arduino-cli"
  chmod +x "$s/git/bin/git" "$s/py/python-3.13.3-0/bin/python3" "$s/node/node-v24/bin/node" "$s/ac/arduino-cli"
  mkdir -p "$p/$plat/git" "$p/$plat/emsdk" "$p/$plat/arduino-cli" "$p/libraries"
  # 跟真的安裝包一樣：git、arduino-cli 直接是內容；python、node、wasm 外面包一層資料夾（安裝程式解壓時會去掉）
  tar -czf "$p/$plat/git/dugite-native-v0-fake.tar.gz" -C "$s/git" .
  tar -czf "$p/$plat/emsdk/python-3.13.3-0-fake.tar.gz" -C "$s/py" python-3.13.3-0
  tar -czf "$p/$plat/emsdk/node-v24-fake.tar.gz" -C "$s/node" node-v24
  tar -czf "$p/$plat/emsdk/wasm-binaries-fake.tar.xz" -C "$s/wasm" install
  tar -czf "$p/$plat/arduino-cli/arduino-cli_0_fake.tar.gz" -C "$s/ac" .
  cp "$REALPACK/emsdk-6.0.8.zip" "$p/"
}
# arduino 那段先放好「已裝好」的記號：ESP32 核心與 NeoPixel 不用真的裝
fake_arduino_done() { mkdir -p "$1/tools/arduino/data/packages/esp32/hardware/esp32/3.3.11" "$1/tools/arduino/user/libraries/Adafruit_NeoPixel"; }
# Mac 的 tar 是 bsdtar（zip 也解得開）；Git Bash 的是 GNU tar，所以安裝程式裡的 tar 改用 Windows 內建的 bsdtar
TSHIM="$WORK/tarshim"; mkdir -p "$TSHIM"
printf '#!/bin/bash\nexec "%s" "$@"\n' "$(cygpath -u "$SYSTEMROOT")/System32/tar.exe" > "$TSHIM/tar"; chmod +x "$TSHIM/tar"
run_install() { PATH="$TSHIM:$PATH" BABIT_NEED_GB=1 BABIT_NO_SHORTCUT=1 BABIT_BRANCH="$BRANCH" bash "$HERE/install.sh" < /dev/null 2>&1; }
head_ok() { "$SYSGIT" -C "$1" rev-parse --verify -q HEAD > /dev/null 2>&1; }

PACK="$WORK/USB DISK/babit安裝包"
mkpack "$PACK" mac-intel

# I5：隨身碟名稱有空格
D="$WORK/i5"; fake_arduino_done "$D"
out="$(BABIT_PACK="$PACK" BABIT_DEST="$D" BABIT_REPO="$HERE" run_install)"; echo "$out" > "$WORK/i5.log"
echo "$out" | grep -q "網頁預覽編譯器測試失敗" && [ -f "$D/station/server.js" ]
check $? "I5 隨身碟名稱有空格：找得到安裝包裡的每個壓縮檔，裝到網頁預覽那一步"

# C1：第一次下載程式失敗，修好再重跑，要能把程式下載回來
D="$WORK/c1"; fake_arduino_done "$D"
out="$(BABIT_PACK="$PACK" BABIT_DEST="$D" BABIT_REPO="$WORK/no-such-repo" run_install)"; echo "$out" > "$WORK/c1-first.log"
echo "$out" | grep -q "請確認網路連線"; check $? "C1 第一次：程式來源連不到 → 停在下載程式（請確認網路連線）"
out="$(BABIT_PACK="$PACK" BABIT_DEST="$D" BABIT_REPO="$HERE" run_install)"; echo "$out" > "$WORK/c1-again.log"
[ -f "$D/station/server.js" ] && head_ok "$D" && ! echo "$out" | grep -q "程式已經在了"
check $? "C1 重跑：沒下載完的程式重新下載"

# C2：git 與 emsdk 解壓到一半（主程式在、其他沒有），重跑要整個重新解開
D="$WORK/c2"; fake_arduino_done "$D"
mkdir -p "$D/tools/git/bin" "$D/tools/emsdk/upstream/emscripten"
printf '#!/bin/bash\nexit 1\n' > "$D/tools/git/bin/git"; chmod +x "$D/tools/git/bin/git"
printf '# half\n' > "$D/tools/emsdk/upstream/emscripten/emcc.py"
out="$(BABIT_PACK="$PACK" BABIT_DEST="$D" BABIT_REPO="$HERE" run_install)"; echo "$out" > "$WORK/c2.log"
[ -f "$D/station/server.js" ] && [ -f "$D/tools/emsdk/.emscripten" ] && echo "$out" | grep -q "網頁預覽編譯器測試失敗"
check $? "C2 重跑：解壓到一半的 git、emsdk 重新解開，程式下載回來"

# I6：M 系列 Mac 沒裝 Rosetta（uname 說 arm64、arch -x86_64 失敗）：一開始就說明怎麼裝
SHIM="$WORK/shim"; mkdir -p "$SHIM"
printf '#!/bin/bash\necho arm64\n' > "$SHIM/uname"; printf '#!/bin/bash\nexit 1\n' > "$SHIM/arch"; chmod +x "$SHIM/uname" "$SHIM/arch"
P6="$WORK/pack6/babit安裝包"; mkpack "$P6" mac-arm64
out="$(PATH="$SHIM:$PATH" BABIT_PACK="$P6" BABIT_DEST="$WORK/i6" BABIT_REPO="$HERE" run_install)"; echo "$out" > "$WORK/i6.log"
echo "$out" | grep -q "Rosetta" && [ ! -d "$WORK/i6/tools" ]
check $? "I6 M 系列 Mac 沒裝 Rosetta：一開始就停下並說明怎麼裝"

# I7：桌面上的 babit.command 是指到安裝資料夾的 symlink：要找得到程式資料夾、啟動編譯站
R="$WORK/root7"; mkdir -p "$R/station" "$WORK/desk7"
cp "$HERE/babit.command" "$R/"
printf '%s\n' 'require("fs").writeFileSync(__dirname + "/started.txt", "ok");' \
  'require("http").createServer((q, r) => r.end("ok")).listen(Number(process.env.BATOPIXEL_PORT), "127.0.0.1");' \
  'setTimeout(() => process.exit(0), 3000);' > "$R/station/server.js"
(cd "$WORK/desk7" && MSYS=winsymlinks:lnk ln -sf "$R/babit.command" babit.command)
BATOPIXEL_PORT=8936 BABIT_NO_BROWSER=1 bash "$WORK/desk7/babit.command" < /dev/null > "$WORK/i7.log" 2>&1
[ -f "$R/station/started.txt" ]; check $? "I7 從桌面的 symlink 打開：找得到程式資料夾，編譯站有啟動"

if [ "$bad" = 0 ]; then echo; echo "全部通過 → PASS"; else echo; echo "$bad 項不符 → FAIL"; fi
[ "$bad" = 0 ]
