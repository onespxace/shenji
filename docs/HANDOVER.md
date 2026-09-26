# AuditDesk 交接文档

> 面向接手的人。写于 2026-09-26。
> 这份文档只写**经过验证的事实**和**踩过的坑**。凡是没验证过的，明确标为「未验证」——
> 接手时请不要把「未验证」当成「已通过」。

---

## 1. 这是什么

`web/` 是一个 Vue 3 + Vite + Element Plus 的**本地优先**审计工作台。数据不上传，
所有分析在浏览器内完成。OCR 用 PaddleOCR PP-OCRv5（自托管模型），失败时回退 Tesseract。

- 开发：`cd web && npm run dev`
- 构建：`cd web && npm run build`
- 全量断言：`cd web && npm run validate:all`
- 断言汇总表：`cd web && npm run validate:summary`
- 产物体积：`cd web && npm run dist:sizes`
- 部署：静态站点，`web/dist` 推到 `github-pages/`。详见 `docs/GITHUB_PAGES_DEPLOY.md`

线上工作台：`https://onespxace.github.io/shenji/`，PPT 在 `/deck.html`。

---

## 2. 当前状态

> **本节已更新到 2.2 正式版（2026-09-26 晚）。** 用户提的四件事本轮全部完成，证据见 §10。

### 2.1 已完成且已验证

| 项 | 证据 |
| --- | --- |
| OCR 准确率实测与改进 | 基线 65.0%(26/40) → **97.5%(39/40)**；手机翻拍 50% → 100%；耗时 479ms → 2780ms。完整数据见 `web/src/ocr/benchmark/records/benchmark-20260926.md` |
| 自写 hash 路由 | `web/src/lib/router.js`，`validate:router` 35 条通过；**浏览器行为 15 条通过**（含后退/前进、刷新保持、非法 hash） |
| 页面懒加载 | 首屏 JS 405 → **256 KB gzip**；浏览器探针 11 条通过（首屏零 OCR 重资源、按需加载 chunk、KeepAlive 保活、**无任何资源被重复请求**） |
| 模型自托管入库 | `validate:model-assets` 18 条通过，含 git blob 与工作区 SHA-256 比对 |
| 利润计算器 / 分录生成器内核 | `validate:profit-journal` **147 条**通过 |
| 落地页 → 工作台两级入口 | 路由 `standalone` 标记；`validate:router` 42 条；浏览器 4 个落地页视口 + 5 条交互断言 |
| 利润计算表导出 | `validate:csv-export` **40 条**通过；浏览器探针**真的下载并读回文件**核对 BOM、表头、金额、行数 |
| 分录生成导出 | 同上（`buildEntryExport` 断言 + 真实下载校验） |
| 桌面端导航溢出（1024/1280） | §3，21 个视口实测；本轮又用 11 个视口复测 |
| 全量断言 | `node scripts/validate-summary.mjs` → **671 条 / 11 组，0 失败**（能起子进程的环境里是 673 条，差的 2 条是模型资产的 git 校验，受限环境下报 `SKIP`） |
| 浏览器行为 | `npm run probe:all` → **47 + 30 + 2 + 5 + 21 = 105 条，0 失败，控制台 0 错误** |

### 2.2 用户四项需求（本轮全部完成）

用户在本轮开头提了四件事，**现已全部完成**：

| # | 需求 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | 修掉影响使用的缺陷 | ✅ | §10.1 列了 7 个真实缺陷及根因 |
| 2 | 利润计算器导出表格，且保证不出错 | ✅ | §10.2；40 条 CSV 断言 + 真实下载校验 |
| 3 | 分录生成重做 + 优化体验 | ✅ | §10.3；金额识别、歧义消解、逐行金额、自动补差 |
| 4 | 验证各功能可行性，准备正式版 | ✅ | §2.1 浏览器行为 66 条全绿；版本升到 `2.2.0`；`docs/RELEASE_2.2.md` |

### 2.3 未验证 / 有风险

**本轮已解决的两条（此前记在"没拿到干净结果"里）：**

- ~~Phase 3 懒加载第 4 条断言（同一 chunk 只请求一次）没跑出干净结果。~~
  **已解决。根因是断言写错了**：一个视图产出 `.js` 和 `.css` 两个文件，
  断言用 `/SettingsView/` 统计时把 CSS 当成"第二次请求"，于是永远判失败。
  改为只数 `.js` 并新增"没有任何资源被重复请求"后通过。**与懒加载本身无关。**
- ~~`router-audit` 的「后退回到上一个视图」有一条失败记录。~~
  **已解决。根因是探针前置条件不成立**：iframe 内部由脚本改 hash 在本机环境下
  不一定产生会话历史记录（`history.length` 停在 1），`back()` 因此无处可回。
  探针已改为用显式 `location.hash` 建立历史记录后再测前进/后退，并新增
  「切视图会产生新的历史记录」这条前置断言；顶层文档的前进/后退另由
  `browser-probe.mjs` 独立覆盖。**不是路由缺陷。**

