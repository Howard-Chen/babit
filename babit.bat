@echo off
rem babit launcher (Windows): update with the portable git, start the compile station, open the tool page.
rem Double-click this file, or the "babit" shortcut that install.ps1 puts on the desktop.
rem Test hooks: BATOPIXEL_PORT (default 8930), BABIT_NO_BROWSER=1 (do not open the browser).
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
if "%BATOPIXEL_PORT%"=="" set "BATOPIXEL_PORT=8930"
set "URL=http://localhost:%BATOPIXEL_PORT%"
rem "updated" = started again by the new copy of this file right after an update (see step 1)
if "%~1"=="updated" goto node

echo.
echo    babit - LED matrix animation tool
echo    ------------------------------------------

rem 1) update: git pull with the portable git in tools\git (offline or changed files = keep the current version).
rem    The pull can replace this very file while cmd is running it, and cmd would go on reading the new file
rem    from the old byte offset. So the pull and the restart of the new copy share one line: cmd reads a
rem    whole line before running it, and "exit /b" ends this old copy before it reads anything else.
set "GITDIR=%ROOT%tools\git"
if not exist "%GITDIR%\cmd\git.exe" goto node
echo    Checking for updates...
set "GIT_EXEC_PATH=%GITDIR%\mingw64\libexec\git-core"
set "PATH=%GITDIR%\mingw64\bin;%GITDIR%\usr\bin;%PATH%"
"%GITDIR%\cmd\git.exe" -C "%ROOT%." pull --ff-only --quiet && (call "%~f0" updated & exit /b)
echo    Update skipped ^(no network, or files were changed^). Using the current version.

:node
rem 2) node: the copy inside emsdk (students do not install Node.js)
set "NODE="
for /d %%D in ("%ROOT%tools\emsdk\node\*") do if exist "%%D\node.exe" set "NODE=%%D\node.exe"
if not defined NODE (
  where node >nul 2>nul && set "NODE=node"
)
if not defined NODE (
  echo    Cannot find node.exe - please run install.ps1 again.
  pause
  exit /b 1
)

rem 3) station already running: just open the page
curl -s -o nul -m 1 "%URL%/"
if not errorlevel 1 goto open
echo    Starting the compile station ^(closing its window stops it^)...
rem cmd /k keeps the window open if the station stops at once, so its error message stays readable
start "babit station" /min cmd /k ""%NODE%" "%ROOT%station\server.js""
for /l %%i in (1,1,30) do (
  curl -s -o nul -m 1 "%URL%/" && goto open
  ping -n 2 127.0.0.1 >nul
)
echo    The compile station did not start - see the "babit station" window.
pause
exit /b 1

:open
if "%BABIT_NO_BROWSER%"=="1" goto done
start "" "%URL%"
:done
endlocal
