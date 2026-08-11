import type { BrowserWindow } from 'electron'
import { registerWindowIpc } from './window'
import { registerDbIPC } from './db'
import { registerConfigIPC } from './config'
import { registerKeybindingsIPC } from './keybindings'
import { registerLogIPC } from './log'
import { registerAvatarIPC } from './avatar'
import { registerAppIPC } from './app'

/**
 * IPC 统一注册入口
 *
 * 在主进程 app.whenReady() 中调用，一次性注册所有 IPC 模块
 * 新增模块只需在此处添加一行 registerXxxIPC()
 */
export function registerAllIPC(mainWindow: BrowserWindow): void {
  registerWindowIpc(mainWindow)
  registerDbIPC(mainWindow)
  registerConfigIPC()
  registerKeybindingsIPC()
  registerLogIPC(mainWindow)
  registerAvatarIPC()
  registerAppIPC()
}
