// 字段级格式校验与会计科目字典约束。
//
// 铁律（对应"不要用模糊匹配偷偷改结果"）：
//   校验器只做两件事——报告"这个值合不合法"，以及在**有充分证据**时给出规范化建议。
//   它绝不修改 value。规范化结果一律放在 `normalized` 与 `normalizedBy` 里，
//   由界面显示"识别结果 / 规范化匹配"两行，让用户自己决定采不采纳。
//
// 证据门槛：科目字典匹配要求编辑距离 ≤1 且长度 ≥3；否则只列为候选，不自动采纳。

import { ACCOUNT_ENTRIES } from '../../lib/accounting-data.js'

export const FIELD_IDS = {
  date: 'date',
  voucherNumber: 'voucherNumber',
  summary: 'summary',
  generalAccount: 'generalAccount',
  detailAccount: 'detailAccount',
  debitAmount: 'debitAmount',
  creditAmount: 'creditAmount',
  attachmentCount: 'attachmentCount',
  preparer: 'preparer',
  signature: 'signature'
}

export const FIELD_LABELS = {
  date: '日期',
  voucherNumber: '凭证编号',
  summary: '经济业务摘要',
  generalAccount: '总账科目',
  detailAccount: '明细科目',
  debitAmount: '借方金额',
  creditAmount: '贷方金额',
  attachmentCount: '附件张数',
  preparer: '制单人',
  signature: '责任签名'
}

/** 这些字段只做"格式是否合法"的判断，不做字典归并 */
export const NUMERIC_FIELDS = new Set([FIELD_IDS.debitAmount, FIELD_IDS.creditAmount, FIELD_IDS.attachmentCount])
/** 科目类字段走字典约束 */
export const ACCOUNT_FIELDS = new Set([FIELD_IDS.generalAccount, FIELD_IDS.detailAccount])
/** 签名类字段只做"存在性"判断，见 signature.js */

// ---------------------------------------------------------------- 日期

const DATE_PATTERNS = [
  { re: /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/, label: '年月日' }
]

/** 规范化日期并校验真实存在。2024-02-31 这种会被判非法。 */
export function validateDate(raw) {
  const text = String(raw || '').trim()
  if (!text) return { ok: false, reason: '未识别到日期', value: '' }
  const match = DATE_PATTERNS.map((p) => ({ p, m: p.re.exec(text) })).find((x) => x.m)
  if (!match) return { ok: false, reason: `"${text}" 不符合日期格式`, value: text }
  const year = Number(match.m[1])
  const month = Number(match.m[2])
  const day = Number(match.m[3])
  if (month < 1 || month > 12) return { ok: false, reason: `月份 ${month} 越界`, value: text }
  const daysInMonth = new Date(year, month, 0).getDate()
  if (day < 1 || day > daysInMonth) {
    return { ok: false, reason: `${year} 年 ${month} 月只有 ${daysInMonth} 天，日期不成立`, value: text }
  }
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const normalized = value !== text ? `${match.p.label} 已规范化为 ${value}` : ''
  return { ok: true, value, normalized, reason: '' }
}

// ---------------------------------------------------------------- 凭证编号

/** 凭证编号允许中文前缀 + 数字 + 中文后缀，例如「记字001号」 */
export function validateVoucherNumber(raw) {
  const text = String(raw || '').replace(/\s+/g, '').trim()
  if (!text) return { ok: false, reason: '未识别到凭证编号', value: '' }
  // 去掉栏位标签：OCR 常常把「凭证编号：记字001号」整块给出来
  const compact = text.replace(/[：:]/g, '').replace(/^(凭\s*证\s*编\s*号|编\s*号)/, '')
  const m = compact.match(/^(.*?)(\d{1,6})(.*)$/)
  if (!m) return { ok: false, reason: `"${compact}" 里没有编号数字`, value: compact }
  if (!/^[一-龥A-Za-z]*$/.test(m[1]) || !/^[一-龥A-Za-z]*$/.test(m[3])) {
    return { ok: false, reason: '编号前后缀含异常字符', value: compact }
  }
  return { ok: true, value: compact, normalized: '', reason: '', digits: m[2] }
}

// ---------------------------------------------------------------- 金额

/** 千分位、全角、O/0、l/1、缺小数位都要能收敛 */
export function parseAmount(raw) {
  let text = String(raw || '').trim()
  if (!text) return null
  text = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,\s' ]/g, '')
    .replace(/[¥￥]/g, '')
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[。]/g, '.')
  const negative = /^-/.test(text) || /^\(.*\)$/.test(text)
  text = text.replace(/^-/, '').replace(/^\(|\)$/g, '')
  if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

