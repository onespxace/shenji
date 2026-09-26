// 凭证结构化识别管线的断言。
//
// 这些是纯函数部分：字段抽取、格式校验、签名判定、可靠度评分、基准口径。
// 引擎调用（真跑 ONNX）由 /ocr-benchmark.html 在浏览器里验证，不在这里跑。
import process from 'node:process'
import { groupIntoRows, extractFields, COLUMN_HEADERS } from '../src/ocr/pipeline/field-extractor.js'
import {
  FIELD_IDS,
  FIELD_LABELS as FIELD_LABELS_ALL,
  validateAccount,
  validateAmount,
  validateAttachmentCount,
  validateDate,
  validateVoucherNumber,
  parseAmount,
  editDistance,
  runFieldValidation
} from '../src/ocr/validators/field-validators.js'
import { assessSignature, SIGNATURE_STATES, SIGNATURE_DISCLAIMER } from '../src/ocr/validators/signature.js'
import { scoreField, summarize, DEFAULT_THRESHOLDS, bandOf } from '../src/ocr/confidence/reliability.js'
import { polyToRect, iou, verticalOverlap } from '../src/ocr/engines/engine-registry.js'
import {
  BENCHMARK_FIELDS,
  CONDITIONS,
  NUMERIC_EXACT_FIELDS,
  matchModeFor,
  SIGNATURE_FIELDS,
  GROUND_TRUTH,
  aggregate,
  formatComparison,
  normalizeForMatch,
  scoreFieldValue
} from '../src/ocr/benchmark/benchmark-spec.js'
import { analyzeGray, assessQuality } from '../src/lib/ocr-quality.js'

const results = []
const check = (name, condition, detail = '') => results.push({ name, passed: Boolean(condition), detail })

// ---------------- 几何工具 ----------------

check('四点框转外接矩形', (() => {
  const r = polyToRect([[10, 20], [110, 20], [110, 60], [10, 60]])
  return r.x === 10 && r.y === 20 && r.width === 100 && r.height === 40
})())
check('空框不抛错', (() => { try { polyToRect(null); return true } catch { return false } })())
check('IoU 对完全重合为 1', Math.abs(iou({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 }) - 1) < 1e-9)
check('IoU 对不相交为 0', iou({ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 50, width: 10, height: 10 }) === 0)
check('垂直重叠计算正确', Math.abs(verticalOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 5, width: 10, height: 10 }) - 0.5) < 1e-9, String(verticalOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 5, width: 10, height: 10 })))
check('垂直不重叠为 0', verticalOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 40, width: 10, height: 10 }) === 0)

// ---------------- 行聚类 ----------------

// 构造一行内被横向拆开的三个框 + 下一行
const rowLines = [
  { text: '凭证编号', score: 0.9, x: 10, y: 100, width: 80, height: 20, cy: 110, cx: 50 },
  { text: '记字001号', score: 0.95, x: 95, y: 101, width: 90, height: 20, cy: 111, cx: 140 },
  { text: '附件', score: 0.9, x: 300, y: 100, width: 40, height: 20, cy: 110, cx: 320 },
  { text: '2张', score: 0.88, x: 345, y: 101, width: 40, height: 20, cy: 111, cx: 365 },
  { text: '300000.00', score: 0.99, x: 10, y: 160, width: 100, height: 20, cy: 170, cx: 60 }
]
const clustered = groupIntoRows(rowLines)
check('同高度横向框聚成一行', clustered.length === 2, `得到 ${clustered.length} 行`)
check('行文本按 x 排序拼接', clustered[0].text.startsWith('凭证编号 记字001号'), clustered[0].text)
check('行置信度取最低值', Math.abs(clustered[0].score - 0.88) < 1e-9, String(clustered[0].score))
check('行框取并集', clustered[0].width >= 375, String(clustered[0].width))
check('空输入不抛错', (() => { try { groupIntoRows([]); return true } catch { return false } })())
check('行聚类结果按 y 升序', clustered.every((r, i) => i === 0 || clustered[i - 1].y <= r.y))

