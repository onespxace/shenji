// 会计基础离线数据。科目分类来自用户提供的《新版常用会计科目表》图片；
// 会计要素、报表、税率等基础知识单独维护，分类口径不得与“会计六要素”混淆。

export const ACCOUNT_CLASSES = [
  { id: 'asset', order: '一', name: '资产类', codeRange: '1001—1901', element: '资产', description: '企业过去的交易或事项形成的、由企业拥有或控制、预期会给企业带来经济利益的资源。' },
  { id: 'liability', order: '二', name: '负债类', codeRange: '2001—2901', element: '负债', description: '企业过去的交易或事项形成的、预期会导致经济利益流出企业的现时义务。' },
  { id: 'common', order: '三', name: '共同类', codeRange: '以 3 开头', element: '视业务归属', description: '既有资产属性又有负债属性的共同科目，按具体业务判断其最终归属。' },
  { id: 'equity', order: '四', name: '所有者权益类', codeRange: '4001—4201', element: '所有者权益', description: '企业资产扣除负债后由所有者享有的剩余权益。' },
  { id: 'cost', order: '五', name: '成本类', codeRange: '5001—5402', element: '费用（成本归集）', description: '企业日常生产经营中发生的、按对象归集的生产经营成本。' },
  { id: 'profitLoss', order: '六', name: '损益类', codeRange: '6001—6901', element: '收入、费用或利润', description: '反映一定会计期间经营成果的科目；需按具体科目判断收入、费用或利润属性。' }
]

