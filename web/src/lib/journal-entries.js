// 会计分录知识库：覆盖用户提供的 4 张《会计分录汇总》图中所有绿色标题的业务。
//
// 设计要点：
//  1) 每条规则的借贷方都写**科目代码**，不是随手写的名称。断言会校验
//     每个代码都存在于 ACCOUNT_ENTRIES，杜绝"分录里出现图表外的科目"。
//  2) 明细科目用 `sub` 字段挂在总科目下面（应交税费——应交增值税（销项税额））。
//  3) 金额是可选的：不给金额只出借贷方向；给了金额就按复式记账法自动配平，
//     借贷必相等。配不平时明确报错，不静默塞一个假数字。
//  4) 原图里的疑似笔误（预付账款收到货物写成"销项税额"）按正确会计处理实现，
//     并在 sourceNote 里说明原图写法，避免"照抄错账"。

import { ACCOUNT_ENTRIES } from './accounting-data.js'

const D = 'debit'
const C = 'credit'

/** 明细科目（挂在总科目代码下） */
export const ACCOUNT_SUBACCOUNTS = {
  '2221': ['应交增值税：进项税额', '应交增值税：销项税额', '应交增值税：进项税额转出', '应交增值税：已交税金', '应交增值税：待认证进项税额', '应交增值税：转出未交增值税', '未交增值税'],
  '2211': ['工资', '社会保险费', '住房公积金', '工会经费', '职工教育经费', '短期福利'],
  '4104': ['未分配利润'],
  '4001': ['投资者'],
  '2501': ['本金', '应付利息'],
  '2202': ['暂估应付账款'],
  '1121': ['商业承兑汇票', '银行承兑汇票'],
  '6001': ['商品销售', '劳务收入'],
  '1403': ['原材料', '周转材料']
}

const accountByCode = new Map(ACCOUNT_ENTRIES.map((item) => [item.code, item]))

/** 供断言与 UI 校验：分录里出现的所有科目代码 */
export function allRuleAccountCodes() {
  const codes = new Set()
  for (const rule of JOURNAL_ENTRY_RULES) {
    for (const line of rule.lines) codes.add(line.code)
  }
  return [...codes]
}

/** 校验知识库自洽：所有科目代码都在图表里，且每个规则借贷都有科目 */
export function validateRuleIntegrity() {
  const issues = []
  const seenIds = new Set()
  for (const rule of JOURNAL_ENTRY_RULES) {
    if (seenIds.has(rule.id)) issues.push(`规则 id 重复：${rule.id}`)
    seenIds.add(rule.id)
    if (!rule.lines.length) issues.push(`规则 ${rule.id} 没有任何分录行`)
    if (!rule.lines.some((line) => line.side === D)) issues.push(`规则 ${rule.id} 缺少借方科目`)
    if (!rule.lines.some((line) => line.side === C)) issues.push(`规则 ${rule.id} 缺少贷方科目`)
    for (const line of rule.lines) {
      if (!accountByCode.has(line.code)) issues.push(`规则 ${rule.id} 使用了图表外的科目代码 ${line.code}（${line.sub || line.note || ''}）`)
    }
    if (!rule.keywords?.length) issues.push(`规则 ${rule.id} 没有匹配关键词`)
  }
  return { ok: issues.length === 0, issues }
}

/**
 * 分录规则表。
 * lines[].side: debit | credit
 * lines[].code: 会计科目代码（必须在 ACCOUNT_ENTRIES 内）
 * lines[].sub:  明细科目
 * lines[].note: 该行在图中的括号说明
 * amountMode: 'single' 表示业务本身单一金额（借贷同额）
 */
