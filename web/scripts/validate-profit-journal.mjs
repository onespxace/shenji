// 利润计算器与会计分录知识库的断言。
// 覆盖：公式数值、依赖缺失、会计恒等式、分录自洽性、借贷配平、关键词匹配。
import process from 'node:process'
import {
  PROFIT_EXAMPLE,
  PROFIT_EXAMPLE_EXPECTED,
  PROFIT_FORMULAS,
  PROFIT_INPUTS,
  checkAccountingEquations,
  computeProfitChain,
  formatMoney,
  parseProfitInputs,
  roundMoney
} from '../src/lib/profit-calculator.js'
import {
  ACCOUNT_SUBACCOUNTS,
  JOURNAL_ENTRY_RULES,
  JOURNAL_GROUPS,
  allRuleAccountCodes,
  buildEntry,
  checkBalanced,
  matchJournalRules,
  validateRuleIntegrity
} from '../src/lib/journal-entries.js'
import { ACCOUNT_ENTRIES } from '../src/lib/accounting-data.js'

const results = []
const check = (name, condition, detail = '') => results.push({ name, passed: Boolean(condition), detail })
const near = (a, b, epsilon = 0.005) => Math.abs(a - b) < epsilon

// ---------------- 利润计算器 ----------------

const chain = computeProfitChain(PROFIT_EXAMPLE)
for (const [key, expected] of Object.entries(PROFIT_EXAMPLE_EXPECTED)) {
  const step = chain.steps.find((item) => item.id === key)
  check(`利润公式 ${key} 计算正确`, step && step.status === 'ok' && near(step.value, expected), step ? `${step.value} vs ${expected}` : '未生成')
}
check('利润链完整无缺失依赖', chain.complete === true, `missingCount=${chain.missingCount}`)
check('净利润已计算', near(chain.netProfit, PROFIT_EXAMPLE_EXPECTED.netProfit), String(chain.netProfit))
check('示例不为亏损', chain.hasLoss === false, String(chain.hasLoss))
check('输入项 12 个', PROFIT_INPUTS.length === 12, String(PROFIT_INPUTS.length))
check('公式节点 8 个', PROFIT_FORMULAS.length === 8, String(PROFIT_FORMULAS.length))
check('公式步骤编号 2-6 连续', JSON.stringify([...PROFIT_FORMULAS].map((f) => f.step).sort()) === JSON.stringify([2, 2, 2, 2, 3, 4, 5, 6]), JSON.stringify(PROFIT_FORMULAS.map((f) => f.step)))
check('每个公式都写明表达式', PROFIT_FORMULAS.every((f) => typeof f.expression === 'string' && f.expression.includes('=')), '有公式缺表达式')
check('公式依赖无环', (() => {
  // 依赖只能指向更早的 step，否则说明存在循环
  const stepOf = Object.fromEntries(PROFIT_FORMULAS.map((f) => [f.id, f.step]))
  return PROFIT_FORMULAS.every((f) => f.deps.every((d) => !(stepOf[d] >= f.step) || !stepOf[d]))
})())

// 缺依赖时必须报 incomplete，不能算出一个假结果
const partial = computeProfitChain({ mainRevenue: '100', mainCost: '40' })
check('缺依赖时不输出数值', partial.steps.find((s) => s.id === 'mainProfit').status === 'incomplete', partial.steps.find((s) => s.id === 'mainProfit').status)
check('缺依赖时列出缺哪几项', partial.steps.find((s) => s.id === 'mainProfit').missing.join(',') === 'mainTax', partial.steps.find((s) => s.id === 'mainProfit').missing.join(','))
check('全空输入不抛错', (() => { try { computeProfitChain({}); return true } catch { return false } })())
check('全空输入 complete 为 false', computeProfitChain({}).complete === false)
check('非数字输入被忽略', parseProfitInputs({ mainRevenue: 'abc' }).filled.size === 0, JSON.stringify(parseProfitInputs({ mainRevenue: 'abc' })))
check('带千分位的数字能解析', parseProfitInputs({ mainRevenue: '1,234,567' }).values.mainRevenue === 1234567)
check('负数输入可解析', parseProfitInputs({ nonOpExpense: '-500' }).values.nonOpExpense === -500)

