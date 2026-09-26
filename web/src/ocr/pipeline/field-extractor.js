// 从带坐标的识别行里抽出结构化字段。
//
// 这是"先定位结构，再识别文字"的关键落点。与旧方案的根本区别：
//   旧：整页 OCR → 拼成一段文本 → 用正则猜哪个是摘要、哪个是金额
//   新：每个文本框自带坐标 → 先按坐标聚成行/列 → 认角色 → 抽字段
//
// 角色判定用**锚点词**而不是列位置猜：凭证上「凭证编号：」后面的框
// 一定是编号，「附件：」后面的一定是张数。这样版式微调不会立刻失效。

import { FIELD_IDS } from '../validators/field-validators.js'
import { verticalOverlap } from '../engines/engine-registry.js'

/** 把识别行按纵向位置聚成文本行（同一行的框可能横向分开） */
export function groupIntoRows(lines, tolerance = 0.6) {
  const sorted = [...(lines || [])].filter((l) => l.text).sort((a, b) => a.cy - b.cy || a.x - b.x)
  const rows = []
  for (const line of sorted) {
    const row = rows.find((r) => verticalOverlap(r, line) >= tolerance)
    if (row) {
      row.lines.push(line)
      // 行框取并集
      const right = Math.max(row.x + row.width, line.x + line.width)
      const bottom = Math.max(row.y + row.height, line.y + line.height)
      row.x = Math.min(row.x, line.x)
      row.y = Math.min(row.y, line.y)
      row.width = right - row.x
      row.height = bottom - row.y
      row.cy = Math.round(row.y + row.height / 2)
    } else {
      rows.push({ x: line.x, y: line.y, width: line.width, height: line.height, cy: line.cy, lines: [line] })
    }
  }
  for (const row of rows) {
    row.lines.sort((a, b) => a.x - b.x)
    row.text = row.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()
    // 行置信度取最低：与逐字段最低置信度的理由一致，一个字错了整行就要复核
    row.score = Math.min(...row.lines.map((l) => l.score))
  }
  return rows.sort((a, b) => a.y - b.y)
}

/**
 * 下一个栏位标签的起点：抽取字段值时必须在这里截断，否则会把后面的栏位一起吞掉。
 *
 * 注意：这里只能放**栏位标签**，绝不能放「张」这类会出现在人名里的字——
 * 一旦放进 `张`，"制单：张三" 会在 `张` 处被截断，制单人就丢了。
 */
const NEXT_LABEL = /制\s*单|填制人|审\s*核|复核人|记\s*账|凭\s*证\s*编\s*号|编\s*号|附\s*件|摘\s*要|合\s*计|借\s*方|贷\s*方|金\s*额/

/** 去掉抽取结果前面的冒号与空白 */
function trimLeadingPunctuation(text) {
  return String(text || '').replace(/^[\s:：、.。]+/, '').trim()
}

/**
 * 从锚点后面取值，遇到下一个栏位标签就截断。
 * 例：行文本 "凭证编号：记字001号 附件：2张" → 编号取 "记字001号"，不会吞掉附件。
 */
function valueAfterAnchor(rowText, anchorText) {
  const rest = rowText.slice(rowText.indexOf(anchorText) + anchorText.length)
  const labelMatch = rest.slice(1).search(NEXT_LABEL)
  const cut = labelMatch === -1 ? rest.length : labelMatch + 1
  return trimLeadingPunctuation(rest.slice(0, cut))
}

/**
 * 用锚点词切字段。
 * anchors: [{ field, re, group }]  re 命中后，capture 指定的组或其后的文本即字段值
 */
const ANCHORS = [
  { field: FIELD_IDS.voucherNumber, re: /凭\s*证\s*编\s*号|编\s*号/ },
  { field: FIELD_IDS.attachmentCount, re: /附\s*件/ },
  { field: FIELD_IDS.date, re: /\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?/ }
]

