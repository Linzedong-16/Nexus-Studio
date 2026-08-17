import { ipcMain, type BrowserWindow } from 'electron'

/**
 * 创建类型安全的 IPC invoke/handle 处理器
 *
 * 宪法 V：invoke/handle 双向通信，异常通过 throw 返回给渲染进程
 * 每个 handler 自动捕获异常并序列化为可 IPC 传输的格式
 *
 * @param channel  - IPC 通道名，格式：模块:操作（如 db:query）
 * @param handler  - 业务处理函数，参数由渲染进程传入，返回值通过 IPC 返回
 */
export function createIPCHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (error) {
      // Electron 原生支持转发 Error 实例的 message 到渲染进程的 rejected promise，
      // 转成普通对象反而会丢失这个转发机制，渲染进程只能拿到 "[object Object]"
      if (error instanceof Error) {
        throw error
      }
      throw new Error(String(error))
    }
  })
}

/**
 * 注册单向通知处理器（send/on 模式，不期待返回值）
 *
 * @param channel  - IPC 通道名
 * @param handler  - 处理函数
 */
export function createIPCListener<TArgs extends unknown[]>(
  channel: string,
  handler: (...args: TArgs) => void
): void {
  ipcMain.on(channel, (_event, ...args: TArgs) => {
    handler(...args)
  })
}

/**
 * 安全地向渲染进程推送消息
 *
 * dbLogger/driverManager/taskScheduler/updater 均为跨窗口生命周期的全局单例，
 * 它们的事件回调在应用退出流程中（before-quit 异步清理阶段）仍可能触发——
 * 此时 mainWindow 或其 webContents 已被销毁，直接 send 会抛出
 * "Object has been destroyed"，因此统一在此处做销毁检查后再发送。
 */
export function safeSend(mainWindow: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, ...args)
}
