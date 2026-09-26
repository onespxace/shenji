<script setup>
// 落地页（首页）。
//
// 定位：进去就是它，点「进入工作台」才进现在的工具界面。
// 所以它**不带工作台外壳**（没有顶栏导航、没有底部标签栏），是 `standalone` 路由。
//
// 内容取舍：这一页只回答三个问题——这是什么、能干什么、点哪里进去。
// 不放轮播、不放动效、不放"AI 赋能"这类词；设计规范要求专业、安静、高信息密度。
// 模块卡片直接跳到对应页面，等于把"再点才是工具界面"这句话做成了可点的入口。
import { inject } from 'vue'
import { ChatDotRound, DataAnalysis, Document, Reading, Search, Setting, Tickets } from '@element-plus/icons-vue'
import { ROUTES, navigate as routerNavigate } from '../lib/router'

// 与 ChatView / TutorialView 保持同一条契约：优先用 App 注入的 navigate
const navigate = inject('navigate', (id) => routerNavigate(id))

const MODULES = [
  {
    id: 'analysis',
    icon: DataAnalysis,
    title: '数据分析',
    lead: '8 个确定性审计程序',
    detail: '本福特定律、重复检查、断号、账龄、分层汇总、审计抽样、凭证筛查、试算平衡。'
  },
  {
    id: 'accounting',
    icon: Tickets,
    title: '会计基础',
    lead: '科目 · 凭证 · 利润 · 分录',
    detail: '89 个常用科目六大类识别、基础问答、凭证形式检查、利润计算（可导出表格）、分录生成。'
  },
  {
    id: 'documents',
    icon: Document,
    title: '底稿文书',
    lead: '4 类常用文书模板',
    detail: '银行询证函、往来款询证函、存货监盘表、审计调整汇总表，填完即可打印。'
  },
  {
    id: 'knowledge',
    icon: Search,
    title: '法规速查',
    lead: '准则与实务要点',
    detail: '审计准则、常见错报与高频风险点，离线检索，不依赖网络。'
  },
  {
    id: 'chat',
    icon: ChatDotRound,
    title: 'AI 问答',
    lead: '可选，需自备接口',
    detail: 'DeepSeek / Gemini / Ollama / 自定义 OpenAI 兼容接口，只用来整理思路，不参与计算。'
  },
  {
    id: 'tutorial',
    icon: Reading,
    title: '使用教程',
    lead: '上手步骤 + 可运行用例',
    detail: '三步快速开始，10 个自带样例数据的用例可一键载入并运行。'
  },
  {
    id: 'settings',
    icon: Setting,
    title: '设置',
    lead: '接口与本地工作区',
    detail: '配置 AI 服务商、测试连接、管理本地工作区。密钥只存在本机浏览器。'
  }
]

const FACTS = [
  {
    key: '确定性程序',
    text: '规则透明、参数可解释。同一份数据、同一组参数，必然得到同一个结果。'
  },
  {
    key: '证据优先',
    text: '程序输出的是待复核线索，不自动变成舞弊或错报结论，也不自动过账。'
  },
  {
    key: '本地优先',
    text: 'CSV 解析、审计程序、凭证 OCR 全在浏览器内完成，原始文件不上传。'
  }
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
        <div class="landing-eyebrow">{{ ROUTES.home.meta.eyebrow }}</div>
        <h1 class="landing-title">审计工作台</h1>
        <p class="landing-lead">
          面向审计学生、内审与审计实务人员的本地工作台。
          七个确定性审计程序、会计基础核对、底稿文书与证据留痕，都在你自己的浏览器里跑。
        </p>

        <div class="landing-actions">
          <el-button type="primary" size="large" class="landing-cta" @click="navigate('analysis')">
            进入工作台
            <el-icon><DataAnalysis /></el-icon>
          </el-button>
          <a class="landing-link-button" :href="deckHref" target="_blank" rel="noopener"><el-icon><Reading /></el-icon>查看功能演示</a>
          <button class="landing-link-button" type="button" @click="navigate('tutorial')"><el-icon><Tickets /></el-icon>上手教程与用例</button>
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
          <p>点任意一块直接进工具界面；进去之后点左上角徽标可以回到这一页。</p>
        </div>
        <div class="module-grid">
          <button v-for="item in MODULES" :key="item.id" type="button" class="module-card" @click="navigate(item.id)">
            <span class="module-icon"><el-icon><component :is="item.icon" /></el-icon></span>
            <span class="module-copy">
              <span class="module-head"><strong>{{ item.title }}</strong><em>{{ item.lead }}</em></span>
              <span class="module-detail">{{ item.detail }}</span>
            </span>
          </button>
        </div>
      </section>

      <footer class="landing-foot">
        <p class="landing-disclaimer">
          本工作台不提供审计意见、税务意见、自动舞弊定性或自动过账。程序结果是待复核线索，
          是否错报要结合业务实质与证据判断。
        </p>
        <div class="landing-foot-meta">
          <span>AuditDesk · 2.2</span>
          <a :href="deckHref" target="_blank" rel="noopener">功能演示 PPT</a>
          <a :href="repoHref" target="_blank" rel="noopener">源码仓库</a>
          <span class="landing-foot-note">无需注册，数据不上传</span>
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
  background: linear-gradient(180deg, #f7faff 0%, var(--canvas) 46%, #eef3fb 100%);
}
.landing-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
}
.landing-glow-a { top: -160px; right: -80px; width: 460px; height: 460px; background: rgba(47, 111, 228, .16); }
.landing-glow-b { bottom: -200px; left: -120px; width: 520px; height: 520px; background: rgba(14, 139, 131, .13); }