// 亏损场景
const lossChain = computeProfitChain({ ...PROFIT_EXAMPLE, mainCost: '9000000' })
check('亏损时标记 hasLoss', lossChain.hasLoss === true, String(lossChain.netProfit))
check('亏损时仍能算完', lossChain.complete === true)

// 舍入
check('roundMoney 舍入到分', roundMoney(1.005) === 1.01 || roundMoney(1.005) === 1, String(roundMoney(1.005)))
check('roundMoney 消除 -0', Object.is(roundMoney(-0.001), 0), String(roundMoney(-0.001)))
check('formatMoney 空值显示占位', formatMoney(null) === '—', formatMoney(null))
check('formatMoney 两位小数', formatMoney(1234.5) === '1,234.50', formatMoney(1234.5))
check('所得税按百分数计算', near(computeProfitChain({ ...PROFIT_EXAMPLE, taxRate: '20' }).steps.find((s) => s.id === 'incomeTax').value, 1376400 * 0.2), '20% 税率结果不对')

// 会计恒等式
// 基本式与扩展式不能同时成立，除非收入=费用：扩展式右边多了未结转的利润。
// 因此分两组数据分别验证，不要用一组数据同时期待两条都通过。
const eqBasic = checkAccountingEquations({ assets: '1000', liabilities: '300', equity: '700' })
check('基本恒等式平衡判 ok', eqBasic.checks[0].status === 'ok', eqBasic.checks[0].status)
check('基本恒等式差额为 0', near(eqBasic.checks[0].difference, 0), String(eqBasic.checks[0].difference))
check('缺收入费用时扩展式判 incomplete', eqBasic.checks[1].status === 'incomplete', eqBasic.checks[1].status)
const eqExtended = checkAccountingEquations({ assets: '1300', liabilities: '300', equity: '700', revenue: '500', expense: '200' })
check('扩展式（资产含未结转利润）通过', eqExtended.checks[1].status === 'ok', eqExtended.checks[1].status)
const eqBad = checkAccountingEquations({ assets: '1000', liabilities: '300', equity: '600' })
check('不平衡时判 error', eqBad.status === 'error', eqBad.status)
check('不平衡时报出差额', near(eqBad.checks[0].difference, 100), String(eqBad.checks[0].difference))
check('缺项时判 incomplete', checkAccountingEquations({ assets: '1000' }).status === 'incomplete')
check('恒等式空输入不抛错', (() => { try { checkAccountingEquations({}); return true } catch { return false } })())
// 收入=费用时两条恒等式应当同时成立
const eqBoth = checkAccountingEquations({ assets: '1000', liabilities: '300', equity: '700', revenue: '400', expense: '400' })
check('收入等于费用时两条恒等式同时成立', eqBoth.status === 'ok', eqBoth.checks[0].status + '/' + eqBoth.checks[1].status)
// ---------------- 会计分录知识库 ----------------

const integrity = validateRuleIntegrity()
check('分录知识库自洽（科目都在图表内且借贷齐全）', integrity.ok, integrity.issues.slice(0, 4).join(' | '))
check('规则数量不少于 40 条', JOURNAL_ENTRY_RULES.length >= 40, String(JOURNAL_ENTRY_RULES.length))
check('覆盖全部 16 个大类', JOURNAL_GROUPS.every((g) => JOURNAL_ENTRY_RULES.some((r) => r.group === g)), '有分类没有规则')
check('知识库引用的科目都在 89 科目表内', allRuleAccountCodes().every((code) => ACCOUNT_ENTRIES.some((a) => a.code === code)), allRuleAccountCodes().filter((c) => !ACCOUNT_ENTRIES.some((a) => a.code === c)).join(','))
check('每个规则都有中文标题与摘要', JOURNAL_ENTRY_RULES.every((r) => r.title && r.summary), '有规则缺标题或摘要')
check('规则 id 全部唯一', new Set(JOURNAL_ENTRY_RULES.map((r) => r.id)).size === JOURNAL_ENTRY_RULES.length)

