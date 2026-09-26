// 为浏览器探针生成一个「无预加载提示」的入口页。
//
// 起因：harness 的浏览器网络层对 <head> 里解析期发起的并行预加载有字节预算，
// 747B 的 modulepreload 能过，14.8KB 起的就被 502/ERR_ABORTED；而同一页面里
// 用 fetch() 请求同样的 URL 全部 200。属于环境限制，不是产物缺陷。
// 但没有浏览器就验不了多视口布局，所以给探针单独出一份去掉 preload 提示的入口。
//
// 只影响探针：dist/index.html（真正部署的那份）不改，preload 提示照旧保留。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(webRoot, 'dist')
const source = path.join(distDir, 'index.html')
const target = path.join(distDir, 'probe-index.html')

if (!existsSync(source)) {
  console.error('dist/index.html 不存在，请先 npm run build')
  process.exit(1)
}

const html = readFileSync(source, 'utf8')
// 只去掉 modulepreload 提示，保留 <script type=module> 与 <link rel=stylesheet>，
// 这样加载路径与真实部署一致，差别仅在于不再并发预取。
const stripped = html.replace(/[ \t]*<link rel="modulepreload"[^>]*>\r?\n?/g, '')
const removed = (html.match(/rel="modulepreload"/g) || []).length

writeFileSync(target, stripped, 'utf8')
console.log(`已生成 dist/probe-index.html（移除 ${removed} 条 modulepreload 提示）`)