export const JOURNAL_ENTRY_RULES = [
  // ---------- 一、库存现金 ----------
  {
    id: 'cash-income',
    group: '库存现金',
    title: '现金收入的核算',
    keywords: ['现金收入', '收到现金', '库存现金增加', '收取押金', '销售废旧材料', '罚款收入'],
    summary: '钱从银行/个人/押金/废旧材料变成手里现金。',
    lines: [
      { side: D, code: '1001', note: '增加现金' },
      { side: C, code: '1002', sub: '', note: '提取现金' },
      { side: C, code: '1221', sub: '', note: '对个人罚款' },
      { side: C, code: '2241', sub: '', note: '收取押金' },
      { side: C, code: '6051', sub: '', note: '销售废旧材料' }
    ],
    usage: '备查式：四个贷方是四类不同业务，实际发生时只取对应的那一行。'
  },
  {
    id: 'cash-expense',
    group: '库存现金',
    title: '现金支出的核算',
    keywords: ['现金支出', '现金支付', '支付现金', '用现金', '现金付款', '预借差旅费', '支付工资现金', '办公费用现金', '现金报销'],
    summary: '手里的现金花出去。',
    lines: [
      { side: D, code: '6602', sub: '', note: '办公费用' },
      { side: D, code: '2211', sub: '工资', note: '支付工资' },
      { side: D, code: '1221', sub: '', note: '预借差旅费' },
      { side: C, code: '1001', sub: '', note: '减少现金' }
    ]
  },

  // ---------- 二、银行存款 ----------
  {
    id: 'bank-income',
    group: '银行存款',
    title: '银行存款收入',
    keywords: ['银行存款收入', '存入现金', '收回应收账款', '银行收款', '货款到账', '存入银行', '存进银行', '现金存入银行'],
    summary: '钱进银行账户。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '1001', sub: '', note: '存入现金' },
      { side: C, code: '1122', sub: '', note: '收回应收账款' },
      { side: C, code: '6001', sub: '', note: '主营业务收入' },
      { side: C, code: '2221', sub: '应交增值税：销项税额', note: '销项税额' }
    ],
    usage: '备查式：收回应收账款只取前两行；确认销售收入取后两行。'
  },
  {
    id: 'bank-expense',
    group: '银行存款',
    title: '银行存款支出',
    keywords: ['银行存款支出', '提现', '提取现金', '银行付款', '购买材料付款', '办公费用银行'],
    summary: '从银行账户付出去。',
    lines: [
      { side: D, code: '1001', sub: '', note: '提现' },
      { side: D, code: '6602', sub: '', note: '办公费用' },
      { side: D, code: '1403', sub: '', note: '购买材料等' },
      { side: C, code: '1002', sub: '', note: '银行存款减少' }
    ]
  },

  // ---------- 三、原材料的核算 ----------
  {
    id: 'material-purchase',
    group: '原材料的核算',
    title: '购买原材料的账务处理',
    keywords: ['购买原材料', '采购材料', '买材料', '验收入库', '材料采购', '取得原材料'],
    summary: '一般纳税人购料：按是否验收入库分别计入原材料或在途物资，进项税额单独记账。',
    lines: [
      { side: D, code: '1403', sub: '', note: '已验收入库' },
      { side: D, code: '1402', sub: '', note: '未验收入库' },
      { side: D, code: '2221', sub: '应交增值税：进项税额', note: '进项税额' },
      { side: C, code: '1401', sub: '', note: '材料采购' },
      { side: C, code: '2202', sub: '', note: '应付账款' }
    ],
    usage: '已入库取 1403，未入库取 1402；材料采购（1401）是计划成本法的过渡科目。'
  },
  {
    id: 'material-issue',
    group: '原材料的核算',
    title: '发出原材料的账务处理',
    keywords: ['发出原材料', '领用材料', '领用原材料', '材料出库', '领料', '耗用材料'],
    summary: '材料按用途进不同成本费用科目。',
    lines: [
      { side: D, code: '5001', sub: '', note: '直接用于生产车间' },
      { side: D, code: '5101', sub: '', note: '车间管理部门' },
      { side: D, code: '6602', sub: '', note: '行政管理部门' },
      { side: D, code: '6601', sub: '', note: '销售部门' },
      { side: D, code: '6402', sub: '', note: '外销' },
      { side: C, code: '1403', sub: '', note: '原材料减少' }
    ],
    usage: '按实际用途只取对应的一个借方，不要把五个借方一起记。'
  },
  {
    id: 'material-in-transit',
    group: '原材料的核算',
    title: '在途物资验收入库时',
    keywords: ['在途物资验收入库', '在途物资入库', '材料验收入库'],
    summary: '货物到了，把在途物资转成原材料。',
    lines: [
      { side: D, code: '1403', sub: '', note: '原材料' },
      { side: C, code: '1402', sub: '', note: '在途物资' }
    ]
  },
  {
    id: 'material-estimated',
    group: '原材料的核算',
    title: '材料已到、发票未到、货款未付',
    keywords: ['发票未到', '暂估入账', '材料已到', '月末暂估', '红字冲销'],
    summary: '月末按暂估价入账，下月初用红字冲销，收到发票后按实际金额入账。',
    lines: [
      { side: D, code: '1403', sub: '', note: '按暂估价入账' },
      { side: C, code: '2202', sub: '暂估应付账款', note: '暂估应付账款' }
    ],
    usage: '这是权责发生制的典型场景：货到先按暂估价确认存货和负债，收到发票后差异再调整。'
  },

  // ---------- 四、应付账款的核算 ----------
  {
    id: 'ap-settle',
    group: '应付账款的核算',
    title: '偿付应付账款的账务处理',
    keywords: ['偿付应付账款', '偿还应付账款', '付货款', '支付应付款'],
    summary: '欠款还了，负债和银行存款同减。',
    lines: [
      { side: D, code: '2202', sub: '', note: '应付账款减少' },
      { side: C, code: '1002', sub: '', note: '银行存款减少' }
    ]
  },
  {
    id: 'ap-incur',
    group: '应付账款的核算',
    title: '应付账款发生的账务处理',
    keywords: ['应付账款发生', '欠供应商', '赊购', '入库未付款'],
    summary: '收货形成负债，进项税额可抵扣。',
    lines: [
      { side: D, code: '1405', sub: '', note: '库存商品' },
      { side: D, code: '1403', sub: '', note: '原材料' },
      { side: D, code: '2221', sub: '应交增值税：进项税额', note: '进项税额' },
      { side: C, code: '2202', sub: '', note: '应付账款增加' }
    ]
  },

  // ---------- 五、库存商品的核算 ----------
  {
    id: 'goods-in',
    group: '库存商品的核算',
    title: '产成品入库的账务处理',
    keywords: ['产成品入库', '完工入库', '产品入库', '库存商品增加'],
    summary: '生产完成，从生产成本结转到库存商品。',
    lines: [
      { side: D, code: '1405', sub: '', note: '库存商品增加' },
      { side: C, code: '5001', sub: '', note: '生产成本结转' }
    ]
  },
  {
    id: 'goods-cost',
    group: '库存商品的核算',
    title: '结转销售成本',
    keywords: ['结转销售成本', '结转成本', '销售成本', '成本结转'],
    summary: '商品卖出去，存货转成本。',
    lines: [
      { side: D, code: '6401', sub: '', note: '主营业务成本增加' },
      { side: C, code: '1405', sub: '', note: '库存商品减少' }
    ]
  },
  {
    id: 'goods-revenue',
    group: '库存商品的核算',
    title: '确认销售收入',
    keywords: ['确认收入', '销售收入', '卖出商品', '销售商品'],
    summary: '一手确认收入和销项税，一手结转成本。',
    lines: [
      { side: D, code: '1002', sub: '', note: '收到货款' },
      { side: D, code: '1122', sub: '', note: '未收款' },
      { side: C, code: '6001', sub: '', note: '主营业务收入' },
      { side: C, code: '2221', sub: '应交增值税：销项税额', note: '销项税额' }
    ],
    usage: '收入与成本要分两笔结转，不能混在一张凭证里。'
  },

  // ---------- 六、应收账款的核算 ----------
  {
    id: 'ar-incur',
    group: '应收账款的核算',
    title: '应收账款发生',
    keywords: ['应收账款发生', '赊销', '挂账', '形成应收'],
    summary: '货发出钱没到，形成债权。',
    lines: [
      { side: D, code: '1122', sub: '', note: '应收账款增加' },
      { side: C, code: '6001', sub: '', note: '主营业务收入' }
    ]
  },
  {
    id: 'ar-collect',
    group: '应收账款的核算',
    title: '应收账款收回',
    keywords: ['应收账款收回', '收回账款', '收到货款', '客户还款', '货款收回', '收回欠款', '客户欠款'],
    summary: '债权变现。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '1122', sub: '', note: '应收账款减少' }
    ]
  },

  // ---------- 七、坏账准备的核算 ----------
  {
    id: 'baddebt-accrue',
    group: '坏账准备的核算',
    title: '计提坏账准备时',
    keywords: ['计提坏账准备', '计提坏账', '资产减值'],
    summary: '预期收不回的应收款，先确认损失。',
    lines: [
      { side: D, code: '6702', sub: '', note: '信用减值损失增加' },
      { side: C, code: '1231', sub: '', note: '坏账准备增加' }
    ]
  },
  {
    id: 'baddebt-reverse',
    group: '坏账准备的核算',
    title: '冲减坏账准备时',
    keywords: ['冲减坏账准备', '冲回坏账', '转回坏账准备'],
    summary: '预期改善，损失冲回。',
    lines: [
      { side: D, code: '1231', sub: '', note: '坏账准备减少' },
      { side: C, code: '6702', sub: '', note: '信用减值损失减少' }
    ]
  },
  {
    id: 'baddebt-actual',
    group: '坏账准备的核算',
    title: '实际发生坏账时',
    keywords: ['实际发生坏账', '坏账核销', '核销坏账', '转销坏账', '确实收不回'],
    summary: '核销：准备与应收对冲。',
    lines: [
      { side: D, code: '1231', sub: '', note: '坏账准备减少' },
      { side: C, code: '1122', sub: '', note: '应收账款减少' }
    ]
  },
  {
    id: 'baddebt-recover',
    group: '坏账准备的核算',
    title: '已核销坏账又收回',
    keywords: ['坏账收回', '已核销又收到', '冲消坏账'],
    summary: '死账复活，按新收到处理。',
    lines: [
      { side: D, code: '1122', sub: '', note: '恢复应收账款' },
      { side: C, code: '1231', sub: '', note: '恢复坏账准备' }
    ]
  },

  // ---------- 八、成本的核算 ----------
  {
    id: 'cost-allocate',
    group: '成本的核算',
    title: '月末制造费用在不同产品之间分配',
    keywords: ['制造费用分配', '分配制造费用', '月末分配', '分配率', '制造费用分摊'],
    summary: '制造费用 = 制造费用合计 ÷ 分配基础；某产品应负担 = 该产品分配基础 × 分配率。',
    lines: [
      { side: D, code: '5001', sub: '', note: '某产品' },
      { side: C, code: '5101', sub: '', note: '制造费用' }
    ],
    usage: '先算分配率再分摊，公式：分配率 = 制造费用 / 分配基础；分配额 = 分配基础 × 分配率。',
    formula: '分配率 = 制造费用合计 ÷ 分配基础合计；某产品分配额 = 该产品分配基础 × 分配率'
  },
  {
    id: 'cost-accrue',
    group: '成本的核算',
    title: '发生直接材料、直接人工、制造费用',
    keywords: ['直接材料', '直接人工', '归集生产成本', '生产领用', '制造费用发生'],
    summary: '把料、工、费归集到生产成本。',
    lines: [
      { side: D, code: '5001', sub: '', note: '归集到生产成本' },
      { side: C, code: '1403', sub: '', note: '直接材料' },
      { side: C, code: '2211', sub: '工资', note: '直接人工' },
      { side: C, code: '5101', sub: '', note: '制造费用' }
    ]
  },

  // ---------- 九、应收票据的核算 ----------
  {
    id: 'note-interest-free-take',
    group: '应收票据的核算',
    title: '不带息应收票据的取得',
    keywords: ['不带息应收票据', '票据取得', '收到票据', '出票', '商业承兑汇票', '银行承兑汇票', '应收票据'],
    summary: '按面值入账，同步确认收入和销项税。',
    lines: [
      { side: D, code: '1121', sub: '', note: '按面值入账' },
      { side: C, code: '6001', sub: '', note: '主营业务收入' },
      { side: C, code: '2221', sub: '应交增值税：销项税额', note: '销项税额' }
    ]
  },
  {
    id: 'note-collect',
    group: '应收票据的核算',
    title: '到期收回款项',
    keywords: ['票据到期收回', '到期收款', '票据收回'],
    summary: '票据换现金。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '1121', sub: '', note: '应收票据减少' }
    ]
  },
  {
    id: 'note-uncollectable',
    group: '应收票据的核算',
    title: '到期债务人无力偿还',
    keywords: ['到期无力偿还', '票据无法收回', '债务人无力'],
    summary: '票据转应收账款，保留追索权。',
    lines: [
      { side: D, code: '1122', sub: '', note: '转为应收账款' },
      { side: C, code: '1121', sub: '', note: '应收票据减少' }
    ]
  },
  {
    id: 'note-accrued-interest',
    group: '应收票据的核算',
    title: '带息票据期末计息',
    keywords: ['期末计息', '带息票据计息', '票据利息', '中期计息'],
    summary: '期末按权责发生制确认利息收入。',
    lines: [
      { side: D, code: '1121', sub: '', note: '应收票据增加' },
      { side: C, code: '6603', sub: '', note: '财务费用（贷方表示冲减财务费用）' }
    ],
    usage: '权责发生制下先确认利息，到期实际收到时再冲减财务费用：借 银行存款 / 贷 应收票据、财务费用。'
  },
  {
    id: 'note-collect-with-interest',
    group: '应收票据的核算',
    title: '带息票据到期收回（本金+利息）',
    keywords: ['带息票据到期', '本金利息', '票据到期本息'],
    summary: '一次收回本金和已确认的利息。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '1121', sub: '', note: '应收票据本金' },
      { side: C, code: '6603', sub: '', note: '财务费用（利息）' }
    ]
  },

  // ---------- 十、预付账款的账务处理 ----------
  {
    id: 'prepay-initiate',
    group: '预付账款的账务处理',
    title: '预付货款',
    keywords: ['预付货款', '先付款后收货', '预付账款', '付定金'],
    summary: '钱先出去，形成预付账款（资产）。',
    lines: [
      { side: D, code: '1123', sub: '', note: '预付账款增加' },
      { side: C, code: '1002', sub: '', note: '银行存款减少' }
    ]
  },
  {
    id: 'prepay-receive',
    group: '预付账款的账务处理',
    title: '收到货物',
    keywords: ['收到货物', '预付收到货', '预付收到货物', '预付的货物', '预付账款核销'],
    summary: '预付款转为存货，进项税额可抵扣。',
    lines: [
      { side: D, code: '1403', sub: '', note: '原材料等' },
      { side: D, code: '2221', sub: '应交增值税：进项税额', note: '进项税额' },
      { side: C, code: '1123', sub: '', note: '预付账款减少' }
    ],
    sourceNote: '原图此处写作"应交税金——应交增值税/销项税额"。收货时取得的是进项税额，此处按正确处理实现为进项税额。'
  },
  {
    id: 'prepay-topup',
    group: '预付账款的账务处理',
    title: '补付货款',
    keywords: ['补付货款', '预付不足', '补付', '继续付款'],
    summary: '预付金额小于货款时补足差额。',
    lines: [
      { side: D, code: '1123', sub: '', note: '预付账款增加' },
      { side: C, code: '1002', sub: '', note: '银行存款减少' }
    ]
  },
  {
    id: 'prepay-refund',
    group: '预付账款的账务处理',
    title: '收回多付余额',
    keywords: ['回多余额', '多付退回', '预付差额退回', '退回多付款'],
    summary: '预付金额大于货款时，对方退回差额。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '1123', sub: '', note: '预付账款减少' }
    ]
  },

  // ---------- 十一、应付职工薪酬 ----------
  {
    id: 'salary-accrue',
    group: '应付职工薪酬',
    title: '计提应付职工薪酬',
    keywords: ['计提薪酬', '计提工资', '职工薪酬', '分配工资', '计提社保'],
    summary: '按受益部门把薪酬归集到不同成本费用科目。',
    lines: [
      { side: D, code: '5001', sub: '', note: '生产工人的薪酬' },
      { side: D, code: '5101', sub: '', note: '车间管理人员的' },
      { side: D, code: '6602', sub: '', note: '管理部门人员的' },
      { side: D, code: '6601', sub: '', note: '销售人员的' },
      { side: D, code: '1604', sub: '', note: '工程人员的' },
      { side: D, code: '5301', sub: '', note: '研发人员的' },
      { side: C, code: '2211', sub: '工资', note: '应付职工薪酬——工资' },
      { side: C, code: '2211', sub: '社会保险费', note: '社会保险费' },
      { side: C, code: '2211', sub: '住房公积金', note: '住房公积金' },
      { side: C, code: '2211', sub: '工会经费', note: '工会经费' },
      { side: C, code: '2211', sub: '职工教育经费', note: '职工教育经费' }
    ],
    usage: '贷方各明细按企业实际是否计提勾选；借方只取实际受益部门。'
  },
  {
    id: 'salary-pay',
    group: '应付职工薪酬',
    title: '发放应付职工薪酬',
    keywords: ['发放工资', '支付工资', '发薪', '付职工薪酬'],
    summary: '发钱，负债和银行存款同减。',
    lines: [
      { side: D, code: '2211', sub: '', note: '应付职工薪酬减少' },
      { side: C, code: '1002', sub: '', note: '银行存款减少' }
    ]
  },

  // ---------- 十二、应交增值税 ----------
  {
    id: 'vat-input',
    group: '应交增值税的账务处理',
    title: '一般纳税人 · 进项税额核算',
    keywords: ['进项税额', '一般纳税人采购', '增值税进项', '采购物资进项'],
    summary: '采购时取得可抵扣的进项税额。',
    lines: [
      { side: D, code: '1403', sub: '', note: '原材料等' },
      { side: D, code: '2221', sub: '应交增值税：进项税额', note: '进项税额' },
      { side: C, code: '1002', sub: '', note: '银行存款' },
      { side: C, code: '2202', sub: '', note: '应付账款' }
    ]
  },
  {
    id: 'vat-input-transfer',
    group: '应交增值税的账务处理',
    title: '一般纳税人 · 进项税额转出',
    keywords: ['进项税额转出', '材料改变用途', '非正常损失', '转出进项'],
    summary: '材料改了用途（在建工程、集体福利等），进项税不能抵了，要转出。',
    lines: [
      { side: D, code: '1604', sub: '', note: '在建工程' },
      { side: D, code: '2211', sub: '', note: '应付职工薪酬' },
      { side: C, code: '1403', sub: '', note: '原材料' },
      { side: C, code: '2221', sub: '应交增值税：进项税额转出', note: '进项税额转出' }
    ]
  },
  {
    id: 'vat-output',
    group: '应交增值税的账务处理',
    title: '一般纳税人 · 销项税额核算',
    keywords: ['销项税额', '销售商品开票', '一般纳税人销售', '提供劳务销项'],
    summary: '销售时确认销项税额。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款等' },
      { side: C, code: '6001', sub: '', note: '主营业务收入' },
      { side: C, code: '2221', sub: '应交增值税：销项税额', note: '销项税额' }
    ]
  },
  {
    id: 'vat-pay',
    group: '应交增值税的账务处理',
    title: '一般纳税人 · 计算应缴增值税',
    keywords: ['应缴增值税', '计算应缴', '已交税金', '缴纳增值税'],
    summary: '应纳增值税 = 销项税额 − 进项税额 + 进项税额转出。',
    lines: [
      { side: D, code: '2221', sub: '应交增值税：已交税金', note: '已交税金' },
      { side: C, code: '1002', sub: '', note: '银行存款' }
    ],
    formula: '应纳增值税 = 销项税额 − 进项税额 + 进项税额转出'
  },
  {
    id: 'vat-small-purchase',
    group: '应交增值税的账务处理',
    title: '小规模纳税人 · 采购收到发票',
    keywords: ['小规模采购', '小规模纳税人采购', '收到专用发票普通发票'],
    summary: '小规模纳税人不能抵扣，进项直接计入成本。',
    lines: [
      { side: D, code: '1403', sub: '', note: '原材料等' },
      { side: C, code: '1002', sub: '', note: '银行存款等' }
    ]
  },
  {
    id: 'vat-small-sales',
    group: '应交增值税的账务处理',
    title: '小规模纳税人 · 销售开普通发票',
    keywords: ['小规模销售', '小规模纳税人销售', '小规模纳税人开票', '小规模开票', '小规模纳税人', '开普通发票', '含税售价'],
    summary: '不含税收入 = 含税售价 ÷ (1 + 征收率)；应交增值税 = 不含税售价 × 征收率。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款等' },
      { side: C, code: '6001', sub: '', note: '主营业务收入（不含税）' },
      { side: C, code: '2221', sub: '应交增值税', note: '应交增值税' }
    ],
    formula: '不含税收入 = 含税售价 ÷ (1 + 征收率)；应交增值税 = 不含税售价 × 征收率',
    sourceNote: '原图按 3% 举例。小规模纳税人征收率及减按优惠政策随期间变化，填金额前请核对当期政策。'
  },

  // ---------- 十三、短期借款 ----------
  {
    id: 'st-loan-borrow',
    group: '短期借款的核算',
    title: '借入借款',
    keywords: ['短期借款', '借入借款', '短期贷款'],
    summary: '借钱进来，负债和银行存款同增。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '2001', sub: '', note: '短期借款增加' }
    ]
  },
  {
    id: 'st-loan-interest',
    group: '短期借款的核算',
    title: '计提利息',
    keywords: ['计提利息', '计提借款利息', '短期借款利息', '借款利息', '借款计息'],
    summary: '按权责发生制确认利息费用。',
    lines: [
      { side: D, code: '6603', sub: '', note: '财务费用' },
      { side: C, code: '2231', sub: '', note: '应付利息' }
    ]
  },
  {
    id: 'st-loan-repay',
    group: '短期借款的核算',
    title: '偿还借款',
    keywords: ['偿还短期借款', '还短期贷款', '归还借款'],
    summary: '还钱，负债和银行存款同减。',
    lines: [
      { side: D, code: '2001', sub: '', note: '短期借款减少' },
      { side: C, code: '1002', sub: '', note: '银行存款减少' }
    ]
  },

  // ---------- 十四、长期借款 ----------
  {
    id: 'lt-loan-borrow',
    group: '长期借款的核算',
    title: '取得借款',
    keywords: ['长期借款', '取得长期借款', '长期贷款'],
    summary: '长期负债的本金单独明细。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '2501', sub: '本金', note: '长期借款——本金' }
    ]
  },
  {
    id: 'lt-loan-interest',
    group: '长期借款的核算',
    title: '计提利息',
    keywords: ['长期借款利息', '长期借款计息', '筹资期间利息'],
    summary: '生产经营期间进财务费用，筹建期间进管理费用；分期付息记应付利息，到期付息记长期借款——应付利息。',
    lines: [
      { side: D, code: '6603', sub: '', note: '生产经营期间' },
      { side: D, code: '6602', sub: '', note: '筹建期间' },
      { side: C, code: '2231', sub: '', note: '分期付息' },
      { side: C, code: '2501', sub: '应付利息', note: '到期付息' }
    ],
    usage: '借方按借款用途二选一（生产运营 / 筹建），贷方按付息方式二选一（分期付息 / 到期付息）。'
  },
  {
    id: 'lt-loan-repay',
    group: '长期借款的核算',
    title: '偿还借款',
    keywords: ['偿还长期借款', '归还长期贷款'],
    summary: '本金和已确认的应付利息一并冲销。',
    lines: [
      { side: D, code: '2501', sub: '本金', note: '长期借款——本金' },
      { side: D, code: '2501', sub: '应付利息', note: '长期借款——应付利息' },
      { side: C, code: '1002', sub: '', note: '银行存款' }
    ]
  },

  // ---------- 十五、接受投资 ----------
  {
    id: 'invest-cash',
    group: '接受投资的核算',
    title: '接受现金资产投资',
    keywords: ['接受投资', '现金投资', '股东投资', '实收资本', '增资', '收到投资款'],
    summary: '有限责任公司记实收资本，股份有限公司记股本。',
    lines: [
      { side: D, code: '1002', sub: '', note: '银行存款增加' },
      { side: C, code: '4001', sub: '投资者', note: '实收资本——投资者（有限责任）' },
      { side: C, code: '4001', sub: '', note: '股本（股份有限）' }
    ]
  },
  {
    id: 'invest-non-cash',
    group: '接受投资的核算',
    title: '接受非现金资产投资',
    keywords: ['非现金投资', '实物投资', '接受投资非现金', '资产作价出资'],
    summary: '按合同约定的价税或评估价值入账。',
    lines: [
      { side: D, code: '1601', sub: '', note: '固定资产' },
      { side: D, code: '1701', sub: '', note: '无形资产' },
      { side: D, code: '1403', sub: '', note: '原材料等' },
      { side: C, code: '4001', sub: '投资者', note: '实收资本——投资者（有限责任）' },
      { side: C, code: '4001', sub: '', note: '股本（股份有限）' }
    ]
  },

  // ---------- 十六、减资 ----------
  {
    id: 'reduce-capital-surplus',
    group: '减资',
    title: '资本过剩引起减资',
    keywords: ['资本过剩', '减资', '退还投资', '返还股款'],
    summary: '钱退给股东，所有者权益和银行存款同减。',
    lines: [
      { side: D, code: '4001', sub: '', note: '实收资本减少' },
      { side: C, code: '1002', sub: '', note: '银行存款减少' }
    ]
  },
  {
    id: 'reduce-capital-loss',
    group: '减资',
    title: '发生重大亏损时减资',
    keywords: ['重大亏损减资', '亏损减资', '弥补亏损减资'],
    summary: '用实收资本冲减累计亏损。',
    lines: [
      { side: D, code: '4001', sub: '', note: '实收资本减少' },
      { side: C, code: '4104', sub: '未分配利润', note: '利润分配——未分配利润' }
    ]
  }
]

