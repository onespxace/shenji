// 验证"分区二次识别"能否救回失败字段：
//  1) 签名带单独裁出、放大、用 chi_sim 识别
//  2) 金额区裁出、用 eng + 数字白名单识别
//  3) 与首遍结果合并，看失败字段能否补回
// 用法：node scripts/cmp-twopass.mjs
import path from 'node:path'
import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createWorker, PSM } from 'tesseract.js'
import { BENCH_DIR, GROUND_TRUTH } from './bench-ocr.mjs'

const EXPECT = GROUND_TRUTH['A-scan'].expect
const norm = (t) => String(t || '').replace(/[\s　]/g, '').replace(/O/g, '0').replace(/[lI]/g, '1')
const hit = (flat, n) => flat.includes(norm(n))

function scoreFields(text) {
  const f = norm(text)
  return {
    date: hit(f, EXPECT.date),
    voucherNo: hit(f, EXPECT.voucherNo),
    summary: hit(f, EXPECT.summary),
    amount: hit(f, EXPECT.amount),
    attachment: hit(f, EXPECT.attachment),
    a1: hit(f, EXPECT.accounts[0]),
    a2: hit(f, EXPECT.accounts[1]),
    s1: hit(f, EXPECT.signatures[0]),
    s2: hit(f, EXPECT.signatures[1]),
    s3: hit(f, EXPECT.signatures[2])
  }
}
const totalFields = 10

/** 用 PowerShell 裁剪并放大指定区域 */
function cropZoom(src, dst, xPct, yPct, wPct, hPct, zoom) {
  const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile('${src.replace(/\\/g, '\\\\')}')
$sx=[int]($img.Width*${xPct}); $sy=[int]($img.Height*${yPct})
$sw=[int]($img.Width*${wPct}); $sh=[int]($img.Height*${hPct})
$dw=[int]($sw*${zoom}); $dh=[int]($sh*${zoom})
$dst=New-Object System.Drawing.Bitmap $dw,$dh,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g=[System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode='HighQualityBicubic'; $g.SmoothingMode='HighQuality'; $g.PixelOffsetMode='HighQuality'
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($img,(New-Object System.Drawing.Rectangle 0,0,$dw,$dh),$sx,$sy,$sw,$sh,[System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose(); $img.Dispose()
$dst.Save('${dst.replace(/\\/g, '\\\\')}',[System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
`
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps])
}

const keys = Object.keys(GROUND_TRUTH)
const main = await createWorker(['chi_sim', 'eng'], 1, {
  langPath: path.resolve('public/ocr/tessdata'), gzip: false, cachePath: 'tp-main', logger: () => {}
})
await main.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })

const chi = await createWorker(['chi_sim'], 1, {
  langPath: path.resolve('public/ocr/tessdata'), gzip: false, cachePath: 'tp-chi', logger: () => {}
})
await chi.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: '1' })

const eng = await createWorker(['eng'], 1, {
  langPath: path.resolve('public/ocr/tessdata'), gzip: false, cachePath: 'tp-eng', logger: () => {}
})
await eng.setParameters({
  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  tessedit_char_whitelist: '0123456789.,-()¥￥ '
})

let pass1 = 0
let merged = 0
const details = []
for (const key of keys) {
  const file = path.join(BENCH_DIR, `${key}.png`)
  const first = (await main.recognize(file)).data.text
  const f1 = scoreFields(first)

  // 签名带：底部 22%，3 倍放大，仅用中文模型、单行模式
  const signCrop = path.join(BENCH_DIR, `${key}@sign.png`)
  cropZoom(file, signCrop, 0.02, 0.74, 0.96, 0.22, 3)
  const signText = (await chi.recognize(signCrop)).data.text

  // 金额区：右侧 40%，3 倍放大，仅用英文模型 + 数字白名单
  const amtCrop = path.join(BENCH_DIR, `${key}@amt.png`)
  cropZoom(file, amtCrop, 0.6, 0.12, 0.4, 0.62, 3)
  const amtText = (await eng.recognize(amtCrop)).data.text

  const combined = `${first}\n${signText}\n${amtText}`
  const f2 = scoreFields(combined)

  const c1 = Object.values(f1).filter(Boolean).length
  const c2 = Object.values(f2).filter(Boolean).length
  pass1 += c1
  merged += c2
  const gained = Object.keys(f2).filter((k) => !f1[k] && f2[k])
  details.push(`  ${GROUND_TRUTH[key].label.padEnd(12)} pass1 ${c1}/${totalFields} -> merged ${c2}/${totalFields}   新增: ${gained.join(',') || '无'}`)
}

await main.terminate()
await chi.terminate()
await eng.terminate()

console.log('\n===== 首遍 vs 分区二次识别合并 =====')
details.forEach((d) => console.log(d))
console.log(`\n首遍合计      ${pass1}/${keys.length * totalFields}  ${((pass1 / (keys.length * totalFields)) * 100).toFixed(1)}%`)
console.log(`二次识别后    ${merged}/${keys.length * totalFields}  ${((merged / (keys.length * totalFields)) * 100).toFixed(1)}%`)
