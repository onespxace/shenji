// 检测并清除源码中的 UTF-8 BOM。
// PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写入 BOM，
// 而 Node / rolldown / PostCSS 把带 BOM 的 JSON 当普通 JS 解析时会直接报错。
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skipDirs = new Set(['node_modules', 'dist', '.git', 'public'])
const exts = new Set(['.js', '.mjs', '.json', '.css', '.vue', '.html', '.md'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (exts.has(path.extname(entry))) out.push(full)
  }
  return out
}

const fixed = []
const broken = []
for (const file of walk(webRoot)) {
  const buf = readFileSync(file)
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    const body = buf.subarray(3)
    // 去掉 BOM 后必须仍是合法 JSON（针对 .json）
    if (path.extname(file) === '.json') {
      try {
        JSON.parse(body.toString('utf8'))
      } catch (error) {
        broken.push(`${path.relative(webRoot, file)} · 去掉 BOM 后仍无法解析：${error.message}`)
        continue
      }
    }
    writeFileSync(file, body)
    fixed.push(path.relative(webRoot, file))
  }
}

if (broken.length) {
  console.error('以下文件去掉 BOM 后仍不合法，请人工检查：')
  for (const item of broken) console.error('  ' + item)
  process.exit(1)
}
if (fixed.length) {
  console.log(`已清除 ${fixed.length} 个文件的 UTF-8 BOM：`)
  for (const item of fixed) console.log('  ' + item)
} else {
  console.log('检查通过：源码中没有 UTF-8 BOM')
}
