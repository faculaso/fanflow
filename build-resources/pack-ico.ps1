$dir = "C:\air app\build-resources"
$sizes = 16, 32, 48, 256
$pngBytes = @{}
foreach ($s in $sizes) {
    $pngBytes[$s] = [System.IO.File]::ReadAllBytes("$dir\icon-$s.png")
}

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms

# ICONDIR
$bw.Write([UInt16]0)      # reserved
$bw.Write([UInt16]1)      # type = icon
$bw.Write([UInt16]$sizes.Count)

$headerSize = 6 + (16 * $sizes.Count)
$offset = $headerSize

foreach ($s in $sizes) {
    $len = $pngBytes[$s].Length
    $wh = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([Byte]$wh)      # width
    $bw.Write([Byte]$wh)      # height
    $bw.Write([Byte]0)        # color count
    $bw.Write([Byte]0)        # reserved
    $bw.Write([UInt16]1)      # planes
    $bw.Write([UInt16]32)     # bit count
    $bw.Write([UInt32]$len)   # bytes in resource
    $bw.Write([UInt32]$offset)
    $offset += $len
}

foreach ($s in $sizes) {
    $bw.Write($pngBytes[$s])
}

$bw.Flush()
[System.IO.File]::WriteAllBytes("$dir\icon.ico", $ms.ToArray())
$bw.Close()
Write-Output "icon.ico written ($([System.IO.File]::ReadAllBytes("$dir\icon.ico")).Length bytes)"
