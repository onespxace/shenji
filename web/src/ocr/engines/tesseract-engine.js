// Tesseract 引擎封装（保留为 fallback，不删除）。
//
// 存在的理由不是"它更好"，而是：
//  1) PP-OCRv5 首次要下 20.6MB 模型 + 22MB 运行时，低端机/弱网下不可用；
//  2) 定向二次识别时，单个 ROI 用 Tesseract 更快（无需再走一遍检测模型）；
//  3) 作为 benchmark 的基线，没有它就无法量化新方案到底提升了多少。
//
// 实测基线：字段准确率 80%（A/B/C 各 9/10，D-photo 5/10）。

import { withRects, registerEngine, ENGINE_IDS } from './engine-registry.js'

let workerPromise = null
const ASSET_VERSION = 'auditdesk-ocr-v7-fast-20260926'

function base() {
  return new URL('ocr/', document.baseURI).href
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    const root = base()
    workerPromise = import('tesseract.js').then(async ({ createWorker, PSM }) => {
      const worker = await createWorker(['chi_sim', 'eng'], 1, {
        workerPath: `${root}worker.min.js`,
        corePath: root,
        langPath: `${root}tessdata`,
        gzip: false,
        cachePath: ASSET_VERSION,
        cacheMethod: 'write',
        workerBlobURL: false,
        logger: (message) => {
          if (message && typeof message.progress === 'number') {
            onProgress?.({ progress: Math.max(0, Math.min(1, message.progress)), status: message.status || '正在识别' })
          }
        }
      })
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })
      return worker
    }).catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

/** 递归取词级数据；不同版本字段位置略有差异 */
function collectWords(blocks) {
  const words = []
  for (const block of blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const word of line.words || []) {
          const text = String(word.text || '').trim()
          if (!text) continue
          const bbox = word.bbox || {}
          const x = Number(bbox.x0 ?? 0)
          const y = Number(bbox.y0 ?? 0)
          const width = Number(bbox.x1 ?? 0) - x
          const height = Number(bbox.y1 ?? 0) - y
          words.push({
            text,
            score: Math.max(0, Math.min(1, Number(word.confidence || 0) / 100)),
            poly: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
          })
        }
      }
    }
  }
  return words
}

export async function initTesseract(onProgress) {
  await getWorker(onProgress)
  return { engine: ENGINE_IDS.tesseract, ready: true }
}

export async function recognizeWithTesseract(input, onProgress) {
  const worker = await getWorker(onProgress)
  const started = performance.now()
  onProgress?.({ progress: 0.25, status: '正在识别凭证文字' })

  // ROI 模式：Tesseract 没有检测模型，只能对整块图跑一遍再按坐标过滤
  const source = input.blob || (input.imageData ? await imageDataToBlob(input.imageData) : null)
  if (!source) throw new Error('recognizeWithTesseract 需要 blob 或 imageData')

  const { data } = await worker.recognize(source, {}, { text: true, blocks: true })
  let words = collectWords(data.blocks)
  if (Array.isArray(input.lines) && input.lines.length) {
    // 只保留落在指定 ROI 内的词，并把坐标换算回原图
    const offsetX = input.roiOffset?.x || 0
    const offsetY = input.roiOffset?.y || 0
    const kept = []
    for (const word of words) {
      const [x, y] = word.poly[0]
      for (const roi of input.lines) {
        const localX = x + offsetX
        const localY = y + offsetY
        if (localX >= roi.x && localX <= roi.x + roi.width && localY >= roi.y && localY <= roi.y + roi.height) {
          kept.push({ ...word, poly: word.poly.map(([px, py]) => [px + offsetX, py + offsetY]), roiId: roi.roiId || null })
        }
      }
    }
    words = kept
  }

  onProgress?.({ progress: 0.95, status: '识别完成' })
  return {
    engine: ENGINE_IDS.tesseract,
    width: input.width || 0,
    height: input.height || 0,
    lines: withRects(words),
    text: data.text || '',
    metrics: { totalMs: Math.round(performance.now() - started), confidence: Number(data.confidence || 0) },
    runtime: { backend: 'tesseract', psm: 'AUTO' }
  }
}

export async function disposeTesseract() {
  if (!workerPromise) return
  const worker = await workerPromise.catch(() => null)
  workerPromise = null
  if (worker) await worker.terminate()
}

async function imageDataToBlob(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

registerEngine({
  id: ENGINE_IDS.tesseract,
  label: 'Tesseract（本地基线）',
  available: async () => true,
  init: initTesseract,
  recognize: recognizeWithTesseract,
  dispose: disposeTesseract
})

export default {
  id: ENGINE_IDS.tesseract,
  init: initTesseract,
  recognize: recognizeWithTesseract,
  dispose: disposeTesseract
}
