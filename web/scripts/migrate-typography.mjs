// 字号迁移：把遗留的 px 字号映射到基于 rem 的可访问字号阶梯。
// 依据：WCAG 1.4.4（文字可放大到 200%）/ 1.4.12（行高 ≥ 1.5 倍字号）、
// W3C Design System（正文 1rem = 16px）、Major Second 阶梯并对齐 4px 栅格。
// 幂等：已经是 rem 的声明不会被再次改写，可重复执行。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(webRoot, 'src')

// 10px/11px 的中文正文在实际阅读距离下过小，统一抬升；10px 仅保留给全大写拉丁字母小标签。
const SCALE = {
  10: '0.75rem',    // 12px · 仅用于 eyebrow / kicker 这类全大写拉丁小标签
  11: '0.875rem',   // 14px · 说明性文字、表格、辅助标签
  12: '0.875rem',   // 14px
  13: '0.9375rem',  // 15px · 界面正文
  14: '1rem',       // 16px · 正文基准
  15: '1.0625rem',  // 17px · 卡片标题
  16: '1.125rem',   // 18px
  17: '1.25rem',    // 20px
  18: '1.25rem',    // 20px
  19: '1.375rem',   // 22px · 指标数值
  20: '1.375rem',   // 22px
  21: '1.5rem',     // 24px
  25: '1.75rem',    // 28px
  28: '2rem',       // 32px
  30: '2.125rem',   // 34px · 页面标题
  34: '2.5rem'      // 40px · 空状态图标
}

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) collectFiles(full, out)
    else if (/\.(css|vue)$/.test(entry)) out.push(full)
  }
  return out
}

let changedFiles = 0
let changedRules = 0
const report = []

for (const file of collectFiles(srcRoot)) {
  const original = readFileSync(file, 'utf8')
  const seen = new Map()
  const next = original.replace(/font-size:\s*(\d+)px/g, (match, px) => {
    const rem = SCALE[Number(px)]
    if (!rem) return match
    seen.set(px, (seen.get(px) || 0) + 1)
    return `font-size: ${rem}`
  })
  if (next === original) continue
  writeFileSync(file, next, 'utf8')
  changedFiles += 1
  const total = [...seen.values()].reduce((a, b) => a + b, 0)
  changedRules += total
  report.push(`  ${path.relative(webRoot, file)}: ${total} 处 ${[...seen.entries()].map(([px, n]) => `${px}px×${n}`).join(', ')}`)
}

console.log(`字号迁移完成：${changedFiles} 个文件，${changedRules} 条声明`)
if (report.length) console.log(report.join('\n'))
const stillSmall = collectFiles(srcRoot)
  .flatMap((file) => readFileSync(file, 'utf8').match(/font-size:\s*(\d+)px/g) || [])
  .filter((m) => Number(m.match(/\d+/)[0]) < 12)
console.log(stillSmall.length ? `警告：仍有 ${stillSmall.length} 条小于 12px 的声明` : '检查通过：没有小于 12px 的字号声明')
process.exit(stillSmall.length ? 1 : 0)
