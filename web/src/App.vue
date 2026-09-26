<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
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
import { ROUTES, currentRoute, currentView, navigate as routerNavigate, startRouter } from './lib/router'

// 路由在 setup 阶段就启动：保证首屏渲染前 activeView 已是 hash 指定的视图，
// 否则刷新会先闪一下默认页再跳走。
startRouter()
const activeView = currentView
const guideVisible = ref(false)
const moreVisible = ref(false)

// 图标留在视图层，路由层不依赖 UI 框架。label / 分组 / 页面元信息统一取自 ROUTES。
const NAV_ICONS = {
  analysis: DataAnalysis,
  accounting: Tickets,
  documents: Document,
  knowledge: Search,
  chat: ChatDotRound,
  tutorial: Reading,
  settings: Setting
}
const navItems = Object.values(ROUTES).map((route) => ({ id: route.id, label: route.label, group: route.group, icon: NAV_ICONS[route.id] }))

// 移动端底部标签只保留 4 个高频入口 + “更多”，避免每格过窄；
// 底稿、法规速查、设置收进“更多”面板。
const tabItems = navItems.filter((item) => ['analysis', 'accounting', 'chat', 'tutorial'].includes(item.id))
const moreItems = navItems
  .filter((item) => ['documents', 'knowledge', 'settings'].includes(item.id))
  .map((item) => ({
    ...item,
    desc: { documents: '询证函、监盘表、调整汇总表', knowledge: '准则与实务指引离线搜索', settings: 'AI 接口与本地工作区' }[item.id]
  }))

const showPrivacyTag = computed(() => activeView.value !== 'chat')

// 视图切换统一在这里滚回顶部。放在 watch 里而不是 navigate 里，
// 是为了同时覆盖程序化跳转和浏览器前进/后退。
watch(activeView, () => {
  moreVisible.value = false
  window.scrollTo({ top: 0, behavior: 'auto' })
})

// 兼容旧契约：ChatView / TutorialView 通过 inject('navigate') 使用
function navigate(id) {
  return routerNavigate(id)
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
            <p v-if="currentRoute().meta.crumb" class="page-crumb">{{ currentRoute().meta.crumb }}</p>
            <p v-if="currentRoute().meta.eyebrow" class="page-eyebrow">{{ currentRoute().meta.eyebrow }}</p>
            <h1 class="page-title">{{ currentRoute().meta.title }}</h1>
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

