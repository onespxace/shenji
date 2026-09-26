// 字段级"识别可靠度"模型。
//
// 明确声明：这**不是**统计意义上的正确概率，界面必须叫"识别可靠度"。
// 它是四个可解释子分的加权组合，权重与阈值全部可配置：
//
//   ocrScore            引擎自报分数（取该字段所有匹配词的最低值）
//   formatValidation    格式是否合法（日期真实存在、金额小数位、编号有数字）
//   dictionaryMatch     科目是否命中字典
//   contextConsistency  与上下文是否自洽（借贷是否相等、签名位是否为空）
//   multiPassConsistency 多次识别是否一致（有定向重识别时才非空）
//
// 设计取舍：宁可低估不可高估。任何一项"无法判断"都记为 null，
// 计算时按 0.5 计入并降低 overall——而不是当成满分。

import { FIELD_LABELS, FIELD_IDS } from '../validators/field-validators.js'

export const DEFAULT_WEIGHTS = {
  ocrScore: 0.4,
  formatValidation: 0.25,
  dictionaryMatch: 0.15,
  contextConsistency: 0.2
}

export const DEFAULT_THRESHOLDS = { reliable: 0.85, review: 0.6 }

export const RELIABILITY_BANDS = [
  { id: 'reliable', min: 0.85, label: '可靠', type: 'success' },
  { id: 'review', min: 0.6, label: '建议核对', type: 'warning' },
  { id: 'manual', min: 0, label: '需要人工复核', type: 'danger' }
]

const UNKNOWN = 0.5

/** 走科目字典的字段：这些字段缺字典证据时必须扣分 */
const ACCOUNT_LIKE = new Set([FIELD_IDS.generalAccount, FIELD_IDS.detailAccount])

function bandOf(score, thresholds) {
  if (score >= thresholds.reliable) return 'reliable'
  if (score >= thresholds.review) return 'review'
  return 'manual'
}

/**
 * 给一个字段算可靠度。
 * @param {object} field 来自 field-extractor 的字段
 * @param {object} context { validation, contextScore, passes, thresholds, weights }
 * @returns {object} 附加 reliability / band / reasons
 */
