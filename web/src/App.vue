<script setup>
import { computed, defineComponent, h, markRaw, nextTick, onActivated, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
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
  MoreFilled,
  Reading
} from '@element-plus/icons-vue'
import AnalysisView from './views/AnalysisView.vue'
import ViewLoading from './components/ViewLoading.vue'
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

/**
 * 桌面端导航分两层，并且「放几项」是量出来的，不是猜出来的。
 *
 * 起因是实测：7 项平铺时 .top-nav 需要 635px，而 1024 视口下只有 557px、
 * 1280 下只有 680px。原来靠 `overflow-x: auto` + 隐藏滚动条掩盖，
 * 结果「设置」在 1024/1280 下完全看不见且没有任何提示——这是被禁止的解法。
 *
 * 现在：高频入口直接平铺，使用教程与设置收进「更多」下拉。功能一个没删，只是重新分层。
 *
 * 为什么用测量而不是断点（试过，很难受）：
 *   一开始想用 matchMedia('(max-width: 960px)') 切 5 项 / 4 项。踩到的坑是——
 *   页面被嵌在 iframe 里、且 devicePixelRatio 不是 1 时，setup 那一刻视口宽度
 *   是「最终宽度 ÷ dpr」（1440 的 iframe 在 dpr=1.5 下是 960），正好命中断点边界；
 *   之后视口变成真实宽度，那次 change / resize 事件都不会送达，ref 永远停在错误值。
 *   症状极具欺骗性：所有断言都「通过」，只是形态错了，而且不报任何错。
 *
 * 所以改成直接量：navEl.scrollWidth 是内容自然宽度（overflow:hidden 也不影响它），
 * navEl.clientWidth 是可用宽度。内容放不下就少放一项。这也让「桌面端永不横向溢出」
 * 成为被测量保证的不变量，而不是依赖某个断点恰好没写错。
 */
const PRIMARY_NAV = ['analysis', 'accounting', 'documents', 'knowledge', 'chat']
/**
 * 放不下时按这个顺序把一级项收进「更多」。
 * 排在后面的是使用频率较低、且按既定层级本就是二级/辅助的项。
 * 至少保留 analysis / accounting / 底稿文书，最差也还有 2 项 + 「更多」。
 */
const DEMOTE_ORDER = ['knowledge', 'chat', 'documents']
const OVERFLOW_NAV = ['tutorial', 'settings']

/** 已收进「更多」的一级项数量（取 DEMOTE_ORDER 的前 N 个）。 */
const demotedCount = ref(0)
const demotedIds = computed(() => DEMOTE_ORDER.slice(0, demotedCount.value))
const navEl = ref(null)

const primaryNavItems = computed(() => navItems.filter((item) => PRIMARY_NAV.includes(item.id) && !demotedIds.value.includes(item.id)))
const overflowNavItems = computed(() => navItems.filter((item) => [...OVERFLOW_NAV, ...demotedIds.value].includes(item.id)))
const overflowActive = computed(() => overflowNavItems.value.some((item) => item.id === activeView.value))

/**
 * 逐档试放，量到放得下就停。
 *
 * scrollWidth 是内容的自然宽度（overflow:hidden 不影响它），clientWidth 是可用宽度，
 * 所以「末尾项被裁掉且点不到」这件事有了一个直接、可测的判据。
 * 收项只会让导航变窄，因此这个过程单调收敛，不会来回抖。
 */
let fitting = false
async function fitNav() {
  if (fitting) return
  const nav = navEl.value
  if (!nav || !nav.clientWidth) return
  fitting = true
  try {
    // 先把全部项放回来量一次，否则会卡在上一轮的档位上
    if (demotedCount.value !== 0) {
      demotedCount.value = 0
      await nextTick()
    }
    for (let step = 1; step <= DEMOTE_ORDER.length; step += 1) {
      const el = navEl.value
      if (!el || !el.clientWidth) return
      if (el.scrollWidth <= el.clientWidth + 1) return // 上一档就放得下
      demotedCount.value = step
      await nextTick()
    }
  } finally {
    fitting = false
  }
}

