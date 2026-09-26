import { createWorker, PSM } from 'tesseract.js'
import { assessImageFile } from './ocr-quality.js'

let workerPromise = null

// 实测结论（见 docs/OCR_QUALITY.md）：
//  - 手工灰度/二值化/对比度拉伸反而让准确率从 80% 掉到 52%，因此不做图像前处理；
//  - best_int 模型与 tessdata_fast 实测持平，不额外增加 4.5MB 体积；
//  - PSM 单一区块比自动版面差 30 个百分点，保持 PSM.AUTO。
// 真正有效的改进是：拍不好时提前提醒，以及用逐字置信度标出不可信字段。
const OCR_ASSET_VERSION = 'auditdesk-ocr-v7-fast-20260926'
const FIELD_CONF_WARN = 78 // 低于此置信度的字段视为需要人工核对

function localOcrBase() {
  return new URL('ocr/', document.baseURI).href
}

function validateImageFile(file) {
  if (!file) throw new Error('请选择凭证图片')
  if (!/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)) {
    throw new Error('仅支持 PNG、JPG、WEBP、BMP 图片；PDF 请先转为图片')
  }
  if (file.size > 15 * 1024 * 1024) throw new Error('图片超过 15MB，请压缩后再识别')
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    const base = localOcrBase()
    workerPromise = createWorker(['chi_sim', 'eng'], 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: `${base}tessdata`,
      gzip: false,
      cachePath: OCR_ASSET_VERSION,
      cacheMethod: 'write',
      workerBlobURL: false,
      logger: (message) => {
        if (message && typeof message.progress === 'number') {
          onProgress?.({ progress: Math.max(0, Math.min(1, message.progress)), status: message.status || '正在识别' })
        }
      }
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1'
      })
      return worker
    }).catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

/** 从 Tesseract 的 block 树里抽出词级置信度 */
function extractWords(blocks) {
  const words = []
  for (const block of blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const word of line.words || []) {
          const text = String(word.text || '').trim()
          if (!text) continue
          words.push({ text, confidence: Number(word.confidence || 0) })
        }
      }
    }
  }
  return words
}

/**
 * 为一段已识别文本计算置信度：取所有与该文本有交集的词的**最低**置信度。
 * 取最低而非平均，是因为一个字段里只要有一个词被认错，整个字段就需要核对。
 * 没匹配到词时返回 null（表示无法判断，而不是 0 分）。
 */
export function confidenceFor(needle, words) {
  if (!needle || !Array.isArray(words) || !words.length) return null
  const target = String(needle).replace(/[\s　]/g, '')
  if (!target) return null
  let worst = Infinity
  let count = 0
  for (const word of words) {
    const text = String(word.text).replace(/[\s　]/g, '')
    if (!text) continue
    if (text.includes(target) || target.includes(text)) {
      worst = Math.min(worst, Number(word.confidence || 0))
      count += 1
    }
  }
  if (!count) return null
  return Math.round(worst)
}

export async function assessImage(file) {
  return assessImageFile(file)
}

export async function recognizeVoucherImage(file, onProgress) {
  validateImageFile(file)
  onProgress?.({ progress: 0.02, status: '正在检查拍摄质量' })
  const quality = await assessImageFile(file)
  if (quality.level === 'poor') {
    onProgress?.({ progress: 1, status: '图片质量不足，建议重拍' })
  }
  onProgress?.({ progress: 0.06, status: '正在加载本地中文识别模型' })
  const worker = await getWorker(onProgress)
  onProgress?.({ progress: 0.25, status: '正在识别凭证文字' })
  const result = await worker.recognize(file, {}, { text: true, blocks: true })
  const words = extractWords(result.data.blocks)
  onProgress?.({ progress: 1, status: '识别完成' })
  return {
    text: result.data.text || '',
    confidence: Number(result.data.confidence || 0),
    blocks: result.data.blocks || [],
    words,
    quality,
    fieldWarnThreshold: FIELD_CONF_WARN
  }
}

export async function terminateOcr() {
  if (!workerPromise) return
  const worker = await workerPromise.catch(() => null)
  workerPromise = null
  if (worker) await worker.terminate()
}

export function ocrAssetUrls() {
  const base = localOcrBase()
  return {
    worker: `${base}worker.min.js`,
    core: base,
    languages: `${base}tessdata`
  }
}
