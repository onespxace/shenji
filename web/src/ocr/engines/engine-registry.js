// OCR 引擎统一接口。
//
// 目的：让 PaddleOCR 与 Tesseract 可以互换，管线只认这一个契约。
// 关键约束：引擎只负责"图 → 带坐标的文本行"，**不做任何字段解析**。
// 字段解析统一放在 pipeline/field-extractor.js，避免又回到"整页 OCR 猜列"的老路。

/**
 * @typedef {Object} RecognizedLine
 * @property {string} text        识别文本
 * @property {number} score       引擎给出的原始置信度，0~1
 * @property {number[][]} poly    四点框 [[x,y]x4]，与原图同坐标系
 * @property {number} [x]         外接矩形左上 x（由 poly 推导，便于排序）
 * @property {number} [y]         外接矩形左上 y
 * @property {number} [width]     外接矩形宽
 * @property {number} [height]    外接矩形高
 * @property {number} [cx]        外接矩形中心 x
 * @property {number} [cy]        外接矩形中心 y
 */

/**
 * @typedef {Object} OcrResult
 * @property {string} engine      引擎 id
 * @property {number} width       送入引擎的图片宽
 * @property {number} height      送入引擎的图片高
 * @property {RecognizedLine[]} lines
 * @property {Object} metrics     引擎自报的耗时等
 * @property {Object} runtime     引擎自报的后端等
 */

/**
 * 引擎契约：
 *   id: string
 *   label: string              界面显示名
 *   available(): Promise<boolean>
 *   init(onProgress?): Promise<InitSummary>
 *   recognize(input, onProgress?): Promise<OcrResult>
 *   dispose(): Promise<void>
 *
 * input: { blob, imageData, width, height, lines? }
 *   - blob 用于整图识别
 *   - imageData 用于"只识别某个 ROI"（定向二次识别必须走这条路，
 *     不能靠把整图再跑一遍）
 */

export const ENGINE_IDS = { paddle: 'paddle', tesseract: 'tesseract' }

/** 引擎注册表：管线按 id 取实例 */
const registry = new Map()

export function registerEngine(engine) {
  if (!engine?.id) throw new Error('引擎必须有 id')
  registry.set(engine.id, engine)
  return engine
}

export function getEngine(id) {
  return registry.get(id) || null
}

export function listEngines() {
  return [...registry.values()].map((engine) => ({ id: engine.id, label: engine.label }))
}

/** 外接矩形：DB 检测返回四点框，字段分区需要轴对齐矩形 */
export function polyToRect(poly) {
  if (!Array.isArray(poly) || !poly.length) return { x: 0, y: 0, width: 0, height: 0 }
  const xs = poly.map((p) => Number(p?.[0] ?? 0))
  const ys = poly.map((p) => Number(p?.[1] ?? 0))
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.max(...xs) - x),
    height: Math.round(Math.max(...ys) - y),
    cx: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    cy: Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
  }
}

/** 给识别行补上外接矩形，便于后续按坐标分区 */
export function withRects(lines) {
  return (lines || []).map((line) => {
    const rect = polyToRect(line.poly)
    return { ...line, ...rect }
  })
}

/**
 * 两个框的 IoU，用于把相邻行归并到同一单元格，或判断重复识别。
 */
export function iou(a, b) {
  if (!a || !b) return 0
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x1 || y2 <= y1) return 0
  const inter = (x2 - x1) * (y2 - y1)
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  if (!areaA || !areaB) return 0
  return inter / (areaA + areaB - inter)
}

/** 垂直重叠比例：判断两个框是否在同一行 */
export function verticalOverlap(a, b) {
  if (!a || !b) return 0
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (bottom <= top) return 0
  return (bottom - top) / Math.max(1, Math.min(a.height, b.height))
}
