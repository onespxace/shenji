// 对比各前处理变体在同一批凭证图上的字段准确率。
// 用法：node scripts/cmp-prep.mjs
import path from 'node:path'
import { readdirSync } from 'node:fs'
import { createWorker, PSM } from 'tesseract.js'
import { BENCH_DIR, GROUND_TRUTH } from './bench-ocr.mjs'
import { VARIANTS } from './prep-bench.mjs'

const EXPECT = GROUND_TRUTH['A-scan'].expect
const norm = (t) => String(t || '').replace(/[\s　]/g, '').replace(/O/g, '0').replace(/[lI]/g, '1')
const hit = (flat, n) => flat.includes(norm(n))

function score(text) {
  const f = norm(text)
  const fields = {
    date: hit(f, EXPECT.date),
    voucherNo: hit(f, EXPECT.voucherNo),
    summary: hit(f, EXPECT.summary),
    amount: hit(f, EXPECT.amount),
    attachment: hit(f, EXPECT.attachment)
  }
  const accounts = EXPECT.accounts.map((n) => hit(f, n))
  const signatures = EXPECT.signatures.map((n) => hit(f, n))
  const total = 5 + accounts.length + signatures.length
  const correct = Object.values(fields).filter(Boolean).length
    + accounts.filter(Boolean).length + signatures.filter(Boolean).length
  return { correct, total }
}

const keys = Object.keys(GROUND_TRUTH)
const worker = await createWorker(['chi_sim', 'eng'], 1, {
  langPath: path.resolve('public/ocr/tessdata'),
  gzip: false,
  cachePath: 'cmp-prep',
  logger: () => {}
})
await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })

const rows = []
const variants = [{ id: 'raw', label: '原图（无前处理）' }, ...VARIANTS.map((v) => ({ id: v.id, label: v.id }))]
for (const variant of variants) {
  const perKey = {}
  let correct = 0
  let total = 0
  for (const key of keys) {
    const file = variant.id === 'raw' ? `${key}.png` : `${key}@${variant.id}.png`
    const { data } = await worker.recognize(path.join(BENCH_DIR, file))
    const s = score(data.text)
    perKey[key] = `${s.correct}/${s.total}`
    correct += s.correct
    total += s.total
  }
  rows.push({ label: variant.label, perKey, correct, total, pct: (correct / total) * 100 })
}
await worker.terminate()

const short = { raw: '原图', 'v1x': '1x', 'v2x': '2x', 'v2x-gray': '2x+灰', 'v2x-gray-stretch': '2x+灰+拉伸', 'v2x-gray-stretch-bin': '再加二值' }
console.log('变体'.padEnd(16) + keys.map((k) => GROUND_TRUTH[k].label.split(' ')[0].padEnd(7)).join('') + '总分')
for (const r of rows) {
  const name = short[r.label === '原图（无前处理）' ? 'raw' : r.label] || r.label
  console.log(name.padEnd(16) + keys.map((k) => r.perKey[k].padEnd(7)).join('') + `${r.correct}/${r.total}  ${r.pct.toFixed(1)}%`)
}
const best = rows.reduce((a, b) => (b.pct > a.pct ? b : a))
console.log(`\n最优：${best.label}  ${best.pct.toFixed(1)}%`)
