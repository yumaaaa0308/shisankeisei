Add-Type -AssemblyName System.Drawing

function New-Icon {
    param(
        [int]$Size,
        [string]$OutPath,
        [double]$ContentScale = 0.62
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # 背景(角丸なしの塗りつぶし。マスカブル/通常どちらにも安全)
    $bgColor = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)   # #0f172a
    $accent  = [System.Drawing.Color]::FromArgb(255, 91, 141, 239) # #5b8def
    $g.Clear($bgColor)

    # 中央にシンプルな右肩上がりの折れ線+丸(資産成長のイメージ)
    $cx = $Size / 2.0
    $cy = $Size / 2.0
    $r  = $Size * $ContentScale / 2.0

    $pen = New-Object System.Drawing.Pen($accent, [Math]::Max(2, $Size * 0.045))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $p1 = New-Object System.Drawing.PointF(($cx - $r), ($cy + $r * 0.5))
    $p2 = New-Object System.Drawing.PointF(($cx - $r * 0.2), ($cy - $r * 0.1))
    $p3 = New-Object System.Drawing.PointF(($cx + $r * 0.35), ($cy + $r * 0.25))
    $p4 = New-Object System.Drawing.PointF(($cx + $r), ($cy - $r * 0.7))
    $points = @($p1, $p2, $p3, $p4)
    $g.DrawLines($pen, $points)

    $dotBrush = New-Object System.Drawing.SolidBrush($accent)
    $dotR = [Math]::Max(2, $Size * 0.05)
    $g.FillEllipse($dotBrush, $p4.X - $dotR, $p4.Y - $dotR, $dotR * 2, $dotR * 2)

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconsDir = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

New-Icon -Size 192 -OutPath (Join-Path $iconsDir "icon-192.png") -ContentScale 0.62
New-Icon -Size 512 -OutPath (Join-Path $iconsDir "icon-512.png") -ContentScale 0.62
New-Icon -Size 512 -OutPath (Join-Path $iconsDir "icon-maskable-512.png") -ContentScale 0.42
New-Icon -Size 180 -OutPath (Join-Path $iconsDir "apple-touch-icon.png") -ContentScale 0.62

Write-Output "Icons generated in $iconsDir"
