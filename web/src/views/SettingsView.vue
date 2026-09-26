<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Connection, Cpu, Delete, Download, Monitor, Refresh, Setting, WarningFilled } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { auditData } from '../lib/audit-data'
import { API_PROVIDERS, DEEPSEEK_THINKING_OPTIONS, GEMINI_REASONING_OPTIONS, REASONING_EFFORT_OPTIONS } from '../lib/api-config'
import {
  aiState,
  deleteOllamaModel,
  detectSpecs,
  listOllamaModels,
  pullOllamaModel,
  testConnection,
  updateSettings
} from '../lib/ai-service'

const form = reactive({ ...aiState.settings })
const saving = ref(false)
const testing = ref(false)
const loadingModels = ref(false)
const feedback = ref('')
const feedbackType = ref('success')
const specs = computed(() => detectSpecs())

const providers = [
  { ...API_PROVIDERS.deepseek, description: '在线 API · 中文财经问答' },
  { ...API_PROVIDERS.gemini, description: 'Google AI Studio · 长文本与多模态' },
  { id: 'ollama', name: 'Ollama 本地模型', shortName: 'Ollama', description: '离线运行 · 数据留在本机', icon: 'AI' },
  { id: 'custom', name: '自定义兼容接口', shortName: '自定义', description: 'OpenAI Chat Completions', icon: 'API' }
]
const activeApiInfo = computed(() => API_PROVIDERS[form.provider] || null)
const recommendedTier = computed(() => specs.value.tierIndex)
const installedSet = computed(() => new Set(aiState.installedModels))

function notify(message, type = 'success') {
  feedback.value = message
  feedbackType.value = type
  window.clearTimeout(notify.timer)
  notify.timer = window.setTimeout(() => { feedback.value = '' }, 4500)
}

async function saveSettings() {
  saving.value = true
  try {
    updateSettings({
      provider: form.provider,
      deepseekKey: form.deepseekKey.trim(),
      deepseekBaseUrl: form.deepseekBaseUrl.trim(),
      deepseekModel: form.deepseekModel,
      deepseekThinking: form.deepseekThinking,
      deepseekReasoningEffort: form.deepseekReasoningEffort,
      geminiKey: form.geminiKey.trim(),
      geminiBaseUrl: form.geminiBaseUrl.trim(),
      geminiModel: form.geminiModel,
      geminiReasoningEffort: form.geminiReasoningEffort,
      ollamaUrl: form.ollamaUrl.trim().replace(/\/$/, '') || 'http://localhost:11434',
      ollamaModel: form.ollamaModel.trim() || 'qwen2.5:7b',
      customUrl: form.customUrl.trim().replace(/\/$/, ''),
      customKey: form.customKey.trim(),
      customModel: form.customModel.trim()
    })
    Object.assign(form, aiState.settings)
    notify('设置已保存到当前浏览器。API Key 仅保存在本机。')
  } finally {
    saving.value = false
  }
}

async function testCurrentConnection() {
  testing.value = true
  try {
    const message = await testConnection(form)
    notify(message)
  } catch (error) {
    notify(error.message || '连接失败', 'error')
  } finally {
    testing.value = false
  }
}

async function refreshModels() {
  loadingModels.value = true
  try {
    const models = await listOllamaModels(form)
    notify(`Ollama 已连接，当前有 ${models.length} 个模型。`)
  } catch (error) {
    notify('无法连接 Ollama，请确认服务已启动且地址可访问。', 'warning')
  } finally {
    loadingModels.value = false
  }
}

async function pullModel(name) {
  try {
    await pullOllamaModel(name, form)
    notify(`${name} 下载完成。`)
  } catch (error) {
    notify(`模型下载失败：${error.message || error}`, 'error')
  }
}

