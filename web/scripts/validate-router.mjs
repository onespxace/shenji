// 轻量 hash 路由的断言。
//
// 这一层是 Phase 2 的核心：hash 解析、路由表完整性、导航状态机。
// 浏览器行为（后退/前进、刷新保持）由 validate-router-behaviour.mjs
// 在真实浏览器里验证；这里只测纯逻辑，保证边界情况不会退化。
import process from 'node:process'
import { DEFAULT_VIEW, ROUTES, ROUTE_IDS, __resetRouterForTest, currentRoute, currentView, isValidView, navigate, parseHash, startRouter } from '../src/lib/router.js'

const results = []
const check = (name, condition, detail = '') => results.push({ name, passed: Boolean(condition), detail })

// 落地页（standalone）与工作台视图的规则不同：
// 工作台视图有面包屑/eyebrow/页面标题；落地页是独立整屏页，没有页面头，
// 导航列表也会把它排除掉。所以下面凡涉及页面头的断言都只针对工作台视图。
const STANDALONE_IDS = ROUTE_IDS.filter((id) => ROUTES[id].standalone === true)
const WORKSPACE_IDS = ROUTE_IDS.filter((id) => ROUTES[id].standalone !== true)

// ---------------- 路由表 ----------------

check('路由表有 8 条（1 个落地页 + 7 个工作台视图）', ROUTE_IDS.length === 8, String(ROUTE_IDS.length))
check('默认视图合法', isValidView(DEFAULT_VIEW), DEFAULT_VIEW)
check('默认视图就是落地页（「进去就是」由这一条保证）', DEFAULT_VIEW === 'home', DEFAULT_VIEW)
check('默认视图是 standalone', ROUTES[DEFAULT_VIEW].standalone === true, String(ROUTES[DEFAULT_VIEW].standalone))
check('落地页恰好 1 条', STANDALONE_IDS.length === 1, STANDALONE_IDS.join(','))
check('工作台视图都不是 standalone（否则会被踢出导航）', WORKSPACE_IDS.length === 7, String(WORKSPACE_IDS.length))
check('每条路由都有 id/label/group/meta', ROUTE_IDS.every((id) => {
  const r = ROUTES[id]
  return r && r.id === id && typeof r.label === 'string' && r.label
    && typeof r.group === 'string' && r.group
    && r.meta && typeof r.meta.title === 'string' && r.meta.title
    && typeof r.meta.eyebrow === 'string' && r.meta.eyebrow
}), '有路由字段缺失')
check('工作台视图都有 crumb 与 eyebrow', WORKSPACE_IDS.every((id) => typeof ROUTES[id].meta.crumb === 'string' && ROUTES[id].meta.crumb), '有工作台视图缺 crumb')
check('落地页不带 crumb（独立页没有页面头）', STANDALONE_IDS.every((id) => ROUTES[id].meta.crumb === undefined), '落地页不该有 crumb')
check('每条工作台路由的 crumb 以自身 group 开头', WORKSPACE_IDS.every((id) => ROUTES[id].meta.crumb.startsWith(ROUTES[id].group)), WORKSPACE_IDS.map((id) => `${ROUTES[id].group}|${ROUTES[id].meta.crumb}`).join(' '))
check('工作台 crumb 至少两段（体现层级）', WORKSPACE_IDS.every((id) => ROUTES[id].meta.crumb.includes('/')), '有 crumb 不是层级形式')
check('group 恰好等于 crumb 首段（单一事实源）', WORKSPACE_IDS.every((id) => {
  const first = ROUTES[id].meta.crumb.split('/')[0].trim()
  return first === ROUTES[id].group
}), WORKSPACE_IDS.map((id) => `${ROUTES[id].group}!=${ROUTES[id].meta.crumb.split('/')[0].trim()}`).join(' '))
check('一级分组数量克制（4~6 个）', (() => {
  const groups = new Set(WORKSPACE_IDS.map((id) => ROUTES[id].group))
  return groups.size >= 4 && groups.size <= 6
})(), [...new Set(WORKSPACE_IDS.map((id) => ROUTES[id].group))].join(','))
check('id 与 key 一致（避免两份事实源）', ROUTE_IDS.every((id) => ROUTES[id].id === id))
check('label 全部非空且不重复', (() => {
  const labels = ROUTE_IDS.map((id) => ROUTES[id].label)
  return labels.every(Boolean) && new Set(labels).size === labels.length
})(), ROUTE_IDS.map((id) => ROUTES[id].label).join(','))

// ---------------- hash 解析 ----------------

check('解析标准格式 #/analysis', parseHash('#/analysis') === 'analysis')
check('解析无斜杠 #analysis', parseHash('#analysis') === 'analysis')
check('解析带 query #/chat?x=1', parseHash('#/chat?x=1') === 'chat')
check('解析多次 # 号 ##/settings', parseHash('##/settings') === 'settings', String(parseHash('##/settings')))
check('解析前后空白', parseHash('  #/documents  ') === 'documents', String(parseHash('  #/documents  ')))
check('空 hash 返回 null', parseHash('') === null)
check('undefined 返回 null', parseHash(undefined) === null)
check('null 返回 null', parseHash(null) === null)
check('只有 # 返回 null', parseHash('#') === null)
check('只有 #/ 返回 null', parseHash('#/') === null)
check('未知 id 返回 null', parseHash('#/nope') === null)
check('大小写敏感（不静默纠正）', parseHash('#/Analysis') === null, String(parseHash('#/Analysis')))
check('不误判原型属性', parseHash('#/constructor') === null, String(parseHash('#/constructor')))
check('不误判 toString', parseHash('#/toString') === null)
check('不误判 __proto__', parseHash('#/__proto__') === null)
check('解析落地页 #/home', parseHash('#/home') === 'home', String(parseHash('#/home')))
check('全部 8 条都能被解析', ROUTE_IDS.every((id) => parseHash(`#/${id}`) === id))

// ---------------- 合法性 ----------------

check('isValidView 接受合法 id', ROUTE_IDS.every(isValidView))
check('isValidView 拒绝非法 id', !isValidView('nope') && !isValidView('') && !isValidView(null) && !isValidView(undefined))
check('isValidView 拒绝原型属性', !isValidView('constructor') && !isValidView('hasOwnProperty'))

// ---------------- 导航状态机 ----------------
// 这些用例在无 window 的 Node 环境里跑，navigate 内部的 writeHash 会因
// window 未定义而失败，因此只验证「非法 id 不改状态」这类不触碰 DOM 的分支。
__resetRouterForTest()
check('初始为默认视图', currentView.value === DEFAULT_VIEW, currentView.value)
check('currentRoute 返回合法路由', currentRoute().id === DEFAULT_VIEW, currentRoute().id)
check('非法 id 导航被拒绝', navigate('__nope__') === false)
check('非法 id 不会改变状态', currentView.value === DEFAULT_VIEW, currentView.value)
check('原型属性不能被导航', navigate('constructor') === false)
check('拒绝导航后状态仍是默认', currentView.value === DEFAULT_VIEW)
check('currentView 是只读（不暴露 set）', typeof currentView.value === 'string')

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个路由断言通过`)
process.exit(passed === results.length ? 0 : 1)
