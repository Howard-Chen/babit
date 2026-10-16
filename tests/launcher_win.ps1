# 學員啟動器 babit.bat 的情境測試（Windows）：
#   i3 自動更新把 babit.bat 自己換成新版時，不能接著從舊檔的位置往下亂跑
#   i2 編譯站一啟動就失敗時，「babit station」視窗要留著讓人看錯誤訊息
# 用法：powershell -ExecutionPolicy Bypass -File tests\launcher_win.ps1 [i3] [i2]（不給＝全部）
# 需要桌面（或 BABIT_PACK）的「babit安裝包」（取可攜版 git）、開發機的 git 與 node；用連接埠 8936、8937。
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$only = @($args)
function Want([string]$n) { return ($only.Count -eq 0) -or ($only -contains $n) }

$repo = Split-Path -Parent $PSScriptRoot
$pack = if ($env:BABIT_PACK) { $env:BABIT_PACK } else { Join-Path ([Environment]::GetFolderPath("Desktop")) "babit安裝包" }
$work = if ($env:BABIT_TEST_DIR) { $env:BABIT_TEST_DIR } else { Join-Path $env:TEMP ("babit-tests\launcher-" + (Get-Date -Format "yyyyMMdd-HHmmss")) }
New-Item -ItemType Directory -Force $work | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$tar = Join-Path $env:SystemRoot "System32\tar.exe"

$script:bad = 0
function if2($c, $a, $b) { if ($c) { $a } else { $b } }
function Say-Check([bool]$ok, [string]$msg) { if (-not $ok) { $script:bad++ }; Write-Host ((if2 $ok "  ok   " "  FAIL ") + $msg) }
function Quiet([scriptblock]$cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"; try { & $cmd *> $null } finally { $ErrorActionPreference = $old } }

# 跑 babit.bat：輸入接 nul（pause 直接過）、輸出存檔。只等 cmd 自己結束：start 出來的編譯站視窗（cmd /k）
# 會繼承這邊的輸出管線，等管線關閉的話，要等到編譯站結束才會回來
function Run-Launcher([string]$bat, [string]$log, [string]$port) {
  $env:BATOPIXEL_PORT = $port; $env:BABIT_NO_BROWSER = "1"
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo "cmd.exe", ('/c call "' + $bat + '" < nul > "' + $log + '" 2>&1')
    $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    $p.WaitForExit()
  } finally { Remove-Item Env:BATOPIXEL_PORT, Env:BABIT_NO_BROWSER -ErrorAction SilentlyContinue }
  # 編譯站視窗（cmd /k）繼承了這個紀錄檔、還開著：用共用模式讀
  $fs = [IO.File]::Open($log, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try { return (New-Object IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Dispose() }
}
# 結束這次測試開的編譯站視窗（命令列裡有測試資料夾路徑的 cmd／node）
function Stop-TestStations([string]$under) {
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($under) -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

Write-Host "暫存資料夾：$work"

# I3：學員電腦上的 babit.bat 是目前這一版；GitHub 上的新版前面多了兩行。打開 babit 時 git pull 換掉了正在執行的檔案
if (Want "i3") {
  $origin = Join-Path $work "origin"; $student = Join-Path $work "student"
  New-Item -ItemType Directory -Force (Join-Path $origin "station") | Out-Null
  Copy-Item (Join-Path $repo "babit.bat") $origin
  [IO.File]::WriteAllText((Join-Path $origin ".gitignore"), "/tools/`n", $utf8)
  # 假的編譯站：留下「有啟動」的記號，回應幾秒後自己結束
  $srv = 'require("fs").writeFileSync(__dirname + "/started.txt", "ok"); require("http").createServer((q, r) => r.end("ok")).listen(Number(process.env.BATOPIXEL_PORT), "127.0.0.1"); setTimeout(() => process.exit(0), 4000);'
  [IO.File]::WriteAllText((Join-Path $origin "station\server.js"), $srv, $utf8)
  Quiet { git -C $origin init -q; git -C $origin add -A; git -C $origin -c user.name=t -c user.email=t@t commit -qm v1 }
  Quiet { git clone -q $origin $student }
  New-Item -ItemType Directory -Force (Join-Path $student "tools\git") | Out-Null
  $tgz = Get-ChildItem (Join-Path $pack "windows\git") -Filter "dugite-native-*.tar.gz" | Select-Object -First 1
  Quiet { & $tar -xf $tgz.FullName -C (Join-Path $student "tools\git") }
  $v2 = "rem new version, line 1`r`nrem new version, line 2`r`n" + [IO.File]::ReadAllText((Join-Path $origin "babit.bat"))
  [IO.File]::WriteAllText((Join-Path $origin "babit.bat"), $v2, (New-Object System.Text.ASCIIEncoding))
  Quiet { git -C $origin -c user.name=t -c user.email=t@t commit -qam v2 }
  $out = Run-Launcher (Join-Path $student "babit.bat") (Join-Path $work "i3.log") "8936"
  Start-Sleep -Seconds 1
  Stop-TestStations $student
  $head = (& git -C $student rev-parse HEAD).Trim(); $want = (& git -C $origin rev-parse HEAD).Trim()
  Say-Check ($head -eq $want) "I3 自動更新拿到新版"
  # 只能出現啟動器本來就會印的那幾行；舊版會冒出半行指令的錯誤，還在更新成功時說「Update skipped」
  $known = '^\s*$|babit - LED matrix animation tool|^\s*-{10,}\s*$|Checking for updates\.\.\.|Starting the compile station'
  $strange = @($out -split "`r?`n" | Where-Object { $_ -notmatch $known })
  Say-Check ($strange.Count -eq 0) ("I3 換掉自己之後沒有亂跑" + (if2 $strange.Count ("（多了：" + ($strange -join " / ") + "）") ""))
  Say-Check (Test-Path (Join-Path $student "station\started.txt")) "I3 更新後照常啟動編譯站"
}

# I2：編譯站一啟動就失敗（例如找不到工具）：等不到編譯站之後，「babit station」視窗要還在，裡面有錯誤訊息
if (Want "i2") {
  $root = Join-Path $work "student2"
  New-Item -ItemType Directory -Force (Join-Path $root "station") | Out-Null
  Copy-Item (Join-Path $repo "babit.bat") $root
  [IO.File]::WriteAllText((Join-Path $root "station\server.js"), 'console.error("test: station failed to start"); process.exit(1);', $utf8)
  $out = Run-Launcher (Join-Path $root "babit.bat") (Join-Path $work "i2.log") "8937"
  $alive = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and $_.Name -eq "cmd.exe" })
  Stop-TestStations $root
  Say-Check ($out -match "did not start") "I2 啟動器說編譯站沒起來"
  Say-Check ($alive.Count -gt 0) "I2 「babit station」視窗還在（看得到錯誤訊息）"
}

Write-Host (if2 $script:bad ("`n" + $script:bad + " 項不符 → FAIL") "`n全部通過 → PASS")
exit (if2 $script:bad 1 0)
