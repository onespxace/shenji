// 审计用例库：每个用例都自带可运行的数据、明确的审计目标和可验证的预期结果。
// 断言逻辑由 scripts/validate-showcase.mjs 复用执行，保证文档与实际行为永不脱节。

import { auditTools } from './audit-tools.js'
import { classifyAccount, answerAccountingQuestion } from './accounting-data.js'
import { validateVoucherText, COMPLETE_VOUCHER_SAMPLE, UPPERCASE_VOUCHER_SAMPLE } from './voucher-validator.js'

const rows = (text) => auditTools.toTable(auditTools.parseCSV(text)).data

/* ------------------------------------------------------------------ */
/* 一、审计程序用例（可在“数据分析”页一键载入并运行）                    */
/* ------------------------------------------------------------------ */

const DUPLICATE_CSV = `日期,凭证号,发票号,类别,金额,摘要,对方单位
2025-03-03,V-001,INV-001,差旅费,1250.00,北京出差机票,客户A
2025-03-04,V-002,INV-001,差旅费,1250.00,北京出差机票,客户A
2025-03-08,V-004,INV-002,业务招待费,8000.00,客户宴请,客户B
2025-03-15,V-006,INV-004,咨询费,150000.00,项目咨询,顾问D
2025-03-16,V-007,INV-004,咨询费,150000.00,项目咨询,顾问D
2025-03-29,V-011,INV-006,办公费,9000.00,电脑,供应商C
2025-04-02,V-013,INV-008,服务费,25000.00,技术服务,供应商F
2025-04-03,V-014,INV-009,服务费,25000.00,技术服务,供应商F
2025-04-12,V-024,INV-017,业务招待费,4600.00,客户沟通,客户B`

const GAP_CSV = `凭证号,日期,摘要,金额
1,2025-03-03,备用金,5000
2,2025-03-05,差旅报销,3200
4,2025-03-08,办公用品,860
5,2025-03-12,业务招待,4200
6,2025-03-15,咨询费,150000
7,2025-03-18,运费,2300
9,2025-03-25,培训费,4800
10,2025-03-28,设备维修,1800`

const UNBALANCED_CSV = `凭证号,日期,摘要,借方,贷方
JZ-001,2025-03-31,结转生产成本,486000.00,0
JZ-002,2025-03-31,结转主营业务成本,0,479800.00
JZ-003,2025-03-31,结转本年利润,0,6200.00
JZ-004,2025-03-31,手工调整管理费用,15000.00,0
JZ-005,2025-03-31,手工调整管理费用,0,13500.00`

const JOURNAL_CSV = `日期,凭证号,摘要,金额
2025-03-08,V-101,采购办公用品,5000
2025-03-09,V-102,,30000
2025-03-15,V-103,调整,100000
2025-03-22,V-104,咨询费,60000
2025-03-29,V-105,备用金,10000`

const AGING_CSV = `客户,发票日期,金额
客户甲,2025-03-20,120000
客户乙,2025-02-18,86000
客户丙,2023-12-25,240000
客户丁,2023-08-10,150000
客户戊,2022-11-02,92000
客户己,2025-03-28,45000`

// 本福特定律样例：用生成器构造 120 条金额，其中 45% 以 1 开头（本福特期望 30.1%），
// 稳定触发"偏离显著"，同时避免在源码里堆 120 行字面量。
function buildBenfordCsv() {
  const values = []
  for (let i = 0; i < 54; i += 1) values.push(100000 + i * 137)
  for (let i = 0; i < 12; i += 1) values.push(200000 + i * 911)
  for (let i = 0; i < 12; i += 1) values.push(300000 + i * 577)
  for (let i = 0; i < 11; i += 1) values.push(400000 + i * 433)
  for (let i = 0; i < 10; i += 1) values.push(500000 + i * 389)
  for (let i = 0; i < 9; i += 1) values.push(600000 + i * 311)
  for (let i = 0; i < 7; i += 1) values.push(700000 + i * 277)
  for (let i = 0; i < 5; i += 1) values.push(800000 + i * 233)
  const body = values.map((value, index) => `B-${String(index + 1).padStart(3, '0')},${value.toFixed(2)}`).join('\n')
  return `编号,金额\n${body}`
}
/* ------------------------------------------------------------------ */
/* 二、会计与凭证用例（在“会计基础”页验证）                             */
/* ------------------------------------------------------------------ */

const VOUCHER_MISMATCH_TEXT = `${COMPLETE_VOUCHER_SAMPLE}
合计人民币（大写）：贰拾万元整`

/* ------------------------------------------------------------------ */
/* 用例定义                                                            */
/* ------------------------------------------------------------------ */

