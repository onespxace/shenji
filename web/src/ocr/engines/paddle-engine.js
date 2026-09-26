// PaddleOCR（PP-OCRv5 mobile）引擎封装。
//
// 实测依据（web/src/ocr/benchmark/records/paddle-probe-20260926.md）：
//   A-scan 扫描件 10/10、1.64s；D-photo 翻拍 10/10、1.57s。
//   对比 Tesseract 基线 9/10 与 5/10，翻拍图是决定性差异。
//
// 隐私：模型从项目自己的 public/ocr/paddle/ 读取，用户图片不上传。
//       只有 ONNX Runtime 的 wasm 走 jsDelivr（只下载运行时，不传图）。

import { withRects, registerEngine, ENGINE_IDS } from './engine-registry.js'

const DET_MODEL = 'PP-OCRv5_mobile_det'
const REC_MODEL = 'PP-OCRv5_mobile_rec'
const ORT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'

let sdkPromise = null
let instance = null
let initSummary = null

/** 动态 import：PaddleOCR 依赖 onnxruntime-web + opencv-js（约 22MB），绝不能进主包 */
async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import('@paddleocr/paddleocr-js').then((mod) => mod.PaddleOCR)
  }
  return sdkPromise
}

function assetUrl(name) {
  return new URL(`ocr/paddle/${name}.tar`, document.baseURI).href
}

export function paddleAssetManifest() {
  return [
    { name: DET_MODEL, url: assetUrl(`${DET_MODEL}_onnx_infer`), approxBytes: 4843520 },
    { name: REC_MODEL, url: assetUrl(`${REC_MODEL}_onnx_infer`), approxBytes: 16701440 }
  ]
}

/**
 * 模型是否已随站点部署。
 * 站点可能在拉不到模型的情况下正常部署（此时回退 Tesseract），
 * 所以这里要能在初始化之前就给出明确原因，而不是让用户等 4 秒后看一堆 WASM 报错。
 */
export async function paddleModelStatus() {
  const checks = await Promise.all(
    paddleAssetManifest().map(async (asset) => {
      try {
        const res = await fetch(asset.url, { method: 'HEAD' })
        return { name: asset.name, ok: res.ok, approxBytes: asset.approxBytes }
      } catch {
        return { name: asset.name, ok: false, approxBytes: asset.approxBytes }
      }
    })
  )
  const missing = checks.filter((c) => !c.ok)
  return {
    ready: missing.length === 0,
    checks,
    missing: missing.map((c) => c.name)
  }
}

export const PADDLE_MISSING_HINT =
  'PaddleOCR 模型未随站点部署（需约 20.6MB）。可以改用 Tesseract 继续识别，准确率较低但可用；' +
  '或在本地执行 npm run sync:paddle 后重新构建。'

/**
 * @param {object} options
 * @param {'wasm'|'webgpu'} [options.backend] 默认 wasm；webgpu 更快但兼容性窄
 * @param {boolean} [options.worker] 是否放进 Worker（避免阻塞 Vue 主线程）
 * @param {string} [options.wasmPaths] ORT wasm 托管位置
 */
export async function initPaddle(options = {}) {
  if (instance) return instance
  const status = await paddleModelStatus()
  if (!status.ready) {
    const error = new Error(`PaddleOCR 模型缺失：${status.missing.join('、')}。${PADDLE_MISSING_HINT}`)
    error.code = 'PADDLE_MODELS_MISSING'
    error.missing = status.missing
    throw error
  }
  const PaddleOCR = await loadSdk()
  const backend = options.backend === 'webgpu' ? 'webgpu' : 'wasm'
  instance = await PaddleOCR.create({
    textDetectionModelName: DET_MODEL,
    textDetectionModelAsset: { url: assetUrl(`${DET_MODEL}_onnx_infer`) },
    textRecognitionModelName: REC_MODEL,
    textRecognitionModelAsset: { url: assetUrl(`${REC_MODEL}_onnx_infer`) },
    worker: options.worker === true,
    ortOptions: {
      backend,
      wasmPaths: options.wasmPaths || ORT_WASM_CDN,
      // GitHub Pages 没有 COOP/COEP 头，SharedArrayBuffer 不可用，线程必须锁 1
      numThreads: 1,
      simd: true
    }
  })
  try {
    initSummary = instance.getInitializationSummary?.() || null
  } catch {
    initSummary = null
  }
  return instance
}

