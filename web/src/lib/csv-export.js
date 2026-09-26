// CSV 导出：把表格数据安全地写成 Excel 能正确打开的 CSV。
//
// 为什么单独抽一个模块：导出看着简单，实际上有四个必须同时满足的约束，
// 任何一个漏掉都会"导出成功但内容出错"，而且症状很隐蔽——
//  1) RFC 4180 转义：字段里有逗号 / 双引号 / 换行时必须整体加引号，内部引号翻倍。
//     漏掉的话 Excel 会把一个字段劈成两列，或者一行变两行。
//  2) 换行统一用 \r\n：只用 \n 时部分 Windows Excel 版本会把整份文件当成一行。
//  3) UTF-8 BOM：没有 BOM 时 Excel 按本地代码页（简中环境是 GBK）解码，中文全变乱码。
//  4) 公式注入防护：以 = + - @ 开头的单元格会被 Excel 当公式执行（CSV Injection）。
//     **但负数不能被误伤**——"-1234.00" 是合法数字，加前缀会把它变成文本，
//     导出的金额列再也算不了。所以只对"以 - 开头且不是合法数字"的文本加防护。
//
// 金额一律导出为**不带千分位**的两位小数字符串：带千分位 Excel 会当文本，
// 而不带千分位 Excel 会正确识别成数字，用户可以直接求和。

/** 判断文本是否会被 Excel/Sheets 当作公式执行 */
const NUMERIC_ONLY = /^-?\d+(\.\d+)?$/
// 注意要加 +：不加只会吃掉一个前导空白，"   =1+1" 就会漏判
const LEADING_JUNK = /^[\s\u0000-\u001f]+/

export function needsFormulaGuard(value) {
  if (typeof value === 'number') return false
  const text = String(value ?? '')
  if (text === '') return false
  const first = text.replace(LEADING_JUNK, '')[0]
  if (first === undefined) return false
  if (first === '=' || first === '+' || first === '@') return true
  if (first === '-') return !NUMERIC_ONLY.test(text.trim())
  return false
}

/** 转义单个单元格 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return String(value)
  }
  let text = String(value)
  if (needsFormulaGuard(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

/**
 * 生成 CSV 文本。
 * @param {string[]} headers 表头
 * @param {Array<Array<unknown>>} rows 数据行
 * @param {{bom?: boolean, eol?: string}} [options] bom 默认 true
 */
export function toCsv(headers, rows, options = {}) {
  const eol = options.eol || '\r\n'
  const head = (headers || []).map(escapeCsvCell).join(',')
  const body = (rows || []).map((row) => (row || []).map(escapeCsvCell).join(','))
  const text = [head, ...body].join(eol)
  return (options.bom === false ? '' : '\uFEFF') + text + eol
}

/** 金额导出口径：不带千分位、两位小数，Excel 才能当数字处理 */
export function moneyCell(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return ''
  const n = Math.round((Number(value) + Number.EPSILON) * 100) / 100
  return (Object.is(n, -0) ? 0 : n).toFixed(2)
}

/**
 * 触发浏览器下载。非浏览器环境（断言脚本）返回 false，方便复用纯函数。
 * @returns {boolean} 是否真的触发了下载
 */
export function downloadCsv(filename, csvText) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}

/** 时间戳后缀：YYYYMMDD-HHmm，用于文件名 */
export function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}
