<script setup>
import { computed, inject, ref } from 'vue'
import {
  Aim,
  ArrowRight,
  ChatDotRound,
  Collection,
  Document,
  EditPen,
  MagicStick,
  Promotion,
  Reading,
  Search,
  Setting,
  Tickets,
  TrendCharts,
  Upload,
  WarningFilled
} from '@element-plus/icons-vue'
import { SHOWCASE_CASES, runAllShowcaseCases } from '../lib/showcase'

const navigate = inject('navigate', () => {})
const activeTab = ref('start')
const filter = ref('all')

const kindLabel = { tool: '审计程序', knowledge: '会计与凭证' }
const results = computed(() => runAllShowcaseCases())
const resultMap = computed(() => Object.fromEntries(results.value.map((r) => [r.id, r])))
const filteredCases = computed(() =>
  SHOWCASE_CASES.filter((item) => filter.value === 'all' || item.kind === filter.value)
)
const toolCount = computed(() => SHOWCASE_CASES.filter((c) => c.kind === 'tool').length)
const knowledgeCount = computed(() => SHOWCASE_CASES.filter((c) => c.kind === 'knowledge').length)
const allPassed = computed(() => results.value.every((r) => r.passed))

const steps = [
  {
    icon: Upload,
    title: '第一步 · 导入台账',
    body: '在「数据分析」页点击选择文件，或直接把 CSV / TSV 拖到虚线框里。系统会自动识别 UTF-8 与 GBK 编码。',
    tips: ['没有数据？点「载入示例台账」先体验', '列名会被自动匹配到各程序所需字段']
  },
  {
    icon: MagicStick,
    title: '第二步 · 选程序并运行',
    body: '左侧选择 8 个确定性程序之一，确认字段映射与阈值后点「执行分析」。结果可下载为 CSV。',
    tips: ['每个程序只做确定的事，规则透明可复现', '抽样会记录随机种子，同一种子结果可复现']
  },
  {
    icon: Document,
    title: '第三步 · 留存底稿',
    body: '在「底稿文书」生成询证函、监盘表、调整汇总表；把需要跟进的项目登记为待复核线索。',
    tips: ['异常只是线索，不等于错报，更不等于舞弊', '复核状态与证据来源要留痕']
  },
  {
    icon: Tickets,
    title: '第四步 · 会计与凭证核对',
    body: '「会计基础」页可按名称或代码识别六大科目分类，并速答六要素、三大报表、税率与利润公式。凭证页可上传图片做本地 OCR 形式检查。',
    tips: [
      '科目六大类 ≠ 会计六要素，注意区分',
      '先看画质评分：低于 78 分说明这张图不值得识别，直接重拍',
      '「逐字段识别」会先用 PaddleOCR 定位每个字段的位置，再单独识别，逐项给可靠度',
      '首次用 Paddle 需下载约 20.6MB 模型，之后走浏览器缓存；图片始终留在本机',
      '签名单独一栏：只判断"是否存在/是否异常"，OCR 读出的文字不构成身份证明',
      'OCR 结果必须人工校对后再采信'
    ]
  },
  {
    icon: ChatDotRound,
    title: '第五步 · 用 AI 整理思路',
    body: '在「AI 问答」配置 DeepSeek / Gemini / Ollama 或自定义接口，把准则条文、程序清单、底稿提纲交给模型整理。',
    tips: ['AI 输出仅作辅助，不构成审计结论', 'API Key 只存在本机浏览器，不写入仓库']
  },
  {
    icon: TrendCharts,
    title: '补充 · 利润计算与分录生成',
    body: '「会计基础」页的「利润计算」标签：只填主营业务收入/成本/税金、期间费用、投资损益、营业外收支和所得税税率，六步利润自动推出来；下方还能校验会计恒等式。',
    tips: [
      '留空的项不参与计算，依赖它的结果标为「待补」而不是按 0 处理',
      '计算口径按你给的《利润的内容》图：投资净收益在利润总额层级加总，不进营业利润',
      '两条恒等式不能同时成立，除非收入恰好等于费用'
    ]
  },
  {
    icon: EditPen,
    title: '补充 · 分录生成器',
    body: '「会计基础」页的「分录生成」标签覆盖 16 大类 40+ 项常用业务。说出业务（如「收到股东投资款」）即出借贷分录，填金额后按复式记账法自动配平。',
    tips: [
      '借贷科目全部取自本页的 89 个常用科目表，断言保证不会出现表外科目',
      '原图大量是"备查式"写法，同组只能选一行，多选会被拦下并提示',
      '配不平时明确报错，不静默塞一个假数字'
    ]
  }
]

