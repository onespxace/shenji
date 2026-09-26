// 把探针页放进构建产物目录。
//
// 为什么必须有一个脚本而不是文档里写一句 `cp`：
//   `npm run build` 会**清空 dist/**，文档里那句 `cp layout-audit.html ... dist/`
//   只要忘记做一次，探针就会去测一个不存在的页面——而它不会报错，
//   只会给出一个看不懂的 `{}` 结果（这次实际发生了：11 个视口全 FAIL、detail 是空对象）。
//   顺带一提，Windows 的 cmd 里没有 `cp`，写进 npm script 也跑不了。
//
// 所以：探测产物目录是否存在、逐个校验拷过去的文件真的有内容、
// 缺东西就带着"该先做什么"直接失败，而不是让探针去测一片空气。
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(webRoot, 'dist')

/** 探针页 → 用于确认拷贝成功的特征串（防止拷了个空文件还当成功） */
const PAGES = [
  { file: 'layout-audit.html', marker: 'window.__audit' },
  { file: 'lazy-audit.html', marker: 'window.__lazyAudit' },
  { file: 'router-audit.html', marker: 'window.__routerAudit' },
  // probe-index 是 apply 出来的入口页，不认它自己的文件名，认挂载点
  { file: 'probe-index.html', marker: 'id="app"', generated: true }
]

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('找不到 dist/index.html。探针跑在构建产物上，请先执行：')
  console.error('  cd web && npm run build')
  process.exit(1)
}

// probe-index.html 由 make-probe-entry.mjs 生成；没生成过就顺手生成
const probeEntry = path.join(dist, 'probe-index.html')
if (!fs.existsSync(probeEntry)) {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync(process.execPath, ['scripts/make-probe-entry.mjs'], { cwd: webRoot, encoding: 'utf8' })
  process.stdout.write(result.stdout || '')
  if (result.status !== 0) process.stderr.write(result.stderr || '')
}

const problems = []
for (const page of PAGES) {
  const from = path.join(webRoot, page.file)
  const to = path.join(dist, page.file)
  if (page.generated) {
    // probe-entry 已由上面那步负责，这里只校验结果
  } else {
    if (!fs.existsSync(from)) {
      problems.push(`缺少源文件 ${page.file}`)
      continue
    }
    fs.copyFileSync(from, to)
  }
  if (!fs.existsSync(to)) {
    problems.push(`${page.file} 没有出现在 dist/`)
    continue
  }
  const text = fs.readFileSync(to, 'utf8')
  if (!text.includes(page.marker)) problems.push(`${page.file} 内容不含特征串「${page.marker}」，可能是空文件或被缓存污染`)
}

if (problems.length) {
  for (const line of problems) console.error(`× ${line}`)
  process.exit(1)
}

console.log('探针页已就位：')
for (const page of PAGES) console.log(`  http://localhost:4288/${page.file}`)
console.log('（先确保 preview 已启动，且端口与上面一致）')