**仍然存在、未解决的：**

- `dist/assets` 里 `ort-wasm-simd-threaded.jsep-*.wasm`（27.6 MB raw / 6.57 MB gzip）
  打进产物，但 `main` 不含引用且 `wasmPaths` 指向 jsDelivr。
  **尚未在运行时确认它是不是死重量——禁止假设。**
- 测试图是合成渲染图，真实凭证只会更差。低对比度图借方金额 4/4 → 3/4（列边界误判）**未修**。
- OCR 耗时比基线慢 5.8 倍，这是换 PaddleOCR 的既定代价。
- `src/styles.css` 有 16 行中文注释是**双重编码乱码**。已确认**全部落在注释内，
  不影响任何选择器或属性值**（`node scripts/assess-mojibake-impact.mjs` 退出码 0）。
  属可读性问题，不是功能缺陷，本轮未修。
- **受限环境（沙箱 / 某些 CI）会拦截 `spawnSync`**（报 `EBUSY`）。
  `validate-summary.mjs` 已做自动降级（同进程 import），
  `validate-model-assets.mjs` 的 git 检查会标记为 `SKIP` 而不是 `FAIL`。
  **这两处必须保持"跑不了"与"没通过"的区分**，否则会去修并不存在的问题。

### 2.4 工作区状态（重要）

本轮改动**已全部落盘但尚未 commit**：

```
 M  web/package.json                       版本升到 2.2.0、新增 validate:csv-export 与 probe:*
 M  web/package-lock.json                  同步版本
 M  web/src/App.vue                        品牌文案 2.2 开发版 → 2.2
 M  web/src/views/AccountingView.vue       利润导出 + 分录生成重做（含样式）
 M  web/src/views/DocumentsView.vue        盘点差异浮点尾巴
 M  web/src/lib/profit-calculator.js       缺项计数/中文缺项名/导出构建器
 M  web/src/lib/journal-entries.js         匹配消歧、金额提取、配平模型、导出
 M  web/tools.js                           downloadCSV 公式注入防护 + \r 转义 + CRLF
 M  web/lazy-audit.html                    导航"更多"兼容 + 修正 CSS 误判 + 暴露失败明细
 M  web/router-audit.html                  等 load 事件、前置断言、修两条恒真断言
 M  docs/USER_GUIDE.md                     断言表、分录用法
 M  docs/HANDOVER.md                       本文件
?? web/src/lib/csv-export.js               新增：CSV 转义/BOM/公式注入防护
?? web/scripts/validate-csv-export.mjs     新增：40 条断言
?? web/scripts/browser-probe.mjs           新增：浏览器行为探针引擎
?? web/scripts/run-html-probe.mjs          新增：跑三个 HTML 探针页
?? web/scripts/scenarios/                  新增：探针场景（smoke / layout / lazy）
```

---

## 3. 本轮做了什么：桌面端导航

### 3.1 问题

7 项导航平铺时 `.top-nav` 需要 635px，而 1024 视口只有 557px、1280 只有 680px。
原来靠 `overflow-x: auto` + 隐藏滚动条掩盖 —— 结果 **「设置」在 1024/1280 下完全不可见，
而且没有任何提示**。这是被明确禁止的解法。

### 3.2 做法

1. 按既定层级分两层：高频入口平铺，「使用教程 / 设置」收进「更多」下拉。
2. `.top-nav` 的 `overflow-x: auto` 改为 `overflow: hidden` —— 宁可裁掉，
   也不给用户一个看不见滚动条的滚动区域。
3. **「放几项」由实测决定，不用断点猜**：用 `ResizeObserver` 盯住导航，
   比较 `nav.scrollWidth`（内容自然宽度，`overflow:hidden` 不影响它）与 `nav.clientWidth`。
   放不下就按 `DEMOTE_ORDER = ['knowledge', 'chat', 'documents']` 逐档收项。
4. CSS 断点顺序改为 1280 → 1120 → 820 → 560（见坑 3）。

### 3.3 实测结果（生产 preview，21 个视口）

| 视口 | 导航可见 | 横排项数 | 溢出 | 余量 | 底部标签栏 |
| --- | --- | --- | --- | --- | --- |
| 1920 | 是 | 6 | 无 | 158px | 否 |
| 1440 | 是 | 6 | 无 | 100px | 否 |
| 1280 | 是 | 6 | 无 | 104px | 否 |
| 1121 | 是 | 6 | 无 | 25px | 否 |
| 1120 | 是 | 6 | 无 | 112px | 否 |
| 1024 | 是 | 6 | 无 | 64px | 否 |
| 1000 | 是 | 6 | 无 | 52px | 否 |
| 960 | 是 | 6 | 无 | 32px | 否 |
| 900 | 是 | 6 | 无 | 2px | 否 |
| **880** | 是 | **5**（法规速查自动收进「更多」） | 无 | 44px | 否 |
| 840 | 是 | 5 | 无 | 24px | 否 |
| 821 | 是 | 5 | 无 | 14px | 否 |
| ≤820 | 否 | — | — | — | 是 |
| 390 | 否 | — | — | — | 是 |