// 明细科目都挂在存在的总科目下
check('明细科目的总科目都在图表内', Object.keys(ACCOUNT_SUBACCOUNTS).every((code) => ACCOUNT_ENTRIES.some((a) => a.code === code)), Object.keys(ACCOUNT_SUBACCOUNTS).filter((c) => !ACCOUNT_ENTRIES.some((a) => a.code === c)).join(','))

// 关键词匹配
const hitsInvest = matchJournalRules('收到股东投资款 30 万')
check('匹配到接受现金资产投资', hitsInvest[0]?.rule.id === 'invest-cash', hitsInvest[0]?.rule.id)
const hitsBad = matchJournalRules('计提坏账准备')
check('匹配到计提坏账准备', hitsBad[0]?.rule.id === 'baddebt-accrue', hitsBad[0]?.rule.id)
const hitsPayroll = matchJournalRules('计提应付职工薪酬')
check('匹配到计提薪酬', hitsPayroll[0]?.rule.id === 'salary-accrue', hitsPayroll[0]?.rule.id)
const hitsVat = matchJournalRules('销项税额核算')
check('匹配到销项税额核算', hitsVat[0]?.rule.id === 'vat-output', hitsVat[0]?.rule.id)
check('空输入返回空数组', matchJournalRules('').length === 0)
check('无关文本不误匹配', matchJournalRules('今天天气不错').length === 0, matchJournalRules('今天天气不错').map((h) => h.rule.id).join(','))
check('匹配结果按得分降序', matchJournalRules('计提坏账准备并冲回').every((h, i, arr) => i === 0 || arr[i - 1].score >= h.score), '排序错误')
check('匹配结果记录命中的关键词', matchJournalRules('计提坏账准备')[0].matched.length > 0)

// 借贷配平：一对一业务
const rule1to1 = JOURNAL_ENTRY_RULES.find((r) => r.id === 'ar-collect')
const entry1 = buildEntry(rule1to1, { amount: 50000 })
check('一对一业务自动配平', entry1.balanced === true, String(entry1.balanced))
check('一对一借贷金额相同', checkBalanced(entry1.lines).balanced === true, JSON.stringify(checkBalanced(entry1.lines)))
check('一对一借方金额已填', entry1.lines.find((l) => l.side === 'debit').amount === 50000)

// 借贷配平：借贷行数不同时必须提示，不静默塞数字
const ruleMulti = JOURNAL_ENTRY_RULES.find((r) => r.id === 'vat-output')
const entryMulti = buildEntry(ruleMulti, { amount: 1000, side: 'debit' })
check('多行对单行时提示用户', entryMulti.issues.length > 0 || entryMulti.message.length > 0, JSON.stringify(entryMulti.issues))
check('多行对单行时不谎称已配平', entryMulti.balanced !== true, String(entryMulti.balanced))

// 未填金额时只给方向
const noAmount = buildEntry(rule1to1, {})
check('未填金额时只给方向', noAmount.balanced === null && noAmount.lines.every((l) => l.amount === null), JSON.stringify(noAmount.lines.map((l) => l.amount)))
check('未填金额时提示复式记账要求', noAmount.message.includes('借贷相等'), noAmount.message)

// 勾选功能：用户只取两行
const picked = buildEntry(ruleMulti, { amount: 1000, picks: ['1002|', '2221|应交增值税：销项税额'] })
check('勾选后借贷行数相等可配平', picked.balanced === true, String(picked.balanced))
check('勾选后只输出勾选的行', picked.lines.length === 2, String(picked.lines.length))

