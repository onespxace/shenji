<script setup>
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { ChatDotRound, Delete, Message, Plus, Promotion, Setting, WarningFilled } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import {
  aiState,
  createConversation,
  currentModel,
  deleteConversation,
  getActiveConversation,
  isConfigured,
  providerLabel,
  quickPrompts,
  selectConversation,
  sendMessage
} from '../lib/ai-service'

const navigate = inject('navigate', () => {})
const input = ref('')
const messageList = ref(null)
const activeConversation = computed(() => getActiveConversation())
const hasMessages = computed(() => Boolean(activeConversation.value?.messages?.length))
const providerStatus = computed(() => isConfigured.value ? '已配置' : '待配置')

function scrollToBottom() {
  nextTick(() => {
    if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
  })
}
function newChat() {
  createConversation()
  scrollToBottom()
}
function chooseConversation(id) { selectConversation(id); scrollToBottom() }
async function removeConversation(id, event) {
  event.stopPropagation()
  try {
    await ElMessageBox.confirm('删除这条本地对话记录？', '确认删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    deleteConversation(id)
  } catch {
    // 用户取消时不改变当前状态。
  }
}
async function submit(value) {
  const question = String(typeof value === 'string' ? value : input.value).trim()
  if (!question || aiState.sending) return
  input.value = ''
  await nextTick()
  scrollToBottom()
  await sendMessage(question)
  scrollToBottom()
}
function usePrompt(prompt) {
  input.value = prompt
  submit(prompt)
}
function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}
watch(() => activeConversation.value?.id, scrollToBottom)
onMounted(scrollToBottom)
</script>

<template>
  <div>
    <el-alert v-if="!isConfigured" class="mb-16" type="warning" :closable="false" show-icon>
      <template #title>还没有配置 AI 服务</template>
      <template #default>可以先浏览界面；配置 DeepSeek API Key，或启动 Ollama 后即可使用本地模型。<el-button text type="primary" @click="navigate('settings')">去设置</el-button></template>
    </el-alert>
    <div v-else-if="aiState.lastError" class="mb-16"><el-alert type="error" :closable="false" show-icon :title="aiState.lastError" /></div>

    <div class="ai-layout">
      <el-card class="surface ai-sidebar" shadow="never">
        <div class="ai-sidebar-top"><div><h2 class="surface-title">对话记录</h2><p class="surface-subtitle">仅保存在当前浏览器</p></div><el-button type="primary" size="small" plain @click="newChat"><el-icon><Plus /></el-icon>新建</el-button></div>
        <div v-if="aiState.conversations.length" class="ai-conversation-list">
          <div v-for="conversation in aiState.conversations" :key="conversation.id" class="ai-conversation" :class="{ 'is-active': activeConversation?.id === conversation.id }" @click="chooseConversation(conversation.id)">
            <el-icon><Message /></el-icon><span class="ai-conversation-title">{{ conversation.title || '新对话' }}</span>
            <button class="ai-conversation-delete" type="button" aria-label="删除对话" @click="removeConversation(conversation.id, $event)"><el-icon><Delete /></el-icon></button>
          </div>
        </div>
        <div v-else class="empty-state"><el-icon><ChatDotRound /></el-icon><strong>还没有对话</strong><span>点击“新建”开始提问</span></div>
        <div class="ai-sidebar-footer"><el-icon><WarningFilled /></el-icon> AI 输出仅作辅助，请结合准则和证据复核。</div>
      </el-card>

      <el-card class="surface chat-panel" shadow="never">
        <div class="chat-head">
          <div class="chat-head-title"><el-icon class="text-muted"><ChatDotRound /></el-icon><div><strong>{{ activeConversation?.title || '新的审计对话' }}</strong><span class="ml-8">{{ providerLabel }} · {{ currentModel }}</span></div></div>
          <el-tag :type="isConfigured ? 'success' : 'warning'" effect="light" size="small">{{ providerStatus }}</el-tag>
        </div>

        <div ref="messageList" class="chat-messages">
          <div v-if="!hasMessages" class="chat-welcome">
            <div class="chat-welcome-icon"><el-icon><ChatDotRound /></el-icon></div>
            <h3>从一个问题开始</h3>
            <p>可以询问审计程序、准则思路、函证处理或底稿整理。回答会尽量给出可执行的证据清单。</p>
            <div class="prompt-grid">
              <button v-for="prompt in quickPrompts().slice(0, 6)" :key="prompt" class="prompt-button" type="button" @click="usePrompt(prompt)"><el-icon><Promotion /></el-icon><span>{{ prompt }}</span></button>
            </div>
          </div>
          <template v-else>
            <div v-for="(message, index) in activeConversation.messages" :key="`${message.createdAt}-${index}`" class="message-row" :class="message.role === 'user' ? 'user' : 'assistant'">
              <div class="message-bubble"><div class="message-role">{{ message.role === 'user' ? '你' : 'AI 助手' }}</div>{{ message.content || (aiState.sending && index === activeConversation.messages.length - 1 ? '正在思考…' : '') }}</div>
            </div>
          </template>
        </div>

        <div class="chat-compose">
          <textarea v-model="input" placeholder="输入审计问题，Enter 发送，Shift + Enter 换行" @keydown="handleKeydown"></textarea>
          <div class="chat-compose-actions"><span class="chat-compose-hint">{{ isConfigured ? '回答可能不完整，请以正式准则和证据为准。' : '请先配置 AI 服务。' }}</span><el-button type="primary" :loading="aiState.sending" :disabled="!input.trim() || !isConfigured" @click="submit()"><el-icon><Promotion /></el-icon>{{ aiState.sending ? '生成中' : '发送' }}</el-button></div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.mb-16 { margin-bottom: 16px; }
.ml-8 { margin-left: 8px; }
.ai-sidebar-footer { display: flex; gap: 6px; align-items: flex-start; line-height: 1.5; }
.ai-sidebar-footer .el-icon { flex: 0 0 auto; margin-top: 2px; color: var(--amber); }
</style>