/**
 * 互斥组：组内各行只能选一行。
 *
 * 原图里大量业务是"备查式"写法——把几种可能来源并排列出来，实际发生时只取其中一行。
 * 如果不标出来，界面会把它们当成"都要记"，金额落到单行上就永远配不平。
 * 这里用声明式写法集中标注，normalizeAlternatives 负责把 alt 贴到行上。
 */
const ALT_GROUPS = {
  'cash-income': [
    { label: '现金来源（四选一）', keys: ['1002|', '1221|', '2241|', '6051|'] }
  ],
  'bank-income': [
    { label: '银行存款增加原因（四选一）', keys: ['1001|', '1122|'] },
    { label: '销售收款时确认收入与销项税（与上一组互斥）', keys: ['6001|', '2221|应交增值税：销项税额'] }
  ],
  'bank-expense': [
    { label: '支出用途（三选一）', keys: ['1001|', '6602|', '1403|'] }
  ],
  // 现金支出同样是备查式：办公费 / 发工资 / 预借差旅费 三种用途只发生一种。
  // 上一版漏标，界面会把三个借方全部预选上，一填金额就报"借贷不等"。
  'cash-expense': [
    { label: '现金用途（三选一）', keys: ['6602|', '2211|工资', '1221|'] }
  ],
  'material-purchase': [
    { label: '入库状态（二选一）', keys: ['1403|', '1402|'] },
    { label: '结算方式（二选一）', keys: ['1401|', '2202|'] }
  ],
  'material-issue': [
    { label: '材料用途（五选一）', keys: ['5001|', '5101|', '6602|', '6601|', '6402|'] }
  ],
  'ap-incur': [
    { label: '入库货物类型（二选一）', keys: ['1405|', '1403|'] }
  ],
  'goods-revenue': [
    { label: '收款方式（二选一）', keys: ['1002|', '1122|'] }
  ],
  'cost-accrue': [
    { label: '发生项目（可多项同时发生）', keys: ['1403|', '2211|工资', '5101|'] }
  ],
  'salary-accrue': [
    { label: '受益部门（六选一）', keys: ['5001|', '5101|', '6602|', '6601|', '1604|', '5301|'] }
  ],
  'vat-input': [
    { label: '结算方式（二选一）', keys: ['1002|', '2202|'] }
  ],
  'vat-input-transfer': [
    { label: '材料去向（二选一）', keys: ['1604|', '2211|'] }
  ],
  'lt-loan-interest': [
    { label: '借款用途（二选一）', keys: ['6603|', '6602|'] },
    { label: '付息方式（二选一）', keys: ['2231|', '2501|应付利息'] }
  ],
  'invest-cash': [
    { label: '企业形式（二选一）', keys: ['4001|投资者', '4001|'] }
  ],
  'invest-non-cash': [
    { label: '投入的资产（按实际收到的资产勾选）', keys: ['1601|', '1701|', '1403|'] },
    { label: '企业形式（二选一）', keys: ['4001|投资者', '4001|'] }
  ]
}