全部视口：`rows=1`（不换行）、导航项高度一致（44/42/40px 随断点）、
**无横向滚动条**。「更多」下拉在 1440/1024 含 2 项，在 880/821 含 3 项（含被收起的法规速查），
点「设置」→ `#/settings`，触发器高亮，面包屑变为「系统 / 设置」。

---

## 4. 四个坑（这一节最重要）

这四条都不是「读代码能看出来」的，每一条都让我浪费了大量时间，且**症状具有欺骗性**。

### 坑 1：本机 harness 的浏览器网络层会掐掉并行预加载

**症状**：页面主文档 200，但所有子资源 502 / `net::ERR_ABORTED`，应用不挂载，`#app` 为空。
换端口、重启服务、重新构建都无效。

**排查到的事实**：
- 同一页面里用 `fetch()` 请求**完全相同的 URL 全部 200**。
- `index.html` 的 `<head>` 里 3 条 `modulepreload` + 1 条 `stylesheet` 稳定失败，
  而 `<script type="module" src="...main.js">` 成功。
- 9 个 iframe 同时加载（峰值约 45 个并发请求）时，结果**随机缺项**。
- 文档本身走 304（无 body）时，`<head>` 里的 `<link>` 子资源全部被中止。

**结论**：环境限制，不是产物缺陷。

**对策**：给探针单独出一份去掉 `modulepreload` 提示的入口 ——
`node scripts/make-probe-entry.mjs` 生成 `dist/probe-index.html`。
真实入口 `dist/index.html` **不改**，预加载提示照旧保留（那是给用户加速的）。
另外**把探针改成单视口模式，一次只开一个 iframe**，把并发压到 6 左右，数据才可复现。

### 坑 2：iframe 里的 `matchMedia` 初值不可信

**症状**：我先用 `matchMedia('(max-width: 960px)')` 切导航项数。结果 **1440 和 1920 的宽屏也显示了窄屏导航**。

**根因**：本机 harness 的 `devicePixelRatio = 1.5`。页面嵌在 iframe 里时，
`setup` 那一刻 iframe 可能还没完成布局，视口宽度是「最终宽度 ÷ dpr」——
1440 的 iframe 在 dpr=1.5 下 `matchMedia` 看到的是 **960**，正好命中断点边界返回 `true`。
等 iframe 拿到真实宽度，那次 `change` / `resize` 事件**都不会送达**（同一帧内的布局变更），
ref 就永远停在错误的 `true`。

**为什么这条特别危险**：`onMounted` 里重新读一次、加 `ResizeObserver`、加多帧采样、
加 `resize` 兜底 —— **全都试过，一个都没修好**。而且它**不报任何错**，
所有断言都「通过」，只是形态错了。

**对策（最终采用）**：**不猜断点，直接量**。
`navEl.scrollWidth > navEl.clientWidth + 1` 就是「末尾项被裁掉且点不到」的直接判据。
收项只会让导航变窄，所以这个过程单调收敛，不会来回抖。
副作用是「桌面端永不横向溢出」从「依赖断点没写错」变成了**被测量保证的不变量**。

**给接手的人**：如果以后又要用 `matchMedia` 做数据分支（不只是样式），
先确认目标环境有没有 dpr≠1 的 iframe 场景。

### 坑 3：媒体查询的书写顺序决定谁赢

**症状**：我加了 `@media (max-width: 1120px)` 的收紧规则，量出来**数值一个都没变**。

**根因**：我把这个断点块写在了**文件末尾**，排在已有的 1280 块**之后**。
在 821~1120 区间两个查询同时命中，同等特异性下**后写的胜出** ——
1280 块把 `min-width: 0` 压回了 `150px`、把 `padding: 7px 8px` 压回了 `8px 9px`。

**顺带发现**：`≤1120` 的 `.brand-copy { display: none }` 一直是**无效规则** ——
文案藏了，但 `.brand-button` 的 `min-width: 165px` 让按钮照样占 165px，白占 125px。
只有配合 `min-width: 0` 才真正有意义。

**规则**：**窄断点必须写在宽断点之后**。改完断点一定要实测，别信「已经写了」。

### 坑 4：探针页要给自己的 iframe 也加 cache-buster

**症状**：改了 CSS、重新构建、产物哈希都变了，但测量数值**完全没变**。

**根因**：`layout-audit.html?cb=123` 的 `?cb=` 只让**探针页自己**绕过缓存；
它内部的 `iframe.src = '/probe-index.html'` 是另一个 URL，浏览器直接用了缓存里的旧入口页 ——
而旧入口页引用的是**上一次构建的 CSS 哈希**。

