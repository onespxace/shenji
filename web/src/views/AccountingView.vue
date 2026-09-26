<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  Camera,
  ChatDotRound,
  CircleCheckFilled,
  Collection,
  Cpu,
  Delete,
  DocumentChecked,
  EditPen,
  Files,
  InfoFilled,
  MagicStick,
  Refresh,
  Search,
  Tickets,
  TrendCharts,
  UploadFilled,
  WarningFilled
} from '@element-plus/icons-vue'
import { ACCOUNT_CLASSES, ACCOUNT_ENTRIES, ACCOUNTING_BASICS, answerAccountingQuestion, classifyAccount } from '../lib/accounting-data'
import { ELEMENT_INPUTS, PROFIT_EXAMPLE, PROFIT_INPUTS, checkAccountingEquations, computeProfitChain, formatMoney } from '../lib/profit-calculator'
import { JOURNAL_ENTRY_RULES, JOURNAL_GROUPS, buildEntry, checkBalanced, lineKey, matchJournalRules } from '../lib/journal-entries'
import { assessImage, recognizeVoucherImage, terminateOcr } from '../lib/ocr'
import { processCredential, disposeAllEngines, ENGINE_IDS } from '../ocr/pipeline/credential-pipeline'
import { RELIABILITY_BANDS } from '../ocr/confidence/reliability'
import { FIELD_LABELS as OCR_FIELD_LABELS } from '../ocr/validators/field-validators'
import { COMPLETE_VOUCHER_SAMPLE, INCOMPLETE_VOUCHER_SAMPLE, UPPERCASE_VOUCHER_SAMPLE, validateVoucherText } from '../lib/voucher-validator'

const activeTab = ref('accounts')
const accountInput = ref('')
const accountResult = ref(null)
const accountKeyword = ref('')
const classFilter = ref('all')
const question = ref('')
const answer = ref(null)
const voucherFile = ref(null)
const voucherPreview = ref('')
const voucherText = ref('')
const voucherResult = ref(null)
const ocrRunning = ref(false)
const ocrProgress = ref(0)
const ocrStatus = ref('')
const ocrConfidence = ref(null)
const ocrWords = ref(null)
const imageQuality = ref(null)
const fileInput = ref(null)
const dragActive = ref(false)

const quickAccountExamples = ['库存现金', '1002', '应付账款', '实收资本', '生产成本', '主营业务收入', '管理费用']
const quickQuestions = ['会计六要素是什么？', '会计三大报表是什么？', '常用增值税税率有哪些？', '一张完整凭证有哪些要素？', '利润总额怎么计算？', '科目六大类别和六要素有什么区别？']

const filteredAccounts = computed(() => {
  const keyword = accountKeyword.value.trim().toLowerCase()
  return ACCOUNT_ENTRIES.filter((account) => {
    const matchesClass = classFilter.value === 'all' || account.classId === classFilter.value
    const matchesKeyword = !keyword || `${account.code}${account.name}`.toLowerCase().includes(keyword)
    return matchesClass && matchesKeyword
  })
})
const accountClassCounts = computed(() => Object.fromEntries(ACCOUNT_CLASSES.map((item) => [item.id, ACCOUNT_ENTRIES.filter((account) => account.classId === item.id).length])))
const voucherStatusText = computed(() => ({ complete: '形式要素基本完整', review: '需要人工复核', incomplete: '存在缺失或不平衡' }[voucherResult.value?.status] || '尚未检查'))
const voucherStatusType = computed(() => ({ complete: 'success', review: 'warning', incomplete: 'danger' }[voucherResult.value?.status] || 'info'))
// 逐字段置信度：只列出"需要重点核对"的字段，避免整屏都是徽标
const lowConfidenceList = computed(() => voucherResult.value?.lowConfidenceFields || [])
const fieldConfidenceMap = computed(() => Object.fromEntries((voucherResult.value?.fieldConfidences || []).map((item) => [item.id, item.confidence])))
const qualityTagType = computed(() => ({ good: 'success', warn: 'warning', poor: 'danger' }[imageQuality.value?.level] || 'info'))
const qualityTagText = computed(() => {
  const q = imageQuality.value
  if (!q) return ''
  return { good: '画质良好', warn: '画质一般', poor: '画质不足，建议重拍' }[q.level] + `（${q.score} 分）`
})

// ---------------- 凭证结构化识别（新管线） ----------------
const structured = ref(null)
const structuredRunning = ref(false)
const structuredStatus = ref('')
const engineChoice = ref('paddle')
const showCells = ref(false)
const structuredBusy = ref(false)
const qualityOverride = ref(false)
const paddleMissing = ref(false)
const qualityChecking = ref(false)
// 质量闸门前移后，"是否放行 OCR"变成用户的显式选择，而不是默默识别
const qualityBlocker = computed(() => imageQuality.value?.level === 'poor')
const qualityGateText = computed(() => {
  const q = imageQuality.value
  if (!q) return ''
  return `照片质量不足（${q.score} 分）：${q.reasons.join('；')}。继续识别可能造成字段缺失。`
})

const bandType = (band) => RELIABILITY_BANDS.find((b) => b.id === band)?.type || 'info'
const bandLabelOf = (band) => RELIABILITY_BANDS.find((b) => b.id === band)?.label || '需要人工复核'
const reliabilityPct = (value) => `${Math.round((value || 0) * 100)}%`

async function runStructuredOcr(force = false) {
  if (!voucherFile.value || structuredBusy.value) return
  if (qualityBlocker.value && !force) {
    qualityOverride.value = true
    return
  }
  qualityOverride.value = false
  structuredBusy.value = true
  structuredRunning.value = true
  structuredStatus.value = '准备识别'
  structured.value = null
  try {
    const result = await processCredential(voucherFile.value, {
      engine: engineChoice.value,
      reRecognize: true,
      reRecognizeLimit: 3,
      forceWhenPoor: true,
      onProgress: ({ progress, status }) => {
        structuredStatus.value = status
        ocrProgress.value = Math.round(progress * 100)
      }
    })
    structured.value = result
    ocrProgress.value = 100
    structuredStatus.value = `识别完成 · ${result.processingTime} ms · 定向重识别 ${result.reRecognized} 个字段`
    if (result.fields.length) ocrConfidence.value = Math.round((result.summary.overall || 0) * 100)
  } catch (error) {
    // 模型缺失是可预期的降级场景，要说清楚怎么办，而不是抛一堆 WASM 报错
    if (error?.code === 'PADDLE_MODELS_MISSING') {
      structuredStatus.value = 'PaddleOCR 模型未随站点部署，本次未识别。可改用 Tesseract 继续，准确率较低但可用。'
      paddleMissing.value = true
    } else {
      structuredStatus.value = `识别失败：${error.message || error}`
    }
  } finally {
    structuredRunning.value = false
    structuredBusy.value = false
  }
}

// ---------------- 利润计算器 ----------------
const profitInputs = ref({ ...PROFIT_EXAMPLE })
const showProfitExample = ref(true)
const elementInputs = ref({ assets: '', liabilities: '', equity: '', revenue: '', expense: '' })

const profitResult = computed(() => computeProfitChain(profitInputs.value))
const equationResult = computed(() => checkAccountingEquations(elementInputs.value))
const profitInputGroups = computed(() => {
  const labels = { main: '主营业务', other: '其他业务', expense: '期间费用', invest: '投资', nonOp: '营业外', tax: '所得税' }
  return Object.entries(labels).map(([id, label]) => ({ id, label, items: PROFIT_INPUTS.filter((item) => item.group === id) }))
})
const profitFilledLabel = computed(() => `${profitResult.value.filledCount}/${profitResult.value.totalInputs}`)

function loadProfitExample() {
  profitInputs.value = { ...PROFIT_EXAMPLE }
  showProfitExample.value = true
}
function clearProfitInputs() {
  profitInputs.value = {}
  showProfitExample.value = false
}

// ---------------- 分录生成器 ----------------
const entryQuery = ref('')
const selectedRuleId = ref('')
const entryAmount = ref('')
const entrySide = ref('debit')
const entryPicks = ref([])

const entryHits = computed(() => matchJournalRules(entryQuery.value))
const groupedRules = computed(() => JOURNAL_GROUPS.map((group) => ({ group, rules: JOURNAL_ENTRY_RULES.filter((rule) => rule.group === group) })))
const selectedRule = computed(() => JOURNAL_ENTRY_RULES.find((rule) => rule.id === selectedRuleId.value) || null)
const entryPreview = computed(() => (selectedRule.value ? buildEntry(selectedRule.value, { amount: entryAmount.value, side: entrySide.value, picks: entryPicks.value }) : null))
const entryBalance = computed(() => (entryPreview.value ? checkBalanced(entryPreview.value.lines) : null))
const activePicks = computed(() => (selectedRule.value ? (entryPicks.value.length ? entryPicks.value : selectedRule.value.lines.map(lineKey)) : []))

