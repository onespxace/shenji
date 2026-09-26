<script setup>
// 页面级懒加载占位。
//
// 两种状态：加载中（转圈）/ 加载失败（说明 + 一个出口）。
// 刻意保持极轻——它自己不能引入任何依赖，否则会抵消懒加载的收益。
//
// 为什么失败时只给一个「重新加载页面」而不是"重试 + 强制刷新"两个按钮：
// 实测在真实浏览器里把 chunk 请求打断之后再放开，"原地重新 import 同一个 URL"**不会**
// 恢复——浏览器已经把那次失败的子资源记住了。所以「重试」按钮看起来能点，
// 实际点了没用，反而比没有更糟（用户会反复点）。整页重载是唯一确定有效的动作。
// 短暂的网络抖动由 App.vue 的 lazyView 自动重试 2 次覆盖，不需要用户介入。
//
// 这个组件是被 App.vue 的 lazyView **自己**渲染的，不是挂在
// defineAsyncComponent 的 loadingComponent 上——后者拿不到 error，
// 会让"加载失败"分支变成永远不可达的死代码。
// 注意：模板里用的是 props.xxx，所以这里**必须**把 defineProps 的返回值接住。
const props = defineProps({
  error: { type: [Error, String, Object], default: null },
  attempts: { type: Number, default: 0 }
})
const emit = defineEmits(['reload'])
</script>

<template>
  <div class="view-loading" role="status" aria-live="polite">
    <template v-if="props.error">
      <div class="view-loading-title">页面加载失败</div>
      <p class="view-loading-text">
        页面资源没能下载下来，常见原因是网络波动、服务刚重启，或浏览器缓存了不完整的文件。
        已自动重试 {{ props.attempts || 2 }} 次仍未成功，请重新加载页面。
      </p>
      <div class="view-loading-actions">
        <button class="view-loading-retry" type="button" @click="emit('reload')">重新加载页面</button>
      </div>
    </template>
    <template v-else>
      <span class="view-loading-dot" aria-hidden="true"></span>
      <span class="view-loading-text">正在加载页面…</span>
    </template>
  </div>
</template>

<style scoped>
.view-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 320px;
  padding: 40px 20px;
  text-align: center;
}
.view-loading-dot {
  width: 22px;
  height: 22px;
  border: 2px solid var(--line, #d8e0ec);
  border-top-color: var(--blue, #2f6fe4);
  border-radius: 50%;
  animation: view-loading-spin .8s linear infinite;
}
@keyframes view-loading-spin { to { transform: rotate(360deg); } }
.view-loading-title { color: var(--ink-900, #16203a); font-size: 1rem; font-weight: 600; }
.view-loading-text { max-width: 30em; margin: 0; color: var(--ink-500, #66748c); font-size: 0.875rem; line-height: 1.7; }
.view-loading-text kbd {
  padding: 1px 5px;
  border: 1px solid var(--line, #d8e0ec);
  border-radius: 4px;
  background: #f6f8fb;
  font: inherit;
  font-size: 0.8125rem;
}
.view-loading-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.view-loading-retry {
  padding: 7px 16px;
  border: 1px solid var(--blue, #2f6fe4);
  border-radius: 8px;
  background: var(--blue, #2f6fe4);
  color: #fff;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.view-loading-retry:disabled { opacity: .6; cursor: default; }
@media (prefers-reduced-motion: reduce) {
  .view-loading-dot { animation: none; }
}
</style>
