<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Delete, Document, DocumentChecked, Plus, Printer, WarningFilled } from '@element-plus/icons-vue'

const templateDefinitions = [
  { id: 'bank', name: '银行询证函', desc: '银行存款、借款、担保、理财', icon: '🏦' },
  { id: 'ar', name: '往来款询证函', desc: '应收、应付、预付等往来款', icon: '↔' },
  { id: 'inventory', name: '存货监盘表', desc: '盘点记录、差异、截止号码', icon: '▦' },
  { id: 'adjustment', name: '审计调整汇总表', desc: '可增删行，自动合计借贷', icon: '±' }
]
const activeTemplate = ref('bank')
const form = reactive({
  firm: '', bank: '', target: '', client: '', date: '', number: '', subject: '应收账款', amount: '',
  place: '', scope: '', auditor: '', keeper: '', period: '', inventoryRows: [], adjustmentRows: []
})

function blankInventoryRow() {
  return { name: '', book: '', actual: '', difference: '', note: '' }
}
function blankAdjustmentRow() {
  return { description: '', debitAccount: '', debit: '', creditAccount: '', credit: '' }
}
function resetForm() {
  Object.assign(form, {
    firm: '', bank: '', target: '', client: '', date: '', number: activeTemplate.value === 'bank' ? 'YH-001' : 'WZ-001', subject: '应收账款', amount: '',
    place: '', scope: '', auditor: '', keeper: '', period: '', inventoryRows: [blankInventoryRow()], adjustmentRows: [blankAdjustmentRow()]
  })
}
resetForm()
watch(activeTemplate, resetForm)

