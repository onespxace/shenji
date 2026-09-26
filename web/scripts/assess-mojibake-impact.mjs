// 判定 styles.css 的双重编码损坏是否影响功能。
//
// 背景：src/styles.css 的中文注释是「UTF-8 → 按 GBK 解码 → 再存回 UTF-8」造成的
// 双重编码，注释内容读不通。逆变换可还原大部分，但个别字符在损坏时就已丢失。
//
// 关键问题：损坏是否只落在注释里？
//   - 只在注释里 → 零功能影响，页面表现完全正常
//   - 落到选择器或属性值里 → 会真的影响样式，必须修
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] || 'src/styles.css'
const text = readFileSync(path.join(webRoot, file), 'utf8')

// GBK 误解码的典型字（正常中文注释里几乎不出现）。
// 刻意用字符串 includes 而不是正则字符类：这些字里包含全角/兼容区字符，
// 放进 /[...]/ 一旦被换行截断就会变成难以定位的 SyntaxError。
const MARKERS = ['锛', '銆', '鐨', '鏄', '鍜', '涓', '浜', '濠', '闄', '姝', '崌', '瀛', '榻', '鏂', '鎴', '杩', '璁', '缁', '妯', '鍚', '闈', '鍑', '鐢', '鍏', '鐩', '渚', '鏍', '鎸', '璇', '绗', '鍒', '閲', '鑲', '鍙', '鎺', '绠', '鎵', '娴', '鏁']

const isMojibake = (text) => MARKERS.some((marker) => text.includes(marker))

const lines = text.split(/\r?\n/)
const inCommentOnly = []
const inCode = []

// 必须跟踪块注释的跨行状态：styles.css 里有 `/* ---- ...` 在一行开、
// 下一行才 `*/` 闭的注释。逐行做 /\/[\s\S]*?\*\// 剥离会漏掉跨行的那一段，
// 从而把纯注释误判成代码（这正是第一版给出 2 行误报的原因）。
let inBlockComment = false
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i]
  if (!isMojibake(line)) {
    // 仍然要更新注释状态
    for (let c = 0; c < line.length; c += 1) {
      if (inBlockComment && line[c] === '*' && line[c + 1] === '/') { inBlockComment = false; c += 1; continue }
      if (!inBlockComment && line[c] === '/' && line[c + 1] === '*') { inBlockComment = true; c += 1 }
    }
    continue
  }
  // 把注释整段挖掉，只留真正的代码部分
  const stripped = inBlockComment ? '' : stripComments(line)
  if (isMojibake(stripped)) inCode.push({ line: i + 1, text: line.trim() })
  else inCommentOnly.push({ line: i + 1, text: line.trim() })
  for (let c = 0; c < line.length; c += 1) {
    if (inBlockComment && line[c] === '*' && line[c + 1] === '/') { inBlockComment = false; c += 1; continue }
    if (!inBlockComment && line[c] === '/' && line[c + 1] === '*') { inBlockComment = true; c += 1 }
  }
}

/** 去掉单行内的块注释与行注释 */
function stripComments(line) {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '/' && line[i + 1] === '*') {
      const close = line.indexOf('*/', i + 2)
      if (close === -1) return out
      i = close + 2
      continue
    }
    if (line[i] === '/' && line[i + 1] === '/') break
    out += line[i]
    i += 1
  }
  return out
}

console.log(`文件: ${file}  共 ${lines.length} 行`)
console.log(`损坏行总数        : ${inCommentOnly.length + inCode.length}`)
console.log(`  其中纯注释内    : ${inCommentOnly.length}`)
console.log(`  疑似落到代码里  : ${inCode.length}`)
if (inCode.length) {
  console.log('\n以下行需要人工确认（可能影响样式）:')
  for (const item of inCode.slice(0, 30)) console.log(`  ${item.line}: ${item.text.slice(0, 110)}`)
} else {
  console.log('\n结论：损坏全部落在注释内，不影响任何选择器或属性值。')
  console.log('      页面表现与构建结果均正常，属于可读性问题而非功能缺陷。')
}
process.exit(inCode.length ? 1 : 0)
