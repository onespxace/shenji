// 利润计算器与会计分录知识库的断言。
// 覆盖：公式数值、依赖缺失、会计恒等式、分录自洽性、借贷配平、关键词匹配。
import process from 'node:process'
import {
  PROFIT_EXAMPLE,
  PROFIT_EXAMPLE_EXPECTED,
  PROFIT_EXPORT_HEADERS,
  PROFIT_FORMULAS,
  PROFIT_INPUTS,
  buildProfitExport,
  checkAccountingEquations,
  computeProfitChain,
  formatMoney,
  labelOfNode,
  parseProfitInputs,
  roundMoney
} from '../src/lib/profit-calculator.js'
import {
  ACCOUNT_SUBACCOUNTS,
  ENTRY_EXPORT_HEADERS,
  JOURNAL_ENTRY_RULES,
  JOURNAL_GROUPS,
  allRuleAccountCodes,
  buildEntry,
  buildEntryExport,
  checkBalanced,
  entryShape,
  extractAmount,
  isAmbiguous,
  matchJournalRules,
  parseAmount,
  recommendedPicks,
  validateRuleIntegrity
} from '../src/lib/journal-entries.js'
import { moneyCell, toCsv } from '../src/lib/csv-export.js'
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
// 缺项提示必须落到底层输入项的中文名上：
// 上一版吐的是内部 id（界面显示"缺：mainTax"），用户看不懂也没法照着填
check('缺依赖时列出中文输入项名', partial.steps.find((s) => s.id === 'mainProfit').missing.join(',') === '主营业务税金及附加', partial.steps.find((s) => s.id === 'mainProfit').missing.join(','))
check('缺依赖时同时保留内部 id 便于排查', partial.steps.find((s) => s.id === 'mainProfit').missingIds.join(',') === 'mainTax')
// 上游公式缺失时要顺藤摸瓜落到能填的底层输入项，而不是只报"缺主营业务利润"
const upstream = computeProfitChain({ mainRevenue: '100', mainCost: '40', otherRevenue: '1', otherCost: '1', otherTax: '1', periodExpense: '1' })
check('上游公式缺失时给出可填的底层输入项', upstream.steps.find((s) => s.id === 'operatingProfit').missing.includes('主营业务税金及附加'), upstream.steps.find((s) => s.id === 'operatingProfit').missing.join(','))
check('缺项计数只数底层输入项，不重复累加下游公式', computeProfitChain({}).missingCount === PROFIT_INPUTS.length, String(computeProfitChain({}).missingCount))
check('缺项计数在部分填写时递减', computeProfitChain({ mainRevenue: '100' }).missingCount === PROFIT_INPUTS.length - 1, String(computeProfitChain({ mainRevenue: '100' }).missingCount))
check('缺项清单与未填项一致', computeProfitChain({}).missingInputs.length === PROFIT_INPUTS.length)
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
check('未填金额时提示复式记账要求', noAmount.message.includes('借贷必相等'), noAmount.message)

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
// 现金支出的三个借方（办公费/工资/预借差旅费）也是备查式，上一版漏标，
// 界面会把三行全部预选，一填金额就报"借贷不等"
check('现金支出已标注互斥组', (JOURNAL_ENTRY_RULES.find((r) => r.id === 'cash-expense').altGroups || []).length === 1)

// ---------------- 匹配质量 ----------------
// 上一版"收到货款"同时命中"确认销售收入"和"收回应收账款"且同分，谁标题靠前谁当选 = 随机结果
const goodsPaid = matchJournalRules('收到货款')
check('「收到货款」唯一命中收回应收账款', goodsPaid.length === 1 && goodsPaid[0].rule.id === 'ar-collect', goodsPaid.map((h) => h.rule.id + '(' + h.score + ')').join(','))
check('「收到货款」不再被判为歧义', isAmbiguous(goodsPaid) === false)
// 只输入科目名时确实无法判断是哪笔业务，必须报并列而不是替用户选
const onlyAccount = matchJournalRules('原材料')
check('只输入科目名时判定为并列', isAmbiguous(onlyAccount) === true, onlyAccount.map((h) => h.rule.id + '(' + h.score + ')').join(','))
check('并列时不给任何一条打"推荐"标记', onlyAccount.every((h) => h.primary === false))
// 快捷入口里的每一句都要能唯一落到一条规则上
const QUICK_QUERIES = [
  '收到股东投资款', '购买原材料', '计提应付职工薪酬', '计提坏账准备', '确认销售收入',
  '结转销售成本', '收到货款', '偿还应付账款', '计算应缴增值税', '偿还长期借款',
  '现金支付办公费用', '提取现金备用', '收到商业承兑汇票', '预付货款', '分配制造费用', '小规模纳税人开票'
]
const weak = QUICK_QUERIES.filter((q) => {
  const hits = matchJournalRules(q)
  return !hits.length || isAmbiguous(hits) || hits[0].score === 0
})
check('16 条快捷入口全部唯一命中', weak.length === 0, weak.join(','))
const bad = QUICK_QUERIES.filter((q) => {
  const hits = matchJournalRules(q)
  return matchJournalRules(`${q}`).slice(0, 1).some((h) => !h.rule)
})
check('快捷入口命中结果都带规则对象', bad.length === 0, bad.join(','))

