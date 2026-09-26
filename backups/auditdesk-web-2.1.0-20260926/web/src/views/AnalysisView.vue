<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import {
  ArrowDown,
  Calendar,
  Check,
  CircleCheckFilled,
  CopyDocument,
  DataAnalysis,
  Download,
  Files,
  Filter,
  Grid,
  InfoFilled,
  List,
  MagicStick,
  PieChart,
  Plus,
  Refresh,
  ScaleToOriginal,
  Search,
  Tickets,
  TrendCharts,
  UploadFilled,
  WarningFilled
} from '@element-plus/icons-vue'
import { auditTools } from '../lib/audit-tools'
import { SAMPLE_CASES, SAMPLE_CSV, runSampleValidation } from '../lib/sample-validation'
import { formatNumber, formatPercent, shortFileName, todayInputValue } from '../lib/format'

const dataset = shallowRef(null)
const activeTool = ref('benford')
const result = ref(null)
const fileInput = ref(null)
const toolFilterInput = ref(null)
const isDragging = ref(false)
const isReading = ref(false)
const toolFilter = ref('')
const validationResults = ref(null)
const validationRunning = ref(false)

const tools = [
  { id: 'benford', name: '本福特定律', desc: '首位数字分布', icon: TrendCharts },
  { id: 'duplicates', name: '重复检查', desc: '关键字段重复', icon: CopyDocument },
  { id: 'gaps', name: '断号检查', desc: '编号连续性', icon: Tickets },
  { id: 'aging', name: '账龄分析', desc: '按日期分层', icon: Calendar },
  { id: 'stratify', name: '分层汇总', desc: '分组求和', icon: PieChart },
  { id: 'sampling', name: '审计抽样', desc: '样本量与随机样本', icon: Grid },
  { id: 'journals', name: '凭证筛查', desc: '异常入账线索', icon: List },
  { id: 'trialBalance', name: '试算平衡', desc: '借贷合计核对', icon: ScaleToOriginal }
]
const toolMap = Object.fromEntries(tools.map((tool) => [tool.id, tool]))
const filteredTools = computed(() => {
  const keyword = toolFilter.value.trim().toLowerCase()
  if (!keyword) return tools
  return tools.filter((tool) => `${tool.name}${tool.desc}`.toLowerCase().includes(keyword))
})
const activeToolMeta = computed(() => toolMap[activeTool.value] || tools[0])
const hasDataset = computed(() => Boolean(dataset.value?.headers?.length))
const resultRows = computed(() => result.value?.rows || [])
const resultHeaders = computed(() => result.value?.headers || [])
const downloadVisible = computed(() => Boolean(result.value?.download))
const benfordMax = computed(() => Math.max(...((result.value?.chart || []).map((row) => row.count)), 1))

const params = reactive({
  amount: '',
  key1: '',
  key2: '',
  sequence: '',
  date: '',
  asOf: todayInputValue(),
  group: '',
  population: null,
  confidence: 0.95,
  tolerable: 5,
  expected: 1,
  seed: 20250101,
  description: '',
  largeAmount: 100000,
  debit: '',
  credit: ''
})

function guessColumn(headers, keywords) {
  for (const keyword of keywords) {
    const found = headers.find((header) => header.includes(keyword))
    if (found) return found
  }
  return headers[0] || ''
}

function setDefaultParams() {
  const headers = dataset.value?.headers || []
  params.amount = guessColumn(headers, ['金额', '借方', '发生额', '余额'])
  params.key1 = guessColumn(headers, ['发票号', '凭证号', '单号', '编号'])
  params.key2 = ''
  params.sequence = guessColumn(headers, ['编号', '单号', '凭证号', '发票号'])
  params.date = guessColumn(headers, ['日期', '发生日期', '入账日期', '记账日期'])
  params.asOf = todayInputValue()
  params.group = guessColumn(headers, ['类别', '科目', '部门', '客户'])
  params.population = dataset.value?.data?.length || null
  params.description = guessColumn(headers, ['摘要', '说明', '备注'])
  params.largeAmount = 100000
  params.debit = guessColumn(headers, ['借方', '借'])
  params.credit = guessColumn(headers, ['贷方', '贷'])
}