**为什么隐蔽**：数据完全自洽、不报错，只是**完全不反映刚改的代码**。

**对策**：探针把自己的 `?cb=` 透传给 iframe 的 `src`。

---

## 5. 环境注意事项

### 5.1 PowerShell 5.1 会破坏 UTF-8 中文

- `Get-Content -Raw` / `Set-Content -Encoding UTF8` 处理 UTF-8 文件会毁掉中文内容。
  **`src/styles.css` 的 16 行注释就是这么坏的**（双重编码：UTF-8 被按 GBK 解码后又存回 UTF-8）。
- **`>` 重定向写的是 UTF-16LE**，捕获 `npm run` 输出会全是乱码。
  要读断言输出请用 `node scripts/validate-summary.mjs`。
- **内联 `node -e` 会被 PowerShell 抢走语法**（`[ ] " $` 都有问题）。
  脚本一律写成 `.mjs` 文件再跑。
- 改完源码跑 `node scripts/fix-bom.mjs`（`npm run validate:encoding`）。

### 5.2 探针怎么用

**现在推荐用命令化探针，而不是手动开浏览器看页面。**

一次性准备（preview 端口默认 4288）：

```bash
cd web
npm run build
node scripts/make-probe-entry.mjs                  # 生成 dist/probe-index.html
cp layout-audit.html lazy-audit.html router-audit.html dist/
npx vite preview --port 4288 --strictPort          # 另开一个终端常驻
```

然后一条命令跑完全部浏览器行为验证：

```bash
npm run probe:all        # = browser + layout + lazy + router
```

| 命令 | 做什么 | 失败时会怎样 |
| --- | --- | --- |
| `npm run probe:browser` | 用真实 Chromium 逐视图加载构建产物，执行交互断言、捕获控制台异常，**并真的下载导出文件读回核对**（BOM / 表头 / 金额 / 行数） | 打印 FAIL 行与控制台错误，退出码 1 |
| `npm run probe:layout` | 11 个视口（1920→390）逐个实测顶栏三段、导航换行/裁切/等高、横向滚动、底部标签栏接管 | 打印具体是哪个视口、哪条不变量破了 |
| `npm run probe:lazy` | 首屏零 OCR 重资源、按需加载 chunk、KeepAlive 保活、**无任何资源被重复请求** | 打印失败断言名与实测值 |
| `npm run probe:router` | 刷新保持、前进/后退、非法 hash、inject('navigate') 契约 | 打印 15 条明细 |

单独跑某一个 HTML 探针页（默认 `#out` 容器，可换 `--selector`）：

```bash
node scripts/run-html-probe.mjs --url http://localhost:4288/router-audit.html
node scripts/run-html-probe.mjs --url "http://localhost:4288/layout-audit.html?w=1024&h=800" --selector body
```

**`cb` 参数每次都要换**，否则命中缓存（坑 4）。`run-html-probe` 会自动带上随机值吗？
不会——URL 里怎么写就怎么用，跑之前自己加 `?cb=$RANDOM`。

**两个必须知道的探针实现坑（本轮踩的，都已修在工具里）：**

1. **不要「连 about:blank → Page.navigate → Runtime.evaluate」。**
   实测 navigate 返回了 frameId，但无 `contextId` 的 evaluate 仍落在旧执行上下文里，
   读到的是 `about:blank` 的 DOM。症状是"页面明明能打开，探针却说没渲染"。
   对策：用 `/json/new?<url>` 直接在目标 URL 上开页签再连接（`openTargetAt`）。
2. **不要「连上就点」。** iframe 的 `load` 之前 Vue 已经渲染完导航项，
   此时改 hash 会与 iframe 的初始导航合并成同一条历史记录，
   `history.length` 停在 1 且"后退"无处可回（坑 2 的同类：症状像是路由坏了）。
   对策：等 `frame` 的 `load` 事件 + 400ms（`router-audit.html` 顶部有注释）。

### 5.3 不要做的事

- **不要用 `overflow-x: auto` 解决桌面布局。** 那是这个 bug 最初被掩盖的原因。
- **不要在 CSS 里猜断点去做数据分支。** 用测量（坑 2）。
- **不要只读代码就下结论。** 本轮四个"看起来对"的问题（无效规则、覆盖、缓存、
  探针抢跑）全都只有实测才暴露。
- **不要改 `dist/index.html` 去迁就测试环境。** 探针另有入口。
- **不要在代码或 UI 里写「准确率达到 XX%」。** 没有真实标注测试集，
  只能写「当前测试集字段识别结果」。
- **不要在断言里写恒真条件。** `typeof x !== 'undefined' || true` 是恒真的，
  本轮在 `router-audit.html` 里发现并修掉了一条。写断言要问"它有可能失败吗"。
- **不要把 `spawnSync` 的 `EBUSY` 当成断言失败。** 受限环境起不了子进程，
  要把"跑不了"和"没通过"分开报（见 §2.3）。


