// 轻量 Markdown 渲染器：零依赖、确定性、可在流式输出中安全使用。
//
// 安全模型：所有输入先做 HTML 实体转义，再做 Markdown 结构化替换，
// 因此模型输出无法注入标签、事件属性或脚本。链接只放行 http/https/mailto。
//
// 支持：ATX 标题、无序/有序列表（两级）、引用、围栏代码块、表格、
//       水平线、粗体、斜体、删除线、行内代码、链接、图片占位。

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char])
}

function isSafeUrl(url) {
  return /^(https?:\/\/|mailto:)/i.test(String(url || '').trim())
}

function slug(value, index) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return text || `section-${index}`
}

// 行内语法：在已转义的文本上运行，因此插入的标签是唯一可信来源。
function renderInline(escaped) {
  let out = escaped
  const codeSlots = []
  // 行内代码优先占位，避免其中的 * _ # 被当作强调语法
  out = out.replace(/`([^`\n]+)`/g, (match, code) => {
    codeSlots.push(code)
    return `\u0000IC${codeSlots.length - 1}\u0000`
  })
  // 图片：只保留说明文字，避免加载外链图片带来的跟踪与布局抖动
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (match, alt) => `[图片：${alt || '未命名'}]`)
  // 链接：仅放行安全协议
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, url) => {
    if (!isSafeUrl(url)) return label
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`
  })
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
  out = out.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
  out = out.replace(/`\u0000IC(\d+)\u0000`/g, (match, index) => `<code>${codeSlots[Number(index)]}</code>`)
  out = out.replace(/\u0000IC(\d+)\u0000/g, (match, index) => `<code>${codeSlots[Number(index)]}</code>`)
  return out
}

function splitTableRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim())
}

function isTableDivider(line) {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-')
}

export function renderMarkdown(source) {
  const text = String(source == null ? '' : source).replace(/\r\n?/g, '\n')
  if (!text.trim()) return ''

  const lines = text.split('\n')
  const html = []
  let index = 0
  let headingCount = 0

  while (index < lines.length) {
    const line = lines[index]

    // 围栏代码块
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/)
    if (fence) {
      const marker = fence[1][0]
      const language = fence[2] || ''
      const buffer = []
      index += 1
      while (index < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[index])) {
        buffer.push(lines[index])
        index += 1
      }
      index += 1
      const code = escapeHtml(buffer.join('\n'))
      const label = language ? `<span class="md-code-lang">${escapeHtml(language)}</span>` : ''
      html.push(`<pre class="md-code">${label}<code>${code}</code></pre>`)
      continue
    }

    // 空行
    if (!line.trim()) { index += 1; continue }

    // 水平线
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      html.push('<hr />')
      index += 1
      continue
    }

    // 标题
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(6, heading[1].length + 1)
      const content = heading[2].trim()
      html.push(`<h${level} id="${slug(content, headingCount)}">${renderInline(escapeHtml(content))}</h${level}>`)
      headingCount += 1
      index += 1
      continue
    }

    // 表格：当前行含竖线且下一行是分隔行
    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const header = splitTableRow(line)
      index += 2
      const body = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        body.push(splitTableRow(lines[index]))
        index += 1
      }
      const thead = header.map((cell) => `<th>${renderInline(escapeHtml(cell))}</th>`).join('')
      const tbody = body
        .map((row) => `<tr>${header.map((_, i) => `<td>${renderInline(escapeHtml(row[i] || ''))}</td>`).join('')}</tr>`)
        .join('')
      html.push(`<div class="md-table-wrap"><table class="md-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`)
      continue
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const buffer = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        buffer.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      html.push(`<blockquote>${renderMarkdown(buffer.join('\n'))}</blockquote>`)
      continue
    }

    // 列表：支持两级缩进
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const buffer = []
      while (index < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[index]) || (/^\s{2,}\S/.test(lines[index]) && buffer.length))) {
        buffer.push(lines[index])
        index += 1
      }
      let htmlList = renderList(buffer, 0)
      if (ordered) htmlList = htmlList.replace(/^<ul/, '<ol').replace(/<\/ul>$/, '</ol>')
      html.push(htmlList)
      continue
    }

    // 段落：连续非空行合并
    const buffer = []
    while (index < lines.length && lines[index].trim() && !/^\s*(#{1,6}\s|>|`{3,}|~{3,}|([-*+]|\d+[.)])\s)/.test(lines[index])) {
      buffer.push(lines[index])
      index += 1
    }
    if (buffer.length) {
      html.push(`<p>${renderInline(escapeHtml(buffer.join('\n'))).replace(/\n/g, '<br />')}</p>`)
    } else {
      index += 1
    }
  }

  return html.join('\n')
}

function renderList(buffer, depth) {
  if (!buffer.length) return ''
  const ordered = /^\s*\d+[.)]\s+/.test(buffer[0])
  const tag = ordered ? 'ol' : 'ul'
  const items = []
  let current = null
  for (const raw of buffer) {
    const bullet = raw.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (bullet) {
      const indent = bullet[1].length
      const isNested = depth < 1 && indent >= 2
      const isDifferentType = /^\s*\d+[.)]\s+/.test(raw) !== ordered
      if (isNested || isDifferentType) {
        const nested = renderList([raw.replace(/^\s{0,4}/, '')], depth + 1)
        if (current) current.items.push(nested)
        continue
      }
      current = { text: [bullet[3]], items: [] }
      items.push(current)
    } else if (current) {
      current.text.push(raw.trim())
    }
  }
  const body = items
    .map((item) => `<li>${renderInline(escapeHtml(item.text.join('\n'))).replace(/\n/g, '<br />')}${item.items.length ? item.items.join('') : ''}</li>`)
    .join('')
  return `<${tag} class="md-list">${body}</${tag}>`
}

// 提取纯文本预览（用于会话标题、复制等不需要格式的场合）
export function markdownToPlainText(source, maxLength = 0) {
  const text = String(source == null ? '' : source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_~#|]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
  return maxLength > 0 && text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
