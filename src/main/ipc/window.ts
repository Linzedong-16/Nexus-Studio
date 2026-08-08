import { BrowserWindow, ipcMain } from 'electron'

/**
 * 窗口控制 IPC 处理器 —— 契约见 specs/001-app-shell-ui/contracts/ipc-window.md
 * 宪法 V：invoke/handle 双向 + send/on 单向通知；操作定向到事件来源窗口
 */
export function registerWindowIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return win.isMaximized()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // 系统级最大化/还原（双击标题栏、系统快捷键）→ 同步渲染进程图标状态
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-changed', false)
  })
}
