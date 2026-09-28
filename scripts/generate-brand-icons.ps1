# Export the selected Rising Crest artwork at the sizes used by browsers and PWAs.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root 'assets/brand/rising-crest-original.png'
$source = [System.Drawing.Image]::FromFile($sourcePath)
$sizes = @(16, 32, 48, 180, 192, 512)
$crop = New-Object System.Drawing.Rectangle(247, 247, 760, 760)

try {
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)), $crop, [System.Drawing.GraphicsUnit]::Pixel)
      $bitmap.Save((Join-Path $root "public/workcrest-rising-crest-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $source.Dispose()
}

$faviconPath = Join-Path $root 'src/app/favicon.ico'
$faviconSizes = @(16, 32, 48)
$images = @($faviconSizes | ForEach-Object { [System.IO.File]::ReadAllBytes((Join-Path $root "public/workcrest-rising-crest-$_.png")) })
$stream = [System.IO.File]::Create($faviconPath)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$faviconSizes.Count)
  $offset = 6 + 16 * $faviconSizes.Count
  for ($index = 0; $index -lt $faviconSizes.Count; $index++) {
    $writer.Write([byte]$faviconSizes[$index])
    $writer.Write([byte]$faviconSizes[$index])
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$index].Length)
    $writer.Write([uint32]$offset)
    $offset += $images[$index].Length
  }
  foreach ($bytes in $images) {
    $writer.Write([byte[]]$bytes)
  }
} finally {
  $writer.Dispose()
  $stream.Dispose()
}