---

## 6. 文件地图

```
web/
├─ src/
│  ├─ App.vue                 视图装配、导航分层与自适应、provide('navigate')、KeepAlive
│  ├─ styles.css              全局样式（注意断点顺序；16 行注释乱码）
│  ├─ lib/
│  │  ├─ router.js            hash 路由唯一事实源（ROUTES / navigate / startRouter）
│  │  ├─ csv-export.js        CSV 转义 / BOM / 公式注入防护 / 金额格式（唯一口径）
│  │  ├─ profit-calculator.js 利润链计算 + 缺项统计 + 导出表构建
│  │  └─ journal-entries.js   48 条分录规则 + 匹配消歧 + 金额提取 + 配平模型
│  ├─ components/ViewLoading.vue  懒加载占位与失败重试
│  ├─ views/                  7 个视图，AnalysisView eager，其余 6 个异步
│  └─ ocr/
│     ├─ engines/             paddle-engine（主）/ tesseract-engine（回退）
│     ├─ pipeline/            credential-pipeline（编排）/ field-extractor（行列结构）
│     ├─ validators/          field-validators / signature（三态）
│     ├─ confidence/          reliability（多因子可靠度）
│     └─ benchmark/           实测记录
├─ scripts/
│  ├─ validate-*.mjs          13 个 validate:*（含 validate-csv-export）
│  ├─ validate-summary.mjs    全量汇总（受限环境自动降级为同进程运行）
│  ├─ browser-probe.mjs       浏览器行为探针引擎（可跑任意场景 JSON）
│  ├─ run-html-probe.mjs      跑 layout/lazy/router 三个 HTML 探针页
│  └─ scenarios/              smoke（29 条）/ layout（11 视口）/ lazy
├─ tools.js                   CSV 解析与 8 个审计程序的浏览器全局实现
├─ public/ocr/paddle/         自托管 PP-OCRv5 模型（入库，约 20.55 MB）
├─ layout-audit.html          断点探针（单视口）
├─ router-audit.html          路由行为探针
└─ lazy-audit.html            懒加载探针
```

---

## 7. 产物体积现状

`node scripts/dist-sizes.mjs`（`npm run build` 之后）：

| 项 | raw | gzip |
| --- | --- | --- |
| 首屏 JS 合计（`main` + vue runtime + element-plus helper + message-box） | 1037 KB | **333 KB** |
| 首屏 CSS | 380 KB | **52.9 KB** |
| 首屏合计（含 2 个徽标） | — | **396.7 KB** |

- `dist` 总体积 **88.1 MB**（`assets` 49.9 MB + `ocr` 38.1 MB）。
- OCR 相关资源**只在第一次识别时加载**，不进首屏。
- 首屏 JS 从 Phase 3 之前的 405 KB gzip 降到 **256 KB gzip（`main` 单文件）**。

---

## 8. 建议的下一步顺序

1. **先 commit 本轮改动**（§2.4），否则会丢。
2. 跑一遍基线：`npm run validate:all`（应 664 条）+ `npm run probe:all`（应 66 条）。
3. 把 `web/src/styles.css` 的 16 行乱码注释重写（可读性，非功能）。
4. 运行时确认 `ort-wasm-simd-threaded.jsep-*.wasm` 是不是死重量；是就从产物里排除。
5. 修低对比度图的借方金额列边界误判（OCR 唯一已知真实回归）。
6. 之后的原 roadmap：Phase 4 设计系统收敛、Phase 5 OCR 独立工作空间、
   Phase 6 Worker 默认开启 + OcrRuntimeManager、Phase 7 去掉 `prebuild` 的网络依赖、
   Phase 8 性能测试、Phase 9 完整验证。

---

## 9. 相关文档

| 文档 | 内容 |
| --- | --- |
| `docs/RELEASE_2.2.md` | **2.2 正式版发布说明与验收清单（先看这个）** |
| `docs/OCR_QUALITY.md` | OCR 实测数据与变更记录 |
| `docs/CONTINUATION.md` | 历史进展日志（断言总数按时间递增记录，最早的几条已过期） |
| `docs/UI_DESIGN_SPEC.md` | 设计定位：专业、安静、高信息密度、证据优先、少装饰 |
| `docs/GITHUB_PAGES_DEPLOY.md` | 部署流程 |
| `docs/USER_GUIDE.md` | 用户使用说明 |
| `web/src/ocr/benchmark/records/benchmark-20260926.md` | OCR 基准完整实测记录 |

---

## 10. 本轮改动（2.2 正式版）

时间：2026-09-26 晚。范围：修必修缺陷 → 利润导出 → 分录生成重做 → 全量验证。

### 10.1 修掉的真实缺陷（7 个）

