// 汇总 validate:all 的断言数量，供交接文档引用。
//
// 刻意不用 PowerShell 重定向捕获：PS 的 `>` 写 UTF-16LE，中文会全毁，
// 而「文档里的断言总数」这种数字一旦读错就会误导接手的人。
//
// 两种运行方式：
//   1) 默认：spawnSync 逐个起子进程（和 `npm run validate:all` 一致）；
//   2) 受限环境（沙箱 / 某些 CI 禁止起子进程，spawnSync 会抛 EBUSY）自动降级为
//      同进程 import。降级前必须把"环境跑不了"和"断言真的失败"分开，
//      否则会报出 10 组全失败的假象，让人去修并不存在的问题。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCRIPTS = [
  ['validate:tools', '工具样例'],
  ['validate:accounting', '会计基础与凭证检查'],
  ['validate:profit-journal', '利润计算与分录知识库'],
  ['validate:csv-export', 'CSV 导出'],
  ['validate:model-assets', '模型资产完整性'],
  ['validate:router', '路由'],
  ['validate:ocr-pipeline', '凭证结构化识别'],
  ['validate:ocr-quality', '拍摄质量'],
  ['validate:markdown', 'Markdown 渲染'],
  ['validate:showcase', '用例'],
  ['validate:deck', 'PPT 结构']
]

const strip = (text) => String(text || '').replace(/\u001b\[[0-9;]*m/g, '')
/**
 * 取该脚本的总结行。
 *
 * 必须锚定行首的 `数字/数字 个`，不能只要求"这一行里有 x/y"：
 * 失败时详情会被拼在同一行，里面可能带别的 `x/y`，
 * 宽松匹配会取到错误数字——而"文档里的断言总数"读错一次就会误导接手的人。
 */
const summaryOf = (text) => {
  const lines = strip(text).split(/\r?\n/)
  return [...lines].reverse().find((line) => /^\s*\d+\s*\/\s*\d+\s*个/.test(line)) || ''
}

/** 子进程模式：与 npm run validate:* 行为一致 */
function runSpawn(script) {
  const file = script.replace('validate:', '')
  const result = spawnSync(process.execPath, [`scripts/validate-${file}.mjs`], {
    cwd: webRoot,
    encoding: 'utf8',
    windowsHide: true
  })
  const blocked = result.error && ['EBUSY', 'EPERM', 'EACCES'].includes(result.error.code)
  return { status: result.status, text: `${result.stdout || ''}${result.stderr || ''}`, blocked: Boolean(blocked) }
}

/** 同进程模式：受限环境下的降级路径 */
async function runInline(script) {
  const file = script.replace('validate:', '')
  const url = `${pathToFileURL(path.join(webRoot, 'scripts', `validate-${file}.mjs`)).href}?inline=${Date.now()}-${Math.random()}`
  const lines = []
  const realLog = console.log
  const realExit = process.exit
  let status = 0
  console.log = (...args) => lines.push(args.join(' '))
  process.exit = (code) => {
    const signal = new Error('__inline_exit__')
    signal.inlineCode = code ?? 0
    throw signal
  }
  try {
    await import(url)
  } catch (error) {
    if (error?.message === '__inline_exit__') status = error.inlineCode
    else {
      lines.push(`脚本异常：${error?.message || error}`)
      status = 1
    }
  } finally {
    console.log = realLog
    process.exit = realExit
  }
  return { status: status === 0 ? 0 : 1, text: lines.join('\n'), blocked: false }
}

const probe = runSpawn(SCRIPTS[0][0])
const inline = probe.blocked
if (inline) console.log('注意：当前环境不允许起子进程（spawnSync 被拦截），已自动降级为同进程运行。\n')

let total = 0
let groups = 0
let failed = 0
const rows = []

for (const [script, label] of SCRIPTS) {
  const run = inline ? await runInline(script) : (script === SCRIPTS[0][0] ? probe : runSpawn(script))
  const summary = summaryOf(run.text)
  const match = summary ? summary.match(/(\d+)\s*\/\s*(\d+)/) : null
  const pass = match ? Number(match[1]) : 0
  const all = match ? Number(match[2]) : 0
  const ok = run.status === 0 && pass === all && all > 0
  if (!ok) failed += 1
  total += all
  groups += 1
  rows.push({ script, label, pass, all, ok, note: ok ? '' : summary ? summary.trim() : `退出码 ${run.status}` })
}

console.log('| 校验脚本 | 覆盖内容 | 断言数 | 结果 |')
console.log('| --- | --- | --- | --- |')
for (const row of rows) {
  console.log(`| \`npm run ${row.script}\` | ${row.label} | ${row.all} | ${row.ok ? '通过' : '**失败** ' + row.note} |`)
}
console.log('')
console.log(`合计 **${total}** 条断言 / **${groups}** 组；失败 ${failed} 组。${inline ? '（同进程模式）' : ''}`)
process.exit(failed ? 1 : 0)
