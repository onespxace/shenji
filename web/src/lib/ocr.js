import { createWorker, PSM } from 'tesseract.js'

let workerPromise = null

function localOcrBase() {
  return new URL('ocr/', document.baseURI).href
}

function validateImageFile(file) {
  if (!file) throw new Error('请选择凭证图片')
  if (!/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)) {
    throw new Error('仅支持 PNG、JPG、WEBP、BMP 图片；PDF 请先转为图片')
  }
  if (file.size > 15 * 1024 * 1024) throw new Error('图片超过 15MB，请压缩后再识别')
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    const base = localOcrBase()
    workerPromise = createWorker(['chi_sim', 'eng'], 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: `${base}tessdata`,
      gzip: false,
      cachePath: 'auditdesk-ocr-v7-tessdata-fast-20260926',
      cacheMethod: 'write',
      workerBlobURL: false,
      logger: (message) => {
        if (message && typeof message.progress === 'number') {
          onProgress?.({ progress: Math.max(0, Math.min(1, message.progress)), status: message.status || '正在识别' })
        }
      }
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1'
      })
      return worker
    }).catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

export async function recognizeVoucherImage(file, onProgress) {
  validateImageFile(file)
  onProgress?.({ progress: 0.02, status: '正在加载本地中文识别模型' })
  const worker = await getWorker(onProgress)
  onProgress?.({ progress: 0.25, status: '正在识别凭证文字' })
  const result = await worker.recognize(file, {}, { text: true, blocks: true })
  onProgress?.({ progress: 1, status: '识别完成' })
  return {
    text: result.data.text || '',
    confidence: Number(result.data.confidence || 0),
    blocks: result.data.blocks || []
  }
}

export async function terminateOcr() {
  if (!workerPromise) return
  const worker = await workerPromise.catch(() => null)
  workerPromise = null
  if (worker) await worker.terminate()
}

export function ocrAssetUrls() {
  const base = localOcrBase()
  return {
    worker: `${base}worker.min.js`,
    core: base,
    languages: `${base}tessdata`
  }
}