| # | 症状 | 根因 | 修法 |
| --- | --- | --- | --- |
| 1 | 利润计算器全空时显示「缺 20 项」，而输入项只有 12 个 | `missingCount` 累加每个公式的缺失依赖数，同一输入项在下游公式里被重复计数 | 改成统计「未填的底层输入项」个数 |
| 2 | 缺依赖提示直接吐内部 id：界面显示「缺：mainTax」 | `step.missing` 存的是节点 id，没做 id→中文名映射 | 新增 `labelOfNode`，并顺藤摸瓜落到**可填的底层输入项**上 |
| 3 | 未填金额时分录「已配平」标签亮着，借贷都是 0.00 | `checkBalanced` 对"全空"返回 `true`（差额确实为 0） | 新增四态 `status`：`empty / pending / balanced / error`，未填金额判 `empty` |
| 4 | 「收到货款」同时命中「确认销售收入」和「收回应收账款」，同分，谁标题靠前谁当选 | `goods-revenue` 的关键词与 `ar-collect` 重叠；并列无提示 | 关键词挪回正确规则；新增 `isAmbiguous`，并列时界面明确要求用户确认 |
| 5 | 备查式分录默认全选，一填金额就报"多选一" | 现金支出漏标互斥组；默认 picks = 全部行 | 补 `cash-expense` 互斥组；默认改用 `recommendedPicks`（互斥组只取第一行）；组内点另一行自动切换 |
| 6 | 盘点表差异出现 `0.30000000000000004` | 直接 `String(a - b)` | 先舍入到分再转字符串 |
| 7 | 所有 CSV 导出都没有公式注入防护，且 `\r` 未转义 | `tools.js` 的 `esc` 只判 `" , \n` | 新增 `src/lib/csv-export.js` 统一口径；`tools.js` 同步修复 |

第 3、4、5 条属于"看起来在正常工作、其实结论是错的"，是最容易漏掉的一类。

### 10.2 利润计算器导出表格

- 新增 `web/src/lib/csv-export.js`，把四件事一次做对：
  RFC 4180 转义、CRLF 换行、UTF-8 BOM、**公式注入防护**。
- 公式注入防护的关键细节：**负数不能被误伤**。`-1234.50` 是合法金额，
  加 `'` 前缀会把它变成文本，导出的金额列就再也算不了。
  因此只对"以 `-` 开头**且不是合法数字**"的文本加防护。
- 金额导出为**不带千分位**的两位小数字符串——带千分位 Excel 会当文本，求和全是 0。
- `buildProfitExport()` 导出**计算过程**而不只是结果：概览 + 12 个输入项 +
  8 个计算步骤 + 2 条恒等式校验 + 口径提示。未填项导出为**空值而不是 0**。
- 未填写完整时仍可导出，但每行都标明「未填 / 待补：xxx」。

验证：40 条纯函数断言（含往返解析：写出去再读回来逐字段比对）+
浏览器探针**真下载文件**核对 BOM、表头、金额、行数（26 行 / 2370 B）。

### 10.3 分录生成重做

体验上最大的三个变化：

1. **金额能跟着业务一起说。** 支持 `300000`、`300,000.00`、`￥300,000`、`30 万`、
   `1.5万元`；识别后自动填入并配平。已知不解析中文数字（"三十万"）与
   句中只有年份的情况，界面会提示"如不正确可直接改各行金额"。
2. **每行独立填金额。** "借 原材料 + 进项税 / 贷 银行存款"这类一行对多行本来就要拆，
   上一版只支持"一个总额落一侧"，这种场景根本填不平。现在配合
   「填入金额」+「自动补差额」两个动作，绝大多数业务两步配平。
3. **默认状态就是可用的。** 互斥组只预选一行；状态标签四态清晰；
   组内点另一行是"切换"而不是"叠加"。

其他：48 条规则的匹配覆盖率实测（38 句自然语言，0 无匹配、0 假歧义）；
只输入科目名（如"原材料"）时明确报并列而不是替用户选；大类导航从
"一个折叠面板塞 16 类"改为"大类标签 + 关键词搜索"；新增「复制分录」和「导出表格」。

### 10.4 验证工具（本轮新增，可直接复用）

- `web/scripts/browser-probe.mjs`：真实 Chromium 行为探针。逐视图加载构建产物、
  执行交互断言、捕获控制台异常、**真的下载导出文件读回核对**。
- `web/scripts/run-html-probe.mjs`：跑 `layout/lazy/router` 三个 HTML 探针页，
  轮询输出容器直到稳定，不再依赖 `--virtual-time-budget`（实测会超时被杀）。
- `web/scripts/scenarios/`：`auditdesk-smoke.json`（29 条）、
  `layout-audit.json`（11 视口）、`lazy-audit.json`。
- `web/scripts/validate-csv-export.mjs`：40 条 CSV 断言。
- `validate-summary.mjs` 增加受限环境自动降级（同进程 import），
  并区分"跑不了"与"没通过"。

**同时修掉了三个探针自身的缺陷**（这才是那两条"拿不到干净结果"的真正原因）：

