# AuditDesk Web 2.1.0 稳定备份

- 备份日期：2026-09-26
- 备份范围：Vue 网页版源码、GitHub Pages 工作流、可部署静态文件和使用说明
- 排除：web/node_modules、Electron elease 构建产物
- 恢复方式：将本目录中的 web 覆盖回项目根目录的 web，并按需恢复 .github、github-pages 和 docs

## 基线验证

- 
pm run web:validate：8/8 工具样例通过
- 
pm run web:build：生产构建通过
- 
pm run web:export：GitHub Pages 文件生成通过
