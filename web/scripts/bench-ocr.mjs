// 生成带标准答案的会计凭证测试图，覆盖从扫描件到手机翻拍的不同难度。
// 用法：node scripts/bench-ocr.mjs --make-images
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const BENCH_DIR = path.join(webRoot, '.bench-ocr')

// 每档难度的标准答案一致，便于横向比较不同配置的准确率
const EXPECT = {
  date: '2024',
  voucherNo: '001',
  summary: '投资',
  accounts: ['银行存款', '实收资本'],
  amount: '300000.00',
  attachment: '2',
  signatures: ['张三', '李四', '王五']
}

export const GROUND_TRUTH = {
  'A-scan': { label: 'A 扫描件', expect: EXPECT },
  'B-skew': { label: 'B 轻微倾斜', expect: EXPECT },
  'C-lowcontrast': { label: 'C 低对比度', expect: EXPECT },
  'D-photo': { label: 'D 手机翻拍', expect: EXPECT }
}

// ink：文字灰度（0=纯黑最清晰，255=几乎不可见）；deg 旋转；noise 噪点；jpeg 压缩质量
// 注意：必须是不透明的灰度，不能用 alpha，否则会出现白底白字。
const PROFILES = {
  'A-scan': { ink: 0, deg: 0, noise: 0, jpeg: 100, fontBody: 16 },
  'B-skew': { ink: 25, deg: -2.2, noise: 0, jpeg: 80, fontBody: 16 },
  'C-lowcontrast': { ink: 118, deg: 0, noise: 14, jpeg: 88, fontBody: 16 },
  'D-photo': { ink: 168, deg: -1.4, noise: 26, jpeg: 58, fontBody: 15 }
}

function ps(key, profile) {
  const out = path.join(BENCH_DIR, key + '.png')
  const jpg = path.join(BENCH_DIR, key + '.jpg')
  const ink = profile.ink
  const d = profile.deg
  const n = profile.noise
  const fb = profile.fontBody
  return `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$W=1180; $H=680
$bmp=New-Object System.Drawing.Bitmap $W,$H
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode='AntiAlias'; $g.TextRenderingHint='AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::White)
$inkBrush=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,${ink},${ink},${ink}))
$fTitle=New-Object System.Drawing.Font('Microsoft YaHei',28,[System.Drawing.FontStyle]::Bold)
$fHead=New-Object System.Drawing.Font('Microsoft YaHei',${fb},[System.Drawing.FontStyle]::Bold)
$fBody=New-Object System.Drawing.Font('Microsoft YaHei',${fb})
$fMeta=New-Object System.Drawing.Font('Microsoft YaHei',15)
$fill=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(238,238,238))
$pen=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70,70,70),1.4)
$g.DrawString('记账凭证',$fTitle,$inkBrush,445,34)
$g.DrawString('2024年5月3日',$fMeta,$inkBrush,60,104)
$g.DrawString('凭证编号：记字001号',$fMeta,$inkBrush,300,104)
$g.DrawString('附件：2张',$fMeta,$inkBrush,690,104)
$cols=@(56,420,640,830,990); $top=158; $rh=64
$g.FillRectangle($fill,56,$top,934,$rh)
$rows=@(
  @('摘要','总账科目','明细科目','借方金额','贷方金额'),
  @('收到股东投资款','银行存款','建行基本户','300000.00',''),
  @('收到股东投资款','实收资本','杨云峰','','300000.00'),
  @('合计','','','300000.00','300000.00')
)
for($r=0;$r -lt 4;$r++){
  $y=$top+$rh*$r
  for($c=0;$c -lt 5;$c++){
    $v=$rows[$r][$c]
    if($v){
      $f=if($r -eq 0){$fHead}else{$fBody}
      $g.DrawString($v,$f,$inkBrush,($cols[$c]+10),($y+20))
    }
  }
}
for($r=0;$r -le 4;$r++){ $g.DrawLine($pen,56,($top+$rh*$r),990,($top+$rh*$r)) }
for($c=0;$c -le 5;$c++){ $x=if($c -eq 5){990}else{$cols[$c]}; $g.DrawLine($pen,$x,$top,$x,($top+$rh*4)) }
$sy=$top+$rh*4+46
$g.DrawString('制单：张三',$fMeta,$inkBrush,110,$sy)
$g.DrawString('审核：李四',$fMeta,$inkBrush,430,$sy)
$g.DrawString('记账：王五',$fMeta,$inkBrush,730,$sy)
$g.Dispose()
if(${d} -ne 0){
  $rot=New-Object System.Drawing.Bitmap $W,$H
  $gr=[System.Drawing.Graphics]::FromImage($rot)
  $gr.Clear([System.Drawing.Color]::White)
  $gr.TranslateTransform($W/2,$H/2); $gr.RotateTransform(${d}); $gr.TranslateTransform(-$W/2,-$H/2)
  $gr.InterpolationMode='HighQualityBicubic'
  $gr.DrawImage($bmp,0,0); $gr.Dispose(); $bmp.Dispose(); $bmp=$rot
}
# JPEG 压缩
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep=New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([long]${profile.jpeg})
$bmp.Save('${jpg.replace(/\\/g, '\\\\')}',$enc,$ep)
$bmp.Dispose()
# 叠加噪点后存为 PNG
$src=[System.Drawing.Image]::FromFile('${jpg.replace(/\\/g, '\\\\')}')
$dst=New-Object System.Drawing.Bitmap $W,$H,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$gd=[System.Drawing.Graphics]::FromImage($dst)
$gd.DrawImage($src,0,0,$W,$H); $gd.Dispose(); $src.Dispose()
if(${n} -gt 0){
  $rect=New-Object System.Drawing.Rectangle 0,0,$W,$H
  $dd=$dst.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::WriteOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $stride=$dd.Stride
  $buf=New-Object byte[] ($stride*$H)
  [System.Runtime.InteropServices.Marshal]::Copy($dd.Scan0,$buf,0,$buf.Length)
  $rng=New-Object Random 42
  for($i=0;$i -lt $buf.Length;$i+=3){
    $v=$rng.Next(-${n},${n})
    for($c=0;$c -lt 3;$c++){
      $x=[int]$buf[$i+$c]+$v
      if($x -lt 0){$x=0}
      if($x -gt 255){$x=255}
      $buf[$i+$c]=[byte]$x
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($buf,0,$dd.Scan0,$buf.Length)
  $dst.UnlockBits($dd)
}
$dst.Save('${out.replace(/\\/g, '\\\\')}',[System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
Remove-Item '${jpg.replace(/\\/g, '\\\\')}' -Force
`
}

if (process.argv.includes('--make-images')) {
  mkdirSync(BENCH_DIR, { recursive: true })
  for (const [key, profile] of Object.entries(PROFILES)) {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps(key, profile)])
    console.log(`已生成 ${GROUND_TRUTH[key].label}`)
  }
  writeFileSync(path.join(BENCH_DIR, 'ground-truth.json'), JSON.stringify(GROUND_TRUTH, null, 2), 'utf8')
  const files = readdirSync(BENCH_DIR).filter((f) => f.endsWith('.png'))
  console.log(`共 ${files.length} 张：${files.join('、')}`)
}
