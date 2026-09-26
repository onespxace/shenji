// 把 OCR 运行时、语言模型和许可文件从 node_modules / resources 同步到 public/ocr。
// 目的：避免手工复制大文件导致资产与已安装的 tesseract.js 版本不匹配。
import { copyFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(webRoot, '..')
const target = path.join(webRoot, 'public', 'ocr')
const tessdataTarget = path.join(target, 'tessdata')

// minSize 用于识别被截断或同步中断的文件；许可文本本身很小，因此单独放宽。
const files = [
  [path.join(webRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'), path.join(target, 'worker.min.js'), 100_000],
  [path.join(webRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js.LICENSE.txt'), path.join(target, 'tesseract.js-LICENSE.txt'), 100],
  [path.join(webRoot, 'node_modules', 'tesseract.js-core', 'LICENSE'), path.join(target, 'tesseract-core-LICENSE.txt'), 100],
  [path.join(webRoot, 'node_modules', 'tesseract.js-core', 'tesseract-core-lstm.wasm.js'), path.join(target, 'tesseract-core-lstm.wasm.js'), 1_000_000],
  [path.join(webRoot, 'node_modules', 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), path.join(target, 'tesseract-core-simd-lstm.wasm.js'), 1_000_000],
  [path.join(webRoot, 'node_modules', 'tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), path.join(target, 'tesseract-core-relaxedsimd-lstm.wasm.js'), 1_000_000],
  [path.join(repoRoot, 'resources', 'vendor', 'ocr', 'LICENSE.txt'), path.join(target, 'LICENSE.txt'), 100],
  [path.join(repoRoot, 'resources', 'vendor', 'ocr', 'tessdata', 'chi_sim.traineddata'), path.join(tessdataTarget, 'chi_sim.traineddata'), 1_000_000],
  [path.join(repoRoot, 'resources', 'vendor', 'ocr', 'tessdata', 'eng.traineddata'), path.join(tessdataTarget, 'eng.traineddata'), 1_000_000]
]

await mkdir(tessdataTarget, { recursive: true })
let copied = 0
for (const [from, to, minSize] of files) {
  try {
    const info = await stat(from)
    if (info.size < minSize) throw new Error(`文件过小，疑似损坏：${info.size} bytes < ${minSize}`)
    await copyFile(from, to)
    copied += 1
  } catch (error) {
    console.error(`OCR 资源同步失败：${from}\n  ${error.message}`)
    process.exit(1)
  }
}
console.log(`OCR 资源已同步：${copied}/${files.length} 个文件 → ${target}`)
