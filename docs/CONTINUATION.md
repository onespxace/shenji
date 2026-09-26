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

## 2.2 第四批改动：凭证识别准确率

起因是用户反馈"识别凭证准确率不高"。**先量化再改，不猜。**

### 实测（`docs/OCR_QUALITY.md` 有完整数据与复现步骤）

建了 4 张带标准答案的测试图（扫描件 / 倾斜 / 低对比度 / 手机翻拍），每张 10 个必答字段：

| 尝试 | 结果 | 结论 |
| --- | --- | --- |
| 现状基线（tessdata_fast · PSM.AUTO） | **80.0%** | 基准 |
| 换 `4.0.0_best_int` 模型 | 80.0% | 持平，不换（要多背 4.5MB） |
| PSM 6 单一区块 | 50.0% | 差 30 个点，保持 AUTO |
| 2x 放大 / 灰度 / 对比度拉伸 | 72.5% → 62.5% | 更差 |
| 再加二值化 | 52.5% | 更差 |
| 分区二次识别（签名带 + 金额区） | 80.0% | 零收益 |

**手工前处理把准确率从 80% 打到 52%。** Tesseract 内部已做 Otsu 二值化，
先做一遍等于用更差的结果覆盖它；固定阈值还会抹掉抗锯齿、加粗表格线、干扰版面分析。
因此本项目**不引入任何图像前处理**，`prep-bench.mjs` 作为反例证据保留。

二次识别零收益的原因是失败模式不是"认错"而是"根本没认出来"——
翻拍图里表格正文整块丢失，没有可供纠正的候选文本。

### 实际采用的改动：让错的位置藏不住

实测里有一个可用信号：**整页置信度 90，但被认错的「王五」→「EA」只有 56。**
错字的词级置信度显著低于整页均值，也就是错的位置可以精确定位。

- 新增 `web/src/lib/ocr-quality.js`：识别前算清晰度（拉普拉斯方差）、对比度、
  亮度、倾斜角（投影剖面 ±6°），输出 good/warn/poor + 分数 + 原因 + 建议。
- `voucher-validator.js` 接入词级置信度：取字段匹配词的**最低**置信度，
  低于 78% 的字段由 `pass` **降级为 `warn`**，关键字段不可靠时
  **不允许给出「形式要素基本完整」**，最高只到「需要人工复核」。
- 界面新增画质提示块、「识别置信度偏低，请重点核对」区块、
  每条检查项的「识别 xx%」徽标。
- `voucher-validator.js` 返回值新增 `lowConfidenceFields` 与 `fieldConfidences`。

效果（同一张扫描件）：改进前报「形式要素基本完整」，
改进后报「需要人工复核」并指出 会计科目 67%、责任签名 56%。

### 过程中修掉的 3 个真实 bug

1. `estimateSkew` 用 `bin[...] < 128` 判断墨迹，但 `bin` 存的是 0/1，
   **背景像素也被计入**，投影剖面在任何角度都相同 → 倾斜检测完全失效。
2. `estimateSkew` 找到最优分数时只更新了 `score`，**从未更新 `deg`** → 返回值恒为 0。
3. `assessQuality` 读 `skew.best` 而 `estimateSkew` 返回的是 `skew.deg` → 读到 `undefined`。
   三个 bug 叠在一起，倾斜检测是彻底静默失效的。

### 两个设计决策的理由

- **取最低置信度而非平均**：签名字段实测值 90/90/56，取平均是 78.67 → 79，
  刚好越过阈值 78，**唯一的错字被平均抹掉了**。取最低就是 56，立刻暴露。
- **日期置信度必须用 `raw`**：日期被规范化成 `2024-05-03`，
  而 OCR 原样是 `2024年5月3日`，规范化之后再也匹配不到词级置信度。

### 验证

- 新增 `web/scripts/validate-ocr-quality.mjs`（20 条）：清晰度 / 对比度 / 倾斜 /
  小图 / 确定性 / 1x1 极小输入不崩。
- `validate-accounting` 从 35 条增至 46 条，新增 11 条覆盖逐字段置信度：
  低置信降级、关键字段不得判完整、阈值可调、无词级数据时不降级、
  全部高置信时才给「完整」。
