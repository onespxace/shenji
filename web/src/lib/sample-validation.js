import { auditTools } from './audit-tools.js'

export const SAMPLE_CSV = `日期,凭证号,发票号,类别,金额,借方,贷方,摘要,对方单位
2025-03-03,V-001,INV-001,差旅费,1250.00,1250.00,0,北京出差机票,客户A
2025-03-04,V-002,INV-001,差旅费,1250.00,1250.00,0,北京出差机票,客户A
2025-03-08,V-004,INV-002,业务招待费,8000.00,8000.00,0,客户宴请,客户B
2025-03-09,V-005,INV-003,办公费,320.50,320.50,0,打印纸,供应商C
2025-03-15,V-006,INV-004,咨询费,150000.00,150000.00,0,项目咨询,顾问D
2025-03-16,V-007,INV-004,咨询费,150000.00,150000.00,0,项目咨询,顾问D
2025-03-22,V-009,INV-005,差旅费,20000.00,20000.00,0,考察,客户A
2025-03-23,V-010,,业务招待费,5000.00,5000.00,0,客户宴请,客户B
2025-03-29,V-011,INV-006,办公费,9000.00,9000.00,0,电脑,供应商C
2025-03-30,V-012,INV-007,会议费,12000.00,12000.00,0,研讨会,协会E
2025-04-02,V-013,INV-008,服务费,25000.00,25000.00,0,技术服务,供应商F
2025-04-03,V-014,INV-009,服务费,25000.00,25000.00,0,技术服务,供应商F
2025-04-05,V-016,INV-010,维修费,1800.00,1800.00,0,设备维修,供应商G
2025-04-06,V-017,INV-011,运费,2300.00,2300.00,0,物流费用,物流H
2025-04-07,V-018,INV-012,办公费,680.00,680.00,0,办公用品,供应商C
2025-04-08,V-019,INV-013,培训费,4800.00,4800.00,0,岗位培训,协会E
2025-04-09,V-021,INV-014,服务费,7300.00,7300.00,0,咨询服务,顾问D
2025-04-10,V-022,INV-015,服务费,7300.00,7300.00,0,咨询服务,顾问D
2025-04-11,V-023,INV-016,差旅费,1680.00,1680.00,0,出差住宿,酒店I
2025-04-12,V-024,INV-017,业务招待费,4600.00,4600.00,0,客户沟通,客户B`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function benfordCase() {
  const values = Array.from({ length: 140 }, (_, index) => (index + 1) * 37 + (index % 7) * 113)
  const result = auditTools.benford(values)
  assert(result.n === 140, '有效样本数不正确')
  assert(result.rows.length === 9, '本福特分布行数不正确')
  return `有效样本 ${result.n}，卡方统计量 ${result.chi2.toFixed(2)}`
}

function duplicateCase() {
  const data = [
    { invoice: 'INV-001', amount: '100' },
    { invoice: 'INV-002', amount: '200' },
    { invoice: 'INV-001', amount: '100' },
    { invoice: 'INV-003', amount: '300' }
  ]
  const result = auditTools.duplicates(data, ['invoice'])
  assert(result.length === 1 && result[0].count === 2, '未识别重复发票')
  return `识别 ${result.length} 组重复，涉及 ${result[0].count} 条记录`
}

function gapCase() {
  const data = [{ no: '1' }, { no: '2' }, { no: '4' }, { no: '5' }]
  const result = auditTools.gaps(data, 'no')
  assert(result.missing.join(',') === '3', '断号结果不正确')
  return `编号范围 ${result.min}–${result.max}，缺失 ${result.missing.join('、')}`
}

function agingCase() {
  const data = [
    { date: '2025-03-20', amount: '100' },
    { date: '2025-02-20', amount: '200' },
    { date: '2024-12-20', amount: '300' }
  ]
  const result = auditTools.aging(data, 'date', 'amount', '2025-04-15')
  assert(result.total === 600, '账龄合计不正确')
  assert(result.buckets[0].count === 1 && result.buckets[1].count === 1 && result.buckets[3].count === 1, '账龄分段不正确')
  return `合计 ${result.total}，有效日期 ${data.length} 行`
}

function stratifyCase() {
  const data = [
    { category: '差旅费', amount: '100' },
    { category: '差旅费', amount: '200' },
    { category: '咨询费', amount: '300' }
  ]
  const result = auditTools.stratify(data, 'category', 'amount')
  assert(result.grand === 600 && result.rows.length === 2, '分组汇总不正确')
  return `${result.rows.length} 个分组，合计 ${result.grand}`
}

function samplingCase() {
  const data = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, amount: index * 10 }))
  const size = auditTools.sampleSize(100, 0.95, 0.05, 0.01)
  const first = auditTools.pickRandom(data, size.n, 20250925)
  const second = auditTools.pickRandom(data, size.n, 20250925)
  assert(size.n > 0 && size.n <= 100, '样本量不在总体范围内')
  assert(JSON.stringify(first) === JSON.stringify(second), '固定种子无法复现')
  return `建议样本 ${size.n}，固定种子可复现`
}

function journalCase() {
  const data = [
    { date: '2025-03-08', amount: '5000', description: '' },
    { date: '2025-03-10', amount: '150000', description: '大额采购' },
    { date: '2025-03-11', amount: '3000', description: '整数金额' }
  ]
  const result = auditTools.journalTests(data, 'date', 'amount', 'description', 100000)
  assert(result.weekend.length === 1, '周末筛查不正确')
  assert(result.round.length === 3, '整数金额筛查不正确')
  assert(result.big.length === 1 && result.blank.length === 1, '大额或摘要筛查不正确')
  return `周末 ${result.weekend.length}，整数 ${result.round.length}，大额 ${result.big.length}，空摘要 ${result.blank.length}`
}

function trialBalanceCase() {
  const data = [
    { debit: '100.00', credit: '100.00' },
    { debit: '250.50', credit: '250.50' },
    { debit: '0', credit: '0' }
  ]
  const result = auditTools.trialBalance(data, 'debit', 'credit')
  assert(result.balanced && result.diff === 0, '借贷合计不平衡')
  return `借贷合计均为 ${result.dr.toFixed(2)}，差额 ${result.diff.toFixed(2)}`
}

export const SAMPLE_CASES = [
  { id: 'benford', name: '本福特定律', description: '首位数字分布与卡方统计量', run: benfordCase },
  { id: 'duplicates', name: '重复检查', description: '关键字段重复记录', run: duplicateCase },
  { id: 'gaps', name: '断号检查', description: '编号连续性与缺失号码', run: gapCase },
  { id: 'aging', name: '账龄分析', description: '日期分段与金额合计', run: agingCase },
  { id: 'stratify', name: '分层汇总', description: '分组金额与总体合计', run: stratifyCase },
  { id: 'sampling', name: '审计抽样', description: '样本量与固定种子复现', run: samplingCase },
  { id: 'journals', name: '凭证筛查', description: '周末、整数、大额和空摘要', run: journalCase },
  { id: 'trialBalance', name: '试算平衡', description: '借贷合计与差额', run: trialBalanceCase }
]

export function runSampleValidation() {
  return SAMPLE_CASES.map((item) => {
    try {
      return { ...item, passed: true, detail: item.run() }
    } catch (error) {
      return { ...item, passed: false, detail: error.message || String(error) }
    }
  })
}
