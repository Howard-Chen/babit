# 安裝程式的情境測試（Windows）：中途失敗後重跑、解壓到一半被中斷、Windows 帳號是中文名、一行指令。
# 需要桌面（或 BABIT_PACK）的「babit安裝包」；c1、c2 在暫存資料夾裝東西（約 2 GB、幾分鐘），
# i4、i1 在一份完整安裝上重跑安裝程式（BABIT_FULL，預設 D:\babit-test），很快。
# 用法：powershell -ExecutionPolicy Bypass -File tests\install_win.ps1 [c1] [c2] [i4] [i1]（不給＝全部）
# BABIT_TEST_DIR 改暫存位置（要英文路徑）。需要開發機的 git 與 node。
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$only = @($args)
function Want([string]$n) { return ($only.Count -eq 0) -or ($only -contains $n) }

$repo = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $repo "install.ps1"
$branch = (& git -C $repo rev-parse --abbrev-ref HEAD).Trim()
$pack = if ($env:BABIT_PACK) { $env:BABIT_PACK } else { Join-Path ([Environment]::GetFolderPath("Desktop")) "babit安裝包" }
$full = if ($env:BABIT_FULL) { $env:BABIT_FULL } else { "D:\babit-test" }
$work = if ($env:BABIT_TEST_DIR) { $env:BABIT_TEST_DIR } else { Join-Path $env:TEMP ("babit-tests\win-" + (Get-Date -Format "yyyyMMdd-HHmmss")) }
New-Item -ItemType Directory -Force $work | Out-Null
$emptyPack = Join-Path $work "empty-pack"
New-Item -ItemType Directory -Force (Join-Path $emptyPack "windows") | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)

$script:bad = 0
function Say-Check([bool]$ok, [string]$msg) {
  if (-not $ok) { $script:bad++ }
  Write-Host ((if2 $ok "  ok   " "  FAIL ") + $msg)
}
function if2($c, $a, $b) { if ($c) { $a } else { $b } }

# 用指定的環境變數跑一次安裝程式，回傳畫面輸出（同時存檔方便查）
function Install-Run([string]$name, [hashtable]$envs) {
  $saved = @{}
  foreach ($k in $envs.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $envs[$k]) }
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $installer 2>&1 | Out-String }
  finally {
    $ErrorActionPreference = $old
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
  }
  [IO.File]::WriteAllText((Join-Path $work ($name + ".log")), $out, $utf8)
  return $out
}
function Head-Ok([string]$dest) {
  $g = Join-Path $dest "tools\git\cmd\git.exe"
  if (-not (Test-Path $g)) { return $false }
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { & $g -C $dest rev-parse --verify --quiet HEAD *> $null } finally { $ErrorActionPreference = $old }
  return ($LASTEXITCODE -eq 0)
}
$base = @{ BABIT_PACK = $pack; BABIT_REPO = $repo; BABIT_BRANCH = $branch; BABIT_NO_SHORTCUT = "1"; BABIT_NEED_GB = "1" }
function With([hashtable]$extra) { $h = $base.Clone(); foreach ($k in $extra.Keys) { $h[$k] = $extra[$k] }; return $h }

Write-Host "暫存資料夾：$work"

# C1：第一次下載程式失敗（來源錯、沒網路），修好再重跑，要能把程式下載回來
if (Want "c1") {
  $d = Join-Path $work "c1"
  $o1 = Install-Run "c1-first" (With @{ BABIT_DEST = $d; BABIT_REPO = (Join-Path $work "no-such-repo") })
  Say-Check ($o1 -match "請確認網路連線") "C1 第一次：程式來源連不到 → 停在下載程式（請確認網路連線）"
  # 第二次用空的安裝包：下載完程式後會停在 arduino-cli，這裡只看程式有沒有回來
  $o2 = Install-Run "c1-again" (With @{ BABIT_DEST = $d; BABIT_PACK = $emptyPack })
  $ok = (Test-Path (Join-Path $d "station\server.js")) -and (Head-Ok $d) -and ($o2 -notmatch "程式已經在了")
  Say-Check $ok "C1 重跑：沒下載完的程式重新下載"
}

