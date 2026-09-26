import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 使用相对资源路径，构建产物可直接放到 GitHub Pages 的子目录。
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    port: 4173,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
})
