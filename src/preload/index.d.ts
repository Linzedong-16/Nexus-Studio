import { ElectronAPI } from '@electron-toolkit/preload'

/** 窗口控制 API —— 契约见 specs/001-app-shell-ui/contracts/ipc-window.md */
export interface WindowControlsApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  /** 订阅最大化状态变化；返回取消订阅函数 */
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}

export interface Api {
  windowControls: WindowControlsApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
