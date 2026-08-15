/**
 * 应用自动更新模块
 *
 * 封装 electron-updater 的 autoUpdater 单例：
 * - autoDownload 关闭，等待渲染进程用户确认后才下载，不静默占用带宽
 * - 所有状态变更通过 initUpdater 注册的回调对外推送（由 ipc/updater.ts 转发到渲染进程）
 * - quitAndInstall 前必须先 markQuitting()，否则会被 close-to-tray 拦截窗口关闭
 */
import { autoUpdater } from 'electron-updater'
import { markQuitting } from '../lifecycle'
import type { UpdateStatus } from '../../renderer/src/types/updater'

let onStatus: ((status: UpdateStatus) => void) | null = null

function emit(status: UpdateStatus): void {
  onStatus?.(status)
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 注册事件监听并绑定状态回调，应用启动时调用一次 */
export function initUpdater(callback: (status: UpdateStatus) => void): void {
  onStatus = callback
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) => emit({ state: 'error', message: err.message }))
}

/** 检查更新；网络失败等场景通过 error 状态静默上报，不抛出异常打断调用方 */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: unknown) => {
    emit({ state: 'error', message: toErrorMessage(err) })
  })
}

/** 下载已检测到的新版本 */
export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err: unknown) => {
    emit({ state: 'error', message: toErrorMessage(err) })
  })
}

/** 重启并安装已下载的更新 */
export function quitAndInstall(): void {
  markQuitting()
  autoUpdater.quitAndInstall()
}