/** 把 ALT_GROUPS 声明的互斥关系贴到各行上，供界面分组展示与校验使用 */
function normalizeAlternatives(rules) {
  const byId = new Map(rules.map((rule) => [rule.id, rule]))
  for (const [ruleId, groups] of Object.entries(ALT_GROUPS)) {
    const rule = byId.get(ruleId)
    if (!rule) continue
    groups.forEach((group, groupIndex) => {
      const label = `${groupIndex + 1}. ${group.label}`
      for (const key of group.keys) {
        const line = rule.lines.find((item) => lineKey(item) === key)
        if (line) line.alt = label
      }
    })
  }
  for (const rule of rules) rule.altGroups = ALT_GROUPS[rule.id] || []
  return rules
}

normalizeAlternatives(JOURNAL_ENTRY_RULES)

/** 分录的大类顺序，与原图一致 */
export const JOURNAL_GROUPS = [
  '库存现金',
  '银行存款',
  '原材料的核算',
  '应付账款的核算',
  '库存商品的核算',
  '应收账款的核算',
  '坏账准备的核算',
  '成本的核算',
  '应收票据的核算',
  '预付账款的账务处理',
  '应付职工薪酬',
  '应交增值税的账务处理',
  '短期借款的核算',
  '长期借款的核算',
  '接受投资的核算',
  '减资'
]