// ---------------- 字段抽取（含表头锚点与列边界） ----------------

// 复现真实 PaddleOCR 输出：表头窄、单元格宽，摘要必须仍能抽到
const tableLines = [
  // 表头行
  { text: '摘要', score: 1, x: 60, y: 160, width: 40, height: 22, cy: 171, cx: 80 },
  { text: '总账科目', score: 1, x: 220, y: 160, width: 80, height: 22, cy: 171, cx: 260 },
  { text: '明细科目', score: 1, x: 340, y: 160, width: 80, height: 22, cy: 171, cx: 380 },
  { text: '借方金额', score: 1, x: 460, y: 160, width: 80, height: 22, cy: 171, cx: 500 },
  { text: '贷方金额', score: 1, x: 580, y: 160, width: 80, height: 22, cy: 171, cx: 620 },
  // 表体第 1 行：摘要单元格远宽于表头
  { text: '收到股东投资款', score: 1, x: 60, y: 190, width: 150, height: 22, cy: 201, cx: 135 },
  { text: '银行存款', score: 1, x: 220, y: 190, width: 80, height: 22, cy: 201, cx: 260 },
  { text: '建行基本户', score: 0.95, x: 340, y: 190, width: 90, height: 22, cy: 201, cx: 385 },
  { text: '300000.00', score: 1, x: 460, y: 190, width: 100, height: 22, cy: 201, cx: 510 },
  { text: '300000.00', score: 1, x: 580, y: 190, width: 100, height: 22, cy: 201, cx: 630 },
  // 合计行
  { text: '合计', score: 0.9, x: 60, y: 250, width: 40, height: 22, cy: 261, cx: 80 },
  { text: '300000.00', score: 1, x: 460, y: 250, width: 100, height: 22, cy: 261, cx: 510 },
  { text: '300000.00', score: 1, x: 580, y: 250, width: 100, height: 22, cy: 261, cx: 630 }
]
// 表头区
const headerArea = [
  { text: '记账凭证', score: 1, x: 400, y: 40, width: 100, height: 28, cy: 54, cx: 450 },
  { text: '2024年5月3日', score: 1, x: 60, y: 100, width: 110, height: 20, cy: 110, cx: 115 },
  { text: '凭证编号：记字001号', score: 1, x: 200, y: 100, width: 160, height: 20, cy: 110, cx: 280 },
  { text: '附件：2张', score: 1, x: 400, y: 100, width: 90, height: 20, cy: 110, cx: 445 },
  { text: '制单：张三', score: 0.95, x: 60, y: 300, width: 90, height: 20, cy: 310, cx: 105 },
  { text: '审核：李四', score: 0.95, x: 250, y: 300, width: 90, height: 20, cy: 310, cx: 295 },
  { text: '记账：王五', score: 0.98, x: 440, y: 300, width: 90, height: 20, cy: 310, cx: 485 }
]
const extracted = extractFields([...headerArea, ...tableLines])
const f = extracted.fields

