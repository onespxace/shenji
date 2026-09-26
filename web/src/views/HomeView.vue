<script setup>
// 落地页（首页）。
//
// 定位：进去就是它，点「进入工作台」才进现在的工具界面。
// 所以它**不带工作台外壳**（没有顶栏导航、没有底部标签栏），是 `standalone` 路由。
//
// 内容取舍：这一页只回答三个问题——这是什么、能干什么、点哪里进去。
// 结构参考成熟产品的落地页，只留四层：
//   徽标署名 → 主张与入口 → 三条原则 → 模块网格 → 页脚
// 不放轮播、不放动效、不放「AI 赋能」这类词；设计规范要求专业、安静、高信息密度。
//
// 「精简」不等于删信息，而是把解释性长句压成一眼能扫完的短句：
// 模块卡片从「标题 + 标签 + 两行长说明」压成「图标 + 标题 + 一行」，
// 三条原则从三小段压成一行。卡片仍直接跳到对应页面，
// 等于把「再点才是工具界面」这句话做成了可点的入口。
//
// 给探针保留的契约（改版时别动）：
//   .landing-title 文本必须是「审计工作台」；.module-card 恒为 7 个且标题写在
//   .module-head strong 里；.landing-facts li 恒为 3 个。
import { inject } from 'vue'
import { ArrowRight, ChatDotRound, DataAnalysis, Document, Reading, Search, Setting, Tickets } from '@element-plus/icons-vue'
import emblemUrl from '../assets/brand/emblem-128.png'
import { navigate as routerNavigate } from '../lib/router'

// 与 ChatView / TutorialView 保持同一条契约：优先用 App 注入的 navigate
const navigate = inject('navigate', (id) => routerNavigate(id))

const EMBLEM_ALT = '郑州工商学院审计学本科2501班徽标'
const ORG = '郑州工商学院 · 审计学本科2501班'

// 卡片只留一行说明：18 字以内，桌面 4 列与手机单列都能一行读完，不换行堆字
const MODULES = [
  { id: 'analysis', icon: DataAnalysis, title: '数据分析', detail: '本福特、断号、账龄、抽样等 8 项' },
  { id: 'accounting', icon: Tickets, title: '会计基础', detail: '89 个科目、凭证检查、利润、分录' },
  { id: 'documents', icon: Document, title: '底稿文书', detail: '询证函、监盘表、调整汇总表' },
  { id: 'knowledge', icon: Search, title: '法规速查', detail: '准则要点与高频风险点，离线可查' },
  { id: 'chat', icon: ChatDotRound, title: 'AI 问答', detail: '可选，自备接口，不参与计算' },
  { id: 'tutorial', icon: Reading, title: '使用教程', detail: '三步上手 + 10 个可运行用例' },
  { id: 'settings', icon: Setting, title: '设置', detail: '接口与本地工作区，密钥只存本机' }
]

const FACTS = [
  { key: '确定性程序', text: '同数据、同参数，必然同一结果' },
  { key: '证据优先', text: '输出待复核线索，不自动定性' },
  { key: '本地优先', text: '文件在浏览器内处理，不上传' }
]

const deckHref = './deck.html'
const repoHref = 'https://github.com/onespxace/shenji'
</script>

<template>
  <div class="landing">
    <div class="landing-glow landing-glow-a"></div>
    <div class="landing-glow landing-glow-b"></div>

    <div class="landing-inner">
      <header class="landing-hero">
        <div class="landing-brand">
          <span class="landing-emblem"><img :src="emblemUrl" :alt="EMBLEM_ALT" width="60" height="60" /></span>
          <span class="landing-brand-copy">
            <strong>{{ ORG }}</strong>
            <em>AuditDesk · 2.2</em>
          </span>
        </div>

        <h1 class="landing-title">审计工作台</h1>
        <p class="landing-lead">
          七个确定性审计程序、会计基础核对与底稿文书，全部在浏览器里跑，原始数据不上传。
        </p>

        <div class="landing-actions">
          <el-button type="primary" size="large" class="landing-cta" @click="navigate('analysis')">
            进入工作台
            <el-icon><ArrowRight /></el-icon>
          </el-button>
          <a class="landing-link-button" :href="deckHref" target="_blank" rel="noopener"><el-icon><Reading /></el-icon>功能演示</a>
        </div>

        <ul class="landing-facts">
          <li v-for="fact in FACTS" :key="fact.key">
            <strong>{{ fact.key }}</strong>
            <span>{{ fact.text }}</span>
          </li>
        </ul>
      </header>

      <section class="landing-modules" aria-label="功能模块">
        <div class="landing-section-head">
          <h2>选择要进入的模块</h2>
          <p>点任意一块直接进去；进去后点左上角徽标可回到本页。</p>
        </div>
        <div class="module-grid">
          <button v-for="item in MODULES" :key="item.id" type="button" class="module-card" @click="navigate(item.id)">
            <span class="module-icon"><el-icon><component :is="item.icon" /></el-icon></span>
            <span class="module-head"><strong>{{ item.title }}</strong></span>
            <span class="module-detail">{{ item.detail }}</span>
          </button>
        </div>
      </section>

      <footer class="landing-foot">
        <p class="landing-disclaimer">
          本工作台不提供审计意见、税务意见或自动舞弊定性；程序输出是待复核线索，
          是否构成错报需结合业务实质与证据判断。
        </p>
        <div class="landing-foot-meta">
          <span>AuditDesk · 2.2</span>
          <a :href="deckHref" target="_blank" rel="noopener">功能演示</a>
          <a :href="repoHref" target="_blank" rel="noopener">源码仓库</a>
          <span class="landing-foot-note">无需注册 · 数据不上传</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.landing {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, #f8fbff 0%, var(--canvas) 54%, #eff4fb 100%);
}
.landing-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(96px);
  pointer-events: none;
}
.landing-glow-a { top: -180px; right: -110px; width: 440px; height: 440px; background: rgba(47, 111, 228, .13); }
.landing-glow-b { bottom: -220px; left: -150px; width: 480px; height: 480px; background: rgba(14, 139, 131, .10); }

