// 功能介绍 PPT 的结构断言：防止空标题、缺页说明、列数不齐等低级错误。
import process from 'node:process'
import { DECK_META, DECK_HINTS, SLIDES } from '../src/deck/slides.js'
import { slideBodyHtml, slideHeaderHtml, slideInnerHtml } from '../src/deck/render.js'

const results = []
const check = (name, condition, detail = '') => results.push({ name, passed: Boolean(condition), detail })

check('幻灯片数量充足', SLIDES.length >= 12, String(SLIDES.length))
check('幻灯片 id 唯一', new Set(SLIDES.map((s) => s.id)).size === SLIDES.length)
check('元信息完整', DECK_META.title && DECK_META.subtitle && DECK_META.version, JSON.stringify(DECK_META))

const knownKinds = new Set(['cover', 'bullets', 'cards', 'modules', 'table', 'split', 'metrics', 'closing'])
for (const slide of SLIDES) {
  const tag = `${slide.id}`
  check(`${tag} · 版式受支持`, knownKinds.has(slide.kind), slide.kind)
  check(`${tag} · 有标题`, String(slide.title || '').trim().length > 0, slide.title)
  check(`${tag} · 有导语`, String(slide.lead || slide.subtitle || '').trim().length > 0)

  if (slide.kind === 'bullets') {
    check(`${tag} · 要点非空`, Array.isArray(slide.bullets) && slide.bullets.length >= 3, String(slide.bullets?.length))
    check(`${tag} · 要点有标题与说明`, (slide.bullets || []).every((b) => b.head && b.text))
  }
  if (slide.kind === 'cards') {
    check(`${tag} · 卡片非空`, Array.isArray(slide.cards) && slide.cards.length >= 3, String(slide.cards?.length))
    check(`${tag} · 卡片有标题与说明`, (slide.cards || []).every((c) => c.title && c.text))
  }
  if (slide.kind === 'modules') {
    check(`${tag} · 模块非空`, Array.isArray(slide.modules) && slide.modules.length >= 4, String(slide.modules?.length))
  }
  if (slide.kind === 'table') {
    check(`${tag} · 表头存在`, Array.isArray(slide.columns) && slide.columns.length >= 2)
    const bad = (slide.rows || []).filter((r) => r.length !== slide.columns.length)
    check(`${tag} · 行列一致`, bad.length === 0, `不一致行数 ${bad.length}`)
    check(`${tag} · 至少 3 行数据`, (slide.rows || []).length >= 3, String(slide.rows?.length))
  }
  if (slide.kind === 'split') {
    check(`${tag} · 左右两栏齐备`, Boolean(slide.left?.title && slide.right?.title))
    check(`${tag} · 左右均有条目`, (slide.left?.items || []).length >= 3 && (slide.right?.items || []).length >= 3)
  }
  if (slide.kind === 'metrics') {
    check(`${tag} · 指标非空`, Array.isArray(slide.metrics) && slide.metrics.length >= 3, String(slide.metrics?.length))
    check(`${tag} · 指标有值与标签`, (slide.metrics || []).every((m) => m.value && m.label))
  }
  if (slide.kind === 'closing') {
    check(`${tag} · 有收尾要点`, (slide.points || []).length >= 2, String(slide.points?.length))
    check(`${tag} · 有署名`, String(slide.footer || '').length > 0)
  }
}


/* ---- 渲染层断言 ----
   教训：数据层有标题、渲染层却没输出，14 页里 13 页没有标题。
   因此这里直接对渲染函数的结果做断言，而不是只检查数据字段。 */
const SELF_HEADED = new Set(['cover', 'closing'])
for (const slide of SLIDES) {
  const tag = `[渲染] ${slide.id}`
  const header = slideHeaderHtml(slide)
  const body = slideBodyHtml(slide, 'emblem.png')
  const full = slideInnerHtml(slide, 'emblem.png')

  if (SELF_HEADED.has(slide.kind)) {
    check(`${tag} · 自带页眉`, body.includes('slide-title'), '封面/结语应在 body 内输出标题')
  } else {
    check(`${tag} · 页眉已输出`, header.includes('slide-title'), '通用页眉必须含 .slide-title')
    check(`${tag} · 导语已输出`, header.includes('slide-lead'), '通用页眉必须含 .slide-lead')
    check(`${tag} · 眉标已输出`, header.includes('slide-eyebrow'), '通用页眉必须含 .slide-eyebrow')
    check(`${tag} · 正文有容器`, full.includes('slide-body'), '正文必须包在 .slide-body 内')
  }
  check(`${tag} · 正文非空`, body.trim().length > 0, '正文不应为空')
  check(`${tag} · 整页非空`, full.trim().length > 0)
  check(`${tag} · 无未转义占位`, !/undefined|\[object Object\]|NaN/.test(full), '输出里出现了 undefined/NaN')
}
check('全部页数与渲染结果一致', SLIDES.every((s) => slideInnerHtml(s, 'e.png').length > 0))

check('快捷键提示非空', DECK_HINTS.length >= 4, String(DECK_HINTS.length))
check('快捷键提示完整', DECK_HINTS.every((h) => h.keys && h.text))

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个 PPT 结构断言通过（共 ${SLIDES.length} 页）`)
process.exit(passed === results.length ? 0 : 1)

