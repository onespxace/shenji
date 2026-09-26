// 拍摄质量评估：在 OCR 之前判断这张图是否"值得识别"。
//
// 背景：实测表明，对本项目的凭证图做灰度/二值化等手工前处理反而会让
// 准确率从 80% 掉到 52%，Tesseract 自带的处理已经更好。因此提升准确率的
// 正确方向不是"把图变得更好看"，而是：
//   1) 拍糊 / 太暗 / 歪斜时提前提醒重拍，而不是产出一堆错字；
//   2) 用逐字置信度标出哪些字段不可信，避免工具误报"要素完整"。
//
// 全部为纯计算，无副作用，可在 Node 中用构造数据测试。

export const QUALITY_THRESHOLDS = {
  minSharpness: 42,     // 拉普拉斯方差，低于此值视为模糊
  minContrast: 26,       // 灰度标准差，低于此值视为对比度不足
  minBrightness: 38,     // 平均亮度
  maxBrightness: 232,    // 过曝
  maxSkewDeg: 2.6,       // 超过此角度建议校正
  goodScore: 78          // 达到此分视为良好
}

/** 对灰度像素（0-255）计算统计特征 */
export function analyzeGray(pixels, width, height) {
  const n = Math.max(1, pixels.length)
  let sum = 0
  for (let i = 0; i < pixels.length; i += 1) sum += pixels[i]
  const mean = sum / n

  let variance = 0
  for (let i = 0; i < pixels.length; i += 1) {
    const d = pixels[i] - mean
    variance += d * d
  }
  const std = Math.sqrt(variance / n)

  // 拉普拉斯响应的方差作为清晰度指标：越模糊越低
  let lapSum = 0
  let lapSq = 0
  let lapCount = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const lap = 4 * pixels[i] - pixels[i - 1] - pixels[i + 1] - pixels[i - width] - pixels[i + width]
      lapSum += lap
      lapSq += lap * lap
      lapCount += 1
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0
  const sharpness = lapCount ? Math.sqrt(Math.max(0, lapSq / lapCount - lapMean * lapMean)) : 0
  return { mean, std, sharpness }
}

/**
 * 用投影剖面估计倾斜角：文字行水平时，水平投影的相邻行差分方差最大。
 * 只在小角度范围内搜索（±6°），避免把竖排文字误判为大角度倾斜。
 */
export function estimateSkew(bin, width, height, maxDeg = 6) {
  const best = { deg: 0, score: -1 }
  for (let deg = -maxDeg; deg <= maxDeg; deg += 0.5) {
    const rad = (deg * Math.PI) / 180
    const tan = Math.tan(rad)
    const rows = new Float64Array(height + Math.ceil(Math.abs(tan) * width) + 2)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // bin 中 1 表示墨迹、0 表示背景；不能用 < 128 判断，
        // 否则背景也会被计入，投影剖面在任何角度都相同。
        if (bin[y * width + x] === 1) {
          const ry = Math.round(y + (x - width / 2) * tan + height / 2)
          if (ry >= 0 && ry < rows.length) rows[ry] += 1
        }
      }
    }
    let diffSq = 0
    let count = 0
    for (let i = 1; i < rows.length; i += 1) {
      const d = rows[i] - rows[i - 1]
      diffSq += d * d
      count += 1
    }
    const score = count ? diffSq / count : 0
    if (score > best.score) {
      best.score = score
      best.deg = deg
    }
    if (deg === 0) best.zero = score
  }
  return best
}

/**
 * 汇总为可执行的质量结论。
 * @returns {{level:'good'|'warn'|'poor', score:number, reasons:string[], advice:string[], metrics:object}}
 */
export function assessQuality(gray, width, height, options = {}) {
  const th = { ...QUALITY_THRESHOLDS, ...options }
  const { mean, std, sharpness } = analyzeGray(gray, width, height)
  const bin = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i += 1) bin[i] = gray[i] < 128 ? 1 : 0
  const skew = estimateSkew(bin, width, height)
  const skewDeg = Number.isFinite(skew.deg) ? Math.abs(skew.deg) : 0

  const reasons = []
  const advice = []
  let score = 100

  if (sharpness < th.minSharpness) {
    score -= 34
    reasons.push(`画面偏模糊（清晰度 ${sharpness.toFixed(0)}，建议 ≥ ${th.minSharpness}）`)
    advice.push('把手机放稳、等对焦后再拍，避免手抖；也可以在纸上铺一张白纸增加对比。')
  }
  if (std < th.minContrast) {
    score -= 30
    reasons.push(`对比度不足（${std.toFixed(0)}，建议 ≥ ${th.minContrast}）`)
    advice.push('避开阴影和反光；光线不足时改用侧光或开灯，不要用闪光灯直射纸面。')
  }
  if (mean < th.minBrightness) {
    score -= 18
    reasons.push('整体偏暗')
    advice.push('在光线充足处拍摄。')
  } else if (mean > th.maxBrightness) {
    score -= 18
    reasons.push('整体过曝发白')
    advice.push('降低曝光或换个角度，避免纸面反光。')
  }
  if (skewDeg > th.maxSkewDeg) {
    score -= 20
    reasons.push(`纸张倾斜约 ${skewDeg.toFixed(1)}°，超过 ${th.maxSkewDeg}°`)
    advice.push('让凭证的边与屏幕边框平行，尽量正对拍摄。')
  }
  if (width < 700) {
    score -= 30
    reasons.push(`图片宽度仅 ${width}px，文字可能过小`)
    advice.push('靠近一些拍，让整页占满画面；建议宽度不低于 1000px。')
  }

  score = Math.max(0, Math.min(100, score))
  const level = score >= th.goodScore ? 'good' : score >= 50 ? 'warn' : 'poor'
  return {
    level,
    score,
    reasons,
    advice: advice.length ? [...new Set(advice)] : ['当前画质可用于识别，但金额与签名仍需逐项核对。'],
    metrics: { mean, std, sharpness, skewDeg, width, height }
  }
}

/** 浏览器侧：把图片文件解码为灰度数组后评估（不改变原图） */
export async function assessImageFile(file, { maxSide = 900 } = {}) {
  const bitmap = await loadBitmap(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    const gray = new Uint8Array(width * height)
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    }
    return assessQuality(gray, width, height)
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close()
  }
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // 回退到 <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('图片解码失败'))
      img.src = url
    })
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