/**
 * 按关键词匹配业务描述。
 *
 * 上一版的问题：`query.includes(keyword)` 完全不分语境，
 * 于是"收到货款"同时命中"确认销售收入"和"收回应收账款"且得分相同，
 * 谁的标题字典序靠前谁当第一名 —— 用户拿到的是一个随机结果。
 * 现在：① 把容易混淆的词从错的规则里挪走；② 返回并列信息，由界面提示用户确认。
 *
 * @param {string} text 例如"收到股东投资款 300000"或"计提坏账准备"
 * @param {{limit?: number}} [options]
 * @returns {Array} 命中的规则，按匹配强度降序；每项含 {rule, score, matched, primary}
 */
export function matchJournalRules(text, options = {}) {
  const query = String(text || '').trim().toLowerCase()
  if (!query) return []
  const limit = options.limit && options.limit > 0 ? options.limit : 8
  const hits = []
  for (const rule of JOURNAL_ENTRY_RULES) {
    let score = 0
    const matched = []
    for (const keyword of rule.keywords) {
      const kw = keyword.toLowerCase()
      if (!kw) continue
      if (query.includes(kw)) {
        // 关键词越长越可信
        score += kw.length * 2
        matched.push(keyword)
      }
    }
    if (rule.title && query.includes(rule.title.toLowerCase())) {
      score += rule.title.length * 3
      matched.push(rule.title)
    }
    if (query.includes(rule.group.toLowerCase())) {
      score += 4
      matched.push(rule.group)
    }
    // 直接命中科目名也作为线索。权重刻意压低：它只是"用户可能输入了科目名"的兜底，
    // 给太大权重会让"领用原材料生产"这种描述和无关规则并列（曾造成假歧义）。
    for (const line of rule.lines) {
      const account = accountByCode.get(line.code)
      if (account && query.includes(account.name) && !matched.includes(account.name)) {
        score += 2
        matched.push(account.name)
      }
    }
    if (score > 0) hits.push({ rule, score, matched })
  }
  hits.sort((a, b) => b.score - a.score || a.rule.title.localeCompare(b.rule.title))
  const topScore = hits[0]?.score
  const tied = hits.filter((hit) => hit.score === topScore).length
  return hits.slice(0, limit).map((hit, index) => ({ ...hit, primary: index === 0 && tied === 1 }))
}