check('抽到日期', f.get(FIELD_IDS.date)?.value === '2024年5月3日', f.get(FIELD_IDS.date)?.value)
check('抽到凭证编号', f.get(FIELD_IDS.voucherNumber)?.value === '记字001号', f.get(FIELD_IDS.voucherNumber)?.value)
check('抽到附件张数', f.get(FIELD_IDS.attachmentCount)?.value === '2张', f.get(FIELD_IDS.attachmentCount)?.value)
// 这是本次修的核心 bug：摘要单元格(150px)远宽于表头「摘要」(40px)
check('摘要列能抽到（单元格宽于表头）', f.get(FIELD_IDS.summary)?.value === '收到股东投资款', f.get(FIELD_IDS.summary)?.value)
check('总账科目抽到银行存款', f.get(FIELD_IDS.generalAccount)?.value === '银行存款', f.get(FIELD_IDS.generalAccount)?.value)
check('明细科目抽到建行基本户', f.get(FIELD_IDS.detailAccount)?.value === '建行基本户', f.get(FIELD_IDS.detailAccount)?.value)
check('借方金额抽到', f.get(FIELD_IDS.debitAmount)?.value === '300000.00', f.get(FIELD_IDS.debitAmount)?.value)
check('贷方金额抽到', f.get(FIELD_IDS.creditAmount)?.value === '300000.00', f.get(FIELD_IDS.creditAmount)?.value)
check('制单人抽到张三', f.get(FIELD_IDS.preparer)?.value === '张三', f.get(FIELD_IDS.preparer)?.value)
check('签名累积到李四与王五', /李四/.test(f.get(FIELD_IDS.signature)?.value || '') && /王五/.test(f.get(FIELD_IDS.signature)?.value || ''), f.get(FIELD_IDS.signature)?.value)
check('识别出 5 个列角色', extracted.columns.length === 5, String(extracted.columns.length))
check('列角色映射正确', JSON.stringify(extracted.columns.map((c) => c.role)) === JSON.stringify(['summary', 'generalAccount', 'detailAccount', 'debitAmount', 'creditAmount']), JSON.stringify(extracted.columns.map((c) => c.role)))
check('列边界按下一表头左边缘划分', extracted.columns[0].spanTo === 219, String(extracted.columns[0].spanTo))
check('最后一列右边界为无穷', extracted.columns[4].spanTo === Number.POSITIVE_INFINITY)
check('每个字段都带 bbox', [...f.values()].every((v) => v.bbox && typeof v.bbox.x === 'number'), '有字段缺 bbox')
check('表头 6 种角色都有定义', COLUMN_HEADERS.length === 6, String(COLUMN_HEADERS.length))
check('空输入不抛错', (() => { try { extractFields([]); return true } catch { return false } })())
check('无表头时退回不崩', (() => { try { extractFields([{ text: '随便', score: 0.9, x: 0, y: 0, width: 50, height: 20, cy: 10, cx: 25 }]); return true } catch { return false } })())

// 同一字段出现两次（分录行 + 合计行）且后者分数更高时，不能丢掉 field 键。
// 踩过的坑：用裸 payload 覆盖 → field 变 undefined → 界面标签渲染成空。
// 注意表头必须 ≥2 个才会走表格分支，所以这里给全 5 列。
const dupLines = [
  { text: '摘要', score: 1, x: 60, y: 160, width: 40, height: 22, cy: 171, cx: 80 },
  { text: '总账科目', score: 1, x: 220, y: 160, width: 80, height: 22, cy: 171, cx: 260 },
  { text: '明细科目', score: 1, x: 340, y: 160, width: 80, height: 22, cy: 171, cx: 380 },
  { text: '借方金额', score: 1, x: 460, y: 160, width: 80, height: 22, cy: 171, cx: 500 },
  { text: '贷方金额', score: 1, x: 580, y: 160, width: 80, height: 22, cy: 171, cx: 620 },
  { text: '银行存款', score: 0.9, x: 220, y: 190, width: 80, height: 22, cy: 201, cx: 260 },
  { text: '300000.00', score: 0.9, x: 460, y: 190, width: 100, height: 22, cy: 201, cx: 510 },
  { text: '合计', score: 1, x: 60, y: 250, width: 40, height: 22, cy: 261, cx: 80 },
  { text: '300000.00', score: 0.99, x: 460, y: 250, width: 100, height: 22, cy: 261, cx: 510 }
]
const dup = extractFields(dupLines)
const dupDebit = dup.fields.get(FIELD_IDS.debitAmount)
check('重复字段仍保留 field 键', dupDebit?.field === FIELD_IDS.debitAmount, String(dupDebit?.field))
check('重复字段能取到中文标签', (FIELD_LABELS_ALL[dupDebit?.field] || '') !== '', FIELD_LABELS_ALL[dupDebit?.field])
check('重复字段采用分数更高的一次', dupDebit?.score === 0.99, String(dupDebit?.score))
check('重复字段记录全部候选', (dupDebit?.alternatives || []).length >= 1, String((dupDebit?.alternatives || []).length))
check('所有字段都有非空 field 键', [...dup.fields.values()].every((f) => typeof f.field === 'string' && f.field), '有字段缺 field')

