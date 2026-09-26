// 基准测试页：在浏览器里跑 Tesseract 基线与新管线，输出逐字段对比。
//
// 放在项目根不进构建产物（与 mobile-check.html / md-fixture.html 同一约定）。
// 用法：npm run dev 后打开 /ocr-benchmark.html
//
// 口径：只用 .bench-ocr/ 下的合成图，页面顶部固定显示"合成测试集"字样，
//      不允许在页面上出现"准确率 XX%"这种无条件断言。
import { processCredential, disposeAllEngines, ENGINE_IDS } from './ocr/pipeline/credential-pipeline.js'
import { recognizeWithTesseract } from './ocr/engines/tesseract-engine.js'
import { validateVoucherText } from './lib/voucher-validator.js'
import { GROUND_TRUTH, BENCHMARK_FIELDS, FIELD_LABELS, CONDITIONS, scoreFieldValue, matchModeFor, SIGNATURE_FIELDS, aggregate, formatComparison } from './ocr/benchmark/benchmark-spec.js'

const IMAGES = ['A-scan', 'B-skew', 'C-lowcontrast', 'D-photo']

const out = document.getElementById('out')
const lines = []
function log(text, cls = '') {
  lines.push({ text, cls })
  out.innerHTML = lines.map((l) => `<div class="${l.cls}">${escapeHtml(l.text)}</div>`).join('\n')
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

function pickField(result, fieldId) {
  return result.fields.find((f) => f.field === fieldId) || null
}

/**
 * 基线路径：**原实现**——整页 OCR 得到一段文本，再交给 voucher-validator 正则解析。
 *
 * 关键：不能把 Tesseract 塞进新的结构化抽取器。那样等于让基线用一套它
 * 天生不适配的坐标逻辑（词级碎片化），会人为压低基线、虚增提升幅度。
 * 基线必须等于"升级前用户实际用的东西"。
 */
async function runBaseline(key, truth) {
  const file = await fetchImage(key)
  const t0 = performance.now()
  const { text } = await recognizeWithTesseract({ blob: file })
  const parsed = validateVoucherText(text || '')
  const ms = Math.round(performance.now() - t0)
  const ex = parsed.extracted
  const fields = {}
  for (const fieldId of BENCHMARK_FIELDS) {
    const needles = truth.expect[fieldId]
    if (!needles) continue
    let value = ''
    if (fieldId === 'date') value = ex.date?.raw || ''
    else if (fieldId === 'voucherNumber') value = ex.voucherNumber || ''
    else if (fieldId === 'summary') value = ex.summary?.value || ''
    else if (fieldId === 'generalAccount') value = (ex.accounts?.[0]?.name) || ''
    else if (fieldId === 'detailAccount') value = (ex.accounts?.[1]?.name) || ''
    else if (fieldId === 'debitAmount') value = ex.amounts?.debit != null ? String(ex.amounts.debit) : ''
    else if (fieldId === 'creditAmount') value = ex.amounts?.credit != null ? String(ex.amounts.credit) : ''
    else if (fieldId === 'attachmentCount') value = ex.attachmentCount != null ? String(ex.attachmentCount) : ''
    else if (fieldId === 'preparer') value = ex.signatures?.[0]?.name || ''
    else if (fieldId === 'signature') value = (ex.signatures?.[1]?.name || ex.signatures?.[2]?.name || '')
    const scored = scoreFieldValue(fieldId, value, needles, { mode: matchModeFor(fieldId) })
    fields[fieldId] = { value, ...scored, assisted: SIGNATURE_FIELDS.has(fieldId) }
  }
  return { image: key, condition: truth.condition, engine: ENGINE_IDS.tesseract, fields, ms, path: '整页文本 + 正则解析（原实现）' }
}

function scoreRun(truth, result) {
  const fields = {}
  for (const fieldId of BENCHMARK_FIELDS) {
    const needles = truth.expect[fieldId]
    if (!needles) continue
    if (SIGNATURE_FIELDS.has(fieldId)) {
      // 签名类：OCR 文本对就算命中，但单独记为"辅助识别"
      const got = pickField(result, fieldId)
      const raw = fieldId === 'signature' ? result.signature?.ocrText : got?.value
      const hit = (needles || []).some((n) => String(raw || '').replace(/\s/g, '').includes(n))
      fields[fieldId] = { value: raw || '', correct: hit, reason: hit ? '' : '未命中', assisted: true }
      continue
    }
    const got = pickField(result, fieldId)
    const scored = scoreFieldValue(fieldId, got?.value || '', needles, { mode: matchModeFor(fieldId) })
    fields[fieldId] = { value: got?.value || '', ...scored }
  }
  return fields
}

async function fetchImage(key) {
  const res = await fetch(`.bench-ocr/${key}.png`)
  if (!res.ok) throw new Error(`取不到测试图 ${key}，请先执行 node scripts/bench-ocr.mjs --make-images`)
  return new File([await res.blob()], `${key}.png`, { type: 'image/png' })
}

async function runEngine(engineId) {
  const runs = []
  for (const key of IMAGES) {
    const truth = GROUND_TRUTH[key]
    const file = await fetchImage(key)
    const t0 = performance.now()
    const result = await processCredential(file, { engine: engineId, reRecognize: true, reRecognizeLimit: 3 })
    const ms = Math.round(performance.now() - t0)
    const fields = scoreRun(truth, result)
    runs.push({ image: key, condition: truth.condition, engine: engineId, fields, ms, path: '检测框 → 列角色 → 字段 → 校验 → 可靠度' })
    const hit = Object.values(fields).filter((f) => f.correct).length
    log(`  ${truth.label.padEnd(12)} ${String(hit).padStart(2)}/10  ${String(ms).padStart(6)} ms  画质 ${result.quality.score}  重识别 ${result.reRecognized}`, 'line')
  }
  return runs
}

async function runBaselineAll() {
  const runs = []
  for (const key of IMAGES) {
    const truth = GROUND_TRUTH[key]
    const run = await runBaseline(key, truth)
    runs.push(run)
    const hit = Object.values(run.fields).filter((f) => f.correct).length
    log(`  ${truth.label.padEnd(12)} ${String(hit).padStart(2)}/10  ${String(run.ms).padStart(6)} ms`, 'line')
  }
  return runs
}

function renderTable(comparison, aLabel, bLabel) {
  const head = ['字段', aLabel, bLabel, '差值']
  const body = comparison.rows.map((r) => {
    const cls = r.verdict === 'improved' ? 'good' : r.verdict === 'regressed' ? 'bad' : ''
    const diff = `${r.diff > 0 ? '+' : ''}${r.diff.toFixed(1)}`
    return `<tr class="${cls}"><td>${escapeHtml(r.field)}</td><td>${r.baseline}</td><td>${r.candidate}</td><td>${diff}</td></tr>`
  })
  const o = comparison.overall
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody>
    <tfoot><tr><th>合计</th><th>${o.baseline.toFixed(1)}%</th><th>${o.candidate.toFixed(1)}%</th><th>${o.diff > 0 ? '+' : ''}${o.diff.toFixed(1)}</th></tr></tfoot></table>`
}

document.getElementById('run').onclick = async () => {
  lines.length = 0
  out.innerHTML = ''
  const btn = document.getElementById('run')
  btn.disabled = true
  try {
    log('① 跑基线：Tesseract 整页 OCR + 正则解析（**原实现，未改动**）', 'h')
    const baseRuns = await runBaselineAll()
    const baseline = aggregate(baseRuns)
    log(`   基线合计 ${baseline.overall.toFixed(1)}%（${baseline.correct}/${baseline.total}），平均 ${baseline.avgMs} ms`, 'line')

    log('② 跑新管线（PaddleOCR PP-OCRv5 · 检测框 → 列角色 → 字段 → 校验 → 可靠度）…', 'h')
    const newRuns = await runEngine(ENGINE_IDS.paddle)
    const candidate = aggregate(newRuns)
    log(`   新管线合计 ${candidate.overall.toFixed(1)}%（${candidate.correct}/${candidate.total}），平均 ${candidate.avgMs} ms`, 'line')

    const comparison = formatComparison(baseline, candidate)
    log('③ 逐字段对比', 'h')
    out.insertAdjacentHTML('beforeend', renderTable(comparison, 'Tesseract', '新管线'))

    log('④ 分退化条件', 'h')
    const condRows = Object.keys(CONDITIONS)
      .filter((c) => baseline.byCondition[c] || candidate.byCondition[c])
      .map((c) => {
        const a = baseline.byCondition[c]
        const b = candidate.byCondition[c]
        const pa = a ? a.pct.toFixed(1) : '—'
        const pb = b ? b.pct.toFixed(1) : '—'
        return `   ${CONDITIONS[c].padEnd(6)} Tesseract ${pa}%  →  新管线 ${pb}%`
      })
    condRows.forEach((r) => log(r, 'line'))

    log('⑤ 口径说明', 'h')
    log('   以上是**合成渲染测试集**的字段命中率，不等于真实凭证准确率。', 'warn')
    log('   真实凭证叠加手写、印章遮挡、复写纸洇色，准确率只会更低。', 'warn')
    log('   签名一栏是"辅助识别"，不代表身份可信；请以人工核验为准。', 'warn')

    window.__benchmark = { baseline, candidate, comparison, baseRuns, newRuns }
    log('完成。window.__benchmark 已保存完整结果。', 'h')
  } catch (error) {
    log(`运行失败：${error.message || error}`, 'bad')
  } finally {
    btn.disabled = false
    await disposeAllEngines()
  }
}

log('就绪。点击「运行基准测试」开始。', 'h')