const faqs = [
  {
    q: '数据会上传到服务器吗？',
    a: '不会。CSV 解析、8 个审计程序、凭证 OCR 全部在浏览器内完成，原始文件不离开你的设备。AI 对话只有在你主动发送时才会把该条问题发给你自己配置的接口。'
  },
  {
    q: '为什么异常不等于错报？',
    a: '本工具做的是确定性筛查，输出的是「待复核线索」。是否构成错报要结合业务实质、合同证据和询问程序判断；是否存在舞弊需要另行评估，不能由统计结果直接推出。'
  },
  {
    q: 'AI 问答能替代准则原文吗？',
    a: '不能。模型可能记错条款编号，页面已明确要求以正式准则为准。它的合理用途是解释概念、整理程序清单、生成底稿提纲。'
  },
  {
    q: '手机上能用吗？',
    a: '可以。窄屏下会自动切换为底部标签栏，会话列表改为抽屉，宽表格在容器内横向滚动。OCR 首次识别需要下载约 17MB 的本地模型。'
  },
  {
    q: '结果能复现吗？',
    a: '能。同一份数据与参数必然得到同一结果；审计抽样记录随机种子，可完整复现当次抽取。仓库内置 575 条自动化断言，每次提交都会跑。'
  },
  {
    q: '凭证识别准确率到底多少？',
    a: '在 4 张带标准答案的测试图上（扫描件 / 倾斜 / 低对比度 / 手机翻拍）字段命中率是 80%：前三张 90%，翻拍图只有 50%。真实凭证有手写和印章遮挡，只会更差。'
  },
  {
    q: '为什么不给"更高准确率"？',
    a: '试过了，都没用：换更准的模型持平，加图像前处理反而从 80% 掉到 52%，改版面模式差 30 个点，分区二次识别零收益。所以改成告诉你哪里错——逐字段标出识别置信度，低于 78% 的字段会降级为待核对，关键字段不可靠时不允许给出"形式完整"。详见 docs/OCR_QUALITY.md。'
  },
  {
    q: '支持哪些文件格式？',
    a: '网页版支持 CSV / TSV / TXT。Excel 请先另存为「CSV UTF-8」。桌面版另支持 XLSX 与 PDF。'
  }
]

function runCase(item) {
  if (item.kind === 'tool') {
    navigate('analysis')
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auditdesk:run-showcase', {
        detail: { csv: item.csv, tool: item.tool, params: item.params, title: item.title }
      }))
    }, 120)
  } else {
    navigate('accounting')
  }
}

function gotoCases() {
  activeTab.value = 'cases'
}
</script>

