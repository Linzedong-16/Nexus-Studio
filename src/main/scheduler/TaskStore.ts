/**
 * 定时任务持久化存储
 *
 * 任务存储在独立 JSON 文件（app.getPath('userData')/tasks.json）中，
 * 不与 electron-store 的 config 混在一起。
 * 支持跨设备检测：如果 machineId 不匹配，自动禁用所有任务。
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { v4 as uuid } from 'uuid'
import type {
  ScheduledTask,
  CreateTaskPayload,
  UpdateTaskPayload
} from '../../renderer/src/types/task'

interface TaskStoreData {
  machineId: string
  tasks: ScheduledTask[]
}

export class TaskStore {
  private filePath: string
  private data: TaskStoreData
  private dirty = false
  private _pendingWrite = false

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'tasks.json')
    this.data = this.load()
  }

  /* ─── 公开 API ─── */

  getAll(): ScheduledTask[] {
    return this.data.tasks
  }

  getById(id: string): ScheduledTask | undefined {
    return this.data.tasks.find((t) => t.id === id)
  }

  create(payload: CreateTaskPayload): ScheduledTask {
    const now = new Date().toISOString()
    const task: ScheduledTask = {
      id: uuid(),
      name: payload.name,
      template: payload.template,
      params: payload.params,
      cronExpression: payload.cronExpression,
      enabled: payload.enabled,
      mode: 'local',
      notifyOn: payload.notifyOn,
      alertEscalation: payload.alertEscalation,
      consecutiveFailures: 0,
      maxLogRetention: payload.maxLogRetention,
      runLogs: [],
      createdAt: now,
      updatedAt: now
    }
    this.data.tasks.push(task)
    this.persist()
    return task
  }

  update(payload: UpdateTaskPayload): ScheduledTask | null {
    const idx = this.data.tasks.findIndex((t) => t.id === payload.id)
    if (idx === -1) return null
    const task = this.data.tasks[idx]
    const { id: _id, ...rest } = payload
    void _id
    Object.assign(task, rest, { updatedAt: new Date().toISOString() })
    this.persist()
    return task
  }

  delete(id: string): boolean {
    const idx = this.data.tasks.findIndex((t) => t.id === id)
    if (idx === -1) return false
    this.data.tasks.splice(idx, 1)
    this.persist()
    return true
  }

  /** 按连接 ID 暂停所有关联任务 */
  pauseByConnectionId(connectionId: string): void {
    let changed = false
    for (const task of this.data.tasks) {
      const params = task.params as { connectionId?: string }
      if (params.connectionId === connectionId && task.enabled) {
        task.enabled = false
        task.updatedAt = new Date().toISOString()
        changed = true
      }
    }
    if (changed) this.persist()
  }

  /** 持久化运行日志 */
  appendRunLog(taskId: string, log: ScheduledTask['runLogs'][number]): void {
    const task = this.getById(taskId)
    if (!task) return
    task.runLogs.push(log)
    // 按 maxLogRetention 裁剪
    if (task.runLogs.length > task.maxLogRetention) {
      task.runLogs = task.runLogs.slice(-task.maxLogRetention)
    }
    this.persist()
  }

  /** 更新任务运行状态 */
  updateRunStatus(
    taskId: string,
    patch: {
      lastRunAt?: string
      lastRunStatus?: ScheduledTask['lastRunStatus']
      consecutiveFailures?: number
    }
  ): void {
    const task = this.getById(taskId)
    if (!task) return
    Object.assign(task, patch)
    this.persist()
  }

  /** 启动时获取跨设备检测结果 */
  isCrossDevice(): boolean {
    return this.data.machineId !== os.hostname()
  }

  /** 更新 machineId 为当前机器 */
  updateMachineId(): void {
    this.data.machineId = os.hostname()
    this.persist()
  }

  /* ─── 内部 ─── */

  private load(): TaskStoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw) as TaskStoreData
        if (parsed.machineId && Array.isArray(parsed.tasks)) {
          return parsed
        }
      }
    } catch {
      // 文件损坏，返回空
    }
    return { machineId: os.hostname(), tasks: [] }
  }

  private persist(): void {
    this.dirty = true
    if (!this._pendingWrite) {
      this._pendingWrite = true
      setImmediate(() => {
        this._pendingWrite = false
        if (this.dirty) {
          this.dirty = false
          this.flushSync()
        }
      })
    }
  }

  private flushSync(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[TaskStore] flush failed:', err)
    }
  }
}

export const taskStore = new TaskStore()
