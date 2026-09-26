// 用例库断言：确认每个教学用例都能跑出预期结果，防止文档与实际行为脱节。
import process from 'node:process'

// 让旧的确定性分析引擎（tools.js 挂在 window 上）可以在 Node 中运行
globalThis.window = globalThis

const { SHOWCASE_CASES, runAllShowcaseCases } = await import('../src/lib/showcase.js')

const results = []
function check(name, condition, detail = '') {
  results.push({ name, passed: Boolean(condition), detail })
}

check('用例数量', SHOWCASE_CASES.length >= 10, String(SHOWCASE_CASES.length))
check('用例 id 唯一', new Set(SHOWCASE_CASES.map((c) => c.id)).size === SHOWCASE_CASES.length)

// 每个用例都必须写全说明字段，否则教学页会出现空洞条目
for (const field of ['title', 'scene', 'objective', 'standard', 'risk']) {
  const missing = SHOWCASE_CASES.filter((c) => !String(c[field] || '').trim()).map((c) => c.id)
  check(`用例字段完整：${field}`, missing.length === 0, missing.join(','))
}

// 程序类用例必须带可载入的 CSV 与工具参数
const toolCases = SHOWCASE_CASES.filter((c) => c.kind === 'tool')
check('程序用例数量', toolCases.length >= 5, String(toolCases.length))
check('程序用例均有 CSV', toolCases.every((c) => String(c.csv || '').split('\n').length >= 4))
check('程序用例均有工具名', toolCases.every((c) => typeof c.tool === 'string' && c.tool))

// 逐个执行
const outcomes = runAllShowcaseCases()
for (const item of outcomes) {
  check(`用例：${item.title}`, item.passed, item.detail)
}

for (const item of outcomes) console.log(`${item.passed ? 'PASS' : 'FAIL'} [${item.kind}] ${item.title} · ${item.detail}`)
const passed = results.filter((item) => item.passed).length
console.log(`\n${passed}/${results.length} 个用例断言通过`)
process.exit(passed === results.length ? 0 : 1)