- 基准脚本 `bench-ocr.mjs` / `run-ocr-bench.mjs` / `prep-bench.mjs` /
  `cmp-prep.mjs` / `cmp-twopass.mjs` 入库，工作目录 `web/.bench-ocr/`（34MB）已 gitignore。
- 现状：`npm run validate:all` = 8 + 46 + 20 + 28 + 20 + 167 = **289 条断言**，8 组全部通过。
- 浏览器真机验证：翻拍图判 `is-poor` 18 分并列出 3 条原因；扫描件判 `is-good` 82 分，
  整体结论从「形式要素基本完整」纠正为「需要人工复核」。

## 2.2 第五批改动：利润计算器与分录生成器

用户提供 6 张图：2 张利润公式、1 张会计恒等式、3 张《会计分录汇总》。

### 利润计算器（`web/src/lib/profit-calculator.js`）

按《利润的内容》与《会计 6 大要素之间的关系》实现。核心是把公式建成
**有向无环图**而不是一串 `if`：12 个底层输入 → 8 个公式节点，
`deps` 写明依赖，只填最底层数字就能一路推到净利润。

设计决定与理由：

- **缺依赖时返回 `incomplete` 而不是 0。** 漏填"主营业务税金及附加"却显示一个
  看起来精确的主营业务利润，是比报错更糟的结果。
- **金额不逐级舍入。** 内部保持浮点，只在展示时舍入一次，避免逐级累积误差
  把"公式是否成立"判错。
- **两条恒等式不能同时成立**，除非收入=费用——扩展式右边多了未结转的利润。
  断言里必须用两组数据分别验证，用一组数据期待两条都过是错的。
- **口径差异显式标注。** 原图把"投资净收益"放在利润总额层级（不进营业利润），
  与现行《企业会计准则》不同。忠实按原图实现，并在界面和 `note` 里说明，
  不擅自改口径。

### 分录生成器（`web/src/lib/journal-entries.js`）

覆盖 16 大类 40+ 项业务。三个关键设计：

1. **借贷方写科目代码而不是名称。** 断言校验每个代码都存在于 `ACCOUNT_ENTRIES`，
   杜绝"分录里出现图表外的科目"。明细科目（应交税费——应交增值税（销项税额））
   用 `sub` 挂在总科目下。
2. **备查式互斥组（`ALT_GROUPS`）。** 原图大量把"几种可能来源"并排列出，
   实际只发生一种。不标注的话界面会让人以为都要记，金额永远配不平。
   现在同组显示 `n/m` 计数，多选直接报错并列出当前选中的行。
   为此把 `prepay-balance`（补付/收回混在一张凭证里）拆成
   `prepay-topup` 与 `prepay-refund` 两条一对一规则。
3. **配不平就报错，不塞假数字。** 一对一业务金额自动落两侧；
   多行对单行时提示"金额只能落到一侧，另一侧需要你说明哪几行参与"。

### 修掉的原图疑似笔误

