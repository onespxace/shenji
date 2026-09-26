// 拍摄质量与倾斜估计断言。
// 背景：实测发现"更好的前处理"反而降低准确率（80% → 52%），因此本模块
// 的目标不是美化图片，而是：(1) 拍不好时提前劝退；(2) 标出不可信字段。
import process from 'node:process'
import { QUALITY_THRESHOLDS, analyzeGray, assessQuality, estimateSkew } from '../src/lib/ocr-quality.js'

const results = []
const check = (name, condition, detail = '') => results.push({ name, passed: Boolean(condition), detail })

const W = 800
const H = 600

/** 构造合成灰度图：深色"文本行" + 可调对比度/模糊/倾斜 */
function makeImage({ contrast = 1, blur = 0, skew = false, width = W, height = H, rows = 5 } = {}) {
  let g = new Uint8Array(width * height).fill(235)
  for (let row = 0; row < rows; row += 1) {
    const y0 = 40 + row * 96
    if (skew) {
      // 真实倾斜：整行随页面旋转而上下平移（行内错切不会移动行中心，检测不出来）
      const tan = Math.tan((3 * Math.PI) / 180)
      for (let x = 16; x < width - 16; x += 1) {
        const y = Math.round(y0 + (x - width / 2) * tan)
        for (let dy = 0; dy < 20 && y + dy < height; dy += 1) {
          if (y + dy >= 0) g[(y + dy) * width + x] = Math.max(0, Math.min(255, 235 - 200 * contrast))
        }
      }
    } else {
      for (let y = y0; y < y0 + 20 && y < height; y += 1) {
        for (let x = 16; x < width - 16; x += 1) {
          if ((x % 12) < 6) g[y * width + x] = Math.max(0, Math.min(255, 235 - 200 * contrast))
        }
      }
    }
  }
  if (blur > 0) {
    const out = new Uint8Array(g.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0
        let n = 0
        for (let dy = -blur; dy <= blur; dy += 1) {
          for (let dx = -blur; dx <= blur; dx += 1) {
            const yy = y + dy
            const xx = x + dx
            if (yy >= 0 && yy < height && xx >= 0 && xx < width) { sum += g[yy * width + xx]; n += 1 }
          }
        }
        out[y * width + x] = n ? Math.round(sum / n) : 0
      }
    }
    g = out
  }
  return g
}

const toBin = (g) => {
  const bin = new Uint8Array(g.length)
  for (let i = 0; i < g.length; i += 1) bin[i] = g[i] < 128 ? 1 : 0
  return bin
}

// --- 统计特征 ---
const sharp = analyzeGray(makeImage({ contrast: 1 }), W, H)
const flat = analyzeGray(makeImage({ contrast: 0.06 }), W, H)
check('清晰图对比度高', sharp.std > 40, sharp.std.toFixed(1))
check('低对比图对比度低', flat.std < 15, flat.std.toFixed(1))
check('清晰度为正', sharp.sharpness > 0, sharp.sharpness.toFixed(1))
check('阈值常量齐备', ['minSharpness', 'minContrast', 'minBrightness', 'maxBrightness', 'maxSkewDeg', 'goodScore']
  .every((k) => typeof QUALITY_THRESHOLDS[k] === 'number'), JSON.stringify(QUALITY_THRESHOLDS))

// --- 质量结论 ---
const good = assessQuality(makeImage({ contrast: 1 }), W, H)
check('清晰图判为 good', good.level === 'good', `${good.level} / ${good.score}`)
check('清晰图无扣分原因', good.reasons.length === 0, good.reasons.join(';'))

const lowContrast = assessQuality(makeImage({ contrast: 0.05 }), W, H)
check('低对比图判为不合格', lowContrast.level !== 'good', `${lowContrast.level} / ${lowContrast.score}`)
check('低对比给出可执行建议', lowContrast.advice.length > 0, lowContrast.advice.join(' / '))
check('低对比原因含对比度', lowContrast.reasons.some((r) => r.includes('对比度')), lowContrast.reasons.join(';'))

const blurry = assessQuality(makeImage({ contrast: 1, blur: 3 }), W, H)
check('模糊图判为不合格', blurry.level !== 'good', `${blurry.level} / ${blurry.score}`)
check('模糊原因可读', blurry.reasons.some((r) => r.includes('模糊')), blurry.reasons.join(';'))

const skewed = assessQuality(makeImage({ contrast: 1, skew: true }), W, H)
check('倾斜图判为不合格', skewed.level !== 'good', `${skewed.level} / ${skewed.score}`)

const smallImg = assessQuality(makeImage({ contrast: 1, width: 200, height: 150 }), 200, 150)
check('小图判为不合格', smallImg.level !== 'good', `${smallImg.level} / ${smallImg.score}`)

// --- 倾斜角估计 ---
const skewRes = estimateSkew(toBin(makeImage({ contrast: 1 })), W, H)
check('倾斜角为有限值', Number.isFinite(skewRes.deg), String(skewRes.deg))
check('水平图倾斜角接近 0', Math.abs(skewRes.deg) < 1.5, skewRes.deg + ' deg')
const skewedRes = estimateSkew(toBin(makeImage({ contrast: 1, skew: true })), W, H)
check('倾斜图角度绝对值更大', Math.abs(skewedRes.deg) > Math.abs(skewRes.deg), skewedRes.deg + ' vs ' + skewRes.deg)
check('倾斜估计结果含 deg 字段', 'deg' in skewRes, Object.keys(skewRes).join(','))

// --- 确定性与健壮性 ---
check('同一输入结果一致', JSON.stringify(assessQuality(makeImage({ contrast: 1 }), W, H)) === JSON.stringify(assessQuality(makeImage({ contrast: 1 }), W, H)))
check('1x1 极小输入不抛错', (() => {
  try { assessQuality(new Uint8Array([200]), 1, 1); return true } catch { return false }
})())
check('分数始终在 0-100 之间', (() => {
  const samples = [makeImage({ contrast: 1 }), makeImage({ contrast: 0 }), makeImage({ contrast: 1, blur: 4 })]
  return samples.every((s) => { const q = assessQuality(s, W, H); return q.score >= 0 && q.score <= 100 })
})())

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个拍摄质量断言通过`)
process.exit(passed === results.length ? 0 : 1)
