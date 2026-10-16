# Build the standalone WASM preview module into preview/web/batopixel.js
# The station (station/run_station.ps1) does NOT need this; it compiles on demand.
# This exists for standalone use of preview/index.html and preview/test_node.js.
# NOTE: ASCII-only comments on purpose (PS 5.1 reads BOM-less files as ANSI).
$ErrorActionPreference = "Stop"

# --- locate emsdk + its bundled python (mirrors server.js logic) ---
# Paths use forward slashes; PowerShell accepts them on Windows.
$emsdk = $env:BATOPIXEL_EMSDK
if (-not $emsdk) {
  foreach ($c in @("D:/CSH/CODE/emsdk", "C:/emsdk", "$env:USERPROFILE/emsdk")) {
    if (Test-Path $c) { $emsdk = $c; break }
  }
}
if (-not $emsdk) {
  Write-Host "emsdk not found. Set BATOPIXEL_EMSDK or see SETUP.md" -ForegroundColor Red
  exit 1
}
$empy = (Get-ChildItem (Join-Path $emsdk "python") -Filter python.exe -Recurse -ErrorAction SilentlyContinue |
         Select-Object -First 1).FullName
$emnode = (Get-ChildItem (Join-Path $emsdk "node") -Filter node.exe -Recurse -ErrorAction SilentlyContinue |
           Select-Object -First 1).FullName
$emccpy = Join-Path $emsdk "upstream/emscripten/emcc.py"
if (-not $empy -or -not (Test-Path $emccpy)) {
  Write-Host "emsdk found at $emsdk but incomplete. Run: emsdk.py install latest" -ForegroundColor Red
  exit 1
}
# emsdk_env.bat is deliberately NOT used: it appends to PATH, which silently
# fails once the system PATH nears cmd's 2047-char limit. Set what we need here.
# The python dir must be on PATH: emcc.py shells out to the emcc.exe stub when
# rebuilding system libraries, and that stub needs python.
$env:PATH = (Join-Path $emsdk "upstream/emscripten") + ";" + (Join-Path $emsdk "upstream/bin") +
            ";" + (Split-Path $emnode) + ";" + (Split-Path $empy) + ";" + $env:PATH
$env:EMSDK = $emsdk
$env:EMSDK_PYTHON = $empy
$env:EMSDK_NODE = $emnode

$root = Split-Path $PSScriptRoot -Parent
$fw   = Join-Path $root "firmware/BatoPixelS0"
$out  = Join-Path $PSScriptRoot "web"
if (-not (Test-Path $out)) { New-Item -ItemType Directory $out | Out-Null }
# The default program (rainbow) is the student code for this build. wrapper.cpp
# includes "student.cpp". The rainbow has no helper functions after loop(), so it
# needs no prototypes (the station adds them for real student code, see
# station/sketch_prep.js).
Copy-Item (Join-Path $fw "BatoPixelS0.ino") (Join-Path $out "student.cpp") -Force

# Argument array, not backtick continuations: backtick + CRLF breaks the parser.
$emccArgs = @(
  $emccpy,
  (Join-Path $PSScriptRoot "wrapper.cpp"),
  "-I", $out,
  "-I", $fw,
  "-O1",
  "-sMODULARIZE=1",
  "-sEXPORT_NAME=createBatoPixel",
  "-sSINGLE_FILE=1",
  "-sEXPORTED_FUNCTIONS=_bp_tick,_bp_framebuffer,_bp_fps,_bp_width,_bp_height,_bp_pin,_bp_warn,_bp_tilt_set,_bp_audio_buffer,_bp_audio_capacity,_bp_audio_set_rate,_bp_audio_commit,_bp_audio_level,_bp_audio_band,_bp_audio_beat,_bp_audio_bands,_bp_audio_sens,_bp_audio_scale",
  "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32",
  "-o", (Join-Path $out "batopixel.js")
)

& $empy @emccArgs
if ($LASTEXITCODE -ne 0) {
  Write-Host "WASM build FAILED" -ForegroundColor Red
  exit 1
}
Write-Host "WASM build OK -> preview/web/batopixel.js" -ForegroundColor Green