预付账款"收到货物"原图写作「应交税金——应交增值税/**销项税额**」，
收货取得的是**进项税额**。按正确会计处理实现，并在 `sourceNote` 里写明原图写法，
不照抄错账。小规模纳税人 3% 按原图举例但标注"征收率随政策变化，请核对当期"。

### 过程中修掉的 2 个真实 bug

1. `buildEntry` 一对一业务只把金额落在请求的那一侧，导致借贷不等却被标为已配平。
2. `ALT_GROUPS` 里三处 key 写错（`sub` 写成了 `note` 的内容），且有互斥组只含一行，
   会导致分组静默丢行。已由断言「互斥组引用的行都存在」「每个互斥组至少两行」守住。

### 验证

- 新增 `web/scripts/validate-profit-journal.mjs`：82 条断言
  （公式数值 8 项、依赖缺失、恒等式两组数据、亏损场景、千分位解析、
  分录自洽、借贷配平、互斥组、关键词匹配与误匹配防护）。
- 现状：`npm run validate:all` = 8 + 46 + 82 + 20 + 28 + 20 + 167 = **371 条断言**，9 组全部通过。
- 浏览器真机验证：利润计算器 8 步结果与人工核算逐项一致（净利润 1,032,300.00）；
  「收到股东投资款」默认全选时提示互斥组多选，取消勾选后自动配平为
  借 银行存款 300,000 / 贷 实收资本——投资者 300,000，差额 0.00。

## 2.2 第六批改动：凭证结构化识别引擎（PaddleOCR PP-OCRv5）

### 为什么换引擎

第五批只做"逐字段置信度标注"，没有提高平均准确率。当时的结论是"Tesseract 已到能力上限"，
这个结论没错，但**路线定义错了**：瓶颈不在参数，而在"整页 OCR + 正则猜列"这个范式本身。
用户指出应直接换到 `@paddleocr/paddleocr-js`（PP-OCRv5 mobile，det 4.62MB + rec 15.93MB），
并把路线定为"凭证专用视觉解析器"。

### 先验证再动手

没有直接写管线，先写 `paddle-probe.html` 验证三件事：能不能在浏览器跑、要多久、准不准。
结果：初始化 3992 ms，A-scan 10/10 / 1.64s，D-photo 10/10 / 1.57s。
**Tesseract 在 D-photo 只有 5/10。** 确认路线可行后才开始建。

### 实测结果

| 方案 | 字段命中 | 平均耗时 |
| --- | --- | --- |
| 基线：Tesseract 整页 + 正则（原实现） | 65.0%（26/40） | 479 ms |
| 新管线：PP-OCRv5 + 结构化解析 | **97.5%（39/40）** | 2780 ms |

手机翻拍 50% → 100%；摘要 0/4 → 4/4；明细科目 0/4 → 4/4；责任签名 0/4 → 4/4。
**借方金额 4/4 → 3/4 是真实回归**（低对比度图列边界误判），已记录未修。

### 架构（`web/src/ocr/`）

- `engines/engine-registry.js` 引擎契约 + 几何工具。**引擎只输出"带坐标的文本行"，不做字段解析**
- `engines/paddle-engine.js` PP-OCRv5，`import()` 动态加载
- `engines/tesseract-engine.js` 保留为 fallback 与 benchmark 基线
- `pipeline/field-extractor.js` 行聚类 → 表头锚点 → 列角色 → 字段
- `pipeline/credential-pipeline.js` 编排 + 定向重识别
- `validators/field-validators.js` 日期/编号/金额/科目字典
- `validators/signature.js` 签名只判存在性
- `confidence/reliability.js` 字段级可靠度
- `benchmark/` 测试集、评分口径、实测记录

### 修掉的 10 个真实 bug

抽取与锚点：
1. 列归属用"中心点在表头宽度内"判定 →「摘要」表头 2 字宽、单元格 7 字宽，**摘要列 4 张图全抽空**。改为按左边缘 + 下一表头边界
2. `NEXT_LABEL` 里放了「张」，导致 `制单：张三` 在「张」处被截断，制单人为空
3. 附件锚点正则 `/附件\s*[:：]?\s*\d/` 把数字一起吃掉，只剩「张」
4. 签名锚点用纯字符串 `记账` 匹配，把标题 `记账凭证` 当成签名栏，凭空读出叫「凭证」的签名
5. 抽取值未去前导冒号，`凭证编号` 得到 `：记字001号 附件：2张`
6. `validateVoucherNumber` 未剥栏位标签，返回 `凭证编号记字001号`

可靠度模型：
7. 缺 OCR 置信度时该子分被整个剔除，**得分反而变高**（0.95 → 可靠）。方向反了
8. 「不适用」（制单人无上下文约束）与「未知」未区分，制单人被无谓扣到 82%
9. 形近科目只降 dictionary 权重不够，加权后仍达 0.90 被标"可靠"。加硬封顶
10. 签名判定用 `^[一-龥·]{2,4}$` 套整串，多签名位拼成 `李四 王五` 时被误判为非人名

基准口径（两处，已写进文档避免后人重踩）：
- 基线不能用新抽取器打分：词级碎片化本就不适配按坐标聚行，会人为压低基线到 37.5%
- "整体数值相等"与"全部 needle 命中"必须分开：日期 needle 是 `['2024','5','3']` 三段，
  混入数值相等口径后日期与附件张数整片判错

### 签名任务重新定义

依据 PP-OCRv5 官方对手写中文约 41.7% 的评测，签名只做 `present` / `absent` / `uncertain`
三态检测，界面固定显示"不构成身份证明"。永不出现 `签名：王五（确认）`。

### 隐私与体积

- 模型自托管 `public/ocr/paddle/`（20.55 MB），`npm run sync:paddle` 拉取，不入库
- 用户图片不上传；仅 ORT wasm 走 jsDelivr（只下运行时）
- 引擎动态 import，22 MB 运行时拆为独立 chunk，主包只 +80 KB
- GitHub Pages 纯静态部署不变，原有审计功能未改动

### 验证

新增 `npm run validate:ocr-pipeline`（123 条）：几何工具、行聚类、字段抽取
（含"单元格宽于表头"回归）、日期/编号/金额/科目校验、签名三态、
可靠度评分（含封顶与去重）、基准口径。

`npm run validate:all` = 8 + 46 + 82 + 123 + 20 + 28 + 20 + 167 = **494 条断言**，10 组全通过。

浏览器真机验证：A-scan 逐字段面板整体 92%「可靠」，
`建行基本戶`（PP-OCRv5 输出繁体戶）被字典约束判为 47%「需要人工复核」并拒绝自动改写。
## 2.2 第八批：修部署事故 —— 模型入库 + 失败可降级

### 事故经过

第六批把 PaddleOCR 模型接进 `prebuild` 的 `npm run sync:paddle`。
该脚本从 `paddle-model-ecology.bj.bcebos.com` 拉取 20.55MB 模型。

推上去后 **CI 26 秒就挂了**（此前成功构建需 35~40 秒），
`https://onespxace.github.io/shenji/` 连续 9 分钟仍是旧 bundle。

**根因：把整站可用性绑在了一个第三方 CDN 上。** runner 拉不到模型 →
`sync-paddle-assets.mjs` 抛错 → `prebuild` 失败 → `build` 失败 → `deploy` 被跳过。
站点直接瘫在旧版本上。

这是本次改动引入的真实风险，不是配置疏漏。

### 修法（三层）

1. **模型入库**：20.55MB 的 `.tar` 随仓库提交到 `web/public/ocr/paddle/`。
   CI 不再依赖任何外部模型源。`.gitignore` 改为
   `web/public/ocr/*` + `!web/public/ocr/paddle/`；
   tessdata（17.6MB，本地可从 `node_modules` 生成）仍然不入库。
2. **脚本失败可降级**：`sync-paddle-assets.mjs` 默认拉不到只警告并 `exit 0`，
   站点照常部署，凭证识别回退 Tesseract。本地排障可加 `--strict` 恢复严格模式。
3. **工作流不阻断**：新增 `Ensure PaddleOCR models (non-blocking)` 步骤，
   `continue-on-error: true`，仅作兜底自愈。

另外在**引擎与界面**也做了降级：
`paddleModelStatus()` 在初始化前用 `HEAD` 探测模型是否随站点部署；
缺失时抛 `code = PADDLE_MODELS_MISSING` 的明确错误，
而不是让用户等 4 秒后看一堆 WASM 报错。界面提示
"可改用 Tesseract 继续，准确率较低但可用"，并给一键切换按钮。

### 模型获取

通过本机代理 `127.0.0.1:7897` 从官方源拉取，**9 秒完成**（2.1~2.3 MB/s）：

| 模型 | 大小 | 校验 |
| --- | --- | --- |
| PP-OCRv5_mobile_det | 4,843,520 B | 与官方一致，未压缩 ustar |
| PP-OCRv5_mobile_rec | 16,701,440 B | 同上 |

`tar -tf` 确认含 `inference.onnx` + `inference.yml`（PaddleOCR.js 不解 `.tar.gz`）。

### 顺带修掉的 2 个 bug

1. **`assessImage` 未导入**。质量闸门挂在 `try/catch` 里，
   `TypeError: assessImage is not a function` 被当成"评估失败"吞掉，
   闸门永远不显示。症状是"选图后没有提示"，排查时先看 console 才定位到。
   现在额外加了一道 `typeof assessImage !== 'function'` 的显式抛错 + `console.warn`，
   避免再次静默。
2. **`qualityOverride` 重复声明**导致构建失败。

### 质量闸门前移（验收项，此前漏实现）

要求是"在 OCR 开始前就检测，不合格就不要直接 OCR"。上一批只在 OCR 跑完后
显示闸门，等于形同虚设。本次补上：

- 选图后**立即**评估，不等 OCR
- `poor` 时拦下 OCR，提示"继续识别可能造成字段缺失"
- 给出**「重新拍摄」与「仍要继续识别」**两个显式选择，不再默默识别

### 真机验证（最难的 D-photo 翻拍图）

- 选图即判 **18 分**，列出 3 条原因（模糊 / 对比度不足 / 过曝），OCR 被拦住
- 选择「仍要继续识别」后：整体 **90%**
  - 借方金额、贷方金额、日期、凭证编号、摘要、总账科目 均「可靠」
  - 明细科目 `建行基本户` **45%「需要人工复核」**（字典外，**未自动改写**）
  - 签名单列一栏「存在签名」，并注明不构成身份证明

### 代价

仓库体积从约 54MB 增至约 75MB（+20.55MB 模型）。
这是为"部署确定性"付的费用：宁可仓库大一点，也不能让整站被一个 CDN 拖下线。

## 2.2 第九批（正式版）：修缺陷 + 利润导出 + 分录重做 + 全量验证

用户要求：修掉影响使用的缺陷 → 利润计算提供导出表格且不出错 → 分录生成重做并优化体验 →
验证各功能可行性、准备正式版。完整说明见 `docs/RELEASE_2.2.md` 与 `docs/HANDOVER.md` §10。

### 修掉的 7 个真实缺陷

1. 利润缺项计数重复累加下游公式（全空显示"缺 20 项"，输入项只有 12 个）。
2. 缺项提示直接吐内部 id（界面显示"缺：mainTax"），未做中文名映射。
3. **未填金额时分录却显示"已配平"**（全空时差额确实为 0 被判 balanced）。
4. 「收到货款」在两条规则间同分并列，谁标题字典序靠前谁当选 = 随机结果。
5. 备查式分录默认全选，一填金额就报"多选一"；现金支出漏标互斥组。
6. 盘点表差异出现 `0.30000000000000004`。
7. 所有 CSV 导出都没有公式注入防护，且 `\r` 未转义。

其中 3、4、5 属于"看着在正常工作、其实结论是错的"，最容易被漏掉。

### 利润计算器导出表格

新增 `web/src/lib/csv-export.js`：RFC 4180 转义、CRLF、UTF-8 BOM、公式注入防护。
关键细节：**负数不能被误伤**——`-1234.50` 加 `'` 前缀会变成文本，金额列就再也算不了，
所以只对"以 `-` 开头且不是合法数字"的文本加防护；金额导出为**不带千分位**的两位小数
（带千分位 Excel 会当文本）。导出**计算过程**（12 输入项 + 8 步骤 + 2 恒等式 + 口径提示），
未填项导出为空值而不是 0。

### 分录生成重做

自然语言金额提取（`30 万` / `1.5万元` / `￥300,000.00`）、歧义并列提示、
**每行独立填金额**（一行对多行必须能拆）、「自动补差额」、「恢复推荐组合」、
四态状态标签、大类标签 + 关键词搜索、复制分录、导出表格。

匹配质量实测：38 句自然语言 0 无匹配、0 假歧义；16 条快捷入口全部唯一命中。
只输入科目名（如"原材料"）时明确报并列，不再替用户选。

### 验证工具与两条老问题的真相

新增 `browser-probe.mjs`（真实 Chromium 行为探针，含**真实下载并读回校验**）、
`run-html-probe.mjs`（跑三个 HTML 探针页）、`validate-csv-export.mjs`（40 条）、
`scenarios/`。`validate-summary.mjs` 支持受限环境降级，并区分"跑不了"与"没通过"。

**此前两条"浏览器断言拿不到干净结果"查明都是断言写错，与产品无关：**

- 懒加载探针把同一视图的 `.css` 当成第二次 chunk 请求 → 断言恒假。
- 路由探针在 iframe `load` 之前操作 → hash 变更与初始导航合并，`history.length` 停在 1；
  另有一条恒真断言（`typeof x !== 'undefined' || true`）。

### 现状

- 版本 `2.2.0`；界面文案「AuditDesk · 2.2」。
- 静态断言 **664 条 / 11 组，0 失败**。
- 浏览器行为 **66 条**（29 交互 + 11 视口 + 11 懒加载 + 15 路由），控制台 **0 错误**。
- 首屏 gzip 396.8 KB（`main` 单文件 256.7 KB），与上一版持平。