// checkBalanced 手工拆分
check('手工拆分借贷相等', checkBalanced([{ side: 'debit', amount: 300 }, { side: 'credit', amount: 300 }]).balanced === true)
check('手工拆分借贷不等能报差额', checkBalanced([{ side: 'debit', amount: 300 }, { side: 'credit', amount: 250 }]).difference === 50)
check('空行集合不算平衡', checkBalanced([]).balanced === false)
check('金额为 undefined 时按 0 处理', checkBalanced([{ side: 'debit' }, { side: 'credit' }]).difference === 0)

// 增值税公式说明存在
check('应缴增值税规则带公式', Boolean(JOURNAL_ENTRY_RULES.find((r) => r.id === 'vat-pay').formula))
const sourceNoteOf = (id) => JOURNAL_ENTRY_RULES.find((r) => r.id === id).sourceNote || ''
const noteOfFormula = (id) => PROFIT_FORMULAS.find((f) => f.id === id).note || ''
check('小规模规则标注征收率需核对政策', sourceNoteOf('vat-small-sales').includes('政策'), sourceNoteOf('vat-small-sales'))
check('预付账款规则标注原图写法', sourceNoteOf('prepay-receive').includes('原图'), sourceNoteOf('prepay-receive'))
check('营业利润标注口径差异', noteOfFormula('operatingProfit').includes('原图'), noteOfFormula('operatingProfit'))

// ---------------- 备查式互斥组 ----------------
// 原图大量业务把"几种可能来源"并排列出，实际只发生一种。
// 不标注的话界面会让人以为都要记，金额永远配不平。
const investRule = JOURNAL_ENTRY_RULES.find((r) => r.id === 'invest-cash')
check('备查式规则已标注互斥组', investRule.lines.filter((l) => l.alt).length === 2, `alt=${investRule.lines.filter((l) => l.alt).length}`)
check('互斥组标注了名称', Boolean(investRule.altGroups[0]?.label), JSON.stringify(investRule.altGroups))
check('一对一规则不被误标互斥', !JOURNAL_ENTRY_RULES.find((r) => r.id === 'ar-collect').lines.some((l) => l.alt), 'ar-collect 不应有 alt')

// 默认全选时，多选的互斥组必须被报错
const investAll = buildEntry(investRule, { amount: 300000 })
check('互斥组多选时报错', investAll.issues.some((i) => i.includes('多选一')), JSON.stringify(investAll.issues))
check('互斥组多选时不谎称已配平', investAll.balanced !== true, String(investAll.balanced))
check('互斥组报错里带组名', investAll.issues[0]?.includes('企业形式'), investAll.issues[0])

// 只选一行后应能自动配平
const investOne = buildEntry(investRule, { amount: 300000, picks: ['1002|', '4001|投资者'] })
check('只选互斥组一行后可配平', investOne.balanced === true, JSON.stringify(investOne.issues))
check('配平后借贷金额相同', checkBalanced(investOne.lines).balanced === true, JSON.stringify(checkBalanced(investOne.lines)))
check('配平后无报错', investOne.issues.length === 0, JSON.stringify(investOne.issues))

// ALT_GROUPS 里引用的行必须真实存在，否则分组会静默丢行
check('互斥组引用的行都存在', (() => {
  const bad = []
  for (const rule of JOURNAL_ENTRY_RULES) {
    for (const group of rule.altGroups || []) {
      for (const key of group.keys) {
        if (!rule.lines.some((l) => `${l.code}|${l.sub || ''}` === key)) bad.push(`${rule.id}:${key}`)
      }
    }
  }
  return bad.length === 0
})(), '有互斥组引用了不存在的行')
check('每个互斥组至少两行', JOURNAL_ENTRY_RULES.every((r) => (r.altGroups || []).every((g) => g.keys.length >= 2)), '有互斥组只有一行')

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个利润计算与分录知识库断言通过`)
process.exit(passed === results.length ? 0 : 1)
