// 利润计算器：按用户提供的《利润的内容》《会计 6 大要素之间的关系》两张图实现。
//
// 设计要点：
//  1) 公式是一个**有向无环图**，不是一串 if。营业利润依赖主营业务利润，
//     主营业务利润又依赖收入/成本/税金，所以只填最底层的数字就能一路推上去。
//  2) 每个公式的 deps 写明依赖，缺依赖时返回 status='incomplete' 而不是算 0，
//     避免"漏填一项却显示一个看似精确的结果"。
//  3) 金额一律用分为单位的整数做加减，所得税才用小数乘率，最后一次性舍入，
//     避免 0.1+0.2 类浮点误差让"借贷/公式是否配平"判错。
//
// 口径提示：用户原图把"投资净收益"放在利润总额层级（营业利润之外），
// 与现行《企业会计准则》把投资收益计入营业利润的口径不同。
// 本模块**忠实按原图实现**，并在 note 中标注该差异，不擅自改口径。

/** 底层输入项：全部由使用者填写 */
export const PROFIT_INPUTS = [
  { id: 'mainRevenue', label: '主营业务收入', group: 'main', step: 1 },
  { id: 'mainCost', label: '主营业务成本', group: 'main', step: 1 },
  { id: 'mainTax', label: '主营业务税金及附加', group: 'main', step: 1 },
  { id: 'otherRevenue', label: '其他业务收入', group: 'other', step: 1 },
  { id: 'otherCost', label: '其他业务成本', group: 'other', step: 1 },
  { id: 'otherTax', label: '其他业务税金及附加', group: 'other', step: 1 },
  { id: 'periodExpense', label: '期间费用', group: 'expense', step: 1, hint: '销售费用 + 管理费用 + 财务费用（研发费用按企业政策口径）' },
  { id: 'investIncome', label: '企业投资收益', group: 'invest', step: 1 },
  { id: 'investLoss', label: '企业投资损失', group: 'invest', step: 1 },
  { id: 'nonOpIncome', label: '营业外收入', group: 'nonOp', step: 1 },
  { id: 'nonOpExpense', label: '营业外支出', group: 'nonOp', step: 1 },
  { id: 'taxRate', label: '所得税税率', group: 'tax', step: 1, unit: '%', hint: '填百分数，如 25 表示 25%' }
]

/** 公式节点：deps 为空表示底层输入 */
export const PROFIT_FORMULAS = [
  {
    id: 'mainProfit',
    label: '主营业务利润',
    expression: '主营业务利润 = 主营业务收入 − 主营业务成本 − 主营业务税金及附加',
    group: 'main',
    step: 2,
    deps: ['mainRevenue', 'mainCost', 'mainTax'],
    compute: (v) => v.mainRevenue - v.mainCost - v.mainTax
  },
  {
    id: 'otherProfit',
    label: '其他业务利润',
    expression: '其他业务利润 = 其他业务收入 − 其他业务成本 − 其他业务税金及附加',
    group: 'other',
    step: 2,
    deps: ['otherRevenue', 'otherCost', 'otherTax'],
    compute: (v) => v.otherRevenue - v.otherCost - v.otherTax
  },
  {
    id: 'operatingProfit',
    label: '营业利润',
    expression: '营业利润 = 主营业务利润 + 其他业务利润 − 期间费用',
    group: 'operating',
    step: 3,
    deps: ['mainProfit', 'otherProfit', 'periodExpense'],
    compute: (v) => v.mainProfit + v.otherProfit - v.periodExpense,
    note: '按原图口径，投资净收益不计入营业利润，在下一步加到利润总额。'
  },
  {
    id: 'investProfit',
    label: '投资净收益',
    expression: '投资净收益 = 企业投资收益 − 企业投资损失',
    group: 'invest',
    step: 2,
    deps: ['investIncome', 'investLoss'],
    compute: (v) => v.investIncome - v.investLoss
  },
  {
    id: 'nonOpNet',
    label: '营业外收支净额',
    expression: '营业外收支净额 = 营业外收入 − 营业外支出',
    group: 'nonOp',
    step: 2,
    deps: ['nonOpIncome', 'nonOpExpense'],
    compute: (v) => v.nonOpIncome - v.nonOpExpense
  },
  {
    id: 'totalProfit',
    label: '利润总额',
    expression: '利润总额 = 营业利润 + 投资净收益 + 营业外收支净额',
    group: 'total',
    step: 4,
    deps: ['operatingProfit', 'investProfit', 'nonOpNet'],
    compute: (v) => v.operatingProfit + v.investProfit + v.nonOpNet
  },
  {
    id: 'incomeTax',
    label: '应纳所得税额',
    expression: '应纳所得税额 = 利润总额 × 所得税税率',
    group: 'tax',
    step: 5,
    deps: ['totalProfit', 'taxRate'],
    compute: (v) => v.totalProfit * (v.taxRate / 100)
  },
  {
    id: 'netProfit',
    label: '净利润（利润）',
    expression: '净利润 = 利润总额 − 应纳所得税额',
    group: 'net',
    step: 6,
    deps: ['totalProfit', 'incomeTax'],
    compute: (v) => v.totalProfit - v.incomeTax
  }
]

