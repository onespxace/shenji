// 浏览器行为探针：用真实 Chromium 加载构建产物，逐视图检查"能不能用"。
//
// 为什么需要它：node 断言只能证明纯函数正确，证明不了
//   - 组件挂载时有没有抛异常
//   - 点击、输入之后界面有没有真的变化
//   - 控制台有没有报错
// 交接文档 §5.3 明确写过"不要只读代码就下结论"，这个脚本就是那句话的工具化。
//
// 用法：
//   cd web
//   npm run build
//   npx vite preview --port 4288 --strictPort       # 另开一个终端
//   node scripts/browser-probe.mjs --url http://localhost:4288
//
// 说明：
//   - 只依赖 Node 内置的 fetch / WebSocket（Node 21+），不需要 ws 依赖。
//   - 每个视图导航到一个 hash 路由，等应用挂载后执行断言表达式。
//   - 捕获 Runtime.exceptionThrown / console error / Log.entryAdded(severity=error)。
//   - 退出码非 0 表示有断言失败或有未捕获异常。

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const BASE = getArg('--url', 'http://localhost:4288').replace(/\/$/, '')
const DEBUG_PORT = Number(getArg('--port', '9321'))
const SCENARIO_FILE = getArg('--scenario', path.join(here, 'scenarios', 'auditdesk-smoke.json'))
const KEEP_OPEN = args.includes('--keep')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean)

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try { if (fs.existsSync(candidate)) return candidate } catch { /* ignore */ }
  }
  throw new Error('未找到 Chrome / Edge，可通过 CHROME_PATH 环境变量指定')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 注入到每个步骤里的辅助函数。
// 关键点：Element Plus 的 Tab 会把未激活的页留在 DOM 里（display:none），
// 直接用 querySelector 会命中隐藏页里的同名元素，导致"点了个看不见的按钮"。
// 所有查询都限定在可见元素上。
const PAGE_HELPERS = `
  const __vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0);
  const __text = (sel, text) => __vis(sel).find((e) => (e.textContent || '').includes(text));
  const __clickText = (sel, text) => { const e = __text(sel, text); if (!e) return null; e.click(); return e; };
  const __set = (el, v) => { if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
  const __tab = async (label) => { const t = __text('.el-tabs__item', label); if (!t) return false; t.click(); await new Promise((r) => setTimeout(r, 600)); return true; };
  const __btn = async (label) => { const b = __text('button', label); if (!b) return false; b.click(); await new Promise((r) => setTimeout(r, 700)); return true; };
  const __paneInput = (placeholderFragment) => __vis('.el-tab-pane input, input').find((e) => (e.placeholder || '').includes(placeholderFragment)) || __vis('input').filter((e) => e.offsetParent)[0];
  const __inputByPh = (frag) => __vis('input, textarea').find((e) => (e.placeholder || '').includes(frag));
`

async function waitForDebugPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await sleep(200)
  }
  throw new Error(`调试端口 ${port} 在 ${timeoutMs} ms 内未就绪`)
}

async function listTargets(port) {
  const res = await fetch(`http://localhost:${port}/json/list`)
  return res.json()
}

