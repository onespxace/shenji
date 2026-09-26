// Markdown 渲染器断言：结构、安全、确定性、流式安全。
import process from 'node:process'
import { escapeHtml, markdownToPlainText, renderMarkdown } from '../src/lib/markdown.js'

const results = []
function check(name, condition, detail = '') {
  results.push({ name, passed: Boolean(condition), detail })
}

// --- 结构 ---
check('标题', renderMarkdown('# 标题').includes('<h2 id="标题">标题</h2>'), renderMarkdown('# 标题'))
check('粗体', renderMarkdown('**粗**').includes('<strong>粗</strong>'), renderMarkdown('**粗**'))
check('斜体', renderMarkdown('*斜*').includes('<em>斜</em>'), renderMarkdown('*斜*'))
check('删除线', renderMarkdown('~~删~~').includes('<del>删</del>'), renderMarkdown('~~删~~'))
check('行内代码', renderMarkdown('`x=1`').includes('<code>x=1</code>'), renderMarkdown('`x=1`'))
check('行内代码内星号不被解析', !renderInlineStar('`*a*`').includes('<em>'), renderInlineStar('`*a*`'))
check('代码块', renderMarkdown('```js\nlet a=1\n```').includes('md-code-lang">js<'), renderMarkdown('```js\nlet a=1\n```'))
check('代码块内不解析语法', !renderMarkdown('```\n**x**\n```').includes('<strong>'), renderMarkdown('```\n**x**\n```'))
check('无序列表', renderMarkdown('- a\n- b').includes('<li>a</li>'), renderMarkdown('- a\n- b'))
check('有序列表', renderMarkdown('1. a\n2. b').startsWith('<ol'), renderMarkdown('1. a\n2. b'))
check('嵌套列表', renderMarkdown('- a\n  - b').includes('md-list'), renderMarkdown('- a\n  - b'))
check('表格', renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |').includes('<th>a</th>'), renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |'))
check('引用', renderMarkdown('> 提示').includes('<blockquote>'), renderMarkdown('> 提示'))
check('水平线', renderMarkdown('---').includes('<hr'), renderMarkdown('---'))
check('安全链接', renderMarkdown('[官方](https://example.com)').includes('rel="noopener noreferrer nofollow"'), renderMarkdown('[官方](https://example.com)'))
check('换行保留', renderMarkdown('第一行\n第二行').includes('<br />'), renderMarkdown('第一行\n第二行'))

// --- 安全 ---
check('脚本标签被转义', !renderMarkdown('<script>alert(1)</script>').includes('<script'), renderMarkdown('<script>alert(1)</script>'))
const injected = renderMarkdown('<img src=x onerror=alert(1)>')
check('事件属性无法注入', !injected.includes('<img') && injected.includes('&lt;img'), injected)
check('javascript 链接被剥离', !renderMarkdown('[点我](javascript:alert(1))').includes('javascript:'), renderMarkdown('[点我](javascript:alert(1))'))
check('data 链接被剥离', !renderMarkdown('[x](data:text/html,<script>)').includes('data:'), renderMarkdown('[x](data:text/html,<script>)'))
check('HTML 实体转义', escapeHtml('<a href="x">&\'') === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;', escapeHtml('<a href="x">&\''))
check('图片降级为文字', renderMarkdown('![追踪](https://t.com/p.gif)').includes('[图片：追踪]'), renderMarkdown('![追踪](https://t.com/p.gif)'))

// --- 确定性 ---
const sample = '# 标题\n\n正文 **粗体**\n\n- 一\n- 二\n\n| 项目 | 金额 |\n| --- | --- |\n| 现金 | 100 |\n\n```sql\nSELECT 1;\n```'
check('同一输入结果一致', renderMarkdown(sample) === renderMarkdown(sample))
check('CRLF 与 LF 结果一致', renderMarkdown(sample) === renderMarkdown(sample.replace(/\n/g, '\r\n')))

// --- 流式安全（未闭合结构不应抛错或产生坏标签） ---
const streaming = [
  '# 标题',
  '**粗体',
  '- 列表项',
  '| a | b |\n| --- |',
  '```js\nconst a = 1',
  '> 引用',
  '[链接](',
  '| a | b |\n| --- | --- |\n| 1 |'
]
let streamingOk = true
let streamingDetail = ''
for (const chunk of streaming) {
  try {
    const html = renderMarkdown(chunk)
    const opens = (html.match(/<(?!\/|!|br |hr )[a-z]/g) || []).length
    const closes = (html.match(/<\/[a-z]/g) || []).length
    const selfClosing = (html.match(/<hr \/>/g) || []).length
    if (opens - selfClosing !== closes) {
      streamingOk = false
      streamingDetail = `标签不配对 @ ${JSON.stringify(chunk)} -> ${html}`
    }
  } catch (error) {
    streamingOk = false
    streamingDetail = `抛错 @ ${JSON.stringify(chunk)}: ${error.message}`
  }
}
check('流式分片不产生坏标签', streamingOk, streamingDetail)

// --- 纯文本提取 ---
check('纯文本去语法', markdownToPlainText('## 标题\n\n**粗体** [链接](https://a.com)') === '标题\n粗体 链接', JSON.stringify(markdownToPlainText('## 标题\n\n**粗体** [链接](https://a.com)')))
check('纯文本去代码块', !markdownToPlainText('```\nsecret\n```\n正文').includes('secret'), JSON.stringify(markdownToPlainText('```\nsecret\n```\n正文')))
check('空输入安全', renderMarkdown('') === '' && renderMarkdown(null) === '' && renderMarkdown(undefined) === '')

function renderInlineStar(value) {
  return renderMarkdown(value)
}

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((item) => item.passed).length
console.log(`\n${passed}/${results.length} 个 Markdown 渲染断言通过`)
process.exit(passed === results.length ? 0 : 1)
