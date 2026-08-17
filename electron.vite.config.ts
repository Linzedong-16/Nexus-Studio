import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    worker: {
      format: 'es'
    },
    build: {
      // 针对 Electron 39 内置 Chromium ~130，减少不必要的降级 polyfill
      target: 'chrome130',
      rollupOptions: {
        output: {
          manualChunks: {
            // 注意：不要在此把 monaco-editor 强制归并为独立 vendor chunk。
            // SqlEditor/DdlViewerDialog 均通过路由懒加载引入，Monaco 本身已随之落入
            // 各自的异步 chunk；强制合并成单一巨型 chunk 曾在 macOS arm64 CI runner 上
            // 触发 electron-vite build 原生崩溃（Abort trap: 6 / exit 134），
            // Windows / Linux 未复现。交给 Vite 默认分包即可。
            // ER 图用 reactflow (~500KB)，独立拆分
            reactflow: ['@xyflow/react'],
            // Mermaid 图表渲染 (~1MB)，仅 ER 图极少数场景用到
            mermaid: ['mermaid'],
            // lucide-react 图标库大但 tree-shakeable，这里将图标集中打包避免散落各业务 chunk
            icons: ['lucide-react'],
            // React 全家桶单独打包，更新频率极低
            'vendor-react': ['react', 'react-dom', 'react-router']
          }
        }
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
