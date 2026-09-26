import { computed, reactive } from 'vue'
import { auditData } from './audit-data'
import { API_PROVIDERS } from './api-config'

const SETTINGS_KEY = 'auditdesk_ai_settings_v2'
const CONVERSATIONS_KEY = 'auditdesk_ai_conversations_v2'

const defaultSettings = {
  provider: 'deepseek',
  deepseekKey: '',
  deepseekBaseUrl: API_PROVIDERS.deepseek.defaultBaseUrl,
  deepseekModel: API_PROVIDERS.deepseek.defaultModel,
  deepseekThinking: 'disabled',
  deepseekReasoningEffort: 'high',
  geminiKey: '',
  geminiBaseUrl: API_PROVIDERS.gemini.defaultBaseUrl,
  geminiModel: API_PROVIDERS.gemini.defaultModel,
  geminiReasoningEffort: 'low',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b',
  customUrl: '',
  customKey: '',
  customModel: ''
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function normalizeSettings(raw = {}) {
  const settings = { ...defaultSettings, ...raw }
  // 旧版网页端曾保存 deepseek-chat / deepseek-reasoner；按官方当前模型名迁移。
  if (settings.deepseekModel === 'deepseek-chat' || settings.deepseekModel === 'deepseek-reasoner') {
    settings.deepseekModel = settings.deepseekModel === 'deepseek-reasoner'
      ? 'deepseek-v4-pro'
      : API_PROVIDERS.deepseek.defaultModel
  }
  if (!API_PROVIDERS.deepseek.models.some((model) => model.value === settings.deepseekModel)) {
    settings.deepseekModel = API_PROVIDERS.deepseek.defaultModel
  }
  if (!API_PROVIDERS.gemini.models.some((model) => model.value === settings.geminiModel)) {
    settings.geminiModel = API_PROVIDERS.gemini.defaultModel
  }
  settings.deepseekBaseUrl = String(settings.deepseekBaseUrl || API_PROVIDERS.deepseek.defaultBaseUrl)
    .trim()
    .replace(/\/v1\/?$/i, '')
    .replace(/\/$/, '')
  settings.geminiBaseUrl = String(settings.geminiBaseUrl || API_PROVIDERS.gemini.defaultBaseUrl)
    .trim()
    .replace(/\/$/, '')
  settings.ollamaUrl = String(settings.ollamaUrl || defaultSettings.ollamaUrl).trim().replace(/\/$/, '')
  return settings
}

function readSettings() {
  return normalizeSettings(readStorage(SETTINGS_KEY, {}))
}
function readConversations() {
  const value = readStorage(CONVERSATIONS_KEY, [])
  return Array.isArray(value) ? value : []
}

function uid() {
  return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}

export const aiState = reactive({
  settings: readSettings(),
  conversations: readConversations(),
  activeId: null,
  sending: false,
  installedModels: [],
  modelStatus: '',
  modelBusy: false,
  pullProgress: 0,
  pullStatus: '',
  lastError: ''
})
aiState.activeId = aiState.conversations[0]?.id || null

export const providerLabel = computed(() => {
  if (aiState.settings.provider === 'ollama') return 'Ollama 本地模型'
  if (aiState.settings.provider === 'custom') return '自定义 OpenAI 兼容接口'
  if (aiState.settings.provider === 'gemini') return 'Google Gemini'
  return API_PROVIDERS.deepseek.name
})

export const currentModel = computed(() => {
  const settings = aiState.settings
  if (settings.provider === 'ollama') return settings.ollamaModel || '未选择模型'
  if (settings.provider === 'custom') return settings.customModel || '未填写模型'
  if (settings.provider === 'gemini') return settings.geminiModel || API_PROVIDERS.gemini.defaultModel
  return settings.deepseekModel || API_PROVIDERS.deepseek.defaultModel
})

export const isConfigured = computed(() => {
  const settings = aiState.settings
  if (settings.provider === 'ollama') return Boolean(settings.ollamaUrl && settings.ollamaModel)
  if (settings.provider === 'custom') return Boolean(settings.customUrl && settings.customModel)
  if (settings.provider === 'gemini') return Boolean(settings.geminiKey && settings.geminiBaseUrl && settings.geminiModel)
  return Boolean(settings.deepseekKey && settings.deepseekBaseUrl && settings.deepseekModel)
})

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(aiState.settings))
}
function saveConversations() {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(aiState.conversations))
}

export function getActiveConversation() {
  return aiState.conversations.find((item) => item.id === aiState.activeId) || null
}

