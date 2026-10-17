# 安裝程式的情境測試（Windows）：中途失敗後重跑、解壓到一半被中斷、Windows 帳號是中文名、一行指令、
# 照提示中途拔掉隨身碟（用 subst 做一個磁碟代號當隨身碟）。
# 需要桌面（或 BABIT_PACK）的「babit安裝包」；c1、c2 在暫存資料夾裝東西（約 2 GB、幾分鐘），
# i4、i1、u1 在一份完整安裝上重跑安裝程式（BABIT_FULL，預設 D:\babit-test），很快；u2 用假的安裝程式，幾秒。
# 用法：powershell -ExecutionPolicy Bypass -File tests\install_win.ps1 [c1] [c2] [i4] [i1] [u1] [u2]（不給＝全部）
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
function Set-Envs([hashtable]$envs) {
  $s = @{}; foreach ($k in $envs.Keys) { $s[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $envs[$k]) }
  return $s
}
function Restore-Envs([hashtable]$s) { foreach ($k in $s.Keys) { [Environment]::SetEnvironmentVariable($k, $s[$k]) } }
# 還在寫的記錄檔要用共用模式讀；畫面輸出是系統的字碼頁
function Read-Log([string]$path) {
  if (-not (Test-Path $path)) { return "" }
  $fs = [IO.File]::Open($path, "Open", "Read", "ReadWrite")
  try { return (New-Object IO.StreamReader($fs, [Text.Encoding]::Default)).ReadToEnd() } finally { $fs.Dispose() }
}
# 等記錄檔出現某段文字；程式先結束或逾時就回 false
function Wait-Log([string]$path, $proc, [string]$pattern, [int]$sec) {
  $until = [DateTime]::Now.AddSeconds($sec)
  while ([DateTime]::Now -lt $until) {
    if ((Read-Log $path) -match $pattern) { return $true }
    if ($proc -and $proc.HasExited) { return ((Read-Log $path) -match $pattern) }
    Start-Sleep -Milliseconds 300
  }
  return $false
}
# 拿一個沒用到的磁碟代號，用 subst 掛上去當隨身碟
function Free-Drive {
  $used = @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Name })
  foreach ($l in [char[]]"QRSTUVWXYZ") { if ($used -notcontains [string]$l) { return ([string]$l + ":") } }
  throw "沒有空的磁碟代號可以模擬隨身碟"
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
  # 隨身碟比學員少：壓縮檔先複製到電腦，說可以拔之後才解壓（解壓很慢，不該佔著隨身碟）
  $iu = $o.IndexOf("可以拔下來"); $ie = $o.IndexOf("安裝網頁預覽編譯器")
  Say-Check (($iu -ge 0) -and ($ie -gt $iu)) "C2 先說「可以拔下來」，才解壓網頁預覽編譯器"
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

