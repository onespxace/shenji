// 幻灯片 HTML 构建：全部为纯函数，便于在 Node 中直接断言渲染结果。
// 之前数据层有标题、渲染层却没输出，导致 13/14 页空白标题；
// 因此把构建逻辑抽到这里，并让 validate-deck.mjs 对渲染结果做断言。

export const MODULE_ICON = { chart: '▤', ticket: '◈', doc: '▦', search: '⌕', chat: '◐', book: '▣' }

// 封面与结语页自带排版，不需要通用页眉
const SELF_HEADED = new Set(['cover', 'closing'])

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch])
}

export function slideHeaderHtml(slide) {
  if (SELF_HEADED.has(slide.kind)) return ''
  const parts = []
  if (slide.eyebrow) parts.push(`<p class="slide-eyebrow">${escapeHtml(slide.eyebrow)}</p>`)
  if (slide.title) parts.push(`<h2 class="slide-title">${escapeHtml(slide.title)}</h2>`)
  if (slide.lead) parts.push(`<p class="slide-lead">${escapeHtml(slide.lead)}</p>`)
  return parts.join('\n        ')
}

export function slideBodyHtml(slide, emblemUrl = '') {
  switch (slide.kind) {
    case 'cover':
      return `<img class="cover-logo" src="${escapeHtml(emblemUrl)}" alt="AuditDesk 徽标" />
        <p class="slide-eyebrow">${escapeHtml(slide.eyebrow)}</p>
        <h1 class="slide-title">${escapeHtml(slide.title)}</h1>
        <p class="cover-sub">${escapeHtml(slide.subtitle)}</p>
        <div class="cover-meta">${(slide.meta || []).map((m) => `<span class="cover-chip">${escapeHtml(m)}</span>`).join('')}</div>`

    case 'bullets':
      return `<div class="bullets">${(slide.bullets || []).map((b, i) => `
        <div class="bullet">
          <span class="bullet-mark">${i + 1}</span>
          <div><h3>${escapeHtml(b.head)}</h3><p>${escapeHtml(b.text)}</p></div>
        </div>`).join('')}</div>`

    case 'cards':
      return `<div class="cards">${(slide.cards || []).map((c) => `
        <div class="card"><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.text)}</p></div>`).join('')}</div>`

    case 'modules':
      return `<div class="modules">${(slide.modules || []).map((m) => `
        <div class="module">
          <span class="module-icon">${MODULE_ICON[m.icon] || '▤'}</span>
          <strong>${escapeHtml(m.name)}</strong>
          <em>${escapeHtml(m.desc)}</em>
        </div>`).join('')}</div>`

    case 'table':
      return `<table class="deck-table">
        <thead><tr>${(slide.columns || []).map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${(slide.rows || []).map((r) => `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`

    case 'split':
      return `<div class="split">
        <div class="split-col"><h3>${escapeHtml(slide.left.title)}</h3>
          <ul>${(slide.left.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
        <div class="split-col is-right"><h3>${escapeHtml(slide.right.title)}</h3>
          <ul>${(slide.right.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
      </div>`

    case 'metrics':
      return `<div class="metrics">${(slide.metrics || []).map((m) => `
        <div class="metric"><div class="metric-value">${escapeHtml(m.value)}</div><div class="metric-label">${escapeHtml(m.label)}</div></div>`).join('')}</div>
        ${slide.note ? `<p class="metrics-note">${escapeHtml(slide.note)}</p>` : ''}`

    case 'closing':
      return `<p class="slide-eyebrow">${escapeHtml(slide.eyebrow)}</p>
        <h1 class="slide-title">${escapeHtml(slide.title)}</h1>
        <p class="slide-lead">${escapeHtml(slide.lead)}</p>
        <div class="closing-points">${(slide.points || []).map((p) => `<span class="closing-point">${escapeHtml(p)}</span>`).join('')}</div>
        <p class="closing-footer">${escapeHtml(slide.footer)}</p>`

    default:
      return ''
  }
}

export function slideInnerHtml(slide, emblemUrl = '') {
  const header = slideHeaderHtml(slide)
  const body = slideBodyHtml(slide, emblemUrl)
  return header && body ? `${header}\n        <div class="slide-body">${body}</div>` : body
}
