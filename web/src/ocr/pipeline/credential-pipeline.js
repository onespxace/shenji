// 凭证结构化识别管线。
//
// 流程（对应"先定位结构，再识别文字"）：
//   图片 → 质量闸门 → 引擎识别(带坐标) → 行/列聚类 → 字段抽取
//        → 字段格式校验 → 签名专项判定 → 可靠度评分 → 定向重识别 → 汇总
//
// 三条不可让步的规则：
//   1. 定向重识别只跑低可靠字段的 ROI，绝不整页重跑；
//   2. 校验器只给建议不改值（见 field-validators.js 顶部铁律）；
//   3. 签名只判存在性，不判身份。

import { assessQuality } from '../../lib/ocr-quality.js'
import { extractFields, groupIntoRows, fieldList } from './field-extractor.js'
import { runFieldValidation, FIELD_IDS, FIELD_LABELS } from '../validators/field-validators.js'
import { assessSignature, SIGNATURE_DISCLAIMER } from '../validators/signature.js'
import { scoreField, summarize, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from '../confidence/reliability.js'
import { getEngine, ENGINE_IDS } from '../engines/engine-registry.js'
import { disposePaddle } from '../engines/paddle-engine.js'
import { disposeTesseract } from '../engines/tesseract-engine.js'

export { ENGINE_IDS }

const CRITICAL_FIELDS = [FIELD_IDS.date, FIELD_IDS.voucherNumber, FIELD_IDS.debitAmount, FIELD_IDS.creditAmount]

/** 只有这些字段值得做二次识别：纯文本摘要与签名重跑收益低、风险高 */
const RE_RECOGNIZABLE = [FIELD_IDS.summary, FIELD_IDS.generalAccount, FIELD_IDS.detailAccount, FIELD_IDS.date, FIELD_IDS.voucherNumber, FIELD_IDS.attachmentCount]

/** 把 File 解码成可重复取样的 ImageData，同时跑质量闸门 */
async function loadImage(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const quality = assessQuality(toGray(imageData), width, height)
  if (typeof bitmap.close === 'function') bitmap.close()
  return { imageData, width, height, quality, canvas }
}

function toGray(imageData) {
  const gray = new Uint8Array(imageData.width * imageData.height)
  for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
    gray[p] = (imageData.data[i] * 299 + imageData.data[i + 1] * 587 + imageData.data[i + 2] * 114) / 1000
  }
  return gray
}

/**
 * 主入口。
 *
 * @param {File|Blob} file
 * @param {object} options
 * @param {string} options.engine        'paddle' | 'tesseract'
 * @param {boolean} options.reRecognize  是否对低可靠字段做定向重识别
 * @param {number} options.reRecognizeLimit 最多重识别几个字段（控耗时）
 * @param {object} options.thresholds    可靠度阈值
 * @param {function} options.onProgress
 */
