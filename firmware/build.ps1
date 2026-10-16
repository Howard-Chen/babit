# BatoPixel S0 建置腳本
# 用法：
#   .\build.ps1          只編譯，並列出偵測到的板子
#   .\build.ps1 COM5     編譯＋燒錄到指定序列埠
param([string]$Port = "")

$cli = "arduino-cli"
if (-not (Get-Command $cli -ErrorAction SilentlyContinue)) {
  $cli = "C:\Program Files\Arduino CLI\arduino-cli.exe"
}

$fqbn = "esp32:esp32:esp32s3:CDCOnBoot=cdc"
$sketch = Join-Path $PSScriptRoot "BatoPixelS0"

& $cli compile --fqbn $fqbn $sketch
if ($LASTEXITCODE -ne 0) {
  Write-Host "編譯失敗" -ForegroundColor Red
  exit 1
}

if ($Port -eq "") {
  Write-Host ""
  Write-Host "編譯完成。接上板子後查埠號，再執行 .\build.ps1 COM埠號 燒錄" -ForegroundColor Green
  & $cli board list
} else {
  & $cli upload -p $Port --fqbn $fqbn $sketch
}
