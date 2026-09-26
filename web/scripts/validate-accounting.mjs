import process from 'node:process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT_CLASSES, ACCOUNT_ENTRIES, answerAccountingQuestion, classifyAccount } from '../src/lib/accounting-data.js'
import { COMPLETE_VOUCHER_SAMPLE, INCOMPLETE_VOUCHER_SAMPLE, UPPERCASE_VOUCHER_SAMPLE, validateVoucherText } from '../src/lib/voucher-validator.js'

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const results = []
function check(name, condition, detail = '') {
  results.push({ name, passed: Boolean(condition), detail })
}

const ocrAssets = [
  'public/ocr/worker.min.js',
  'public/ocr/tesseract-core-relaxedsimd-lstm.wasm.js',
  'public/ocr/tesseract-core-simd-lstm.wasm.js',
  'public/ocr/tesseract-core-lstm.wasm.js',
  'public/ocr/tessdata/chi_sim.traineddata',
  'public/ocr/tessdata/eng.traineddata'
]
for (const asset of ocrAssets) {
  const file = join(webRoot, asset)
  check(`OCR 资源：${asset}`, existsSync(file) && statSync(file).size > 100000, existsSync(file) ? `${statSync(file).size} bytes` : '缺失')
}

check('六大科目类别', ACCOUNT_CLASSES.length === 6, String(ACCOUNT_CLASSES.length))
check('常用科目表', ACCOUNT_ENTRIES.length >= 80, String(ACCOUNT_ENTRIES.length))
const uniqueCodes = new Set(ACCOUNT_ENTRIES.map((item) => item.code))
check('科目代码唯一', uniqueCodes.size === ACCOUNT_ENTRIES.length, `${uniqueCodes.size}/${ACCOUNT_ENTRIES.length}`)
check('科目代码首位与分类一致', ACCOUNT_ENTRIES.every((item) => {
  const prefix = { asset: '1', liability: '2', common: '3', equity: '4', cost: '5', profitLoss: '6' }[item.classId]
  return item.code.startsWith(prefix)
}))

const cases = [
  ['库存现金', 'asset'],
  ['1002', 'asset'],
  ['应付账款', 'liability'],
  ['实收资本', 'equity'],
  ['生产成本', 'cost'],
  ['主营业务收入', 'profitLoss'],
  ['6602 管理费用', 'profitLoss'],
  ['资产类', 'asset']
]
for (const [input, expected] of cases) {
  const result = classifyAccount(input)
  check(`科目识别：${input}`, result.matched && result.classId === expected, result.classId || result.reason)
}

const questions = [
  ['会计六要素是什么', '资产、负债、所有者权益、收入、费用和利润'],
  ['三大报表', '资产负债表、利润表和现金流量表'],
  ['增值税税率', '13%'],
  ['凭证要素', '附件张数'],
  ['利润总额怎么算', '利润总额'],
  ['六大类别和六要素区别', '不同']
]
for (const [question, expected] of questions) {
  const answer = answerAccountingQuestion(question)
  check(`基础问答：${question}`, Boolean(answer && answer.answer.includes(expected)), answer?.answer || '未匹配')
}

const complete = validateVoucherText(COMPLETE_VOUCHER_SAMPLE)
check('完整凭证样例', complete.status === 'complete' && complete.score >= 90 && complete.extracted.accounts.length === 2, `${complete.status}/${complete.score}`)
check('完整凭证借贷平衡', complete.checks.find((item) => item.id === 'balance')?.status === 'pass', complete.checks.find((item) => item.id === 'balance')?.detail)
const uppercase = validateVoucherText(UPPERCASE_VOUCHER_SAMPLE)
check('大写金额一致样例', uppercase.status === 'complete' && uppercase.checks.find((item) => item.id === 'capsAmount')?.status === 'pass', uppercase.checks.find((item) => item.id === 'capsAmount')?.detail)
const capsMismatch = validateVoucherText(`${COMPLETE_VOUCHER_SAMPLE}\n大写金额：贰拾万元整`)
check('大小写金额交叉校验', capsMismatch.missing.includes('大写金额'), capsMismatch.checks.find((item) => item.id === 'capsAmount')?.detail)
check('不可验证项单独列示', Array.isArray(complete.unverifiable) && complete.unverifiable.length >= 5, String(complete.unverifiable?.length || 0))
const incomplete = validateVoucherText(INCOMPLETE_VOUCHER_SAMPLE)
check('缺失凭证样例', incomplete.status === 'incomplete' && incomplete.missing.includes('凭证编号') && incomplete.missing.includes('贷方金额'), incomplete.missing.join('、'))
check('缺失凭证识别附件', incomplete.extracted.attachmentCount === 1, String(incomplete.extracted.attachmentCount))
// 回归：真实 OCR 会把表格按列拆成多个文本块 —— 表头“贷方金额”单独成行、
// 金额落在后面的纯数字行，且“合计”行只剩一侧金额。
// 若把合计行解析出的 0/0 当成结论，本来平衡的凭证会被误判为不平衡。
const ocrColumnSplit = validateVoucherText([
  '记账凭证',
  '',
  '2024年5月3日      凭证编号: 记字001号           附件: 2张',
  '',
  '摘要          总账科目      明细科目      借方金额',
  '',
  '收到股东投资款       银行存款        建行基本户       300000.00',
  '',
  '收到股东投资款     实收资本      杨云峰',
  '',
  '合计                                        300000.00',
  '制单: 张三              审核: 李四            记账: 王五',
  '',
  '贷方金额',
  '',
  '300000.00',
  '',
  '300000.00'
].join('\n'), { ocrConfidence: 91 })
check('OCR 分列块仍判定平衡', ocrColumnSplit.checks.find((i) => i.id === 'balance')?.status === 'pass', JSON.stringify(ocrColumnSplit.extracted.amounts))
check('OCR 分列块金额不重复计算', ocrColumnSplit.extracted.amounts.debit === 300000 && ocrColumnSplit.extracted.amounts.credit === 300000, `借 ${ocrColumnSplit.extracted.amounts.debit} 贷 ${ocrColumnSplit.extracted.amounts.credit}`)
check('OCR 推断方向标记待确认', ocrColumnSplit.extracted.amounts.inferred === true && ocrColumnSplit.checks.find((i) => i.id === 'debit')?.status === 'warn', ocrColumnSplit.checks.find((i) => i.id === 'debit')?.status)

