const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { execFile } = require('node:child_process');
const ExcelJS = require('exceljs');
const Tesseract = require('tesseract.js');

const ROOT = path.resolve(__dirname, '..');
const RESOURCES = path.join(ROOT, 'resources');
const DEFAULT_WORKSPACE = {
  version: 1,
  projects: [
    { id: 'p-demo', name: '年度财务报表审计', client: '示例客户', period: '2025 年度', status: '进行中', progress: 62, updatedAt: '今天', areas: ['货币资金', '收入', '采购', '存货'] },
    { id: 'p-learning', name: '审计方法学习', client: '个人工作区', period: '持续学习', status: '进行中', progress: 28, updatedAt: '昨天', areas: ['数据分析', '抽样', '底稿'] }
  ],
  activeProjectId: 'p-demo',
  tasks: [
    { id: 't-1', title: '完成银行存款函证及受限资金核对', area: '货币资金', priority: '高', due: '今天', done: false },
    { id: 't-2', title: '复核收入截止性测试样本', area: '收入循环', priority: '高', due: '明天', done: false },
    { id: 't-3', title: '抽查 30 笔费用报销单据', area: '费用报销', priority: '中', due: '周五', done: false },
    { id: 't-4', title: '整理抽样底稿与证据索引', area: '底稿管理', priority: '低', due: '下周', done: true }
  ],
  evidence: [
    { id: 'e-1', code: 'A-1201', title: '银行存款余额及受限资金核对', type: '分析程序', status: '进行中', source: '银行对账单 / 银行询证函', updatedAt: '今天' },
    { id: 'e-2', code: 'C-2104', title: '应付账款截止性测试', type: '抽样测试', status: '待复核', source: '供应商发票 / 验收单', updatedAt: '昨天' },
    { id: 'e-3', code: 'E-3302', title: '费用报销抽样与凭证穿行', type: '穿行测试', status: '已完成', source: '费用明细 / 发票 / 付款回单', updatedAt: '9 月 21 日' }
  ],
  notes: [
    { id: 'n-1', text: '异常线索：供应商发票日期与验收日期存在差异，补充物流签收记录。', time: '今天 09:42' },
    { id: 'n-2', text: '抽样备忘：先确认总体，再记录风险、样本选择和偏差评价。', time: '昨天 18:20' }
  ],
  knowledgeBookmarks: []
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function workspacePath() { return path.join(app.getPath('userData'), 'workspace.json'); }
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }

async function ensureFile(file, fallback) {
  try { await fsp.access(file); } catch { await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify(fallback, null, 2), 'utf8'); }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return clone(fallback); }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(temp, file);
}

function parseDelimited(text) {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = (source.split('\n')[0].match(/\t/g) || []).length > (source.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  const records = []; let record = []; let cell = ''; let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]; const next = source[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { record.push(cell.trim()); cell = ''; continue; }
    if (char === '\n' && !quoted) { record.push(cell.trim()); if (record.some((v) => v !== '')) records.push(record); record = []; cell = ''; continue; }
    cell += char;
  }
  if (cell.length || record.length) { record.push(cell.trim()); if (record.some((v) => v !== '')) records.push(record); }
  if (!records.length) throw new Error('文件没有可读取的数据行');
  const headers = [...new Set(records[0].map((h, i) => h || `列${i + 1}`))];
  const rows = records.slice(1, 200001).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
  return { headers, rows, truncated: records.length - 1 > 200000, delimiter: delimiter === '\t' ? 'TSV' : 'CSV' };
}

async function readWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('工作簿没有工作表');
  const values = sheet.getSheetValues();
  const rowsRaw = values.slice(1).filter((row) => row.some((value) => value !== null && value !== undefined && value !== ''));
  if (!rowsRaw.length) throw new Error('工作表没有数据行');
  const rawHeaders = rowsRaw[0].map((value, i) => value === null || value === undefined || value === '' ? `列${i + 1}` : String(value));
  const headers = [...new Set(rawHeaders)];
  const rows = rowsRaw.slice(1, 200001).map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] === null || row[i] === undefined ? '' : String(row[i])])));
  return { headers, rows, truncated: rowsRaw.length - 1 > 200000, sheetName: sheet.name, format: 'XLSX' };
}

async function readDataFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = await fsp.stat(filePath);
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    const parsed = parseDelimited(await fsp.readFile(filePath, 'utf8'));
    return { ...parsed, kind: 'table', name: path.basename(filePath), path: filePath, size: stat.size };
  }
  if (ext === '.xlsx') {
    const parsed = await readWorkbook(filePath);
    return { ...parsed, kind: 'table', name: path.basename(filePath), path: filePath, size: stat.size };
  }
  if (ext === '.json') {
    const parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.rows) ? parsed.rows : []);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { kind: 'table', name: path.basename(filePath), path: filePath, size: stat.size, headers, rows, format: 'JSON' };
  }
  if (ext === '.pdf') return { kind: 'pdf', name: path.basename(filePath), path: filePath, size: stat.size };
  if (['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff'].includes(ext)) return { kind: 'image', name: path.basename(filePath), path: filePath, size: stat.size };
  return { kind: 'file', name: path.basename(filePath), path: filePath, size: stat.size };
}

