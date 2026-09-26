// 轻量 hash 路由。
//
// 为什么不用 vue-router：这里只有 7 条扁平路由，没有路径参数、没有嵌套布局、
// 没有路由守卫、没有异步数据预取。为了这个引入一个运行时依赖并不划算，
// 而且规范明确要求"不要为了架构漂亮增加实际收益很低的工作量"。
// 真正需要导航守卫或嵌套路由时再换也不迟——本文件导出的接口就是按那个
// 演进方向留的（ROUTES 作为唯一事实源，currentView 作为唯一状态入口）。
//
// 为什么用 hash 而不是 history API：GitHub Pages 是纯静态托管，
// 没有服务端 rewrite，history 模式直接刷新会 404。hash 模式零配置可用。
//
// 约定：
//   #/home #/analysis #/accounting #/documents #/knowledge #/chat #/tutorial #/settings
//
// 三条硬要求（对应验收标准）：
//   1. 刷新后保留当前页面 —— 启动时解析 location.hash
//   2. 后退/前进可工作   —— 改 location.hash 会压入 history，监听 hashchange
//   3. 状态不无意义丢失   —— 组件层面的保活由 App.vue 的 KeepAlive 负责

import { readonly, ref } from 'vue'

/**
 * 默认视图 = 落地页。
 *
 * `standalone: true` 的视图**不带工作台外壳**（顶栏 / 底部标签栏 / 页面头），
 * 由 App.vue 直接整屏渲染。落地页进去就是它，点按钮才进工作台。
 * 导航列表会自动过滤掉 standalone 的视图，不需要在别处再维护一份黑名单。
 */
export const DEFAULT_VIEW = 'home'

/**
 * 路由表：全站唯一的视图事实源。
 * label 用于导航与标题，group 用于后续的导航层级分组，
 * meta.crumb / meta.eyebrow / meta.title 供页面头部使用。
 */
export const ROUTES = {
  home: {
    id: 'home',
    label: '首页',
    group: '入口',
    standalone: true,
    meta: { eyebrow: 'Audit workbench', title: '审计工作台' }
  },
  analysis: {
    id: 'analysis',
    label: '数据分析',
    group: '工作台',
    meta: { crumb: '工作台 / 数据分析', eyebrow: 'Audit procedures', title: '数据分析' }
  },
  accounting: {
    id: 'accounting',
    label: '会计基础',
    group: '工作台',
    meta: { crumb: '工作台 / 会计基础', eyebrow: 'Accounting basics', title: '会计基础' }
  },
  documents: {
    id: 'documents',
    label: '底稿文书',
    group: '工作台',
    meta: { crumb: '工作台 / 底稿文书', eyebrow: 'Working papers', title: '底稿文书' }
  },
  knowledge: {
    id: 'knowledge',
    label: '法规速查',
    group: '知识与协作',
    meta: { crumb: '知识与协作 / 法规速查', eyebrow: 'Knowledge base', title: '法规速查' }
  },
  chat: {
    id: 'chat',
    label: 'AI 问答',
    group: '知识与协作',
    meta: { crumb: '知识与协作 / AI 问答', eyebrow: 'Audit copilot', title: 'AI 问答' }
  },
  tutorial: {
    id: 'tutorial',
    label: '使用教程',
    group: '帮助',
    meta: { crumb: '帮助 / 使用教程', eyebrow: 'Guide & cases', title: '使用教程与用例' }
  },
  settings: {
    id: 'settings',
    label: '设置',
    group: '系统',
    meta: { crumb: '系统 / 设置', eyebrow: 'Workspace settings', title: '设置' }
  }
}

export const ROUTE_IDS = Object.keys(ROUTES)

const viewRef = ref(DEFAULT_VIEW)
let started = false

/**
 * 从 hash 解析视图 id。
 * 容忍：#/analysis、#analysis、#/analysis?x=1、空、未知 id。
 * @returns {string|null} 合法 id；不合法返回 null（由调用方决定回落策略）
 */
export function parseHash(raw) {
  const text = String(raw == null ? '' : raw).trim()
  if (!text) return null
  // 去掉前导 # 与可选的 /，再切掉 query / 二次 hash
  const body = text.replace(/^#+/, '').replace(/^\/+/, '')
  const id = body.split(/[?#]/)[0].trim()
  return Object.prototype.hasOwnProperty.call(ROUTES, id) ? id : null
}

/** 视图 id 是否合法 */
export function isValidView(id) {
  return Object.prototype.hasOwnProperty.call(ROUTES, id)
}

/** 唯一的视图状态（只读） */
export const currentView = readonly(viewRef)

/** 当前视图的路由定义，未知时回落到默认路由 */
export function currentRoute() {
  return ROUTES[viewRef.value] || ROUTES[DEFAULT_VIEW]
}

function writeHash(id, replace) {
  const target = `#/${id}`
  if (window.location.hash === target) return
  if (replace) {
    // replaceState 不会触发 hashchange，所以状态必须由调用方同步
    window.history.replaceState(null, '', target)
  } else {
    // 赋值 hash 会压入一条历史记录并触发 hashchange，后退/前进因此可用
    window.location.hash = target
  }
}

/**
 * 切换视图。保持与旧的 provide('navigate') 完全兼容的签名。
 * @param {string} id
 * @param {{replace?: boolean}} [options] replace=true 时不新增历史记录
 * @returns {boolean} 是否切换成功（id 非法时返回 false）
 */
export function navigate(id, options = {}) {
  if (!isValidView(id)) return false
  const changed = viewRef.value !== id
  viewRef.value = id
  writeHash(id, options.replace === true)
  return changed
}

/** 返回上一个视图；无历史时回落到默认视图 */
export function goBack(fallback = DEFAULT_VIEW) {
  if (typeof window.history.length === 'number' && window.history.length > 1) {
    window.history.back()
    return true
  }
  navigate(fallback, { replace: true })
  return false
}

/**
 * 启动路由。只需调用一次。
 * - 刷新后保留当前页面：解析现有 hash
 * - 无 hash 或 hash 非法时归一化到默认视图，且**不**新增历史记录
 *   （否则用户第一次点后退就会离开站点）
 * - 监听 hashchange 覆盖浏览器前进/后退，以及用户手改地址栏
 */
export function startRouter() {
  if (started || typeof window === 'undefined') return currentView.value
  started = true

  const initial = parseHash(window.location.hash)
  if (initial) {
    viewRef.value = initial
  } else {
    writeHash(DEFAULT_VIEW, true)
    viewRef.value = DEFAULT_VIEW
  }

  window.addEventListener('hashchange', () => {
    const id = parseHash(window.location.hash)
    // 非法 hash 不改变状态：避免用户敲错地址就把界面清空
    if (id) viewRef.value = id
  })

  return viewRef.value
}

/** 仅供测试：重置模块级状态 */
export function __resetRouterForTest() {
  started = false
  viewRef.value = DEFAULT_VIEW
}