// ---------------- 日期校验 ----------------

check('日期规范化 2024年5月3日', validateDate('2024年5月3日').value === '2024-05-03')
check('日期规范化 2024/5/3', validateDate('2024/5/3').value === '2024-05-03')
check('日期规范化 2024-05-03', validateDate('2024-05-03').value === '2024-05-03')
check('非法日期 2024-02-31 被拒', validateDate('2024-02-31').ok === false, validateDate('2024-02-31').reason)
check('月份 13 被拒', validateDate('2024-13-01').ok === false)
check('闰年 2024-02-29 有效', validateDate('2024-02-29').ok === true)
check('平年 2023-02-29 无效', validateDate('2023-02-29').ok === false, validateDate('2023-02-29').reason)
check('空日期被拒', validateDate('').ok === false)
check('非日期被拒', validateDate('随便写的').ok === false)

// ---------------- 凭证编号 ----------------

check('编号提取记字001号', validateVoucherNumber('凭证编号：记字001号').value === '记字001号')
check('编号提取纯数字', validateVoucherNumber('001号').value === '001号')
check('无数字的编号被拒', validateVoucherNumber('凭证编号').ok === false, validateVoucherNumber('凭证编号').reason)

// ---------------- 金额 ----------------

check('金额 300000.00', parseAmount('300000.00') === 300000)
check('金额带千分位', parseAmount('300,000.00') === 300000)
check('金额带空格', parseAmount('300 000.00') === 300000)
check('金额全角', parseAmount('３０００００.００') === 300000)
check('金额 O 误认修正', parseAmount('3O0,O00.OO') === 300000)
check('金额 l 误认修正', parseAmount('l0000.00') === 10000)
check('金额带人民币符号', parseAmount('￥300000.00') === 300000)
check('金额括号负数', parseAmount('(300.00)') === -300)
check('非金额返回 null', parseAmount('abc') === null)
check('小数位超 2 位被拒', validateAmount('100.123').ok === false, validateAmount('100.123').reason)
check('负数默认被拒', validateAmount('-100').ok === false, validateAmount('-100').reason)
check('负数可显式允许', validateAmount('-100', { allowNegative: true }).ok === true)
check('金额规范化到两位小数', validateAmount('300000').canonical === '300000.00')

// ---------------- 附件张数 ----------------

check('附件 2张', validateAttachmentCount('2张').value === 2)
check('附件异常大数被拒', validateAttachmentCount('200张').ok === false, validateAttachmentCount('200张').reason)
check('附件无数字被拒', validateAttachmentCount('若干').ok === false)

// ---------------- 科目字典（关键：不许偷偷改值） ----------------

const exactAcc = validateAccount('银行存款')
check('科目精确命中银行存款', exactAcc.ok === true && exactAcc.account.code === '1002', JSON.stringify(exactAcc.account))
check('精确命中不改写 value', exactAcc.value === '银行存款' && exactAcc.normalized === '', `${exactAcc.value}/${exactAcc.normalized}`)
const fuzzy = validateAccount('银仃存款')
check('形近科目给候选', fuzzy.candidates.length > 0 && fuzzy.candidates[0].name === '银行存款', JSON.stringify(fuzzy.candidates))
check('形近科目不改写 value', fuzzy.value === '银仃存款', fuzzy.value)
check('形近科目只给建议不采纳', fuzzy.normalized.includes('疑似') && !fuzzy.normalized.includes('已'), fuzzy.normalized)
const strictFuzzy = validateAccount('银仃存款', { strict: true })
check('严格模式下形近判为不通过', strictFuzzy.ok === false, strictFuzzy.reason)
check('表外科目列出无候选', validateAccount('某个不存在的科目').candidates.length === 0 || validateAccount('某个不存在的科目').matchType === 'none')
check('科目名带冒号能清洗', validateAccount('银行存款：').ok === true)
check('空科目被拒', validateAccount('').ok === false)
check('编辑距离自反为 0', editDistance('银行存款', '银行存款') === 0)
check('编辑距离差一字为 1', editDistance('银仃存款', '银行存款') === 1)

