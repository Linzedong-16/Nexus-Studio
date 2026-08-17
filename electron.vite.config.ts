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
            // Monaco Editor 自托管 (~3MB)，独立 chunk，业务改动不会导致用户重下
            monaco: ['monaco-editor', '@monaco-editor/react'],
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
