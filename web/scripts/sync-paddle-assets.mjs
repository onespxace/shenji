// 同步 PaddleOCR 模型到 public/ocr/paddle/。
//
// 为什么不入库：PP-OCRv5 mobile det 4.62MB + rec 15.93MB = 20.55MB，
// 和 Tesseract 的 tessdata 一样属于「运行时资源」，应由脚本拉取而不是塞进 git。
//
// 隐私：模型放在站点自己的目录下，不走第三方 CDN。
// 用户上传的凭证图片始终留在浏览器，不发起任何上传请求。
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = path.join(webRoot, 'public', 'ocr', 'paddle')

// 必须是未压缩的 ustar .tar：PaddleOCR.js 不解 .tar.gz
const MODELS = [
  { name: 'PP-OCRv5_mobile_det_onnx_infer', bytes: 4843520 },
  { name: 'PP-OCRv5_mobile_rec_onnx_infer', bytes: 16701440 }
]

const BASE = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0'

function localPath(name) {
  return path.join(targetDir, `${name}.tar`)
}

function isComplete(name) {
  const file = localPath(name)
  if (!existsSync(file)) return false
  const size = statSync(file).size
  const expected = MODELS.find((m) => m.name === name)?.bytes
  // 差 1KB 以内视为完整，避免中断留下半个文件被当成可用
  return !expected || Math.abs(size - expected) < 1024
}

export async function syncPaddleAssets({ force = false } = {}) {
  mkdirSync(targetDir, { recursive: true })
  const summary = []
  const failures = []
  for (const model of MODELS) {
    const file = localPath(model.name)
    if (!force && isComplete(model.name)) {
      summary.push({ name: model.name, status: 'exists', bytes: statSync(file).size })
      continue
    }
    const url = `${BASE}/${model.name}.tar`
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Number(process.env.PADDLE_SYNC_TIMEOUT_MS || 180000))
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
      const bytes = statSync(file).size
      if (Math.abs(bytes - model.bytes) > 1024) {
        throw new Error(`大小异常：期望 ${model.bytes}，实际 ${bytes}`)
      }
      summary.push({ name: model.name, status: 'downloaded', bytes })
    } catch (error) {
      // 半截文件不能留下，否则下次会被当成"已存在"
      try { if (existsSync(file)) (await import('node:fs')).unlinkSync(file) } catch { /* 忽略 */ }
      failures.push({ name: model.name, reason: error.message || String(error) })
    }
  }
  return { summary, failures, targetDir }
}

if (process.argv[1] && process.argv[1].endsWith('sync-paddle-assets.mjs')) {
  // 默认「失败可降级」：拉不到 Paddle 模型不应该让整站构建失败。
  // 工作台仍有 Tesseract 可用，页面会提示改用 Tesseract。
  // 需要严格模式时显式加 --strict（本地排障用）。
  const strict = process.argv.includes('--strict')
  syncPaddleAssets({ force: process.argv.includes('--force') })
    .then(({ summary, failures, targetDir }) => {
      for (const row of summary) {
        console.log(`${row.status === 'exists' ? '已存在' : '已下载'} ${row.name}  ${(row.bytes / 1024 / 1024).toFixed(2)} MB`)
      }
      if (!failures.length) {
        const total = summary.reduce((sum, row) => sum + row.bytes, 0)
        console.log(`合计 ${(total / 1024 / 1024).toFixed(2)} MB → ${targetDir}`)
        return
      }
      const detail = failures.map((f) => `${f.name}: ${f.reason}`).join('；')
      if (strict) {
        console.error(`PaddleOCR 模型同步失败：${detail}`)
        process.exit(1)
      }
      console.warn(`[警告] PaddleOCR 模型同步失败：${detail}`)
      console.warn('[警告] 站点仍会正常部署，凭证识别将回退到 Tesseract。')
      console.warn('[警告] 如需 PaddleOCR，请手动执行：npm run sync:paddle -- --strict')
    })
    .catch((error) => {
      console.error(`同步失败：${error.message || error}`)
      if (strict) process.exit(1)
      console.warn('[警告] 站点仍会正常部署，凭证识别将回退到 Tesseract。')
    })
}