/**
 * 盯住导航与顶栏宽度。
 * 只看 nav 自己的 box 不够——可用宽度是顶栏分给它的，nav 的盒子宽度不变而内容会被挤。
 */
function watchNavFit() {
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => fitNav())
    if (navEl.value) {
      observer.observe(navEl.value)
      if (navEl.value.parentElement) observer.observe(navEl.value.parentElement)
    }
    onBeforeUnmount(() => observer.disconnect())
  }
  if (typeof window !== 'undefined') {
    const onResize = () => fitNav()
    window.addEventListener('resize', onResize)
    onBeforeUnmount(() => window.removeEventListener('resize', onResize))
  }
  onMounted(() => {
    fitNav()
    // 字体与图标加载完会改变项宽，补测几次
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(fitNav)
      requestAnimationFrame(fitNav)
    }
    setTimeout(fitNav, 120)
    setTimeout(fitNav, 400)
  })
}

// 移动端底部标签只保留 4 个高频入口 + “更多”，避免每格过窄；
// 底稿、法规速查、设置收进“更多”面板。
const tabItems = navItems.filter((item) => ['analysis', 'accounting', 'chat', 'tutorial'].includes(item.id))
const moreItems = navItems
  .filter((item) => OVERFLOW_NAV.includes(item.id) || item.id === 'documents' || item.id === 'knowledge')
  .map((item) => ({
    ...item,
    desc: {
      documents: '询证函、监盘表、调整汇总表',
      knowledge: '准则与实务指引离线搜索',
      tutorial: '三步快速开始与可运行用例',
      settings: 'AI 接口与本地工作区'
    }[item.id] || ''
  }))

const showPrivacyTag = computed(() => activeView.value !== 'chat')

/**
 * 页面懒加载。
 *
 * 只有 AnalysisView 保持静态引入：它是默认落地页，也是三处「切过去立刻派发事件」
 * 的目标（导入数据、Ctrl+K 聚焦、教程页载入用例）。若它也异步化，
 * nextTick 派发的事件会在组件挂载前发出，功能静默失效。
 * 其余 6 个页面按需加载——访问 AI 问答才拉 ChatView 与 ai-service，
 * 访问会计基础才拉分录知识库、利润计算器与 OCR 管线。
 *
 * 为什么不用 defineAsyncComponent 内建的 loading / error 组件（用过，有三个问题）：
 *  1) Vue 只给 errorComponent 传 `error`，不给它重试回调，`retry` 只在 onError 里拿得到；
 *  2) 不提供 errorComponent 时，fail() 之后**什么都不渲染**——用户看到的是白屏；
 *  3) loadingComponent 永远拿不到 `error`，所以 ViewLoading 里那段「页面加载失败」
 *     分支其实是**死代码**，从来没显示过。
 * 结果就是：chunk 拉不下来（网络抖动、部署换哈希、服务停了）时，
 * 用户只能看到「正在加载页面…」转圈转到 30 秒超时，然后白屏，没有任何出路。
 * 这正是用户报「底稿文书怎么一直在加载」时暴露的真实缺陷。
 *
 * 自己管状态就能把三件事都做对：转圈只在真需要时出现、失败有明确界面、重试真的能点。
 */
/**
 * 资源加载失败后的出口。
 *
 * 为什么不是普通 location.reload()：实测把某个 chunk 请求打断、再放开拦截之后，
 * 普通 reload **仍然失败**——Chrome 会把"这个子资源刚才失败了"记在渲染进程里，
 * 同一个文档 URL 重载不会重新去取它，用户点几次都一样，等于出口是假的。
 * 换一个带时间戳的文档 URL（location.replace）才会走一次全新的文档与资源请求。
 */
const RECOVER_PARAM = '_r'
function reloadFresh() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(RECOVER_PARAM, String(Date.now()))
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}
/** 恢复成功后把地址栏里的临时参数清掉，别留在用户的 URL 里 */
function clearRecoverParam() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(RECOVER_PARAM)) return
    url.searchParams.delete(RECOVER_PARAM)
    window.history.replaceState(null, '', url.toString())
  } catch { /* 地址栏清理失败不影响使用 */ }
}

