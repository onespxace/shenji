// 统计产物体积，供交接文档引用。
// 单独成文件而不是内联 node -e：PowerShell 5.1 会把 [ ] " $ 里的内容当自己的语法解析，
// 内联脚本一旦含正则和模板字符串就会被截断成莫名其妙的 ParserError。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(webRoot, 'dist')
const assetsDir = path.join(distDir, 'assets')

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const gz = (name) => gzipSync(readFileSync(path.join(assetsDir, name))).length
const raw = (name) => statSync(path.join(assetsDir, name)).size

const files = readdirSync(assetsDir)
const isCss = (f) => f.endsWith('.css')
const isJs = (f) => f.endsWith('.js')
const total = (list, fn) => list.reduce((sum, f) => sum + fn(f), 0)

console.log('dist/assets 文件数: ' + files.length)
console.log('CSS  合计 raw ' + kb(total(files.filter(isCss), raw)) + ' / gzip ' + kb(total(files.filter(isCss), gz)))
console.log('JS   合计 raw ' + kb(total(files.filter(isJs), raw)) + ' / gzip ' + kb(total(files.filter(isJs), gz)))
console.log('')
console.log('首屏入口（index.html 直接引用，即所有用户都要下的）：')
const html = readFileSync(path.join(distDir, 'index.html'), 'utf8')
const refs = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)].map((m) => m[1])
let gzipSum = 0
for (const ref of refs) {
  const z = gz(ref)
  gzipSum += z
  console.log('  ' + ref.padEnd(48) + kb(raw(ref)).padStart(10) + ' / gzip ' + kb(z).padStart(10))
}
console.log('  ' + '入口合计 gzip: ' + kb(gzipSum))
