# AuditDesk 继续开发记录

更新时间：2026-09-26

## 当前状态

- 已完全移除旧版 PWA 界面，改为 Electron Windows 桌面应用。
- 主界面采用中性、简洁、工作台式布局，减少装饰和 AI 风格。
- 应用名称：AuditDesk。
- 当前版本：1.0.0。
- 当前工作目录：`D:\AIvibe`。

## 已完成

### 桌面应用

- `electron/main.js`：窗口、文件导入、工作区、API 代理、PDF/OCR、DuckDB SQL、safeStorage。
- `electron/preload.js`：安全 IPC 桥接。
- `src/index.html`、`src/styles.css`、`src/renderer.js`：完整桌面界面。
- `AuditDesk.bat`：从项目目录启动便携版。

### 高频审计程序

- A01 现金与银行
- A02 收入与截止
- A03 采购与付款
- A04 存货与盘点
- A05 费用与报销
- A06 薪酬与工资
- A07 凭证与异常

程序使用确定性规则，输出待复核线索，不自动生成审计结论。

### 内置资源和工具

- `resources/knowledge/`：12 份中文审计学习资料。
- `resources/samples/`：CSV 示例数据和发票 PDF 示例。
- `resources/vendor/duckdb/duckdb.exe`：本地 SQL 引擎，约 37 MB，MIT License。
- `resources/vendor/ocr/tessdata/`：英文 / 简体中文 OCR 模型数据。
- PDF 文本提取和图片 OCR 已接入主进程。
- API 助手作为次级可选功能，不参与审计计算。

## 已验证

- `node --check electron/main.js` 通过。
- `node --check electron/preload.js` 通过。
- `node --check src/renderer.js` 通过。
- 浏览器渲染测试通过：七个程序、样例运行、源数据预览、资料页面和设置页面。
- Electron 打包测试通过：本地 CSV 读取、七个程序样例运行、知识资料读取、DuckDB SQL 查询、PDF 文本提取均已通过 CDP 手动验收。
- DuckDB 查询示例：`SELECT COUNT(*) AS n FROM audit_input;` 返回正确结果。
- OCR 本地模型已用英文测试图验证。
- 测试用 API、任务和用户数据已清理。

## 构建产物

当前保留：

```text
release/AuditDesk-1.0.0-portable.exe
```

大小约：

```text
595.67 MB
```

满足用户要求的 300–700 MB 范围。另有临时构建目录和压缩包：

```text
release/win-unpacked/
release/AuditDesk-1.0.0-win-x64.zip
```

为了下次继续开发暂时没有删除 `node_modules`；如果要制作最终交付目录，下一步可以删除 `node_modules`、`release/win-unpacked` 和压缩包，只保留便携版，使整个项目目录控制在约 640 MB。

## 继续开发命令

```powershell
cd D:\AIvibe
npm install
npm start
```

