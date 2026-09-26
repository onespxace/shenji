# AuditDesk Vue 3 审计工作台

当前开发版本：`2.2.0-dev.0`；最近稳定基线：`2.1.0`。

基于 Vue 3、Vite 和 Element Plus 的本地优先审计工具。界面参考成熟企业后台的信息层级和结果表格模式；分析算法复用项目原有的确定性实现。

## 开发

```bash
cd web
npm install
npm run dev
```

打开终端显示的地址即可。根目录也可以直接运行：

```bash
npm run web:dev
```

## 构建与部署

```bash
cd web
npm run build
npm run preview
```

构建产物位于 `web/dist/`。`vite.config.js` 使用 `base: './'`，因此可以部署到 GitHub Pages 仓库的子目录。推荐用 GitHub Actions 发布 `web/dist`，不要把 `web/node_modules` 提交到仓库。项目根目录还提供 `.github/workflows/pages.yml`、可上传的 `github-pages/` 目录和 `AuditDesk-GitHub-Pages.zip`。

验证 8 个审计工具、会计科目识别、凭证检查和 Markdown 渲染的本地样例：

```powershell
npm run validate:all
```

样例台账文件位于 `public/samples/audit-tool-demo.csv`，也可以在数据分析页直接载入。

## 功能

- **数据分析**：CSV/TSV/TXT 导入、UTF-8/GBK 识别、拖拽、示例数据。
- **8 个确定性程序**：本福特定律、重复检查、断号检查、账龄分析、分层汇总、审计抽样、凭证筛查、试算平衡。
- **结果留存**：指标卡、异常线索、明细表、完整结果 CSV 下载；抽样记录随机种子。
- **底稿文书**：银行询证函、往来款询证函、存货监盘表、审计调整汇总表；动态行、借贷合计、打印版式。
- **法规速查**：审计准则与高频实务指引离线搜索。
- **AI 问答**：DeepSeek、Gemini、Ollama、本地模型分档推荐/下载/删除/切换、自定义 OpenAI 兼容接口、流式回复、多会话。
- **会计基础**：89 个常用科目、六大类识别、会计六要素/三表/增值税/利润公式问答。
- **凭证检查**：本地中文 OCR、凭证日期/编号/摘要/科目/借贷平衡/大写金额/附件/签名共 10 项检查，并单独列示 7 项不可由 OCR 判断的事项。
- **样例验证**：内置 8 个审计工具、31 个会计基础/凭证断言和 28 个 Markdown 渲染断言，可一键执行 `npm run validate:all` 或在页面验证。
- **AI 问答**：Markdown 渲染（标题/列表/表格/代码块/引用）、768px 限宽消息流、单条复制、自动增高输入框。
- **响应式**：桌面顶部导航；手机端改为底部标签栏 + “更多”面板，隐藏装饰性元素，表格横向滚动不撑破页面。
- **徽标**：`src/assets/brand/emblem-*.png`，由 `npm run make:brand` 从原始徽标裁切生成，同时作为站点 favicon。

## API 接入

设置页的配置已按官方文档同步（核对日期：2026-09-25）：

- **DeepSeek**：`https://api.deepseek.com`，模型 `deepseek-flash` / `deepseek-v4-pro`，支持 `thinking` 和 `reasoning_effort`。
- **Gemini**：使用官方 OpenAI Compatibility 地址 `https://generativelanguage.googleapis.com/v1beta/openai`，默认模型 `gemini-3.8-flash`。
- **Ollama**：本机 `http://localhost:11434`，继续支持模型查询、下载和切换。
- **自定义接口**：其他 OpenAI Chat Completions 兼容服务。

API Key 只保存在当前浏览器 localStorage。生产环境建议通过后端代理保存密钥，并注意 GitHub Pages 的跨域限制。

凭证 OCR 资源位于 `public/ocr/`，首次识别会加载本地中文和英文模型；图片不会上传。OCR 结果必须人工校对，页面会把签名真伪、涂改、附件真实性和业务实质列为“不可由工具判断”。`npm run sync:ocr` 会从 `node_modules` 和 `resources/vendor/ocr` 重新同步这些二进制资源。



界面采用 DeepSeek 官网式留白与克制配色，改为“顶部玻璃导航 + 工作区卡片 + 结果表格”结构；交互和组件基于 Element Plus，并加入半透明、模糊、渐变光晕等液态玻璃质感。整体参考 Ant Design Pro、Vue Vben Admin 等开源后台的信息层级，不复制第三方项目的业务代码或品牌资源。

- Vue 3 + Vite + Element Plus + Element Plus Icons（MIT 开源依赖）。
- 原有 `data.js`、`tools.js` 继续作为资料和分析引擎来源，避免重复实现已验证的规则。
- Vue 负责状态、组件和交互；分析结果仍由确定性规则计算，异常只作为待复核线索。
- 原始台账默认只在浏览器内存中处理；API Key、对话和设置保存在当前浏览器 localStorage。
- Ollama 需要本机服务可访问。GitHub Pages 等公网 HTTPS 页面通常无法直接连接 `http://localhost`，设置页会显示该限制。

> 审计准则速查内容仅用于学习和检索，执业请以正式准则原文、事务所政策及实际证据为准。
