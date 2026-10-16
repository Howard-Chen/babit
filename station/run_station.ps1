# Start the BatoPixel compile station on http://localhost:8930
# Node is auto-detected: system install first, then emsdk's bundled copy.
# Compiler paths (emsdk / arduino-cli) are resolved inside server.js and can be
# overridden with BATOPIXEL_EMSDK / BATOPIXEL_ARDUINO_CLI / BATOPIXEL_FQBN.
# NOTE: ASCII-only comments on purpose (PS 5.1 reads BOM-less files as ANSI).
$node = $null
foreach ($c in @($env:BATOPIXEL_NODE, "C:/Program Files/nodejs/node.exe",
                 "C:/Program Files (x86)/nodejs/node.exe")) {
  if ($c -and (Test-Path $c)) { $node = $c; break }
}
if (-not $node) {
  $emsdk = if ($env:BATOPIXEL_EMSDK) { $env:BATOPIXEL_EMSDK } else { "D:/CSH/CODE/emsdk" }
  $found = Get-ChildItem (Join-Path $emsdk "node") -Filter node.exe -Recurse -ErrorAction SilentlyContinue |
           Select-Object -First 1
  if ($found) { $node = $found.FullName }
}
if (-not $node) {
  Write-Host "Node.js not found. Install it, or set BATOPIXEL_NODE. See SETUP.md" -ForegroundColor Red
  exit 1
}

& $node "$PSScriptRoot/server.js"
