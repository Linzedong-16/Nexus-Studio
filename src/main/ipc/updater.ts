/**
 * 自动更新 IPC 处理器
 *
 * 提供检查/下载/安装更新的 IPC 通道，并通过 mainWindow.webContents.send 推送状态变更。
 */
import type { BrowserWindow } from 'electron'
import { createIPCHandler } from './utils'
import { initUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from '../updater'
import type { UpdateStatus } from '../../renderer/src/types/updater'

export function registerUpdaterIPC(mainWindow: BrowserWindow): void {
  initUpdater((status: UpdateStatus) => {
    mainWindow.webContents.send('updater:status-changed', status)
  })

  createIPCHandler<[], void>('updater:check', async () => {
    checkForUpdates()
  })

  createIPCHandler<[], void>('updater:download', async () => {
    downloadUpdate()
  })

  createIPCHandler<[], void>('updater:install', async () => {
    quitAndInstall()
  })
}