const lazyView = (name, loader) => defineComponent({
  name,
  setup() {
    const phase = ref('pending')        // pending | ready | error
    const comp = shallowRef(null)
    const delayed = ref(false)
    const attempts = ref(0)
    // 140ms 内加载完就不闪占位，避免快网下出现一帧空白
    const delayTimer = window.setTimeout(() => { delayed.value = true }, 140)

    const attempt = async () => {
      phase.value = 'pending'
      delayed.value = false
      window.clearTimeout(delayTimer)
      const showTimer = window.setTimeout(() => { delayed.value = true }, 140)
      // 网络抖动 / 残缺缓存：自动再试一次，两次都失败才交给用户
      for (let i = 0; i < 2; i++) {
        try {
          const mod = await loader()
          comp.value = markRaw(mod.default || mod)
          phase.value = 'ready'
          window.clearTimeout(showTimer)
          clearRecoverParam()
          return
        } catch (error) {
          attempts.value = i + 1
          console.warn(`[lazy] ${name} 加载失败（第 ${attempts.value} 次）：`, error)
        }
      }
      window.clearTimeout(showTimer)
      phase.value = 'error'
    }
    attempt()

    // 被 KeepAlive 保活的情况下，切走再切回不会重新挂载。
    // 如果上次是失败状态，用户"离开再回来"应当等于一次重试——否则那个页面
    // 在本次会话里就永远是失败界面，只能整页刷新。
    let firstActivate = true
    onActivated(() => {
      if (firstActivate) { firstActivate = false; return }
      if (phase.value === 'error') attempt()
    })

    return () => {
      if (phase.value === 'ready' && comp.value) return h(comp.value)
      if (phase.value === 'pending' && !delayed.value) return null
      return h(ViewLoading, {
        error: phase.value === 'error' ? '页面资源加载失败' : null,
        attempts: attempts.value,
        onReload: reloadFresh
      })
    }
  }
})

const VIEW_COMPONENTS = {
  analysis: AnalysisView,
  accounting: lazyView('AccountingView', () => import('./views/AccountingView.vue')),
  documents: lazyView('DocumentsView', () => import('./views/DocumentsView.vue')),
  knowledge: lazyView('KnowledgeView', () => import('./views/KnowledgeView.vue')),
  chat: lazyView('ChatView', () => import('./views/ChatView.vue')),
  tutorial: lazyView('TutorialView', () => import('./views/TutorialView.vue')),
  settings: lazyView('SettingsView', () => import('./views/SettingsView.vue'))
}
const activeComponent = computed(() => VIEW_COMPONENTS[activeView.value] || AnalysisView)

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
watchNavFit()
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
            <span class="brand-caption">AuditDesk · 2.2</span>
          </span>
        </button>

        <nav ref="navEl" class="top-nav" aria-label="主导航">
          <button
            v-for="item in primaryNavItems"
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

          <el-dropdown trigger="click" placement="bottom-end" @command="navigate">
            <button
              class="top-nav-item top-nav-more"
              :class="{ 'is-active': overflowActive }"
              type="button"
              :aria-label="overflowNavItems.map((i) => i.label).join('、')"
              title="更多"
            >
              <el-icon><MoreFilled /></el-icon>
              <span>更多</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="item in overflowNavItems" :key="item.id" :command="item.id">
                  <el-icon><component :is="item.icon" /></el-icon>
                  {{ item.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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

        <!--
          KeepAlive 保活：切换视图不丢页面状态（已载入的台账、填好的参数、
          OCR 结果与勾选项）。首次访问才拉 chunk，之后直接从缓存复用。
          刻意不给 max 上限：只有 7 个视图，且它们各自的状态都很小；
          若将来视图增多导致内存问题，max 是唯一需要动的参数。
        -->
        <KeepAlive>
          <component :is="activeComponent" />
        </KeepAlive>
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

