// 基准测试的测试集与评分口径。Tesseract 基线与新管线共用这一份，保证可比。
//
// 口径声明（对应"不要拿合成数据冒充真实准确率"）：
//   这 4 张图是**渲染合成**的，衡量的是印刷体在退化拍摄条件下的表现。
//   代码与界面里只能写"当前测试集字段识别结果"，不得写成"真实凭证准确率"。
//   真实凭证还叠加手写、印章遮挡、复写纸洇色，表现会更差。

export const BENCHMARK_FIELDS = [
  'date',
  'voucherNumber',
  'summary',
  'generalAccount',
  'detailAccount',
  'debitAmount',
  'creditAmount',
  'attachmentCount',
  'preparer',
  'signature'
]

export const FIELD_LABELS = {
  date: '日期',
  voucherNumber: '凭证编号',
  summary: '摘要',
  generalAccount: '总账科目',
  detailAccount: '明细科目',
  debitAmount: '借方金额',
  creditAmount: '贷方金额',
  attachmentCount: '附件张数',
  preparer: '制单人',
  signature: '责任签名'
}

/** 退化条件分组，统计时分开报，不混成一个总数 */
export const CONDITIONS = {
  clean: '扫描件',
  tilted: '轻微倾斜',
  lowcontrast: '低对比度',
  photo: '手机翻拍',
  compressed: '强压缩',
  occluded: '印章遮挡'
}

/** 每张图的标准答案。needles 里的每一项都必须在该字段的识别值里出现。 */
export const GROUND_TRUTH = {
  'A-scan': {
    condition: 'clean',
    label: 'A 扫描件',
    expect: {
      date: ['2024', '5', '3'],
      voucherNumber: ['001'],
      summary: ['投资'],
      generalAccount: ['银行存款'],
      detailAccount: ['建行基本'],
      debitAmount: ['300000'],
      creditAmount: ['300000'],
      attachmentCount: ['2'],
      preparer: ['张三'],
      signature: ['李四', '王五']
    }
  },
  'B-skew': {
    condition: 'tilted',
    label: 'B 轻微倾斜',
    expect: {
      date: ['2024', '5', '3'],
      voucherNumber: ['001'],
      summary: ['投资'],
      generalAccount: ['银行存款'],
      detailAccount: ['建行基本'],
      debitAmount: ['300000'],
      creditAmount: ['300000'],
      attachmentCount: ['2'],
      preparer: ['张三'],
      signature: ['李四', '王五']
    }
  },
  'C-lowcontrast': {
    condition: 'lowcontrast',
    label: 'C 低对比度',
    expect: {
      date: ['2024', '5', '3'],
      voucherNumber: ['001'],
      summary: ['投资'],
      generalAccount: ['银行存款'],
      detailAccount: ['建行基本'],
      debitAmount: ['300000'],
      creditAmount: ['300000'],
      attachmentCount: ['2'],
      preparer: ['张三'],
      signature: ['李四', '王五']
    }
  },
  'D-photo': {
    condition: 'photo',
    label: 'D 手机翻拍',
    expect: {
      date: ['2024', '5', '3'],
      voucherNumber: ['001'],
      summary: ['投资'],
      generalAccount: ['银行存款'],
      detailAccount: ['建行基本'],
      debitAmount: ['300000'],
      creditAmount: ['300000'],
      attachmentCount: ['2'],
      preparer: ['张三'],
      signature: ['李四', '王五']
    }
  }
}

/** 归一化：容忍 OCR 常见的全角/空格/O0/l1 差异 */
export function normalizeForMatch(text) {
  return String(text || '')
    .replace(/[\s　]/g, '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, '')
    .replace(/[．。]/g, '.')
    .replace(/[O]/g, '0')
    .replace(/[lI|]/g, '1')
    .toLowerCase()
}

/** 数字字段的等价形式：1300000 / 1300000.0 / 1300000.00 视为同一个值 */
function numericVariants(text) {
  const set = new Set([text])
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const num = Number(text)
    if (Number.isFinite(num)) {
      set.add(num.toFixed(2))
      set.add(String(num))
      if (Number.isInteger(num)) set.add(`${num}.00`)
    }
  }
  return set
}