export function createConversation() {
  const conversation = { id: uid(), title: '新对话', messages: [], updatedAt: Date.now() }
  aiState.conversations.unshift(conversation)
  aiState.activeId = conversation.id
  saveConversations()
  return conversation
}

export function selectConversation(id) {
  if (aiState.conversations.some((item) => item.id === id)) aiState.activeId = id
}

export function deleteConversation(id) {
  aiState.conversations = aiState.conversations.filter((item) => item.id !== id)
  if (aiState.activeId === id) aiState.activeId = aiState.conversations[0]?.id || null
  saveConversations()
}

export function updateSettings(patch) {
  Object.assign(aiState.settings, normalizeSettings({ ...aiState.settings, ...patch }))
  saveSettings()
}

export function resetError() {
  aiState.lastError = ''
}

function ollamaBase(settings = aiState.settings) {
  return String(settings.ollamaUrl || '').replace(/\/$/, '')
}

function providerBase(settings = aiState.settings) {
  if (settings.provider === 'deepseek') return String(settings.deepseekBaseUrl || '').replace(/\/$/, '')
  if (settings.provider === 'gemini') return String(settings.geminiBaseUrl || '').replace(/\/$/, '')
  return String(settings.customUrl || '').replace(/\/$/, '')
}

function providerKey(settings = aiState.settings) {
  if (settings.provider === 'deepseek') return settings.deepseekKey
  if (settings.provider === 'gemini') return settings.geminiKey
  if (settings.provider === 'custom') return settings.customKey
  return ''
}

function providerModel(settings = aiState.settings) {
  if (settings.provider === 'deepseek') return settings.deepseekModel || API_PROVIDERS.deepseek.defaultModel
  if (settings.provider === 'gemini') return settings.geminiModel || API_PROVIDERS.gemini.defaultModel
  if (settings.provider === 'custom') return settings.customModel
  return settings.ollamaModel
}

function requestExtras(settings = aiState.settings) {
  if (settings.provider === 'deepseek') {
    const extras = { thinking: { type: settings.deepseekThinking || 'disabled' } }
    if (settings.deepseekThinking === 'enabled') extras.reasoning_effort = settings.deepseekReasoningEffort || 'high'
    return extras
  }
  if (settings.provider === 'gemini' && settings.geminiReasoningEffort) {
    return { reasoning_effort: settings.geminiReasoningEffort }
  }
  return {}
}

export function detectSpecs() {
  const cores = navigator.hardwareConcurrency || 0
  const memory = navigator.deviceMemory || 0
  let tierIndex = 1
  let note
  if (memory) {
    tierIndex = memory <= 8 ? 0 : memory <= 16 ? 1 : 2
    note = `检测到内存约 ${memory}GB，CPU ${cores || '?'} 核`
  } else if (cores) {
    tierIndex = cores >= 8 ? 1 : 0
    note = `检测到 CPU ${cores} 核（浏览器未提供内存信息，按 CPU 保守推荐）`
  } else {
    tierIndex = 0
    note = '浏览器未提供硬件信息，按保守配置推荐'
  }
  return { cores, memory, tierIndex, note }
}

