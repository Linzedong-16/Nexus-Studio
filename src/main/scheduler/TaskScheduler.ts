/**
 * 定时任务调度器
 *
 * 基于 node-cron 的进程内调度引擎：
 * - bootstrap() 启动时恢复已启用任务 + 补偿执行错过的调度
 * - 跨设备自动禁用
 * - 并行执行（多个任务同时触发时并发运行）
 * - 支持 SQL 执行、CSV 导出、JSON 导出、pg_dump 四种脚本模板
 */
import * as cron from 'node-cron'
import { Notification } from 'electron'
import { v4 as uuid } from 'uuid'
import { taskStore } from './TaskStore'
import { driverManager } from '../db/core/DriverManager'
import { configStore } from '../config/store'
import { decryptPassword } from '../config/crypto'
import type {
  ScheduledTask,
  TaskRunLog,
  TaskRunStatus,
  SqlExecuteParams,
  DataExportCsvParams,
  DataExportJsonParams,
  PgDumpParams
} from '../../renderer/src/types/task'
import type { StoredConnection } from '../../renderer/src/types/ipc'
import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'

type StatusCallback = (
  taskId: string,
  status: TaskRunStatus,
  runLog?: TaskRunLog,
  error?: string
) => void

export class TaskScheduler {
  /** active cron jobs: taskId → ScheduledTask (cron task reference) */
  private jobs = new Map<string, cron.ScheduledTask>()
  /** currently running task IDs */
  private runningSet = new Set<string>()
  private statusCallback: StatusCallback | null = null

  /** 设置状态变更回调（用于通知渲染进程） */
  onStatusChange(cb: StatusCallback): void {
    this.statusCallback = cb
  }

  /** 启动时初始化：跨设备检测 + 恢复已启用任务 + 补偿执行 */
  bootstrap(): void {
    if (taskStore.isCrossDevice()) {
      console.log('[TaskScheduler] 检测到跨设备同步，自动禁用所有任务')
      for (const task of taskStore.getAll()) {
        if (task.enabled) {
          taskStore.update({ id: task.id, enabled: false })
        }
      }
      taskStore.updateMachineId()
    }

    const tasks = taskStore.getAll().filter((t) => t.enabled)
    for (const task of tasks) {
      this.schedule(task)
      // 补偿执行：检查上次运行后是否错过了调度
      this.compensateMissed(task)
    }
    console.log(`[TaskScheduler] bootstrap 完成，已恢复 ${tasks.length} 个任务`)
  }

  /** 调度一个任务 */
  schedule(task: ScheduledTask): boolean {
    if (!cron.validate(task.cronExpression)) {
      console.error(`[TaskScheduler] 无效 cron 表达式: ${task.cronExpression}`)
      return false
    }
    // 先移除旧 job
    this.remove(task.id)

    const job = cron.schedule(task.cronExpression, () => {
      this.execute(task)
    })
    this.jobs.set(task.id, job)
    return true
  }

  /** 移除调度 */
  remove(taskId: string): void {
    const job = this.jobs.get(taskId)
    if (job) {
      job.stop()
      this.jobs.delete(taskId)
    }
  }

  /** 立即执行一次 */
  async executeNow(taskId: string): Promise<void> {
    const task = taskStore.getById(taskId)
    if (!task) throw new Error(`任务不存在: ${taskId}`)
    await this.execute(task)
  }

  /** 是否有正在运行的任务 */
  hasRunningTasks(): boolean {
    return this.runningSet.size > 0
  }

  /** 获取正在运行的任务数 */
  get runningCount(): number {
    return this.runningSet.size
  }

  /** 取消所有正在运行的任务（暴力终止，用于 app 退出） */
  async cancelAll(): Promise<void> {
    this.runningSet.clear()
    // 停止所有 cron job
    for (const [id] of this.jobs) {
      this.remove(id)
    }
  }

  /** 优雅关闭 */
  async shutdown(): Promise<void> {
    for (const [id] of this.jobs) {
      this.remove(id)
    }
    this.runningSet.clear()
  }

  /* ─── 私有方法 ─── */

  /** 补偿执行错过的调度 */
  private compensateMissed(task: ScheduledTask): void {
    if (!task.lastRunAt) return
    const now = Date.now()
    const lastRun = new Date(task.lastRunAt).getTime()
    // 如果上次执行超过 2 个调度周期，执行一次补偿
    const interval = this.guessIntervalMs(task.cronExpression)
    if (interval === null) return
    // 如果错过的调度超过 2 个周期，视为已错过，不补偿
    if (now - lastRun > interval * 2 && now - lastRun < interval * 10) {
      console.log(`[TaskScheduler] 补偿执行: ${task.name}`)
      this.execute(task)
    }
  }