.landing-inner {
  position: relative;
  z-index: 1;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 56px 28px 46px;
}

/* ── 徽标署名 ───────────────────────────────────────────── */
.landing-brand { display: flex; align-items: center; gap: 13px; }
.landing-emblem {
  display: grid;
  width: 60px;
  height: 60px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 6px 20px rgba(44, 71, 117, .16), 0 0 0 1px rgba(47, 111, 228, .16);
  overflow: hidden;
}
.landing-emblem img { display: block; width: 100%; height: 100%; object-fit: cover; }
.landing-brand-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.landing-brand-copy strong { color: var(--ink-700); font-size: 0.875rem; font-weight: 650; }
.landing-brand-copy em { color: var(--ink-400); font-size: 0.75rem; font-style: normal; letter-spacing: .06em; }

/* ── 主张与入口 ─────────────────────────────────────────── */
/* 这里刻意**不给整块限宽**：三条原则要铺满容器才够一行。
   行长由 .landing-lead 自己的 max-width 控制，别加回父级。 */
.landing-hero { max-width: none; }
.landing-title { margin: 24px 0 0; color: var(--ink-950); font-size: clamp(2.25rem, 4vw, 3rem); font-weight: 800; letter-spacing: -.022em; line-height: 1.08; }
.landing-lead { max-width: 44em; margin: 15px 0 0; color: var(--ink-600); font-size: 1.0625rem; line-height: 1.8; }

.landing-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 11px; margin-top: 24px; }
.landing-cta { font-weight: 650; }
.landing-cta .el-icon { margin-left: 6px; }
.landing-link-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 12px 18px;
  border: 1px solid var(--line-strong);
  border-radius: var(--el-border-radius-base, 10px);
  background: rgba(255, 255, 255, .74);
  color: var(--ink-700);
  font-size: 1rem;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease, background .15s ease;
}
.landing-link-button:hover { border-color: var(--blue); color: var(--blue); background: #fff; }

/* 三条原则压成一行：只留判断依据，不留解释性长句 */
.landing-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 30px;
  margin: 26px 0 0;
  padding: 20px 0 0;
  border-top: 1px solid var(--line-soft);
  list-style: none;
}
.landing-facts li { display: flex; align-items: baseline; gap: 8px; }
.landing-facts strong { color: var(--ink-900); font-size: 0.875rem; font-weight: 650; }
.landing-facts strong::before { content: '✓'; margin-right: 7px; color: var(--teal); font-weight: 700; }
.landing-facts span { color: var(--ink-500); font-size: 0.8125rem; }

/* ── 模块网格 ───────────────────────────────────────────── */
/* 7 个模块在 1120px 容器里落成 4 + 3，每列约 272px。
   minmax 不能调太小：小于 250px 会掉到 5 列，每列装不下一行说明。 */
.landing-modules { margin-top: 44px; }
.landing-section-head h2 { margin: 0; color: var(--ink-950); font-size: 1.25rem; font-weight: 750; letter-spacing: -.01em; }
.landing-section-head p { margin: 7px 0 0; color: var(--ink-500); font-size: 0.8125rem; }

.module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(252px, 1fr)); gap: 12px; margin-top: 18px; }
/* 图标与标题同一行、说明独占一行：比「图标 + 两行文字」省一半高度。
   align-items 默认 stretch 让同一行的卡片等高；align-content 把内容压到顶部，
   这样某张卡说明换行时，多出来的高度是底部留白，而不是把文字垂直撑开。 */
.module-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 11px;
  align-items: center;
  align-content: start;
  padding: 15px 16px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: rgba(255, 255, 255, .8);
  box-shadow: var(--shadow-sm);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
}
.module-card:hover { border-color: rgba(47, 111, 228, .45); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.module-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 10px; color: var(--blue); background: var(--blue-soft); font-size: 1.0625rem; }
.module-head { min-width: 0; }
.module-head strong { color: var(--ink-900); font-size: 0.9375rem; font-weight: 700; }
.module-detail { grid-column: 1 / -1; margin-top: 4px; color: var(--ink-500); font-size: 0.8125rem; line-height: 1.6; }

/* ── 页脚 ───────────────────────────────────────────────── */
.landing-foot { margin-top: 44px; padding-top: 20px; border-top: 1px solid var(--line-soft); }
.landing-disclaimer { max-width: 62em; margin: 0; color: var(--ink-500); font-size: 0.8125rem; line-height: 1.75; }
.landing-foot-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 13px; color: var(--ink-400); font-size: 0.8125rem; }
.landing-foot-meta a { color: var(--ink-600); text-decoration: none; }
.landing-foot-meta a:hover { color: var(--blue); text-decoration: underline; }
.landing-foot-note { color: var(--teal); }

@media (max-width: 720px) {
  .landing-inner { padding: 40px 20px 36px; }
  .landing-brand { gap: 11px; }
  .landing-emblem { width: 52px; height: 52px; }
  .landing-title { margin-top: 22px; }
  .landing-lead { font-size: 0.9375rem; }
  .landing-actions { gap: 10px; }
  .landing-link-button { padding: 11px 15px; font-size: 0.9375rem; }
  .landing-facts { gap: 9px 20px; }
  .landing-modules { margin-top: 40px; }
  .module-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
