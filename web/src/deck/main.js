// 功能介绍 PPT 的交互外壳。
// 页面构建逻辑全部来自 render.js（纯函数，可在 Node 中断言），这里只负责翻页与缩放。
import './deck.css'
import emblemUrl from '../assets/brand/emblem-128.png'
import { DECK_HINTS, DECK_META, SLIDES } from './slides.js'
import { slideInnerHtml } from './render.js'

const root = document.getElementById('deck')
let index = 0
let overviewOpen = false
let hintsTimer = 0

const escapeHtml = (value) => String(value ?? '')
  .replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

function render() {
  root.innerHTML = `
    <div class="deck-stage" id="stage">
      <div class="deck-ambient a"></div>
      <div class="deck-ambient b"></div>
      <div class="slides">
        ${SLIDES.map((slide, i) => `
          <section class="slide slide-${escapeHtml(slide.kind)}" data-i="${i}" aria-hidden="${i !== index}">
            ${slideInnerHtml(slide, emblemUrl)}
          </section>`).join('')}
      </div>
      <div class="deck-hints" id="hints">
        ${DECK_HINTS.map((h) => `<span class="deck-hint"><b>${escapeHtml(h.keys)}</b> ${escapeHtml(h.text)}</span>`).join('')}
      </div>
      <nav class="deck-bar">
        <button class="deck-btn" id="prev" ${index === 0 ? 'disabled' : ''} aria-label="上一页">←<span>上一页</span></button>
        <div class="deck-progress"><span style="width:${((index + 1) / SLIDES.length) * 100}%"></span></div>
        <span class="deck-counter">${index + 1} / ${SLIDES.length}</span>
        <button class="deck-btn" id="next" ${index === SLIDES.length - 1 ? 'disabled' : ''} aria-label="下一页"><span>下一页</span>→</button>
        <button class="deck-btn" id="grid" aria-label="总览">▦<span>总览</span></button>
        <button class="deck-btn" id="full" aria-label="全屏">⛶<span>全屏</span></button>
      </nav>
    </div>
    <div class="deck-overview" id="overview">
      <div class="overview-head">
        <h2>${escapeHtml(DECK_META.title)} · 功能介绍</h2>
        <span>${SLIDES.length} 页 · ${escapeHtml(DECK_META.version)} · 点击任意页跳转</span>
      </div>
      <div class="overview-grid">
        ${SLIDES.map((s, i) => `
          <button class="overview-item ${i === index ? 'is-current' : ''}" data-goto="${i}">
            <span class="overview-num">${String(i + 1).padStart(2, '0')}</span>
            <strong>${escapeHtml(s.title)}</strong>
            <em>${escapeHtml(s.lead || s.subtitle || s.eyebrow || '')}</em>
          </button>`).join('')}
      </div>
    </div>`

  document.getElementById('stage').querySelectorAll('.slide').forEach((el) => {
    const i = Number(el.dataset.i)
    el.classList.toggle('is-active', i === index)
    el.classList.toggle('is-prev', i < index)
  })

  document.getElementById('prev').addEventListener('click', () => go(index - 1))
  document.getElementById('next').addEventListener('click', () => go(index + 1))
  document.getElementById('grid').addEventListener('click', () => toggleOverview())
  document.getElementById('full').addEventListener('click', toggleFullscreen)
  root.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      go(Number(btn.dataset.goto))
      toggleOverview(false)
    })
  })
  fit()
  if (location.hash !== `#${index + 1}`) history.replaceState(null, '', `#${index + 1}`)
}

function go(next) {
  const clamped = Math.max(0, Math.min(SLIDES.length - 1, next))
  if (clamped === index) return
  index = clamped
  render()
}

function toggleOverview(force) {
  overviewOpen = typeof force === 'boolean' ? force : !overviewOpen
  document.getElementById('overview')?.classList.toggle('is-open', overviewOpen)
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.().catch(() => {})
}

// 按 16:9 等比缩放舞台，任何窗口尺寸下排版都一致
function fit() {
  const stage = document.getElementById('stage')
  if (!stage) return
  const pad = window.innerWidth < 700 ? 0 : 24
  const scale = Math.min((window.innerWidth - pad * 2) / 1280, (window.innerHeight - pad * 2) / 720)
  stage.style.transform = 'translate(-50%, -50%) scale(' + Math.max(scale, 0.2) + ')'
}

function showHints() {
  const el = document.getElementById('hints')
  if (!el) return
  el.classList.add('is-visible')
  clearTimeout(hintsTimer)
  hintsTimer = setTimeout(() => el.classList.remove('is-visible'), 2600)
}

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key
  if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Enter') { event.preventDefault(); go(index + 1) }
  else if (key === 'ArrowLeft' || key === 'PageUp' || key === 'Backspace') { event.preventDefault(); go(index - 1) }
  else if (key === 'Home') { event.preventDefault(); go(0) }
  else if (key === 'End') { event.preventDefault(); go(SLIDES.length - 1) }
  else if (key === 'o' || key === 'O') { event.preventDefault(); toggleOverview() }
  else if (key === 'f' || key === 'F') { event.preventDefault(); toggleFullscreen() }
  else if (key === 'Escape' && overviewOpen) { event.preventDefault(); toggleOverview(false) }
})

let wheelLock = 0
root.addEventListener('wheel', (event) => {
  if (overviewOpen) return
  const now = Date.now()
  if (now - wheelLock < 620) return
  if (Math.abs(event.deltaY) < 18) return
  wheelLock = now
  go(index + (event.deltaY > 0 ? 1 : -1))
}, { passive: true })

let touchX = 0
let touchY = 0
root.addEventListener('touchstart', (event) => {
  touchX = event.changedTouches[0].clientX
  touchY = event.changedTouches[0].clientY
}, { passive: true })
root.addEventListener('touchend', (event) => {
  const dx = event.changedTouches[0].clientX - touchX
  const dy = event.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1))
}, { passive: true })

window.addEventListener('resize', fit)
window.addEventListener('hashchange', () => {
  const n = Number(location.hash.slice(1))
  if (Number.isFinite(n) && n >= 1 && n <= SLIDES.length) go(n - 1)
})

const initial = Number(location.hash.slice(1))
if (Number.isFinite(initial) && initial >= 1 && initial <= SLIDES.length) index = initial - 1
render()
showHints()

