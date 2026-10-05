Add-Type -AssemblyName System.Drawing

function New-FanIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $bgColor = [System.Drawing.Color]::FromArgb(255, 2, 6, 23)      # slate-950
    $accentColor = [System.Drawing.Color]::FromArgb(255, 34, 211, 238)  # cyan-400
    $hubColor = [System.Drawing.Color]::FromArgb(255, 8, 47, 73)

    $pad = [Math]::Max(1, [int]($size * 0.06))
    $rect = New-Object System.Drawing.Rectangle $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
    $radius = [int]($size * 0.22)

    # rounded square background
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $bgBrush = New-Object System.Drawing.SolidBrush $bgColor
    $g.FillPath($bgBrush, $path)

    # fan blades: 3 rounded ellipses rotated around center
    $cx = $size / 2.0
    $cy = $size / 2.0
    $bladeLen = $size * 0.30
    $bladeWidth = $size * 0.16
    $accentBrush = New-Object System.Drawing.SolidBrush $accentColor

    for ($i = 0; $i -lt 3; $i++) {
        $angle = $i * 120
        $state = $g.Save()
        $g.TranslateTransform($cx, $cy)
        $g.RotateTransform($angle)
        $bladeRect = New-Object System.Drawing.RectangleF (-$bladeWidth/2), (-$bladeLen), $bladeWidth, $bladeLen
        $g.FillEllipse($accentBrush, $bladeRect)
        $g.Restore($state)
    }

    # center hub
    $hubR = $size * 0.14
    $hubBrush = New-Object System.Drawing.SolidBrush $hubColor
    $g.FillEllipse($hubBrush, ($cx - $hubR), ($cy - $hubR), ($hubR * 2), ($hubR * 2))
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
    $dotR = $size * 0.05
    $g.FillEllipse($whiteBrush, ($cx - $dotR), ($cy - $dotR), ($dotR * 2), ($dotR * 2))

    $g.Dispose()
    return $bmp
}

$outDir = "C:\air app\build-resources"

# Tray / misc PNGs
foreach ($size in 16, 32, 48, 64, 256) {
    $bmp = New-FanIcon $size
    $bmp.Save("$outDir\icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

Copy-Item "$outDir\icon-32.png" "$outDir\tray-icon.png" -Force
Copy-Item "$outDir\icon-16.png" "$outDir\tray-icon@1x.png" -Force

Write-Output "Generated PNGs"
