// OCR 前处理变体对比：逐项验证"放大 / 灰度 / 对比度拉伸 / 二值化"各自的真实收益。
// 结论以实测为准，不做假设。用法：node scripts/prep-bench.mjs --prep
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BENCH_DIR = path.join(webRoot, '.bench-ocr')

/** 四种变体，逐项叠加，用于定位真正的收益来源 */
export const VARIANTS = [
  { id: 'v1x', scale: 1, gray: false, stretch: false, binarize: false },
  { id: 'v2x', scale: 2, gray: false, stretch: false, binarize: false },
  { id: 'v2x-gray', scale: 2, gray: true, stretch: false, binarize: false },
  { id: 'v2x-gray-stretch', scale: 2, gray: true, stretch: true, binarize: false },
  { id: 'v2x-gray-stretch-bin', scale: 2, gray: true, stretch: true, binarize: true, binThreshold: 160 }
]

export function preprocessImage(src, dst, v) {
  const bool = (x) => (x ? '$true' : '$false')
  const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile('${src.replace(/\\/g, '\\\\')}')
$nw=[int]($img.Width*${v.scale})
if($nw -gt 2400){ $nw=2400 }
$nh=[int]($img.Height*($nw/$img.Width))
$big=New-Object System.Drawing.Bitmap $nw,$nh,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g=[System.Drawing.Graphics]::FromImage($big)
$g.InterpolationMode='HighQualityBicubic'
$g.SmoothingMode='HighQuality'
$g.PixelOffsetMode='HighQuality'
$g.DrawImage($img,0,0,$nw,$nh)
$g.Dispose(); $img.Dispose()
$rect=New-Object System.Drawing.Rectangle 0,0,$nw,$nh
$dd=$big.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadWrite,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride=$dd.Stride
$buf=New-Object byte[] ($stride*$nh)
[System.Runtime.InteropServices.Marshal]::Copy($dd.Scan0,$buf,0,$buf.Length)
$need=${bool(v.gray || v.stretch || v.binarize)}
if($need){
  $hist=New-Object int[] 256
  $gray=New-Object byte[] ($buf.Length)
  for($i=0;$i -lt $buf.Length;$i+=3){
    $l=[int](0.299*$buf[$i]+0.587*$buf[$i+1]+0.114*$buf[$i+2])
    if($l -lt 0){$l=0}; if($l -gt 255){$l=255}
    $gray[$i]=[byte]$l; $hist[$l]++
  }
  $total=$nw*$nh; $lo=0; $hi=255
  if(${bool(v.stretch)}){
    $acc=0
    for($x=0;$x -lt 256;$x++){ $acc+=$hist[$x]; if($acc -ge $total*0.02){ $lo=$x; break } }
    $acc=0
    for($x=255;$x -ge 0;$x--){ $acc+=$hist[$x]; if($acc -ge $total*0.02){ $hi=$x; break } }
    if($hi -le $lo){ $lo=0; $hi=255 }
  }
  $range=[double]($hi-$lo)
  for($i=0;$i -lt $buf.Length;$i+=3){
    $x=($gray[$i]-$lo)/$range
    if($x -lt 0){$x=0}; if($x -gt 1){$x=1}
    $val=[int](255*$x)
    if(${bool(v.binarize)}){ if($val -lt ${v.binThreshold || 160}){$val=0}else{$val=255} }
    $buf[$i]=[byte]$val; $buf[$i+1]=[byte]$val; $buf[$i+2]=[byte]$val
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($buf,0,$dd.Scan0,$buf.Length)
$big.UnlockBits($dd)
$big.Save('${dst.replace(/\\/g, '\\\\')}',[System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
`
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps])
}

if (process.argv.includes('--prep')) {
  const files = readdirSync(BENCH_DIR).filter((f) => f.endsWith('.png') && !f.includes('@')).sort()
  if (!files.length) {
    console.error('没有原始测试图，请先执行 node scripts/bench-ocr.mjs --make-images')
    process.exit(1)
  }
  for (const f of files) {
    for (const v of VARIANTS) {
      preprocessImage(path.join(BENCH_DIR, f), path.join(BENCH_DIR, f.replace('.png', `@${v.id}.png`)), v)
    }
    console.log(`已生成 ${f} 的 ${VARIANTS.length} 个变体`)
  }
}
