# babit 安裝（Windows）：工具鏈從隨身碟的「babit安裝包」離線裝進 C:\babit，程式本身用 git 從 GitHub 下載（幾 MB）。
# 學員按兩下安裝包裡的 Windows安裝.bat，或在 PowerShell 貼上這一行：
#   powershell -ExecutionPolicy Bypass -Command "iex ((irm https://raw.githubusercontent.com/Howard-Chen/babit/main/install.ps1).TrimStart([char]0xFEFF))"
# TrimStart 是拿掉檔頭的 BOM：這個檔案要存成 UTF-8 with BOM，PowerShell 5.1 直接執行時中文才不會變亂碼；
#   但 irm 會把 BOM 留在字串開頭，交給 iex 時 BOM 黏著第一行的 #，變成找不到的指令、冒出一段紅字。
# 可用環境變數改設定（測試用）：BABIT_DEST 安裝位置、BABIT_PACK 安裝包資料夾、BABIT_REPO、BABIT_BRANCH、
#   BABIT_NO_SHORTCUT=1 不建桌面捷徑、BABIT_NEED_GB 磁碟空間門檻。
# 重跑是安全的：已經裝好的部分會略過；上次中斷（關視窗、拔隨身碟、沒網路）裝到一半的部分會整個重來。
# 情境測試：tests\install_win.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Install-Babit {
  $dest   = if ($env:BABIT_DEST)   { $env:BABIT_DEST }   else { "C:\babit" }
  $repo   = if ($env:BABIT_REPO)   { $env:BABIT_REPO }   else { "https://github.com/Howard-Chen/babit.git" }
  $branch = if ($env:BABIT_BRANCH) { $env:BABIT_BRANCH } else { "main" }
  $tar = Join-Path $env:SystemRoot "System32\tar.exe"      # Windows 10 以上內建的 bsdtar：zip、tar.gz 都解得開

  function Say([string]$m) { Write-Host ("  " + $m) }
  # 外部程式：錯誤看 exit code，不看 stderr（PowerShell 5.1 在輸出被轉向時會把 stderr 當成錯誤）
  function Run([string]$what, [scriptblock]$cmd) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $cmd } finally { $ErrorActionPreference = $old }
    if ($LASTEXITCODE -ne 0) { throw $what }
  }
  # 外部程式成功與否（不印輸出）
  function Quiet([scriptblock]$cmd) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $cmd *> $null } finally { $ErrorActionPreference = $old }
    return ($LASTEXITCODE -eq 0)
  }
  function Unpack([string]$archive, [string]$to, [int]$strip = 0) {
    New-Item -ItemType Directory -Force $to | Out-Null
    $targs = @("-xf", $archive, "-C", $to)
    if ($strip -gt 0) { $targs += "--strip-components=$strip" }
    Run "解壓縮失敗：$archive" { & $tar @targs }
  }
  # 工具解壓完才寫完成記號：主程式在壓縮檔裡排得很前面，解到一半被中斷（關視窗、拔隨身碟、沒電）時它已經在了，
  # 不能拿它判斷有沒有裝好。沒有記號就把資料夾整個刪掉重解
  function Installed([string]$dir) { return (Test-Path (Join-Path $dir ".babit-ok")) }
  function Fresh([string]$dir) { if (Test-Path $dir) { Remove-Item -Recurse -Force $dir } }
  function Done([string]$dir) { Set-Content -Path (Join-Path $dir ".babit-ok") -Value "ok" -Encoding Ascii }

  Write-Host ""
  Say "babit 安裝"
  Say "------------------------------------------"

  # 1. 安裝位置要是英文路徑：中文路徑會讓板子端（arduino-cli）編譯失敗
  if ($dest -notmatch '^[\x20-\x7E]+$') { throw "安裝位置要是英文路徑（現在是 $dest）" }

  # 2. 找隨身碟上的安裝包：每個磁碟的根目錄、桌面
  $pack = $env:BABIT_PACK
  if (-not $pack) {
    $cands = @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { Join-Path $_.Root "babit安裝包" })
    $cands += Join-Path ([Environment]::GetFolderPath("Desktop")) "babit安裝包"
    $pack = $cands | Where-Object { Test-Path (Join-Path $_ "windows") } | Select-Object -First 1
  }
  if (-not $pack -or -not (Test-Path (Join-Path $pack "windows"))) {
    throw "找不到隨身碟上的「babit安裝包」資料夾：請插上隨身碟再執行一次"
  }
  $win = Join-Path $pack "windows"
  Say "安裝包：$pack"
  Say "安裝位置：$dest"

  # 磁碟空間：第一次安裝約要 11 GB（裝完約 8.5 GB，安裝時另外暫放 1.9 GB 的 ESP32 壓縮檔；0.7 GB 的 emsdk 壓縮檔解完就刪），先檢查，免得裝到一半才失敗；
  # ESP32 核心已經裝好（重跑）就不檢查
  $need = if ($env:BABIT_NEED_GB) { [double]$env:BABIT_NEED_GB } else { 11 }
  if (-not (Test-Path (Join-Path $dest "tools\arduino\data\packages\esp32\hardware\esp32\3.3.11"))) {
    $drive = [System.IO.Path]::GetPathRoot($dest)
    $free = (New-Object System.IO.DriveInfo $drive).AvailableFreeSpace / 1GB
    if ($free -lt $need) { throw ("磁碟空間不夠：要 {0} GB，{1} 只剩 {2:0.0} GB。清出空間再執行一次" -f $need, $drive, $free) }
  }
  $tools = Join-Path $dest "tools"
  New-Item -ItemType Directory -Force $tools | Out-Null
  # 工作位置換到安裝資料夾：從隨身碟按兩下時，視窗的工作位置在隨身碟上；學員照提示中途拔掉隨身碟後，
  # 之後再開的程式（第一次編譯）會開不起來
  Set-Location -LiteralPath $dest
  [Environment]::CurrentDirectory = $dest

  # 3. 可攜版 git（GitHub Desktop 用的 dugite-native）→ tools\git
  $gitDir = Join-Path $tools "git"
  $git = Join-Path $gitDir "cmd\git.exe"
  if (-not (Installed $gitDir)) {
    Say "安裝 git（可攜版）…"
    Fresh $gitDir
    $tgz = Get-ChildItem (Join-Path $win "git") -Filter "dugite-native-*.tar.gz" | Select-Object -First 1
    Unpack $tgz.FullName $gitDir
    Done $gitDir
  }
  $env:GIT_EXEC_PATH = Join-Path $gitDir "mingw64\libexec\git-core"
  $env:PATH = (Join-Path $gitDir "mingw64\bin") + ";" + (Join-Path $gitDir "usr\bin") + ";" + $env:PATH

  # 4. babit 程式：安裝位置裡已經有 tools\，不能 git clone，改用 init＋fetch＋checkout（只拿最新一版）。
  #    裝好了＝程式在、git 也讀得到這一版。git init 一跑 .git 就在了，所以不能看 .git：
  #    上次下載失敗或中斷只留下 .git 時，把它刪掉重來（checkout -f 蓋過下載到一半的檔案）
  $haveCode = (Test-Path (Join-Path $dest "station\server.js")) -and (Quiet { & $git -C $dest rev-parse --verify --quiet HEAD })
  if (-not $haveCode) {
    Say "下載 babit 程式…"
    Fresh (Join-Path $dest ".git")
    Run "下載程式失敗（git init）" { & $git -C $dest init --quiet }
    Run "下載程式失敗（git remote）" { & $git -C $dest remote add origin $repo }
    Run "下載程式失敗：請確認網路連線（$repo）" { & $git -C $dest fetch --depth 1 origin $branch }
    Run "下載程式失敗（git checkout）" { & $git -C $dest checkout --quiet -f -B $branch --track "origin/$branch" }
  } else {
    Say "程式已經在了，略過下載（之後打開 babit 會自動更新）"
  }

  # 5. arduino-cli、ESP32 核心 3.3.11、Adafruit NeoPixel：全部從安裝包離線安裝
  #    arduino-cli 下載前會先看 staging 資料夾裡有沒有同名、大小與 checksum 相符的檔案，有就不下載
  $acDir = Join-Path $tools "arduino-cli"
  $ac = Join-Path $acDir "arduino-cli.exe"
  if (-not (Installed $acDir)) {
    Say "安裝 arduino-cli…"
    Fresh $acDir
    Unpack (Get-ChildItem (Join-Path $win "arduino-cli") -Filter "*.zip" | Select-Object -First 1).FullName $acDir
    Done $acDir
  }
  $ard = Join-Path $tools "arduino"
  $cfg = Join-Path $tools "arduino-cli.yaml"
  $slash = { param($p) $p -replace '\\', '/' }
  # build_cache：每次編譯的暫存與核心快取預設在使用者資料夾（%LOCALAPPDATA%\arduino）。Windows 帳號是中文名時，
  # ESP32 的連結器開不了那裡的檔案，板子端就編不過；放進安裝資料夾（已確認是英文路徑）
  Set-Content -Path $cfg -Encoding Ascii -Value @(
    "board_manager:",
    "  additional_urls:",
    "    - https://espressif.github.io/arduino-esp32/package_esp32_index.json",
    "directories:",
    ("  data: " + (& $slash (Join-Path $ard "data"))),
    ("  user: " + (& $slash (Join-Path $ard "user"))),
    ("  downloads: " + (& $slash (Join-Path $ard "staging"))),
    "build_cache:",
    ("  path: " + (& $slash (Join-Path $ard "cache"))),
    "library:",
    "  enable_unsafe_install: true",
    "updater:",
    "  enable_notification: false"
  )
  # arduino-cli 每次執行都會檢查 data 裡有沒有 library_index.json，沒有就連網下載（4 MB）；
  # 我們只裝隨身碟裡的 Adafruit NeoPixel（--zip-path），用不到這份索引，放一份空的就不必連網
  $libIdx = Join-Path $ard "data\library_index.json"
  if (-not (Test-Path $libIdx)) {
    New-Item -ItemType Directory -Force (Join-Path $ard "data") | Out-Null
    Set-Content -Path $libIdx -Encoding Ascii -Value '{"libraries":[]}'
  }
  # 隨身碟比學員少：要用的壓縮檔先全部複製到電腦（staging），說可以拔了，再在電腦上解壓（解壓很慢，不該佔著隨身碟）
  $stage = Join-Path $ard "staging\packages"
  $needCore = -not (Test-Path (Join-Path $ard "data\packages\esp32\hardware\esp32\3.3.11"))
  if ($needCore) {
    New-Item -ItemType Directory -Force (Join-Path $ard "data"), $stage | Out-Null
    Copy-Item (Join-Path $pack "package_index.json"), (Join-Path $pack "package_esp32_index.json") (Join-Path $ard "data") -Force
    Say "複製 ESP32 工具鏈（約 1.9 GB，隨身碟慢的話要幾分鐘）…"
    foreach ($sub in "esp32", "builtin") {
      Get-ChildItem (Join-Path $win $sub) -File | Where-Object { $_.Name -notmatch "checksums" } | Copy-Item -Destination $stage -Force
    }
  }
  if (-not (Get-ChildItem (Join-Path $ard "user\libraries") -Directory -Filter "Adafruit_NeoPixel*" -ErrorAction SilentlyContinue)) {
    Run "安裝 Adafruit NeoPixel 失敗" { & $ac --config-file $cfg lib install --zip-path (Join-Path $pack "libraries\Adafruit_NeoPixel-1.15.5.zip") }
  }
  # 6. emsdk（網頁預覽的編譯器）的四個壓縮檔也先複製過來
  $em = Join-Path $tools "emsdk"
  $emStage = Join-Path $ard "staging\emsdk"
  $needEm = -not (Test-Path (Join-Path $em ".emscripten"))
  if ($needEm) {
    Say "複製網頁預覽編譯器（約 0.7 GB）…"
    New-Item -ItemType Directory -Force $emStage | Out-Null
    Copy-Item (Join-Path $pack "emsdk-6.0.8.zip"), (Join-Path $win "emsdk\python-3.13.3-0-win-amd64.zip"),
      (Join-Path $win "emsdk\node-v24.19.0-win-x64.zip"), (Join-Path $win "emsdk\wasm-binaries.zip") $emStage -Force
  }

  # 隨身碟上的東西到這裡都複製完了，後面只用電腦上的檔案
  Write-Host ""
  Write-Host "  隨身碟用完了，可以拔下來給下一位同學（安裝還沒完成，這個視窗不要關）。" -ForegroundColor Green
  Write-Host ""

  #    照 emsdk 的資料夾配置直接解開（等於 emsdk install＋activate），不必跑 emsdk.py。
  #    .emscripten 在四個壓縮檔都解完後才寫，拿它當完成記號；解完就刪掉複製來的壓縮檔（先解 emsdk 再裝核心，佔用空間的高峰比較低）
  if ($needEm) {
    Say "安裝網頁預覽編譯器（emsdk 6.0.8，要幾分鐘，請不要關掉視窗）…"
    Fresh $em
    Unpack (Join-Path $emStage "emsdk-6.0.8.zip") $em 1
    Unpack (Join-Path $emStage "python-3.13.3-0-win-amd64.zip") (Join-Path $em "python\3.13.3_64bit")
    Unpack (Join-Path $emStage "node-v24.19.0-win-x64.zip") (Join-Path $em "node\24.19.0_64bit") 1
    Unpack (Join-Path $emStage "wasm-binaries.zip") (Join-Path $em "upstream") 1
    Set-Content -Path (Join-Path $em ".emscripten") -Encoding Ascii -Value @(
      "NODE_JS = '`$CFGDIR/node/24.19.0_64bit/node.exe'",
      "PYTHON = '`$CFGDIR/python/3.13.3_64bit/python.exe'",
      "LLVM_ROOT = '`$CFGDIR/upstream/bin'",
      "BINARYEN_ROOT = '`$CFGDIR/upstream'",
      "EMSCRIPTEN_ROOT = '`$CFGDIR/upstream/emscripten'"
    )
    Remove-Item -Recurse -Force $emStage
  }
  if ($needCore) {
    Say "安裝 ESP32 核心 3.3.11（解壓縮，要幾分鐘，請不要關掉視窗）…"
    Run "安裝 ESP32 核心失敗" { & $ac --config-file $cfg core install "esp32:esp32@3.3.11" }
  }

  # 7. 先編一次：emscripten 建系統函式庫、arduino-cli 編 ESP32 核心（也會補裝它需要的內建工具），
  #    學員第一次按 ▶／⚡ 才不用等好幾分鐘。編完 staging 就用不到了，刪掉省 1.9 GB
  Say "第一次編譯（網頁預覽與板子，約 2–5 分鐘）…"
  $env:BATOPIXEL_EMSDK = $em
  Run "網頁預覽編譯器測試失敗" { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest "preview\build_wasm.ps1") }
  Run "板子端編譯測試失敗" { & $ac --config-file $cfg compile --fqbn "esp32:esp32:esp32s3:CDCOnBoot=cdc" (Join-Path $dest "firmware\BatoPixelS0") }
  if (Test-Path (Join-Path $ard "staging")) { Remove-Item -Recurse -Force (Join-Path $ard "staging") }

  # 8. 桌面捷徑
  if ($env:BABIT_NO_SHORTCUT -ne "1") {
    $sc = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "babit.lnk"))
    $sc.TargetPath = Join-Path $dest "babit.bat"
    $sc.WorkingDirectory = $dest
    $sc.IconLocation = Join-Path $dest "icon.ico"
    $sc.Save()
    Say "桌面多了一個「babit」捷徑。"
  }
  Write-Host ""
  Say "完成！按兩下桌面的 babit 就能開始。"
  Write-Host ""
}

try {
  Install-Babit
} catch {
  Write-Host ""
  Write-Host ("  【安裝沒有完成】" + $_.Exception.Message) -ForegroundColor Red
  Write-Host "  把這段訊息拍照給老師。"
  Write-Host ""
}
