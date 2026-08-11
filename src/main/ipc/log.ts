import type { BrowserWindow } from 'electron'
import { createIPCHandler } from './utils'
import { dbLogger } from '../logger/dbLogger'
import type { DbLogEntry } from '../../renderer/src/types/ipc'

/**
 * 数据库日志面板 IPC：推送实时日志、按需回填历史 backlog
 */
export function registerLogIPC(mainWindow: BrowserWindow): void {
  dbLogger.onLog((entry) => {
    mainWindow.webContents.send('log:db-log', entry)
  })

  createIPCHandler<[], DbLogEntry[]>('log:get-backlog', async () => dbLogger.getBacklog())
}