// ---------------- 统一入口 ----------------

check('统一入口能跑日期', runFieldValidation(FIELD_IDS.date, '2024年5月3日').ok === true)
check('统一入口对无校验器字段只判非空', runFieldValidation(FIELD_IDS.summary, '收到投资款').ok === true)
check('统一入口空摘要判不通过', runFieldValidation(FIELD_IDS.summary, '').ok === false)

// ---------------- 签名：只判存在性 ----------------

const sigPresent = assessSignature({ rows: [{ text: '制单：张三' }], signatureField: { value: '李四 王五' }, ocrScore: 0.95 })
check('有签名文字判为存在', sigPresent.state === SIGNATURE_STATES.present.id, sigPresent.state)
check('签名结论带人工核验提示', sigPresent.note.includes('人工核验'), sigPresent.note)
check('签名不声称已确认身份', !/确认/.test(sigPresent.note), sigPresent.note)
const sigEmpty = assessSignature({ rows: [{ text: '制单：' }], signatureField: { value: '' } })
check('签名栏无文字判为未发现', sigEmpty.state === SIGNATURE_STATES.absent.id, sigEmpty.state)
const sigNoAnchor = assessSignature({ rows: [{ text: '合计' }], signatureField: null })
check('连签名栏都没有判为状态不明', sigNoAnchor.state === SIGNATURE_STATES.uncertain.id, sigNoAnchor.state)
const sigGarbage = assessSignature({ rows: [{ text: '记账：EА' }], signatureField: { value: 'EА' } })
check('不像人名的签名判为状态不明', sigGarbage.state === SIGNATURE_STATES.uncertain.id, `${sigGarbage.state}/${sigGarbage.ocrText}`)
check('不像人名时说明可能是手写误读', sigGarbage.note.includes('手写'), sigGarbage.note)
check('免责说明明确不作身份证明', SIGNATURE_DISCLAIMER.includes('不能证明') || SIGNATURE_DISCLAIMER.includes('不能替代'), SIGNATURE_DISCLAIMER)
check('空输入判状态不明', assessSignature({}).state === SIGNATURE_STATES.uncertain.id)

// ---------------- 可靠度评分 ----------------

const goodField = scoreField(
  { field: FIELD_IDS.debitAmount, value: '300000.00', score: 0.98 },
  { validation: { ok: true, reason: '' }, contextScore: 1 }
)
check('高可靠字段判为 reliable', goodField.band === 'reliable', `${goodField.band}/${goodField.reliability}`)
check('可靠字段有中文标签', goodField.label === '借方金额', goodField.label)

const badFormat = scoreField(
  { field: FIELD_IDS.date, value: '2024-02-31', score: 0.95 },
  { validation: { ok: false, reason: '日期不成立' } }
)
check('格式非法判为需人工复核', badFormat.band === 'manual', `${badFormat.band}/${badFormat.reliability}`)
check('格式非法写入原因', badFormat.reasons.some((r) => r.includes('格式校验未通过')), JSON.stringify(badFormat.reasons))

const fuzzyField = scoreField(
  { field: FIELD_IDS.generalAccount, value: '银仃存款', score: 0.9 },
  { validation: validateAccount('银仃存款') }
)
check('形近科目不判为可靠', fuzzyField.band !== 'reliable', fuzzyField.band)
check('形近科目写入未采纳原因', fuzzyField.reasons.some((r) => r.includes('未自动采纳')), JSON.stringify(fuzzyField.reasons))

