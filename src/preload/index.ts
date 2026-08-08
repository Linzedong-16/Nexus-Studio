import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api } from './index.d'

/**
 * 渲染进程可用 API —— 契约见 specs/001-app-shell-ui/contracts/ipc-window.md
 * 宪法 I：只暴露封装后的有限 API，禁止透出原始 ipcRenderer
 */
const api: Api = {
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void =>
        callback(maximized)
      ipcRenderer.on('window:maximized-changed', listener)
      return () => ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