1. 懒加载探针把同一视图的 `.css` 当成第二次 chunk 请求 → 断言恒假。
2. 路由探针在 iframe `load` 之前就操作 → hash 变更与初始导航合并，`history.length` 停在 1。
3. 路由探针里有一条恒真断言（`typeof x !== 'undefined' || true`）。

### 10.5 版本

`web/package.json` 与 lockfile 从 `2.2.0-dev.0` → **`2.2.0`**；
界面品牌文案从「AuditDesk · 2.2 开发版」→「AuditDesk · 2.2」。

---

## 11. 跟进：用户报「底稿文书怎么一直在加载」

时间：2026-09-26 晚（提交 `c5890e6` 之后）。一句话结论：
**这是真实缺陷，已修；而且是"探针断言太弱"让它溜过去的，断言也一起修了。**

### 11.1 三层原因，一层比一层隐蔽

**第一层（环境，不是产品）：我起的 preview 服务被回收了。**
先是 `curl` 返回 502、Chrome 报 `ERR_CONNECTION_REFUSED`。
`npx vite preview ... &` 这种后台方式在本机工具调用之间会被清掉，
必须用工具自带的常驻后台方式起服务。**这一层导致我差点误判成产品 bug。**

**第二层（真实缺陷）：chunk 拉不下来时，页面会一直转圈到超时然后空白。**
证据：把 `DocumentsView` 的 chunk 请求拦掉，页面停在 `正在加载页面…`，
超时后什么也没有，用户没有任何出路。根因是 `defineAsyncComponent` 的三个约束：
1. Vue 只给 `errorComponent` 传 `error`，不给它重试回调；
2. 不提供 `errorComponent` 时，`fail()` 之后**什么都不渲染**；
3. `loadingComponent` **永远拿不到** `error`。

结果就是「加载失败」那段 UI 是**死代码**——从来没显示过。
用户看到的只有无限转圈，这正是"一直在加载"。

**第三层（我在修第二层时引入的回归）：失败界面自己也崩了。**
改 `ViewLoading` 时把 `const props = defineProps(...)` 的 `const props =` 删掉了，
模板里的 `props.error` 于是抛 `TypeError: Cannot read properties of undefined`，
页面变成**完全空白**（连转圈都没有）。这一层是被探针抓到的——
前提是我先给探针加上了 `console.warn` 捕获，因为 Vue 的警告不是 error。

### 11.2 修法

改 `App.vue` 的懒加载为 `lazyView`（自己管状态，不再用 `defineAsyncComponent` 的
loading/error 组件）：

- 140ms 后才显示占位，快网不闪空白；
- 失败**自动重试 2 次**（覆盖网络抖动），再失败才给用户界面；
- 失败界面只给**一个出口**：整页重载；
- 被 KeepAlive 保活的页面，切走再切回若上次是失败态，会自动重试一次。

**为什么出口不是普通 `location.reload()`**：实测把 chunk 拦掉再放开之后，
普通 reload **仍然失败**——Chrome 会把"这个子资源刚才失败了"记在渲染进程里，
同一个文档 URL 重载不会重新去取它，用户点几次都一样，等于出口是假的。
所以改成带时间戳的文档级重载（`location.replace(...?_r=<ts>)`），
恢复正常后再把这个临时参数用 `replaceState` 清掉。

### 11.3 顺带修掉的工具缺陷（否则这类问题还会再漏）

| 缺陷 | 后果 | 修法 |
| --- | --- | --- |
| `npm run build` 会清空 `dist/`，探针页没被重新拷回去 | 探针开始测一个 **404 页面**，11 个视口全 FAIL 而 detail 只是一个 `{}` | 新增 `npm run probe:prepare`（跨平台 Node 脚本），逐个校验拷过去的文件含特征串；`probe:layout / lazy / router` 都会先跑它 |
| 探针没有"目标页面前置检查" | 同上，失败信息没有指向性 | 场景支持 `expect`（一个必须为真的表达式），不成立就打印"多半是目标页没出现在 dist/" |
| 只捕获 `console.error` | Vue 的 `[Vue warn]` 全是 `console.warn`，渲染空白的答案就在里面 | 新增警告捕获并单独打印 |
| 触发导航的步骤会因上下文销毁而报错 | 无法测"点重载按钮"这类动作 | 步骤支持 `allowNavigation` |
| `detail` 是对象时只打印 `[object Object]` | 等于没有信息 | 非字符串自动 `JSON.stringify` |

### 11.4 断言太弱：这个 bug 为什么第一次没被发现

原来的底稿页断言是 `document.body.innerText.includes('底稿')`——
而**导航栏里就有「底稿文书」四个字**，所以这条断言**恒真**，
页面是白的它也过。五个懒加载页面里有四个都是这种写法。