const noOcr = scoreField({ field: FIELD_IDS.summary, value: 'x', score: 0 }, { validation: { ok: true, reason: '' } })
check('无 OCR 置信度要扣分并说明', noOcr.reliability < 1 && noOcr.reasons.some((r) => r.includes('没有 OCR 置信度')), JSON.stringify(noOcr.reasons))

const consistent = scoreField({ field: FIELD_IDS.summary, value: '投资款', score: 0.9 }, { validation: { ok: true, reason: '' }, passes: ['投资款', '投资款'] })
const inconsistent = scoreField({ field: FIELD_IDS.summary, value: '投资款', score: 0.9 }, { validation: { ok: true, reason: '' }, passes: ['投资款', '投姿款'] })
check('多遍一致加分', consistent.reliability > inconsistent.reliability, `${consistent.reliability} vs ${inconsistent.reliability}`)
check('多遍不一致写入原因', inconsistent.reasons.some((r) => r.includes('不一致')), JSON.stringify(inconsistent.reasons))

const unbalanced = scoreField({ field: FIELD_IDS.debitAmount, value: '100', score: 0.95 }, { validation: { ok: true, reason: '' }, contextScore: 0.4, contextReason: '借贷不等' })
check('借贷不平时金额降级', unbalanced.band !== 'reliable', `${unbalanced.band}/${unbalanced.reliability}`)

check('阈值可配置', bandOf(0.9, { reliable: 0.95, review: 0.5 }) === 'review', bandOf(0.9, { reliable: 0.95, review: 0.5 }))
check('默认阈值下 0.9 为可靠', bandOf(0.9, DEFAULT_THRESHOLDS) === 'reliable')

const summaryGood = summarize([
  { field: FIELD_IDS.date, reliability: 0.95, band: 'reliable', label: '日期' },
  { field: FIELD_IDS.debitAmount, reliability: 0.92, band: 'reliable', label: '借方金额' },
  { field: FIELD_IDS.creditAmount, reliability: 0.4, band: 'manual', label: '贷方金额' }
])
check('整体取关键字段最低而非平均', Math.abs(summaryGood.overall - 0.4) < 1e-9, String(summaryGood.overall))
check('整体列出需人工复核项', summaryGood.needsManual.includes('贷方金额'), JSON.stringify(summaryGood.needsManual))
check('整体带免责说明', summaryGood.disclaimer.includes('不是统计概率'), summaryGood.disclaimer)
check('无上下文规则的字段不被无谓扣分', (() => {
  const withCtx = scoreField({ field: FIELD_IDS.preparer, value: '张三', score: 0.95 }, { validation: { ok: true, reason: '' } })
  const withoutCtx = scoreField({ field: FIELD_IDS.preparer, value: '张三', score: 0.95 }, { validation: { ok: true, reason: '' }, contextApplicable: false })
  return withoutCtx.reliability > withCtx.reliability && withoutCtx.band === 'reliable'
})(), '不适用 ≠ 未知')

check('同一原因不重复出现', (() => {
  const s = scoreField({ field: FIELD_IDS.detailAccount, value: '建行基本戶', score: 0.95 }, { validation: validateAccount('建行基本戶') })
  return s.reasons.length === new Set(s.reasons).size
})(), '原因应去重')

check('字典外的科目被封顶在可靠之下', (() => {
  const s = scoreField({ field: FIELD_IDS.detailAccount, value: '建行基本戶', score: 0.95 }, { validation: validateAccount('建行基本戶') })
  return s.reliability < DEFAULT_THRESHOLDS.reliable && s.dictionaryCapped === true
})(), '字典外科目必须被封顶')

check('空字段汇总不崩', summarize([]).overall === 0)

// ---------------- 基准口径 ----------------

