# AuditDesk · 财经审计工作台

> 面向审计学生、内审人员和审计实务人员的 Windows 本地桌面应用。
> 重点是高频审计程序和证据链，而不是聊天式 AI 产品。

## 核心模块

AuditDesk 内置七个确定性审计程序：

1. **A01 现金与银行**：余额勾稽、重复流水、账面与银行差异；
2. **A02 收入与截止**：期末窗口、发票 / 发货 / 入账日期、重复收入；
3. **A03 采购与付款**：PO—验收—发票三单匹配、重复发票、资料缺口；
4. **A04 存货与盘点**：数量滚动、延伸金额、负数 / 零成本；
5. **A05 费用与报销**：重复费用、票据缺口、整数金额和事由；
6. **A06 薪酬与工资**：应发重算、员工主数据、重复员工和负实发；
7. **A07 凭证与异常**：借贷平衡、重复分录指纹、大额和关键词分录。

底稿与证据模块独立于程序运行结果，用于记录来源、状态、复核、问题和导出。

## 设计原则

- **确定性优先**：程序规则透明、参数可解释、结果可复现；
- **证据优先**：异常只是待复核线索，不自动变成舞弊或错报结论；
- **本地优先**：原始文件不上传，工作区状态保存在 Electron `userData`；
- **少而精**：主界面以项目、数据、程序、底稿和资料为主，研究助手是可选模块；
- **专业边界**：不提供审计意见、税务意见、自动舞弊定性或自动过账。

## 使用方式

### Vue 网页版

项目同时提供一个独立的 Vue 3 审计工作台，适合快速试用和 GitHub Pages 部署：

```powershell
cd D:\AIvibe
npm run web:dev
```

打开终端显示的地址即可。生产构建：

```powershell
npm run web:build
```

构建产物在 `web\dist\`，Vue 页面使用相对资源路径，可部署到 GitHub Pages 子目录。网页版的原始台账仍只在浏览器内处理；Ollama 需要本机服务可访问。

网页版设置页支持 DeepSeek、Gemini、Ollama 和自定义 OpenAI 兼容接口。DeepSeek 使用官方 `https://api.deepseek.com`，Gemini 使用官方 OpenAI Compatibility 地址 `https://generativelanguage.googleapis.com/v1beta/openai`；API Key 仅保存在浏览器本机。

### 桌面版开发运行

```powershell
cd D:\AIvibe
npm install
npm start
```

### Windows 便携版

```powershell
npm run pack:win
```

输出目录：

```text
release\AuditDesk-1.0.0-portable.exe
```

这是单文件 Windows 便携版，大小约 595 MB，低于 700 MB。直接双击即可运行，不需要 Node.js 或 Python。应用会包含 Electron 运行时、桌面界面、学习资料、示例数据、SQL 工作台和可选本地工具资源。

## 内置资源

- `resources/knowledge/`：审计工作标准、货币资金、收入、采购、存货、费用、薪酬、凭证、底稿、字段字典和学习路线；
- `resources/samples/`：七个模块的合成示例 CSV，仅用于熟悉字段和规则；
- `resources/vendor/duckdb/duckdb.exe`：本地分析型 SQL CLI，MIT License；
- `resources/vendor/ocr/tessdata/`：英文和简体中文 OCR 模型数据，可供后续文档流程使用；
- `src/`：桌面界面和确定性检查逻辑；
- `electron/`：窗口、文件、工作区、API 和本地工具桥接。

## API 助手

在“项目设置 → 研究助手 API”中填写 OpenAI-compatible Chat Completions：

```text
Endpoint: http://127.0.0.1:11434/v1
Model:    你的本地模型
API Key:  本地无鉴权服务可留空
```

API Key 使用 Electron `safeStorage` 保存。研究助手只用于资料整理和方法讨论，不参与计算，不会自动修改底稿结论。生产环境建议使用自己的后端代理。

## 数据和安全

- 支持 CSV、TSV、XLSX、JSON；
- 原始文件只读，程序只读取当前工作副本；
- 普通界面不显示完整工资账户等敏感字段；
- API 请求由主进程发起，密钥不写入前端代码；
- 建议每个项目使用独立目录，保留源文件、导入批次、规则参数、结果和复核记录；
- 导出的工作区 JSON 可能包含项目信息，分发前应脱敏。

## 体积策略

桌面版使用原生 HTML / CSS / JavaScript + Electron；独立网页版使用 Vue 3 + Vite + Element Plus。桌面便携版目标控制在 **300–700 MB**；Electron 运行时和本地 DuckDB / OCR 资源占主要体积，避免加入无用途的装饰资源。网页版构建体积与桌面版无关。

## 下一步生产化

- SQLite / DuckDB 项目数据库和版本化导入批次；
- 规则包版本、随机种子和可重复运行记录；
- PDF / OFD 页码级证据定位；
- Excel 底稿模板和复核签核；
- Windows Credential Manager / DPAPI；
- 多人协作、权限、审计日志和项目备份恢复。