/** 最高分并列时说明这句话本身有歧义，界面必须让用户确认而不是替他决定 */
export function isAmbiguous(hits) {
  return hits.length > 1 && hits[0].score === hits[1].score
}

// ---------------- 从业务描述里提取金额 ----------------

const CN_MULTIPLIER = { 亿: 100000000, 万: 10000, 千: 1000, 百: 100 }
const AMOUNT_NOISE = /[,\s，￥¥$]/g

/**
 * 解析单个金额写法：'1,234.50' / '￥1234.5元' / '30万' / 1234.5。
 * @returns {number|null}
 */
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).replace(AMOUNT_NOISE, '').replace(/元$/, '')
  if (!text || text === '-' || text === '.') return null
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

/**
 * 从自然语言里提取金额，支持"30 万""1.5万元""￥300,000.00"。
 *
 * 为什么值得做：用户说"收到股东投资款 300000"时，上一版只匹配了业务、
 * 把 300000 丢掉，然后要用户在下拉里重新输一遍 —— 这是最容易被吐槽的体验点。
 *
 * 已知边界（不猜，交给用户确认）：
 *  - 不解析中文大写/小写数字（"三十万"）；
 *  - 句子里只有年份（如"2024 年"）时会被当成金额，界面会标注"自动识别，请确认"。
 *
 * @returns {{amount: number|null, raw: string, index: number}}
 */
