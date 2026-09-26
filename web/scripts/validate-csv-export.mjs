// CSV 导出的断言。
//
// 这一组断言存在的理由：导出"看起来能用"和"真的能用"差别很大。
// 下面每一条都对应一种实际会翻车的现象（见每条断言名）：
//   字段里的逗号把一列劈成两列 / 引号把后续内容吃掉 / 换行把一行变两行 /
//   缺 BOM 导致 Excel 打开是乱码 / 以 = 开头触发 Excel 公式注入 /
//   金额带千分位被 Excel 当文本，求和全是 0 / 负数被防护误伤变成文本。
import process from 'node:process'
import { downloadCsv, escapeCsvCell, moneyCell, needsFormulaGuard, stamp, toCsv } from '../src/lib/csv-export.js'

const results = []
const check = (name, condition, detail = '') => results.push({ name, passed: Boolean(condition), detail })

// ---------------- 转义 ----------------

check('普通文本原样输出', escapeCsvCell('主营业务收入') === '主营业务收入')
check('空值输出空字符串', escapeCsvCell(null) === '' && escapeCsvCell(undefined) === '')
check('含逗号的字段被引号包住（否则一列变两列）', escapeCsvCell('应收账款,银行存款') === '"应收账款,银行存款"')
check('含双引号的字段引号翻倍', escapeCsvCell('他说"好"') === '"他说""好"""')
check('含换行的字段被引号包住（否则一行变两行）', escapeCsvCell('第一行\n第二行') === '"第一行\n第二行"')
check('含回车（\\r）的字段也被引号包住', escapeCsvCell('a\rb') === '"a\rb"')
check('数字类型原样输出', escapeCsvCell(1032300) === '1032300')
check('非有限数字输出空', escapeCsvCell(Infinity) === '')

// ---------------- 公式注入防护 ----------------

check('以 = 开头会被防护', needsFormulaGuard('=1+1') === true)
check('以 + 开头会被防护', needsFormulaGuard('+1') === true)
check('以 @ 开头会被防护', needsFormulaGuard('@SUM(A1)') === true)
check('以 - 开头的非数字会被防护', needsFormulaGuard('-1+cmd|"/c calc"!A1') === true)
check('负数是合法数字，不防护', needsFormulaGuard('-1234.50') === false)
check('数字类型永不防护', needsFormulaGuard(-1234.5) === false)
// 这三条是"防护是否误伤"的关键：误伤会让导出的金额列变成文本
check('负数金额导出后仍是数字形态', escapeCsvCell('-1234.50') === '-1234.50', escapeCsvCell('-1234.50'))
check('负数字符串不加前缀', escapeCsvCell(String(-1234.5)) === '-1234.5')
check('公式串加单引号前缀中和', escapeCsvCell('=1+1') === "'=1+1", escapeCsvCell('=1+1'))
check('公式串同时含逗号时先加前缀再整体加引号', escapeCsvCell('=1,2') === `"'=1,2"`, escapeCsvCell('=1,2'))
check('前后有空白的公式串也会被识别', needsFormulaGuard('   =1+1') === true)

// ---------------- 金额格式 ----------------

check('金额两位小数且不带千分位', moneyCell(1032300) === '1032300.00', moneyCell(1032300))
check('金额保留真实小数', moneyCell(1234.5) === '1234.50', moneyCell(1234.5))
check('负数金额保留负号', moneyCell(-5000) === '-5000.00', moneyCell(-5000))
check('金额 -0 归零', moneyCell(-0.001) === '0.00', moneyCell(-0.001))
check('空金额输出空', moneyCell(null) === '' && moneyCell('') === '' && moneyCell(undefined) === '')
check('千分位字符串不会被当成金额', moneyCell('1,234') === '')
check('金额不带千分位——Excel 打开后可直接求和', !moneyCell(1032300).includes(','))

// ---------------- 整份文件 ----------------

const csv = toCsv(['项目', '金额(元)'], [['主营业务收入', '5000000.00'], ['含,逗号', '1.00']])
check('CSV 带 UTF-8 BOM（否则 Excel 中文乱码）', csv.charCodeAt(0) === 0xFEFF)
check('CSV 用 CRLF 换行', csv.includes('\r\n'))
check('表头被写出', csv.includes('项目,金额(元)'))
check('toCsv 可以关闭 BOM', toCsv(['a'], [['b']], { bom: false }).charCodeAt(0) !== 0xFEFF)
const noBom = toCsv(['a'], [['b']], { bom: false })
check('不带 BOM 时首字符就是表头', noBom.startsWith('a\r\n'))

// 解析回来对比，证明"写出去的能被正确读回来"
function parseCsv(text) {
  const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  const rows = []
  let row = []
  let cell = ''
  let inQuote = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inQuote) {
      if (ch === '"') {
        if (body[i + 1] === '"') { cell += '"'; i++ } else inQuote = false
      } else cell += ch
    } else if (ch === '"') inQuote = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}
const tricky = toCsv(['列一', '列二'], [['含,逗号', '含"引号'], ['含\n换行', '=1+1'], ['-1234.50', '普通']])
const back = parseCsv(tricky)
check('往返解析：行数正确（含表头 4 行）', back.length === 4, String(back.length))
check('往返解析：逗号字段还原', back[1][0] === '含,逗号', JSON.stringify(back[1]))
check('往返解析：引号字段还原', back[1][1] === '含"引号', JSON.stringify(back[1]))
check('往返解析：换行字段还原', back[2][0] === '含\n换行', JSON.stringify(back[2]))
check('往返解析：防护过的公式串还原成原文', back[2][1] === "'=1+1", JSON.stringify(back[2][1]))
check('往返解析：负数金额原样', back[3][0] === '-1234.50', JSON.stringify(back[3][0]))
check('往返解析：每行列数与表头一致', back.every((r) => r.length === 2), JSON.stringify(back))

// ---------------- 非浏览器环境 ----------------

check('非浏览器环境调用下载不会抛错，返回 false', downloadCsv('x.csv', csv) === false)
check('时间戳格式为 YYYYMMDD-HHmm', /^\d{8}-\d{4}$/.test(stamp(new Date(2026, 8, 26, 15, 30))), stamp(new Date(2026, 8, 26, 15, 30)))

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail && !item.passed ? ` · ${item.detail}` : ''}`)
const passed = results.filter((r) => r.passed).length
console.log(`\n${passed}/${results.length} 个 CSV 导出断言通过`)
process.exit(passed === results.length ? 0 : 1)
