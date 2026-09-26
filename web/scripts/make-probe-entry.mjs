// 为浏览器探针生成一个「无预加载提示」的入口页。
//
// 只影响探针：dist/index.html（真正部署的那份）不改，preload 提示照旧保留。
// 转换逻辑在 scripts/lib/probe-entry.mjs，供本脚本与 probe:prepare 共用
//（probe:prepare 原来用 spawnSync 调本脚本，受限环境下会静默失败）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProbeEntry } from './lib/probe-entry.mjs'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(webRoot, 'dist', 'index.html')
const target = path.join(webRoot, 'dist', 'probe-index.html')

if (!existsSync(source)) {
  console.error('dist/index.html 不存在，请先 npm run build')
  process.exit(1)
}

const { html, removed } = buildProbeEntry(readFileSync(source, 'utf8'))
writeFileSync(target, html, 'utf8')
console.log(`已生成 dist/probe-index.html（移除 ${removed} 条 modulepreload 提示）`)