/** 从文本里取出第一个数字，兼容「2张」「附件：2」这类带单位/标签的值 */
function firstNumber(text) {
  const m = String(text || '').match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

/**
 * 单字段判定，两种口径：
 *
 *   'numeric-exact'  整体数值必须相等。用于金额与附件张数——
 *                    不能用子串包含，否则 "1300000.00" 会因为含 "300000" 被判命中。
 *   'contains-all'   所有 needle 都必须出现在识别值里。用于日期（2024/5/3）、
 *                    编号、摘要、科目——这些字段的 needle 是整体的一部分而非全部。
 */
export function scoreFieldValue(fieldId, value, needles, options = {}) {
  const flat = normalizeForMatch(value)
  if (!flat) return { correct: false, reason: '未识别到内容' }
  if (options.mode === 'numeric-exact') {
    const got = firstNumber(flat)
    const want = firstNumber(normalizeForMatch(needles[0]))
    if (got === null || want === null) return { correct: false, reason: `"${value}" 里没有可比对的数字` }
    const hit = Math.abs(got - want) < 1e-9 || numericVariants(flat).has(normalizeForMatch(needles[0]))
    return { correct: hit, reason: hit ? '' : `「${value}」的数字 ${got} ≠ 期望 ${want}` }
  }
  const missing = needles.filter((needle) => !flat.includes(normalizeForMatch(needle)))
  return {
    correct: missing.length === 0,
    reason: missing.length ? `「${value}」缺 ${missing.join('/')}` : ''
  }
}

/**
 * 数字字段必须整体数值相等（避免 "1300000" 命中 "300000" 的假通过）；
 * 其余字段要求所有 needle 都出现。
 */
export const NUMERIC_EXACT_FIELDS = new Set(['debitAmount', 'creditAmount', 'attachmentCount'])

export function matchModeFor(fieldId) {
  return NUMERIC_EXACT_FIELDS.has(fieldId) ? 'numeric-exact' : 'contains-all'
}

/** 签名是"检测存在性"而非"识别姓名"，评分口径不同 */
export const SIGNATURE_FIELDS = new Set(['signature', 'preparer'])

/**
 * 汇总一次运行的得分。
 * @param {Array<{image, condition, engine, fields: {fieldId: {value, correct, reason}}, ms}>} runs
 */
export function aggregate(runs) {
  const byField = {}
  const byCondition = {}
  for (const run of runs) {
    byCondition[run.condition] ||= { correct: 0, total: 0 }
    for (const [fieldId, result] of Object.entries(run.fields)) {
      byField[fieldId] ||= { correct: 0, total: 0 }
      byField[fieldId].total += 1
      byCondition[run.condition].total += 1
      if (result.correct) {
        byField[fieldId].correct += 1
        byCondition[run.condition].correct += 1
      }
    }
  }
  const pct = (bucket) => (bucket.total ? (bucket.correct / bucket.total) * 100 : 0)
  let correct = 0
  let total = 0
  for (const bucket of Object.values(byField)) {
    correct += bucket.correct
    total += bucket.total
  }
  return {
    overall: pct({ correct, total }),
    correct,
    total,
    byField: Object.fromEntries(
      Object.entries(byField).map(([id, b]) => [id, { ...b, pct: pct(b) }])
    ),
    byCondition: Object.fromEntries(
      Object.entries(byCondition).map(([id, b]) => [id, { ...b, pct: pct(b) }])
    ),
    avgMs: runs.length ? Math.round(runs.reduce((s, r) => s + (r.ms || 0), 0) / runs.length) : 0
  }
}

/** 表格输出：字段 | Tesseract | 新管线 | 差值 */
export function formatComparison(baseline, candidate, labels = FIELD_LABELS) {
  const rows = []
  for (const fieldId of BENCHMARK_FIELDS) {
    const a = baseline.byField[fieldId] || { pct: 0, correct: 0, total: 0 }
    const b = candidate.byField[fieldId] || { pct: 0, correct: 0, total: 0 }
    const diff = b.pct - a.pct
    rows.push({
      field: labels[fieldId] || fieldId,
      baseline: `${a.correct}/${a.total}`,
      candidate: `${b.correct}/${b.total}`,
      diff,
      verdict: diff > 0.05 ? 'improved' : diff < -0.05 ? 'regressed' : 'same'
    })
  }
  return {
    rows,
    overall: {
      baseline: baseline.overall,
      candidate: candidate.overall,
      diff: candidate.overall - baseline.overall
    }
  }
}
