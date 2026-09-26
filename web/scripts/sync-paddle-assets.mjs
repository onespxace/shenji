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
  for (const model of MODELS) {
    const file = localPath(model.name)
    if (!force && isComplete(model.name)) {
      summary.push({ name: model.name, status: 'exists', bytes: statSync(file).size })
      continue
    }
    const url = `${BASE}/${model.name}.tar`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载 ${model.name} 失败：HTTP ${res.status}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
    const bytes = statSync(file).size
    if (Math.abs(bytes - model.bytes) > 1024) {
      throw new Error(`${model.name} 大小异常：期望 ${model.bytes}，实际 ${bytes}`)
    }
    summary.push({ name: model.name, status: 'downloaded', bytes })
  }
  return summary
}

if (process.argv[1] && process.argv[1].endsWith('sync-paddle-assets.mjs')) {
  const force = process.argv.includes('--force')
  syncPaddleAssets({ force })
    .then((rows) => {
      for (const row of rows) {
        console.log(`${row.status === 'exists' ? '已存在' : '已下载'} ${row.name}  ${(row.bytes / 1024 / 1024).toFixed(2)} MB`)
      }
      const total = rows.reduce((sum, row) => sum + row.bytes, 0)
      console.log(`合计 ${(total / 1024 / 1024).toFixed(2)} MB → ${targetDir}`)
    })
    .catch((error) => {
      console.error(`同步失败：${error.message || error}`)
      process.exit(1)
    })
}