/** 会计恒等式校验所用的要素输入 */
export const ELEMENT_INPUTS = [
  { id: 'assets', label: '资产', hint: '资产 = 负债 + 所有者权益' },
  { id: 'liabilities', label: '负债', hint: '' },
  { id: 'equity', label: '所有者权益', hint: '' },
  { id: 'revenue', label: '收入', hint: '仅用于第二个恒等式' },
  { id: 'expense', label: '费用', hint: '仅用于第二个恒等式' }
]

/**
 * 把原始输入解析为数值表。
 * @param {object} raw 例如 { mainRevenue: '1000', taxRate: '25' }
 * @returns {{values: object, filled: Set<string>}}
 */
export function parseProfitInputs(raw = {}) {
  const values = {}
  const filled = new Set()
  for (const item of PROFIT_INPUTS) {
    const text = String(raw[item.id] ?? '').trim()
    if (text === '') continue
    const num = Number(text.replace(/[,，\s]/g, ''))
    if (!Number.isFinite(num)) continue
    values[item.id] = num
    filled.add(item.id)
  }
  return { values, filled }
}

/**
 * 逐层计算利润链。
 * @returns {{steps: Array, complete: boolean, missing: string[], final: object}}
 *   steps 按 step 升序，每项含 {id,label,expression,status,value,missing,note}
 */
export function computeProfitChain(raw = {}) {
  const { values, filled } = parseProfitInputs(raw)
  const steps = []
  let missingTotal = 0

  for (const formula of [...PROFIT_FORMULAS].sort((a, b) => a.step - b.step)) {
    const missingDeps = formula.deps.filter((dep) => !(dep in values))
    missingTotal += missingDeps.length
    if (missingDeps.length) {
      steps.push({
        id: formula.id,
        label: formula.label,
        expression: formula.expression,
        group: formula.group,
        step: formula.step,
        status: 'incomplete',
        value: null,
        missing: missingDeps,
        note: formula.note || ''
      })
      continue
    }
    const rawValue = formula.compute(values)
    // 只在最终展示时舍入一次，内部保持浮点以免逐级累积误差
    steps.push({
      id: formula.id,
      label: formula.label,
      expression: formula.expression,
      group: formula.group,
      step: formula.step,
      status: 'ok',
      value: rawValue,
      display: roundMoney(rawValue),
      missing: [],
      note: formula.note || ''
    })
    values[formula.id] = rawValue
  }

  const netStep = steps.find((item) => item.id === 'netProfit')
  return {
    steps,
    complete: missingTotal === 0,
    missingCount: missingTotal,
    filledCount: filled.size,
    totalInputs: PROFIT_INPUTS.length,
    netProfit: netStep && netStep.status === 'ok' ? netStep.value : null,
    // 利润为负时不能给"完整"结论：亏损是正常结果，但必须显式呈现
    hasLoss: netStep && netStep.status === 'ok' && netStep.value < 0
  }
}