export function validateAmount(raw, options = {}) {
  const text = String(raw || '').trim()
  if (!text) return { ok: false, reason: '未识别到金额', value: null }
  const value = parseAmount(text)
  if (value === null) return { ok: false, reason: `"${text}" 不是合法金额`, value: null }
  if (value < 0 && !options.allowNegative) {
    return { ok: false, reason: '金额为负，凭证金额通常不应为负', value }
  }
  const decimals = (text.split('.')[1] || '').length
  if (decimals > 2) {
    return { ok: false, reason: `小数位 ${decimals} 位，会计金额通常保留 2 位`, value }
  }
  const canonical = value.toFixed(2)
  return {
    ok: true,
    value,
    canonical,
    normalized: canonical !== text ? `已规范化为 ${canonical}` : '',
    reason: ''
  }
}

export function validateAttachmentCount(raw) {
  const text = String(raw || '').trim()
  if (!text) return { ok: false, reason: '未识别到附件张数', value: null }
  const m = text.match(/(\d{1,3})/)
  if (!m) return { ok: false, reason: `"${text}" 里没有数字`, value: null }
  const value = Number(m[1])
  if (value > 99) return { ok: false, reason: `附件 ${value} 张明显异常`, value }
  return { ok: true, value, normalized: '', reason: '' }
}

// ---------------------------------------------------------------- 会计科目字典

function editDistance(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i += 1) {
    const curr = [i]
    for (let j = 1; j <= n; j += 1) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = curr
  }
  return prev[n]
}

const cleanAccount = (text) => String(text || '').replace(/[\s　]/g, '').replace(/[：:]/g, '')

/**
 * 科目字典匹配。
 * 严格策略：完全相同才自动采纳；编辑距离 1 且长度 ≥3 只作为"候选"列出，
 * 由界面显示"规范化匹配"，不改变识别值。
 */
export function validateAccount(raw, options = {}) {
  const text = cleanAccount(raw)
  if (!text) return { ok: false, reason: '未识别到科目', value: '', candidates: [] }
  const exact = ACCOUNT_ENTRIES.find((item) => item.name === text || (item.aliases || []).some((a) => a === text))
  if (exact) {
    return {
      ok: true,
      value: text,
      account: { code: exact.code, name: exact.name, classId: exact.classId },
      matchType: 'exact',
      normalized: '',
      candidates: [],
      reason: ''
    }
  }
  // 形近候选：长度门槛防止短词乱匹配
  const candidates = ACCOUNT_ENTRIES
    .map((item) => ({ item, distance: editDistance(text, item.name) }))
    .filter((x) => x.distance <= 1 && text.length >= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((x) => ({ code: x.item.code, name: x.item.name, distance: x.distance, classId: x.item.classId }))

  if (options.strict) {
    return {
      ok: false,
      value: text,
      matchType: 'none',
      candidates,
      normalized: '',
      reason: candidates.length ? `与「${candidates[0].name}」相差 ${candidates[0].distance} 个字，未自动采纳` : '不在常用科目表内'
    }
  }
  return {
    ok: candidates.length > 0,
    value: text,
    account: candidates.length ? { code: candidates[0].code, name: candidates[0].name, classId: candidates[0].classId } : null,
    matchType: candidates.length ? 'fuzzy' : 'none',
    // 关键：只给建议，不改 value
    normalized: candidates.length ? `疑似「${candidates[0].name}」（${candidates[0].code}），相差 ${candidates[0].distance} 字` : '',
    candidates,
    reason: candidates.length ? '' : '不在常用科目表内，请人工确认'
  }
}

// ---------------------------------------------------------------- 统一入口

const VALIDATORS = {
  [FIELD_IDS.date]: validateDate,
  [FIELD_IDS.voucherNumber]: validateVoucherNumber,
  [FIELD_IDS.debitAmount]: (raw) => validateAmount(raw),
  [FIELD_IDS.creditAmount]: (raw) => validateAmount(raw),
  [FIELD_IDS.attachmentCount]: validateAttachmentCount,
  [FIELD_IDS.generalAccount]: (raw) => validateAccount(raw),
  [FIELD_IDS.detailAccount]: (raw) => validateAccount(raw)
}

export function runFieldValidation(fieldId, raw, options = {}) {
  const validator = VALIDATORS[fieldId]
  if (!validator) return { ok: Boolean(String(raw || '').trim()), value: raw || '', reason: '', normalized: '' }
  return validator(raw, options)
}

export { editDistance }