重新打包：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
npx electron-builder --win portable --x64 --config.compression=store
```

## 建议的下一步

1. 把真实项目模板、字段映射和规则版本做成 JSON 配置包；
2. 增加 Excel 底稿模板导出和复核签核；
3. 增加项目数据库、导入批次和文件 SHA-256；
4. 对 XLS / 旧式文件增加明确兼容策略；
5. 做一次安装到非开发环境的 Windows 机器验收；
6. 最后清理开发依赖和重复构建目录，只保留 `release/AuditDesk-1.0.0-portable.exe`。

## 已知事项

- `exceljs` 依赖链存在 npm audit 的 moderate 级 `uuid` 报告，目前没有 high / critical；当前代码未调用受影响的 buffer API，但生产版应继续评估替代方案。
- 某些第三方 API、PDF 和 OCR 能力需要网络、跨域或额外运行时；主审计程序不依赖网络。

## 2026-09-25 Vue 网页版改版

用户要求重新排版并将网页界面迁移到 Vue，已完成 `web/` 独立 Vue 3 + Vite + Element Plus 应用：

- `web/src/App.vue`：新的企业工作台壳层、顶部玻璃导航、移动端横向导航、页面头部和使用说明。
- `web/src/views/AnalysisView.vue`：CSV/TXT 导入、拖拽、示例数据、8 个确定性审计程序、指标卡、结果表和 CSV 下载。
- `web/src/views/DocumentsView.vue`：4 类底稿的 Vue 状态表单、动态行、借贷合计、实时预览和打印。
- `web/src/views/KnowledgeView.vue`：准则/实务分类、搜索和关键程序展开。
- `web/src/views/ChatView.vue`：多会话、快捷提问、DeepSeek/Ollama/自定义接口流式问答。
- `web/src/views/SettingsView.vue`：服务商配置、连接测试、Ollama 模型查询/下载/删除/切换。
- `web/src/lib/ai-service.js`：Vue 响应式 AI 状态、流式请求和 localStorage 持久化。
- `web/src/styles.css`：新的中性、专业、响应式视觉系统；打印时隐藏编辑控件。
- `web/src/lib/audit-data.js`、`web/src/lib/audit-tools.js`：继续复用原有 `data.js` / `tools.js`，避免重复实现分析规则。

验证：

- `npm run build` 通过，产物在 `web/dist/`，使用相对资源路径，适合 GitHub Pages 子目录部署。
- 浏览器实际交互验证：5 个视图、示例数据、8 个分析程序、文书动态行/借贷平衡、法规列表、AI/设置页均能渲染；控制台无错误。
- 生产预览 Lighthouse：Accessibility / Best Practices / SEO 均为 1.0；`web/dist/` 已生成并带 `robots.txt`。
- 根目录新增 `npm run web:dev`、`npm run web:build`、`npm run web:preview`。
- 旧版 Electron 代码与 `web/` 旧入口文件保留，当前 Vue 入口不加载旧 DOM 渲染脚本。

## 2026-09-25 视觉二次调整

- 按用户要求移除左侧栏，改为顶部横向导航；桌面端和移动端均不再占用侧边空间。
- 配色改为浅雾蓝、玻璃白、钴蓝和少量青绿色，配合背景渐变光晕。
- 移除了品牌下方的重复面包屑文字，顶部栏只保留品牌、导航和操作按钮。
- 卡片、顶部栏、弹层和对话区域统一使用半透明背景、模糊、细边框和柔和阴影，形成液态玻璃质感。
- 保留原有 5 个视图、8 个分析程序、底稿、法规、AI 和设置功能不变。

## 2026-09-25 API 与样例验证更新

- 按 DeepSeek 官方文档更新接入：Base URL 使用 `https://api.deepseek.com`，模型迁移为 `deepseek-flash` / `deepseek-v4-pro`，增加 `thinking` 与 `reasoning_effort` 配置。
- 按 Google 官方 OpenAI Compatibility 文档新增 Gemini：Base URL `https://generativelanguage.googleapis.com/v1beta/openai`，默认模型 `gemini-3.8-flash`，支持 API Key、模型和推理强度配置。
- 新增 `web/src/lib/api-config.js` 集中维护官方地址、模型和文档链接；旧版 `deepseek-chat` / `deepseek-reasoner` 配置自动迁移。
- 新增 `web/src/lib/sample-validation.js`、`web/public/samples/audit-tool-demo.csv` 和 `npm run web:validate`，8 个工具样例验证全部通过。
- 数据分析页新增“验证全部工具”和“下载样例 CSV”入口。
- 2.2 新增“会计基础”页：89 个常用科目、六大类识别、会计基础问答、本地中文 OCR 和凭证形式检查。
- 新增 `web/src/lib/accounting-data.js`、`web/src/lib/ocr.js`、`web/src/lib/voucher-validator.js` 和 `AccountingView.vue`。
- `npm run validate:all` 当前通过 8/8 工具样例和 31 个会计基础/凭证断言；OCR 资源在 `web/public/ocr/`，图片不上传。
- 凭证检查增加大写金额与阿拉伯数字交叉校验、中文大写金额解析和 0 张附件合法判定。
- 静态导出站点已在本地 HTTP 服务上完成真实中文 OCR 验证（置信度 81%），资源路径全部 200。
- DeepSeek 和 Gemini 均用模拟 SSE 响应验证了请求地址、Bearer 鉴权、模型名和流式解析；未使用真实 API Key。

## 2026-09-25 GitHub Pages 部署文件

- 新增 `.github/workflows/pages.yml`：推送到 `main` 后自动验证样例、构建并发布 Pages。
- 新增 `web/scripts/export-pages.mjs` 和 `npm run web:export`，生成可直接上传的 `github-pages/`。
- 已生成 `AuditDesk-GitHub-Pages.zip`（约 397 KB），包含 `index.html`、`assets/`、样例 CSV、`robots.txt` 和 `.nojekyll`。
- 使用 `base: './'`，支持 GitHub Pages 仓库子目录路径。

## 2026-09-26 稳定备份与 2.2 启动