// 回归：合计行完全没有金额时，不得覆盖已经读到的分录行
const zeroTotal = validateVoucherText([
  '记账凭证',
  '2024年5月3日',
  '凭证编号：记字001号',
  '摘要：收到股东投资款',
  '银行存款 1002 借方金额 300000.00',
  '实收资本 4001 贷方金额 300000.00',
  '合计',
  '附件：2张',
  '制单：张三 审核：李四 记账：王五'
].join('\n'))
check('空合计行不覆盖分录行', zeroTotal.checks.find((i) => i.id === 'balance')?.status === 'pass', JSON.stringify(zeroTotal.extracted.amounts))

// --- 逐字段置信度：低置信字段必须降级为 warn，且不能给出"形式完整" ---
// 构造一份字段齐全、但签名区被识别成乱码的场景（实测中"王五"被读成"EA"，置信度 56）
const goodText = [
  '记账凭证',
  '2024年5月3日',
  '凭证编号：记字001号',
  '摘要：收到股东投资款',
  '银行存款 1002 借方金额 300000.00',
  '实收资本 4001 贷方金额 300000.00',
  '合计',
  '附件：2张',
  '制单：张三 审核：李四 记账：EA'
].join('\n')
const wordsOf = (overrides = {}) => Object.entries({
  '记账凭证': 95, '2024年5月3日': 92, '记字001号': 90, '收到股东投资款': 88,
  '银行存款': 91, '1002': 93, '实收资本': 89, '4001': 93, '300000.00': 94,
  '合计': 86, '附件': 90, '制单': 92, '张三': 90, '审核': 92, '李四': 90, '记账': 92, 'EA': 56,
  ...overrides
}).map(([text, confidence]) => ({ text, confidence }))

const withHighConf = validateVoucherText(goodText, { words: wordsOf(), fieldWarnThreshold: 78 })
check('高置信字段不产生低置信清单', withHighConf.lowConfidenceFields.length === 1, JSON.stringify(withHighConf.lowConfidenceFields))
check('低置信字段被单独标出', withHighConf.lowConfidenceFields[0]?.id === 'signatures', JSON.stringify(withHighConf.lowConfidenceFields))
check('低置信字段的检查项降级为 warn', withHighConf.checks.find((i) => i.id === 'signatures')?.status === 'warn', withHighConf.checks.find((i) => i.id === 'signatures')?.status)
check('低置信字段提示中含置信度数值', withHighConf.checks.find((i) => i.id === 'signatures')?.detail.includes('56%'), withHighConf.checks.find((i) => i.id === 'signatures')?.detail)
check('关键字段低置信时不得判为形式完整', withHighConf.status !== 'complete', withHighConf.status)
check('低置信提示写入 notes', withHighConf.notes.some((n) => n.includes('置信度偏低') && n.includes('责任签名')), withHighConf.notes[0])
check('置信度清单包含各字段数值', withHighConf.fieldConfidences.some((i) => i.id === 'date' && i.confidence === 92), JSON.stringify(withHighConf.fieldConfidences.slice(0, 3)))

// 无置信度数据时行为不变（手工粘贴文本不应被降级）
const noWords = validateVoucherText(goodText)
check('无置信度数据时不降级', noWords.lowConfidenceFields.length === 0 && noWords.fieldConfidences.length === 0, JSON.stringify(noWords.lowConfidenceFields))
check('无置信度数据时金额等仍可判通过', noWords.checks.find((i) => i.id === 'debit')?.status === 'pass', noWords.checks.find((i) => i.id === 'debit')?.status)

// 阈值可调：把阈值提到 95，应有更多字段被标出
const strict = validateVoucherText(goodText, { words: wordsOf(), fieldWarnThreshold: 95 })
check('提高阈值后低置信字段变多', strict.lowConfidenceFields.length > withHighConf.lowConfidenceFields.length, `${strict.lowConfidenceFields.length} > ${withHighConf.lowConfidenceFields.length}`)

// 全部高置信时才允许 complete
const allHigh = validateVoucherText(goodText, { words: wordsOf({ EA: 96 }), fieldWarnThreshold: 78 })
check('全部高置信时给出完整结论', allHigh.lowConfidenceFields.length === 0 && allHigh.status === 'complete', `${allHigh.status} / ${JSON.stringify(allHigh.lowConfidenceFields)}`)

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` · ${item.detail}` : ''}`)
const passed = results.filter((item) => item.passed).length
console.log(`\n${passed}/${results.length} 个会计基础与凭证检查断言通过`)
process.exit(passed === results.length ? 0 : 1)

