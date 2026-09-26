import process from 'node:process'

// 让旧的确定性分析引擎可以在 Node 验证脚本中运行。
globalThis.window = globalThis
const { runSampleValidation } = await import('../src/lib/sample-validation.js')
const results = runSampleValidation()
const passed = results.filter((item) => item.passed).length

for (const item of results) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name} · ${item.detail}`)
}
console.log(`\n${passed}/${results.length} 个工具样例验证通过`)
process.exit(passed === results.length ? 0 : 1)
