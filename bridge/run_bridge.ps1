# Start the BatoPixel Art-Net bridge (local only, separate from the compile station).
# Listens on ws://127.0.0.1:8940 for 8x8 frames from the browser and sends Art-Net UDP
# to the controller configured in config.json. Zero dependencies.
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