const entryQuickQueries = [
  '收到股东投资款',
  '购买原材料',
  '计提应付职工薪酬',
  '计提坏账准备',
  '确认销售收入',
  '结转销售成本',
  '收到货款',
  '偿还应付账款',
  '计算应缴增值税',
  '偿还长期借款'
]

function selectRule(rule) {
  selectedRuleId.value = rule.id
  entryPicks.value = []
  entryAmount.value = ''
  entrySide.value = rule.lines[0]?.side === 'debit' ? 'debit' : 'debit'
}
function useEntryQuery(text) {
  entryQuery.value = text
  const hits = matchJournalRules(text)
  if (hits.length) selectRule(hits[0].rule)
}
function togglePick(key) {
  const list = activePicks.value
  entryPicks.value = list.includes(key) ? list.filter((item) => item !== key) : [...list, key]
}
const allPicked = computed(() => selectedRule.value && activePicks.value.length === selectedRule.value.lines.length)
function togglePickAll() {
  if (!selectedRule.value) return
  entryPicks.value = allPicked.value ? [] : selectedRule.value.lines.map(lineKey)
}
// 把备查式规则按互斥组分块展示：同组只能选一行，不加提示用户会以为"都要记"
const pickSections = computed(() => {
  const rule = selectedRule.value
  if (!rule) return []
  const byAlt = new Map()
  const loose = []
  for (const line of rule.lines) {
    if (line.alt) {
      if (!byAlt.has(line.alt)) byAlt.set(line.alt, [])
      byAlt.get(line.alt).push(line)
    } else {
      loose.push(line)
    }
  }
  const sections = [...byAlt.entries()].map(([label, lines]) => ({ label, lines, exclusive: true }))
  if (loose.length) sections.push({ label: '', lines: loose, exclusive: false })
  // 未标注的备查规则：借方或贷方多于一行时兜底提示
  if (!byAlt.size && rule.lines.length > 2) {
    return [{ label: '原图为备查式写法，按实际业务只取对应行', lines: rule.lines, exclusive: true }]
  }
  return sections
})
function pickSectionCount(section) {
  return section.lines.filter((line) => activePicks.value.includes(lineKey(line))).length
}

function runClassification() {
  accountResult.value = classifyAccount(accountInput.value)
}
function useAccountExample(value) {
  accountInput.value = value
  runClassification()
}
function askQuestion(value = question.value) {
  question.value = value
  answer.value = answerAccountingQuestion(value) || {
    type: 'fallback',
    answer: '暂未在离线基础知识中匹配到这个问题。',
    details: ['可以尝试输入“六要素”“三大报表”“增值税”“凭证要素”“利润公式”或具体科目名称；复杂问题可切换到 AI 问答。']
  }
}
function useQuestion(value) {
  question.value = value
  askQuestion(value)
}
function clearVoucherImage() {
  if (voucherPreview.value) URL.revokeObjectURL(voucherPreview.value)
  voucherPreview.value = ''
  voucherFile.value = null
  fileInput.value.value = ''
}
async function handleVoucherFile(file) {
  if (!file) return
  if (voucherPreview.value) URL.revokeObjectURL(voucherPreview.value)
  voucherFile.value = file
  voucherPreview.value = URL.createObjectURL(file)
  voucherResult.value = null
  ocrConfidence.value = null
  ocrWords.value = null
  imageQuality.value = null
  ocrStatus.value = ''
  structured.value = null
  structuredStatus.value = ''
  paddleMissing.value = false
  // 质量闸门前移：选图后立刻评估，不等 OCR 跑完。
  // 目的是让用户在"识别之前"就知道这张图值不值得识别。
  qualityChecking.value = true
  try {
    if (typeof assessImage !== 'function') throw new Error('assessImage 未正确导入')
    imageQuality.value = await assessImage(file)
  } catch (error) {
    // 质量评估失败不能挡住用户识别，只是不显示闸门
    imageQuality.value = null
    console.warn('拍摄质量评估失败，已跳过闸门：', error)
  } finally {
    qualityChecking.value = false
  }
}
function handleFileChange(event) {
  handleVoucherFile(event.target.files?.[0])
  event.target.value = ''
}
function handleDrop(event) {
  event.preventDefault()
  dragActive.value = false
  handleVoucherFile(event.dataTransfer?.files?.[0])
}
async function runOcr() {
  if (!voucherFile.value) return
  ocrRunning.value = true
  ocrProgress.value = 0
  ocrStatus.value = '准备识别'
  voucherResult.value = null
  try {
    const result = await recognizeVoucherImage(voucherFile.value, ({ progress, status }) => {
      ocrProgress.value = Math.round(progress * 100)
      ocrStatus.value = status
    })
    voucherText.value = result.text
    ocrConfidence.value = Math.round(result.confidence || 0)
    ocrWords.value = result.words
    imageQuality.value = result.quality
    ocrStatus.value = result.quality?.level === 'poor'
      ? `识别完成，但这张图画质不足（${result.quality.score} 分），错误率会明显偏高，请优先重拍`
      : `识别完成，置信度约 ${ocrConfidence.value}%`
  } catch (error) {
    ocrStatus.value = `识别失败：${error.message || error}`
  } finally {
    ocrRunning.value = false
  }
}
function checkVoucher() {
  voucherResult.value = validateVoucherText(voucherText.value, {
    ocrConfidence: ocrConfidence.value,
    words: ocrWords.value
  })
}
function loadVoucherSample(type) {
  clearVoucherImage()
  const samples = {
    complete: { text: COMPLETE_VOUCHER_SAMPLE, label: '已载入完整样例文本' },
    uppercase: { text: UPPERCASE_VOUCHER_SAMPLE, label: '已载入大写金额样例文本' },
    incomplete: { text: INCOMPLETE_VOUCHER_SAMPLE, label: '已载入缺失样例文本' }
  }
  const sample = samples[type] || samples.complete
  voucherText.value = sample.text
  ocrConfidence.value = null
  ocrWords.value = null
  imageQuality.value = null
  voucherResult.value = null
  ocrStatus.value = sample.label
}
function resetVoucher() {
  clearVoucherImage()
  voucherText.value = ''
  voucherResult.value = null
  ocrProgress.value = 0
  ocrStatus.value = ''
  ocrConfidence.value = null
  ocrWords.value = null
  imageQuality.value = null
  structured.value = null
  structuredStatus.value = ''
}
onBeforeUnmount(() => {
  if (voucherPreview.value) URL.revokeObjectURL(voucherPreview.value)
  terminateOcr()
})
</script>

