# AuditDesk Web 2.2 开发计划

开发版本：`2.2.0-dev.0`  
启动日期：2026-09-26  
稳定基线：`2.1.0`

## 稳定基线备份

- 目录：`backups/auditdesk-web-2.1.0-20260926/`
- 压缩包：`backups/auditdesk-web-2.1.0-20260926.zip`
- SHA-256 清单：`backups/auditdesk-web-2.1.0-20260926/checksums.sha256`
- 备份不包含 `node_modules` 和 Electron `release` 构建产物。

## 2.1 基线能力

- Vue 3 + Vite + Element Plus 企业工作台
- 顶部液态玻璃导航，无左侧栏
- CSV / TSV / TXT 导入与 8 个确定性审计程序
- 4 类底稿文书、准则速查、AI 对话
- DeepSeek、Gemini、Ollama、自定义 OpenAI 兼容接口
- 8/8 工具样例自动验证
- GitHub Actions 自动部署与可上传静态文件

## 2.2 质量门槛

每个功能合入前必须保持：

```powershell
npm run web:validate
npm run web:build
```

涉及部署时还需执行：

```powershell
npm run web:export
```

要求：

- 不把 API Key、样例数据或用户数据写入仓库；
- 审计异常仍然只作为待复核线索，不自动形成结论；
- 新工具必须有确定性样例和自动化断言；
- 桌面版与网页版边界保持清晰，不混合打包依赖。

## 2.2 已启动

- 会计基础页已加入 89 个常用科目、六大科目分类识别、会计六要素/三表/税率/利润公式问答。
- 凭证页已加入本地 Tesseract OCR、10 项形式要素检查（含大写金额交叉校验）、借贷平衡和 7 项不可验证事项清单。
- `npm run validate:all` 当前通过 8/8 工具样例 + 31 个会计基础/凭证断言。

## 待确认的 2.2 方向

1. 审计程序扩展：银行流水、收入截止、采购三单、存货计价等更完整规则；
2. 项目与底稿管理：本地项目、复核状态、批量导出和底稿归档；
3. 资料增强：PDF/OFD 导入、知识库检索、准则原文和学习路径；
4. AI 增强：多模型比较、证据引用、结构化底稿草稿；
5. 部署增强：离线缓存/PWA、版本发布页、自动化回归报告。

## 回滚

如 2.2 开发需要回退到稳定基线，优先使用 `backups/auditdesk-web-2.1.0-20260926/` 恢复 `web` 目录；恢复前先保留当前 2.2 工作目录。
