import { ipcRenderer } from 'electron'

/**
 * 预加载脚本 IPC 工具工厂
 *
 * 宪法 I：不暴露原始 ipcRenderer，通过工厂函数创建封装后的 API
 * 宪法 V：invoke/handle 双向通信，send/on 单向推送
 */

/**
 * 创建 invoke 调用工厂（双向通信，需要返回值）
 *
 * 用法：
 *   const query = createInvoke<[string, string], QueryResult>('db:query')
 *   渲染进程调用：await query(connectionId, sql)  → Promise<QueryResult>
 */
export function createInvoke<TArgs extends unknown[], TResult>(
  channel: string
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs): Promise<TResult> => {
    return ipcRenderer.invoke(channel, ...args) as Promise<TResult>
  }
}

/**
 * 创建 send 调用工厂（单向通知，无返回值）
 *
 * 用法：
 *   const notify = createSend<[string]>('app:notify')
 *   渲染进程调用：notify('hello')  → void
 */
export function createSend<TArgs extends unknown[]>(channel: string): (...args: TArgs) => void {
  return (...args: TArgs): void => {
    ipcRenderer.send(channel, ...args)
  }
}

/**
 * 创建事件监听工厂（订阅主进程推送）
 *
 * 用法：
 *   const onStatusChange = createListener<ConnectionStatus>('db:status-changed')
 *   渲染进程调用：const unsubscribe = onStatusChange((status) => { ... })
 *   组件卸载时调用：unsubscribe()
 */
export function createListener<T>(channel: string): (callback: (data: T) => void) => () => void {
  return (callback: (data: T) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: T): void => {
      callback(data)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}
