# AuditDesk 部署到 GitHub Pages

项目已经生成两套部署文件：

## 方案 A：GitHub Actions 自动部署（推荐）

仓库中已创建：

```text
.github/workflows/pages.yml
```

推送到 `main` 或 `master` 分支后，GitHub Actions 会自动：

1. 安装 `web/` 依赖；
2. 运行 `npm run validate:all`（8 组检查，共 518 条断言：工具样例 / 会计与凭证 /
   拍摄质量 / Markdown / 教学用例 / PPT 渲染 / 字号下限 / 无 BOM）；
3. 构建 Vue 静态站点；
4. 发布 `web/dist/` 到 GitHub Pages。

首次使用：

1. 将整个项目推送到 GitHub 仓库；
2. 打开仓库 **Settings → Pages**；
3. 在 **Build and deployment → Source** 选择 **GitHub Actions**；
4. 等待 `Deploy AuditDesk Web to GitHub Pages` 完成。

## 方案 B：手动上传静态文件

已生成可直接上传的目录：

```text
github-pages/
```

该目录是 `web/dist/` 的完整副本，包含：

```text
github-pages/
├─ index.html
├─ deck.html
├─ assets/
├─ ocr/
├─ samples/
├─ robots.txt
└─ .nojekyll
```

可以将 `github-pages/` 内的**全部内容**上传到 GitHub Pages 的发布分支或静态托管目录。也可以直接使用已生成的压缩包：

```text
AuditDesk-GitHub-Pages.zip
```

不要只上传 `index.html`，否则 JS 和 CSS 资源会丢失。

## 本地重新生成部署文件

```powershell
cd D:\AIvibe\web
npm run sync:ocr
npm run validate:all
npm run build
npm run export:pages
```

重新生成的文件会写入：

```text
D:\AIvibe\github-pages
```

也可以在项目根目录执行：

```powershell
npm run web:sync-ocr
npm run web:validate
npm run web:build
```

## 说明

- Vite 已设置 `base: './'`，支持 GitHub Pages 子目录，例如 `https://用户名.github.io/仓库名/`。
- Ollama 需要访问用户本机的 `http://localhost:11434`，GitHub Pages 公网环境通常无法直连。
- DeepSeek、Gemini 和自定义 API Key 保存在访问者浏览器的 localStorage 中，不会写入 GitHub 仓库。
- GitHub Pages 是静态托管，不能替代 API 后端代理；如果需要隐藏 API Key，应在服务端增加代理。
- 会计基础页的 OCR 模型和 Tesseract core 位于 `web/public/ocr/`，会随站点发布，但只有用户点击识别时才加载；凭证图片不会上传。
