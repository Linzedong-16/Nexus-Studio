/**
 * 定时任务 IPC 处理器
 *
 * 提供任务 CRUD、手动执行、日志查询等 IPC 通道，
 * 并通过 mainWindow.webContents.send 推送任务状态变更。
 */
import type { BrowserWindow } from 'electron'
import { createIPCHandler } from './utils'
import { taskStore, taskScheduler } from '../scheduler'
import type {
  ScheduledTask,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskRunLog,
  TaskStatusChangePayload
} from '../../renderer/src/types/task'

export function registerTaskIPC(mainWindow: BrowserWindow): void {
  // 注册状态变更推送
  taskScheduler.onStatusChange((taskId, status, runLog, error) => {
    const payload: TaskStatusChangePayload = { taskId, status, error, runLog }
    mainWindow.webContents.send('task:status-changed', payload)
  })

  // ─── CRUD ───

  createIPCHandler<[], ScheduledTask[]>('task:list', async () => {
    return taskStore.getAll()
  })

  createIPCHandler<[CreateTaskPayload], ScheduledTask>('task:create', async (payload) => {
    const task = taskStore.create(payload)
    if (task.enabled) {
      taskScheduler.schedule(task)
    }
    return task
  })

  createIPCHandler<[UpdateTaskPayload], ScheduledTask | null>('task:update', async (payload) => {
    const existing = taskStore.getById(payload.id)
    if (!existing) return null

    const task = taskStore.update(payload)
    if (!task) return null

    // 先移除旧调度
    taskScheduler.remove(task.id)

    // 如果启用，重新调度
    if (task.enabled) {
      taskScheduler.schedule(task)
    }

    return task
  })

  createIPCHandler<[string], boolean>('task:delete', async (id) => {
    taskScheduler.remove(id)
    return taskStore.delete(id)
  })

  // ─── 操作 ───

  createIPCHandler<[string], void>('task:run-now', async (taskId) => {
    await taskScheduler.executeNow(taskId)
  })

  createIPCHandler<[string], TaskRunLog[]>('task:get-logs', async (taskId) => {
    const task = taskStore.getById(taskId)
    return task?.runLogs ?? []
  })

  // ─── 连接管理联动 ───

  createIPCHandler<[string], void>('task:pause-by-connection', async (connectionId) => {
    taskStore.pauseByConnectionId(connectionId)
    // 同步移除调度
    for (const task of taskStore.getAll()) {
      const params = task.params as { connectionId?: string }
      if (params.connectionId === connectionId) {
        taskScheduler.remove(task.id)
      }
    }
  })

  // ─── 退出前检查 ───

  createIPCHandler<[], boolean>('task:has-running', async () => {
    return taskScheduler.hasRunningTasks()
  })

  // 用户确认退出：取消所有任务并关闭窗口
  createIPCHandler<[], void>('task:force-close', async () => {
    await taskScheduler.shutdown()
    // 强制关闭窗口（绕过 close 拦截）
    mainWindow.destroy()
  })
}