export async function processCredential(file, options = {}) {
  const started = performance.now()
  const engineId = options.engine || ENGINE_IDS.paddle
  const onProgress = options.onProgress || (() => {})
  const warnings = []

  onProgress({ progress: 0.03, status: '正在检查拍摄质量' })
  const { imageData, width, height, quality, canvas } = await loadImage(file)

  if (quality.level === 'poor' && !options.forceWhenPoor) {
    warnings.push(`图片质量不足（${quality.score} 分）：${quality.reasons.join('；')}。继续识别可能造成字段缺失。`)
  }

  const engine = getEngine(engineId)
  if (!engine) throw new Error(`未注册的 OCR 引擎：${engineId}`)

  onProgress({ progress: 0.1, status: '正在加载识别模型' })
  await engine.init(onProgress)

  onProgress({ progress: 0.2, status: '正在定位文字区域' })
  const ocrResult = await engine.recognize(
    engineId === ENGINE_IDS.paddle ? { imageData, width, height, options: { backend: options.backend } } : { imageData, width, height },
    onProgress
  )

  onProgress({ progress: 0.6, status: '正在抽取凭证字段' })
  const { rows, columns, fields: rawFields } = extractFields(ocrResult.lines)

  // ---- 字段校验 + 首轮可靠度 ----
  const firstPass = new Map()
  for (const [fieldId, field] of rawFields) {
    if (fieldId === FIELD_IDS.preparer || fieldId === FIELD_IDS.signature) continue
    const validation = runFieldValidation(fieldId, field.value)
    firstPass.set(fieldId, { field, validation, passes: [field.value] })
  }

  // ---- 借贷一致性：给金额字段一个上下文分 ----
  const balance = assessBalance(firstPass)

  // ---- 定向二次识别：只跑低可靠的 ----
  let reRecognized = 0
  if (options.reRecognize !== false) {
    const candidates = [...firstPass.entries()]
      .filter(([id, item]) => RE_RECOGNIZABLE.includes(id))
      .filter(([, item]) => shouldReRecognize(item, options.thresholds))
      .slice(0, options.reRecognizeLimit ?? 3)

    for (const [fieldId, item] of candidates) {
      const roi = item.field.bbox
      if (!roi || roi.width < 4 || roi.height < 4) continue
      onProgress({ progress: 0.65 + reRecognized * 0.05, status: `正在重新识别${FIELD_LABELS[fieldId] || fieldId}` })
      try {
        const retry = await engine.recognize(
          engineId === ENGINE_IDS.paddle
            ? { lines: [{ ...roi, roiId: fieldId }], imageData, width, height }
            : { blob: await cropBlob(canvas, roi), width: roi.width, height: roi.height, roiOffset: roi, lines: [{ ...roi, roiId: fieldId }] },
          () => {}
        )
        const texts = retry.lines.map((l) => l.text).join('').trim()
        if (texts) {
          item.passes.push(texts)
          // 只在重识别分数更高时替换，且必须真的不同才替换
          const better = retry.lines.reduce((m, l) => Math.min(m, l.score), 1)
          if (better > item.field.score && texts !== item.field.value) {
            item.field = { ...item.field, value: texts, score: better, bbox: roi, reRecognized: true }
          }
        }
        reRecognized += 1
      } catch (error) {
        warnings.push(`${FIELD_LABELS[fieldId] || fieldId} 二次识别失败：${error.message || error}`)
      }
    }
  }

  // ---- 最终字段 + 可靠度 ----
  const scored = []
  for (const [fieldId, item] of firstPass) {
    const validation = runFieldValidation(fieldId, item.field.value)
    const contextScore = contextScoreFor(fieldId, validation, balance)
    scored.push(
      scoreField(item.field, {
        validation,
        contextScore: contextScore.score,
        contextReason: contextScore.reason,
        contextApplicable: contextScore.applicable,
        passes: item.passes,
        thresholds: options.thresholds,
        weights: options.weights
      })
    )
  }

  // ---- 签名：只判存在性 ----
  const signature = assessSignature({ rows, signatureField: rawFields.get(FIELD_IDS.signature), ocrScore: rawFields.get(FIELD_IDS.signature)?.score })
  const preparerField = rawFields.get(FIELD_IDS.preparer)
  if (preparerField) {
    const validation = runFieldValidation(FIELD_IDS.preparer, preparerField.value)
    scored.push(
      scoreField({ ...preparerField, field: FIELD_IDS.preparer, name: '制单/填制人' }, { validation, passes: [preparerField.value], thresholds: options.thresholds, weights: options.weights })
    )
  }

  const summary = summarize(scored, { criticalFields: CRITICAL_FIELDS, thresholds: options.thresholds })

  onProgress({ progress: 1, status: '识别完成' })
  return {
    engine: engineId,
    image: { width, height, canvas, imageData },
    fields: scored,
    cells: buildCells(rows, columns),
    rows,
    quality,
    balance,
    signature,
    signatureNote: SIGNATURE_DISCLAIMER,
    summary,
    warnings,
    reRecognized,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) },
    weights: { ...DEFAULT_WEIGHTS, ...(options.weights || {}) },
    processingTime: Math.round(performance.now() - started),
    engineMetrics: ocrResult.metrics,
    engineRuntime: ocrResult.runtime
  }
}

/** 借贷是否相等：给金额字段一个上下文分 */
function assessBalance(firstPass) {
  const debit = firstPass.get(FIELD_IDS.debitAmount)
  const credit = firstPass.get(FIELD_IDS.creditAmount)
  const dv = debit?.validation?.value
  const cv = credit?.validation?.value
  if (typeof dv !== 'number' || typeof cv !== 'number') {
    return { state: 'unknown', difference: null, reason: '借贷金额至少一侧缺失，无法校验' }
  }
  const difference = Math.round((dv - cv) * 100) / 100
  return {
    state: Math.abs(difference) < 0.005 ? 'balanced' : 'unbalanced',
    difference,
    debit: dv,
    credit: cv,
    reason: Math.abs(difference) < 0.005 ? '' : `借方 ${dv} 与贷方 ${cv} 相差 ${difference}`
  }
}

function contextScoreFor(fieldId, validation, balance) {
  if (!validation.ok) return { score: 0, reason: validation.reason, applicable: true }
  // 只有金额类字段有上下文约束（借贷是否相等）
  const applicable = fieldId === FIELD_IDS.debitAmount || fieldId === FIELD_IDS.creditAmount
  if (!applicable) return { score: null, reason: '', applicable: false }
  if (balance.state === 'unbalanced') return { score: 0.4, reason: balance.reason, applicable: true }
  if (balance.state === 'unknown') return { score: 0.8, reason: balance.reason, applicable: true }
  return { score: 1, reason: '', applicable: true }
}

function shouldReRecognize(item, thresholds) {
  const t = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) }
  const base = item.field.score ?? 0
  const bad = !item.validation.ok
  // 只有"分数低"或"格式非法"才值得重跑；分数高且格式合法的不浪费算力
  return base < t.reliable || bad
}

/** 单元格视图：便于前端把问题高亮到具体格子 */
function buildCells(rows, columns) {
  const cells = []
  for (const row of rows) {
    for (const line of row.lines) {
      const column = columns.find((c) => line.x >= c.x - 8 && line.x < c.spanTo)
      cells.push({
        bbox: { x: line.x, y: line.y, width: line.width, height: line.height },
        row: row.y,
        column: column?.role || null,
        columnHeader: column?.headerText || null,
        text: line.text,
        confidence: line.score
      })
    }
  }
  return cells
}

async function cropBlob(canvas, rect) {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(rect.width))
  out.height = Math.max(1, Math.round(rect.height))
  out.getContext('2d').drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height)
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'))
}

/** 释放全部引擎资源 */
export async function disposeAllEngines() {
  await disposePaddle()
  await disposeTesseract()
}

export { groupIntoRows, fieldList }
