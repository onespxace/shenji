// OCR 准确率基准：对比不同模型 / 版面模式 / 语言组合在同一批测试图上的表现。
// 用法：node scripts/run-ocr-bench.mjs          跑全部配置
//       node scripts/run-ocr-bench.mjs --text   附带打印识别文本，便于人工核对
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createWorker, PSM } from 'tesseract.js'
import { BENCH_DIR, GROUND_TRUTH } from './bench-ocr.mjs'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FAST_DIR = path.join(webRoot, 'public', 'ocr', 'tessdata')
const BEST_DIR = path.join(BENCH_DIR, 'models')
const showText = process.argv.includes('--text')

const CONFIGS = [
  { id: 'baseline-fast-p3', label: '现状 tessdata_fast · AUTO', dir: FAST_DIR, langs: ['chi_sim', 'eng'], psm: PSM.AUTO },
  { id: 'best-p3', label: 'best_int · AUTO', dir: BEST_DIR, langs: ['chi_sim', 'eng'], psm: PSM.AUTO },
  { id: 'best-p6', label: 'best_int · 单一区块', dir: BEST_DIR, langs: ['chi_sim', 'eng'], psm: PSM.SINGLE_BLOCK },
  { id: 'best-p4', label: 'best_int · 单列', dir: BEST_DIR, langs: ['chi_sim', 'eng'], psm: PSM.SINGLE_COLUMN },
  { id: 'best-chi-p6', label: 'best_int · 仅中文 · 单一区块', dir: BEST_DIR, langs: ['chi_sim'], psm: PSM.SINGLE_BLOCK }
]

// 预检：模型文件必须存在，否则直接报错，避免测出"全是 0 分"的假结果
for (const config of CONFIGS) {
  for (const lang of config.langs) {
    const file = path.join(config.dir, `${lang}.traineddata`)
    if (!existsSync(file) || statSync(file).size < 100000) {
      console.error(`缺少模型文件：${file}`)
      console.error('请先执行 node scripts/bench-ocr.mjs --make-images 并确认 public/ocr/tessdata 已由 sync:ocr 生成。')
      process.exit(1)
    }
  }
}

/** 归一化：容忍 OCR 常见的空格、全角、O/0、l/1 混淆 */
function normalize(text) {
  return String(text || '')
    .replace(/[\s　]/g, '')
    .replace(/[O]/g, '0')
    .replace(/[lI]/g, '1')
    .replace(/[，]/g, ',')
}

function score(text, expect) {
  const flat = normalize(text)
  const hit = (needle) => flat.includes(normalize(needle))
  const fields = {
    date: hit(expect.date),
    voucherNo: hit(expect.voucherNo),
    summary: hit(expect.summary),
    amount: hit(expect.amount),
    attachment: hit(expect.attachment)
  }
  const accounts = expect.accounts.map(hit)
  const signatures = expect.signatures.map(hit)
  const total = 5 + accounts.length + signatures.length
  const correct = Object.values(fields).filter(Boolean).length
    + accounts.filter(Boolean).length + signatures.filter(Boolean).length
  return { fields, accounts, signatures, correct, total }
}

const images = readdirSync(BENCH_DIR).filter((f) => f.endsWith('.png')).sort()
if (!images.length) {
  console.error('没有测试图，请先执行：node scripts/bench-ocr.mjs --make-images')
  process.exit(1)
}

const results = []
for (const config of CONFIGS) {
  const worker = await createWorker(config.langs, 1, {
    langPath: config.dir,
    gzip: false,
    cachePath: `bench-${config.id}`,
    logger: () => {}
  })
  await worker.setParameters({ tessedit_pageseg_mode: config.psm, preserve_interword_spaces: '1' })

  let correct = 0
  let total = 0
  const perImage = []
  for (const file of images) {
    const key = path.basename(file, '.png')
    const truth = GROUND_TRUTH[key]
    const { data } = await worker.recognize(path.join(BENCH_DIR, file))
    const s = score(data.text, truth.expect)
    correct += s.correct
    total += s.total
    perImage.push({ key, label: truth.label, ...s, confidence: Math.round(data.confidence || 0), text: data.text })
    if (showText) {
      console.log(`\n===== ${config.id} / ${truth.label} / conf ${Math.round(data.confidence || 0)} =====`)
      console.log(data.text)
    }
  }
  await worker.terminate()
  const accuracy = correct / total
  results.push({ ...config, correct, total, accuracy, perImage })
  console.log(`done ${config.id.padEnd(16)} ${(accuracy * 100).toFixed(1).padStart(5)}%  (${correct}/${total})`)
}

const keyOf = (f) => path.basename(f, '.png')

console.log('\n============ 字段准确率汇总 ============')
console.log('config'.padEnd(20) + images.map((f) => GROUND_TRUTH[keyOf(f)].label.split(' ')[0].padEnd(6)).join('') + 'avg')
for (const r of results) {
  const cells = images.map((f) => {
    const item = r.perImage.find((p) => p.key === keyOf(f))
    return `${item.correct}/${item.total}`.padEnd(6)
  })
  console.log(r.id.padEnd(20) + cells.join('') + `${(r.accuracy * 100).toFixed(1)}%`)
}

const best = results.reduce((a, b) => (b.accuracy > a.accuracy ? b : a))
console.log(`\n============ 最佳配置逐图明细：${best.label} ============`)
for (const item of best.perImage) {
  const failed = []
  if (!item.fields.date) failed.push('date')
  if (!item.fields.voucherNo) failed.push('voucherNo')
  if (!item.fields.summary) failed.push('summary')
  if (!item.fields.amount) failed.push('amount')
  if (!item.fields.attachment) failed.push('attachment')
  item.accounts.forEach((ok, i) => { if (!ok) failed.push(`account${i + 1}`) })
  item.signatures.forEach((ok, i) => { if (!ok) failed.push(`sign${i + 1}`) })
  console.log(`  ${item.label.padEnd(14)} ${String(item.correct).padStart(2)}/${item.total}  conf ${String(item.confidence).padStart(3)}  ${failed.length ? 'MISS: ' + failed.join(',') : 'all hit'}`)
}
