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

/**
 * 模型 URL 版本号。
 *
 * 除了让浏览器放弃旧缓存，更是为了甩掉已经被污染的缓存：
 * 早期版本的可用性探测用 `Range: bytes=0-0` 请求了与 SDK 相同的 URL，
 * GitHub Pages 的 `max-age=600` 把那个 1 字节的部分响应缓存了下来。
 * 已经中招的用户浏览器里，干净 URL 上仍挂着 1 字节的缓存，
 * 不换 URL 就永远修不好。改动探测逻辑时必须同步 bump 这个版本号。
 */
const MODEL_URL_VERSION = 'v3'

/** 缓存污染重试时用来换 URL 的 nonce；正常路径下是 undefined */
let currentNonce = null

function assetUrl(name, nonce = currentNonce) {
  const version = nonce || MODEL_URL_VERSION
  return new URL(`ocr/paddle/${name}.tar?v=${version}`, document.baseURI).href
}

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

export function paddleAssetManifest() {
  return [
    { name: DET_MODEL, url: assetUrl(`${DET_MODEL}_onnx_infer`), approxBytes: 4843520 },
    { name: REC_MODEL, url: assetUrl(`${REC_MODEL}_onnx_infer`), approxBytes: 16701440 }
  ]
}

/**
 * 模型是否已随站点部署。
 *
 * 两个必须避开的坑，都是"探测本身把资源搞坏"：
 *
 * 1. 不能用 HEAD。GitHub Pages 会对大文件的 HEAD 响应直接中断（net::ERR_ABORTED）。
 *    所以用 `Range: bytes=0-0`，200/206 都算可用。
 *
 * 2. **探测请求绝不能和 SDK 的下载共用同一个 URL。**
 *    GitHub Pages 返回 `Cache-Control: max-age=600`，浏览器会把
 *    `bytes=0-0` 的**部分响应**按完整 URL 缓存下来。SDK 随后请求同一 URL
 *    时命中这个 1 字节缓存，`extractTarEntries` 拿到 1 字节后
 *    报 `Entry "inference.onnx" was not found in the tar archive`。
 *    2026-09-26 实际发生，且因为依赖缓存状态而时好时坏，极难复现。
 *
 * 对策：探测 URL 追加唯一 query，并加 `cache: 'no-store'`，
 * 保证它既不进缓存、也不会命中 SDK 留下的缓存。
 */
export async function paddleModelStatus() {
  const nonce = Date.now().toString(36)
  const checks = await Promise.all(
    paddleAssetManifest().map(async (asset) => {
      // asset.url 已带 ?v= 版本号，这里必须用 & 追加，不能再用 ?
      // 否则会拼出 `?v=v2?probe=xxx` 这种双问号 URL。
      const separator = asset.url.includes('?') ? '&' : '?'
      const probeUrl = `${asset.url}${separator}probe=${nonce}`
      try {
        const res = await fetch(probeUrl, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' })
        const ok = res.status === 200 || res.status === 206
        await res.arrayBuffer().catch(() => null)
        return { name: asset.name, ok, status: res.status, approxBytes: asset.approxBytes }
      } catch {
        return { name: asset.name, ok: false, status: 0, approxBytes: asset.approxBytes }
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
 * 判定"模型 tar 被缓存污染"这一类错误。
 *
 * 历史背景：早期版本的可用性探测用 `Range: bytes=0-0` 请求了与 SDK 相同的 URL，
 * GitHub Pages 的 `max-age=600` 把 1 字节的部分响应缓存了下来。之后 SDK 请求
 * 同一 URL 会命中它，`extractTarEntries` 拿到 1 字节就报
 * `Entry "inference.onnx" was not found in the tar archive`。
 *
 * 这个报错信息极具误导性——它看起来像"模型文件坏了"或"部署出错"，
 * 实际上模型文件是好的，只是浏览器缓存脏了。而 `index.html` 本身也是
 * `max-age=600`，用户最长 10 分钟内会继续加载旧 bundle，反复撞同一个错。
 * 所以这里必须识别它并换 URL 重试，而不是把英文原文抛给用户。
 */
export function isPoisonedCacheError(error) {
  const text = `${error?.message || ''} ${error?.name || ''}`
  return /was not found in the tar archive|Failed to download|network error|ERR_ABORTED|failed to fetch/i.test(text)
}

async function createPaddleInstance({ backend, worker, wasmPaths }) {
  const PaddleOCR = await loadSdk()
  return PaddleOCR.create({
    textDetectionModelName: DET_MODEL,
    textDetectionModelAsset: { url: assetUrl(`${DET_MODEL}_onnx_infer`, currentNonce) },
    textRecognitionModelName: REC_MODEL,
    textRecognitionModelAsset: { url: assetUrl(`${REC_MODEL}_onnx_infer`, currentNonce) },
    worker: worker === true,
    ortOptions: {
      backend,
      wasmPaths: wasmPaths || ORT_WASM_CDN,
      // GitHub Pages 没有 COOP/COEP 头，SharedArrayBuffer 不可用，线程必须锁 1
      numThreads: 1,
      simd: true
    }
  })
}

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
  const backend = options.backend === 'webgpu' ? 'webgpu' : 'wasm'

  try {
    instance = await createPaddleInstance({ backend, worker: options.worker, wasmPaths: options.wasmPaths })
  } catch (error) {
    if (!isPoisonedCacheError(error)) throw error
    // 换一个新的 URL 绕开被污染的缓存条目，重试一次。
    // 模型文件本身没问题，所以第二次用干净 URL 一定能拿到完整字节。
    const retryNonce = `r${Date.now().toString(36)}`
    instance = null
    currentNonce = retryNonce
    try {
      instance = await createPaddleInstance({ backend, worker: options.worker, wasmPaths: options.wasmPaths })
    } catch (retryError) {
      instance = null
      const wrapped = new Error(
        `模型下载被浏览器缓存干扰，自动重试后仍失败。` +
        `请强制刷新页面（Ctrl+F5 或 Ctrl+Shift+R）后重试；若仍不行请改用 Tesseract。` +
        `（原始错误：${retryError?.message || retryError}）`
      )
      wrapped.code = 'PADDLE_CACHE_POISONED'
      throw wrapped
    }
  }
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
