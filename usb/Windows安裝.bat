@echo off
rem babit installer (Windows): double-click this file inside the USB install folder.
rem The toolchains come from this folder (BABIT_PACK = the folder this file is in); the installer
rem script (install.ps1) and the babit program itself are downloaded from GitHub.
rem The USB stick may be pulled out once the installer says so (fewer sticks than students):
rem the working folder moves to the computer first, and everything after that is one ( ... ) block,
rem which cmd reads in full before running it, so cmd never goes back to the stick for more lines.
rem ASCII only on purpose: cmd reads .bat files in the system code page. Chinese messages are \u escapes.
rem Test hook: BABIT_SCRIPT_URL (default: install.ps1 on the GitHub main branch).
setlocal
set "BABIT_PACK=%~dp0"
set "BABIT_PACK=%BABIT_PACK:~0,-1%"
set "SRC=https://raw.githubusercontent.com/Howard-Chen/babit/main/install.ps1"
if not "%BABIT_SCRIPT_URL%"=="" set "SRC=%BABIT_SCRIPT_URL%"
cd /d "%SystemDrive%\"
(
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; $f = Join-Path $env:TEMP 'babit-install.ps1'; try { Invoke-WebRequest $env:SRC -OutFile $f -UseBasicParsing } catch { Write-Host ''; Write-Host ([regex]::Unescape('  \u3010\u5b89\u88dd\u6c92\u6709\u5b8c\u6210\u3011\u4e0b\u8f09\u4e0d\u5230\u5b89\u88dd\u7a0b\u5f0f\uff1a\u8acb\u78ba\u8a8d\u7db2\u8def\u9023\u7dda\uff0c\u518d\u6309\u5169\u4e0b\u4e00\u6b21\u3002')) -ForegroundColor Red; Write-Host ('  ' + $_.Exception.Message); Write-Host ([regex]::Unescape('  \u628a\u9019\u6bb5\u8a0a\u606f\u62cd\u7167\u7d66\u8001\u5e2b\u3002')); exit 1 }; & $f; Remove-Item $f -ErrorAction SilentlyContinue"
  echo.
  pause
  exit /b
)
