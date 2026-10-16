# Draw the STATIC part of the example-card row (page background, section title, card boxes,
# empty thumbnail boxes, card titles and descriptions) with GDI+, at a given page zoom.
# The animated thumbnails are composited on top later by gen_gallery_gif.js.
#
# Layout mirrors station/app.html (.gallery / .gtitle / .cards / .card / .thumb / .cname / .cdesc).
# All text arrives through the UTF-8 JSON config, so this file stays pure ASCII (no BOM needed).
param([string]$In, [string]$OutBmp, [string]$OutLayout)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$cfg = Get-Content -Raw -Encoding UTF8 $In | ConvertFrom-Json
$S = [double]$cfg.scale

function Col([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# ---- layout in device pixels (CSS px * zoom), rounded so thumbnails land on whole pixels ----
$M     = [int][Math]::Round(16 * $S)      # outer margin around the section
$cardW = [int][Math]::Round(134 * $S)   # 134 = border 2 + padding 20 + thumbnail 112 (matches app.html)
$gap   = [int][Math]::Round(10 * $S)
$pad   = [int][Math]::Round(10 * $S)
$bw    = 1                                 # 1px border, like Chrome snaps it at 150%
$thumb = [int](112 * $S)
if ($thumb % 8 -ne 0) { throw "thumbnail size $thumb is not a multiple of 8; pick a zoom where 112*zoom divides by 8" }
$rCard  = [single](12 * $S)
$rThumb = [single](8 * $S)

$fontName = 'Microsoft JhengHei UI'
$px = [System.Drawing.GraphicsUnit]::Pixel
$fTitle = New-Object System.Drawing.Font($fontName, [single](12 * $S), $px)
$fName  = New-Object System.Drawing.Font($fontName, [single](13 * $S), $px)
$fDesc  = New-Object System.Drawing.Font($fontName, [single](11 * $S), $px)
$lhTitle = 12 * $S * 1.35
$lhName  = 13 * $S * 1.35
$lhDesc  = 11 * $S * 1.35

$measBmp = New-Object System.Drawing.Bitmap(4, 4)
$meas = [System.Drawing.Graphics]::FromImage($measBmp)
$meas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$sf = [System.Drawing.StringFormat]::GenericTypographic

# Greedy wrap like a browser: CJK may break between any two characters, an ASCII word stays whole,
# and closing punctuation never starts a line (it may hang slightly past the edge instead).
$noStart = [string]::new([char[]]@(0xFF0C, 0x3002, 0xFF1B, 0x3001, 0xFF1A, 0xFF09, 0x300D, 0xFF01, 0xFF1F))
function Wrap([string]$text, $font, [double]$maxW) {
  $lines = New-Object System.Collections.Generic.List[string]
  $cur = ''
  $i = 0
  while ($i -lt $text.Length) {
    $j = $i + 1
    if ($text[$i] -match '[A-Za-z0-9]') {
      while ($j -lt $text.Length -and $text[$j] -match '[A-Za-z0-9]') { $j++ }
    }
    $tok = $text.Substring($i, $j - $i)
    $try = $cur + $tok
    $w = $meas.MeasureString($try, $font, 100000, $sf).Width
    if ($w -gt $maxW -and $cur.Length -gt 0 -and -not $noStart.Contains($tok)) {
      $lines.Add($cur.TrimEnd())
      $cur = $tok.TrimStart()
    } else {
      $cur = $try
    }
    $i = $j
  }
  if ($cur.Length -gt 0) { $lines.Add($cur) }
  return ,$lines
}

$innerW = $cardW - 2 * $bw - 2 * $pad
$wrapped = @()
$maxLines = 1
foreach ($c in $cfg.cards) {
  $l = Wrap $c.desc $fDesc $innerW
  $wrapped += ,$l
  if ($l.Count -gt $maxLines) { $maxLines = $l.Count }
}

$nameTopOff = $bw + $pad + $thumb + [Math]::Round(8 * $S)
$descTopOff = $nameTopOff + $lhName + 3 * $S
$cardH = [int][Math]::Ceiling($descTopOff + $maxLines * $lhDesc + $pad + $bw)
$cardsTop = [int]($M + [Math]::Ceiling($lhTitle) + [Math]::Round(8 * $S))
$n = @($cfg.cards).Count
$W = 2 * $M + $n * $cardW + ($n - 1) * $gap
$H = $cardsTop + $cardH + $M

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear((Col '#0d0f12'))

# CSS puts the glyphs in the middle of the line box (half-leading); emulate that
function DrawLine([string]$s, $font, [string]$hex, [double]$x, [double]$lineTop, [double]$lineH) {
  $fh = $font.GetHeight($g)
  $y = $lineTop + ($lineH - $fh) / 2
  $br = New-Object System.Drawing.SolidBrush((Col $hex))
  $g.DrawString($s, $font, $br, [single]$x, [single]$y, $sf)
  $br.Dispose()
}

DrawLine $cfg.title $fTitle '#78828d' $M $M $lhTitle

$thumbs = @()
$fillCard = New-Object System.Drawing.SolidBrush((Col '#14171c'))
$fillThumb = New-Object System.Drawing.SolidBrush((Col '#0d0f12'))
$pen = New-Object System.Drawing.Pen((Col '#262b33'), 1)
for ($i = 0; $i -lt $n; $i++) {
  $c = @($cfg.cards)[$i]
  $x = $M + $i * ($cardW + $gap)
  $y = $cardsTop
  $path = RoundRect $x $y $cardW $cardH $rCard
  $g.FillPath($fillCard, $path)
  $border = RoundRect ($x + 0.5) ($y + 0.5) ($cardW - 1) ($cardH - 1) ($rCard - 0.5)
  $g.DrawPath($pen, $border)
  $tx = $x + $bw + $pad
  $ty = $y + $bw + $pad
  $g.FillPath($fillThumb, (RoundRect $tx $ty $thumb $thumb $rThumb))
  $thumbs += [pscustomobject]@{ x = [int]$tx; y = [int]$ty; size = $thumb }
  DrawLine $c.title $fName '#d7e0ea' $tx ($y + $nameTopOff) $lhName
  $lines = $wrapped[$i]
  for ($k = 0; $k -lt $lines.Count; $k++) {
    DrawLine $lines[$k] $fDesc '#78828d' $tx ($y + $descTopOff + $k * $lhDesc) $lhDesc
  }
}
$g.Dispose()
$bmp.Save($OutBmp, [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

$layout = [pscustomobject]@{ width = $W; height = $H; radius = $rThumb; thumbs = $thumbs; descLines = $maxLines }
[System.IO.File]::WriteAllText($OutLayout, ($layout | ConvertTo-Json -Depth 4))
Write-Output ("background {0}x{1}, cards {2}, desc lines {3}" -f $W, $H, $n, $maxLines)
