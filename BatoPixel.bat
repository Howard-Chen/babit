@echo off
chcp 950 >nul
title BatoPixel
setlocal

rem =====================================================================
rem  BatoPixel 快速啟動器
rem    編譯站   必要   http://localhost:8930  貼碼、預覽、燒錄
rem    Art-Net  選用   只在燈板控制器連得上時才啟動，避免在別的網路空送廣播
rem  燈板 IP 改下面這一行；其餘設定在 bridge\config.json
rem =====================================================================
set "PANEL=192.168.0.9"

set "ROOT=%~dp0"
set "PS=powershell -NoProfile -ExecutionPolicy Bypass -File"
set "URL=http://localhost:8930"
cd /d "%ROOT%"

echo.
echo    BatoPixel 點陣動畫工具
echo    ------------------------------------------------
echo.

rem ---------- 1) 編譯站 ----------
curl -s -o nul -m 1 %URL%/
if not errorlevel 1 goto station_up
if not exist "%ROOT%station\run_station.ps1" goto missing
start "BatoPixel Station" /min %PS% "%ROOT%station\run_station.ps1"
echo      編譯站    啟動中
goto artnet
:station_up
echo      編譯站    已在執行

rem ---------- 2) Art-Net 橋 ----------
:artnet
curl -s -o nul -m 1 http://127.0.0.1:8940/
if not errorlevel 1 goto bridge_up
if not exist "%ROOT%bridge\run_bridge.ps1" goto wait
ping -n 1 -w 600 %PANEL% >nul 2>nul
if errorlevel 1 goto no_panel
start "BatoPixel Art-Net Bridge" /min %PS% "%ROOT%bridge\run_bridge.ps1"
echo      Art-Net   啟動中，燈板 %PANEL% 在線
goto wait
:bridge_up
echo      Art-Net   已在執行
goto wait
:no_panel
echo      Art-Net   跳過，找不到燈板 %PANEL%

rem ---------- 3) 等編譯站就緒 ----------
:wait
set /a n=0
:loop
curl -s -o nul -m 2 %URL%/
if not errorlevel 1 goto ready
set /a n+=1
if %n% geq 25 goto timeout
ping -n 2 127.0.0.1 >nul
goto loop

:ready
start "" %URL%
echo.
echo      就緒    %URL%    已開啟瀏覽器
echo      停止    關掉工作列上那一兩個 PowerShell 小視窗
echo.
timeout /t 6 /nobreak >nul 2>nul
exit /b 0

:timeout
echo.
echo      編譯站在 25 秒內沒有起來。
echo      手動執行看錯誤訊息：
echo        powershell -ExecutionPolicy Bypass -File "%ROOT%station\run_station.ps1"
echo      最常見原因是找不到 Node.js，安裝步驟見 SETUP.md
echo.
pause
exit /b 1

:missing
echo.
echo      在這個位置找不到 station\run_station.ps1：
echo        %ROOT%
echo      這個 .bat 必須留在 batopixel 專案資料夾裡，桌面上放的是連結。
echo.
pause
exit /b 1