已全部改成能真正失败的断言：等到**页面内容出现**、且 `.view-loading` 占位符
**不存在**；底稿页用页面内独有的「选择底稿」当判据。

**教训（值得单独记住）**：断言"看得见某段文字"时，一定要确认这段文字
**只可能来自被断言的那个视图**。用导航标签、面包屑、页面标题做判据，
等于在断言 App 的壳，而不是在断言页面。

### 11.5 验证（全部实测）

| 项 | 结果 |
| --- | --- |
| `npm run validate:all` | 664 条 / 11 组，0 失败 |
| `npm run probe:browser` | 41/41（29 条交互 + 12 条前置检查），控制台 0 错误 |
| `npm run probe:layout` | 22/22（11 视口 × 前置检查 + 不变量） |
| `npm run probe:lazy` | 2/2（步骤内部 11 条全过） |
| `npm run probe:lazy-failure` | 5/5（拦掉 chunk → 出失败界面 → 放开 → 点出口 → 内容真的回来） |
| `npm run probe:router` | 15/15 |

合计 **85 条**浏览器断言，0 失败。（这是该轮结束时的数字；加入落地页后见 §12.5。）

---

## 12. 新增落地页（用户要求「进去就是，再点才是现在的工具界面」）

### 12.1 做法

- 路由表新增 `home`，`DEFAULT_VIEW` 从 `analysis` 改为 `home`。
- 新增路由字段 **`standalone: true`**：带这个标记的视图**不带工作台外壳**
  （顶栏 / 底部标签栏 / 页面头），由 `App.vue` 整屏渲染。
  导航列表 `navItems` 自动过滤掉 standalone 的视图——**黑名单写在路由表里，
  不在 App 里再维护一份**，否则两处迟早不一致。
- 新增 `web/src/views/HomeView.vue`（eager 静态引入，首屏即用）：
  定位一句话 + 3 条设计原则 + 7 个模块卡片（点了直接进对应页面）+ 页脚。
- 回落地页的三个入口：左上角徽标、顶栏首页按钮、手机端「更多」里的「返回首页」。
- `activeComponent` 在落地页返回 `null`，而不是让它退化成 AnalysisView。

### 12.2 落地页必须遵守的两条

- **不带 crumb/页面头**。`validate-router` 里凡是"页面头"相关的断言都只针对
  非 standalone 路由；落地页反而被断言**不应该**有 crumb。
- **不能有横向滚动**，且 7 张卡片在 1920/1440/1280/768/390 都要出现。
  由布局探针的 4 个落地页视口 + smoke 场景的窄屏断言覆盖。

### 12.3 这次改动顺带暴露的三个坑

1. **布局探针会量到"什么都没有"的页面。** 它原来不带 hash，靠默认视图；
   默认视图变成落地页之后，落地页没有 `.top-nav`，于是所有布局断言都以
   "导航不存在"的形式失败，看起来像布局坏了。现在探针有显式 `route`（默认 `#/analysis`），
   并新增 `?route=%23/home` 来测落地页。
2. **`__ready` 的判据要跟着页面形态走。** 原来只等 `.top-nav`，落地页永远等不到；
   现在「`.top-nav` 或 `.landing-title`」二者有其一即算挂载。
3. **`expect` 在探针页上下文里求值，不在 iframe 里。**
   给落地页视口写 `expect: "!!document.querySelector('.landing-title')"` 会永远是 false——
   那个元素在 iframe 内。探针页的 `expect` 只能断言探针页自己的东西（如 `window.__audit`），
   页面内的事实交给步骤里的 `window.__audit()` 结果判断。

另外修了探针自身一处**恒真写法**：截图步骤原来把 `ok` 写成
`outcome?.ok !== false`，这会把"没返回 ok"也算通过。已改为严格 `=== true`。

### 12.4 新增能力：截图复核

`browser-probe.mjs` 支持 `view.viewport`（`Emulation.setDeviceMetricsOverride`）
与步骤级 `shot`（`Page.captureScreenshot`，含超出视口部分）。

```bash
npm run probe:shots        # 生成 .probe-shots/landing-1440.png 与 landing-390.png
```

**为什么值得加**：断言能证明"元素存在"，证明不了"好不好看"。落地页的排版
（3 栏事实区、7 张卡片在 1440 排成 3+3+1、390 收成单列）就是靠截图逐张看过的，
不是靠断言推出来的。`.probe-shots/` 已 gitignore。

### 12.5 验证

| 项 | 结果 |
| --- | --- |
| `npm run validate:all` | **671** 条 / 11 组，0 失败（路由 35 → 42） |
| `npm run probe:browser` | 47/47（新增落地页 5 条） |
| `npm run probe:layout` | 30/30（11 个工作台视口 + 4 个落地页视口） |
| `npm run probe:lazy` | 2/2（步骤内部 14 条） |
| `npm run probe:lazy-failure` | 5/5 |
| `npm run probe:router` | 21/21（新增落地页与"回首页"共 6 条） |