export async function listOllamaModels(settings = aiState.settings) {
  aiState.modelStatus = '连接中…'
  try {
    const response = await fetch(`${ollamaBase(settings)}/api/tags`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    aiState.installedModels = (data.models || []).map((model) => model.name)
    aiState.modelStatus = `已连接，共 ${aiState.installedModels.length} 个模型`
    return aiState.installedModels
  } catch (error) {
    aiState.installedModels = []
    aiState.modelStatus = '连接失败'
    throw error
  }
}

export async function pullOllamaModel(name, settings = aiState.settings) {
  aiState.modelBusy = true
  aiState.pullProgress = 0
  aiState.pullStatus = `开始下载 ${name}`
  try {
    const response = await fetch(`${ollamaBase(settings)}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        let payload
        try { payload = JSON.parse(line) } catch { continue }
        if (payload.error) throw new Error(payload.error)
        if (payload.total) aiState.pullProgress = Math.min(1, payload.completed / payload.total)
        if (payload.status) aiState.pullStatus = payload.status
        if (/success/i.test(payload.status || '')) {
          aiState.pullProgress = 1
          aiState.pullStatus = '下载完成'
        }
      }
    }
    aiState.pullProgress = 1
    aiState.pullStatus = '下载完成'
    await listOllamaModels(settings)
  } finally {
    aiState.modelBusy = false
  }
}

export async function deleteOllamaModel(name, settings = aiState.settings) {
  const response = await fetch(`${ollamaBase(settings)}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  await listOllamaModels(settings)
}

export async function testConnection(settings = aiState.settings) {
  const normalized = normalizeSettings(settings)
  if (normalized.provider === 'ollama') {
    await listOllamaModels(normalized)
    return 'Ollama 连接正常'
  }
  const base = providerBase(normalized)
  if (!base) throw new Error('请先填写接口地址')
  const key = providerKey(normalized)
  const response = await fetch(`${base}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {}
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return `${normalized.provider === 'gemini' ? 'Gemini' : normalized.provider === 'deepseek' ? 'DeepSeek' : '接口'}连接正常`
}

async function streamOpenAI(url, key, model, messages, onUpdate, extraBody = {}) {
  const response = await fetch(`${String(url).replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {})
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.3,
      ...extraBody
    })
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} ${text.slice(0, 180)}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  const consumePart = (part) => {
    const line = part.trim().split(/\r?\n/).map((item) => item.trim()).find((item) => item.startsWith('data:'))
    if (!line) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const json = JSON.parse(data)
      const token = json.choices?.[0]?.delta?.content || ''
      if (token) {
        full += token
        onUpdate(full)
      }
    } catch {
      // SSE 半包会在下一轮继续拼接。
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    parts.forEach(consumePart)
  }
  if (buffer.trim()) consumePart(buffer)
  return full
}

async function streamOllama(model, messages, onUpdate, settings = aiState.settings) {
  const response = await fetch(`${ollamaBase(settings)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true })
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} ${text.slice(0, 180)}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      let json
      try { json = JSON.parse(line) } catch { continue }
      if (json.error) throw new Error(json.error)
      const token = json.message?.content || ''
      if (token) {
        full += token
        onUpdate(full)
      }
    }
  }
  return full
}

function providerError(error) {
  const message = String(error?.message || error)
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    if (aiState.settings.provider === 'ollama') {
      return '无法连接 Ollama。请确认本机服务已启动；GitHub Pages 等公网页面通常无法访问 localhost。'
    }
    if (aiState.settings.provider === 'gemini') {
      return '无法连接 Gemini。请检查 API Key、接口地址和网络；GitHub Pages 部署时浏览器 CORS 仍可能限制直连。'
    }
    return '网络请求失败，请检查网络、代理或接口地址。'
  }
  if (/401|403/.test(message)) return 'API Key 无效或没有权限（401/403），请到设置页更新。'
  if (/402|429/.test(message)) return '余额不足或触发限流，请检查账户后重试。'
  return message
}

export async function sendMessage(question, onUpdate = () => {}) {
  const text = String(question || '').trim()
  if (!text || aiState.sending) return
  let conversation = getActiveConversation()
  if (!conversation) conversation = createConversation()
  if (!conversation.messages.length) conversation.title = text.slice(0, 22)
  conversation.messages.push({ role: 'user', content: text, createdAt: Date.now() })
  conversation.updatedAt = Date.now()
  const messages = [
    { role: 'system', content: auditData.auditSystemPrompt },
    ...conversation.messages.map((item) => ({ role: item.role, content: item.content }))
  ]
  conversation.messages.push({ role: 'assistant', content: '', createdAt: Date.now() })
  const answer = conversation.messages[conversation.messages.length - 1]
  saveConversations()
  aiState.sending = true
  aiState.lastError = ''
  try {
    let full = ''
    const settings = aiState.settings
    if (settings.provider === 'ollama') {
      full = await streamOllama(providerModel(settings), messages, (value) => {
        answer.content = value
        onUpdate(value)
      }, settings)
    } else {
      const url = providerBase(settings)
      const key = providerKey(settings)
      const model = providerModel(settings)
      if (!url) throw new Error('尚未填写接口地址，请先到设置页配置。')
      if ((settings.provider === 'deepseek' || settings.provider === 'gemini') && !key) {
        throw new Error(`尚未填写 ${settings.provider === 'gemini' ? 'Gemini' : 'DeepSeek'} API Key，请先到设置页配置。`)
      }
      if (settings.provider === 'custom' && !model) throw new Error('尚未填写自定义模型名，请先到设置页配置。')
      full = await streamOpenAI(url, key, model, messages, (value) => {
        answer.content = value
        onUpdate(value)
      }, requestExtras(settings))
    }
    answer.content = full || '（模型返回了空内容，请重试。）'
  } catch (error) {
    aiState.lastError = providerError(error)
    answer.content = `暂时无法完成回答：${aiState.lastError}`
  } finally {
    conversation.updatedAt = Date.now()
    saveConversations()
    aiState.sending = false
    onUpdate(answer.content)
  }
}

export function quickPrompts() {
  return auditData.quickPrompts
}