# C2：git 與 emsdk 解壓到一半被中斷（關視窗、拔隨身碟），重跑要整個重新解開；
#     arduino 那段先放好「已裝好」的標記（測試才不用裝 6 GB），所以最後會停在板子端編譯
if (Want "c2") {
  $d = Join-Path $work "c2"
  $t = Join-Path $d "tools"
  New-Item -ItemType Directory -Force (Join-Path $t "git\cmd"), (Join-Path $t "emsdk\upstream\emscripten"), (Join-Path $t "arduino-cli"),
    (Join-Path $t "arduino\data\packages\esp32\hardware\esp32\3.3.11"), (Join-Path $t "arduino\user\libraries\Adafruit_NeoPixel") | Out-Null
  New-Item -ItemType File -Force (Join-Path $t "git\cmd\git.exe"), (Join-Path $t "emsdk\upstream\emscripten\emcc.py") | Out-Null
  Copy-Item (Join-Path $full "tools\arduino-cli\arduino-cli.exe") (Join-Path $t "arduino-cli")
  Set-Content (Join-Path $t "arduino-cli\.babit-ok") "ok"
  $o = Install-Run "c2" (With @{ BABIT_DEST = $d })
  $ok = ($o -match "WASM build OK") -and (Test-Path (Join-Path $t "emsdk\.emscripten")) -and (Head-Ok $d)
  Say-Check $ok "C2 重跑：解壓到一半的 git、emsdk 重新解開，程式下載、網頁預覽編得過"
}

# I4：Windows 帳號是中文名（LOCALAPPDATA 在中文路徑）時，板子端要照樣編得過
if (Want "i4") {
  $o = Install-Run "i4-install" (With @{ BABIT_DEST = $full })
  Say-Check ($o -match "完成") "I4 在完整安裝上重跑安裝程式"
  $cn = Join-Path $work "中文帳號\AppData\Local"
  New-Item -ItemType Directory -Force $cn | Out-Null
  $saved = $env:LOCALAPPDATA; $env:LOCALAPPDATA = $cn
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try {
    $out = & (Join-Path $full "tools\arduino-cli\arduino-cli.exe") --config-file (Join-Path $full "tools\arduino-cli.yaml") compile --no-color `
      --fqbn "esp32:esp32:esp32s3:CDCOnBoot=cdc" (Join-Path $full "firmware\BatoPixelS0") 2>&1 | Out-String
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $old; $env:LOCALAPPDATA = $saved }
  [IO.File]::WriteAllText((Join-Path $work "i4-compile.log"), $out, $utf8)
  Say-Check ($code -eq 0) "I4 Windows 帳號是中文名：板子端照樣編得過"
}

# I1：README 的一行指令（irm 下載後交給 iex）：開頭不能冒紅字，要裝到完成。安裝程式由本機模擬的 GitHub raw 提供
if (Want "i1") {
  $readme = [IO.File]::ReadAllText((Join-Path $repo "README.md"), $utf8)
  $line = [regex]::Match($readme, '`(powershell [^`]*install\.ps1[^`]*)`').Groups[1].Value
  $port = 8936
  $srv = Start-Process node -ArgumentList ('"' + (Join-Path $PSScriptRoot "fake_raw.js") + '"'), ('"' + $repo + '"'), $port -PassThru -WindowStyle Hidden
  try {
    for ($i = 0; $i -lt 50; $i++) { try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/README.md" | Out-Null; break } catch { Start-Sleep -Milliseconds 200 } }
    $local = $line.Replace("https://raw.githubusercontent.com/Howard-Chen/babit/main/install.ps1", "http://127.0.0.1:$port/install.ps1")
    # 學員是在 PowerShell 視窗貼上這行，標準輸入是主控台。這裡開一個新的主控台跑（標準輸入被導向時，
    # powershell -Command 會把讀到的空行也塞進管線，結果跟學員看到的不一樣），輸出寫到檔案
    $log = Join-Path $work "i1.log"
    $saved = @{}
    $envs = With @{ BABIT_DEST = $full }
    foreach ($k in $envs.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $envs[$k]) }
    try { Start-Process cmd -ArgumentList '/c', ('"' + $local + ' > "' + $log + '" 2>&1"') -Wait -WindowStyle Hidden }
    finally { foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) } }
    $o = if (Test-Path $log) { Get-Content $log -Raw -Encoding Default } else { "" }
  } finally { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
  Say-Check ($line -ne "") "I1 README 裡找得到一行指令"
  Say-Check (($o -match "完成") -and ($o -notmatch "CommandNotFoundException|無法辨識|is not recognized")) "I1 一行指令：開頭沒有紅字錯誤、裝到完成"
}

Write-Host (if2 $script:bad ("`n" + $script:bad + " 項不符 → FAIL") "`n全部通過 → PASS")
exit (if2 $script:bad 1 0)