- 已将网页版 2.1.0 备份到 `backups/auditdesk-web-2.1.0-20260926/`，并生成同名 ZIP 和 SHA-256 清单。
- 备份包含 Vue 源码、GitHub Pages 工作流、静态部署文件、样例与部署文档，不包含 `node_modules` 和 Electron `release`。
- `web/package.json` 与 lockfile 已切换到 `2.2.0-dev.0`，稳定界面版本文案暂不改动。
- 新增 `docs/NEXT_VERSION.md`，记录 2.2 基线、质量门槛、候选方向和回滚方式。

## 2.2 界面可读性与移动端改版

- **字号重设计**：按 WCAG 1.4.4 / 1.4.12、W3C Design System 与 Major Second 阶梯重建字号体系，128 条遗留 `px` 声明迁移为 `rem`，全局不再有小于 12px 的文字。新增 `web/scripts/migrate-typography.mjs`（幂等，带下限断言）。规范记录见 `docs/UI_DESIGN_SPEC.md`。
- **徽标替换**：换成郑州工商学院审计学本科2501班徽标，裁切为圆形透明 PNG（64/128/256），并作为 favicon。生成脚本 `web/scripts/make-brand-assets.mjs`。
- **去除重复按钮**：凭证完整性检查与数据分析页的拖拽区原本“整区可点 + 内嵌选择文件按钮”重复，现合并为单一入口，并补齐键盘可达性（`role="button"` + Enter/Space）。
- **AI 问答重做**：新增零依赖 Markdown 渲染器 `web/src/lib/markdown.js`（先转义再解析，链接仅放行 http/https/mailto），改为 768px 限宽全宽消息流、深色代码块、带表头底色的表格、单条复制、自动增高输入框。断言见 `web/scripts/validate-markdown.mjs`（28 条）。
- **移动端重排**：820px 及以下改用底部标签栏 + “更多”底部面板，隐藏英文 eyebrow 与装饰标签，表格横向滚动限制在容器内，聊天页会话列表改抽屉。验证工具 `web/mobile-check.html` 在 360/390/430/768px 下实测无横向溢出。
- **验证现状**：`npm run validate:all` = 8/8 工具 + 31/31 会计凭证 + 28/28 Markdown + 字号下限断言，全部通过。

## 网页版使用教程与功能 PPT

- **使用教程与用例**（应用内）：顶部导航新增「使用教程」页，含快速上手、用例演示、
  功能导览与常见问题四个标签。10 个用例可「载入并运行」，会直接跳到对应页面并执行。
- **功能介绍 PPT**（`/deck.html`）：14 页网页式演示文稿，覆盖痛点、定位、模块、
  技术规范、质量保障与部署。键盘翻页、总览模式、全屏演示、手机滑动，
  打印可导出为一页一张的 PDF。
- **用例库** `web/src/lib/showcase.js`：每个用例自带样例数据、审计目标、准则依据
  与可验证的预期结果，由 `npm run validate:showcase` 校验，文档与行为不会脱节。
- **多页构建**：`vite.config.js` 改为 `rollupOptions.input` 双入口，
  `export-pages.mjs` 增加入口文件守卫，缺少 index.html 或 deck.html 时直接失败。

## 2.2 第三批改动：教学与展示

- 新增 `web/src/views/TutorialView.vue`、`web/deck.html`、`web/src/deck/`（slides / render / deck.css）。
- `render.js` 把幻灯片 HTML 构建抽为纯函数，`validate-deck.mjs` 对**渲染结果**做断言。
  起因是数据层有标题、渲染层却未输出，导致 14 页里 13 页没有标题——
  只检查数据字段的断言无法发现这类问题。
- 修正 PPT 舞台居中方式：舞台固定 1280px 宽于窄屏时，
  grid/flex 居中会被安全对齐钳到起点，缩放后整体偏出视口；改为绝对定位 + translate 居中。
- **修复 10 个文件的 UTF-8 BOM**：PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写 BOM，
  导致 PostCSS 配置加载失败、构建中断。新增 `web/scripts/fix-bom.mjs` 检测并清除，
  并接入 `validate:all` 防止复发。
- 移动端底部标签重新排序为 数据分析 / 会计基础 / AI 问答 / 教程 + 更多，
  底稿文书、法规速查、设置收进「更多」面板，保持每格足够宽。
- 验证现状：`npm run validate:all` = 8 + 35 + 28 + 20 + 167 条断言 + 字号与编码全量扫描，
  共 7 组检查全部通过。