export function extractAmount(text) {
  const source = String(text ?? '')
  if (!source.trim()) return { amount: null, raw: '', index: -1 }
  const pattern = /([0-9][0-9,，]*)(?:\.([0-9]+))?\s*(亿|万|千|百)?\s*(?:元|圆|块)?/g
  let best = null
  let match
  while ((match = pattern.exec(source)) !== null) {
    const intPart = match[1].replace(/[,，]/g, '')
    if (!/^[0-9]+$/.test(intPart)) continue
    const decimals = match[2] ? match[2].replace(/[^0-9]/g, '') : ''
    let value = Number(decimals ? `${intPart}.${decimals}` : intPart)
    if (!Number.isFinite(value)) continue
    const unit = match[3]
    if (unit) value *= CN_MULTIPLIER[unit]
    // 跟着百分号的是税率不是金额
    if (/^\s*%/.test(source.slice(match.index + match[0].length))) continue
    // 编号（凭证号 001 / 发票号 12345）不是金额：数字前是"号/编/期"，或数字后紧跟"号"
    const before = source.slice(0, match.index).trimEnd()
    if (/[号编]$/.test(before)) continue
    if (/^\s*号/.test(source.slice(match.index + match[0].length))) continue
    if (value <= 0) continue
    if (!best || value > best.amount) best = { amount: value, raw: match[0].trim(), index: match.index }
  }
  return best || { amount: null, raw: '', index: -1 }
}

/**
 * 推荐勾选：给出一进页面就能用的组合，而不是"全部勾上然后立刻报错"。
 *
 * 规则：互斥组只取第一行，其余行全部保留。
 * 结果可能仍然需要用户拆分金额（例如"借 原材料+进项税 / 贷 银行存款"），
 * 这是业务本身决定的，不能替用户编一个拆分比例。
 */
export function recommendedPicks(rule) {
  const groups = new Map()
  const picks = []
  for (const line of rule.lines) {
    if (!line.alt) { picks.push(lineKey(line)); continue }
    if (groups.has(line.alt)) continue
    groups.set(line.alt, true)
    picks.push(lineKey(line))
  }
  return picks
}

/** 判断分录的形状：一对一 / 需要拆分多行 */
export function entryShape(rule) {
  const debit = rule.lines.filter((line) => line.side === D).length
  const credit = rule.lines.filter((line) => line.side === C).length
  return { debit, credit, mode: debit === 1 && credit === 1 ? 'single' : 'split' }
}

/**
 * 生成一张可借贷配平的凭证。
 *
 * 复式记账法：借贷必相等。金额用「每行一个金额」表达，
 * 因为"一张凭证里一行对多行"是常态（借 原材料+进项税 / 贷 银行存款），
 * 只给一个总额是拆不开的，上一版正是卡在这里。
 *
 * @param {object} rule JOURNAL_ENTRY_RULES 中的一条
 * @param {object} input
 *   picks   — 勾选参与的行（`code|sub`，缺省为全部）
 *   amounts — { [lineKey]: 金额 }，每行独立
 *   amount / side — 旧写法：给一个总额并指定落在哪一侧；该侧恰好一行时才自动落
 * @returns {{
 *   rule, lines, balance, status, issues, message, hints,
 *   balanced: boolean|null, amount: number|null, amounts: object
 * }}
 *   status: 'empty' 未填金额 | 'balanced' 已配平 | 'pending' 待配平 | 'error' 有冲突
 */
