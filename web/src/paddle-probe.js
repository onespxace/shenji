// PaddleOCR.js 探针（开发用）。
//
// 存在的唯一目的：在写任何管线代码之前，先确认 PP-OCRv5 能不能在浏览器本地跑通、
// 要多久、准不准。这个页面不进构建产物（不在 vite rollupOptions.input 里）。
//
// 隐私：不发起任何图片上传。模型从项目自己的 public/ocr/paddle/ 读取，
// ONNX Runtime 的 wasm 走 jsDelivr CDN（只下载运行时，不传图）。
import { PaddleOCR } from '@paddleocr/paddleocr-js'

const logEl = document.getElementById('log')
const lines = []
function log(text, kind = '') {
  const stamp = new Date().toISOString().slice(11, 23)
  lines.push(`${stamp}  ${text}`)
  logEl.innerHTML = lines
    .map((l) => {
      const cls = l.includes('FAIL') || l.includes('错误') ? 'bad' : l.includes('OK') || l.includes('完成') ? 'ok' : ''
      return cls ? `<span class="${cls}">${escapeHtml(l)}</span>` : escapeHtml(l)
    })
    .join('\n')
  logEl.scrollTop = logEl.scrollHeight
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

let ocr = null

async function init() {
  if (ocr) return ocr
  log('开始初始化 PaddleOCR（PP-OCRv5 mobile det+rec）…')
  const t0 = performance.now()
  ocr = await PaddleOCR.create({
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: { url: new URL('ocr/paddle/PP-OCRv5_mobile_det_onnx_infer.tar', document.baseURI).href },
    textRecognitionModelName: 'PP-OCRv5_mobile_rec',
    textRecognitionModelAsset: { url: new URL('ocr/paddle/PP-OCRv5_mobile_rec_onnx_infer.tar', document.baseURI).href },
    ortOptions: {
      backend: 'wasm',
      wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/',
      numThreads: 1,
      simd: true
    }
  })
  const ms = Math.round(performance.now() - t0)
  log(`初始化完成，耗时 ${ms} ms`)
  try {
    log(`runtime: ${JSON.stringify(ocr.getInitializationSummary?.() || {}).slice(0, 300)}`)
  } catch { /* 摘要接口可选 */ }
  for (const id of ['run', 'runA', 'runD']) document.getElementById(id).disabled = false
  return ocr
}

async function run(file, label) {
  await init()
  const t0 = performance.now()
  const blob = await (await fetch(file)).blob()
  log(`识别 ${label} 开始（${(blob.size / 1024).toFixed(0)} KB）`)
  const results = await ocr.predict(blob)
  const ms = Math.round(performance.now() - t0)
  const [result] = results
  log(`${label} 完成，耗时 ${ms} ms，识别行数 ${result.items.length}`)
  log(`  metrics: ${JSON.stringify(result.metrics)}`)
  log(`  runtime: ${JSON.stringify(result.runtime)}`)
  log('---- 识别文本 ----')
  for (const item of result.items) {
    log(`  [${item.score.toFixed(2)}] ${item.text}`)
  }
  const EXPECT = ['2024', '001', '投资', '300000.00', '2', '银行存款', '实收资本', '张三', '李四', '王五']
  const joined = result.items.map((i) => i.text).join(' ')
  const hit = EXPECT.filter((e) => joined.includes(e))
  log(`---- 字段命中 ${hit.length}/10：${hit.join('、') || '无'} ----`)
  log(`---- 缺失：${EXPECT.filter((e) => !joined.includes(e)).join('、') || '无'} ----`)
  window.__lastResult = result
}

document.getElementById('init').onclick = () => init().catch((e) => log(`错误：${e.message || e}`))
document.getElementById('runA').onclick = () => run('.bench-ocr/A-scan.png', 'A-scan 扫描件').catch((e) => log(`错误：${e.message || e}`))
document.getElementById('runD').onclick = () => run('.bench-ocr/D-photo.png', 'D-photo 翻拍').catch((e) => log(`错误：${e.message || e}`))
document.getElementById('run').onclick = () => run('.bench-ocr/A-scan.png', 'A-scan 扫描件').catch((e) => log(`错误：${e.message || e}`))

log('探针已就绪。点击「初始化模型」开始。')