export const SHOWCASE_CASES = [
  {
    id: 'uc-duplicate',
    kind: 'tool',
    tool: 'duplicates',
    title: '同一张发票被报销两次',
    scene: '市场部员工出差，机票发票号 INV-001 在相邻两天各入账一次，摘要与金额完全一致。',
    objective: '验证费用真实发生，防止重复报销与虚列费用。',
    standard: '注册会计师准则 1141（舞弊责任）、1301（审计证据充分性）',
    risk: '高 · 舞弊风险',
    csv: DUPLICATE_CSV,
    params: { key1: '发票号', key2: '' },
    expect(result) {
      const groups = result.groups || []
      const ok = groups.length === 2 && groups.every((g) => g.count === 2)
      return { ok, detail: `识别 ${groups.length} 组重复：${groups.map((g) => g.key || g.value).join('、') || '无'}` }
    }
  },
  {
    id: 'uc-gap',
    kind: 'tool',
    tool: 'gaps',
    title: '记账凭证编号断号',
    scene: '抽查 3 月凭证，编号从 V-002 直接跳到 V-004，V-003 未见；V-007 之后跳到 V-009。',
    objective: '确认凭证序列连续，排查凭证被抽走、替换或未入账。',
    standard: '《会计基础工作规范》关于凭证编号连续的要求',
    risk: '中 · 凭证完整性',
    csv: GAP_CSV,
    params: { sequence: '凭证号' },
    expect(result) {
      const missing = result.missing || []
      const ok = missing.length === 2 && missing.join(',') === '3,8'
      return { ok, detail: `编号范围 ${result.min}–${result.max}，缺失 ${missing.join('、') || '无'}` }
    }
  },
  {
    id: 'uc-balance',
    kind: 'tool',
    tool: 'trialBalance',
    title: '期末手工分录导致借贷不平',
    scene: '结转成本与本年利润后，追加两笔手工调整管理费用分录，金额相差 1,500 元。',
    objective: '验证期末分录完整、借贷平衡，识别管理层凌驾与人为调节。',
    standard: '注册会计师准则 1141：管理层凌驾测试应覆盖期末手工分录',
    risk: '高 · 管理层凌驾',
    csv: UNBALANCED_CSV,
    params: { debit: '借方', credit: '贷方' },
    expect(result) {
      const ok = !result.balanced && Math.abs(result.diff) === 1500
      return { ok, detail: `借方 ${result.dr.toFixed(2)}，贷方 ${result.cr.toFixed(2)}，差额 ${result.diff.toFixed(2)}` }
    }
  },
  {
    id: 'uc-journal',
    kind: 'tool',
    tool: 'journalTests',
    title: '摘要含糊的大额整数分录',
    scene: '月末前三天集中录入一笔 10 万元“调整”分录且摘要为空，另有 3 万元无摘要分录。',
    objective: '筛查异常入账线索，锁定需要进一步追查的凭证。',
    standard: '《企业内部控制基本规范》不相容职务与授权审批控制',
    risk: '中 · 异常分录',
    csv: JOURNAL_CSV,
    params: { date: '日期', amount: '金额', description: '摘要', largeAmount: 100000 },
    expect(result) {
      const ok = result.big.length >= 1 && result.blank.length >= 1
      return { ok, detail: `大额 ${result.big.length} 笔、空摘要 ${result.blank.length} 笔、整数 ${result.round.length} 笔、节假日 ${result.weekend.length} 笔` }
    }
  },
  {
    id: 'uc-aging',
    kind: 'tool',
    tool: 'aging',
    title: '应收账款长期挂账',
    scene: '以 2025-04-15 为基准日，客户丙、丁、戊三笔应收款账龄均已超过 365 天，合计 482,000 元。',
    objective: '识别长期未收回款项，评估坏账准备计提是否充分。',
    standard: '《企业会计准则第 22 号》应收款项预期信用损失',
    risk: '中 · 减值计提',
    csv: AGING_CSV,
    params: { date: '发票日期', amount: '金额', asOf: '2025-04-15' },
    expect(result) {
      // 最后一档「365天以上」由 min>=366 判定；注意其 max 是 Infinity 而非 null
      const over = (result.buckets || []).find((b) => b.min >= 366)?.total || 0
      const ok = result.total === 733000 && over === 482000
      return { ok, detail: `合计 ${result.total.toFixed(2)}，其中 365 天以上 ${over.toFixed(2)}` }
    }
  },
  {
    id: 'uc-benford',
    kind: 'tool',
    tool: 'benford',
    title: '首位数字分布异常',
    scene: '一组费用金额中大量出现以 1 开头的整数（100000），与本福特定律的预期分布明显偏离。',
    objective: '用分析程序快速锁定异常区间，缩小明细测试范围。',
    standard: '注册会计师准则 5201（分析程序）',
    risk: '低 · 分析性线索',
    csv: buildBenfordCsv(),
    params: { amount: '金额' },
    expect(result) {
      const ok = result.n >= 100 && result.chi2 > 15.51
      return { ok, detail: `有效样本 ${result.n}，卡方 ${result.chi2.toFixed(2)}，结论：${result.verdict}` }
    }
  },
  {
    id: 'uc-account',
    kind: 'knowledge',
    title: '输入科目名称即知所属大类',
    scene: '拿到一张凭证，不确定“实收资本”和“主营业务成本”分别属于哪一大类。',
    objective: '快速核对科目归类，避免用错科目导致报表错列。',
    standard: '《企业会计准则——应用指南》会计科目表',
    risk: '低 · 基础核对',
    steps: [
      { label: '输入', value: '实收资本' },
      { label: '输入', value: '主营业务成本' },
      { label: '输入', value: '1002' }
    ],
    expect() {
      const equity = classifyAccount('实收资本')
      const cost = classifyAccount('主营业务成本')
      const bank = classifyAccount('1002')
      const ok = equity.classId === 'equity' && cost.classId === 'profitLoss' && bank.classId === 'asset'
      return { ok, detail: `实收资本→${equity.className}；主营业务成本→${cost.className}；1002→${bank.className}` }
    }
  },
  {
    id: 'uc-ask',
    kind: 'knowledge',
    title: '六大要素与三大报表',
    scene: '备考或答辩时被问“六要素是什么”“三大报表是什么”，需要稳定、准确的口径。',
    objective: '离线速答，避免口径记错；回答附带政策时效提示。',
    standard: '《企业会计准则——基本准则》第十条',
    risk: '低 · 基础口径',
    steps: [
      { label: '提问', value: '会计六要素是什么？' },
      { label: '提问', value: '会计三大报表是什么？' },
      { label: '提问', value: '常用增值税税率有哪些？' }
    ],
    expect() {
      const six = answerAccountingQuestion('会计六要素是什么')
      const three = answerAccountingQuestion('会计三大报表是什么')
      const vat = answerAccountingQuestion('常用增值税税率有哪些')
      const ok = six.answer.includes('资产、负债、所有者权益、收入、费用和利润')
        && three.answer.includes('资产负债表、利润表和现金流量表')
        && vat.answer.includes('13%')
      return { ok, detail: `六要素✓ 三大报表✓ 税率含 13%/9%/6%/3%✓` }
    }
  },
  {
    id: 'uc-voucher-ok',
    kind: 'knowledge',
    title: '完整凭证通过全部 10 项检查',
    scene: '上传一张要素齐全、借贷平衡的记账凭证图片。',
    objective: '确认凭证形式完整，读出借方与贷方合计金额。',
    standard: '《会计基础工作规范》第四十八条',
    risk: '低 · 形式完整',
    text: UPPERCASE_VOUCHER_SAMPLE,
    expect() {
      const r = validateVoucherText(UPPERCASE_VOUCHER_SAMPLE)
      const ok = r.status === 'complete' && r.checks.length === 10 && r.missing.length === 0
      return { ok, detail: `完整度 ${r.score}，${r.checks.length} 项检查，缺失 ${r.missing.length} 项` }
    }
  },
  {
    id: 'uc-voucher-caps',
    kind: 'knowledge',
    title: '大写金额与小写金额不一致',
    scene: '同一张凭证，阿拉伯数字写 300,000.00，中文大写却写“贰拾万元整”。',
    objective: '通过两条独立渲染路径交叉验证金额，防止其中一处被篡改。',
    standard: '《会计法》第十三条：原始凭证大写金额不得擅自更改',
    risk: '高 · 金额篡改线索',
    text: VOUCHER_MISMATCH_TEXT,
    expect() {
      const r = validateVoucherText(VOUCHER_MISMATCH_TEXT)
      const check = r.checks.find((c) => c.id === 'capsAmount')
      const ok = check?.status === 'fail' && r.missing.includes('大写金额')
      return { ok, detail: check ? check.detail : '未触发大写金额检查' }
    }
  }
]