function chooseTool(id) {
  if (!toolMap[id]) return
  activeTool.value = id
  result.value = null
  nextTick(() => document.querySelector('.tool-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function openFilePicker() {
  fileInput.value?.click()
}

function handleFile(file) {
  if (!file) return
  isReading.value = true
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const text = auditTools.decodeFile(new Uint8Array(reader.result))
      const table = auditTools.toTable(auditTools.parseCSV(text))
      if (!table.headers.length || !table.data.length) throw new Error('没有读取到有效数据行')
      dataset.value = table
      setDefaultParams()
      result.value = null
    } catch (error) {
      result.value = { error: `文件解析失败：${error.message || error}` }
    } finally {
      isReading.value = false
    }
  }
  reader.onerror = () => {
    isReading.value = false
    result.value = { error: '文件读取失败，请重试。' }
  }
  reader.readAsArrayBuffer(file)
}

function handleFileChange(event) {
  handleFile(event.target.files?.[0])
  event.target.value = ''
}

function handleDrag(event, state) {
  event.preventDefault()
  isDragging.value = state
}
function handleDrop(event) {
  event.preventDefault()
  isDragging.value = false
  handleFile(event.dataTransfer?.files?.[0])
}

function loadSample() {
  const table = auditTools.toTable(auditTools.parseCSV(SAMPLE_CSV))
  dataset.value = { ...table, filename: '样例台账：审计工具综合示例.csv' }
  setDefaultParams()
  result.value = null
}

function runValidation() {
  validationRunning.value = true
  // 让按钮先进入加载状态，再执行本地确定性样例检查。
  window.setTimeout(() => {
    validationResults.value = runSampleValidation()
    validationRunning.value = false
  }, 0)
}

function clearDataset() {
  dataset.value = null
  result.value = null
}

function rowsFromObjects(rows, headers) {
  return rows.map((row) => headers.map((header) => row[header] ?? ''))
}