<template>
  <div class="accounting-view">
    <el-alert class="mb-16" type="info" :closable="false" show-icon title="本页为离线基础知识与凭证形式检查工具">
      科目识别和凭证检查均使用本地确定性规则；图片 OCR 在浏览器本地运行，不上传原始凭证。检查结果不能替代会计专业判断、审计复核或税务判断。
    </el-alert>

    <div class="stat-grid">
      <div class="stat-card is-accent"><div class="stat-label"><el-icon><Collection /></el-icon>常用科目</div><div class="stat-value">{{ ACCOUNT_ENTRIES.length }}</div><div class="stat-hint">来自用户提供的新版常用科目表</div></div>
      <div class="stat-card"><div class="stat-label"><el-icon><Tickets /></el-icon>科目大类</div><div class="stat-value">{{ ACCOUNT_CLASSES.length }}</div><div class="stat-hint">资产 / 负债 / 共同 / 权益 / 成本 / 损益</div></div>
      <div class="stat-card"><div class="stat-label"><el-icon><DocumentChecked /></el-icon>凭证要素</div><div class="stat-value" style="font-size: 1.375rem">9 项</div><div class="stat-hint">形式完整性与借贷平衡</div></div>
      <div class="stat-card"><div class="stat-label"><el-icon><Cpu /></el-icon>识别方式</div><div class="stat-value" style="font-size: 1.375rem">本地 OCR</div><div class="stat-hint">中文 + 英文模型</div></div>
    </div>

    <el-card class="surface" shadow="never">
      <el-tabs v-model="activeTab" class="accounting-tabs">
        <el-tab-pane name="accounts">
          <template #label><span class="tab-label"><el-icon><Collection /></el-icon>科目分类识别</span></template>
          <div class="accounting-grid">
            <div>
              <el-card class="surface inner-surface" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">输入科目名称或代码</h3><p class="surface-subtitle">例如：库存现金、1002、主营业务收入、管理费用</p></div><el-icon class="text-muted"><Search /></el-icon></div>
                <div class="query-row"><el-input v-model="accountInput" size="large" clearable placeholder="输入六类中的任意科目名称或 4 位代码" @keyup.enter="runClassification"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-button type="primary" size="large" @click="runClassification"><el-icon><MagicStick /></el-icon>识别分类</el-button></div>
                <div class="quick-chips"><button v-for="item in quickAccountExamples" :key="item" type="button" class="model-chip" @click="useAccountExample(item)">{{ item }}</button></div>
                <el-card v-if="accountResult" class="classification-result" :class="{ 'is-muted': !accountResult.matched }" shadow="never">
                  <div class="result-label">识别结果</div>
                  <div v-if="accountResult.matched" class="classification-main"><div class="classification-code">{{ accountResult.code || '按名称' }}</div><div><strong>{{ accountResult.name || accountResult.input }}</strong><div class="classification-class">{{ accountResult.className }} · {{ accountResult.element }}</div></div><el-tag type="success" effect="light">{{ accountResult.confidence === 'high' ? '精确匹配' : '规则匹配' }}</el-tag></div>
                  <div v-else class="classification-main"><el-icon class="text-muted"><WarningFilled /></el-icon><div><strong>未匹配到常用科目</strong><div class="classification-class">{{ accountResult.reason }}</div></div></div>
                  <p v-if="accountResult.matched" class="result-reason">{{ accountResult.reason }}</p>
                </el-card>
                <div v-else class="result-empty compact-empty"><div><el-icon><Collection /></el-icon><div>输入名称后显示分类结果</div></div></div>
              </el-card>
              <el-card class="surface inner-surface mt-16" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">六大科目类别</h3><p class="surface-subtitle">按用户提供的常用科目表整理；不是所有企业自设科目的完整清单</p></div></div>
                <div class="class-card-grid"><div v-for="item in ACCOUNT_CLASSES" :key="item.id" class="class-card"><div class="class-card-head"><span class="class-order">{{ item.order }}</span><strong>{{ item.name }}</strong><span class="class-count">{{ accountClassCounts[item.id] }} 个</span></div><p>{{ item.description }}</p><span class="class-range">{{ item.codeRange }}</span></div></div>
              </el-card>
            </div>
            <el-card class="surface inner-surface" shadow="never">
              <div class="surface-header"><div><h3 class="surface-title">常用科目表</h3><p class="surface-subtitle">共 {{ filteredAccounts.length }} 条，可按名称或代码搜索</p></div></div>
              <div class="query-row compact-query"><el-input v-model="accountKeyword" clearable placeholder="搜索科目名称或代码"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-select v-model="classFilter" class="class-filter"><el-option label="全部类别" value="all" /><el-option v-for="item in ACCOUNT_CLASSES" :key="item.id" :label="item.name" :value="item.id" /></el-select></div>
              <div class="account-list"><div v-for="account in filteredAccounts" :key="account.code" class="account-row"><code>{{ account.code }}</code><span>{{ account.name }}</span><el-tag size="small" effect="plain">{{ ACCOUNT_CLASSES.find((item) => item.id === account.classId)?.name }}</el-tag></div><div v-if="!filteredAccounts.length" class="empty-state"><el-icon><Search /></el-icon><strong>没有匹配科目</strong><span>换一个名称或代码试试。</span></div></div>
            </el-card>
          </div>
        </el-tab-pane>

        <el-tab-pane name="voucher">
          <template #label><span class="tab-label"><el-icon><DocumentChecked /></el-icon>凭证完整性检查</span></template>
          <div class="voucher-layout">
            <div>
              <el-card class="surface inner-surface" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">上传会计凭证图片</h3><p class="surface-subtitle">支持 PNG / JPG / WEBP / BMP，最大 15MB。图片只在本地识别。</p></div><el-icon class="text-muted"><Camera /></el-icon></div>
                <input ref="fileInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" aria-label="选择会计凭证图片" @change="handleFileChange" />
                <div
                  v-if="!voucherPreview"
                  class="drop-zone voucher-drop"
                  :class="{ 'is-dragging': dragActive }"
                  role="button"
                  tabindex="0"
                  aria-label="选择或拖入会计凭证图片"
                  @click="fileInput?.click()"
                  @keydown.enter.prevent="fileInput?.click()"
                  @keydown.space.prevent="fileInput?.click()"
                  @dragover.prevent="dragActive = true"
                  @dragleave="dragActive = false"
                  @drop="handleDrop"
                >
                  <div class="drop-icon"><el-icon><UploadFilled /></el-icon></div>
                  <div class="drop-title">点击选择凭证图片，或直接拖入</div>
                  <div class="drop-hint">支持 PNG / JPG / WEBP / BMP，最大 15MB。建议正面拍摄、清晰无反光；识别后可手动校对文字。</div>
                </div>
                <div v-else class="voucher-image-box"><img :src="voucherPreview" alt="会计凭证预览" /><div class="voucher-image-actions"><span>{{ voucherFile?.name }} · {{ (voucherFile?.size / 1024).toFixed(0) }} KB</span><div><el-button size="small" text @click="fileInput?.click()">更换</el-button><el-button size="small" text type="danger" @click="resetVoucher"><el-icon><Delete /></el-icon>清除</el-button></div></div></div>
                <div class="flex-between mt-16 flex-wrap"><div class="flex-wrap"><el-button type="primary" :disabled="!voucherFile" :loading="ocrRunning" @click="runOcr"><el-icon><Camera /></el-icon>{{ ocrRunning ? '识别中' : '开始本地识别' }}</el-button><el-button plain :disabled="ocrRunning" @click="loadVoucherSample('complete')">载入完整样例</el-button><el-button plain :disabled="ocrRunning" @click="loadVoucherSample('uppercase')">大写金额样例</el-button><el-button plain :disabled="ocrRunning" @click="loadVoucherSample('incomplete')">载入缺失样例</el-button></div><span v-if="ocrStatus" class="text-muted text-small">{{ ocrStatus }}</span></div>
                <el-progress v-if="ocrRunning" class="mt-12" :percentage="ocrProgress" :stroke-width="8" />
                <div v-if="qualityChecking" class="quality-gate is-checking"><div class="quality-head"><span class="text-muted text-small">正在检查照片质量…</span></div></div>
                <div v-else-if="imageQuality" class="quality-gate" :class="`is-${imageQuality.level}`">
                  <div class="quality-head"><el-tag :type="qualityTagType" effect="light" size="small">{{ qualityTagText }}</el-tag><span class="text-muted text-small">清晰度 {{ imageQuality.metrics.sharpness.toFixed(0) }} · 对比度 {{ imageQuality.metrics.std.toFixed(0) }} · 亮度 {{ imageQuality.metrics.mean.toFixed(0) }}<template v-if="imageQuality.metrics.skewDeg > 0.4"> · 倾斜 {{ imageQuality.metrics.skewDeg.toFixed(1) }}°</template></span></div>
                  <ul v-if="imageQuality.reasons.length"><li v-for="reason in imageQuality.reasons" :key="reason">{{ reason }}</li></ul>
                  <ul v-else class="quality-advice"><li v-for="tip in imageQuality.advice" :key="tip">{{ tip }}</li></ul>
                  <div v-if="qualityBlocker" class="quality-block">
                    <p>{{ qualityGateText }}</p>
                    <div class="flex-wrap">
                      <el-button size="small" @click="fileInput?.click()">重新拍摄</el-button>
                      <el-button size="small" type="warning" plain @click="runStructuredOcr(true)">仍要继续识别</el-button>
                    </div>
                  </div>
                </div>

                <div class="structured-entry mt-16">
                  <div class="structured-head">
                    <strong>结构化识别（逐字段）</strong>
                    <el-radio-group v-model="engineChoice" size="small">
                      <el-radio-button value="paddle">PaddleOCR PP-OCRv5</el-radio-button>
                      <el-radio-button value="tesseract">Tesseract</el-radio-button>
                    </el-radio-group>
                    <el-button type="primary" size="small" :disabled="!voucherFile || structuredBusy" :loading="structuredRunning" @click="runStructuredOcr(false)">逐字段识别</el-button>
                  </div>
                  <p class="text-muted text-small">先定位字段位置再识别，每个字段单独给可靠度。首次使用 Paddle 需下载约 20.6MB 模型，图片始终留在本机。</p>
                  <div v-if="paddleMissing" class="quality-gate is-warn mt-12">
                    <p>PaddleOCR 模型未随站点部署，本次未识别。可以改用 Tesseract 继续，准确率较低但可用；或在本地执行 <code>npm run sync:paddle</code> 后重新构建。</p>
                    <el-button size="small" @click="engineChoice = 'tesseract'">改用 Tesseract</el-button>
                  </div>
                  <div v-if="structuredBusy" class="text-muted text-small">正在识别：{{ structuredStatus }}（{{ ocrProgress }}%）</div>
                  <div v-else-if="qualityBlocker && !qualityOverride" class="text-muted text-small">照片质量不足，已暂缓识别。可在上面的提示里选择重新拍摄或仍要继续。</div>
                  <div v-else-if="structuredStatus && !structured" class="text-muted text-small">{{ structuredStatus }}</div>
                </div>

                <div v-if="structured" class="field-review">
                  <div class="review-summary" :class="structured.summary.band">
                    <div class="review-score"><strong>{{ reliabilityPct(structured.summary.overall) }}</strong><span>识别可靠度</span></div>
                    <div class="review-copy">
                      <div class="review-verdict">{{ bandLabelOf(structured.summary.band) }}</div>
                      <ul v-if="structured.summary.needsManual.length" class="review-list danger"><li>需人工复核：{{ structured.summary.needsManual.join('、') }}</li></ul>
                      <ul v-if="structured.summary.needsReview.length" class="review-list warn"><li>建议核对：{{ structured.summary.needsReview.join('、') }}</li></ul>
                      <p class="text-muted text-small">{{ structured.summary.disclaimer }}</p>
                    </div>
                  </div>

                  <div class="review-table">
                    <div v-for="field in structured.fields" :key="field.field" class="review-row" :class="field.band">
                      <span class="review-label">{{ field.label }}</span>
                      <span class="review-value">{{ field.value || '未可靠识别' }}</span>
                      <span class="review-meta">
                        <el-tag :type="bandType(field.band)" size="small" effect="light">{{ bandLabelOf(field.band) }}</el-tag>
                        <em>{{ reliabilityPct(field.reliability) }}</em>
                      </span>
                      <span v-if="field.reasons.length" class="review-reason">{{ field.reasons.join('；') }}</span>
                    </div>
                    <div class="review-row signature-row">
                      <span class="review-label">责任签名</span>
                      <span class="review-value">{{ structured.signature.ocrText || '未识别到文字' }}</span>
                      <span class="review-meta"><el-tag :type="structured.signature.type" size="small" effect="light">{{ structured.signature.label }}</el-tag></span>
                      <span class="review-reason">{{ structured.signature.note }}</span>
                    </div>
                  </div>

                  <div class="review-extra">
                    <span>借贷：{{ structured.balance.state === 'balanced' ? '平衡' : structured.balance.state === 'unbalanced' ? `差额 ${structured.balance.difference}` : '无法校验' }}</span>
                    <span>耗时 {{ structured.processingTime }} ms</span>
                    <span>重识别 {{ structured.reRecognized }} 个字段</span>
                    <span>模型 {{ structured.engine }}</span>
                  </div>
                  <div v-if="structured.warnings.length" class="entry-issues"><ul><li v-for="w in structured.warnings" :key="w">{{ w }}</li></ul></div>
                  <div class="signature-disclaimer"><el-icon><WarningFilled /></el-icon><span>{{ structured.signatureNote }}</span></div>
                  <div class="cell-toggle">
                    <el-button size="small" text @click="showCells = !showCells">{{ showCells ? '收起' : '展开' }} {{ structured.cells.length }} 个单元格坐标</el-button>
                    <div v-if="showCells" class="cell-list">
                      <div v-for="(cell, i) in structured.cells" :key="i" class="cell-item">
                        <code>{{ cell.column || '—' }}</code>
                        <span>{{ cell.text }}</span>
                        <em>{{ reliabilityPct(cell.confidence) }}</em>
                        <span class="cell-coord">({{ cell.bbox.x }},{{ cell.bbox.y }} {{ cell.bbox.width }}×{{ cell.bbox.height }})</span>
                      </div>
                    </div>
                  </div>
                </div>
              </el-card>
              <el-card class="surface inner-surface mt-16" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">识别文字（可校对）</h3><p class="surface-subtitle">OCR 结果仅作为线索，请在检查前核对日期、金额和科目。</p></div><el-button size="small" type="primary" plain :disabled="!voucherText.trim()" @click="checkVoucher"><el-icon><MagicStick /></el-icon>检查凭证</el-button></div>
                <el-input v-model="voucherText" type="textarea" :rows="10" resize="vertical" placeholder="识别后的文字会显示在这里，也可以直接粘贴凭证文字进行形式检查。" />
                <div v-if="ocrConfidence !== null" class="text-muted text-small mt-12">OCR 置信度：{{ ocrConfidence }}%<span v-if="ocrWords?.length"> · 已提取 {{ ocrWords.length }} 个词用于逐字段判定</span></div>
              </el-card>
            </div>
            <div>
              <el-card v-if="voucherResult" class="surface inner-surface voucher-result-card" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">形式检查结果</h3><p class="surface-subtitle">完整性、科目识别与借贷平衡</p></div><el-tag :type="voucherStatusType" effect="light">{{ voucherStatusText }}</el-tag></div>
                <div class="score-row"><el-progress type="dashboard" :percentage="voucherResult.score" :width="116" :color="voucherResult.score >= 90 ? '#18a999' : voucherResult.score >= 60 ? '#d08a1d' : '#d9534f'"><template #default="{ percentage }"><strong class="score-number">{{ percentage }}</strong><span class="score-label">完整度</span></template></el-progress><div class="score-copy"><div v-if="voucherResult.missing.length" class="missing-title"><el-icon><WarningFilled /></el-icon>缺少或未通过：</div><div v-if="voucherResult.missing.length" class="missing-chips"><el-tag v-for="item in voucherResult.missing" :key="item" type="danger" size="small" effect="light">{{ item }}</el-tag></div><div v-else class="missing-title success-text"><el-icon><CircleCheckFilled /></el-icon>未发现形式要素缺失</div><p v-if="voucherResult.warnings.length" class="text-muted text-small">需留意：{{ voucherResult.warnings.join('、') }}</p></div></div>
                <div v-if="lowConfidenceList.length" class="low-confidence-block"><div class="section-kicker"><el-icon><WarningFilled /></el-icon>识别置信度偏低，请重点核对</div><div class="low-confidence-list"><div v-for="item in lowConfidenceList" :key="item.id" class="low-confidence-item"><strong>{{ item.label }}</strong><el-tag type="warning" size="small" effect="light">{{ item.confidence }}%</el-tag></div></div><p class="text-muted text-small">这些字段里有字被认错的风险。点对应条目可在本页对照左侧识别文字逐字修正后再检查。</p></div>
                <div class="check-list"><div v-for="check in voucherResult.checks" :key="check.id" class="check-row"><el-icon :class="check.status === 'pass' ? 'check-pass' : check.status === 'warn' ? 'check-warn' : 'check-fail'"><CircleCheckFilled v-if="check.status === 'pass'" /><WarningFilled v-else-if="check.status === 'warn'" /><InfoFilled v-else /></el-icon><div><strong>{{ check.label }}</strong><span>{{ check.detail }}</span></div><el-tag v-if="fieldConfidenceMap[check.id] !== undefined && (check.status !== 'fail' || fieldConfidenceMap[check.id] < 78)" size="small" effect="plain" :type="fieldConfidenceMap[check.id] < 78 ? 'warning' : 'info'">识别 {{ fieldConfidenceMap[check.id] }}%</el-tag></div></div>
                <div v-if="voucherResult.extracted.accounts.length" class="extracted-block"><div class="section-kicker">识别到的科目</div><div class="account-tag-list"><el-tag v-for="account in voucherResult.extracted.accounts" :key="account.code" size="small" effect="plain">{{ account.code }} {{ account.name }} · {{ account.className }}</el-tag></div></div>
                <div v-if="voucherResult.extracted.amounts.debit !== null" class="extracted-block"><div class="section-kicker">金额</div><div class="amount-row"><span>借方合计 <strong>{{ voucherResult.extracted.amounts.debit.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</strong></span><span>贷方合计 <strong>{{ voucherResult.extracted.amounts.credit.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</strong></span><span>差额 <strong>{{ voucherResult.extracted.amounts.difference.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</strong></span></div></div>
                <div class="manual-note"><el-icon><InfoFilled /></el-icon><span>{{ voucherResult.notes.join(' ') }}</span></div>
                <div v-if="voucherResult.unverifiable?.length" class="unverifiable-block"><div class="section-kicker">本工具不判断，请人工核验</div><ul><li v-for="item in voucherResult.unverifiable" :key="item">{{ item }}</li></ul></div>
              </el-card>
              <el-card v-else class="surface inner-surface" shadow="never"><div class="empty-state tall-empty"><el-icon><DocumentChecked /></el-icon><strong>等待检查凭证</strong><span>上传图片或载入样例后，检查结果会显示在这里。</span></div></el-card>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="basics">
          <template #label><span class="tab-label"><el-icon><ChatDotRound /></el-icon>基础问答</span></template>
          <div class="basics-layout">
            <el-card class="surface inner-surface" shadow="never">
              <div class="surface-header"><div><h3 class="surface-title">会计基础速答</h3><p class="surface-subtitle">本地规则回答，适合快速复习和核对基础口径。</p></div><el-icon class="text-muted"><ChatDotRound /></el-icon></div>
              <div class="query-row"><el-input v-model="question" size="large" clearable placeholder="例如：会计三大报表是什么？" @keyup.enter="askQuestion()"><template #prefix><el-icon><ChatDotRound /></el-icon></template></el-input><el-button type="primary" size="large" @click="askQuestion()">提问</el-button></div>
              <div class="quick-chips question-chips"><button v-for="item in quickQuestions" :key="item" type="button" class="model-chip" @click="useQuestion(item)">{{ item }}</button></div>
              <el-card v-if="answer" class="answer-card" shadow="never"><div class="answer-label">回答</div><strong>{{ answer.answer }}</strong><ul v-if="answer.details?.length"><li v-for="detail in answer.details" :key="detail">{{ detail }}</li></ul></el-card>
              <div v-else class="result-empty compact-empty"><div><el-icon><ChatDotRound /></el-icon><div>选择一个问题开始</div></div></div>
            </el-card>
            <div class="basics-side">
              <el-card v-for="item in ACCOUNTING_BASICS.slice(0, 4)" :key="item.id" class="surface inner-surface" shadow="never"><div class="basics-card-title"><el-icon><Collection /></el-icon><strong>{{ item.question }}</strong></div><p>{{ item.answer }}</p></el-card>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="profit">
          <template #label><span class="tab-label"><el-icon><TrendCharts /></el-icon>利润计算</span></template>
          <div class="profit-layout">
            <el-card class="surface inner-surface" shadow="never">
              <div class="surface-header"><div><h3 class="surface-title">利润计算器</h3><p class="surface-subtitle">只填最底层的收入、成本、费用和税率，上层利润自动推出来。</p></div><div class="flex-wrap"><el-button size="small" plain @click="loadProfitExample">载入示例</el-button><el-button size="small" plain @click="clearProfitInputs">清空</el-button></div></div>
              <div class="profit-inputs">
                <div v-for="group in profitInputGroups" :key="group.id" class="profit-input-group">
                  <div class="section-kicker">{{ group.label }}</div>
                  <div class="profit-field-list">
                    <label v-for="item in group.items" :key="item.id" class="profit-field">
                      <span class="profit-field-label">{{ item.label }}<em v-if="item.unit">{{ item.unit }}</em></span>
                      <el-input v-model="profitInputs[item.id]" :placeholder="item.unit === '%' ? '如 25' : '0.00'" inputmode="decimal"><template v-if="item.unit" #suffix>{{ item.unit }}</template></el-input>
                      <span class="profit-field-hint">{{ item.hint }}</span>
                    </label>
                  </div>
                </div>
              </div>
              <p class="text-muted text-small mt-12">已填 {{ profitFilledLabel }} 项。留空的项目不参与计算，也不会被当成 0 —— 依赖它的结果会标为「待补数据」。</p>
            </el-card>
            <el-card class="surface inner-surface" shadow="never">
              <div class="surface-header"><div><h3 class="surface-title">计算过程</h3><p class="surface-subtitle">按步骤从主营业务利润一路推到净利润。</p></div><el-tag v-if="!profitResult.complete" type="warning" effect="light">缺 {{ profitResult.missingCount }} 项</el-tag><el-tag v-else-if="profitResult.hasLoss" type="danger" effect="light">本期亏损</el-tag><el-tag v-else type="success" effect="light">已算完</el-tag></div>
              <ol class="formula-chain">
                <li v-for="step in profitResult.steps" :key="step.id" class="formula-step" :class="step.status">
                  <div class="formula-step-head"><strong>{{ step.label }}</strong><span v-if="step.status === 'ok'" class="formula-value" :class="{ 'is-loss': step.value < 0 }">{{ formatMoney(step.value) }}</span><span v-else class="formula-pending">待补 {{ step.missing.length }} 项</span></div>
                  <code class="formula-expr">{{ step.expression }}</code>
                  <div v-if="step.status === 'incomplete'" class="formula-missing">缺：{{ step.missing.join('、') }}</div>
                  <div v-if="step.note" class="formula-note"><el-icon><InfoFilled /></el-icon>{{ step.note }}</div>
                </li>
              </ol>
              <div v-if="profitResult.netProfit !== null" class="net-profit-box" :class="{ 'is-loss': profitResult.hasLoss }">
                <span>净利润</span>
                <strong>{{ formatMoney(profitResult.netProfit) }}</strong>
                <span class="text-muted text-small">元</span>
              </div>
              <div class="manual-note mt-16"><el-icon><InfoFilled /></el-icon><span>本计算器按你提供的《利润的内容》口径实现：投资净收益在利润总额层级加总，不进营业利润。现行《企业会计准则》把投资收益计入营业利润，两者结果会不同，请按企业实际会计政策取用。</span></div>
            </el-card>
          </div>

          <el-card class="surface inner-surface mt-16" shadow="never">
            <div class="surface-header"><div><h3 class="surface-title">会计恒等式校验</h3><p class="surface-subtitle">资产 = 负债 + 所有者权益，以及扩展式 资产 = 负债 + 所有者权益 +（收入 − 费用）</p></div><el-tag :type="equationResult.status === 'ok' ? 'success' : equationResult.status === 'error' ? 'danger' : 'warning'" effect="light">{{ { ok: '平衡', error: '不平衡', incomplete: '待补数据' }[equationResult.status] }}</el-tag></div>
            <div class="element-inputs">
              <label v-for="item in ELEMENT_INPUTS" :key="item.id" class="profit-field">
                <span class="profit-field-label">{{ item.label }}</span>
                <el-input v-model="elementInputs[item.id]" placeholder="0.00" inputmode="decimal" />
                <span class="profit-field-hint">{{ item.hint }}</span>
              </label>
            </div>
            <div class="equation-list">
              <div v-for="item in equationResult.checks" :key="item.id" class="equation-row" :class="item.status">
                <el-icon><CircleCheckFilled v-if="item.status === 'ok'" /><WarningFilled v-else-if="item.status === 'error'" /><InfoFilled v-else /></el-icon>
                <div><code>{{ item.label }}</code><div v-if="item.status !== 'incomplete'" class="equation-detail">左边 {{ formatMoney(item.left) }} · 右边 {{ formatMoney(item.right) }} · 差额 {{ formatMoney(item.difference) }}</div><div v-else class="equation-detail">还缺：{{ item.missing.join('、') }}</div></div>
              </div>
            </div>
            <div class="manual-note mt-12"><el-icon><InfoFilled /></el-icon><span>{{ equationResult.note }}两条式子不能同时成立，除非收入恰好等于费用：扩展式右边多了尚未结转的利润。</span></div>
          </el-card>
        </el-tab-pane>

        <el-tab-pane name="entry">
          <template #label><span class="tab-label"><el-icon><EditPen /></el-icon>分录生成</span></template>
          <div class="entry-layout">
            <div>
              <el-card class="surface inner-surface" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">说出业务，自动生成分录</h3><p class="surface-subtitle">覆盖 16 大类 40+ 项常用业务，借贷科目全部取自本页的 89 个常用科目表。</p></div></div>
                <div class="query-row"><el-input v-model="entryQuery" size="large" clearable placeholder="例如：收到股东投资款 / 计提坏账准备 / 确认销售收入" @keyup.enter="useEntryQuery(entryQuery)"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-button type="primary" size="large" @click="useEntryQuery(entryQuery)">生成分录</el-button></div>
                <div class="quick-chips"><button v-for="item in entryQuickQueries" :key="item" type="button" class="model-chip" @click="useEntryQuery(item)">{{ item }}</button></div>
                <div v-if="entryQuery && !entryHits.length" class="result-empty compact-empty mt-16"><div><el-icon><Search /></el-icon><div>没匹配到业务。试试更接近的说法，例如「购买原材料」「计提应付职工薪酬」。</div></div></div>
                <div v-else-if="entryHits.length" class="entry-hits">
                  <div class="section-kicker">匹配到 {{ entryHits.length }} 条</div>
                  <button v-for="hit in entryHits.slice(0, 6)" :key="hit.rule.id" type="button" class="entry-hit" :class="{ 'is-active': hit.rule.id === selectedRuleId }" @click="selectRule(hit.rule)">
                    <strong>{{ hit.rule.title }}</strong>
                    <span class="text-muted text-small">{{ hit.rule.group }} · 命中：{{ hit.matched.join('、') }}</span>
                  </button>
                </div>
              </el-card>

              <el-card v-if="selectedRule" class="surface inner-surface mt-16" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">填写金额并配平</h3><p class="surface-subtitle">复式记账法：有借必有贷，借贷必相等。</p></div><el-tag v-if="entryBalance?.balanced" type="success" effect="light">已配平</el-tag><el-tag v-else-if="entryPreview?.amount" type="warning" effect="light">待配平</el-tag></div>
                <div class="entry-controls">
                  <label class="profit-field"><span class="profit-field-label">业务金额（元）</span><el-input v-model="entryAmount" placeholder="不填则只给借贷方向" inputmode="decimal" /></label>
                  <label class="profit-field"><span class="profit-field-label">金额记在哪一侧</span><el-select v-model="entrySide"><el-option label="借方" value="debit" /><el-option label="贷方" value="credit" /></el-select></label>
                </div>
                <div class="pick-head"><span class="section-kicker">参与本次业务的科目</span><el-button size="small" text @click="togglePickAll">{{ allPicked ? '取消全选' : '全选' }}</el-button></div>
                <div v-for="(section, index) in pickSections" :key="index" class="pick-section">
                  <div v-if="section.label" class="pick-section-label"><span>{{ section.label }}</span><em v-if="section.exclusive" class="pick-exclusive">{{ pickSectionCount(section) }}/{{ section.lines.length }}</em></div>
                  <div class="pick-list">
                    <label v-for="line in section.lines" :key="lineKey(line)" class="pick-item" :class="[line.side, { 'is-off': !activePicks.includes(lineKey(line)) }]">
                      <input type="checkbox" :checked="activePicks.includes(lineKey(line))" @change="togglePick(lineKey(line))" />
                      <span class="pick-side">{{ line.side === 'debit' ? '借' : '贷' }}</span>
                      <span class="pick-account"><code>{{ line.code }}</code> {{ line.note || '' }}<em v-if="line.sub">{{ line.sub }}</em></span>
                    </label>
                  </div>
                </div>
                <p v-if="entryPreview?.message" class="text-muted text-small mt-12">{{ entryPreview.message }}</p>
                <ul v-if="entryPreview?.issues?.length" class="entry-issues"><li v-for="issue in entryPreview.issues" :key="issue">{{ issue }}</li></ul>
                <div v-if="entryBalance" class="entry-balance" :class="{ 'is-balanced': entryBalance.balanced }">
                  <span>借方合计 <strong>{{ formatMoney(entryBalance.debit) }}</strong></span>
                  <span>贷方合计 <strong>{{ formatMoney(entryBalance.credit) }}</strong></span>
                  <span>差额 <strong>{{ formatMoney(entryBalance.difference) }}</strong></span>
                </div>
              </el-card>
            </div>

            <div>
              <el-card class="surface inner-surface" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">分录预览</h3><p class="surface-subtitle">借方在上、贷方在下，与记账凭证一致。</p></div></div>
                <div v-if="entryPreview" class="entry-preview">
                  <div class="entry-preview-title">{{ selectedRule.title }}</div>
                  <p class="text-muted text-small">{{ selectedRule.summary }}</p>
                  <div v-for="(line, index) in entryPreview.lines" :key="`${lineKey(line)}-${index}`" class="entry-line" :class="line.side">
                    <span class="entry-side-tag">{{ line.side === 'debit' ? '借' : '贷' }}</span>
                    <span class="entry-account"><strong>{{ line.sub || line.account?.name || line.code }}</strong><em v-if="line.sub">{{ line.account?.name }}</em></span>
                    <span class="entry-code">{{ line.code }}</span>
                    <span class="entry-amount">{{ line.amount === null ? '—' : formatMoney(line.amount) }}</span>
                  </div>
                  <div v-if="!entryPreview.lines.length" class="result-empty compact-empty"><div><el-icon><InfoFilled /></el-icon><div>没有勾选任何科目</div></div></div>
                  <div v-if="selectedRule.formula" class="entry-formula"><div class="section-kicker">配套公式</div><code>{{ selectedRule.formula }}</code></div>
                  <div v-if="selectedRule.sourceNote" class="manual-note mt-12"><el-icon><WarningFilled /></el-icon><span>{{ selectedRule.sourceNote }}</span></div>
                  <div v-if="selectedRule.usage" class="manual-note mt-12"><el-icon><InfoFilled /></el-icon><span>{{ selectedRule.usage }}</span></div>
                </div>
                <div v-else class="result-empty tall-empty"><div><el-icon><EditPen /></el-icon><div>先说出业务或从右侧选一类</div></div></div>
              </el-card>

              <el-card class="surface inner-surface mt-16" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">全部业务（16 大类）</h3><p class="surface-subtitle">共 {{ JOURNAL_ENTRY_RULES.length }} 项，点标题即可载入。</p></div></div>
                <el-collapse>
                  <el-collapse-item v-for="item in groupedRules" :key="item.group" :title="`${item.group}（${item.rules.length}）`" :name="item.group">
                    <div class="rule-list">
                      <button v-for="rule in item.rules" :key="rule.id" type="button" class="rule-chip" :class="{ 'is-active': rule.id === selectedRuleId }" @click="selectRule(rule)">{{ rule.title }}</button>
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </el-card>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.mb-16 { margin-bottom: 16px; }
.mt-12 { margin-top: 12px; }
.mt-16 { margin-top: 16px; }
.accounting-tabs :deep(.el-tabs__header) { margin: -4px 0 20px; }
.accounting-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background: var(--line-soft); }
.tab-label { display: inline-flex; align-items: center; gap: 6px; }
.accounting-grid, .voucher-layout, .basics-layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr); gap: 16px; align-items: start; }
.inner-surface { background: rgba(255,255,255,.42) !important; }
.inner-surface .el-card__body { padding: 17px; }
.query-row { display: flex; gap: 8px; }
.query-row .el-input { flex: 1; }
.quick-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.compact-empty { min-height: 130px; }
.compact-query { margin-bottom: 12px; }
.class-filter { width: 132px; }
.classification-result { margin-top: 16px; border: 1px solid rgba(14,139,131,.18); background: rgba(230,250,246,.52) !important; }
.classification-result.is-muted { border-color: rgba(183,107,18,.2); background: rgba(255,245,230,.6) !important; }
.result-label, .answer-label { color: var(--ink-400); font-size: 0.75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.classification-main { display: flex; align-items: center; gap: 12px; margin-top: 9px; }
.classification-code { color: var(--blue); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 1.375rem; font-weight: 800; }
.classification-main strong { color: var(--ink-900); font-size: 1.0625rem; }
.classification-class { margin-top: 3px; color: var(--ink-500); font-size: 0.875rem; }
.classification-main .el-tag { margin-left: auto; }
.result-reason { margin: 10px 0 0; color: var(--ink-500); font-size: 0.875rem; }
.class-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.class-card { padding: 11px; border: 1px solid var(--line-soft); border-radius: 10px; background: rgba(255,255,255,.45); }
.class-card-head { display: flex; align-items: center; gap: 6px; color: var(--ink-900); font-size: 0.875rem; }
.class-order { display: grid; width: 18px; height: 18px; place-items: center; border-radius: 5px; color: var(--blue); background: var(--blue-soft); font-size: 0.75rem; font-weight: 800; }
.class-count { margin-left: auto; color: var(--ink-400); font-size: 0.75rem; }
.class-card p { min-height: 52px; margin: 7px 0; color: var(--ink-500); font-size: 0.75rem; line-height: 1.55; }
.class-range { color: var(--blue); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.75rem; }
.account-list { max-height: 620px; overflow: auto; }
.account-row { display: grid; grid-template-columns: 55px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.account-row code { color: var(--blue); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.875rem; font-weight: 750; }
.account-row span { overflow: hidden; color: var(--ink-700); font-size: 0.875rem; text-overflow: ellipsis; white-space: nowrap; }
.account-row .el-tag { color: var(--ink-500); }
.voucher-drop { min-height: 205px; }
.voucher-image-box { overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.5); }
.voucher-image-box img { display: block; width: 100%; max-height: 340px; object-fit: contain; background: #f3f5f8; }
.voucher-image-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 9px; color: var(--ink-500); font-size: 0.75rem; }
.voucher-result-card { min-height: 100%; }
.score-row { display: flex; align-items: center; gap: 18px; margin-bottom: 16px; }
.score-number { display: block; color: var(--ink-900); font-size: 1.75rem; font-weight: 800; line-height: 1; }
.score-label { display: block; margin-top: 4px; color: var(--ink-400); font-size: 0.75rem; }
.score-copy { min-width: 0; flex: 1; }
.missing-title { display: flex; align-items: center; gap: 5px; color: var(--red); font-size: 0.875rem; font-weight: 700; }
.success-text { color: var(--teal); }
.missing-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.check-list { display: flex; flex-direction: column; gap: 2px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
.check-row { display: flex; gap: 8px; padding: 8px 0; flex-wrap: wrap; }
.check-row > .el-icon { flex: 0 0 auto; margin-top: 1px; }
.check-row > div { flex: 1 1 200px; min-width: 0; }
.check-row > .el-tag { flex: 0 0 auto; align-self: flex-start; margin-top: 1px; font-size: 0.8125rem; }
.check-pass { color: var(--teal); }
.check-warn { color: var(--amber); }
.check-fail { color: var(--red); }
.check-row strong { display: block; color: var(--ink-700); font-size: 0.875rem; }
.check-row span { display: block; margin-top: 2px; color: var(--ink-500); font-size: 0.75rem; line-height: 1.45; }
.extracted-block { margin-top: 15px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
.account-tag-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.account-tag-list .el-tag { color: var(--ink-600); }
.amount-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 7px; color: var(--ink-500); font-size: 0.875rem; }
.amount-row strong { color: var(--ink-900); font-variant-numeric: tabular-nums; }
.manual-note { display: flex; gap: 7px; margin-top: 15px; padding: 10px; border-radius: 8px; color: var(--ink-500); background: rgba(245,248,252,.72); font-size: 0.75rem; line-height: 1.6; }
.manual-note .el-icon { flex: 0 0 auto; margin-top: 1px; }
.unverifiable-block { margin-top: 12px; padding: 10px 11px; border: 1px dashed var(--line-strong); border-radius: 9px; background: rgba(245,248,252,.5); }
.unverifiable-block ul { margin: 7px 0 0; padding-left: 17px; color: var(--ink-500); font-size: 0.75rem; line-height: 1.65; }
.unverifiable-block li + li { margin-top: 3px; }
.quality-gate { margin-top: 12px; padding: 11px 12px; border: 1px solid var(--line-soft); border-radius: 10px; background: rgba(245,248,252,.6); }
.quality-gate.is-good { border-color: rgba(24,169,153,.34); background: rgba(24,169,153,.07); }
.quality-gate.is-warn { border-color: rgba(208,138,29,.36); background: rgba(208,138,29,.08); }
.quality-gate.is-poor { border-color: rgba(217,83,79,.38); background: rgba(217,83,79,.08); }
.quality-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.quality-gate ul { margin: 8px 0 0; padding-left: 17px; color: var(--ink-500); font-size: 0.75rem; line-height: 1.65; }
.quality-gate li + li { margin-top: 3px; }
.quality-advice { list-style: none; padding-left: 0 !important; }
.quality-gate.is-checking { color: var(--ink-500); }
.quality-block { margin-top: 10px; padding-top: 9px; border-top: 1px dashed var(--line-strong); }
.quality-block p { margin: 0 0 8px; color: var(--ink-700); font-size: 0.8125rem; line-height: 1.6; }
.structured-entry { padding: 12px; border: 1px solid var(--line-soft); border-radius: 10px; background: rgba(245,248,252,.5); }
.structured-head { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; }
.structured-head strong { color: var(--ink-900); font-size: 0.9375rem; }
.structured-head .el-button { margin-left: auto; }
.field-review { margin-top: 12px; }
.review-summary { display: flex; gap: 14px; padding: 13px; border: 1px solid var(--line-soft); border-radius: 11px; }
.review-summary.reliable { border-color: rgba(24,169,153,.34); background: rgba(24,169,153,.07); }
.review-summary.review { border-color: rgba(208,138,29,.36); background: rgba(208,138,29,.08); }
.review-summary.manual { border-color: rgba(217,83,79,.38); background: rgba(217,83,79,.08); }
.review-score { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 96px; }
.review-score strong { color: var(--ink-900); font-size: 1.75rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.review-score span { color: var(--ink-500); font-size: 0.75rem; }
.review-copy { flex: 1 1 auto; min-width: 0; }
.review-verdict { color: var(--ink-900); font-size: 0.9375rem; font-weight: 600; }
.review-list { margin: 6px 0 0; padding-left: 17px; font-size: 0.8125rem; line-height: 1.6; }
.review-list.danger { color: var(--red); }
.review-list.warn { color: var(--amber); }
.review-copy p { margin: 6px 0 0; }
.review-table { margin-top: 12px; border: 1px solid var(--line-soft); border-radius: 10px; overflow: hidden; }
.review-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; gap: 8px 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--line-soft); background: #fff; }
.review-row:last-child { border-bottom: 0; }
.review-row.manual { background: rgba(217,83,79,.05); }
.review-row.review { background: rgba(208,138,29,.05); }
.review-row.signature-row { grid-template-columns: 92px minmax(0, 1fr) auto; background: rgba(208,138,29,.07); }
.review-label { color: var(--ink-600); font-size: 0.8125rem; }
.review-value { color: var(--ink-900); font-size: 0.9375rem; font-weight: 500; word-break: break-word; }
.review-meta { display: flex; align-items: center; gap: 6px; }
.review-meta em { color: var(--ink-500); font-size: 0.75rem; font-style: normal; font-variant-numeric: tabular-nums; }
.review-reason { grid-column: 2 / -1; color: var(--ink-500); font-size: 0.75rem; line-height: 1.55; }
.review-extra { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; color: var(--ink-500); font-size: 0.75rem; }
.signature-disclaimer { display: flex; gap: 7px; margin-top: 10px; padding: 9px 11px; border-radius: 8px; background: rgba(208,138,29,.08); color: var(--ink-600); font-size: 0.75rem; line-height: 1.6; }
.signature-disclaimer .el-icon { flex: 0 0 auto; margin-top: 1px; color: var(--amber); }
.cell-toggle { margin-top: 8px; }
.cell-list { max-height: 260px; overflow: auto; margin-top: 6px; padding: 8px 10px; border-radius: 8px; background: #0f172a; }
.cell-item { display: flex; flex-wrap: wrap; gap: 8px; padding: 3px 0; color: #cbd5e1; font: 12px/1.6 ui-monospace, monospace; }
.cell-item code { color: #7dd3fc; }
.cell-item em { color: #fbbf24; font-style: normal; }
.cell-coord { color: #64748b; }
@media (max-width: 720px) {
  .review-row, .review-row.signature-row { grid-template-columns: minmax(0, 1fr) auto; }
  .review-label { grid-column: 1 / -1; }
  .review-reason { grid-column: 1 / -1; }
}
.low-confidence-block { margin-top: 15px; padding: 11px 12px; border: 1px solid rgba(208,138,29,.34); border-radius: 10px; background: rgba(208,138,29,.08); }
.low-confidence-block .section-kicker { display: flex; align-items: center; gap: 5px; color: var(--amber); }
.low-confidence-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 9px; }
.low-confidence-item { display: flex; align-items: center; gap: 6px; padding: 4px 9px; border: 1px solid var(--line-soft); border-radius: 999px; background: #fff; color: var(--ink-700); font-size: 0.8125rem; }
.low-confidence-block p { margin: 9px 0 0; }

/* ---------- 利润计算器 ---------- */
.profit-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.profit-inputs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.profit-input-group { min-width: 0; }
.profit-field-list { display: flex; flex-direction: column; gap: 10px; margin-top: 7px; }
.profit-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.profit-field-label { display: flex; align-items: baseline; gap: 4px; color: var(--ink-700); font-size: 0.8125rem; }
.profit-field-label em { color: var(--ink-500); font-size: 0.75rem; font-style: normal; }
.profit-field-hint { color: var(--ink-500); font-size: 0.75rem; line-height: 1.45; }
.formula-chain { margin: 0; padding: 0; list-style: none; counter-reset: formula; }
.formula-step { padding: 10px 0; border-bottom: 1px dashed var(--line-soft); }
.formula-step:last-child { border-bottom: 0; }
.formula-step-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.formula-step-head strong { color: var(--ink-900); font-size: 0.9375rem; }
.formula-value { color: var(--teal); font-size: 1.0625rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.formula-value.is-loss { color: var(--red); }
.formula-pending { color: var(--amber); font-size: 0.75rem; }
.formula-expr { display: block; margin-top: 4px; color: var(--ink-500); font-size: 0.8125rem; line-height: 1.5; word-break: break-word; }
.formula-missing { margin-top: 4px; color: var(--amber); font-size: 0.75rem; }
.formula-note { display: flex; gap: 5px; margin-top: 6px; color: var(--ink-500); font-size: 0.75rem; line-height: 1.5; }
.formula-note .el-icon { flex: 0 0 auto; margin-top: 1px; }
.net-profit-box { display: flex; align-items: baseline; gap: 8px; margin-top: 14px; padding: 13px 15px; border: 1px solid rgba(24,169,153,.34); border-radius: 11px; background: rgba(24,169,153,.08); }
.net-profit-box.is-loss { border-color: rgba(217,83,79,.36); background: rgba(217,83,79,.08); }
.net-profit-box > span:first-child { color: var(--ink-700); font-size: 0.875rem; }
.net-profit-box strong { margin-left: auto; color: var(--teal); font-size: 1.5rem; font-variant-numeric: tabular-nums; }
.net-profit-box.is-loss strong { color: var(--red); }
.element-inputs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.equation-list { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.equation-row { display: flex; gap: 8px; padding: 10px 12px; border: 1px solid var(--line-soft); border-radius: 9px; background: rgba(245,248,252,.5); }
.equation-row .el-icon { flex: 0 0 auto; margin-top: 2px; }
.equation-row.ok .el-icon { color: var(--teal); }
.equation-row.error .el-icon { color: var(--red); }
.equation-row.error { border-color: rgba(217,83,79,.34); background: rgba(217,83,79,.06); }
.equation-row.incomplete .el-icon { color: var(--amber); }
.equation-row code { color: var(--ink-900); font-size: 0.875rem; }
.equation-detail { margin-top: 3px; color: var(--ink-500); font-size: 0.75rem; font-variant-numeric: tabular-nums; }

/* ---------- 分录生成器 ---------- */
.entry-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.entry-hits { margin-top: 16px; }
.entry-hit { display: block; width: 100%; padding: 9px 11px; margin-top: 7px; border: 1px solid var(--line-soft); border-radius: 9px; background: #fff; text-align: left; cursor: pointer; }
.entry-hit strong { display: block; color: var(--ink-900); font-size: 0.875rem; }
.entry-hit span { display: block; margin-top: 2px; }
.entry-hit:hover { border-color: var(--teal); }
.entry-hit.is-active { border-color: var(--teal); background: rgba(24,169,153,.08); }
.entry-controls { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; }
.pick-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 16px; }
.pick-section + .pick-section { margin-top: 12px; }
.pick-section-label { display: flex; align-items: center; gap: 7px; color: var(--ink-600); font-size: 0.8125rem; }
.pick-exclusive { padding: 1px 7px; border-radius: 999px; background: rgba(24,169,153,.12); color: var(--teal); font-size: 0.75rem; font-style: normal; font-variant-numeric: tabular-nums; }
.pick-list { display: flex; flex-direction: column; gap: 6px; margin-top: 7px; }
.pick-item { display: flex; align-items: flex-start; gap: 9px; padding: 8px 10px; border: 1px solid var(--line-soft); border-radius: 8px; cursor: pointer; }
.pick-item.is-off { opacity: .45; }
.pick-item input { margin-top: 3px; flex: 0 0 auto; }
.pick-side { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 6px; font-size: 0.8125rem; font-weight: 600; line-height: 22px; text-align: center; }
.pick-item.debit .pick-side { color: var(--teal); background: rgba(24,169,153,.12); }
.pick-item.credit .pick-side { color: var(--blue); background: rgba(64,120,255,.12); }
.pick-account { color: var(--ink-700); font-size: 0.8125rem; line-height: 1.5; }
.pick-account code { color: var(--ink-500); font-size: 0.75rem; }
.pick-account em { display: block; color: var(--ink-500); font-size: 0.75rem; font-style: normal; }
.entry-issues { margin: 10px 0 0; padding-left: 18px; color: var(--amber); font-size: 0.8125rem; line-height: 1.6; }
.entry-balance { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; padding: 11px 13px; border: 1px solid var(--line-soft); border-radius: 9px; background: rgba(245,248,252,.6); color: var(--ink-500); font-size: 0.875rem; }
.entry-balance strong { color: var(--ink-900); font-variant-numeric: tabular-nums; }
.entry-balance.is-balanced { border-color: rgba(24,169,153,.34); background: rgba(24,169,153,.07); }
.entry-balance.is-balanced strong { color: var(--teal); }
.entry-preview-title { color: var(--ink-900); font-size: 1rem; font-weight: 600; }
.entry-line { display: flex; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px dashed var(--line-soft); }
.entry-line:last-of-type { border-bottom: 0; }
.entry-side-tag { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 6px; font-size: 0.8125rem; font-weight: 600; line-height: 24px; text-align: center; }
.entry-line.debit .entry-side-tag { color: var(--teal); background: rgba(24,169,153,.12); }
.entry-line.credit .entry-side-tag { color: var(--blue); background: rgba(64,120,255,.12); }
.entry-account { flex: 1 1 auto; min-width: 0; }
.entry-account strong { display: block; color: var(--ink-900); font-size: 0.875rem; }
.entry-account em { display: block; color: var(--ink-500); font-size: 0.75rem; font-style: normal; }
.entry-code { flex: 0 0 auto; color: var(--ink-500); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.entry-amount { flex: 0 0 auto; min-width: 88px; text-align: right; color: var(--ink-900); font-size: 0.9375rem; font-variant-numeric: tabular-nums; }
.entry-formula { margin-top: 14px; padding: 10px 12px; border: 1px dashed var(--line-strong); border-radius: 9px; }
.entry-formula code { display: block; margin-top: 5px; color: var(--ink-700); font-size: 0.8125rem; line-height: 1.5; word-break: break-word; }
.rule-list { display: flex; flex-wrap: wrap; gap: 6px; }
.rule-chip { padding: 5px 10px; border: 1px solid var(--line-soft); border-radius: 999px; background: #fff; color: var(--ink-700); font-size: 0.8125rem; cursor: pointer; }
.rule-chip:hover { border-color: var(--teal); color: var(--teal); }
.rule-chip.is-active { border-color: var(--teal); background: rgba(24,169,153,.1); color: var(--teal); font-weight: 600; }
@media (max-width: 900px) {
  .profit-layout, .entry-layout, .profit-inputs, .entry-controls, .element-inputs { grid-template-columns: minmax(0, 1fr); }
}
.tall-empty { min-height: 360px; }
.basics-side { display: flex; flex-direction: column; gap: 12px; }
.basics-card-title { display: flex; align-items: flex-start; gap: 7px; color: var(--ink-900); font-size: 0.875rem; line-height: 1.5; }
.basics-card-title .el-icon { flex: 0 0 auto; color: var(--blue); margin-top: 1px; }
.basics-card-title strong { font-weight: 700; }
.basics-side p { margin: 7px 0 0; color: var(--ink-500); font-size: 0.875rem; line-height: 1.6; }
.answer-card { margin-top: 16px; border: 1px solid rgba(47,111,228,.15); background: linear-gradient(135deg, rgba(238,245,255,.78), rgba(255,255,255,.48)) !important; }
.answer-card strong { display: block; margin-top: 8px; color: var(--ink-900); font-size: 1rem; line-height: 1.7; }
.answer-card ul { margin: 10px 0 0; padding-left: 18px; color: var(--ink-500); font-size: 0.875rem; line-height: 1.7; }
.answer-card li + li { margin-top: 4px; }
@media (max-width: 900px) { .accounting-grid, .voucher-layout, .basics-layout { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .class-card-grid { grid-template-columns: 1fr; } .query-row { flex-direction: column; } .class-filter { width: 100%; } .score-row { align-items: flex-start; flex-direction: column; } }
</style>