export function paddleInitSummary() {
  return initSummary
}

function toLines(items) {
  return withRects(
    (items || []).map((item) => ({
      text: String(item.text || '').trim(),
      score: Number(item.score ?? 0),
      poly: item.poly
    })).filter((line) => line.text)
  )
}

/**
 * 识别。input 允许三种形态：
 *   - { blob }  整图
 *   - { imageData }  单个 ROI（定向二次识别用）
 *   - { lines: [...] }  已经切好的多块（比如按单元格批量识别）
 */
export async function recognizeWithPaddle(input, onProgress) {
  const ocr = await initPaddle(input.options || {})
  const started = performance.now()
  onProgress?.({ progress: 0.2, status: '识别中' })

  let results
  if (Array.isArray(input.lines) && input.lines.length) {
    // 逐块识别：每块单独 predict，保留每块自己的坐标
    const blobs = await Promise.all(input.lines.map((line) => sliceToBlob(line, input)))
    results = await ocr.predict(blobs)
    const lines = []
    input.lines.forEach((line, index) => {
      const [result] = results[index] || []
      if (!result) return
      for (const item of toLines(result.items)) {
        lines.push({
          ...item,
          x: line.x + item.x,
          y: line.y + item.y,
          width: item.width,
          height: item.height,
          cx: line.x + item.cx,
          cy: line.y + item.cy,
          roiId: line.roiId || null
        })
      }
    })
    return {
      engine: ENGINE_IDS.paddle,
      width: input.width || 0,
      height: input.height || 0,
      lines,
      metrics: { totalMs: Math.round(performance.now() - started), rois: input.lines.length },
      runtime: { backend: 'paddle', ...(initSummary?.runtime || {}) }
    }
  }

  const source = input.blob || (input.imageData ? await imageDataToBlob(input.imageData) : null)
  if (!source) throw new Error('recognizeWithPaddle 需要 blob、imageData 或 lines')
  const [result] = await ocr.predict(source)
  onProgress?.({ progress: 0.9, status: '识别完成' })
  return {
    engine: ENGINE_IDS.paddle,
    width: result?.image?.width || input.width || 0,
    height: result?.image?.height || input.height || 0,
    lines: toLines(result?.items),
    metrics: { ...(result?.metrics || {}), totalMs: Math.round(performance.now() - started) },
    runtime: { ...(result?.runtime || {}), backend: 'paddle' }
  }
}

export async function disposePaddle() {
  if (!instance) return
  try { await instance.dispose?.() } catch { /* 忽略销毁异常 */ }
  instance = null
  initSummary = null
}

/** 把某个 ROI 从原图裁成独立 Blob */
async function sliceToBlob(roi, input) {
  const { imageData } = input
  if (!imageData) throw new Error('按 ROI 识别需要提供 imageData')
  const width = Math.max(1, Math.round(roi.width))
  const height = Math.max(1, Math.round(roi.height))
  const slice = new ImageData(width, height)
  for (let row = 0; row < height; row += 1) {
    const srcStart = ((roi.y + row) * imageData.width + roi.x) * 4
    slice.data.set(imageData.data.subarray(srcStart, srcStart + width * 4), row * width * 4)
  }
  return imageDataToBlob(slice)
}

async function imageDataToBlob(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

registerEngine({
  id: ENGINE_IDS.paddle,
  label: 'PaddleOCR PP-OCRv5（本地）',
  available: async () => true,
  init: initPaddle,
  recognize: recognizeWithPaddle,
  dispose: disposePaddle
})

export default {
  id: ENGINE_IDS.paddle,
  init: initPaddle,
  recognize: recognizeWithPaddle,
  dispose: disposePaddle
}