export function buildEntry(rule, input = {}) {
  const allKeys = rule.lines.map(lineKey)
  // 注意：'未传 picks' 与 '传了空数组' 是两件事。
  // 前者按"全部行"处理（库的默认行为），后者表示"用户一行都没勾"，必须真的是空。
  const picks = Array.isArray(input.picks)
    ? input.picks.filter((key) => allKeys.includes(key))
    : allKeys
  const lines = rule.lines.filter((line) => picks.includes(lineKey(line)))
  const debitLines = lines.filter((line) => line.side === D)
  const creditLines = lines.filter((line) => line.side === C)

  const amounts = new Map()
  if (input.amounts && typeof input.amounts === 'object') {
    for (const [key, raw] of Object.entries(input.amounts)) {
      const num = parseAmount(raw)
      if (num !== null) amounts.set(key, num)
    }
  }

  const legacy = parseAmount(input.amount)
  const legacySide = input.side === C ? C : D
  const hints = []
  if (legacy !== null && legacy !== 0) {
    const sideLines = lines.filter((line) => line.side === legacySide)
    const otherLines = lines.filter((line) => line.side !== legacySide)
    if (sideLines.length === 1) {
      amounts.set(lineKey(sideLines[0]), legacy)
      if (otherLines.length === 1) amounts.set(lineKey(otherLines[0]), legacy)
      else if (otherLines.length > 1) {
        hints.push(`金额已落到${legacySide === D ? '借' : '贷'}方；另一侧有 ${otherLines.length} 行，需要分别填写金额。`)
      }
    } else {
      hints.push(`${legacySide === D ? '借' : '贷'}方当前有 ${sideLines.length} 行，无法判断金额属于哪一行，请直接在各行填写金额。`)
    }
  }

  const outLines = lines.map((line) => {
    const key = lineKey(line)
    const value = amounts.has(key) ? round2(amounts.get(key)) : null
    return { ...line, amount: value, account: accountByCode.get(line.code) }
  })
  const balance = checkBalanced(outLines)
  const filledCount = outLines.filter((line) => line.amount !== null).length

  const issues = []
  // 互斥组被多选时报错：原图是备查式写法，同组只能发生一种业务
  const pickedAlts = new Map()
  for (const line of outLines) {
    if (!line.alt) continue
    if (!pickedAlts.has(line.alt)) pickedAlts.set(line.alt, [])
    pickedAlts.get(line.alt).push(line)
  }
  for (const [group, groupLines] of pickedAlts) {
    if (groupLines.length > 1) {
      issues.push(`「${group}」是多选一，当前选了 ${groupLines.length} 行（${groupLines.map((line) => line.note || line.code).join('、')}）。备查式分录只取实际发生的那一行。`)
    }
  }

  let status = 'empty'
  if (issues.length) status = 'error'
  else if (!filledCount) status = 'empty'
  else if (balance.balanced) status = 'balanced'
  else status = 'pending'

  const shape = entryShape(rule)
  if (status === 'pending') {
    issues.length || hints.push(`借贷不等：借方 ${round2(balance.debit).toFixed(2)} / 贷方 ${round2(balance.credit).toFixed(2)}，差额 ${round2(balance.difference).toFixed(2)}。`)
  }
  if (status === 'empty') {
    hints.push('未填金额：以下只给出借贷方向。复式记账法要求借贷必相等，填入金额后会自动校验。')
  }
  if (status === 'balanced' && shape.mode === 'split' && debitLines.length === 1 && creditLines.length === 1) {
    // 一对一但原规则是多行：用户收窄到了单行
    hints.push('已收窄为一对一业务，金额自动落在两侧。')
  }

  return {
    rule,
    lines: outLines,
    balance,
    shape,
    status,
    issues,
    hints,
    balanced: filledCount ? balance.balanced && issues.length === 0 : null,
    amount: legacy,
    amounts: Object.fromEntries(amounts),
    message: hints.join(' ')
  }
}

/** 校验一组金额是否借贷相等（用于用户手工拆分多行时） */
export function checkBalanced(lines) {
  const debit = lines.filter((l) => l.side === D).reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
  const credit = lines.filter((l) => l.side === C).reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
  const difference = debit - credit
  return {
    debit: round2(debit),
    credit: round2(credit),
    difference: round2(difference),
    balanced: lines.length > 0 && Math.abs(difference) < 0.005
  }
}

/** 行的稳定标识：code|sub */
export function lineKey(line) {
  return `${line.code}|${line.sub || ''}`
}

/** 导出分录用的列定义 */
export const ENTRY_EXPORT_HEADERS = ['业务', '序号', '方向', '科目代码', '科目名称', '明细科目', '金额(元)', '摘要/说明']

/**
 * 把一张分录组织成可导出的表格（金额不带千分位，Excel 可直接求和）。
 *
 * 第一列刻意放"业务"名称：导出的表经常要和多张凭证拼在一起，
 * 没有业务名的话，落到 Excel 里就是一堆不知道属于哪笔业务的科目行。
 *
 * @param {object} rule
 * @param {ReturnType<typeof buildEntry>} entry
 */
export function buildEntryExport(rule, entry) {
  const lines = entry?.lines || []
  const rows = lines.map((line, index) => {
    const account = line.account || accountByCode.get(line.code)
    return [
      rule.title,
      String(index + 1),
      line.side === D ? '借' : '贷',
      line.code,
      account?.name || '',
      line.sub || '',
      line.amount === null || line.amount === undefined ? '' : round2(line.amount).toFixed(2),
      line.note || ''
    ]
  })
  const balance = entry?.balance || checkBalanced(lines)
  rows.push([rule.title, '', '', '', '', '借方合计', round2(balance.debit).toFixed(2), ''])
  rows.push([rule.title, '', '', '', '', '贷方合计', round2(balance.credit).toFixed(2), ''])
  rows.push([rule.title, '', '', '', '', '差额', round2(balance.difference).toFixed(2), balance.balanced ? '借贷平衡' : '尚未配平'])
  return { headers: ENTRY_EXPORT_HEADERS, rows, balanced: balance.balanced, rule }
}

function round2(value) {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}