  /** 粗略估算 cron 表达式的调度间隔（毫秒），用于补偿判断 */
  private guessIntervalMs(cronExpr: string): number | null {
    // 简单解析：分钟级 cron 表达式
    const parts = cronExpr.trim().split(/\s+/)
    if (parts.length < 5) return null
    const minute = parts[0]
    const hour = parts[1]
    const dayOfMonth = parts[2]
    const month = parts[3]
    const dayOfWeek = parts[4]

    // 如果是每 N 分钟
    if (minute.startsWith('*/')) {
      const n = parseInt(minute.slice(2), 10)
      if (!isNaN(n)) return n * 60 * 1000
    }
    // 如果是每小时
    if (
      minute.match(/^\d+$/) &&
      hour === '*' &&
      dayOfMonth === '*' &&
      month === '*' &&
      dayOfWeek === '*'
    ) {
      return 60 * 60 * 1000
    }
    // 如果是每天
    if (
      minute.match(/^\d+$/) &&
      hour.match(/^\d+$/) &&
      dayOfMonth === '*' &&
      month === '*' &&
      dayOfWeek === '*'
    ) {
      return 24 * 60 * 60 * 1000
    }
    return null
  }

  /** 执行任务 */
  private async execute(task: ScheduledTask): Promise<void> {
    if (this.runningSet.has(task.id)) {
      console.log(`[TaskScheduler] 任务 ${task.name} 正在运行，跳过本次调度`)
      return
    }
    this.runningSet.add(task.id)
    const startedAt = new Date().toISOString()
    const runLogId = uuid()

    this.emitStatus(task.id, 'running')

    try {
      const result = await this.runTemplate(task)
      const finishedAt = new Date().toISOString()
      const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()

      const log: TaskRunLog = {
        id: runLogId,
        taskId: task.id,
        startedAt,
        finishedAt,
        status: 'success',
        durationMs,
        rowsAffected: result.rowsAffected
      }

      taskStore.appendRunLog(task.id, log)
      taskStore.updateRunStatus(task.id, {
        lastRunAt: finishedAt,
        lastRunStatus: 'success',
        consecutiveFailures: 0
      })

      this.emitStatus(task.id, 'success', log)
      this.sendNotification(task, 'success', { durationMs, rowsAffected: result.rowsAffected })
    } catch (err) {
      const finishedAt = new Date().toISOString()
      const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
      const errorMsg = err instanceof Error ? err.message : String(err)
      const newConsecutiveFailures = (task.consecutiveFailures || 0) + 1

      const log: TaskRunLog = {
        id: runLogId,
        taskId: task.id,
        startedAt,
        finishedAt,
        status: 'failed',
        durationMs,
        error: errorMsg
      }

      taskStore.appendRunLog(task.id, log)
      taskStore.updateRunStatus(task.id, {
        lastRunAt: finishedAt,
        lastRunStatus: 'failed',
        consecutiveFailures: newConsecutiveFailures
      })

      this.emitStatus(task.id, 'failed', log, errorMsg)
      this.sendNotification(task, 'failed', { durationMs, error: errorMsg })

      // 告警升级
      if (
        task.alertEscalation.enabled &&
        newConsecutiveFailures >= task.alertEscalation.failureThreshold
      ) {
        this.sendEscalationNotification(task, newConsecutiveFailures, errorMsg)
      }
    } finally {
      this.runningSet.delete(task.id)
    }
  }

  /** 根据模板类型执行脚本 */
  private async runTemplate(task: ScheduledTask): Promise<{ rowsAffected?: number }> {
    switch (task.template) {
      case 'sql-execute':
        return this.executeSql(task.params as SqlExecuteParams)
      case 'data-export-csv':
        return this.exportCsv(task.params as DataExportCsvParams)
      case 'data-export-json':
        return this.exportJson(task.params as DataExportJsonParams)
      case 'pg-dump':
        return this.pgDump(task.params as PgDumpParams)
      default:
        throw new Error(`未知脚本模板: ${(task as { template: string }).template}`)
    }
  }

  /** 检查连接是否可用 */
  private async ensureConnection(connectionId: string): Promise<void> {
    const stored = configStore.get('connections') as StoredConnection[]
    const found = stored.find((c) => c.id === connectionId)
    if (!found) {
      throw new Error(`连接配置不存在: ${connectionId}`)
    }
    // 尝试通过 driverManager 确保连接
    const status = driverManager.getStatus(connectionId)
    if (status.state !== 'connected') {
      throw new Error(`连接已断开: ${connectionId}`)
    }
  }

  /** 执行 SQL */
  private async executeSql(params: SqlExecuteParams): Promise<{ rowsAffected?: number }> {
    await this.ensureConnection(params.connectionId)
    let sql = params.sql
    if (params.execRole) {
      sql = `SET ROLE ${this.escapeIdent(params.execRole)};\n${sql}`
    }
    const result = await driverManager.query(params.connectionId, params.database, sql)
    return { rowsAffected: result.rowCount }
  }

