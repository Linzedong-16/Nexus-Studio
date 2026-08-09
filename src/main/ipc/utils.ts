import { ipcMain } from 'electron'

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
      // 确保 Error 对象能被 Electron IPC 序列化
      // 普通 Error 的 name/message/stack 都是可序列化的字符串属性
      if (error instanceof Error) {
        throw {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      }
      throw { message: String(error) }
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
