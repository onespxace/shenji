import { classifyAccount } from './accounting-data.js'

const DATE_PATTERN = /((?:19|20)\d{2})\s*[年./\\-]\s*(\d{1,2})\s*[月./\\-]\s*(\d{1,2})\s*日?/
const VOUCHER_NUMBER_PATTERNS = [
  /(?:凭证(?:编号|号)|记账凭证号|凭证字号)\s*[:：]?\s*([^\n]{1,24})/i,
  /((?:记|凭|字)[ \t]*[-#]?[ \t]*[\u4e00-\u9fa5A-Za-z]*[ \t]*\d{1,8}[ \t]*号?)/
]
const AMOUNT_PATTERN = /(?:[¥￥$]\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)/g

export const UNVERIFIABLE_VOUCHER_CHECKS = [
  '签名和签章的真实性、是否本人签署',
  '涂改、划线、擦除和事后补记痕迹',
  '发票、收据等附件的真实性与原件状态',
  '审批权限和业务授权是否合规',
  '科目选择、计价和税务处理是否适当',
  '是否已记账、重复记账和所属期间是否结账',
  '关联方、舞弊和经济实质风险'
]

export const COMPLETE_VOUCHER_SAMPLE = `记账凭证
2024年5月3日
凭证编号：记字001号
摘要：收到股东投资款
银行存款 1002 借方金额 300000.00
实收资本 4001 贷方金额 300000.00
合计 借方 300000.00 贷方 300000.00
附件：2张
制单：张三 审核：李四 记账：王五`

export const UPPERCASE_VOUCHER_SAMPLE = `记账凭证
2024年5月3日
凭证编号：记字001号
摘要：收到股东投资款
合计人民币（大写）：叁拾万元整
银行存款 1002 借方金额 300000.00
实收资本 4001 贷方金额 300000.00
合计 借方 300000.00 贷方 300000.00
附件：2张
制单：张三 审核：李四 记账：王五`

export const INCOMPLETE_VOUCHER_SAMPLE = `记账凭证
2024年5月3日
摘要：购买办公用品
管理费用 6602 1000.00
附件：1张
制单：张三`

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[０-９．％：，]/g, (char) => ({ '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9', '．': '.', '％': '%', '：': ':', '，': ',' }[char]))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toNumber(value) {
  const raw = String(value || '').replace(/,/g, '').trim()
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-')
  const number = Number(raw.replace(/[()]/g, '').replace(/^-/, ''))
  if (!Number.isFinite(number)) return 0
  return negative ? -Math.abs(number) : number
}

function money(value) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const CHINESE_DIGITS = { 零: 0, 壹: 1, 贰: 2, 叁: 3, 四: 4, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9 }
const CHINESE_SMALL_UNITS = { 拾: 10, 十: 10, 佰: 100, 百: 100, 仟: 1000, 千: 1000 }

function parseChineseInteger(value) {
  if (!value) return 0
  let total = 0
  let section = 0
  let number = 0
  for (const char of value) {
    if (Object.prototype.hasOwnProperty.call(CHINESE_DIGITS, char)) {
      number = CHINESE_DIGITS[char]
      continue
    }
    if (Object.prototype.hasOwnProperty.call(CHINESE_SMALL_UNITS, char)) {
      const unit = CHINESE_SMALL_UNITS[char]
      section += (number || (unit === 10 ? 1 : 0)) * unit
      number = 0
      continue
    }
    if (char === '万' || char === '萬') {
      section += number
      total += (section || 1) * 10000
      section = 0
      number = 0
    }
  }
  return total + section + number
}

function parseChineseMoney(value) {
  const text = String(value || '')
  const match = text.match(/[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整正]{2,}/)
  if (!match) return null
  const raw = match[0]
  const [integerPart, fractionPart = ''] = raw.split(/[元圆]/)
  if (raw.includes('元') || raw.includes('圆')) {
    const fraction = fractionPart.replace(/[整正]/g, '')
    const jiao = fraction.match(/([零壹贰叁肆伍陆柒捌玖])角/)?.[1]
    const fen = fraction.match(/([零壹贰叁肆伍陆柒捌玖])分/)?.[1]
    return parseChineseInteger(integerPart) + (jiao ? CHINESE_DIGITS[jiao] * 0.1 : 0) + (fen ? CHINESE_DIGITS[fen] * 0.01 : 0)
  }
  return parseChineseInteger(raw)
}

function extractCapsAmount(text) {
  const parsed = parseChineseMoney(text)
  return parsed === null ? null : { raw: text.match(/[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整正]{2,}/)?.[0] || '', value: parsed }
}

function extractDate(text) {
  const match = text.match(DATE_PATTERN)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return { raw: match[0], value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

function extractVoucherNumber(text) {
  for (const pattern of VOUCHER_NUMBER_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const value = match[1].trim().replace(/[|丨_]+/g, '')
      if (/\d/.test(value) && value.length <= 30) return value
    }
  }
  return null
}

function extractSummary(text) {
  const labelled = text.match(/摘要\s*[:：]?\s*([^\n]{2,80})/)
  if (labelled) return { value: labelled[1].trim(), confidence: 'high' }
  const ignored = /记账凭证|记账凭证填制|凭证编号|凭证号|合计|附件|制单|填制|审核|复核|记账|借方|贷方/
  for (const line of text.split('\n').map((item) => item.trim()).filter(Boolean)) {
    if (ignored.test(line) || DATE_PATTERN.test(line) || /^[A-Za-z0-9\s\-_/#]+$/.test(line)) continue
    if (/[\u4e00-\u9fa5]{2,}/.test(line)) return { value: line, confidence: 'low' }
  }
  return { value: '', confidence: 'none' }
}

function extractAttachmentCount(text) {
  const patterns = [
    /(?:附件张数|附件|附)\s*(?:张数)?\s*[:：]?\s*(\d+)\s*张?/i,
    /共\s*(\d+)\s*张/
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return Number(match[1])
  }
  return null
}

function extractSignatureValue(text, labelPattern, stopPattern) {
  const labelRegex = new RegExp(`(?:${labelPattern})(?:人)?[ \\t]*[:：]?[ \\t]*`, 'g')
  let match
  while ((match = labelRegex.exec(text)) !== null) {
    const rest = text.slice((match.index || 0) + match[0].length)
    if (/^凭证/.test(rest)) continue
    const stopRegex = new RegExp(`[ \\t|｜]*(?:${stopPattern})`)
    const stopIndex = rest.search(stopRegex)
    const segment = (stopIndex >= 0 ? rest.slice(0, stopIndex) : rest).split(/\n/)[0]
    const nameMatch = segment.match(/^[\u4e00-\u9fa5A-Za-z·]{2,12}/)
    return { labelFound: true, name: nameMatch ? nameMatch[0] : '' }
  }
  return { labelFound: false, name: '' }
}

function extractSignatures(text) {
  const definitions = [
    { id: 'preparer', label: '制单/填制人', labelPattern: '制单|填制', stopPattern: '审核|复核|记账|附件|合计' },
    { id: 'reviewer', label: '审核/复核人', labelPattern: '审核|复核', stopPattern: '制单|填制|记账|附件|合计' },
    { id: 'bookkeeper', label: '记账人', labelPattern: '记账', stopPattern: '附件|合计|制单|填制|审核|复核' }
  ]
  return definitions.map((definition) => {
    const value = extractSignatureValue(text, definition.labelPattern, definition.stopPattern)
    return { id: definition.id, label: definition.label, labelFound: value.labelFound, name: value.name, complete: value.labelFound && Boolean(value.name) }
  })
}

function cleanAccountScanText(text) {
  return text
    .replace(DATE_PATTERN, ' ')
    .replace(/(?:凭证(?:编号|号)|记账凭证号)\s*[:：]?\s*[^\n]*/gi, ' ')
    .replace(/(?:附件张数|附件|共)\s*[:：]?\s*\d+\s*张?/gi, ' ')
}

function extractAccounts(text) {
  const scan = cleanAccountScanText(text)
  const found = new Map()
  const codePattern = /(?:^|\D)([1-6]\d{3})(?!\d)(?![.,]\d)(?=\D|$)/g
  let match
  while ((match = codePattern.exec(scan)) !== null) {
    const classification = classifyAccount(match[1])
    if (classification.matched && !found.has(match[1])) {
      found.set(match[1], { code: match[1], name: classification.name || '', classId: classification.classId, className: classification.className, element: classification.element, source: 'code' })
    }
  }
  for (const line of scan.split('\n')) {
    const classification = classifyAccount(line)
    if (classification.matched && classification.name) {
      const key = classification.code || `name:${classification.name}`
      if (!found.has(key)) found.set(key, { code: classification.code, name: classification.name, classId: classification.classId, className: classification.className, element: classification.element, source: 'name' })
    }
  }
  return [...found.values()].sort((a, b) => a.code.localeCompare(b.code))
}

function extractAmountsFromLine(line) {
  const withoutMeta = line
    .replace(DATE_PATTERN, ' ')
    .replace(/(?:凭证(?:编号|号)|记账凭证号)\s*[:：]?\s*[^\n]*/gi, ' ')
    .replace(/(?:附件张数|附件|共)\s*[:：]?\s*\d+\s*张?/gi, ' ')
    .replace(/(?:^|[^\d])([1-6]\d{3})(?!\d)(?![.,]\d)(?=[^\d]|$)/g, ' ')
    .replace(/(?:记|凭|字)[ \t]*[-#]?[ \t]*[\u4e00-\u9fa5A-Za-z]*[ \t]*\d{1,8}[ \t]*号?/g, ' ')
  const values = []
  let match
  while ((match = AMOUNT_PATTERN.exec(withoutMeta)) !== null) values.push(toNumber(match[1]))
  return values
}

// 纯金额行：去掉货币符号与千分位后只剩数字
function isAmountOnlyLine(line) {
  return /^\d+(?:\.\d{1,4})?$/.test(String(line).replace(/[\u00a5\uffe5$,\s]/g, ''))
}

// 一个金额列里通常既有各行金额、也有该列的合计行，直接相加会重复计算。
// 若"最大值 == 其余之和"，说明其中一行就是合计，取最大值；否则无法确定，返回 null。
function columnTotal(values) {
  const list = values.filter((value) => value !== 0)
  if (!list.length) return 0
  if (list.length === 1) return list[0]
  const sorted = [...list].sort((a, b) => b - a)
  const largest = sorted[0]
  const rest = sorted.slice(1).reduce((sum, value) => sum + value, 0)
  if (Math.abs(largest - rest) < 0.01) return largest
  return null
}
// OCR 经常按列切分文本块：表头“借方金额/贷方金额”单独成行，金额落在后面的纯数字行。
// 先识别这种孤儿列块，否则这些金额会被当成无归属分录而丢失。
function findOrphanColumnBlocks(lines) {
  const consumed = new Set()
  const raw = { debit: [], credit: [] }
  let pending = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const headerOnly = line.match(/^(借方金额|贷方金额)\s*[:：]?$/)
    if (headerOnly) {
      pending = headerOnly[1].charAt(0) === '借' ? 'debit' : 'credit'
      continue
    }
    if (pending && isAmountOnlyLine(line)) {
      raw[pending].push(toNumber(extractAmountsFromLine(line)[0] || 0))
      consumed.add(i)
      continue
    }
    pending = null
  }
  return { blocks: { debit: columnTotal(raw.debit), credit: columnTotal(raw.credit) }, consumed }
}

function extractAmounts(text, accounts) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const { blocks: orphan, consumed } = findOrphanColumnBlocks(lines)
  const totalCandidates = []
  const entryCandidates = []
  for (let i = 0; i < lines.length; i += 1) {
    if (consumed.has(i)) continue
    const line = lines[i]
    const values = extractAmountsFromLine(line)
    if (!values.length) continue
    const isTotal = /合计|总计/.test(line)
    const hasDebitLabel = /借方|借/.test(line)
    const hasCreditLabel = /贷方|贷/.test(line)
    let debit = 0
    let credit = 0
    let inferred = false
    if (hasDebitLabel && hasCreditLabel) {
      debit = values[0] || 0
      credit = values[1] || 0
    } else if (hasDebitLabel && !hasCreditLabel) {
      debit = values.reduce((sum, value) => sum + value, 0)
    } else if (hasCreditLabel && !hasDebitLabel) {
      credit = values.reduce((sum, value) => sum + value, 0)
    } else if (values.length >= 2) {
      debit = values[0]
      credit = values.slice(1).reduce((sum, value) => sum + value, 0)
    } else {
      const account = accounts.find((item) => line.includes(item.code) || line.includes(item.name))
      if (account) {
        if (['asset', 'cost', 'profitLoss'].includes(account.classId)) {
          const profitLossIsExpense = /成本|费用|支出|损失|税金/.test(account.name)
          if (account.classId !== 'profitLoss' || profitLossIsExpense) { debit = values[0]; inferred = true }
          else credit = values[0]
        } else {
          credit = values[0]
        }
        inferred = true
      }
    }
    if (isTotal) totalCandidates.push({ debit, credit, line, inferred })
    else entryCandidates.push({ debit, credit, line, inferred })
  }
  // 取源优先级：分录行（有科目锚定，最可靠）> 合计行 > 孤儿列块只用于补齐缺失的一侧。
  // OCR 常把表格按列拆块，导致“合计”行只剩一侧金额甚至 0/0，
  // 若让它直接覆盖分录行，会把本来平衡的凭证误判为不平衡。
  const sumOf = (list) => ({
    debit: list.reduce((sum, item) => sum + item.debit, 0),
    credit: list.reduce((sum, item) => sum + item.credit, 0)
  })
  const totals = sumOf(totalCandidates)
  const entries = sumOf(entryCandidates)
  const entriesUsable = entryCandidates.length > 0 && (entries.debit !== 0 || entries.credit !== 0)
  const totalsUsable = totalCandidates.length > 0 && (totals.debit !== 0 || totals.credit !== 0)

  let debit = null
  let credit = null
  let source = 'none'
  let inferred = false
  if (entriesUsable) {
    // 分录行优先；某一侧为空时用合计行或孤儿列块补齐
    debit = entries.debit
    credit = entries.credit
    source = '分录行'
    inferred = entryCandidates.some((item) => item.inferred)
    if (!debit && (totalsUsable || orphan.debit)) { debit = totalsUsable ? totals.debit : orphan.debit; inferred = true }
    if (!credit && (totalsUsable || orphan.credit)) { credit = totalsUsable ? totals.credit : orphan.credit; inferred = true }
  } else if (totalsUsable) {
    debit = totals.debit
    credit = totals.credit
    source = '合计行'
    inferred = true
  } else if (orphan.debit || orphan.credit) {
    debit = orphan.debit
    credit = orphan.credit
    source = '列块'
    inferred = true
  }

  if (debit === null && credit === null) {
    return { debit: null, credit: null, difference: null, source: 'none', inferred: false }
  }
  return {
    debit,
    credit,
    difference: debit - credit,
    source,
    inferred,
    // 合计行与分录行都读出金额且不一致时单独标记，供人工判断是 OCR 丢数还是真实差异
    totalsDisagreeWithEntries: totalsUsable && entriesUsable && Math.abs(totals.debit - entries.debit) >= 0.01
  }
}

function makeCheck(id, label, weight, status, detail) {
  return { id, label, weight, status, detail }
}

export function validateVoucherText(input, options = {}) {
  const text = normalizeText(input)
  const date = extractDate(text)
  const voucherNumber = extractVoucherNumber(text)
  const summary = extractSummary(text)
  const accounts = extractAccounts(text)
  const attachmentCount = extractAttachmentCount(text)
  const signatures = extractSignatures(text)
  const amounts = extractAmounts(text, accounts)
  const capsAmount = extractCapsAmount(text)
  const difference = amounts.debit !== null && amounts.credit !== null ? amounts.debit - amounts.credit : null
  const balanced = difference !== null && Math.abs(difference) < 0.01 && (amounts.debit !== 0 || amounts.credit !== 0)
  const checks = []

  checks.push(makeCheck('date', '凭证日期', 10, date ? 'pass' : 'fail', date ? `识别到 ${date.value}` : '未识别到有效日期'))
  checks.push(makeCheck('voucherNo', '凭证编号', 10, voucherNumber ? 'pass' : 'fail', voucherNumber ? `识别到 ${voucherNumber}` : '缺少或未识别凭证编号'))
  checks.push(makeCheck('summary', '经济业务摘要', 10, summary.value ? (summary.confidence === 'high' ? 'pass' : 'warn') : 'fail', summary.value ? `识别到“${summary.value}”${summary.confidence === 'low' ? '（低置信度，请核对）' : ''}` : '缺少摘要'))
  checks.push(makeCheck('accounts', '会计科目', 15, accounts.length >= 2 ? 'pass' : accounts.length === 1 ? 'warn' : 'fail', accounts.length ? `识别到 ${accounts.length} 个科目：${accounts.map((item) => `${item.code} ${item.name}`).join('、')}` : '未识别到可用科目'))

  if (amounts.debit === null || amounts.debit === 0) checks.push(makeCheck('debit', '借方金额', 10, 'fail', '未识别到有效借方金额'))
  else checks.push(makeCheck('debit', '借方金额', 10, amounts.inferred ? 'warn' : 'pass', `借方合计 ${money(amounts.debit)}${amounts.inferred ? '（部分方向由科目属性推断）' : ''}`))
  if (amounts.credit === null || amounts.credit === 0) checks.push(makeCheck('credit', '贷方金额', 10, 'fail', '未识别到有效贷方金额'))
  else checks.push(makeCheck('credit', '贷方金额', 10, amounts.inferred ? 'warn' : 'pass', `贷方合计 ${money(amounts.credit)}${amounts.inferred ? '（部分方向由科目属性推断）' : ''}`))

  if (difference === null) checks.push(makeCheck('balance', '借贷平衡', 15, 'warn', '金额不足，无法完成借贷平衡校验'))
  else checks.push(makeCheck('balance', '借贷平衡', 15, balanced ? 'pass' : 'fail', balanced ? `借贷相等，均为 ${money(amounts.debit)}` : `借方 ${money(amounts.debit)}，贷方 ${money(amounts.credit)}，差额 ${money(difference)}`))
  if (capsAmount) {
    const capsMatches = amounts.debit !== null && Math.abs(capsAmount.value - amounts.debit) < 0.01
    checks.push(makeCheck('capsAmount', '大写金额', 5, capsMatches ? 'pass' : amounts.debit === null ? 'warn' : 'fail', capsMatches ? `大写金额与阿拉伯数字一致：${capsAmount.raw}` : amounts.debit === null ? `识别到大写金额 ${capsAmount.raw}，但阿拉伯数字不足，需人工核对` : `大写金额 ${capsAmount.raw}（${money(capsAmount.value)}）与阿拉伯数字 ${money(amounts.debit)} 不一致`))
  }

  checks.push(makeCheck('attachment', '附件张数', 5, attachmentCount !== null && attachmentCount >= 0 ? 'pass' : 'fail', attachmentCount !== null ? `识别到 ${attachmentCount} 张附件` : '缺少或未识别附件张数'))
  const completeSignatures = signatures.filter((item) => item.complete).length
  checks.push(makeCheck('signatures', '责任签名', 10, completeSignatures === signatures.length ? 'pass' : completeSignatures > 0 ? 'warn' : 'fail', `识别到 ${completeSignatures}/${signatures.length} 个完整签名：${signatures.map((item) => `${item.label}${item.complete ? '✓' : '×'}`).join('、')}`))

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0)
  const earnedWeight = checks.reduce((sum, check) => sum + check.weight * (check.status === 'pass' ? 1 : check.status === 'warn' ? 0.5 : 0), 0)
  const score = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0
  const failures = checks.filter((check) => check.status === 'fail')
  const warnings = checks.filter((check) => check.status === 'warn')
  let status = failures.length === 0 && score >= 90 ? 'complete' : score >= 60 ? 'review' : 'incomplete'
  if (options.ocrConfidence !== undefined && options.ocrConfidence !== null && options.ocrConfidence < 70 && status === 'complete') status = 'review'
  const notes = [
    '本检查只判断凭证形式要素、科目可识别性和借贷平衡，不能证明经济业务真实、计价正确或审批合规。',
    'OCR 无法可靠判断签章真伪、涂改痕迹、重复报销和舞弊风险，相关项目必须人工复核。'
  ]
  if (options.ocrConfidence !== undefined && options.ocrConfidence !== null && options.ocrConfidence < 70) notes.unshift(`OCR 置信度较低（${Math.round(options.ocrConfidence)}%），建议人工校对识别文本。`)
  if (accounts.length > 1 && new Set(accounts.map((item) => item.classId)).size === 1) notes.push('识别到的分录科目集中在同一大类，可能缺少另一方向分录，请结合业务复核。')

  return {
    status,
    score,
    checks,
    missing: failures.map((item) => item.label),
    warnings: warnings.map((item) => item.label),
    unverifiable: UNVERIFIABLE_VOUCHER_CHECKS,
    notes,
    extracted: { date, voucherNumber, summary, accounts, attachmentCount, signatures, amounts, capsAmount }
  }
}

