import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// 使用相对资源路径，构建产物可直接放到 GitHub Pages 的子目录。
// 多页构建：index.html 为工作台，deck.html 为功能介绍 PPT。
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
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        deck: resolve(process.cwd(), 'deck.html')
      }
    }
  }
})