export const ACCOUNT_ENTRIES = [
  { code: '1001', name: '库存现金', classId: 'asset' },
  { code: '1002', name: '银行存款', classId: 'asset' },
  { code: '1012', name: '其他货币资金', classId: 'asset' },
  { code: '1101', name: '交易性金融资产', classId: 'asset' },
  { code: '1121', name: '应收票据', classId: 'asset' },
  { code: '1122', name: '应收账款', classId: 'asset' },
  { code: '1123', name: '预付账款', classId: 'asset' },
  { code: '1131', name: '应收股利', classId: 'asset' },
  { code: '1132', name: '应收利息', classId: 'asset' },
  { code: '1164', name: '合同资产', classId: 'asset' },
  { code: '1165', name: '合同资产减值准备', classId: 'asset' },
  { code: '1221', name: '其他应收款', classId: 'asset' },
  { code: '1231', name: '坏账准备', classId: 'asset' },
  { code: '1401', name: '材料采购', classId: 'asset' },
  { code: '1402', name: '在途物资', classId: 'asset' },
  { code: '1403', name: '原材料', classId: 'asset' },
  { code: '1404', name: '材料成本差异', classId: 'asset' },
  { code: '1405', name: '库存商品', classId: 'asset' },
  { code: '1406', name: '发出商品', classId: 'asset' },
  { code: '1408', name: '委托加工物资', classId: 'asset' },
  { code: '1410', name: '商品进销差价', classId: 'asset' },
  { code: '1411', name: '周转材料', classId: 'asset' },
  { code: '1471', name: '存货跌价准备', classId: 'asset' },
  { code: '1485', name: '应收退货成本', classId: 'asset' },
  { code: '1501', name: '债权投资', classId: 'asset' },
  { code: '1502', name: '其他债权投资', classId: 'asset' },
  { code: '1503', name: '其他权益工具投资', classId: 'asset' },
  { code: '1511', name: '长期股权投资', classId: 'asset' },
  { code: '1512', name: '长期股权投资减值准备', classId: 'asset' },
  { code: '1521', name: '投资性房地产', classId: 'asset' },
  { code: '1531', name: '长期应收款', classId: 'asset' },
  { code: '1601', name: '固定资产', classId: 'asset' },
  { code: '1602', name: '累计折旧', classId: 'asset' },
  { code: '1603', name: '固定资产减值准备', classId: 'asset' },
  { code: '1604', name: '在建工程', classId: 'asset' },
  { code: '1605', name: '工程物资', classId: 'asset' },
  { code: '1606', name: '固定资产清理', classId: 'asset' },
  { code: '1701', name: '无形资产', classId: 'asset' },
  { code: '1702', name: '累计摊销', classId: 'asset' },
  { code: '1703', name: '无形资产减值准备', classId: 'asset' },
  { code: '1711', name: '商誉', classId: 'asset' },
  { code: '1801', name: '长期待摊费用', classId: 'asset' },
  { code: '1811', name: '递延所得税资产', classId: 'asset' },
  { code: '1901', name: '待处理财产损溢', classId: 'asset' },
  { code: '2001', name: '短期借款', classId: 'liability' },
  { code: '2101', name: '交易性金融负债', classId: 'liability' },
  { code: '2201', name: '应付票据', classId: 'liability' },
  { code: '2202', name: '应付账款', classId: 'liability' },
  { code: '2203', name: '预收账款', classId: 'liability' },
  { code: '2204', name: '合同负债', classId: 'liability' },
  { code: '2211', name: '应付职工薪酬', classId: 'liability' },
  { code: '2221', name: '应交税费', classId: 'liability' },
  { code: '2231', name: '应付利息', classId: 'liability' },
  { code: '2232', name: '应付股利', classId: 'liability' },
  { code: '2241', name: '其他应付款', classId: 'liability' },
  { code: '2501', name: '长期借款', classId: 'liability' },
  { code: '2502', name: '应付债券', classId: 'liability' },
  { code: '2701', name: '长期应付款', classId: 'liability' },
  { code: '2801', name: '预计负债', classId: 'liability' },
  { code: '2901', name: '递延所得税负债', classId: 'liability' },
  { code: '4001', name: '实收资本（或股本）', classId: 'equity', aliases: ['实收资本', '股本'] },
  { code: '4002', name: '资本公积', classId: 'equity' },
  { code: '4101', name: '盈余公积', classId: 'equity' },
  { code: '4103', name: '本年利润', classId: 'equity' },
  { code: '4104', name: '利润分配', classId: 'equity' },
  { code: '4201', name: '库存股', classId: 'equity' },
  { code: '5001', name: '生产成本', classId: 'cost' },
  { code: '5101', name: '制造费用', classId: 'cost' },
  { code: '5301', name: '研发支出', classId: 'cost' },
  { code: '5401', name: '合同履约成本', classId: 'cost' },
  { code: '5402', name: '合同取得成本', classId: 'cost' },
  { code: '6001', name: '主营业务收入', classId: 'profitLoss' },
  { code: '6051', name: '其他业务收入', classId: 'profitLoss' },
  { code: '6101', name: '公允价值变动损益', classId: 'profitLoss' },
  { code: '6102', name: '投资收益', classId: 'profitLoss' },
  { code: '6103', name: '资产处置损益', classId: 'profitLoss' },
  { code: '6104', name: '净敞口套期损益', classId: 'profitLoss' },
  { code: '6301', name: '营业外收入', classId: 'profitLoss' },
  { code: '6401', name: '主营业务成本', classId: 'profitLoss' },
  { code: '6402', name: '其他业务成本', classId: 'profitLoss' },
  { code: '6403', name: '税金及附加', classId: 'profitLoss' },
  { code: '6601', name: '销售费用', classId: 'profitLoss' },
  { code: '6602', name: '管理费用', classId: 'profitLoss' },
  { code: '6603', name: '财务费用', classId: 'profitLoss' },
  { code: '6701', name: '资产减值损失', classId: 'profitLoss' },
  { code: '6702', name: '信用减值损失', classId: 'profitLoss' },
  { code: '6711', name: '营业外支出', classId: 'profitLoss' },
  { code: '6801', name: '所得税费用', classId: 'profitLoss' },
  { code: '6901', name: '以前年度损益调整', classId: 'profitLoss' }
]

const accountByCode = new Map(ACCOUNT_ENTRIES.map((item) => [item.code, item]))
const accountByName = new Map()
for (const account of ACCOUNT_ENTRIES) {
  accountByName.set(normalizeAccountText(account.name), account)
  for (const alias of account.aliases || []) accountByName.set(normalizeAccountText(alias), account)
}
const classById = new Map(ACCOUNT_CLASSES.map((item) => [item.id, item]))
const prefixClass = { 1: 'asset', 2: 'liability', 3: 'common', 4: 'equity', 5: 'cost', 6: 'profitLoss' }

const keywordRules = [
  { words: ['现金', '银行存款', '货币资金', '应收', '预付', '存货', '原材料', '库存商品', '固定资产', '无形资产', '商誉', '长期股权', '投资性房地产'], classId: 'asset' },
  { words: ['借款', '应付', '预收', '合同负债', '应交税费', '应付职工薪酬', '预计负债', '递延所得税负债'], classId: 'liability' },
  { words: ['股本', '实收资本', '资本公积', '盈余公积', '利润分配', '库存股'], classId: 'equity' },
  { words: ['生产成本', '制造费用', '研发支出', '合同履约成本', '合同取得成本'], classId: 'cost' },
  { words: ['收入', '收益', '损益', '成本', '费用', '税金及附加', '营业外支出'], classId: 'profitLoss' }
]

