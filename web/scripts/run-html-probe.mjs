// 跑 web/ 根目录下那三个"只有真实浏览器才能证明"的 HTML 探针页：
//   layout-audit.html  顶栏/导航在 21 个视口下的实测
//   router-audit.html  刷新保留、后退/前进、navigate 兼容
//   lazy-audit.html    首屏零 OCR 重资源、按需加载 chunk、KeepAlive
//
// 为什么不直接 chrome --dump-dom：这些探针要跑好几秒异步步骤，
// --virtual-time-budget 在 iframe + 真实定时器下不可靠（实测直接超时被 kill）。
// 这里用 CDP 打开页面，然后**轮询 #out 文本直到它稳定**，再把结果打印出来。
//
// 用法（先在另一个终端起 preview，并把探针页拷进 dist/）：
//   cd web
//   npm run build
//   node scripts/make-probe-entry.mjs
//   cp layout-audit.html lazy-audit.html router-audit.html dist/
//   npx vite preview --port 4288 --strictPort
//   node scripts/run-html-probe.mjs --url http://localhost:4288/router-audit.html
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const URL_TARGET = getArg('--url', 'http://localhost:4288/router-audit.html')
const SELECTOR = getArg('--selector', '#out')
const DEBUG_PORT = Number(getArg('--port', '9333'))
const MAX_WAIT = Number(getArg('--wait', '45000'))
const STABLE_FOR = Number(getArg('--stable', '5000'))

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`)
      if (res.ok) return true
    } catch { /* not up */ }
    await sleep(200)
  }
  throw new Error(`调试端口 ${port} 未就绪`)
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      let msg
      try { msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString()) } catch { return }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
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
}

async function connect(port) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const list = await fetch(`http://localhost:${port}/json/list`).then((r) => r.json()).catch(() => [])
    const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    if (page) {
      return open(page.webSocketDebuggerUrl)
    }
    await sleep(200)
  }
  throw new Error('没有可连接的页面 target')
}

async function open(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true })
  })
  return new Cdp(ws)
}

/**
 * 直接在目标 URL 上开一个页签，而不是"先连 about:blank 再 Page.navigate"。
 * 后者实测会出现：navigate 返回了 frameId，但 Runtime.evaluate 仍在旧的执行上下文里，
 * 读到的是 about:blank（症状是"探针页明明能打开，却读不到任何输出"）。
 * 连一个已经在目标 URL 上的 target 就没有这个上下文错位问题。
 */
async function openTargetAt(port, url) {
  const res = await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!res.ok) throw new Error(`创建页面失败：HTTP ${res.status}`)
  const target = await res.json()
  return open(target.webSocketDebuggerUrl)
}

async function main() {
  const chrome = CHROME_CANDIDATES.find((c) => { try { return fs.existsSync(c) } catch { return false } })
  if (!chrome) throw new Error('未找到 Chrome / Edge')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditdesk-html-probe-'))
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-dev-shm-usage',
    `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${DEBUG_PORT}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true })

  try {
    await waitForPort(DEBUG_PORT)
    const cdp = await openTargetAt(DEBUG_PORT, URL_TARGET)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    const read = async () => {
      const res = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(SELECTOR)}); return el ? el.innerText : '' })()`,
        returnByValue: true
      })
      return res.result?.value || ''
    }

    let text = ''
    let lastChange = Date.now()
    const deadline = Date.now() + MAX_WAIT
    while (Date.now() < deadline) {
      await sleep(600)
      const next = await read()
      if (next !== text) { text = next; lastChange = Date.now() }
      const done = /通过|失败|FAIL/.test(text) && Date.now() - lastChange > STABLE_FOR
      if (done) break
    }

    const lines = text.split(/\r?\n/).filter(Boolean)
    for (const line of lines) console.log(`  ${line.trim()}`)
    const fails = lines.filter((l) => l.includes('FAIL')).length
    const passes = lines.filter((l) => l.includes('PASS')).length
    if (!lines.length) {
      // 没读到输出时把排查信息一起打出来，别让人只看一句"没读到"
      const diag = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({ href: location.href, ready: document.readyState, bodyLen: document.body ? document.body.innerText.length : -1, sel: !!document.querySelector(${JSON.stringify(SELECTOR)}), title: document.title })`,
        returnByValue: true
      }).catch((e) => ({ result: { value: `诊断失败：${e.message}` } }))
      console.log(`  诊断：${diag.result?.value}`)
    }
    console.log(`\n${URL_TARGET} → PASS ${passes} / FAIL ${fails}${!lines.length ? '（没读到探针输出）' : ''}`)
    if (fails || !lines.length) process.exitCode = 1
  } finally {
    if (child.pid) { try { child.kill() } catch { /* ignore */ } }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

main().catch((error) => { console.error('探针运行失败：', error.message); process.exitCode = 2 })