async function removeModel(name) {
  try {
    await ElMessageBox.confirm(`确定删除本地模型 ${name}？`, '删除模型', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    await deleteOllamaModel(name, form)
    notify('模型已删除。')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') notify(`删除失败：${error.message || error}`, 'error')
  }
}

function useModel(name) {
  form.provider = 'ollama'
  form.ollamaModel = name
  updateSettings({ provider: 'ollama', ollamaModel: name })
  notify(`已切换 Ollama 对话模型：${name}`)
}

onMounted(() => {
  if (form.provider === 'ollama') refreshModels()
})
</script>

<template>
  <div>
    <el-alert v-if="feedback" class="mb-16" :type="feedbackType" :closable="true" show-icon :title="feedback" @close="feedback = ''" />
    <div class="settings-layout">
      <div>
        <el-card class="surface" shadow="never">
          <div class="surface-header">
            <div><h2 class="surface-title">AI 服务商</h2><p class="surface-subtitle">接入配置依据官方 API 文档同步，设置只保存在当前浏览器。</p></div>
            <el-icon class="text-muted"><Setting /></el-icon>
          </div>
          <div class="provider-list">
            <button v-for="provider in providers" :key="provider.id" class="provider-card" :class="{ 'is-active': form.provider === provider.id }" type="button" @click="form.provider = provider.id">
              <span class="provider-radio"></span><span class="provider-icon">{{ provider.icon }}</span><span class="provider-copy"><span class="provider-name">{{ provider.name }}</span><span class="provider-desc">{{ provider.description }}</span></span>
            </button>
          </div>

          <el-form label-position="top" :model="form">
            <template v-if="form.provider === 'deepseek'">
              <el-divider content-position="left">DeepSeek 配置</el-divider>
              <div class="form-grid">
                <el-form-item class="span-6" label="API Key"><el-input v-model="form.deepseekKey" type="password" show-password placeholder="在 DeepSeek 开放平台创建" /></el-form-item>
                <el-form-item class="span-6" label="Base URL"><el-input v-model="form.deepseekBaseUrl"><template #append><el-button @click="form.deepseekBaseUrl = API_PROVIDERS.deepseek.defaultBaseUrl">恢复官方地址</el-button></template></el-input></el-form-item>
                <el-form-item class="span-6" label="模型"><el-select v-model="form.deepseekModel" filterable allow-create default-first-option><el-option v-for="model in API_PROVIDERS.deepseek.models" :key="model.value" :label="model.label" :value="model.value" /></el-select></el-form-item>
                <el-form-item class="span-6" label="思考模式"><el-select v-model="form.deepseekThinking"><el-option v-for="option in DEEPSEEK_THINKING_OPTIONS" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
                <el-form-item v-if="form.deepseekThinking === 'enabled'" class="span-6" label="推理强度"><el-select v-model="form.deepseekReasoningEffort"><el-option v-for="option in REASONING_EFFORT_OPTIONS" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
              </div>
              <div class="status-note"><el-icon><Connection /></el-icon><span>按官方文档使用 <code>POST /chat/completions</code>、Bearer 鉴权；默认关闭思考以降低延迟，复杂审计问题可开启。</span></div>
              <div class="api-links"><el-link :href="API_PROVIDERS.deepseek.docsUrl" target="_blank" rel="noopener">DeepSeek API 文档</el-link><el-link :href="API_PROVIDERS.deepseek.keyUrl" target="_blank" rel="noopener">创建 API Key</el-link></div>
            </template>

            <template v-else-if="form.provider === 'gemini'">
              <el-divider content-position="left">Google Gemini 配置</el-divider>
              <div class="form-grid">
                <el-form-item class="span-6" label="Gemini API Key"><el-input v-model="form.geminiKey" type="password" show-password placeholder="在 Google AI Studio 创建" /></el-form-item>
                <el-form-item class="span-6" label="OpenAI 兼容 Base URL"><el-input v-model="form.geminiBaseUrl"><template #append><el-button @click="form.geminiBaseUrl = API_PROVIDERS.gemini.defaultBaseUrl">恢复官方地址</el-button></template></el-input></el-form-item>
                <el-form-item class="span-6" label="模型"><el-select v-model="form.geminiModel" filterable allow-create default-first-option><el-option v-for="model in API_PROVIDERS.gemini.models" :key="model.value" :label="model.label" :value="model.value" /></el-select></el-form-item>
                <el-form-item class="span-6" label="推理强度"><el-select v-model="form.geminiReasoningEffort"><el-option v-for="option in GEMINI_REASONING_OPTIONS" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
              </div>
              <div class="status-note"><el-icon><Connection /></el-icon><span>使用 Google 官方 OpenAI Compatibility 地址 <code>/v1beta/openai/chat/completions</code>，请求头为 Bearer API Key；默认模型为 Gemini 3.8 Flash。</span></div>
              <div class="api-links"><el-link :href="API_PROVIDERS.gemini.docsUrl" target="_blank" rel="noopener">Gemini OpenAI 兼容文档</el-link><el-link :href="API_PROVIDERS.gemini.keyUrl" target="_blank" rel="noopener">创建 Gemini API Key</el-link></div>
            </template>

            <template v-else-if="form.provider === 'ollama'">
              <el-divider content-position="left">Ollama 配置</el-divider>
              <div class="form-grid"><el-form-item class="span-6" label="服务地址"><el-input v-model="form.ollamaUrl" placeholder="http://localhost:11434" /></el-form-item><el-form-item class="span-6" label="默认对话模型"><el-input v-model="form.ollamaModel" placeholder="qwen2.5:7b" /></el-form-item></div>
              <div class="status-note"><el-icon><WarningFilled /></el-icon><span>本地模型仅在 Ollama 与浏览器同机、且服务允许当前页面来源时可用。GitHub Pages 的 HTTPS 页面通常不能直接访问本机 HTTP 服务。</span></div>
            </template>

            <template v-else>
              <el-divider content-position="left">自定义接口配置</el-divider>
              <div class="form-grid"><el-form-item class="span-6" label="接口地址（到 /v1）"><el-input v-model="form.customUrl" placeholder="https://example.com/v1" /></el-form-item><el-form-item class="span-6" label="模型名"><el-input v-model="form.customModel" placeholder="model-name" /></el-form-item><el-form-item class="span-12" label="API Key（可选）"><el-input v-model="form.customKey" type="password" show-password /></el-form-item></div>
            </template>

            <div class="flex-between mt-16 flex-wrap"><span class="text-muted text-small">测试连接会使用当前表单内容，不会修改已保存配置。</span><div class="flex-wrap"><el-button :loading="testing" @click="testCurrentConnection"><el-icon><Connection /></el-icon>测试连接</el-button><el-button type="primary" :loading="saving" @click="saveSettings">保存设置</el-button></div></div>
          </el-form>
        </el-card>

        <el-card v-if="activeApiInfo" class="surface" shadow="never">
          <div class="surface-header"><div><h2 class="surface-title">官方接入信息</h2><p class="surface-subtitle">{{ activeApiInfo.name }} · {{ activeApiInfo.compatibility }}</p></div><el-icon class="text-muted"><Connection /></el-icon></div>
          <div class="api-info-grid"><div><span>接口地址</span><code>{{ form.provider === 'deepseek' ? form.deepseekBaseUrl : form.geminiBaseUrl }}</code></div><div><span>默认模型</span><code>{{ form.provider === 'deepseek' ? form.deepseekModel : form.geminiModel }}</code></div><div><span>鉴权方式</span><code>{{ activeApiInfo.auth }}</code></div></div>
          <div class="status-note mt-16"><el-icon><Monitor /></el-icon><span>配置最后按官方文档核对：2026-09-25。浏览器直连第三方 API 仍受 CORS、网络和代理影响；生产环境建议使用后端代理保存密钥。</span></div>
        </el-card>

        <el-card class="surface" shadow="never">
          <div class="surface-header"><div><h2 class="surface-title">Ollama 模型管理</h2><p class="surface-subtitle">按本机配置推荐模型，下载后即可切换到本地对话。</p></div><el-button size="small" plain :loading="loadingModels" @click="refreshModels"><el-icon><Refresh /></el-icon>刷新已安装</el-button></div>
          <div class="spec-panel"><div class="spec-title"><el-icon><Cpu /></el-icon>{{ specs.cores ? `检测到 ${specs.cores} 核 CPU` : '本机配置检测' }}</div><div class="spec-copy">{{ specs.note }}。推荐仅作为起点，实际速度还取决于模型量化、上下文长度和显卡/内存带宽。</div></div>
          <div v-if="aiState.modelBusy" class="mt-16"><div class="flex-between text-small"><span>{{ aiState.pullStatus || '正在处理模型…' }}</span><strong>{{ Math.round(aiState.pullProgress * 100) }}%</strong></div><el-progress :percentage="Math.round(aiState.pullProgress * 100)" :show-text="false" class="mt-16" /></div>
          <div class="mt-16">
            <div class="flex-between mb-12"><span class="section-kicker">已安装模型 · {{ aiState.modelStatus || '尚未连接' }}</span><span class="text-muted text-small">{{ aiState.installedModels.length }} 个</span></div>
            <div v-if="aiState.installedModels.length">
              <div v-for="model in aiState.installedModels" :key="model" class="installed-model"><el-icon class="text-muted"><Monitor /></el-icon><span class="installed-model-name">{{ model }}</span><el-button size="small" text type="primary" @click="useModel(model)">设为对话</el-button><el-button size="small" text type="danger" @click="removeModel(model)"><el-icon><Delete /></el-icon></el-button></div>
            </div>
            <div v-else class="empty-state"><el-icon><Download /></el-icon><strong>没有已安装模型</strong><span>启动 Ollama 后点击“刷新已安装”，或从下方推荐下载。</span></div>
          </div>
          <el-divider />
          <div class="section-kicker mb-12">按配置推荐下载</div>
          <div v-for="(tier, index) in auditData.ollamaTiers" :key="tier.tier" class="model-tier" :class="{ recommended: index === recommendedTier }">
            <div class="model-tier-head"><span class="model-tier-name">{{ tier.tier }}</span><el-tag v-if="index === recommendedTier" size="small" type="primary" effect="light">推荐档位</el-tag></div>
            <div class="model-tier-desc">{{ tier.desc }}</div>
            <div class="model-chip-list"><button v-for="model in tier.models" :key="model.name" class="model-chip" :class="{ 'is-installed': installedSet.has(model.name) }" type="button" :title="`${model.size} · ${model.use}`" :disabled="aiState.modelBusy" @click="installedSet.has(model.name) ? useModel(model.name) : pullModel(model.name)">{{ installedSet.has(model.name) ? '✓ ' : '' }}{{ model.name }}</button></div>
          </div>
        </el-card>
      </div>

      <div>
        <el-card class="surface" shadow="never">
          <div class="surface-header"><div><h2 class="surface-title">本地优先说明</h2><p class="surface-subtitle">当前版本的行为边界</p></div><el-icon class="text-muted"><WarningFilled /></el-icon></div>
          <div class="status-note"><el-icon><Monitor /></el-icon><span>CSV 台账、抽样参数、分析结果和底稿内容默认只在浏览器内存或本机存储中处理，不主动上传原始文件。</span></div>
          <div class="status-note mt-12"><el-icon><Cpu /></el-icon><span>浏览器只能检测部分硬件信息。模型分档是建议，不会自动下载大文件，也不会在后台运行推理。</span></div>
          <div class="status-note mt-12"><el-icon><Setting /></el-icon><span>AI 适合做问题拆解、程序提示和底稿初稿，不应直接生成审计结论或替代证据评价。</span></div>
        </el-card>
        <el-card class="surface" shadow="never">
          <div class="surface-header"><div><h2 class="surface-title">部署提示</h2><p class="surface-subtitle">GitHub Pages 使用建议</p></div></div>
          <div class="status-note"><el-icon><Monitor /></el-icon><span>构建后的静态文件可部署到 GitHub Pages。Ollama 需要本机 HTTP 服务，浏览器跨域和 HTTPS 混合内容限制可能使公网页面无法直连。</span></div>
          <el-button class="mt-16" text type="primary" @click="testCurrentConnection">检查当前接口状态</el-button>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mb-12 { margin-bottom: 12px; }
.mb-16 { margin-bottom: 16px; }
.mt-12 { margin-top: 12px; }
.mt-16 { margin-top: 16px; }
.api-links { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; }
.api-info-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.api-info-grid > div { min-width: 0; padding: 10px; border: 1px solid var(--line-soft); border-radius: 9px; background: rgba(255,255,255,.4); }
.api-info-grid span { display: block; color: var(--ink-500); font-size: 0.875rem; }
.api-info-grid code { display: block; overflow: hidden; margin-top: 4px; color: var(--ink-700); font-size: 0.875rem; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 560px) { .api-info-grid { grid-template-columns: 1fr; } }
</style>