function normalizeAccountText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s（）()【】\[\]、,，。.:：;；\-_/\\]/g, '')
}

export function classifyAccount(input) {
  const raw = String(input || '').trim()
  if (!raw) return { input: raw, matched: false, reason: '请输入科目代码或名称' }
  const normalized = normalizeAccountText(raw)
  const codeMatch = raw.match(/\b([1-6]\d{3})\b/)
  const directClass = ACCOUNT_CLASSES.find((item) => [item.name, item.name.replace('类', ''), item.id].map(normalizeAccountText).includes(normalized))
  if (directClass) return { input: raw, matched: true, confidence: 'high', code: '', name: directClass.name, classId: directClass.id, className: directClass.name, element: directClass.element, reason: '输入的是科目大类名称' }
  let account = codeMatch ? accountByCode.get(codeMatch[1]) : null
  let reason = account ? `匹配科目代码 ${account.code}` : ''
  if (!account) {
    account = accountByName.get(normalized) || null
    if (account) reason = `匹配科目名称 ${account.name}`
  }
  if (!account) {
    const keyword = keywordRules.find((rule) => rule.words.some((word) => normalized.includes(normalizeAccountText(word))))
    if (keyword) {
      const accountClass = classById.get(keyword.classId)
      const matchedWord = keyword.words.find((word) => normalized.includes(normalizeAccountText(word)))
      const matchedAccount = matchedWord ? accountByName.get(normalizeAccountText(matchedWord)) : null
      return { input: raw, matched: true, confidence: 'medium', code: matchedAccount?.code || codeMatch?.[1] || '', name: matchedAccount?.name || matchedWord || '', classId: accountClass.id, className: accountClass.name, element: accountClass.element, reason: `按关键词“${matchedWord || ''}”归入${accountClass.name}` }
    }
  }
  if (!account && codeMatch) {
    const classId = prefixClass[codeMatch[1][0]]
    const accountClass = classById.get(classId)
    return { input: raw, matched: true, confidence: 'medium', code: codeMatch[1], name: '', classId, className: accountClass.name, element: accountClass.element, reason: `按 ${codeMatch[1][0]} 开头代码归入${accountClass.name}` }
  }
  if (!account) return { input: raw, matched: false, reason: '未在离线常用科目表中匹配，请核对代码或名称' }
  const accountClass = classById.get(account.classId)
  return { input: raw, matched: true, confidence: 'high', code: account.code, name: account.name, classId: account.classId, className: accountClass.name, element: accountClass.element, reason }
}

