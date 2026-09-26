// 责任签名字段：**重新定义任务**。
//
// 依据：PP-OCRv5 官方公开评测对手写中文的识别准确率约 41.7%。
// 也就是说"签名姓名"这件事本身就在能力边界之外，而且：
//   - 手写签名是图像，不是文字；
//   - 就算 OCR 给出字符串，也**不能证明签名人的真实身份**；
//   - 审计上"签了名"和"签的是谁"是两件事，后者必须人工核验。
//
// 因此本模块只输出三种状态：present / absent / uncertain，
// 并且**永远不**把签名文本标为"已确认"。

import { FIELD_IDS } from '../validators/field-validators.js'

export const SIGNATURE_STATES = {
  present: { id: 'present', label: '存在签名', type: 'success' },
  absent: { id: 'absent', label: '未发现签名', type: 'warning' },
  uncertain: { id: 'uncertain', label: '签名区域状态不明', type: 'warning' }
}

/** 人名常见字，用于判断 OCR 出来的到底像不像人名 */
const NAME_CHARS = /^[一-龥·]{2,4}$/
// 明显不是人名的输出（拉丁字母、纯数字）
const NOT_NAME = /[A-Za-z0-9]/

/**
 * 判定签名区状态。
 *
 * @param {object} input
 * @param {Array}  input.rows       全部文本行（用来判断签名区是否被裁掉）
 * @param {object} input.signatureField  field-extractor 产出的 signature 字段
 * @param {number} input.ocrScore   该区域 OCR 分数
 * @returns {{state, label, type, ocrText, namePlausibility, note}}
 */
export function assessSignature({ rows = [], signatureField = null, ocrScore = null } = {}) {
  const anchors = rows.filter((row) => /制\s*单|填制人|审\s*核|复核人|记\s*账/.test(row.text))

  // 连签名栏的锚点都没识别到 → 无法判断区域是否存在
  if (!anchors.length) {
    return {
      state: SIGNATURE_STATES.uncertain.id,
      ...SIGNATURE_STATES.uncertain,
      ocrText: '',
      namePlausibility: null,
      note: '未识别到"制单/审核/记账"等签名栏，可能是照片没拍到凭证下部，或该栏文字被遮挡。'
    }
  }

  const raw = String(signatureField?.value || '').trim()
  if (!raw) {
    return {
      state: SIGNATURE_STATES.absent.id,
      ...SIGNATURE_STATES.absent,
      ocrText: '',
      namePlausibility: null,
      note: '识别到签名栏但后面没有文字，疑似空签。仅能判断"有没有墨迹"，不能判断是谁签的。'
    }
  }

  // 一行里常有多个签名位（审核 + 记账），抽出来会是 "李四 王五"，
  // 要逐个判断像不像人名，不能拿整串去套正则。
  const tokens = raw.split(/[\s　]+/).filter(Boolean)
  const plausible = tokens.length > 0 && tokens.every((t) => NAME_CHARS.test(t) && !NOT_NAME.test(t))
  const joined = tokens.join('、')
  return {
    state: plausible ? SIGNATURE_STATES.present.id : SIGNATURE_STATES.uncertain.id,
    ...(plausible ? SIGNATURE_STATES.present : SIGNATURE_STATES.uncertain),
    ocrText: raw,
    namePlausibility: plausible ? 'looks-like-name' : 'not-a-name',
    ocrScore,
    note: plausible
      ? `OCR 读出「${joined}」。这只能说明该位置有文字，不能证明签名人身份，必须人工核验。`
      : `OCR 读出「${joined}」，不像中文人名，很可能是手写笔画被误读。以"需人工核验"处理。`
  }
}

/** 界面与检查结论统一用这一句，不允许出现"签名：王五（确认）" */
export const SIGNATURE_DISCLAIMER =
  '签名仅做"是否存在/是否异常"检测。OCR 读出的文字不构成身份证明，也不能替代手写笔迹鉴定。'