check('基准覆盖 10 个字段', BENCHMARK_FIELDS.length === 10, String(BENCHMARK_FIELDS.length))
check('基准预留 6 种退化条件', Object.keys(CONDITIONS).length === 6, Object.keys(CONDITIONS).join(','))
check('每个测试图都给了 10 个字段答案', Object.values(GROUND_TRUTH).every((t) => BENCHMARK_FIELDS.every((f) => t.expect[f])), '有图缺字段答案')
check('归一化容忍全角与 O0', normalizeForMatch('３０００００．００') === '300000.00', normalizeForMatch('３０００００．００'))
check('摘要用包含匹配', scoreFieldValue('summary', '收到股东投资款', ['投资']).correct === true)
check('摘要不含则失败', scoreFieldValue('summary', '支付货款', ['投资']).correct === false)
check('金额用整体等价匹配而非子串', scoreFieldValue('debitAmount', '1300000.00', ['300000'], { mode: 'numeric-exact' }).correct === false, '1300000 不应命中 300000')
check('金额 300000 与 300000.00 视为等价', scoreFieldValue('debitAmount', '300000', ['300000.00'], { mode: 'numeric-exact' }).correct === true, '整数与两位小数应等价')
check('金额带千分位后仍等价', scoreFieldValue('debitAmount', '300,000.00', ['300000'], { mode: 'numeric-exact' }).correct === true)
check('附件张数与金额走整体数值口径', NUMERIC_EXACT_FIELDS.has('attachmentCount') && NUMERIC_EXACT_FIELDS.has('debitAmount') && !NUMERIC_EXACT_FIELDS.has('date'), [...NUMERIC_EXACT_FIELDS].join(','))
check('日期走全部 needle 口径', matchModeFor('date') === 'contains-all', matchModeFor('date'))
check('带单位的附件值能比对', scoreFieldValue('attachmentCount', '2张', ['2'], { mode: 'numeric-exact' }).correct === true)
check('日期多 needle 全部命中才算对', scoreFieldValue('date', '2024年5月3日', ['2024','5','3']).correct === true)
check('日期缺一个 needle 判错', scoreFieldValue('date', '2024年', ['2024','5','3']).correct === false)
check('签名与制单人走辅助口径', SIGNATURE_FIELDS.has('signature') && SIGNATURE_FIELDS.has('preparer'))

const agg = aggregate([
  { image: 'A', condition: 'clean', ms: 100, fields: { date: { correct: true }, voucherNumber: { correct: false } } },
  { image: 'B', condition: 'clean', ms: 200, fields: { date: { correct: true }, voucherNumber: { correct: true } } }
])
check('汇总总准确率', Math.abs(agg.overall - 75) < 1e-9, String(agg.overall))
check('汇总按条件分组', Math.abs(agg.byCondition.clean.pct - 75) < 1e-9, String(agg.byCondition.clean.pct))
check('汇总平均耗时', agg.avgMs === 150, String(agg.avgMs))
check('汇总空输入不崩', aggregate([]).overall === 0)

const cmp = formatComparison(
  { byField: { date: { pct: 50, correct: 1, total: 2 } }, overall: 50 },
  { byField: { date: { pct: 100, correct: 2, total: 2 } }, overall: 100 }
)
check('对比表标出提升', cmp.rows.find((r) => r.field === '日期')?.verdict === 'improved')
check('对比表对缺失字段不崩', cmp.rows.length === 10, String(cmp.rows.length))

// ---------------- 与既有质量闸门的衔接 ----------------
const gray = new Uint8Array(400 * 300).fill(235)
for (let row = 0; row < 5; row += 1) {
  const y0 = 40 + row * 50
  for (let y = y0; y < y0 + 18 && y < 300; y += 1) {
    for (let x = 30; x < 370; x += 1) if (x % 12 < 6) gray[y * 400 + x] = 30
  }
}
const q = assessQuality(gray, 400, 300, { minSharpness: 5, minContrast: 10, goodScore: 70 })
check('质量闸门仍可用（管线复用同一实现）', q.level === 'good', `${q.level}/${q.score}`)
check('灰度统计仍正确', analyzeGray(gray, 400, 300).std > 20)

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个凭证结构化识别断言通过`)
process.exit(passed === results.length ? 0 : 1)
