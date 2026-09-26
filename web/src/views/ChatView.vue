<script setup>
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import {
  ChatDotRound,
  Delete,
  DocumentCopy,
  Loading,
  Message,
  Plus,
  Promotion,
  Setting,
  WarningFilled
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
import { markdownToPlainText, renderMarkdown } from '../lib/markdown'

const navigate = inject('navigate', () => {})
const input = ref('')
const messageList = ref(null)
const composer = ref(null)
const drawerVisible = ref(false)
const copiedId = ref('')

const activeConversation = computed(() => getActiveConversation())
const messages = computed(() => activeConversation.value?.messages || [])
const hasMessages = computed(() => messages.value.length > 0)
const providerStatus = computed(() => (isConfigured.value ? '已配置' : '待配置'))
const canSend = computed(() => Boolean(input.value.trim()) && isConfigured.value && !aiState.sending)

function scrollToBottom(behavior = 'auto') {
  nextTick(() => {
    const el = messageList.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  })
}

function newChat() {
  createConversation()
  drawerVisible.value = false
  scrollToBottom()
}

function chooseConversation(id) {
  selectConversation(id)
  drawerVisible.value = false
  scrollToBottom()
}

async function removeConversation(id, event) {
  event.stopPropagation()
  try {
    await ElMessageBox.confirm('删除这条本地对话记录？', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    deleteConversation(id)
  } catch {
    // 用户取消时不改变当前状态。
  }
}

async function submit() {
  const question = input.value.trim()
  if (!question || aiState.sending || !isConfigured.value) return
  input.value = ''
  resizeComposer()
  await scrollToBottom('smooth')
  await sendMessage(question)
  await scrollToBottom('smooth')
}

function usePrompt(prompt) {
  input.value = prompt
  submit()
}

function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function resizeComposer() {
  const el = composer.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

function messageHtml(message, index) {
  if (message.role === 'user') return ''
  const isStreaming = aiState.sending && index === messages.value.length - 1
  const body = message.content || (isStreaming ? '' : '')
  if (!body) return isStreaming ? '' : '<p class="md-placeholder">（空回复）</p>'
  return renderMarkdown(body)
}

function isStreaming(index) {
  return aiState.sending && index === messages.value.length - 1
}

async function copyMessage(message, index) {
  const text = message.role === 'user' ? message.content : markdownToPlainText(message.content)
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = `${index}`
    setTimeout(() => {
      if (copiedId.value === `${index}`) copiedId.value = ''
    }, 1800)
  } catch {
    ElMessage.warning('浏览器未授权剪贴板，请手动选择文本复制。')
  }
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

watch(() => messages.value.length, () => scrollToBottom())
watch(() => activeConversation.value?.id, () => scrollToBottom())
watch(() => messages.value[messages.value.length - 1]?.content, (value) => {
  if (value) scrollToBottom()
})
onMounted(scrollToBottom)
</script>

<template>
  <div class="chat-view">
    <el-alert v-if="!isConfigured" class="mb-16" type="warning" :closable="false" show-icon>
      <template #title>还没有配置 AI 服务</template>
      <template #default>
        可以先浏览界面；配置 DeepSeek API Key，或启动 Ollama 后即可使用本地模型。
        <el-button text type="primary" @click="navigate('settings')">去设置</el-button>
      </template>
    </el-alert>
    <div v-else-if="aiState.lastError" class="mb-16">
      <el-alert type="error" :closable="false" show-icon :title="aiState.lastError" />
    </div>

    <div class="chat-shell">
      <!-- 会话列表：桌面常驻侧栏，移动端抽屉 -->
      <aside class="chat-rail" :class="{ 'is-open': drawerVisible }">
        <div class="chat-rail-head">
          <div class="chat-rail-title">
            <h2>对话记录</h2>
            <span>{{ aiState.conversations.length }} 条</span>
          </div>
          <el-button type="primary" size="small" plain @click="newChat">
            <el-icon><Plus /></el-icon>新建
          </el-button>
        </div>
        <div v-if="aiState.conversations.length" class="chat-rail-list">
          <div
            v-for="conversation in aiState.conversations"
            :key="conversation.id"
            class="chat-rail-item"
            :class="{ 'is-active': activeConversation?.id === conversation.id }"
            role="button"
            tabindex="0"
            @click="chooseConversation(conversation.id)"
            @keydown.enter="chooseConversation(conversation.id)"
          >
            <el-icon><Message /></el-icon>
            <span class="chat-rail-item-title">{{ conversation.title || '新对话' }}</span>
            <button class="chat-rail-item-delete" type="button" aria-label="删除对话" @click="removeConversation(conversation.id, $event)">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>
        <div v-else class="chat-rail-empty">还没有对话</div>
        <div class="chat-rail-foot">
          <el-icon><WarningFilled /></el-icon>
          <span>AI 输出仅作辅助，请结合准则和证据复核。</span>
        </div>
      </aside>
      <div v-if="drawerVisible" class="chat-rail-mask" @click="drawerVisible = false"></div>

      <!-- 对话主体 -->
      <section class="chat-main">
        <header class="chat-bar">
          <el-button class="chat-bar-drawer" text circle aria-label="对话记录" @click="drawerVisible = true">
            <el-icon><Message /></el-icon>
          </el-button>
          <div class="chat-bar-title">
            <strong>{{ activeConversation?.title || '新的审计对话' }}</strong>
            <span>{{ providerLabel }} · {{ currentModel }}</span>
          </div>
          <div class="chat-bar-actions">
            <el-tag :type="isConfigured ? 'success' : 'warning'" effect="light" size="small">{{ providerStatus }}</el-tag>
            <el-button class="chat-bar-settings" text circle aria-label="设置" @click="navigate('settings')">
              <el-icon><Setting /></el-icon>
            </el-button>
          </div>
        </header>

        <div ref="messageList" class="chat-stream">
          <div v-if="!hasMessages" class="chat-welcome">
            <div class="chat-welcome-icon"><el-icon><ChatDotRound /></el-icon></div>
            <h3>从一个问题开始</h3>
            <p>可以询问审计程序、准则思路、函证处理或底稿整理。回答会尽量给出可执行的证据清单。</p>
            <div class="chat-prompt-grid">
              <button v-for="prompt in quickPrompts().slice(0, 6)" :key="prompt" type="button" class="chat-prompt" @click="usePrompt(prompt)">
                <el-icon><Promotion /></el-icon><span>{{ prompt }}</span>
              </button>
            </div>
          </div>

          <div v-else class="chat-thread">
            <article
              v-for="(message, index) in messages"
              :key="`${message.createdAt}-${index}`"
              class="chat-msg"
              :class="message.role === 'user' ? 'is-user' : 'is-assistant'"
            >
              <div class="chat-msg-avatar" :class="message.role === 'user' ? 'is-user' : 'is-bot'">
                <span>{{ message.role === 'user' ? '我' : 'AI' }}</span>
              </div>
              <div class="chat-msg-body">
                <div class="chat-msg-head">
                  <strong>{{ message.role === 'user' ? '你' : 'AI 助手' }}</strong>
                  <span v-if="formatTime(message.createdAt)">{{ formatTime(message.createdAt) }}</span>
                </div>
                <div class="chat-msg-content markdown-body">
                  <template v-if="message.role === 'user'">{{ message.content }}</template>
                  <template v-else>
                    <div v-if="isStreaming(index) && !message.content" class="chat-typing">
                      <span></span><span></span><span></span>
                    </div>
                    <div v-else v-html="messageHtml(message, index)"></div>
                    <span v-if="isStreaming(index) && message.content" class="chat-caret"></span>
                  </template>
                </div>
                <div v-if="message.content && !isStreaming(index)" class="chat-msg-actions">
                  <button type="button" class="chat-msg-action" @click="copyMessage(message, index)">
                    <el-icon><DocumentCopy /></el-icon>{{ copiedId === `${index}` ? '已复制' : '复制' }}
                  </button>
                </div>
              </div>
            </article>
            <div v-if="aiState.sending" class="chat-streaming-note">
              <el-icon class="is-loading"><Loading /></el-icon>正在生成回答…
            </div>
          </div>
        </div>

        <footer class="chat-composer">
          <div class="chat-composer-box">
            <textarea
              ref="composer"
              v-model="input"
              rows="1"
              :placeholder="isConfigured ? '输入审计问题，Enter 发送，Shift + Enter 换行' : '请先在设置页配置 AI 服务'"
              :disabled="!isConfigured"
              @keydown="handleKeydown"
              @input="resizeComposer"
            ></textarea>
            <el-button
              class="chat-send"
              type="primary"
              circle
              :disabled="!canSend"
              :loading="aiState.sending"
              aria-label="发送"
              @click="submit"
            >
              <el-icon v-if="!aiState.sending"><Promotion /></el-icon>
            </el-button>
          </div>
          <p class="chat-composer-hint">
            {{ isConfigured ? 'AI 输出仅供审计思路参考，不构成结论；请以正式准则和证据为准。' : '配置 DeepSeek、Gemini、Ollama 或自定义接口后即可提问。' }}
          </p>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mb-16 { margin-bottom: 16px; }

/* ---------- 骨架 ---------- */
/* 对话区占满视口剩余高度，消息流与输入区各自独立滚动，避免整页嵌套滚动 */
.chat-shell { display: grid; grid-template-columns: 268px minmax(0, 1fr); gap: 16px; align-items: stretch; height: clamp(560px, calc(100dvh - 232px), 1100px); }

/* ---------- 会话侧栏 ---------- */
.chat-rail { display: flex; min-height: 0; flex-direction: column; padding: 14px; border: 1px solid var(--glass-border); border-radius: 17px; background: var(--surface); box-shadow: var(--shadow-sm); backdrop-filter: blur(22px) saturate(135%); -webkit-backdrop-filter: blur(22px) saturate(135%); }
.chat-rail-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.chat-rail-title { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.chat-rail-title h2 { margin: 0; color: var(--ink-900); font-size: var(--fs-title); font-weight: 730; }
.chat-rail-title span { color: var(--ink-400); font-size: var(--fs-caption); }
.chat-rail-list { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 4px; overflow-y: auto; }
.chat-rail-item { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 9px 10px; border: 1px solid transparent; border-radius: 10px; color: var(--ink-600); background: transparent; text-align: left; cursor: pointer; transition: background .18s ease, border-color .18s ease; }
.chat-rail-item:hover { background: rgba(255, 255, 255, .58); }
.chat-rail-item.is-active { border-color: rgba(47, 111, 228, .16); color: var(--blue-dark); background: linear-gradient(135deg, rgba(234, 242, 255, .92), rgba(255, 255, 255, .52)); }
.chat-rail-item .el-icon { flex: 0 0 auto; }
.chat-rail-item-title { min-width: 0; flex: 1; overflow: hidden; font-size: var(--fs-caption); text-overflow: ellipsis; white-space: nowrap; }
.chat-rail-item-delete { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 8px; color: var(--ink-400); background: transparent; }
.chat-rail-item-delete:hover { color: var(--red); background: var(--red-soft); }
.chat-rail-empty { padding: 26px 10px; color: var(--ink-400); font-size: var(--fs-caption); text-align: center; }
.chat-rail-foot { display: flex; gap: 7px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line-soft); color: var(--ink-400); font-size: var(--fs-caption); line-height: 1.55; }
.chat-rail-foot .el-icon { flex: 0 0 auto; margin-top: 2px; color: var(--amber); }
.chat-rail-mask { display: none; }

/* ---------- 对话主体 ---------- */
.chat-main { display: flex; min-width: 0; min-height: 0; flex-direction: column; border: 1px solid var(--glass-border); border-radius: 17px; background: var(--surface); box-shadow: var(--shadow-sm); backdrop-filter: blur(22px) saturate(135%); -webkit-backdrop-filter: blur(22px) saturate(135%); overflow: hidden; }
.chat-bar { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--line-soft); background: rgba(255, 255, 255, .5); }
.chat-bar-drawer { display: none; }
.chat-bar-title { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.chat-bar-title strong { overflow: hidden; color: var(--ink-900); font-size: var(--fs-title); font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.chat-bar-title span { overflow: hidden; margin-top: 1px; color: var(--ink-400); font-size: var(--fs-caption); text-overflow: ellipsis; white-space: nowrap; }
.chat-bar-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }

/* 消息流：居中限宽 768px，约 65–80 字符一行，长回答最易读 */
.chat-stream { flex: 1; min-height: 0; padding: 22px 20px; overflow-y: auto; overscroll-behavior: contain; background: linear-gradient(180deg, rgba(249, 251, 255, .5), rgba(243, 247, 252, .4)); }
.chat-thread { width: 100%; max-width: 768px; margin: 0 auto; }
.chat-msg { display: flex; gap: 12px; margin-bottom: 22px; }
.chat-msg-avatar { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 11px; font-size: var(--fs-caption); font-weight: 750; }
.chat-msg-avatar.is-user { color: #fff; background: linear-gradient(140deg, #5b95ef, #2f6fe4); box-shadow: 0 5px 14px rgba(47, 111, 228, .22); }
.chat-msg-avatar.is-bot { color: var(--teal); background: linear-gradient(140deg, #eafaf6, #d6f2ec); border: 1px solid rgba(14, 139, 131, .2); }
.chat-msg-body { min-width: 0; flex: 1; }
.chat-msg-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
.chat-msg-head strong { color: var(--ink-900); font-size: var(--fs-caption); font-weight: 700; }
.chat-msg-head span { color: var(--ink-400); font-size: var(--fs-micro); }
.chat-msg-content { color: var(--ink-700); font-size: var(--fs-lead); line-height: var(--lh-body); overflow-wrap: anywhere; }
.chat-msg.is-user .chat-msg-content { display: inline-block; padding: 10px 14px; border-radius: 4px 14px 14px 14px; color: var(--ink-800); background: rgba(234, 242, 255, .82); border: 1px solid rgba(47, 111, 228, .13); white-space: pre-wrap; }
.chat-msg.is-assistant .chat-msg-content { padding: 2px 0; }
.chat-msg-actions { display: flex; gap: 6px; margin-top: 8px; opacity: 0; transition: opacity .18s ease; }
.chat-msg:hover .chat-msg-actions, .chat-msg:focus-within .chat-msg-actions { opacity: 1; }
.chat-msg-action { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink-500); background: rgba(255, 255, 255, .6); font-size: var(--fs-micro); }
.chat-msg-action:hover { border-color: rgba(47, 111, 228, .28); color: var(--blue); background: var(--blue-soft); }
.chat-typing { display: flex; gap: 5px; padding: 6px 0; }
.chat-typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-400); animation: chat-blink 1.2s infinite ease-in-out; }
.chat-typing span:nth-child(2) { animation-delay: .18s; }
.chat-typing span:nth-child(3) { animation-delay: .36s; }
@keyframes chat-blink { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.chat-caret { display: inline-block; width: 2px; height: 1.05em; margin-left: 2px; vertical-align: text-bottom; background: var(--blue); animation: chat-caret 1s steps(2) infinite; }
@keyframes chat-caret { 50% { opacity: 0; } }
.chat-streaming-note { display: flex; align-items: center; gap: 7px; margin: 4px 0 8px 46px; color: var(--ink-400); font-size: var(--fs-caption); }

/* ---------- 空状态 ---------- */
.chat-welcome { max-width: 660px; margin: 24px auto; text-align: center; }
.chat-welcome-icon { display: grid; width: 56px; height: 56px; place-items: center; margin: 0 auto 14px; border: 1px solid rgba(47, 111, 228, .14); border-radius: 18px; color: var(--blue); background: linear-gradient(145deg, rgba(234, 242, 255, .95), rgba(255, 255, 255, .66)); box-shadow: 0 10px 24px rgba(47, 111, 228, .12); font-size: 1.5rem; }
.chat-welcome h3 { margin: 0 0 6px; color: var(--ink-900); font-size: 1.375rem; }
.chat-welcome p { margin: 0 auto; max-width: 480px; color: var(--ink-500); font-size: var(--fs-body); }
.chat-prompt-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 22px; text-align: left; }
.chat-prompt { display: flex; align-items: flex-start; gap: 8px; min-height: 44px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 12px; color: var(--ink-600); background: rgba(255, 255, 255, .55); font-size: var(--fs-caption); line-height: 1.5; text-align: left; transition: all .18s ease; }
.chat-prompt:hover { border-color: rgba(47, 111, 228, .26); color: var(--blue-dark); background: rgba(234, 242, 255, .8); }

/* ---------- 输入区 ---------- */
.chat-composer { padding: 12px 16px 14px; border-top: 1px solid var(--line-soft); background: rgba(255, 255, 255, .58); }
.chat-composer-box { display: flex; align-items: flex-end; gap: 8px; width: 100%; max-width: 768px; margin: 0 auto; padding: 7px 7px 7px 14px; border: 1px solid var(--line-strong); border-radius: 16px; background: rgba(255, 255, 255, .78); transition: border-color .18s ease, box-shadow .18s ease; }
.chat-composer-box:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(47, 111, 228, .1); }
.chat-composer-box textarea { min-width: 0; flex: 1; max-height: 200px; padding: 8px 0; border: 0; outline: none; color: var(--ink-900); background: transparent; font-size: var(--fs-lead); line-height: 1.6; resize: none; }
.chat-composer-box textarea::placeholder { color: var(--ink-400); }
.chat-send { flex: 0 0 auto; width: 40px; height: 40px; }
.chat-composer-hint { max-width: 768px; margin: 7px auto 0; color: var(--ink-400); font-size: var(--fs-micro); line-height: 1.5; }

/* ---------- Markdown 排版 ----------
   注意：正文通过 v-html 注入，不会带上 scoped 的 data-v 属性，
   因此所有后代选择器必须包在 :deep() 里，否则样式会静默失效。 */
.markdown-body :deep(> :first-child) { margin-top: 0; }
.markdown-body :deep(> :last-child) { margin-bottom: 0; }
.markdown-body :deep(p) { margin: 0 0 12px; }
.markdown-body :deep(h2) { margin: 22px 0 9px; color: var(--ink-900); font-size: 1.1875rem; font-weight: 720; line-height: 1.35; }
.markdown-body :deep(h3) { margin: 18px 0 8px; color: var(--ink-900); font-size: 1.0625rem; font-weight: 700; line-height: 1.4; }
.markdown-body :deep(h4), .markdown-body :deep(h5), .markdown-body :deep(h6) { margin: 15px 0 7px; color: var(--ink-800); font-size: var(--fs-lead); font-weight: 700; line-height: 1.45; }
.markdown-body :deep(h2:first-child), .markdown-body :deep(h3:first-child) { margin-top: 0; }
.markdown-body :deep(strong) { color: var(--ink-900); font-weight: 700; }
.markdown-body :deep(em) { font-style: italic; }
.markdown-body :deep(del) { color: var(--ink-400); }
.markdown-body :deep(a) { color: var(--blue-dark); text-decoration: underline; text-underline-offset: 2px; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 0 0 12px; padding-left: 24px; }
.markdown-body :deep(ul.md-list) { list-style: disc; }
.markdown-body :deep(ol.md-list) { list-style: decimal; }
.markdown-body :deep(ul.md-list ul.md-list) { list-style: circle; }
.markdown-body :deep(li) { margin: 5px 0; }
.markdown-body :deep(li > ul), .markdown-body :deep(li > ol) { margin: 5px 0 2px; }
.markdown-body :deep(blockquote) { margin: 0 0 12px; padding: 9px 14px; border-left: 3px solid rgba(47, 111, 228, .4); border-radius: 0 10px 10px 0; color: var(--ink-600); background: rgba(234, 242, 255, .6); }
.markdown-body :deep(blockquote p:last-child) { margin-bottom: 0; }
.markdown-body :deep(hr) { margin: 18px 0; border: 0; border-top: 1px solid var(--line); }
.markdown-body :deep(code) { padding: 2px 6px; border: 1px solid var(--line-soft); border-radius: 6px; color: var(--blue-dark); background: rgba(234, 242, 255, .7); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9em; }
.markdown-body :deep(pre.md-code) { position: relative; margin: 0 0 14px; padding: 13px 14px; border: 1px solid var(--line); border-radius: 12px; background: #1b2436; overflow-x: auto; }
.markdown-body :deep(pre.md-code code) { padding: 0; border: 0; color: #e2e8f4; background: transparent; font-size: .875rem; line-height: 1.65; }
.markdown-body :deep(.md-code-lang) { position: absolute; top: 7px; right: 10px; color: #7d8ba6; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: var(--fs-micro); letter-spacing: .06em; text-transform: uppercase; }
.markdown-body :deep(.md-table-wrap) { margin: 0 0 14px; overflow-x: auto; border: 1px solid var(--line); border-radius: 11px; }
.markdown-body :deep(table.md-table) { width: 100%; border-collapse: collapse; font-size: var(--fs-caption); }
.markdown-body :deep(table.md-table th), .markdown-body :deep(table.md-table td) { padding: 8px 11px; border-bottom: 1px solid var(--line-soft); text-align: left; }
.markdown-body :deep(table.md-table th) { color: var(--ink-600); background: rgba(245, 248, 253, .9); font-weight: 700; white-space: nowrap; }
.markdown-body :deep(table.md-table tr:last-child td) { border-bottom: 0; }
.markdown-body :deep(.md-placeholder) { color: var(--ink-400); font-style: italic; }

/* ---------- 响应式 ---------- */
@media (max-width: 1080px) {
  .chat-shell { grid-template-columns: 224px minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .chat-shell { grid-template-columns: minmax(0, 1fr); }
  .chat-rail { position: fixed; z-index: 60; top: 0; bottom: 0; left: 0; width: min(84vw, 300px); border-radius: 0 16px 16px 0; transform: translateX(-102%); transition: transform .24s ease; }
  .chat-rail.is-open { transform: translateX(0); }
  .chat-rail-mask { position: fixed; z-index: 55; inset: 0; display: block; background: rgba(15, 26, 48, .38); backdrop-filter: blur(2px); }
  .chat-bar-drawer { display: inline-flex; }
}
@media (max-width: 620px) {
  .chat-prompt-grid { grid-template-columns: 1fr; }
  .chat-stream { padding: 16px 13px; }
  .chat-msg { gap: 9px; margin-bottom: 18px; }
  .chat-msg-avatar { width: 30px; height: 30px; border-radius: 9px; }
  .chat-msg-content { font-size: var(--fs-lead); }
  .chat-composer { padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); }
  .chat-composer-box { border-radius: 14px; padding: 6px 6px 6px 12px; }
  .chat-send { width: 38px; height: 38px; }
  .chat-bar { padding: 10px 13px; }
  .chat-msg-actions { opacity: 1; }
  .markdown-body pre.md-code { padding: 11px 12px; }
}
</style>