function runAnalysis() {
  if (!dataset.value) {
    result.value = { error: '请先导入 CSV 台账，或载入示例数据。' }
    return
  }
  const headers = dataset.value.headers
  const data = dataset.value.data
  try {
    if (activeTool.value === 'benford') {
      const analysis = auditTools.benford(data.map((row) => row[params.amount]))
      result.value = {
        title: '本福特定律检验',
        description: `金额列：${params.amount || '未选择'} · 自由度 8，显著性 5% 临界值 15.51`,
        metrics: [
          { label: '有效样本', value: analysis.n },
          { label: '卡方统计量', value: analysis.chi2.toFixed(2), tone: analysis.chi2 > 15.51 ? 'warn' : 'good' },
          { label: '判断', value: analysis.verdict, tone: analysis.chi2 > 15.51 ? 'warn' : 'good' }
        ],
        chart: analysis.rows,
        headers: ['首位', '频数', '实际占比', '理论占比', '差异'],
        rows: analysis.rows.map((row) => [row.digit, row.count, formatPercent(row.actual * 100), formatPercent(row.expected * 100), formatPercent(row.diff * 100)]),
        download: { name: 'benford.csv', headers: ['digit', 'count', 'actual', 'expected', 'diff'], rows: analysis.rows.map((row) => [row.digit, row.count, row.actual, row.expected, row.diff]) }
      }
    } else if (activeTool.value === 'duplicates') {
      const keys = [params.key1, params.key2].filter(Boolean)
      const groups = auditTools.duplicates(data, keys.length ? keys : [headers[0]])
      const affected = groups.reduce((sum, group) => sum + group.count, 0)
      result.value = {
        title: '重复记录检查',
        description: `检查字段：${keys.join(' + ') || headers[0]} · 行号从第 2 行开始`,
        metrics: [
          { label: '重复组数', value: groups.length, tone: groups.length ? 'warn' : 'good' },
          { label: '涉及记录', value: affected, tone: affected ? 'warn' : 'good' },
          { label: '处理建议', value: groups.length ? '逐组核对业务真实性' : '未发现重复', tone: groups.length ? 'warn' : 'good' }
        ],
        headers: ['重复键', '次数', '原始行号'],
        rows: groups.map((group) => [group.key, group.count, group.rows.map((row) => row.line).join('、')]),
        download: { name: 'duplicates.csv', headers: ['key', 'count', 'lines'], rows: groups.map((group) => [group.key, group.count, group.rows.map((row) => row.line).join(';')]) }
      }
    } else if (activeTool.value === 'gaps') {
      const analysis = auditTools.gaps(data, params.sequence)
      result.value = {
        title: '编号连续性检查',
        description: `编号列：${params.sequence || '未选择'} · 仅对有效整数检查`,
        metrics: [
          { label: '编号范围', value: analysis.min === undefined ? '-' : `${analysis.min} — ${analysis.max}` },
          { label: '缺失号码', value: analysis.missing.length, tone: analysis.missing.length ? 'warn' : 'good' },
          { label: '处理建议', value: analysis.missing.length ? '追查缺失编号去向' : '编号连续', tone: analysis.missing.length ? 'warn' : 'good' }
        ],
        headers: ['缺失编号'],
        rows: analysis.missing.map((number) => [number]),
        note: analysis.note,
        download: { name: 'gaps.csv', headers: ['missing_no'], rows: analysis.missing.map((number) => [number]) }
      }
    } else if (activeTool.value === 'aging') {
      const analysis = auditTools.aging(data, params.date, params.amount, params.asOf)
      const overOneYear = analysis.buckets[5].total
      result.value = {
        title: '往来账龄分析',
        description: `基准日：${params.asOf || '今天'} · 日期列：${params.date || '未选择'}`,
        warning: analysis.badDate ? `有 ${analysis.badDate} 行日期无法识别，已从统计中跳过。` : '',
        metrics: [
          { label: '有效金额合计', value: formatNumber(analysis.total) },
          { label: '365 天以上', value: formatNumber(overOneYear), tone: overOneYear ? 'warn' : 'good' },
          { label: '长期款项占比', value: formatPercent(analysis.total ? overOneYear / analysis.total * 100 : 0), tone: overOneYear ? 'warn' : 'good' }
        ],
        headers: ['账龄段', '笔数', '金额', '占比'],
        rows: analysis.buckets.map((bucket) => [bucket.name, bucket.count, formatNumber(bucket.total), formatPercent(analysis.total ? bucket.total / analysis.total * 100 : 0)]),
        note: '账龄结果是筛选线索，不能单独证明坏账或错报。',
        download: { name: 'aging.csv', headers: ['bucket', 'count', 'total', 'pct'], rows: analysis.buckets.map((bucket) => [bucket.name, bucket.count, bucket.total, analysis.total ? bucket.total / analysis.total : 0]) }
      }
    } else if (activeTool.value === 'stratify') {
      const analysis = auditTools.stratify(data, params.group, params.amount)
      const stats = auditTools.describe(data.map((row) => row[params.amount]))
      result.value = {
        title: '分组汇总分析',
        description: `分组列：${params.group || '未选择'} · 金额列：${params.amount || '未选择'}`,
        metrics: [
          { label: '分组数量', value: analysis.rows.length },
          { label: '金额合计', value: formatNumber(analysis.grand) },
          { label: '均值 / 中位数', value: stats ? `${formatNumber(stats.mean)} / ${formatNumber(stats.median)}` : '-' }
        ],
        headers: ['分组', '笔数', '金额合计', '占比'],
        rows: analysis.rows.map((row) => [row.group, row.count, formatNumber(row.total), formatPercent(row.pct)]),
        download: { name: 'stratify.csv', headers: ['group', 'count', 'total', 'pct'], rows: analysis.rows.map((row) => [row.group, row.count, row.total, row.pct]) }
      }
    } else if (activeTool.value === 'sampling') {
      const population = Number(params.population) || data.length
      const confidence = Number(params.confidence)
      const tolerable = Number(params.tolerable) / 100
      const expected = Number(params.expected) / 100
      const seed = Number(params.seed) || 1
      const sample = auditTools.sampleSize(population, confidence, tolerable, expected)
      const picked = auditTools.pickRandom(data, sample.n, seed)
      const sampleRows = rowsFromObjects(picked, headers)
      result.value = {
        title: '属性抽样与样本抽取',
        description: `N=${population}，置信度 ${formatPercent(confidence * 100, 0)}，可容忍偏差 ${formatPercent(tolerable * 100)}，预期偏差 ${formatPercent(expected * 100)}`,
        metrics: [
          { label: '建议样本量', value: sample.n, tone: 'good' },
          { label: '实际抽取', value: picked.length },
          { label: '随机种子', value: seed }
        ],
        headers: ['抽样行号', ...headers],
        rows: sampleRows.map((row, index) => [picked[index].line, ...row]),
        note: '请将随机种子与抽样参数记入底稿；样本结果需结合总体特征与风险判断复核。',
        download: { name: 'sample.csv', headers: ['line', ...headers], rows: sampleRows.map((row, index) => [picked[index].line, ...row]) }
      }
    } else if (activeTool.value === 'journals') {
      const analysis = auditTools.journalTests(data, params.date, params.amount, params.description, Number(params.largeAmount) || 100000)
      const sections = [
        { name: '周末入账', rows: analysis.weekend },
        { name: '千元整数金额', rows: analysis.round },
        { name: '超过大额阈值', rows: analysis.big },
        { name: '摘要为空', rows: analysis.blank }
      ]
      const allRows = []
      sections.forEach((section) => section.rows.forEach((row) => allRows.push([section.name, row.line, ...headers.map((header) => row[header] ?? '')])))
      result.value = {
        title: '凭证异常筛查',
        description: `大额阈值：${formatNumber(params.largeAmount)} 元 · 当前规则识别的是待复核线索`,
        metrics: sections.map((section) => ({ label: section.name, value: section.rows.length, tone: section.rows.length ? 'warn' : 'good' })),
        headers: ['筛查类型', '原始行号', ...headers],
        rows: allRows,
        note: '周末、整数金额和大额交易均不能单独视为异常，应结合审批、合同、发票及业务实质复核。',
        download: { name: 'journal_flags.csv', headers: ['type', 'line', ...headers], rows: allRows }
      }
    } else if (activeTool.value === 'trialBalance') {
      const analysis = auditTools.trialBalance(data, params.debit, params.credit)
      result.value = {
        title: '试算平衡检查',
        description: `借方列：${params.debit || '未选择'} · 贷方列：${params.credit || '未选择'}`,
        metrics: [
          { label: '借方合计', value: formatNumber(analysis.dr) },
          { label: '贷方合计', value: formatNumber(analysis.cr) },
          { label: '差额', value: formatNumber(analysis.diff), tone: analysis.balanced ? 'good' : 'bad' }
        ],
        headers: ['检查项目', '结果'],
        rows: [
          ['借贷是否平衡', analysis.balanced ? '是' : '否'],
          ['空值或非数字行', analysis.badRows.length],
          ['差额', formatNumber(analysis.diff)]
        ],
        warning: analysis.badRows.length ? `第 ${analysis.badRows.join('、')} 行借贷均为空或非数字，已跳过。` : '',
        note: '不平衡时请检查公式、漏行、借贷方向和本位币折算。'
      }
    }
  } catch (error) {
    result.value = { error: `分析失败：${error.message || error}` }
  }
}