  /** 导出 CSV */
  private async exportCsv(params: DataExportCsvParams): Promise<{ rowsAffected?: number }> {
    await this.ensureConnection(params.connectionId)
    let sql = params.sql
    if (params.execRole) {
      sql = `SET ROLE ${this.escapeIdent(params.execRole)};\n${sql}`
    }
    const result = await driverManager.query(params.connectionId, params.database, sql)
    if (!fs.existsSync(params.exportDir)) {
      fs.mkdirSync(params.exportDir, { recursive: true })
    }
    const now = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(params.exportDir, `export-${now}.csv`)
    const csv = this.toCsv(
      result.fields.map((f) => f.name),
      result.rows
    )
    fs.writeFileSync(filePath, csv, 'utf-8')
    return { rowsAffected: result.rowCount }
  }

  /** 导出 JSON */
  private async exportJson(params: DataExportJsonParams): Promise<{ rowsAffected?: number }> {
    await this.ensureConnection(params.connectionId)
    let sql = params.sql
    if (params.execRole) {
      sql = `SET ROLE ${this.escapeIdent(params.execRole)};\n${sql}`
    }
    const result = await driverManager.query(params.connectionId, params.database, sql)
    if (!fs.existsSync(params.exportDir)) {
      fs.mkdirSync(params.exportDir, { recursive: true })
    }
    const now = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(params.exportDir, `export-${now}.json`)
    fs.writeFileSync(filePath, JSON.stringify(result.rows, null, 2), 'utf-8')
    return { rowsAffected: result.rowCount }
  }

  /** pg_dump */
  private async pgDump(params: PgDumpParams): Promise<{ rowsAffected?: number }> {
    const stored = configStore.get('connections') as StoredConnection[]
    const found = stored.find((c) => c.id === params.connectionId)
    if (!found) throw new Error(`连接配置不存在: ${params.connectionId}`)

    const pgDumpPath = params.pgDumpPath || 'pg_dump'
    const env = { ...process.env }
    if (found.encryptedPassword) {
      env.PGPASSWORD = decryptPassword(found.encryptedPassword)
    }

    if (!fs.existsSync(params.exportDir)) {
      fs.mkdirSync(params.exportDir, { recursive: true })
    }
    const now = new Date().toISOString().replace(/[:.]/g, '-')
    const outFile = path.join(params.exportDir, `dump-${params.database}-${now}.sql`)

    const args = [
      '-h',
      found.host,
      '-p',
      String(found.port),
      '-U',
      found.username,
      '-d',
      params.database,
      '-f',
      outFile,
      '--no-owner'
    ]

    return new Promise((resolve, reject) => {
      execFile(pgDumpPath, args, { env }, (err) => {
        if (err) reject(err)
        else resolve({})
      })
    })
  }

  /* ─── 辅助 ─── */

  private escapeIdent(ident: string): string {
    return `"${ident.replace(/"/g, '""')}"`
  }

  private toCsv(headers: string[], rows: Record<string, unknown>[]): string {
    const escapeCsv = (v: unknown): string => {
      const s = v === null ? '' : String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const headerLine = headers.map(escapeCsv).join(',')
    const dataLines = rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
    return [headerLine, ...dataLines].join('\n')
  }

  private emitStatus(
    taskId: string,
    status: TaskRunStatus,
    runLog?: TaskRunLog,
    error?: string
  ): void {
    this.statusCallback?.(taskId, status, runLog, error)
  }

  /** 发送系统通知 */
  private sendNotification(
    task: ScheduledTask,
    result: 'success' | 'failed',
    meta: { durationMs?: number; rowsAffected?: number; error?: string }
  ): void {
    if (task.notifyOn === 'success' && result !== 'success') return
    if (task.notifyOn === 'failure' && result !== 'failed') return

    const title = result === 'success' ? `任务完成: ${task.name}` : `任务失败: ${task.name}`
    const parts: string[] = []
    if (meta.durationMs !== undefined) parts.push(`耗时: ${meta.durationMs}ms`)
    if (meta.rowsAffected !== undefined) parts.push(`影响行数: ${meta.rowsAffected}`)
    if (meta.error) parts.push(`错误: ${meta.error}`)
    const body = parts.join(' | ')

    const notification = new Notification({ title, body })
    notification.show()
  }

  /** 告警升级通知 */
  private sendEscalationNotification(task: ScheduledTask, failures: number, error: string): void {
    const notification = new Notification({
      title: `告警升级: ${task.name}`,
      body: `连续失败 ${failures} 次，已达阈值 ${task.alertEscalation.failureThreshold}。最新错误: ${error}`
    })
    notification.show()
  }
}

export const taskScheduler = new TaskScheduler()