// ---------------- 金额解析 ----------------
check('解析纯数字', parseAmount('300000') === 300000)
check('解析千分位', parseAmount('1,234,567.89') === 1234567.89)
check('解析人民币符号与单位', parseAmount('￥300,000.00元') === 300000)
check('解析空值为 null', parseAmount('') === null && parseAmount(null) === null)
check('解析非法文本为 null', parseAmount('abc') === null)
check('从描述提取阿拉伯数字金额', extractAmount('收到股东投资款 300000').amount === 300000)
check('从描述提取「万」单位', extractAmount('收到投资款30万').amount === 300000)
check('从描述提取「万元」小数', extractAmount('确认收入 1.5万元').amount === 15000)
check('从描述提取带千分位金额', extractAmount('收到投资款￥300,000.00').amount === 300000)
check('无金额描述返回 null', extractAmount('计提坏账准备').amount === null)
check('百分数是税率不是金额', extractAmount('增值税税率25%').amount === null)
check('编号不被当成金额', extractAmount('凭证号 001 的现金收入').amount === null)
check('多个数字时取金额较大的那个', extractAmount('支付2024年房租 12000').amount === 12000)

// ---------------- 分录新配平模型 ----------------
const vatOutput = JOURNAL_ENTRY_RULES.find((r) => r.id === 'vat-output')
check('分录形状：一对多被判为 split', entryShape(vatOutput).mode === 'split', JSON.stringify(entryShape(vatOutput)))
check('分录形状：一对一被判为 single', entryShape(JOURNAL_ENTRY_RULES.find((r) => r.id === 'ar-collect')).mode === 'single')
// 一行对多行必须能逐行填金额（上一版只支持"一个总额落一侧"，拆分场景根本填不平）
const splitEntry = buildEntry(vatOutput, { amounts: { '1002|': '1130', '6001|': '1000', '2221|应交增值税：销项税额': '130' } })
check('多行拆分后可以配平', splitEntry.balanced === true && splitEntry.balance.difference === 0, JSON.stringify(splitEntry.balance))
check('多行拆分状态为 balanced', splitEntry.status === 'balanced', splitEntry.status)
const notYet = buildEntry(vatOutput, { amounts: { '1002|': '1130' } })
check('只填一侧时状态为 pending', notYet.status === 'pending', notYet.status)
check('只填一侧时给出差额提示', notYet.hints.some((h) => h.includes('借贷不等')), JSON.stringify(notYet.hints))
const emptyEntry = buildEntry(JOURNAL_ENTRY_RULES.find((r) => r.id === 'ar-collect'), {})
check('未填金额时状态为 empty 而不是谎称已配平', emptyEntry.status === 'empty' && emptyEntry.balanced === null, String(emptyEntry.status))
check('未填金额的提示里说明借贷必相等', emptyEntry.hints.some((h) => h.includes('借贷必相等')), JSON.stringify(emptyEntry.hints))
// 推荐组合必须"一进页面就能用"：互斥组只取一行，直接改金额不会立刻报错
const cashExpense = JOURNAL_ENTRY_RULES.find((r) => r.id === 'cash-expense')
const cashPicks = recommendedPicks(cashExpense)
check('推荐组合里互斥组只保留一行', cashPicks.filter((k) => k.startsWith('6602|') || k.startsWith('2211|') || k.startsWith('1221|')).length === 1, cashPicks.join(','))
const cashEntry = buildEntry(cashExpense, { picks: cashPicks, amounts: { '6602|': '500', '1001|': '500' } })
check('按推荐组合填金额即可配平', cashEntry.status === 'balanced' && cashEntry.balance.difference === 0, JSON.stringify(cashEntry.balance))
check('推荐组合下没有互斥冲突', cashEntry.issues.length === 0, JSON.stringify(cashEntry.issues))
// 传空 picks 表示"一行都没勾"，与"未传 picks（全部行）"必须区分
const nonePicked = buildEntry(cashExpense, { picks: [] })
check('传空 picks 表示一行都没勾', nonePicked.lines.length === 0, String(nonePicked.lines.length))
check('不传 picks 时默认全部行', buildEntry(cashExpense, {}).lines.length === cashExpense.lines.length)

