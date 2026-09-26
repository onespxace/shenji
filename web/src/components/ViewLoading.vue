<script setup>
// 页面级懒加载占位。
//
// 只做两件事：显示"正在加载"，以及在 chunk 拉取失败时给出重试入口。
// 刻意保持极轻——它自己不能引入任何依赖，否则会抵消懒加载的收益。
import { ref } from 'vue'

const props = defineProps({
  error: { type: [Error, String, Object], default: null },
  attempts: { type: Number, default: 0 }
})
const emit = defineEmits(['retry'])
const retrying = ref(false)

function retry() {
  if (retrying.value) return
  retrying.value = true
  emit('retry')
  // 给父组件一点时间重建组件；无论如何 1.2s 后解除锁定，避免按钮永久卡死
  window.setTimeout(() => { retrying.value = false }, 1200)
}
</script>

<template>
  <div class="view-loading" role="status" aria-live="polite">
    <template v-if="props.error">
      <div class="view-loading-title">页面加载失败</div>
      <p class="view-loading-text">
        可能是网络波动或浏览器缓存了不完整的文件。按重试，或按
        <kbd>Ctrl</kbd> + <kbd>F5</kbd> 强制刷新。
      </p>
      <button class="view-loading-retry" type="button" :disabled="retrying" @click="retry">
        {{ retrying ? '正在重试…' : '重试' }}
        <span v-if="props.attempts > 0">（已尝试 {{ props.attempts }} 次）</span>
      </button>
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