.landing-inner {
  position: relative;
  z-index: 1;
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 84px 28px 56px;
}

.landing-hero { max-width: 820px; }
.landing-eyebrow { color: var(--blue); font-size: var(--fs-micro, 0.75rem); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.landing-title { margin: 12px 0 0; color: var(--ink-950); font-size: 3.25rem; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
.landing-lead { max-width: 44em; margin: 18px 0 0; color: var(--ink-600); font-size: 1.125rem; line-height: 1.85; }

.landing-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 30px; }
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

.landing-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; margin: 44px 0 0; padding: 0; list-style: none; }
.landing-facts li { padding-left: 14px; border-left: 2px solid rgba(47, 111, 228, .28); }
.landing-facts strong { display: block; color: var(--ink-900); font-size: 0.9375rem; }
.landing-facts span { display: block; margin-top: 6px; color: var(--ink-500); font-size: 0.875rem; line-height: 1.7; }

.landing-modules { margin-top: 64px; }
.landing-section-head h2 { margin: 0; color: var(--ink-950); font-size: 1.375rem; font-weight: 750; }
.landing-section-head p { margin: 8px 0 0; color: var(--ink-500); font-size: 0.875rem; }

.module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; margin-top: 20px; }
.module-card {
  display: flex;
  gap: 13px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, .78);
  box-shadow: var(--shadow-sm);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
}
.module-card:hover { border-color: rgba(47, 111, 228, .45); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.module-icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 11px; color: var(--blue); background: var(--blue-soft); font-size: 1.125rem; }
.module-copy { min-width: 0; }
.module-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.module-head strong { color: var(--ink-900); font-size: 0.9375rem; font-weight: 700; }
.module-head em { color: var(--ink-400); font-size: 0.75rem; font-style: normal; }
.module-detail { display: block; margin-top: 6px; color: var(--ink-500); font-size: 0.8125rem; line-height: 1.65; }

.landing-foot { margin-top: 60px; padding-top: 22px; border-top: 1px solid var(--line-soft); }
.landing-disclaimer { max-width: 60em; margin: 0; color: var(--ink-500); font-size: 0.8125rem; line-height: 1.75; }
.landing-foot-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 14px; color: var(--ink-400); font-size: 0.8125rem; }
.landing-foot-meta a { color: var(--ink-600); text-decoration: none; }
.landing-foot-meta a:hover { color: var(--blue); text-decoration: underline; }
.landing-foot-note { color: var(--teal); }

@media (max-width: 720px) {
  .landing-inner { padding: 48px 20px 40px; }
  .landing-title { font-size: 2.25rem; }
  .landing-lead { font-size: 1rem; }
  .landing-actions { gap: 10px; }
  .landing-link-button { padding: 11px 15px; font-size: 0.9375rem; }
  .landing-modules { margin-top: 44px; }
  .module-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
