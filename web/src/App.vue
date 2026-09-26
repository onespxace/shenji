<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import {
  DataAnalysis,
  Document,
  Tickets,
  Search,
  ChatDotRound,
  Setting,
  Upload,
  QuestionFilled,
  CircleCheckFilled,
  Grid,
  Reading
} from '@element-plus/icons-vue'
import AnalysisView from './views/AnalysisView.vue'
import AccountingView from './views/AccountingView.vue'
import DocumentsView from './views/DocumentsView.vue'
import KnowledgeView from './views/KnowledgeView.vue'
import ChatView from './views/ChatView.vue'
import SettingsView from './views/SettingsView.vue'
import TutorialView from './views/TutorialView.vue'
import emblemUrl from './assets/brand/emblem-128.png'

const activeView = ref('analysis')
const guideVisible = ref(false)
const moreVisible = ref(false)

const navItems = [
  { id: 'analysis', label: '数据分析', icon: DataAnalysis },
  { id: 'accounting', label: '会计基础', icon: Tickets },
  { id: 'documents', label: '底稿文书', icon: Document },
  { id: 'knowledge', label: '法规速查', icon: Search },
  { id: 'chat', label: 'AI 问答', icon: ChatDotRound },
  { id: 'tutorial', label: '使用教程', icon: Reading },
  { id: 'settings', label: '设置', icon: Setting }
]

// 移动端底部标签只保留 4 个高频入口 + “更多”，避免每格过窄；
// 底稿、法规速查、设置收进“更多”面板。
const tabItems = [
  { id: 'analysis', label: '数据分析', icon: DataAnalysis },
  { id: 'accounting', label: '会计基础', icon: Tickets },
  { id: 'chat', label: 'AI 问答', icon: ChatDotRound },
  { id: 'tutorial', label: '教程', icon: Reading }
]
const moreItems = [
  { id: 'documents', label: '底稿文书', desc: '询证函、监盘表、调整汇总表', icon: Document },
  { id: 'knowledge', label: '法规速查', desc: '准则与实务指引离线搜索', icon: Search },
  { id: 'settings', label: '设置', desc: 'AI 接口与本地工作区', icon: Setting }
]

const pageMeta = {
  analysis: { crumb: '工作台 / 数据分析', eyebrow: 'Audit procedures', title: '数据分析' },
  accounting: { crumb: '工作台 / 会计基础', eyebrow: 'Accounting basics', title: '会计基础' },
  documents: { crumb: '工作台 / 底稿文书', eyebrow: 'Working papers', title: '底稿文书' },
  knowledge: { crumb: '知识与协作 / 法规速查', eyebrow: 'Knowledge base', title: '法规速查' },
  chat: { crumb: '知识与协作 / AI 问答', eyebrow: 'Audit copilot', title: 'AI 问答' },
  tutorial: { crumb: '帮助 / 使用教程', eyebrow: 'Guide & cases', title: '使用教程与用例' },
  settings: { crumb: '系统 / 设置', eyebrow: 'Workspace settings', title: '设置' }
}
const currentMeta = computed(() => pageMeta[activeView.value] || pageMeta.analysis)
const showPrivacyTag = computed(() => activeView.value !== 'chat')