<template>
  <div class="tutorial-view">
    <el-alert class="mb-16" type="info" :closable="false" show-icon title="这一页既是上手教程，也是可运行的功能演示">
      <template #default>
        「用例演示」里的每一条都自带样例数据，点「载入并运行」会直接把数据带进对应页面并执行；
        预期结果由自动化断言校验，文档与实际行为不会脱节。
        <el-button text type="primary" @click="gotoCases">直接看用例</el-button>
      </template>
    </el-alert>

    <el-card class="surface" shadow="never">
      <el-tabs v-model="activeTab" class="tutorial-tabs">
        <!-- 快速上手 -->
        <el-tab-pane name="start">
          <template #label><span class="tab-label"><el-icon><Reading /></el-icon>快速上手</span></template>

          <div class="steps">
            <div v-for="(step, index) in steps" :key="step.title" class="step-card">
              <div class="step-head">
                <span class="step-icon"><el-icon><component :is="step.icon" /></el-icon></span>
                <div>
                  <h3>{{ step.title }}</h3>
                  <p>{{ step.body }}</p>
                </div>
              </div>
              <ul class="step-tips">
                <li v-for="tip in step.tips" :key="tip">{{ tip }}</li>
              </ul>
              <span v-if="index < steps.length - 1" class="step-arrow"><el-icon><ArrowRight /></el-icon></span>
            </div>
          </div>

          <div class="boundary">
            <div class="boundary-title"><el-icon><WarningFilled /></el-icon>专业边界</div>
            <p>本工具不提供审计意见、税务意见，不自动定性舞弊，不自动过账。异常结果是需要跟进的线索，不是结论。</p>
          </div>
        </el-tab-pane>

        <!-- 用例演示 -->
        <el-tab-pane name="cases">
          <template #label><span class="tab-label"><el-icon><Aim /></el-icon>用例演示</span></template>

          <div class="cases-bar">
            <div class="cases-filters">
              <el-radio-group v-model="filter" size="small">
                <el-radio-button label="all">全部 {{ SHOWCASE_CASES.length }}</el-radio-button>
                <el-radio-button label="tool">审计程序 {{ toolCount }}</el-radio-button>
                <el-radio-button label="knowledge">会计与凭证 {{ knowledgeCount }}</el-radio-button>
              </el-radio-group>
            </div>
            <el-tag :type="allPassed ? 'success' : 'danger'" effect="light" size="small">
              自检 {{ results.filter((r) => r.passed).length }}/{{ results.length }} 通过
            </el-tag>
          </div>

          <div class="case-list">
            <article v-for="item in filteredCases" :key="item.id" class="case-card">
              <header class="case-head">
                <div class="case-head-main">
                  <el-tag size="small" effect="plain" :type="item.kind === 'tool' ? 'primary' : 'success'">
                    {{ kindLabel[item.kind] }}
                  </el-tag>
                  <h3>{{ item.title }}</h3>
                </div>
                <el-tag size="small" :type="item.risk.startsWith('高') ? 'danger' : item.risk.startsWith('中') ? 'warning' : 'info'" effect="light">
                  {{ item.risk }}
                </el-tag>
              </header>

              <dl class="case-meta">
                <div><dt>场景</dt><dd>{{ item.scene }}</dd></div>
                <div><dt>审计目标</dt><dd>{{ item.objective }}</dd></div>
                <div><dt>准则依据</dt><dd>{{ item.standard }}</dd></div>
              </dl>

              <div v-if="item.steps?.length" class="case-steps">
                <span v-for="(s, i) in item.steps" :key="i" class="case-step-chip">{{ s.label }}「{{ s.value }}」</span>
              </div>
              <pre v-else-if="item.text" class="case-text">{{ item.text.split('\n').slice(0, 4).join('\n') }}…</pre>

              <div class="case-result" :class="resultMap[item.id]?.passed ? 'is-pass' : 'is-fail'">
                <el-icon><component :is="resultMap[item.id]?.passed ? 'CircleCheckFilled' : 'WarningFilled'" /></el-icon>
                <span>{{ resultMap[item.id]?.detail }}</span>
              </div>

              <footer class="case-foot">
                <span class="case-foot-hint">
                  {{ item.kind === 'tool' ? '将载入样例数据并自动执行该程序' : '将在「会计基础」页验证' }}
                </span>
                <el-button type="primary" size="small" plain @click="runCase(item)">
                  <el-icon><Promotion /></el-icon>载入并运行
                </el-button>
              </footer>
            </article>
          </div>
        </el-tab-pane>

        <!-- 功能导览 -->
        <el-tab-pane name="tour">
          <template #label><span class="tab-label"><el-icon><Collection /></el-icon>功能导览</span></template>

          <div class="tour-grid">
            <button v-for="view in [
              { id: 'analysis', icon: MagicStick, name: '数据分析', desc: '8 个确定性审计程序：导入 CSV 后即可运行，结果可下载留痕。' },
              { id: 'accounting', icon: Tickets, name: '会计基础', desc: '89 个常用科目六大类识别、基础问答、凭证图片本地 OCR 检查。' },
              { id: 'documents', icon: Document, name: '底稿文书', desc: '询证函、监盘表、调整汇总表，支持动态行与打印版式。' },
              { id: 'knowledge', icon: Search, name: '法规速查', desc: '审计准则与高频错报程序要点，离线全文检索。' },
              { id: 'chat', icon: ChatDotRound, name: 'AI 问答', desc: '四大服务商接入，Markdown 渲染，按审计助手系统提示作答。' },
              { id: 'settings', icon: Setting, name: '设置', desc: 'API Key、模型、Ollama 分档推荐与连接测试。' }
            ]" :key="view.id" type="button" class="tour-card" @click="navigate(view.id)">
              <span class="tour-icon"><el-icon><component :is="view.icon" /></el-icon></span>
              <strong>{{ view.name }}</strong>
              <em>{{ view.desc }}</em>
            </button>
          </div>
        </el-tab-pane>

        <!-- 常见问题 -->
        <el-tab-pane name="faq">
          <template #label><span class="tab-label"><el-icon><WarningFilled /></el-icon>常见问题</span></template>

          <div class="faq-list">
            <el-collapse>
              <el-collapse-item v-for="item in faqs" :key="item.q" :title="item.q">
                <p>{{ item.a }}</p>
              </el-collapse-item>
            </el-collapse>
          </div>

          <div class="deck-entry">
            <div>
              <strong>想快速给别人介绍这个项目？</strong>
              <p>打开网页式功能介绍 PPT，14 页覆盖定位、功能、技术规范与质量保障，支持键盘翻页与全屏演示。</p>
            </div>
            <el-button type="primary" tag="a" href="./deck.html" target="_blank" rel="noopener">
              <el-icon><Promotion /></el-icon>打开功能 PPT
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.mb-16 { margin-bottom: 16px; }
.tutorial-tabs :deep(.el-tabs__header) { margin: -4px 0 20px; }
.tutorial-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background: var(--line-soft); }
.tab-label { display: inline-flex; align-items: center; gap: 6px; }

