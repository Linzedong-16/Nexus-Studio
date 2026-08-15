/**
 * 应用自动更新领域类型
 *
 * 定义主进程 electron-updater 状态与渲染进程更新提示 UI 之间的通信契约。
 */

/** 自动更新状态机 */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