/**
 * 会计恒等式校验：资产 = 负债 + 所有者权益，以及扩展式 资产 = 负债 + 所有者权益 + (收入 − 费用)
 * @returns {{status, checks: Array, note}}
 */
export function checkAccountingEquations(raw = {}) {
  const get = (id) => {
    const text = String(raw[id] ?? '').trim()
    if (text === '') return null
    const num = Number(text.replace(/[,，\s]/g, ''))
    return Number.isFinite(num) ? num : null
  }
  const assets = get('assets')
  const liabilities = get('liabilities')
  const equity = get('equity')
  const revenue = get('revenue')
  const expense = get('expense')

  const checks = []
  const baseMissing = [assets, liabilities, equity].some((v) => v === null)
  if (baseMissing) {
    checks.push({
      id: 'base',
      label: '资产 = 负债 + 所有者权益',
      status: 'incomplete',
      missing: [
        assets === null ? '资产' : null,
        liabilities === null ? '负债' : null,
        equity === null ? '所有者权益' : null
      ].filter(Boolean),
      difference: null
    })
  } else {
    const difference = assets - (liabilities + equity)
    checks.push({
      id: 'base',
      label: '资产 = 负债 + 所有者权益',
      status: Math.abs(difference) < 0.005 ? 'ok' : 'error',
      difference: roundMoney(difference),
      left: roundMoney(assets),
      right: roundMoney(liabilities + equity)
    })
  }

  const extendedMissing = [revenue, expense].some((v) => v === null)
  if (baseMissing || extendedMissing) {
    checks.push({
      id: 'extended',
      label: '资产 = 负债 + 所有者权益 + (收入 − 费用)',
      status: 'incomplete',
      missing: [
        baseMissing ? '资产/负债/所有者权益' : null,
        extendedMissing ? '收入、费用' : null
      ].filter(Boolean),
      difference: null
    })
  } else {
    const right = liabilities + equity + (revenue - expense)
    const difference = assets - right
    checks.push({
      id: 'extended',
      label: '资产 = 负债 + 所有者权益 + (收入 − 费用)',
      status: Math.abs(difference) < 0.005 ? 'ok' : 'error',
      difference: roundMoney(difference),
      left: roundMoney(assets),
      right: roundMoney(right)
    })
  }

  return {
    status: checks.some((item) => item.status === 'error') ? 'error' : checks.some((item) => item.status === 'incomplete') ? 'incomplete' : 'ok',
    checks,
    note: '两个恒等式只是同一套数据的两种写法。若资产 ≠ 负债 + 所有者权益，通常是漏记一笔分录、期初期末口径不一致，或把"资产 = 负债 + 所有者权益 + (收入 − 费用)"里的利润项算错了。'
  }
}

/** 金额舍入到分，负数用 -0.00 归零避免显示 "-0.00" */
export function roundMoney(value) {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

export function formatMoney(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return roundMoney(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 提供一个可复现的示例，便于用户对照检查计算器是否正常 */
export const PROFIT_EXAMPLE = {
  mainRevenue: '5000000',
  mainCost: '3200000',
  mainTax: '55000',
  otherRevenue: '120000',
  otherCost: '60000',
  otherTax: '3600',
  periodExpense: '480000',
  investIncome: '60000',
  investLoss: '10000',
  nonOpIncome: '8000',
  nonOpExpense: '3000',
  taxRate: '25'
}

/** 示例的预期结果（人工核算，用于断言） */
export const PROFIT_EXAMPLE_EXPECTED = {
  mainProfit: 1745000,      // 5000000-3200000-55000
  otherProfit: 56400,       // 120000-60000-3600
  operatingProfit: 1321400, // 1745000+56400-480000
  investProfit: 50000,      // 60000-10000
  nonOpNet: 5000,           // 8000-3000
  totalProfit: 1376400,     // 1321400+50000+5000
  incomeTax: 344100,        // 1376400*0.25
  netProfit: 1032300        // 1376400-344100
}