function safeKeyPayload(settings) {
  const key = settings?.apiKey || '';
  if (!key) return null;
  if (safeStorage.isEncryptionAvailable()) return { encrypted: true, value: safeStorage.encryptString(key).toString('base64') };
  return { encrypted: false, value: key };
}

function publicSettings(settings) {
  return { endpoint: settings.endpoint || '', model: settings.model || 'gpt-4o-mini', temperature: Number(settings.temperature ?? 0.2), systemPrompt: settings.systemPrompt || '', hasApiKey: Boolean(settings.apiKey) };
}

async function getDecryptedKey(settings) {
  if (!settings?.apiKey) return '';
  if (settings.apiKey.encrypted && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(settings.apiKey.value, 'base64'));
  return settings.apiKey.value || '';
}

async function listKnowledge() {
  const dir = path.join(RESOURCES, 'knowledge');
  const files = [];
  async function walk(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(md|html|txt)$/i.test(entry.name)) files.push({ name: entry.name, relative: path.relative(RESOURCES, full).replace(/\\/g, '/'), size: (await fsp.stat(full)).size });
    }
  }
  try { await walk(dir); } catch { /* optional resources */ }
  return files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function vendorRoot() { return app.isPackaged ? path.join(process.resourcesPath, 'vendor') : path.join(RESOURCES, 'vendor'); }
function csvEscape(value) { const text = String(value ?? ''); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
async function listVendors() { const root = vendorRoot(); const items = [{ id: 'duckdb', name: 'DuckDB SQL', description: '本地分析型 SQL，可直接查询 CSV。', path: path.join(root, 'duckdb', 'duckdb.exe'), bundled: true }, { id: 'ocr', name: 'OCR 模型数据', description: '中英文 OCR 模型，供文档识别流程使用。', path: path.join(root, 'ocr', 'tessdata'), bundled: true }]; for (const item of items) { try { const stat = await fsp.stat(item.path); item.available = stat.isDirectory() ? (await fsp.readdir(item.path)).length > 0 : stat.size > 0; item.size = stat.isDirectory() ? null : stat.size; } catch { item.available = false; } } return items; }
function runExecutable(command, args, timeout = 30000) { return new Promise((resolve, reject) => { execFile(command, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => { if (error) reject(new Error(stderr || error.message)); else resolve({ stdout, stderr }); }); }); }
async function queryDuckDb(payload) { const root = vendorRoot(); const executable = path.join(root, 'duckdb', 'duckdb.exe'); try { await fsp.access(executable); } catch { throw new Error('未找到内置 DuckDB，请重新安装完整版本。'); } const sql = String(payload.sql || '').trim(); if (!sql) throw new Error('SQL 不能为空'); let source = payload.sourcePath; let tempDir = null; if (!source || !fs.existsSync(source) || !/\.(csv|tsv|txt)$/i.test(source)) { tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'auditdesk-sql-')); const file = path.join(tempDir, 'input.csv'); const headers = payload.headers || []; const lines = [headers.map(csvEscape).join(',')]; (payload.rows || []).slice(0, 200000).forEach((row) => lines.push(headers.map((header) => csvEscape(row[header])).join(','))); await fsp.writeFile(file, lines.join('\n'), 'utf8'); source = file; } const safeSource = source.replace(/'/g, "''"); const wrapped = `CREATE OR REPLACE TEMP VIEW audit_input AS SELECT * FROM read_csv_auto('${safeSource}', header=true); ${sql}`; const started = Date.now(); try { const result = await runExecutable(executable, [':memory:', '-json', '-c', wrapped], 60000); return { stdout: result.stdout, elapsedMs: Date.now() - started }; } finally { if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {}); } }

async function extractDocument(filePath) { const ext = path.extname(filePath).toLowerCase(); if (ext === '.pdf') { const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); const data = new Uint8Array(await fsp.readFile(filePath)); const document = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise; const pages = []; for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) { const page = await document.getPage(pageNumber); const content = await page.getTextContent(); pages.push(`--- 第 ${pageNumber} 页 ---\n${content.items.map((item) => item.str).join(' ')}`); } return { kind: 'pdf-text', text: pages.join('\n\n'), pages: document.numPages }; } if (['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff'].includes(ext)) { const worker = await Tesseract.createWorker(['eng', 'chi_sim'], 1, { langPath: path.join(vendorRoot(), 'ocr', 'tessdata'), cachePath: path.join(app.getPath('userData'), 'ocr-cache'), gzip: false }); try { const result = await worker.recognize(filePath); return { kind: 'ocr-text', text: result.data.text || '', confidence: result.data.confidence }; } finally { await worker.terminate(); } } throw new Error('当前仅支持 PDF 和图片文档提取'); }