# U1：安裝程式讀完隨身碟上的材料就說「可以拔下來」，拔掉之後要照樣裝完。從隨身碟按兩下時，視窗的工作位置就在隨身碟上：
#     拔掉之後再開的程式（第一次編譯）會開不起來，所以安裝程式要先把工作位置換到電腦上。在完整安裝上重跑，材料很快就讀完
if (Want "u1") {
  $drv = Free-Drive
  & subst $drv (Split-Path -Parent $pack) | Out-Null
  $usbPack = "$drv\" + (Split-Path -Leaf $pack)
  $log = Join-Path $work "u1.log"
  $unplugged = $false
  $saved = Set-Envs (With @{ BABIT_DEST = $full; BABIT_PACK = $usbPack })
  try {
    $p = Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $installer + '"') `
      -WorkingDirectory $usbPack -RedirectStandardOutput $log -PassThru -WindowStyle Hidden
    if (Wait-Log $log $p "可以拔下來" 600) { & subst $drv /d | Out-Null; $unplugged = $true }
    $null = $p.WaitForExit(600000)
  } finally {
    Restore-Envs $saved
    if (-not $unplugged) { & subst $drv /d 2>$null | Out-Null }
  }
  $o = Read-Log $log
  Say-Check $unplugged "U1 讀完隨身碟的材料時說「可以拔下來」"
  Say-Check ($unplugged -and ($o -match "WASM build OK") -and ($o -match "完成！") -and ($o -notmatch "沒有完成")) "U1 照提示拔掉隨身碟後：第一次編譯照樣跑完、裝到完成"
}

# U2：從隨身碟按兩下 Windows安裝.bat，安裝程式說「可以拔下來」就拔掉：安裝程式之後還要能開別的程式，
#     .bat 也不能再回隨身碟讀剩下的幾行（不然安裝完視窗直接關掉，學員看不到「完成！」）。安裝程式用假的，幾秒跑完
if (Want "u2") {
  $stick = Join-Path $work "u2-stick"; $srv = Join-Path $work "u2-srv"; $flag = Join-Path $work "u2-unplugged.flag"
  New-Item -ItemType Directory -Force (Join-Path $stick "babit安裝包"), $srv | Out-Null
  Copy-Item (Join-Path $repo "usb\Windows安裝.bat") (Join-Path $stick "babit安裝包")
  $fake = @(
    'Write-Host "  fake installer"',
    'Write-Host "  隨身碟用完了，可以拔下來給下一位同學"',
    ('for ($i = 0; $i -lt 150 -and -not (Test-Path "' + $flag + '"); $i++) { Start-Sleep -Milliseconds 200 }'),
    'Write-Host ("  after unplug: " + ((& cmd /c echo child-ok 2>&1) | Out-String).Trim())',
    'Write-Host "  完成！"'
  ) -join "`r`n"
  [IO.File]::WriteAllText((Join-Path $srv "install.ps1"), $fake, (New-Object System.Text.UTF8Encoding($true)))
  $port = 8936
  $web = Start-Process node -ArgumentList ('"' + (Join-Path $PSScriptRoot "fake_raw.js") + '"'), ('"' + $srv + '"'), $port -PassThru -WindowStyle Hidden
  $drv = Free-Drive
  & subst $drv $stick | Out-Null
  $usbPack = "$drv\babit安裝包"
  $log = Join-Path $work "u2.log"
  $unplugged = $false; $p = $null
  $saved = Set-Envs @{ BABIT_SCRIPT_URL = "http://127.0.0.1:$port/install.ps1" }
  try {
    for ($i = 0; $i -lt 50; $i++) { try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/install.ps1" | Out-Null; break } catch { Start-Sleep -Milliseconds 200 } }
    # 跟按兩下一樣：工作位置是 .bat 所在的資料夾
    $p = Start-Process cmd -ArgumentList "/c", ('""' + $usbPack + '\Windows安裝.bat" > "' + $log + '" 2>&1"') -WorkingDirectory $usbPack -PassThru -WindowStyle Hidden
    if (Wait-Log $log $p "可以拔下來" 60) { & subst $drv /d | Out-Null; $unplugged = $true; Set-Content $flag "x" }
    $null = Wait-Log $log $p "任意鍵|any key" 60
  } finally {
    Restore-Envs $saved
    if (-not $unplugged) { & subst $drv /d 2>$null | Out-Null }
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }   # 停在「按任意鍵」
    Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue
  }
  $o = Read-Log $log
  Say-Check ($unplugged -and ($o -match "after unplug: child-ok")) "U2 從隨身碟按兩下、照提示拔掉之後：安裝程式還開得起別的程式"
  Say-Check ($unplugged -and ($o -match "完成！") -and ($o -match "任意鍵|any key") -and ($o -notmatch "找不到|cannot find")) "U2 拔掉之後 .bat 照樣跑到「按任意鍵」，不用再回隨身碟讀"
}

# U3（只在指定 u3 時跑：全新安裝約 8 GB、幾分鐘，跑完刪掉）：從隨身碟（subst 模擬，用桌面那份安裝包）按兩下 Windows安裝.bat，
#     說「可以拔下來」就拔掉：證明全新安裝在那之後真的不再讀隨身碟，裝得完、視窗也停在「按任意鍵」。
#     安裝程式由本機模擬的 GitHub raw 提供（這個 repo 的 install.ps1）；安裝包裡的 .bat 要先換成 usb\ 這一份
if ($only -contains "u3") {
  $packBat = Join-Path $pack "Windows安裝.bat"
  $same = (Test-Path $packBat) -and ((Get-FileHash $packBat).Hash -eq (Get-FileHash (Join-Path $repo "usb\Windows安裝.bat")).Hash)
  Say-Check $same "U3 安裝包裡的 Windows安裝.bat 跟 usb\ 的一樣"
  if ($same) {
    $d = Join-Path $work "u3"; $log = Join-Path $work "u3.log"
    $port = 8936
    $web = Start-Process node -ArgumentList ('"' + (Join-Path $PSScriptRoot "fake_raw.js") + '"'), ('"' + $repo + '"'), $port -PassThru -WindowStyle Hidden
    $drv = Free-Drive
    & subst $drv (Split-Path -Parent $pack) | Out-Null
    $usbPack = "$drv\" + (Split-Path -Leaf $pack)
    $unplugged = $false; $p = $null; $tPull = $null; $tDone = $null
    $saved = Set-Envs (With @{ BABIT_DEST = $d; BABIT_SCRIPT_URL = "http://127.0.0.1:$port/install.ps1" })
    try {
      for ($i = 0; $i -lt 50; $i++) { try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/install.ps1" | Out-Null; break } catch { Start-Sleep -Milliseconds 200 } }
      $t0 = Get-Date
      $p = Start-Process cmd -ArgumentList "/c", ('""' + $usbPack + '\Windows安裝.bat" > "' + $log + '" 2>&1"') -WorkingDirectory $usbPack -PassThru -WindowStyle Hidden
      if (Wait-Log $log $p "可以拔下來" 900) { & subst $drv /d | Out-Null; $unplugged = $true; $tPull = ((Get-Date) - $t0).TotalSeconds }
      if (Wait-Log $log $p "任意鍵|any key" 900) { $tDone = ((Get-Date) - $t0).TotalSeconds }
    } finally {
      Restore-Envs $saved
      if (-not $unplugged) { & subst $drv /d 2>$null | Out-Null }
      if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
      Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue
    }
    $o = Read-Log $log
    $ok = $unplugged -and ($o -match "WASM build OK") -and ($o -match "完成！") -and ($o -notmatch "沒有完成") -and ($o -match "任意鍵|any key") -and (Head-Ok $d)
    Say-Check $ok "U3 全新安裝：照提示拔掉隨身碟後照樣裝完，視窗停在「按任意鍵」"
    $iu = $o.IndexOf("可以拔下來")
    Say-Check (($iu -ge 0) -and ($o.IndexOf("安裝 ESP32 核心") -gt $iu) -and ($o.IndexOf("安裝網頁預覽編譯器") -gt $iu)) "U3 兩個解壓縮（ESP32 核心、網頁預覽編譯器）都在說「可以拔下來」之後"
    if ($tPull -and $tDone) { Write-Host ("       隨身碟插了 {0:N0} 秒，整個安裝 {1:N0} 秒（這台電腦、安裝包在硬碟上）" -f $tPull, $tDone) }
    Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue
  }
}

Write-Host (if2 $script:bad ("`n" + $script:bad + " 項不符 → FAIL") "`n全部通過 → PASS")
exit (if2 $script:bad 1 0)
