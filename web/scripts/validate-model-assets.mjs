// 模型资产完整性断言。
//
// 这组断言是为了守住一个真实踩过的坑：
// `.gitattributes` 里 `* text=auto eol=lf` 会对所有未标记 binary 的文件做
// 换行归一化。二进制清单里原本有 .zip / .wasm / .traineddata，唯独漏了 .tar，
// 于是 PaddleOCR 的 4,843,520 B 模型被 git 存成 6,644,318 B，
// 线上才报 `Entry "inference.onnx" was not found in the tar archive`。
//
// 光校验工作区文件没用——工作区是好的，坏的是 git 对象库里那份。
// 所以这里同时校验「工作区」「git 索引」「tar 内容」三处。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(webRoot, '..')
const modelDir = path.join(webRoot, 'public', 'ocr', 'paddle')

const MODELS = [
  { name: 'PP-OCRv5_mobile_det_onnx_infer', bytes: 4843520 },
  { name: 'PP-OCRv5_mobile_rec_onnx_infer', bytes: 16701440 }
]

const results = []
const check = (label, condition, detail = '') => results.push({ label, passed: Boolean(condition), detail })

/** 解析 ustar：512 字节头 + 文件体，name 在 0..100，size 在 124..136（八进制） */
function listTarEntries(buffer) {
  const entries = []
  let offset = 0
  let longName = ''
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    // 全 0 块表示结束
    if (header.every((b) => b === 0)) break
    let name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const sizeField = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim()
    const size = sizeField ? parseInt(sizeField, 8) : 0
    const typeFlag = String.fromCharCode(header[156])
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    if (prefix) name = `${prefix}/${name}`
    const dataStart = offset + 512
    if (typeFlag === 'L') {
      // GNU 长文件名：内容就是文件名
      longName = buffer.subarray(dataStart, dataStart + size).toString('utf8').replace(/\0.*$/, '')
      offset = dataStart + Math.ceil(size / 512) * 512
      continue
    }
    if (longName) {
      name = longName
      longName = ''
    }
    entries.push({ name, size, typeFlag })
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return entries
}

function git(args, cwd = repoRoot) {
  return execFileSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' })
}

for (const model of MODELS) {
  const file = path.join(modelDir, `${model.name}.tar`)
  const rel = path.relative(repoRoot, file).split(path.sep).join('/')

  // 1) 工作区存在且大小正确
  const exists = existsSync(file)
  check(`[工作区] ${model.name} 存在`, exists, file)
  if (!exists) continue
  const size = statSync(file).size
  check(`[工作区] ${model.name} 大小为 ${model.bytes}`, size === model.bytes, `实际 ${size}`)

  // 2) tar 结构合法且含必需条目
  const buf = readFileSync(file)
  let entries = []
  try {
    entries = listTarEntries(buf)
    check(`[tar] ${model.name} 可解析为 ustar`, entries.length > 0, `解析出 ${entries.length} 项`)
  } catch (error) {
    check(`[tar] ${model.name} 可解析为 ustar`, false, error.message)
  }
  const names = entries.map((e) => e.name)
  const hasOnnx = names.some((n) => n.endsWith('inference.onnx'))
  const hasYml = names.some((n) => n.endsWith('inference.yml'))
  check(`[tar] ${model.name} 含 inference.onnx`, hasOnnx, names.slice(0, 4).join(', '))
  check(`[tar] ${model.name} 含 inference.yml`, hasYml, names.slice(0, 4).join(', '))
  const onnx = entries.find((e) => e.name.endsWith('inference.onnx'))
  check(`[tar] ${model.name} 的 onnx 非空`, onnx && onnx.size > 100000, onnx ? `${onnx.size} B` : '未找到')

  // 3) git 索引里存的那份必须与工作区逐字节一致
  //    这一条才是真正守住那个 bug 的：工作区一直是好的，坏的是对象库那份。
  try {
    const blobSha = git(['rev-parse', `:${rel}`]).toString('utf8').trim()
    const blobSize = Number(git(['cat-file', '-s', blobSha]).toString('utf8').trim())
    check(`[git] ${model.name} 索引大小与工作区一致`, blobSize === size, `索引 ${blobSize} vs 工作区 ${size}`)
    const blob = git(['cat-file', 'blob', blobSha])
    const hashBlob = createHash('sha256').update(blob).digest('hex')
    const hashFile = createHash('sha256').update(buf).digest('hex')
    check(`[git] ${model.name} 索引内容与工作区逐字节一致`, hashBlob === hashFile, `索引 ${hashBlob.slice(0, 12)} vs 工作区 ${hashFile.slice(0, 12)}`)
  } catch (error) {
    check(`[git] ${model.name} 可从索引读取`, false, error.message)
  }
}

// 4) .gitattributes 必须把 .tar 标为 binary
try {
  const attrs = git(['check-attr', 'binary', '--', 'web/public/ocr/paddle/PP-OCRv5_mobile_det_onnx_infer.tar']).toString('utf8')
  check('.gitattributes 把 .tar 标为 binary', /binary:\s*set/.test(attrs), attrs.trim())
} catch (error) {
  check('.gitattributes 把 .tar 标为 binary', false, error.message)
}
try {
  const text = readFileSync(path.join(repoRoot, '.gitattributes'), 'utf8')
  const hasTarRule = /^\*\.tar\s+binary\s*$/m.test(text)
  check('.gitattributes 含 *.tar binary 规则', hasTarRule, '缺这一行会被 * text=auto eol=lf 损坏')
} catch {
  check('.gitattributes 含 *.tar binary 规则', false, '读不到 .gitattributes')
}

// 5) 同步脚本登记的字节数必须与实际一致，否则完整性检查形同虚设
try {
  const src = readFileSync(path.join(webRoot, 'scripts', 'sync-paddle-assets.mjs'), 'utf8')
  for (const model of MODELS) {
    check(`sync-paddle-assets 登记了 ${model.name} 的字节数`, src.includes(String(model.bytes)), `缺 ${model.bytes}`)
  }
} catch {
  check('sync-paddle-assets 可读', false, '读不到脚本')
}

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.label}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个模型资产完整性断言通过`)
process.exit(passed === results.length ? 0 : 1)
