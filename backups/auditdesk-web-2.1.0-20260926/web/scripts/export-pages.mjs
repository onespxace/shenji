import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const webRoot = process.cwd()
const dist = path.join(webRoot, 'dist')
const output = path.resolve(webRoot, '..', 'github-pages')

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(dist, output, { recursive: true })
// 即使某些上传工具忽略隐藏文件，也确保 Pages 不启用 Jekyll 处理。
await writeFile(path.join(output, '.nojekyll'), '')

console.log(`GitHub Pages 文件已生成：${output}`)