function downloadResult() {
  if (result.value?.download) auditTools.downloadCSV(result.value.download.name, result.value.download.headers, result.value.download.rows)
}

function openImportFromShell() { openFilePicker() }
function focusToolSearch() { toolFilterInput.value?.focus() }
onMounted(() => {
  window.addEventListener('auditdesk:import', openImportFromShell)
  window.addEventListener('auditdesk:focus-search', focusToolSearch)
})
onBeforeUnmount(() => {
  window.removeEventListener('auditdesk:import', openImportFromShell)
  window.removeEventListener('auditdesk:focus-search', focusToolSearch)
})
</script>

<template>
  <div>
    <el-alert v-if="!hasDataset" class="mb-16" type="info" :closable="false" show-icon>
      <template #title>所有分析均在当前浏览器完成</template>
      <template #default>导入 CSV 台账后选择审计程序。结果用于快速筛选和复核线索，不自动替代审计结论。</template>
    </el-alert>

    <div class="stat-grid">
      <div class="stat-card is-accent">
        <div class="stat-label"><el-icon><Files /></el-icon>当前数据源</div>
        <div class="stat-value">{{ hasDataset ? formatNumber(dataset.data.length) : '—' }}</div>
        <div class="stat-hint">{{ hasDataset ? '行记录已载入内存' : '等待导入台账' }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label"><el-icon><Grid /></el-icon>可用程序</div>
        <div class="stat-value">{{ tools.length }}</div>
        <div class="stat-hint">确定性规则，可复现</div>
      </div>
      <div class="stat-card">
        <div class="stat-label"><el-icon><MagicStick /></el-icon>处理方式</div>
        <div class="stat-value" style="font-size:19px">本地内存</div>
        <div class="stat-hint">不上传原始文件</div>
      </div>
      <div class="stat-card">
        <div class="stat-label"><el-icon><Check /></el-icon>结果状态</div>
        <div class="stat-value" style="font-size:19px">{{ result ? (result.error ? '需处理' : '已生成') : '待执行' }}</div>
        <div class="stat-hint">{{ result?.title || '选择程序后开始' }}</div>
      </div>
    </div>

    <el-card v-if="validationResults" class="surface validation-card" shadow="never">
      <div class="surface-header">
        <div><h2 class="surface-title">工具样例验证</h2><p class="surface-subtitle">使用本地合成数据逐一执行 8 个确定性程序，不调用外部 API。</p></div>
        <el-button size="small" plain :loading="validationRunning" @click="runValidation"><el-icon><Refresh /></el-icon>重新验证</el-button>
      </div>
      <div class="validation-summary"><strong>{{ validationResults.filter((item) => item.passed).length }}/{{ validationResults.length }}</strong><span>项通过</span><el-tag :type="validationResults.every((item) => item.passed) ? 'success' : 'danger'" effect="light">{{ validationResults.every((item) => item.passed) ? '全部通过' : '存在失败项' }}</el-tag></div>
      <div class="validation-grid">
        <div v-for="item in validationResults" :key="item.id" class="validation-item" :class="{ 'is-failed': !item.passed }">
          <div class="validation-item-title"><el-icon><CircleCheckFilled v-if="item.passed" /><WarningFilled v-else /></el-icon><strong>{{ item.name }}</strong><span>{{ item.passed ? 'PASS' : 'FAIL' }}</span></div>
          <p>{{ item.detail }}</p>
        </div>
      </div>
    </el-card>

    <div class="tool-layout">
      <el-card class="surface tool-sidebar" shadow="never">
        <p class="tool-sidebar-title">审计程序</p>
        <el-input v-model="toolFilter" ref="toolFilterInput" class="mb-12" size="small" clearable placeholder="筛选程序">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <div class="tool-list">
          <button v-for="tool in filteredTools" :key="tool.id" class="tool-list-button" :class="{ 'is-active': activeTool === tool.id }" type="button" :data-tool="tool.id" @click="chooseTool(tool.id)">
            <el-icon><component :is="tool.icon" /></el-icon>
            <span class="tool-list-copy">
              <span class="tool-list-name">{{ tool.name }}</span>
              <span class="tool-list-desc">{{ tool.desc }}</span>
            </span>
            <el-icon v-if="activeTool === tool.id" class="tool-list-check"><Check /></el-icon>
          </button>
        </div>
        <div class="tool-sidebar-note">
          <el-icon><InfoFilled /></el-icon>
          <span>程序只做规则计算。发现异常后，请回到凭证、合同和函证等证据进行判断。</span>
        </div>
      </el-card>

      <div class="tool-workspace">
        <el-card class="surface" shadow="never">
          <div class="surface-header">
            <div>
              <h2 class="surface-title">导入台账</h2>
              <p class="surface-subtitle">支持 UTF-8 / GBK 编码的 CSV、TSV、TXT 文件；文件只在当前页面内处理。</p>
            </div>
            <el-button v-if="hasDataset" text type="danger" @click="clearDataset">清除数据</el-button>
          </div>
          <input ref="fileInput" class="visually-hidden" type="file" aria-label="选择审计台账文件" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" @change="handleFileChange" />
          <div v-if="!hasDataset" class="drop-zone" :class="{ 'is-dragging': isDragging }" @click="openFilePicker" @dragover="handleDrag($event, true)" @dragenter="handleDrag($event, true)" @dragleave="handleDrag($event, false)" @drop="handleDrop">
            <div class="drop-icon"><el-icon><UploadFilled /></el-icon></div>
            <div class="drop-title">点击选择文件，或将 CSV 拖到这里</div>
            <div class="drop-hint">建议使用 Excel“另存为 CSV UTF-8”；单次建议不超过 20 万行</div>
            <el-button class="mt-16" size="small" text type="primary" :loading="isReading" @click.stop="openFilePicker">选择文件</el-button>
          </div>
          <div v-else class="file-summary">
            <el-icon><Files /></el-icon>
            <div class="file-summary-copy">
              <div class="file-summary-name" :title="dataset.filename">{{ dataset.filename || '当前数据' }}</div>
              <div class="file-summary-meta">{{ formatNumber(dataset.data.length) }} 行 · {{ dataset.headers.length }} 列 · {{ shortFileName(dataset.filename || '内存数据') }}</div>
            </div>
            <el-button text type="primary" @click="openFilePicker">更换文件</el-button>
          </div>
          <div class="flex-between mt-16 flex-wrap">
            <span class="text-muted text-small">还没有文件？先用示例数据体验完整流程。</span>
            <div class="flex-wrap"><el-button size="small" text type="primary" :loading="validationRunning" @click="runValidation"><el-icon><CircleCheckFilled /></el-icon>验证全部工具</el-button><el-button size="small" text type="primary" @click="loadSample"><el-icon><MagicStick /></el-icon>载入示例台账</el-button><el-button size="small" text tag="a" href="./samples/audit-tool-demo.csv" download><el-icon><Download /></el-icon>下载样例 CSV</el-button></div>
          </div>
        </el-card>

        <el-card class="surface" shadow="never">
          <div class="surface-header">
            <div>
              <h2 class="surface-title">{{ activeToolMeta.name }}参数</h2>
              <p class="surface-subtitle">{{ activeToolMeta.desc }} · 结果可下载为 CSV</p>
            </div>
            <el-tag type="info" effect="plain">确定性程序</el-tag>
          </div>
          <el-form v-if="hasDataset" label-position="top" :model="params">
            <div v-if="activeTool === 'benford'" class="form-grid">
              <el-form-item class="span-4" label="金额列"><el-select v-model="params.amount" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
            </div>
            <div v-else-if="activeTool === 'duplicates'" class="form-grid">
              <el-form-item class="span-4" label="关键列 1"><el-select v-model="params.key1" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-4" label="关键列 2（可选）"><el-select v-model="params.key2" clearable filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
            </div>
            <div v-else-if="activeTool === 'gaps'" class="form-grid">
              <el-form-item class="span-4" label="编号列"><el-select v-model="params.sequence" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
            </div>
            <div v-else-if="activeTool === 'aging'" class="form-grid">
              <el-form-item class="span-4" label="日期列"><el-select v-model="params.date" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-4" label="金额列"><el-select v-model="params.amount" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-4" label="账龄基准日"><el-date-picker v-model="params.asOf" type="date" value-format="YYYY-MM-DD" placeholder="默认今天" /></el-form-item>
            </div>
            <div v-else-if="activeTool === 'stratify'" class="form-grid">
              <el-form-item class="span-4" label="分组列"><el-select v-model="params.group" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-4" label="金额列"><el-select v-model="params.amount" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
            </div>
            <div v-else-if="activeTool === 'sampling'" class="form-grid">
              <el-form-item class="span-3" label="总体规模 N"><el-input-number v-model="params.population" :min="1" :max="100000000" controls-position="right" /></el-form-item>
              <el-form-item class="span-3" label="置信水平"><el-select v-model="params.confidence"><el-option label="90%" :value="0.9" /><el-option label="95%" :value="0.95" /><el-option label="99%" :value="0.99" /></el-select></el-form-item>
              <el-form-item class="span-3" label="可容忍偏差率 %"><el-input-number v-model="params.tolerable" :min="0.1" :max="100" :step="0.5" controls-position="right" /></el-form-item>
              <el-form-item class="span-3" label="预期偏差率 %"><el-input-number v-model="params.expected" :min="0" :max="99" :step="0.5" controls-position="right" /></el-form-item>
              <el-form-item class="span-4" label="随机种子"><el-input-number v-model="params.seed" :min="1" controls-position="right" /></el-form-item>
            </div>
            <div v-else-if="activeTool === 'journals'" class="form-grid">
              <el-form-item class="span-3" label="日期列"><el-select v-model="params.date" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-3" label="金额列"><el-select v-model="params.amount" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-3" label="摘要列"><el-select v-model="params.description" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-3" label="大额阈值（元）"><el-input-number v-model="params.largeAmount" :min="1" :step="1000" controls-position="right" /></el-form-item>
            </div>
            <div v-else-if="activeTool === 'trialBalance'" class="form-grid">
              <el-form-item class="span-4" label="借方列"><el-select v-model="params.debit" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
              <el-form-item class="span-4" label="贷方列"><el-select v-model="params.credit" filterable><el-option v-for="header in dataset.headers" :key="header" :label="header" :value="header" /></el-select></el-form-item>
            </div>
            <div class="flex-between flex-wrap">
              <span class="text-muted text-small">字段可按实际台账调整；程序不会修改原始数据。</span>
              <el-button type="primary" @click="runAnalysis"><el-icon><MagicStick /></el-icon>执行分析</el-button>
            </div>
          </el-form>
          <div v-else class="result-empty"><div><el-icon><UploadFilled /></el-icon><div>导入数据后显示可配置参数</div></div></div>
        </el-card>

        <el-card class="surface" shadow="never">
          <div class="result-title">
            <div>
              <h3>{{ result?.title || '分析结果' }}</h3>
              <p>{{ result?.description || '执行程序后，指标、异常线索和明细表会显示在这里。' }}</p>
            </div>
            <el-button v-if="downloadVisible" size="small" type="primary" plain @click="downloadResult"><el-icon><Download /></el-icon>下载结果 CSV</el-button>
          </div>
          <el-alert v-if="result?.error" type="error" :closable="false" show-icon :title="result.error" />
          <template v-else-if="result">
            <div v-if="result.metrics" class="metric-grid">
              <div v-for="metric in result.metrics" :key="metric.label" class="metric-box">
                <div class="metric-box-label">{{ metric.label }}</div>
                <div class="metric-box-value" :class="metric.tone ? `is-${metric.tone}` : ''">{{ metric.value }}</div>
              </div>
            </div>
            <el-alert v-if="result.warning" class="mb-12" type="warning" :closable="false" show-icon :title="result.warning" />
            <template v-if="result.title === '本福特定律检验'">
              <div class="benford-chart">
                <div v-for="row in result.chart" :key="row.digit" class="chart-column">
                  <div class="chart-bars">
                    <div class="chart-bar actual" :style="{ height: `${Math.max(3, Math.round(row.count / benfordMax * 130))}px` }" :title="`实际 ${formatPercent(row.actual * 100)}`"></div>
                    <div class="chart-bar expected" :style="{ height: `${Math.max(3, Math.round(row.expected / 0.301 * 130))}px` }" :title="`理论 ${formatPercent(row.expected * 100)}`"></div>
                  </div>
                  <span class="chart-label">{{ row.digit }}</span>
                </div>
              </div>
              <div class="chart-legend"><span><i></i>实际占比</span><span><i class="expected"></i>本福特理论占比</span></div>
            </template>
            <div v-if="resultRows.length" class="data-table-wrap mt-16">
              <table class="data-table">
                <thead><tr><th v-for="header in resultHeaders" :key="header">{{ header }}</th></tr></thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in resultRows.slice(0, 100)" :key="rowIndex">
                    <td v-for="(cell, cellIndex) in row" :key="cellIndex" :class="{ num: cellIndex > 0, flag: String(cell).includes('不平衡') || String(cell).includes('异常') }">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-muted text-small">当前程序没有产生明细结果。</p>
            <p v-if="resultRows.length > 100" class="text-muted text-small">页面仅展示前 100 行，下载 CSV 可获得完整结果（共 {{ resultRows.length }} 行）。</p>
            <el-alert v-if="result.note" class="mt-16" type="info" :closable="false" show-icon :title="result.note" />
          </template>
          <div v-else class="result-empty"><div><el-icon><DataAnalysis /></el-icon><div>还没有分析结果</div></div></div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mb-12 { margin-bottom: 12px; }
.mb-16 { margin-bottom: 16px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tool-list-check { color: var(--blue); font-size: 13px; }
.tool-sidebar-note { display: flex; gap: 7px; margin-top: 18px; padding: 10px; border-radius: 10px; color: var(--ink-600); background: rgba(238,245,255,.55); font-size: 11px; line-height: 1.6; }
.tool-sidebar-note .el-icon { flex: 0 0 auto; color: var(--blue); margin-top: 2px; }
.validation-card { margin-bottom: 16px; }
.validation-summary { display: flex; align-items: baseline; gap: 8px; margin-bottom: 13px; color: var(--ink-500); }
.validation-summary strong { color: var(--ink-950); font-size: 25px; letter-spacing: -.03em; }
.validation-summary span { font-size: 12px; }
.validation-summary .el-tag { margin-left: auto; }
.validation-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.validation-item { padding: 11px 12px; border: 1px solid rgba(14,139,131,.15); border-radius: 10px; background: rgba(230,250,246,.45); }
.validation-item.is-failed { border-color: rgba(201,75,84,.2); background: rgba(255,240,242,.55); }
.validation-item-title { display: flex; align-items: center; gap: 6px; color: var(--teal); font-size: 12px; }
.validation-item.is-failed .validation-item-title { color: var(--red); }
.validation-item-title span { margin-left: auto; color: inherit; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; font-weight: 750; }
.validation-item p { margin: 6px 0 0; color: var(--ink-500); font-size: 10px; line-height: 1.5; }
@media (max-width: 900px) { .validation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .validation-grid { grid-template-columns: 1fr; } }
</style>