/* ------------------------------------------------------------------ */
/* 执行器：教学页与验证脚本共用同一套逻辑                                */
/* ------------------------------------------------------------------ */

export function runShowcaseCase(item) {
  try {
    if (item.kind === 'tool') {
      const data = rows(item.csv)
      const p = item.params || {}
      let result
      switch (item.tool) {
        case 'duplicates': result = { groups: auditTools.duplicates(data, [p.key1].filter(Boolean)) }; break
        case 'gaps': result = auditTools.gaps(data, p.sequence); break
        case 'trialBalance': result = auditTools.trialBalance(data, p.debit, p.credit); break
        case 'journalTests': result = auditTools.journalTests(data, p.date, p.amount, p.description, Number(p.largeAmount) || 100000); break
        case 'aging': result = auditTools.aging(data, p.date, p.amount, p.asOf); break
        case 'stratify': result = auditTools.stratify(data, p.group, p.amount); break
        case 'benford': result = auditTools.benford(data.map((row) => row[p.amount])); break
        default: throw new Error(`未实现的工具：${item.tool}`)
      }
      const verdict = item.expect(result)
      return { passed: verdict.ok, detail: verdict.detail, result }
    }
    const verdict = item.expect()
    return { passed: verdict.ok, detail: verdict.detail }
  } catch (error) {
    return { passed: false, detail: `执行出错：${error.message || error}` }
  }
}

export function runAllShowcaseCases() {
  return SHOWCASE_CASES.map((item) => {
    const outcome = runShowcaseCase(item)
    return { id: item.id, title: item.title, kind: item.kind, ...outcome }
  })
}