/* 快速上手 */
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(268px, 1fr)); gap: 14px; }
.step-card { position: relative; padding: 16px 17px; border: 1px solid var(--glass-border); border-radius: 14px; background: rgba(255, 255, 255, .58); }
.step-head { display: flex; gap: 11px; }
.step-icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 12px; color: var(--blue); background: var(--blue-soft); font-size: 1.1875rem; }
.step-card h3 { margin: 2px 0 5px; color: var(--ink-900); font-size: var(--fs-title); }
.step-card p { margin: 0; color: var(--ink-600); font-size: var(--fs-body); line-height: 1.6; }
.step-tips { margin: 11px 0 0; padding-left: 17px; color: var(--ink-500); font-size: var(--fs-caption); line-height: 1.65; }
.step-tips li + li { margin-top: 3px; }
.step-arrow { position: absolute; right: 12px; bottom: 12px; color: var(--line-strong); font-size: 1rem; }
.boundary { margin-top: 18px; padding: 13px 15px; border: 1px solid rgba(183, 107, 18, .2); border-radius: 13px; background: var(--amber-soft); }
.boundary-title { display: flex; align-items: center; gap: 6px; color: var(--amber); font-size: var(--fs-body); font-weight: 700; }
.boundary p { margin: 6px 0 0; color: var(--ink-600); font-size: var(--fs-body); line-height: 1.65; }

/* 用例 */
.cases-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.case-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; }
.case-card { display: flex; flex-direction: column; padding: 16px 17px; border: 1px solid var(--glass-border); border-radius: 14px; background: rgba(255, 255, 255, .6); }
.case-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.case-head-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.case-card h3 { margin: 0; color: var(--ink-900); font-size: var(--fs-lead); font-weight: 700; }
.case-meta { margin: 11px 0 0; }
.case-meta > div { display: flex; gap: 8px; margin-bottom: 5px; }
.case-meta dt { flex: 0 0 auto; width: 4.5em; color: var(--ink-400); font-size: var(--fs-caption); }
.case-meta dd { margin: 0; color: var(--ink-600); font-size: var(--fs-caption); line-height: 1.6; }
.case-steps { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.case-step-chip { padding: 4px 8px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink-600); background: rgba(255, 255, 255, .6); font-size: var(--fs-micro); }
.case-text { max-height: 96px; margin: 10px 0 0; padding: 9px 11px; overflow: hidden; border-radius: 9px; color: var(--ink-600); background: rgba(245, 248, 252, .8); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: var(--fs-micro); line-height: 1.6; white-space: pre-wrap; }
.case-result { display: flex; align-items: flex-start; gap: 7px; margin-top: 11px; padding: 9px 11px; border-radius: 9px; font-size: var(--fs-caption); line-height: 1.6; }
.case-result .el-icon { flex: 0 0 auto; margin-top: 1px; }
.case-result.is-pass { color: var(--teal); background: var(--teal-soft); }
.case-result.is-fail { color: var(--red); background: var(--red-soft); }
.case-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 12px; }
.case-foot-hint { color: var(--ink-400); font-size: var(--fs-micro); }

/* 功能导览 */
.tour-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(232px, 1fr)); gap: 12px; }
.tour-card { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 15px 16px; border: 1px solid var(--glass-border); border-radius: 13px; background: rgba(255, 255, 255, .58); text-align: left; transition: all .18s ease; }
.tour-card:hover { border-color: rgba(47, 111, 228, .26); background: var(--blue-soft); transform: translateY(-1px); }
.tour-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 11px; color: var(--blue); background: var(--blue-soft); font-size: 1.125rem; }
.tour-card:hover .tour-icon { background: rgba(255, 255, 255, .8); }
.tour-card strong { color: var(--ink-900); font-size: var(--fs-lead); }
.tour-card em { color: var(--ink-500); font-size: var(--fs-caption); font-style: normal; line-height: 1.6; }

/* FAQ */
.faq-list :deep(.el-collapse-item__header) { font-size: var(--fs-body); font-weight: 600; line-height: 1.5; }
.faq-list p { margin: 0; color: var(--ink-600); font-size: var(--fs-body); line-height: 1.7; }
.deck-entry { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 18px; padding: 15px 17px; border: 1px solid rgba(47, 111, 228, .18); border-radius: 14px; background: linear-gradient(135deg, rgba(238, 245, 255, .85), rgba(255, 255, 255, .5)); flex-wrap: wrap; }
.deck-entry strong { color: var(--ink-900); font-size: var(--fs-lead); }
.deck-entry p { margin: 4px 0 0; color: var(--ink-500); font-size: var(--fs-caption); line-height: 1.6; }

@media (max-width: 700px) {
  .case-list { grid-template-columns: 1fr; }
  .case-meta dt { width: 4.5em; }
  .case-foot { flex-direction: column; align-items: stretch; }
  .case-foot .el-button { width: 100%; }
}
</style>