// ---------------- 利润计算表导出 ----------------
const exported = buildProfitExport(PROFIT_EXAMPLE, { elements: { assets: '1000', liabilities: '300', equity: '600' } })
check('导出列定义与常量一致', JSON.stringify(exported.headers) === JSON.stringify(PROFIT_EXPORT_HEADERS))
check('导出内容包含净利润结果行', exported.rows.some((r) => r[1] === '净利润' && r[3] === '1032300.00' && r[5] === '已计算'), JSON.stringify(exported.rows.find((r) => r[1] === '净利润')))
check('导出内容包含全部 12 个输入项', exported.rows.filter((r) => r[0] === '输入项').length === PROFIT_INPUTS.length)
check('导出内容包含全部 8 个计算步骤', exported.rows.filter((r) => r[0] === '计算').length === PROFIT_FORMULAS.length)
check('导出内容包含两条恒等式校验', exported.rows.filter((r) => r[0] === '恒等式校验').length === 2)
check('导出内容包含口径提示', exported.rows.some((r) => r[0] === '说明' && r[2].includes('投资净收益')))
check('金额单元格不带千分位（Excel 才能求和）', exported.rows.every((r) => !String(r[3]).includes(',')), JSON.stringify(exported.rows.filter((r) => String(r[3]).includes(','))))
check('导出金额都能被 Number 解析为数字或为空', exported.rows.every((r) => r[3] === '' || Number.isFinite(Number(r[3]))))
check('所得税税率的单位标为 %', exported.rows.some((r) => r[1] === '所得税税率' && r[4] === '%'))
// 未填项必须导出为空值，不能导出 0——导出表里出现看似精确的 0 比留空危险得多
const partialExport = buildProfitExport({ mainRevenue: '100', mainCost: '40' })
const mainTaxRow = partialExport.rows.find((r) => r[1] === '主营业务税金及附加')
check('未填输入项导出为空值', mainTaxRow[3] === '' && mainTaxRow[5] === '未填', JSON.stringify(mainTaxRow))
check('未填时净利润行标注待补数据', partialExport.rows.find((r) => r[1] === '净利润')[5] === '待补数据')
check('未填时净利润行列出还需补什么', partialExport.rows.find((r) => r[1] === '净利润')[2].includes('还需补'))
check('未填时导出仍标记为不完整', partialExport.complete === false && partialExport.missingCount === PROFIT_INPUTS.length - 2)
check('亏损场景导出标注本期亏损', buildProfitExport({ ...PROFIT_EXAMPLE, mainCost: '9000000' }).rows.find((r) => r[1] === '净利润')[5].includes('亏损'))
// 整份 CSV 能被解析回来，且金额列是数字
const profitCsv = toCsv(exported.headers, exported.rows)
check('导出的 CSV 带 BOM', profitCsv.charCodeAt(0) === 0xFEFF)
check('导出的 CSV 行数 = 表头 + 数据行', profitCsv.split('\r\n').filter(Boolean).length === exported.rows.length + 1)
check('导出的 CSV 里金额可以被当成数字求和', profitCsv.includes('1032300.00'))
check('恒等式校验行带差额', exported.rows.find((r) => r[0] === '恒等式校验' && r[5] === '不平衡')[2].includes('差额'))

// ---------------- 分录导出 ----------------
const entryRule = JOURNAL_ENTRY_RULES.find((r) => r.id === 'ar-collect')
const entryForExport = buildEntry(entryRule, { amount: 50000 })
const entryPayload = buildEntryExport(entryRule, entryForExport)
check('分录导出包含明细行 + 借/贷/差额合计', entryPayload.rows.length === entryForExport.lines.length + 3, String(entryPayload.rows.length))
check('分录导出金额两位小数不带千分位', entryPayload.rows[0][6] === '50000.00', entryPayload.rows[0][6])
check('分录导出标注借贷平衡', entryPayload.rows.at(-1)[7] === '借贷平衡', entryPayload.rows.at(-1)[7])
check('分录导出方向用中文借贷', entryPayload.rows[0][2] === '借' && entryPayload.rows[1][2] === '贷')
check('分录导出每行都带业务名（便于多张凭证拼表）', entryPayload.rows.every((r) => r[0] === entryRule.title), JSON.stringify(entryPayload.rows.map((r) => r[0])))
check('分录导出列定义与表头一致', JSON.stringify(entryPayload.headers) === JSON.stringify(ENTRY_EXPORT_HEADERS))
const unbalPayload = buildEntryExport(vatOutput, buildEntry(vatOutput, { amounts: { '1002|': '1130' } }))
check('未配平的分录导出也如实标注', unbalPayload.rows.at(-1)[7] === '尚未配平', unbalPayload.rows.at(-1)[7])

// 标签映射
check('labelOfNode 对未知 id 原样返回', labelOfNode('__nope__') === '__nope__')
check('labelOfNode 能翻译公式节点', labelOfNode('netProfit') === '净利润（利润）')

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个利润计算与分录知识库断言通过`)
process.exit(passed === results.length ? 0 : 1)