const activeMeta = computed(() => templateDefinitions.find((item) => item.id === activeTemplate.value))
const adjustmentTotals = computed(() => form.adjustmentRows.reduce((totals, row) => {
  totals.debit += Number(String(row.debit || '').replace(/,/g, '').replace(/[￥¥$]/g, '')) || 0
  totals.credit += Number(String(row.credit || '').replace(/,/g, '').replace(/[￥¥$]/g, '')) || 0
  return totals
}, { debit: 0, credit: 0 }))
const adjustmentBalanced = computed(() => Math.abs(adjustmentTotals.value.debit - adjustmentTotals.value.credit) < 0.01)

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
function money(value) {
  return (Number(value) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function todayText() {
  const date = new Date()
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
function signRow(inventory) {
  const actual = Number(String(inventory.actual || '').replace(/,/g, '')) || 0
  const book = Number(String(inventory.book || '').replace(/,/g, '')) || 0
  inventory.difference = String(actual - book)
}
function addInventoryRow() { form.inventoryRows.push(blankInventoryRow()) }
function removeInventoryRow(index) { if (form.inventoryRows.length > 1) form.inventoryRows.splice(index, 1) }
function addAdjustmentRow() { form.adjustmentRows.push(blankAdjustmentRow()) }
function removeAdjustmentRow(index) { if (form.adjustmentRows.length > 1) form.adjustmentRows.splice(index, 1) }

const previewHtml = computed(() => {
  const value = form
  const date = todayText()
  if (activeTemplate.value === 'bank') {
    return `<div class="document-paper"><div style="text-align:right;color:#6b7280;font-size: 0.875rem">编号：${escapeHtml(value.number)}</div><h2>银行询证函</h2><p><strong>${escapeHtml(value.bank || '________________')}</strong>：</p><p>本会计师事务所（${escapeHtml(value.firm || '________________')}）受托审计<strong>${escapeHtml(value.client || '________________')}</strong>的财务报表。按照中国注册会计师审计准则的要求，应当询证其与贵行相关的账户余额等信息。现需向贵行函证截至 <strong>${escapeHtml(value.date || '____年__月__日')}</strong> 的下列信息，请直接回函至本所。回函地址以本函落款为准，回函请加盖贵行业务章。</p><table><tr><th style="width:48%">项目</th><th>请贵行填写（金额：人民币元）</th></tr><tr><td>1. 银行存款（含定期、通知、保证金户）余额</td><td></td></tr><tr><td>2. 短期借款 / 长期借款余额及担保情况</td><td></td></tr><tr><td>3. 银行承兑汇票、信用证、保函余额</td><td></td></tr><tr><td>4. 委托理财、结构性存款余额</td><td></td></tr><tr><td>5. 账户受限、冻结、质押情况说明</td><td></td></tr><tr><td>6. 其他需说明事项</td><td></td></tr></table><p>发函日期：${date}&nbsp;&nbsp;&nbsp;&nbsp;经办注册会计师（签章）：</p><div class="document-signature"><span>会计师事务所（盖章）：</span><span>银行回函（盖章）：&nbsp;&nbsp;经办人：&nbsp;&nbsp;日期：</span></div><p class="document-muted">注：本函一式两份。请贵行核对后一份留存，一份直接寄回本所，切勿交被审计单位转交。</p></div>`
  }
  if (activeTemplate.value === 'ar') {
    return `<div class="document-paper"><div style="text-align:right;color:#6b7280;font-size: 0.875rem">编号：${escapeHtml(value.number)}</div><h2>往来款项询证函</h2><p><strong>${escapeHtml(value.target || '________________')}</strong>：</p><p>本会计师事务所（${escapeHtml(value.firm || '________________')}）受托审计<strong>${escapeHtml(value.client || '________________')}</strong>的财务报表。按审计准则要求，需向贵单位函证截至 <strong>${escapeHtml(value.date || '____年__月__日')}</strong> 与其往来款项余额。下列信息出自其账簿记录，如与贵单位记录相符请签章确认；如有不符请在“贵单位记录”栏列明。</p><table><tr><th>往来科目</th><th>账面余额（元）</th><th>贵单位记录（元）</th><th>差异说明</th></tr><tr><td>${escapeHtml(value.subject || '应收账款')}</td><td>${escapeHtml(value.amount)}</td><td></td><td></td></tr></table><p>发函日期：${date}&nbsp;&nbsp;&nbsp;&nbsp;经办注册会计师（签章）：</p><div class="document-signature"><span>会计师事务所（盖章）：</span><span>被函证单位（盖章）：&nbsp;&nbsp;经办人：&nbsp;&nbsp;日期：</span></div></div>`
  }
  if (activeTemplate.value === 'inventory') {
    const rows = value.inventoryRows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.book)}</td><td>${escapeHtml(row.actual)}</td><td>${escapeHtml(row.difference)}</td><td>${escapeHtml(row.note)}</td></tr>`).join('')
    return `<div class="document-paper"><h2>存货监盘表</h2><p>被审计单位：${escapeHtml(value.client || '________________')} &nbsp;&nbsp;盘点地点：${escapeHtml(value.place || '________________')} &nbsp;&nbsp;盘点日期：${escapeHtml(value.date || '____年__月__日')}</p><p>盘点范围：${escapeHtml(value.scope || '________________')}</p><table><tr><th>序号</th><th style="text-align:left">存货名称/编号</th><th>账面数量</th><th>实盘数量</th><th>差异</th><th style="text-align:left">备注</th></tr>${rows}</table><p>截止号码：入库单最后一号______　出库单最后一号______　（截止日前后各抽查 5 张，附复印件）</p><p>盘点结论：□账实相符　□存在差异（见备注，已跟进）</p><div class="document-signature"><span>监盘人：${escapeHtml(value.auditor || '____________')}　日期：</span><span>仓管陪同：${escapeHtml(value.keeper || '____________')}　日期：</span></div></div>`
  }
  const rows = value.adjustmentRows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.debitAccount)}</td><td>${escapeHtml(row.debit)}</td><td>${escapeHtml(row.creditAccount)}</td><td>${escapeHtml(row.credit)}</td></tr>`).join('')
  return `<div class="document-paper"><h2>审计调整汇总表</h2><p>被审计单位：${escapeHtml(value.client || '________________')} &nbsp;&nbsp;审计期间：${escapeHtml(value.period || '________________')} &nbsp;&nbsp;编制：${escapeHtml(value.firm || '________________')}</p><table><tr><th>序号</th><th style="text-align:left">调整事项说明</th><th style="text-align:left">借方科目</th><th>借方金额</th><th style="text-align:left">贷方科目</th><th>贷方金额</th></tr>${rows}<tr><td colspan="3"><strong>合计</strong></td><td><strong>${money(adjustmentTotals.value.debit)}</strong></td><td></td><td><strong>${money(adjustmentTotals.value.credit)}</strong></td></tr></table><p>借贷平衡检查：${adjustmentBalanced.value ? '✓ 平衡' : `✗ 不平衡，差额 ${Math.abs(adjustmentTotals.value.debit - adjustmentTotals.value.credit).toFixed(2)}`}</p><div class="document-signature"><span>编制人：____________　日期：</span><span>复核人：____________　日期：</span></div></div>`
})

function printDocument() { window.print() }
</script>

<template>
  <div class="documents-view">
    <el-alert class="mb-16" type="info" :closable="false" show-icon title="文书是可编辑的起始模板">
      填写左侧信息后，右侧预览会实时更新。正式使用前请按事务所格式、被审计单位实际情况和适用准则复核。
    </el-alert>

    <div class="docs-layout">
      <el-card class="surface" shadow="never">
        <div class="surface-header"><div><h2 class="surface-title">选择底稿</h2><p class="surface-subtitle">4 个常用文书模板</p></div><el-icon class="text-muted"><DocumentChecked /></el-icon></div>
        <div class="template-list">
          <button v-for="item in templateDefinitions" :key="item.id" class="template-option" :class="{ 'is-active': activeTemplate === item.id }" type="button" @click="activeTemplate = item.id">
            <span class="template-option-icon">{{ item.icon }}</span>
            <span class="template-option-copy"><span class="template-option-name">{{ item.name }}</span><span class="template-option-desc">{{ item.desc }}</span></span>
            <el-icon v-if="activeTemplate === item.id"><Document /></el-icon>
          </button>
        </div>
        <el-divider />
        <div class="status-note"><el-icon><WarningFilled /></el-icon><span>文书生成不替代事务所正式模板。涉及函证、盘点和管理层声明时，请保留发出、回收和复核痕迹。</span></div>
      </el-card>

      <div>
        <el-card class="surface" shadow="never">
          <div class="surface-header"><div><h2 class="surface-title">{{ activeMeta?.name }} · 填写</h2><p class="surface-subtitle">带 <span style="color:var(--red)">*</span> 的内容请按实际情况补充</p></div><el-button type="primary" plain @click="printDocument"><el-icon><Printer /></el-icon>打印预览</el-button></div>
          <el-form label-position="top" :model="form">
            <div class="form-grid">
              <template v-if="activeTemplate === 'bank' || activeTemplate === 'ar'">
                <el-form-item class="span-4" label="会计师事务所"><el-input v-model="form.firm" placeholder="如：××会计师事务所" /></el-form-item>
                <el-form-item v-if="activeTemplate === 'bank'" class="span-4" label="被函证银行"><el-input v-model="form.bank" placeholder="如：××银行××支行" /></el-form-item>
                <el-form-item v-else class="span-4" label="被函证单位"><el-input v-model="form.target" placeholder="如：××客户公司" /></el-form-item>
                <el-form-item class="span-4" label="被审计单位"><el-input v-model="form.client" placeholder="如：××股份有限公司" /></el-form-item>
                <el-form-item class="span-4" label="基准日"><el-input v-model="form.date" placeholder="如：2025年12月31日" /></el-form-item>
                <el-form-item class="span-4" label="函证编号"><el-input v-model="form.number" /></el-form-item>
                <template v-if="activeTemplate === 'ar'">
                  <el-form-item class="span-4" label="往来科目"><el-input v-model="form.subject" /></el-form-item>
                  <el-form-item class="span-4" label="账面余额（元）"><el-input v-model="form.amount" placeholder="如：1,250,000.00" /></el-form-item>
                </template>
              </template>
              <template v-else-if="activeTemplate === 'inventory'">
                <el-form-item class="span-4" label="被审计单位"><el-input v-model="form.client" /></el-form-item>
                <el-form-item class="span-4" label="盘点地点"><el-input v-model="form.place" /></el-form-item>
                <el-form-item class="span-4" label="盘点日期"><el-input v-model="form.date" placeholder="如：2025年12月31日" /></el-form-item>
                <el-form-item class="span-4" label="盘点范围"><el-input v-model="form.scope" placeholder="如：全部存货 / 抽盘 A 类" /></el-form-item>
                <el-form-item class="span-4" label="监盘人"><el-input v-model="form.auditor" /></el-form-item>
                <el-form-item class="span-4" label="仓管陪同"><el-input v-model="form.keeper" /></el-form-item>
              </template>
              <template v-else>
                <el-form-item class="span-4" label="被审计单位"><el-input v-model="form.client" /></el-form-item>
                <el-form-item class="span-4" label="审计期间"><el-input v-model="form.period" placeholder="如：2025年度" /></el-form-item>
                <el-form-item class="span-4" label="编制事务所"><el-input v-model="form.firm" /></el-form-item>
              </template>
            </div>
          </el-form>

          <template v-if="activeTemplate === 'inventory'">
            <div class="flex-between mt-16"><h3 class="surface-title">盘点明细</h3><el-button size="small" text type="primary" @click="addInventoryRow"><el-icon><Plus /></el-icon>添加一行</el-button></div>
            <el-table class="mt-12" :data="form.inventoryRows" border>
              <el-table-column label="序号" width="55" type="index" />
              <el-table-column label="存货名称 / 编号" min-width="180"><template #default="scope"><el-input v-model="scope.row.name" /></template></el-table-column>
              <el-table-column label="账面数量" width="120"><template #default="scope"><el-input v-model="scope.row.book" @input="signRow(scope.row)" /></template></el-table-column>
              <el-table-column label="实盘数量" width="120"><template #default="scope"><el-input v-model="scope.row.actual" @input="signRow(scope.row)" /></template></el-table-column>
              <el-table-column label="差异" width="90"><template #default="scope">{{ scope.row.difference || '0' }}</template></el-table-column>
              <el-table-column label="备注" min-width="150"><template #default="scope"><el-input v-model="scope.row.note" /></template></el-table-column>
              <el-table-column label="" width="60"><template #default="scope"><el-button text type="danger" @click="removeInventoryRow(scope.$index)"><el-icon><Delete /></el-icon></el-button></template></el-table-column>
            </el-table>
          </template>

          <template v-if="activeTemplate === 'adjustment'">
            <div class="flex-between mt-16"><h3 class="surface-title">调整事项</h3><el-button size="small" text type="primary" @click="addAdjustmentRow"><el-icon><Plus /></el-icon>添加一行</el-button></div>
            <el-table class="mt-12" :data="form.adjustmentRows" border>
              <el-table-column label="序号" width="55" type="index" />
              <el-table-column label="调整事项说明" min-width="180"><template #default="scope"><el-input v-model="scope.row.description" /></template></el-table-column>
              <el-table-column label="借方科目" width="130"><template #default="scope"><el-input v-model="scope.row.debitAccount" /></template></el-table-column>
              <el-table-column label="借方金额" width="120"><template #default="scope"><el-input v-model="scope.row.debit" /></template></el-table-column>
              <el-table-column label="贷方科目" width="130"><template #default="scope"><el-input v-model="scope.row.creditAccount" /></template></el-table-column>
              <el-table-column label="贷方金额" width="120"><template #default="scope"><el-input v-model="scope.row.credit" /></template></el-table-column>
              <el-table-column label="" width="60"><template #default="scope"><el-button text type="danger" @click="removeAdjustmentRow(scope.$index)"><el-icon><Delete /></el-icon></el-button></template></el-table-column>
            </el-table>
            <div class="flex-between mt-12"><span class="text-muted text-small">自动合计：借方 {{ money(adjustmentTotals.debit) }} / 贷方 {{ money(adjustmentTotals.credit) }}</span><el-tag :type="adjustmentBalanced ? 'success' : 'danger'" effect="light">{{ adjustmentBalanced ? '借贷平衡' : '尚未平衡' }}</el-tag></div>
          </template>
        </el-card>

        <el-card class="surface document-preview" shadow="never">
          <div class="no-print flex-between mb-16"><span class="section-kicker">实时预览</span><el-button size="small" plain @click="printDocument"><el-icon><Printer /></el-icon>打印</el-button></div>
          <div v-html="previewHtml"></div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mb-16 { margin-bottom: 16px; }
.template-option-icon { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 8px; color: var(--blue); background: var(--blue-soft); font-size: 1rem; font-weight: 700; }
</style>
