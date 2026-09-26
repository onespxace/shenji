// 从原始徽标截图生成圆形透明背景的品牌资源。
// 用法：node scripts/make-brand-assets.mjs
// 依赖：Windows 自带的 System.Drawing（通过 PowerShell 调用）
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brandDir = path.join(webRoot, 'src', 'assets', 'brand')
const source = process.argv[2] || path.join(webRoot, 'assets', 'brand', 'emblem-source.jpg')

if (!existsSync(source)) {
  console.error(`找不到徽标源文件：${source}\n用法：node scripts/make-brand-assets.mjs <源图片路径>`)
  process.exit(1)
}
mkdirSync(brandDir, { recursive: true })

// 圆心与半径来自对源图的像素扫描结果：直径 996，圆心 (542,534)。
const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = '${source.replace(/'/g, "''")}'
$outDir = '${brandDir.replace(/'/g, "''")}'
$centerX = 542; $centerY = 534; $diameter = 1004
$srcImg = [System.Drawing.Image]::FromFile($src)
$square = New-Object System.Drawing.Bitmap $diameter, $diameter, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($square)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::White)
$destX = [int]([double]$centerX - [double]$diameter / 2.0)
$destY = [int]([double]$centerY - [double]$diameter / 2.0)
$g.DrawImage($srcImg, [System.Drawing.Rectangle]::new(0, 0, $diameter, $diameter), $destX, $destY, $diameter, $diameter, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$srcImg.Dispose()

function Export-Emblem([int]$size, [string]$file) {
  $out = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gg = [System.Drawing.Graphics]::FromImage($out)
  $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $gg.Clear([System.Drawing.Color]::Transparent)

  # 预计算，避免 PowerShell 在 New-Object 参数里解析除法表达式
  $radius = [double]$size / 2.0
  $inset = [Math]::Max(0.5, $radius * 0.012)
  $diameterOut = [double]$size - 2.0 * $inset

  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $gg.FillEllipse($brush, $inset, $inset, $diameterOut, $diameterOut)
  $brush.Dispose()

  # 用 Region 裁剪成圆形，裁剪区外保持透明
  $region = [System.Drawing.Region]::new([System.Drawing.RectangleF]::new([single]$inset, [single]$inset, [single]$diameterOut, [single]$diameterOut))
  $gg.SetClip($region, [System.Drawing.Drawing2D.CombineMode]::Intersect)
  $dest = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $srcRect = [System.Drawing.Rectangle]::new(0, 0, $diameter, $diameter)
  $gg.DrawImage($square, $dest, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $region.Dispose()
  $gg.Dispose()
  $out.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  $kb = [Math]::Round((Get-Item $file).Length / 1KB, 1)
  "  -> $([System.IO.Path]::GetFileName($file)) ($size x $size, $kb KB)"
}

Export-Emblem 256 (Join-Path $outDir 'emblem-256.png')
Export-Emblem 128 (Join-Path $outDir 'emblem-128.png')
Export-Emblem 64 (Join-Path $outDir 'emblem-64.png')
$square.Dispose()
`

const output = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' })
console.log(`徽标资源已生成：\n${output.trim()}`)