export const ACCOUNTING_BASICS = [
  {
    id: 'six-elements',
    question: '会计的六大基本要素是什么？',
    keywords: ['六要素', '六大要素', '基本要素', '会计要素'],
    answer: '会计六大基本要素是：资产、负债、所有者权益、收入、费用和利润。',
    details: ['资产、负债和所有者权益反映财务状况；收入、费用和利润反映经营成果。', '注意：六大会计要素与会计科目的“六大类别”不是同一口径。']
  },
  {
    id: 'three-statements',
    question: '会计的三大报表是什么？',
    keywords: ['三大报表', '三张报表', '财务报表', '报表包括', '资产负债表利润表'],
    answer: '会计三大报表是：资产负债表、利润表和现金流量表。',
    details: ['资产负债表反映某一时点的财务状况。', '利润表反映一定会计期间的经营成果。', '现金流量表反映一定会计期间的现金流入和现金流出。']
  },
  {
    id: 'vat-rates',
    question: '常用的增值税税率有哪些？',
    keywords: ['增值税', '税率', '13%', '9%', '6%', '3%', '小规模'],
    answer: '常见口径：13%、9%、6% 为增值税税率，3% 常作为小规模纳税人的征收率。',
    details: ['13%：销售或进口货物，适用情形下的加工、修理修配劳务等。', '9%：交通运输、邮政、建筑等常见项目；不动产租赁、销售不动产和土地使用权转让还需区分具体政策。', '6%：电信服务、金融服务、现代服务、生活服务等常见现代服务。', '3%：小规模纳税人常见征收率；优惠政策、减按征收率及有效期可能随政策变化，应以业务发生时点和当期政策为准。', '政策提示：现行增值税法及配套规则自 2026-01-01 起施行，阶段性减按政策需核对有效期和适用条件。']
  },
  {
    id: 'functions',
    question: '会计的两大基本职能是什么？',
    keywords: ['职能', '核算职能', '监督职能', '核算和监督'],
    answer: '会计的两大基本职能是核算职能和监督职能。',
    details: ['核算职能反映和记录经济活动；监督职能保证经济业务合法、合理并符合要求。']
  },
  {
    id: 'assumptions',
    question: '会计的四大基本假设是什么？',
    keywords: ['四大假设', '基本假设', '会计假设', '会计主体', '持续经营', '会计分期', '货币计量'],
    answer: '会计四大基本假设是：会计主体、持续经营、会计分期和货币计量。',
    details: ['它们构成会计核算的空间、时间和计量基础。']
  },
  {
    id: 'debit-credit',
    question: '借贷记账法是什么？',
    keywords: ['借贷记账法', '借贷复式', '有借必有贷', '借贷必相等'],
    answer: '借贷记账法以“借”“贷”为记账符号，遵循“有借必有贷，借贷必相等”。',
    details: ['资产、成本和费用类科目通常借方登记增加；负债、所有者权益和收入类科目通常贷方登记增加。', '减少方向相反，但凭证中的借贷方向仍需结合具体经济业务判断。']
  },
  {
    id: 'voucher-elements',
    question: '一张完整的记账凭证应包含哪些要素？',
    keywords: ['凭证要素', '记账凭证', '凭证完整', '凭证要素', '附件张数', '制单', '审核'],
    answer: '完整记账凭证通常应包含：凭证日期、凭证编号、摘要、会计科目、借方金额、贷方金额、附件张数，以及制单/填制、审核、记账等责任签名。',
    details: ['借方金额与贷方金额应相等。', 'OCR 无法可靠判断的签章真伪、涂改和舞弊风险必须人工复核。']
  },
  {
    id: 'profit-formulas',
    question: '利润表中的利润计算公式是什么？',
    keywords: ['利润公式', '营业利润', '利润总额', '净利润', '应纳税所得额'],
    answer: '常用公式：主营业务利润=主营业务收入-主营业务成本-主营业务税金及附加；营业利润=主营业务利润+其他业务利润-期间费用；利润总额=营业利润+投资净收益+营业外收支净额；净利润=利润总额-所得税费用。',
    details: ['实际科目口径应以企业现行会计政策、会计科目表和报表格式为准。']
  },
  {
    id: 'account-equations',
    question: '会计要素之间有什么基本关系？',
    keywords: ['会计等式', '要素关系', '资产等于', '资产加费用', '基本关系'],
    answer: '基本会计等式：资产=负债+所有者权益。扩展关系：资产+费用=负债+所有者权益+(收入-费用)。',
    details: ['等式反映会计要素之间的基本平衡关系。']
  },
  {
    id: 'class-vs-element',
    question: '会计科目六大类别和会计六要素有什么区别？',
    keywords: ['科目分类', '六类', '科目类别', '六要素区别', '资产类负债类'],
    answer: '会计科目六大类别是：资产类、负债类、共同类、所有者权益类、成本类和损益类；会计六要素是资产、负债、所有者权益、收入、费用和利润。两者口径不同，损益类科目需再判断收入、费用或利润属性。',
    details: ['例如“主营业务收入”属于损益类，同时属于收入要素；“管理费用”属于损益类，同时属于费用要素。']
  }
]

export function answerAccountingQuestion(question) {
  const query = normalizeAccountText(question)
  if (!query) return null
  const account = classifyAccount(question)
  if (account.matched && /\d{4}|库存现金|银行存款|应付账款|主营业务收入|管理费用|实收资本/.test(question)) {
    return { type: 'account', account, answer: `${account.code ? `${account.code} ` : ''}${account.name || account.input} 属于${account.className}，对应会计要素：${account.element}。` }
  }
  let best = null
  let bestScore = 0
  for (const item of ACCOUNTING_BASICS) {
    let score = 0
    for (const keyword of item.keywords) {
      const normalizedKeyword = normalizeAccountText(keyword)
      if (query.includes(normalizedKeyword)) score += normalizedKeyword.length * 3
      else if (normalizedKeyword.length >= 2 && query.split('').some((char) => normalizedKeyword.includes(char))) score += 1
    }
    if (score > bestScore) { best = item; bestScore = score }
  }
  return bestScore >= 3 ? { type: 'basic', id: best.id, question: best.question, answer: best.answer, details: best.details } : null
}