function registerIpc(win) {
  ipcMain.handle('workspace:read', async () => { const file = workspacePath(); await ensureFile(file, DEFAULT_WORKSPACE); return readJson(file, DEFAULT_WORKSPACE); });
  ipcMain.handle('workspace:write', async (_event, value) => { await writeJson(workspacePath(), value); return true; });
  ipcMain.handle('settings:read', async () => { const file = settingsPath(); await ensureFile(file, {}); return publicSettings(await readJson(file, {})); });
  ipcMain.handle('settings:write', async (_event, incoming) => { const current = await readJson(settingsPath(), {}); const next = { ...current, endpoint: incoming.endpoint || '', model: incoming.model || 'gpt-4o-mini', temperature: Number(incoming.temperature ?? 0.2), systemPrompt: incoming.systemPrompt || '' }; if (incoming.apiKey !== undefined) next.apiKey = safeKeyPayload({ apiKey: incoming.apiKey }); await writeJson(settingsPath(), next); return publicSettings(next); });
  ipcMain.handle('file:open', async () => { const result = await dialog.showOpenDialog(win, { title: '导入审计数据', properties: ['openFile'], filters: [{ name: '审计数据', extensions: ['csv', 'tsv', 'xlsx', 'json', 'pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'] }, { name: '所有文件', extensions: ['*'] }] }); if (result.canceled || !result.filePaths[0]) return null; return readDataFile(result.filePaths[0]); });
  ipcMain.handle('document:extract', (_event, filePath) => extractDocument(String(filePath)));
  ipcMain.handle('file:save', async (_event, { defaultName, content, mime }) => { const result = await dialog.showSaveDialog(win, { title: '导出审计结果', defaultPath: path.join(app.getPath('documents'), defaultName || 'auditdesk-export.json'), filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'CSV', extensions: ['csv'] }, { name: '文本', extensions: ['txt'] }] }); if (result.canceled || !result.filePath) return null; await fsp.writeFile(result.filePath, content, 'utf8'); return result.filePath; });
  ipcMain.handle('knowledge:list', () => listKnowledge());
  ipcMain.handle('knowledge:read', async (_event, relative) => { const file = path.resolve(RESOURCES, String(relative)); if (!file.startsWith(RESOURCES)) throw new Error('路径不合法'); return { name: path.basename(file), content: await fsp.readFile(file, 'utf8') }; });
  ipcMain.handle('external:open', async (_event, url) => { if (!/^https?:\/\//i.test(String(url))) throw new Error('只允许打开 http/https 链接'); await shell.openExternal(String(url)); return true; });
  ipcMain.handle('shell:open-path', async (_event, target) => { const result = await shell.openPath(String(target)); if (result) throw new Error(result); return true; });
  ipcMain.handle('app:info', async () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch, userData: app.getPath('userData'), resources: RESOURCES, vendor: vendorRoot() }));
  ipcMain.handle('vendor:list', () => listVendors());
  ipcMain.handle('duckdb:query', (_event, payload) => queryDuckDb(payload));
  ipcMain.handle('api:ask', async (_event, payload) => {
    const settings = await readJson(settingsPath(), {});
    const key = await getDecryptedKey(settings);
    const endpoint = String(payload.endpoint || settings.endpoint || '').trim().replace(/\/$/, '');
    if (!endpoint) throw new Error('尚未配置 API Endpoint');
    const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: payload.model || settings.model || 'gpt-4o-mini', temperature: Number(payload.temperature ?? settings.temperature ?? 0.2), messages: payload.messages }) });
      if (!response.ok) throw new Error(`API ${response.status} ${response.statusText || ''}`.trim());
      const data = await response.json(); const text = data?.choices?.[0]?.message?.content || data?.output_text || data?.message?.content; if (!text) throw new Error('API 没有返回文本'); return String(text);
    } catch (error) { if (error.name === 'AbortError') throw new Error('API 请求超过 60 秒'); throw error; } finally { clearTimeout(timer); }
  });
}

async function createWindow() {
  const win = new BrowserWindow({ width: 1480, height: 940, minWidth: 1120, minHeight: 720, backgroundColor: '#f4f6f8', title: 'AuditDesk', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.loadFile(path.join(ROOT, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  registerIpc(win);
  return win;
}

app.whenReady().then(async () => { await ensureFile(workspacePath(), DEFAULT_WORKSPACE); await ensureFile(settingsPath(), {}); await createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
