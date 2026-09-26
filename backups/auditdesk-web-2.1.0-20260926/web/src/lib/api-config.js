// API 配置依据官方文档同步，最后核对：2026-09-25。
// DeepSeek: https://api-docs.deepseek.com/
// Gemini: https://ai.google.dev/gemini-api/docs/openai
export const API_PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    shortName: 'DeepSeek',
    description: '在线 API · 中文财经问答',
    icon: 'DS',
    docsUrl: 'https://api-docs.deepseek.com/',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    models: [
      { value: 'deepseek-flash', label: 'deepseek-flash（推荐 · 快速）' },
      { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro（复杂推理）' }
    ],
    auth: 'Bearer API Key',
    compatibility: 'OpenAI Chat Completions'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    description: 'Google AI Studio · 多模态与长文本',
    icon: 'G',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    models: [
      { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash（推荐 · 稳定）' },
      { value: 'gemini-3.7-flash', label: 'gemini-3.7-flash' },
      { value: 'gemini-3.6-flash', label: 'gemini-3.6-flash' },
      { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite（低成本）' },
      { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview（预览）' }
    ],
    auth: 'Bearer API Key',
    compatibility: 'Gemini OpenAI Compatibility'
  }
}

export const DEEPSEEK_THINKING_OPTIONS = [
  { value: 'disabled', label: '关闭思考（更快）' },
  { value: 'enabled', label: '开启思考（更适合复杂判断）' }
]

export const REASONING_EFFORT_OPTIONS = [
  { value: 'low', label: '低 · 快速' },
  { value: 'medium', label: '中 · 平衡' },
  { value: 'high', label: '高 · 深入推理' },
  { value: 'max', label: '最高 · DeepSeek 支持' }
]

export const GEMINI_REASONING_OPTIONS = [
  { value: 'low', label: '低 · 快速' },
  { value: 'medium', label: '中 · 平衡' },
  { value: 'high', label: '高 · 深入推理' }
]
