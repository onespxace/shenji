import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const webRoot = process.cwd()
const dist = path.join(webRoot, 'dist')
const output = path.resolve(webRoot, '..', 'github-pages')

// 多页入口：工作台与功能介绍 PPT，缺一不可
const REQUIRED_ENTRIES = ['index.html', 'deck.html']

for (const name of REQUIRED_ENTRIES) {
  try {
    await access(path.join(dist, name))
  } catch {
    console.error(`构建产物缺少入口文件：${name}`)
    console.error('请检查 vite.config.js 的 rollupOptions.input 是否同时包含 index.html 与 deck.html。')
    process.exit(1)
  }
}

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(dist, output, { recursive: true })
// 即使某些上传工具忽略隐藏文件，也确保 Pages 不启用 Jekyll 处理。
await writeFile(path.join(output, '.nojekyll'), '')

console.log(`GitHub Pages 文件已生成：${output}`)
console.log(`  入口：${REQUIRED_ENTRIES.join('、')}`)
