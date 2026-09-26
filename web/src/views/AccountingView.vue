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
  Files,
  InfoFilled,
  MagicStick,
  Refresh,
  Search,
  Tickets,
  UploadFilled,
  WarningFilled
} from '@element-plus/icons-vue'
import { ACCOUNT_CLASSES, ACCOUNT_ENTRIES, ACCOUNTING_BASICS, answerAccountingQuestion, classifyAccount } from '../lib/accounting-data'
import { recognizeVoucherImage, terminateOcr } from '../lib/ocr'
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
function handleVoucherFile(file) {
  if (!file) return
  if (voucherPreview.value) URL.revokeObjectURL(voucherPreview.value)
  voucherFile.value = file
  voucherPreview.value = URL.createObjectURL(file)
  voucherResult.value = null
  ocrConfidence.value = null
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
    ocrStatus.value = `识别完成，置信度约 ${ocrConfidence.value}%`
  } catch (error) {
    ocrStatus.value = `识别失败：${error.message || error}`
  } finally {
    ocrRunning.value = false
  }
}
function checkVoucher() {
  voucherResult.value = validateVoucherText(voucherText.value, { ocrConfidence: ocrConfidence.value })
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
              </el-card>
              <el-card class="surface inner-surface mt-16" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">识别文字（可校对）</h3><p class="surface-subtitle">OCR 结果仅作为线索，请在检查前核对日期、金额和科目。</p></div><el-button size="small" type="primary" plain :disabled="!voucherText.trim()" @click="checkVoucher"><el-icon><MagicStick /></el-icon>检查凭证</el-button></div>
                <el-input v-model="voucherText" type="textarea" :rows="10" resize="vertical" placeholder="识别后的文字会显示在这里，也可以直接粘贴凭证文字进行形式检查。" />
                <div v-if="ocrConfidence !== null" class="text-muted text-small mt-12">OCR 置信度：{{ ocrConfidence }}%</div>
              </el-card>
            </div>
            <div>
              <el-card v-if="voucherResult" class="surface inner-surface voucher-result-card" shadow="never">
                <div class="surface-header"><div><h3 class="surface-title">形式检查结果</h3><p class="surface-subtitle">完整性、科目识别与借贷平衡</p></div><el-tag :type="voucherStatusType" effect="light">{{ voucherStatusText }}</el-tag></div>
                <div class="score-row"><el-progress type="dashboard" :percentage="voucherResult.score" :width="116" :color="voucherResult.score >= 90 ? '#18a999' : voucherResult.score >= 60 ? '#d08a1d' : '#d9534f'"><template #default="{ percentage }"><strong class="score-number">{{ percentage }}</strong><span class="score-label">完整度</span></template></el-progress><div class="score-copy"><div v-if="voucherResult.missing.length" class="missing-title"><el-icon><WarningFilled /></el-icon>缺少或未通过：</div><div v-if="voucherResult.missing.length" class="missing-chips"><el-tag v-for="item in voucherResult.missing" :key="item" type="danger" size="small" effect="light">{{ item }}</el-tag></div><div v-else class="missing-title success-text"><el-icon><CircleCheckFilled /></el-icon>未发现形式要素缺失</div><p v-if="voucherResult.warnings.length" class="text-muted text-small">需留意：{{ voucherResult.warnings.join('、') }}</p></div></div>
                <div class="check-list"><div v-for="check in voucherResult.checks" :key="check.id" class="check-row"><el-icon :class="check.status === 'pass' ? 'check-pass' : check.status === 'warn' ? 'check-warn' : 'check-fail'"><CircleCheckFilled v-if="check.status === 'pass'" /><WarningFilled v-else-if="check.status === 'warn'" /><InfoFilled v-else /></el-icon><div><strong>{{ check.label }}</strong><span>{{ check.detail }}</span></div></div></div>
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
.check-row { display: flex; gap: 8px; padding: 8px 0; }
.check-row > .el-icon { flex: 0 0 auto; margin-top: 1px; }
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