export function scoreField(field, context = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(context.weights || {}) }
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(context.thresholds || {}) }
  const validation = context.validation || {}
  const reasons = []

  const parts = { ocrScore: UNKNOWN, formatValidation: null, dictionaryMatch: null, contextConsistency: null, multiPassConsistency: null }

  const ocr = typeof field.score === 'number' && field.score > 0 ? field.score : null
  if (ocr === null) {
    reasons.push('没有 OCR 置信度，按未知处理')
    // 不能把这个项从加权里删掉：删掉等于"缺证据 = 不扣分"，
    // 方向正好反了——没有置信度恰恰是最不可信的情况。
    parts.ocrScore = UNKNOWN
  } else {
    parts.ocrScore = ocr
  }

  let format = null
  if (validation.reason) {
    parts.formatValidation = 0
    reasons.push(`格式校验未通过：${validation.reason}`)
  } else if (validation.ok) {
    parts.formatValidation = 1
  } else {
    // 没做校验不等于通过：按未知计入，权重照算
    parts.formatValidation = UNKNOWN
    reasons.push('未做格式校验')
  }

  let dictionary = null
  if (validation.matchType === 'exact') {
    dictionary = 1
  } else if (validation.matchType === 'fuzzy') {
    // 形近只给 0.6：明确低于"可靠"，逼用户看一眼，但不至于判死刑
    dictionary = 0.6
    reasons.push(`科目为形近匹配，未自动采纳：${validation.normalized || '与字典项不完全一致'}`)
  } else if (validation.matchType === 'none') {
    dictionary = 0.2
    reasons.push(validation.reason || '不在科目字典内')
  }
  // 科目类字段没跑字典匹配时按未知计入，权重照算（缺证据不等于没风险）
  if (dictionary === null && ACCOUNT_LIKE.has(field.field)) parts.dictionaryMatch = UNKNOWN

  const contextScore = typeof context.contextScore === 'number' ? context.contextScore : null
  if (contextScore !== null && contextScore < 1) {
    reasons.push(context.contextReason || '与上下文不一致')
  }
  // 「不适用」和「未知」必须分开：
  //   未知 = 有这项检查但没结论 → 按 0.5 计入并扣分；
  //   不适用 = 这类字段根本没有上下文约束（如制单人）→ 不进加权，否则白白扣分。
  const contextApplicable = context.contextApplicable !== false
  parts.contextConsistency = !contextApplicable ? null : contextScore === null ? UNKNOWN : contextScore

  // 多遍一致性：有重识别结果才算
  let consistency = null
  const passes = context.passes || []
  if (passes.length >= 2) {
    const distinct = new Set(passes.map((p) => normalizeForCompare(p, field.field)))
    consistency = distinct.size === 1 ? 1 : 0.4
    if (distinct.size !== 1) reasons.push(`多次识别结果不一致：${[...distinct].join(' / ')}`)
  }

  const parts2 = parts
  let total = 0
  let weightUsed = 0
  for (const [key, weight] of Object.entries(weights)) {
    if (key === 'multiPassConsistency') continue
    if (key === 'contextConsistency' && parts2[key] === null) continue // 不适用，跳过
    // 其余子分：未知记 UNKNOWN，权重一律计入——
    // 少算一项权重就等于"没证据 = 不扣分"，会把不可信字段抬成可靠。
    const value = parts2[key] === null || parts2[key] === undefined ? UNKNOWN : parts2[key]
    total += value * weight
    weightUsed += weight
  }
  if (consistency !== null) {
    total += consistency * (weights.multiPassConsistency ?? 0.1)
    weightUsed += weights.multiPassConsistency ?? 0.1
  }

  const reliability = weightUsed > 0 ? round3(total / weightUsed) : 0

  // 形近科目必须封顶在"可靠"之下。
  // 只调 dictionary 权重是不够的：ocr=0.9、format=1、context=1 时
  // 加权平均仍能到 0.90（高于 0.85 阈值），于是"没被证实的科目"被标成可靠——
  // 这正是"禁止无证据幻觉"要防的事。封顶是硬约束，不靠调参碰运气。
  const unverifiedDictionary = validation.matchType === 'fuzzy' || validation.matchType === 'none'
  const capped = unverifiedDictionary ? Math.min(reliability, thresholds.reliable - 0.01) : reliability
  const band = bandOf(capped, thresholds)
  return {
    ...field,
    label: FIELD_LABELS[field.field] || field.field,
    reliability: capped,
    band,
    bandLabel: RELIABILITY_BANDS.find((b) => b.id === band)?.label || '需要人工复核',
    parts,
    dictionaryCapped: unverifiedDictionary,
    // 去重：同一条原因被多个子分报告时只留一条，界面上重复三遍等于没说清
    reasons: [...new Set(reasons)]
  }
}

function normalizeForCompare(value, fieldId) {
  const text = String(value ?? '').replace(/\s+/g, '').toLowerCase()
  if (fieldId === FIELD_IDS.date) return text.replace(/[-/.年]/g, '')
  if (fieldId === FIELD_IDS.debitAmount || fieldId === FIELD_IDS.creditAmount) return text.replace(/[,，\s]/g, '')
  return text
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

/** 汇总：整体可靠度取关键字段的最低值，而不是平均。
 *  理由与逐字段取最低一致——一个关键字段错，整张凭证就不能算"可靠"。 */
export function summarize(fields, options = {}) {
  const critical = options.criticalFields || [FIELD_IDS.date, FIELD_IDS.voucherNumber, FIELD_IDS.debitAmount, FIELD_IDS.creditAmount]
  const scored = fields.filter((f) => typeof f.reliability === 'number')
  const criticalFields = scored.filter((f) => critical.includes(f.field))
  const overall = criticalFields.length
    ? Math.min(...criticalFields.map((f) => f.reliability))
    : scored.length
      ? Math.min(...scored.map((f) => f.reliability))
      : 0
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) }
  const needsManual = scored.filter((f) => f.band === 'manual').map((f) => f.label)
  const needsReview = scored.filter((f) => f.band === 'review').map((f) => f.label)
  return {
    overall: round3(overall),
    band: bandOf(overall, thresholds),
    needsManual,
    needsReview,
    disclaimer: '识别可靠度是多因子加权评分，不是统计概率。签名与手写内容不在可靠识别范围内。'
  }
}

export { bandOf }