/** 极简 CDP 客户端：只需要 Page / Runtime / Log 三个域。 */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.handlers = new Map()
    ws.addEventListener('message', (event) => {
      let msg
      try { msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString()) } catch { return }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
        return
      }
      if (msg.method && this.handlers.has(msg.method)) {
        for (const fn of this.handlers.get(msg.method)) fn(msg.params)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(fn)
  }

  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待 ${method} 超时`)), timeoutMs)
      this.on(method, (params) => { clearTimeout(timer); resolve(params) })
    })
  }
}

async function openSocket(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true })
  })
  return new Cdp(ws)
}

/**
 * 直接在目标 URL 上开一个页签，而不是"连上 about:blank 再 Page.navigate"。
 *
 * 为什么必须这样：本机实测「连 about:blank → Page.navigate → Runtime.evaluate」
 * 会**读到 about:blank 的 DOM**——navigate 返回了 frameId，但无 contextId 的
 * evaluate 仍落在旧的执行上下文里。症状极具欺骗性：页面明明能打开，
 * 探针却报"页面没渲染"。直接连一个已经在目标 URL 上的 target 就不会错位。
 */
async function openTargetAt(port, url) {
  const res = await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!res.ok) throw new Error(`创建页面失败：HTTP ${res.status}`)
  const target = await res.json()
  return openSocket(target.webSocketDebuggerUrl)
}

/** 等下载落盘：Chrome 先写 .crdownload，写完才改名 */
async function waitForDownload(dir, prefix, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let files = []
    try { files = fs.readdirSync(dir) } catch { files = [] }
    const done = files.find((name) => name.startsWith(prefix) && !name.endsWith('.crdownload'))
    if (done) {
      const full = path.join(dir, done)
      if (fs.statSync(full).size > 0) return full
    }
    await sleep(250)
  }
  return null
}

async function main() {
  const scenario = JSON.parse(fs.readFileSync(SCENARIO_FILE, 'utf8'))
  const chrome = findChrome()
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditdesk-probe-'))
  // 导出功能必须验"点下去真的下载了一个内容正确的文件"，
  // 只验"按钮存在"等于没验——下载链路（Blob / URL / 文件名 / 编码）都还没被碰过。
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditdesk-downloads-'))

  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true })

  let failed = 0
  let checks = 0
  const consoleErrors = []

  try {
    await waitForDebugPort(DEBUG_PORT)

    for (const view of scenario.views) {
      console.log(`\n=== ${view.name}  (${view.route}) ===`)
      // route 允许写完整 URL：这样同一套探针也能去测 web/ 根目录下的
      // 独立探针页（router-audit.html 等），不必再复制一份引擎
      const target = /^https?:/i.test(view.route) ? view.route : `${BASE}/${view.route}`

      // 每个视图单独开页签：避免"在 about:blank 上 navigate 之后
      // evaluate 仍读到旧上下文"这个坑（详见 openTargetAt 的注释）
      const cdp = await openTargetAt(DEBUG_PORT, target)
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')
      await cdp.send('Log.enable')
      try {
        await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true })
      } catch {
        // 老版本只支持 Page 域的命令
        await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {})
      }
      cdp.on('Runtime.exceptionThrown', (params) => {
        const d = params.exceptionDetails
        const text = d.exception?.description || d.text || '未知异常'
        consoleErrors.push(`[${view.name}] 未捕获异常 @ ${d.url || ''}:${d.lineNumber ?? '?'} — ${String(text).split('\n')[0]}`)
      })
      cdp.on('Log.entryAdded', (params) => {
        const entry = params.entry || {}
        // favicon 的 404 是探针页自己没放图标，与被测应用无关，别当成错误报出来
        if (/favicon/i.test(entry.url || '') || /favicon/i.test(entry.text || '')) return
        if (entry.level === 'error') consoleErrors.push(`[${view.name}] console.error: ${entry.text}`)
      })

      await sleep(scenario.settleMs ?? 2200)

      for (const step of view.steps || []) {
        checks += 1
        let outcome
        try {
          const result = await cdp.send('Runtime.evaluate', {
            expression: `(async () => { ${PAGE_HELPERS}\n${step.run} })()`,
            awaitPromise: true,
            returnByValue: true
          })
          if (result.exceptionDetails) {
            outcome = { ok: false, detail: result.exceptionDetails.exception?.description || result.exceptionDetails.text }
          } else {
            outcome = result.result?.value ?? { ok: false, detail: '表达式没有返回值' }
          }
        } catch (error) {
          outcome = { ok: false, detail: error.message }
        }

        // 下载类步骤：等文件落盘，读回内容再核对
        if (step.download) {
          const file = await waitForDownload(downloadDir, step.expectFilePrefix, step.timeoutMs || 8000)
          if (!file) {
            outcome = { ok: false, detail: `下载目录里没等到以「${step.expectFilePrefix}」开头的文件` }
          } else {
            const raw = fs.readFileSync(file)
            const text = raw.toString('utf8')
            const problems = []
            if (text.charCodeAt(0) !== 0xFEFF) problems.push('缺少 UTF-8 BOM')
            for (const needle of step.expectContains || []) {
              if (!text.includes(needle)) problems.push(`缺少内容「${needle}」`)
            }
            const lines = text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
            if (step.expectLineCount && lines.length !== step.expectLineCount) problems.push(`行数 ${lines.length} ≠ ${step.expectLineCount}`)
            outcome = problems.length
              ? { ok: false, detail: problems.join('；') }
              : { ok: true, detail: `${path.basename(file)} ${raw.length}B / ${lines.length} 行` }
          }
        }

        const ok = outcome && outcome.ok === true
        if (!ok) failed += 1
        console.log(`  ${ok ? 'PASS' : 'FAIL'} ${step.label}${ok ? (outcome.detail ? ` · ${outcome.detail}` : '') : ` · ${outcome?.detail || '未返回 ok'}`}`)
      }
    }
  } finally {
    if (!KEEP_OPEN && child.pid) {
      try { child.kill() } catch { /* ignore */ }
    }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { fs.rmSync(downloadDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }

  console.log('\n=== 控制台错误 ===')
  if (!consoleErrors.length) {
    console.log('  无')
  } else {
    for (const line of [...new Set(consoleErrors)]) console.log(`  ${line}`)
  }

  const uniqueErrors = [...new Set(consoleErrors)]
  console.log(`\n合计 ${checks - failed}/${checks} 项交互断言通过；控制台错误 ${uniqueErrors.length} 类。`)
  if (failed || uniqueErrors.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('探针运行失败：', error.message)
  process.exitCode = 2
})