function navigate(id) {
  if (!pageMeta[id]) return
  activeView.value = id
  moreVisible.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
provide('navigate', navigate)

function requestImport() {
  navigate('analysis')
  nextTick(() => window.dispatchEvent(new CustomEvent('auditdesk:import')))
}

function handleKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    navigate('analysis')
    nextTick(() => window.dispatchEvent(new CustomEvent('auditdesk:focus-search')))
  }
}
onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="app-shell">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>
    <div class="ambient ambient-three"></div>

    <header class="app-topbar">
      <div class="topbar-inner">
        <button class="brand-button" type="button" title="返回数据分析" @click="navigate('analysis')">
          <span class="brand-mark"><img :src="emblemUrl" alt="郑州工商学院审计学本科2501班徽标" width="44" height="44" /></span>
          <span class="brand-copy">
            <span class="brand-name">审计工作台</span>
            <span class="brand-caption">AuditDesk · 2.2 开发版</span>
          </span>
        </button>

        <nav class="top-nav" aria-label="主导航">
          <button
            v-for="item in navItems"
            :key="item.id"
            class="top-nav-item"
            :class="{ 'is-active': activeView === item.id }"
            type="button"
            :aria-current="activeView === item.id ? 'page' : undefined"
            :aria-label="item.label"
            :title="item.label"
            @click="navigate(item.id)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="topbar-actions">
          <div class="workspace-status"><span class="status-dot"></span><span>本地工作区</span></div>
          <el-button class="help-button" text circle aria-label="使用说明" title="使用说明" @click="guideVisible = true">
            <el-icon><QuestionFilled /></el-icon>
          </el-button>
          <el-button class="import-button" type="primary" @click="requestImport">
            <el-icon><Upload /></el-icon>
            <span>导入数据</span>
          </el-button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="app-content">
        <div class="page-header">
          <div class="page-header-text">
            <p v-if="currentMeta.eyebrow" class="page-eyebrow">{{ currentMeta.eyebrow }}</p>
            <h1 class="page-title">{{ currentMeta.title }}</h1>
          </div>
          <div v-if="showPrivacyTag" class="page-header-actions">
            <el-tag class="privacy-tag" effect="plain" type="info" round>
              <el-icon><CircleCheckFilled /></el-icon>
              数据不上传
            </el-tag>
          </div>
        </div>

        <AnalysisView v-if="activeView === 'analysis'" />
        <AccountingView v-else-if="activeView === 'accounting'" />
        <DocumentsView v-else-if="activeView === 'documents'" />
        <KnowledgeView v-else-if="activeView === 'knowledge'" />
        <ChatView v-else-if="activeView === 'chat'" />
        <TutorialView v-else-if="activeView === 'tutorial'" />
        <SettingsView v-else />
      </div>
    </main>

    <!-- 移动端底部标签栏：拇指可达，取代横向滚动导航 -->
    <nav class="app-tabbar" aria-label="主导航">
      <button
        v-for="item in tabItems"
        :key="item.id"
        class="app-tab"
        :class="{ 'is-active': activeView === item.id }"
        type="button"
        :aria-current="activeView === item.id ? 'page' : undefined"
        @click="navigate(item.id)"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
      <button
        class="app-tab"
        :class="{ 'is-active': moreItems.some((item) => item.id === activeView) }"
        type="button"
        @click="moreVisible = true"
      >
        <el-icon><Grid /></el-icon>
        <span>更多</span>
      </button>
    </nav>

    <el-drawer v-model="moreVisible" direction="btt" size="auto" :with-header="false" class="more-sheet">
      <div class="more-sheet-inner">
        <div class="more-sheet-grip"></div>
        <div class="more-sheet-list">
          <button v-for="item in moreItems" :key="item.id" type="button" class="more-sheet-item" @click="navigate(item.id)">
            <span class="more-sheet-icon"><el-icon><component :is="item.icon" /></el-icon></span>
            <span class="more-sheet-copy"><strong>{{ item.label }}</strong><em>{{ item.desc }}</em></span>
          </button>
          <button type="button" class="more-sheet-item" @click="moreVisible = false; requestImport()">
            <span class="more-sheet-icon"><el-icon><Upload /></el-icon></span>
            <span class="more-sheet-copy"><strong>导入数据</strong><em>载入 CSV 台账到数据分析</em></span>
          </button>
          <button type="button" class="more-sheet-item" @click="moreVisible = false; guideVisible = true">
            <span class="more-sheet-icon"><el-icon><QuestionFilled /></el-icon></span>
            <span class="more-sheet-copy"><strong>使用说明</strong><em>三步快速开始</em></span>
          </button>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="guideVisible" title="快速开始" width="520px" destroy-on-close>
      <div class="guide-dialog">
        <div class="guide-step"><span>1</span><div><strong>导入台账</strong><p>在数据分析页选择 CSV 文件，也可以先载入示例数据体验。</p></div></div>
        <div class="guide-step"><span>2</span><div><strong>选择审计程序</strong><p>选择程序后设置字段与阈值，结果只在浏览器内计算。</p></div></div>
        <div class="guide-step"><span>3</span><div><strong>留存与复核</strong><p>下载结果 CSV；抽样时记录随机种子，异常结果仅作为待复核线索。</p></div></div>
        <el-alert type="info" :closable="false" show-icon title="AI 是辅助检索与思路整理，不替代审计判断，也不自动形成结论。" />
      </div>
      <template #footer>
        <el-button @click="guideVisible = false">知道了</el-button>
        <el-button type="primary" @click="guideVisible = false; navigate('analysis')">开始使用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.guide-dialog { display: flex; flex-direction: column; gap: 15px; }
.guide-step { display: flex; gap: 11px; }
.guide-step > span { display: grid; width: 24px; height: 24px; flex: 0 0 auto; place-items: center; border-radius: 8px; color: #fff; background: var(--blue); font-size: 0.875rem; font-weight: 700; }
.guide-step strong { color: var(--ink-900); font-size: 0.9375rem; }
.guide-step p { margin: 3px 0 0; color: var(--ink-500); font-size: 0.875rem; line-height: 1.6; }
</style>

