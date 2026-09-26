// 生成探针入口页的纯函数。
//
// 抽成模块的原因：`copy-probe-pages.mjs`（probe:prepare）也需要它，
// 而它原来是用 `spawnSync` 去起 `make-probe-entry.mjs` 的——
// 受限环境起不了子进程（EBUSY），于是"自动生成"这一步静默失败，
// 表现为 `probe:prepare` 报「probe-index.html 没有出现在 dist/」。
// 直接在进程内调用就没有这个问题，也不该为了复制一个文件去起子进程。

/**
 * 去掉 index.html 里的 modulepreload 提示，得到探针入口。
 *
 * 为什么要去掉：harness 的浏览器网络层对 <head> 里解析期发起的并行预加载有字节预算，
 * 747B 的 modulepreload 能过，14.8KB 起的就被 502/ERR_ABORTED；而同一页面里
 * 用 fetch() 请求同样的 URL 全部 200。属于环境限制，不是产物缺陷。
 * `dist/index.html`（真正部署的那份）不动，preload 提示照旧保留。
 *
 * @param {string} html dist/index.html 的内容
 * @returns {{ html: string, removed: number }}
 */
export function buildProbeEntry(html) {
  const stripped = String(html).replace(/[ \t]*<link rel="modulepreload"[^>]*>\r?\n?/g, '')
  const removed = (String(html).match(/rel="modulepreload"/g) || []).length
  return { html: stripped, removed }
}