/** 标题 → 角色。用来把表格列头和字段对上。 */
export const COLUMN_HEADERS = [
  { re: /摘\s*要/, role: 'summary' },
  { re: /总账科目|总帐科目/, role: 'generalAccount' },
  { re: /明细科目/, role: 'detailAccount' },
  { re: /借方金额|借方/, role: 'debitAmount' },
  { re: /贷方金额|贷方/, role: 'creditAmount' },
  { re: /合\s*计/, role: 'total' }
]

/**
 * 主抽取器。
 * @param {Array} lines 引擎返回的带坐标识别行
 * @returns {{ rows, columns, fields }}
 */
export function extractFields(lines) {
  const rows = groupIntoRows(lines)
  const fields = new Map()

  const put = (fieldId, payload) => {
    const existing = fields.get(fieldId)
    // 同一字段多次出现：保留分数高的一次，但记录全部候选
    if (existing) {
      existing.alternatives = [...(existing.alternatives || []), { value: payload.value, score: payload.score, bbox: payload.bbox }]
      if ((payload.score || 0) > (existing.score || 0)) fields.set(fieldId, payload)
      return
    }
    fields.set(fieldId, { field: fieldId, value: '', score: 0, bbox: null, alternatives: [], ...payload })
  }

  // ---- 1) 锚点切分表头区（日期 / 编号 / 附件）----
  for (const row of rows) {
    for (const anchor of ANCHORS) {
      if (fields.has(anchor.field)) continue
      const hit = anchor.re.exec(row.text)
      if (!hit) continue
      const value = anchor.field === FIELD_IDS.date
        ? hit[0].trim()
        : valueAfterAnchor(row.text, hit[0])
      if (!value) continue
      put(anchor.field, { value, score: row.score, bbox: { x: row.x, y: row.y, width: row.width, height: row.height } })
    }
  }

  // ---- 2) 找表头行，建立列角色与列边界 ----
  const headerRow = rows.find((row) => COLUMN_HEADERS.filter((h) => h.re.test(row.text)).length >= 2)
  let columns = []
  if (headerRow) {
    const headed = headerRow.lines
      .map((line) => {
        const header = COLUMN_HEADERS.find((h) => h.re.test(line.text))
        return header ? { role: header.role, x: line.x, cx: line.cx, width: line.width, right: line.x + line.width, headerText: line.text } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x)

    // 列右边界 = 与下一列表头左边缘之间。不能用表头自身的右边缘：
    // 「摘要」两个字很窄，而「收到股东投资款」远宽于它，按表头宽度会漏掉整列内容。
    headed.forEach((column, index) => {
      const next = headed[index + 1]
      column.spanTo = next ? next.x - 1 : Number.POSITIVE_INFINITY
    })
    columns = headed
  }

  // ---- 3) 按列角色把表体行归类 ----
  if (columns.length) {
    const bodyRows = rows.filter((row) => row !== headerRow && row.y > headerRow.y)
    const bodyBottom = bodyRows.length ? Math.max(...bodyRows.map((r) => r.y + r.height)) : Infinity

    // 明细科目行：优先用科目字典判定；没有列时退回"按字典扫全页"
    const entryRows = bodyRows.filter((row) => !/合\s*计/.test(row.text))
    const totalRows = bodyRows.filter((row) => /合\s*计/.test(row.text))

    for (const row of entryRows) {
      for (const column of columns) {
        const cell = pickCell(row, column)
        if (!cell) continue
        if (column.role === 'summary' && !fields.has(FIELD_IDS.summary)) {
          put(FIELD_IDS.summary, { value: cell.text, score: cell.score, bbox: cell.bbox })
        }
        if (column.role === 'generalAccount') {
          const current = fields.get(FIELD_IDS.generalAccount)
          if (!current || !current.value) put(FIELD_IDS.generalAccount, { value: cell.text, score: cell.score, bbox: cell.bbox })
        }
        if (column.role === 'detailAccount') {
          const current = fields.get(FIELD_IDS.detailAccount)
          if (!current || !current.value) put(FIELD_IDS.detailAccount, { value: cell.text, score: cell.score, bbox: cell.bbox })
        }
        if (column.role === 'debitAmount' && /[\d]/.test(cell.text)) {
          put(FIELD_IDS.debitAmount, { value: cell.text, score: cell.score, bbox: cell.bbox })
        }
        if (column.role === 'creditAmount' && /[\d]/.test(cell.text)) {
          put(FIELD_IDS.creditAmount, { value: cell.text, score: cell.score, bbox: cell.bbox })
        }
      }
    }

    // 合计行优先：借贷平衡要靠它
    for (const row of totalRows) {
      for (const column of columns) {
        if (!['debitAmount', 'creditAmount'].includes(column.role)) continue
        const cell = pickCell(row, column)
        if (!cell || !/[\d]/.test(cell.text)) continue
        const fieldId = column.role === 'debitAmount' ? FIELD_IDS.debitAmount : FIELD_IDS.creditAmount
        const current = fields.get(fieldId)
        // 合计行的分数若不低于分录行，就用合计行（它才是表尾真值）
        if (!current || cell.score >= current.score) put(fieldId, { value: cell.text, score: cell.score, bbox: cell.bbox })
      }
    }
    void bodyBottom
  }

  // ---- 4) 签名区：只判定"有没有"，不判定"是谁" ----
  // 锚点用正则而非纯字符串：`记账凭证`（凭证标题）里也含「记账」，
  // 用纯字符串匹配会把标题当成签名栏，凭空读出一个叫「凭证」的签名。
  const signatureAnchors = [
    { re: /制\s*单\s*[:：]?/, label: '制单', field: FIELD_IDS.preparer },
    { re: /填制人\s*[:：]?/, label: '填制人', field: FIELD_IDS.preparer },
    { re: /审\s*核\s*[:：]?/, label: '审核', field: FIELD_IDS.signature },
    { re: /复核人\s*[:：]?/, label: '复核人', field: FIELD_IDS.signature },
    // 负向前瞻排除「记账凭证」标题
    { re: /记\s*账(?![\u4e00-\u9fa5])\s*[:：]?/, label: '记账', field: FIELD_IDS.signature }
  ]
  for (const row of rows) {
    for (const anchor of signatureAnchors) {
      const labelMatch = anchor.re.exec(row.text)
      if (!labelMatch) continue
      const name = valueAfterAnchor(row.text, labelMatch[0])
      if (!name && fields.get(anchor.field)?.value) continue
      const target = anchor.field
      const existing = fields.get(target)
      if (existing?.value) {
        // 多个签名位：把 OCR 文本累积起来，但"人名是否可信"由 signature.js 另判
        if (name) existing.value = `${existing.value} ${name}`.trim()
        existing.anchors = [...(existing.anchors || []), anchor.label]
        existing.score = Math.min(existing.score, row.score)
        continue
      }
      put(target, {
        value: name,
        score: row.score,
        bbox: { x: row.x, y: row.y, width: row.width, height: row.height },
        anchors: [anchor.label]
      })
    }
  }

  return { rows, columns, fields }
}

/**
 * 取出某一行里属于指定列的文本框。
 * 归属按**左边缘**落在 [列左边界, 下一列左边界) 判定：
 * 文本框可以比表头宽得多（表头两个字，单元格七个字），按中心点或表头宽度都会漏。
 */
function pickCell(row, column) {
  const candidates = row.lines.filter((line) => line.x >= column.x - COLUMN_TOLERANCE && line.x < column.spanTo)
  if (!candidates.length) return null
  const box = candidates.reduce(
    (acc, line) => {
      const right = Math.max(acc.x + acc.width, line.x + line.width)
      const bottom = Math.max(acc.y + acc.height, line.y + line.height)
      acc.x = Math.min(acc.x, line.x)
      acc.y = Math.min(acc.y, line.y)
      acc.width = right - acc.x
      acc.height = bottom - acc.y
      return acc
    },
    { x: Infinity, y: Infinity, width: 0, height: 0 }
  )
  return {
    text: candidates.map((l) => l.text).join('').trim(),
    score: Math.min(...candidates.map((l) => l.score)),
    bbox: box
  }
}

const COLUMN_TOLERANCE = 8

export function fieldList(fields) {
  return [...fields.values()]
}
