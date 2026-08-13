/**
 * 定时任务调度领域类型
 *
 * 定义自动化工作台的任务定义、执行日志、脚本模板等状态契约。
 */

/** 任务执行状态 */
export type TaskRunStatus = 'idle' | 'running' | 'success' | 'failed'

/** 任务调度模式 */
export type TaskScheduleMode = 'local'

/** 预定义脚本模板类型 */
export type ScriptTemplateId = 'sql-execute' | 'data-export-csv' | 'data-export-json' | 'pg-dump'

/** 脚本模板定义 */
export interface ScriptTemplate {
  id: ScriptTemplateId
  label: string
  description: string
  /** 是否需要额外参数 */
  hasParams: boolean
}

/** 任务执行记录 */
export interface TaskRunLog {
  id: string
  taskId: string
  startedAt: string
  finishedAt?: string
  status: TaskRunStatus
  durationMs?: number
  rowsAffected?: number
  error?: string
}

/** 连续失败告警升级配置 */
export interface AlertEscalation {
  /** 连续失败次数阈值 */
  failureThreshold: number
  /** 是否启用告警升级 */
  enabled: boolean
}

/** 任务脚本模板参数 */
export interface SqlExecuteParams {
  connectionId: string
  database: string
  sql: string
  /** 执行角色（SET ROLE xxx） */
  execRole?: string
}

export interface DataExportCsvParams {
  connectionId: string
  database: string
  sql: string
  /** 导出目录（绝对路径） */
  exportDir: string
  execRole?: string
}

export interface DataExportJsonParams {
  connectionId: string
  database: string
  sql: string
  exportDir: string
  execRole?: string
}

export interface PgDumpParams {
  connectionId: string
  database: string
  /** pg_dump 可执行文件路径，为空则自动探测 PATH */
  pgDumpPath?: string
  exportDir: string
}

/** 任务参数联合类型 */
export type TaskParams =
  SqlExecuteParams | DataExportCsvParams | DataExportJsonParams | PgDumpParams

/** 定时任务定义 */
export interface ScheduledTask {
  id: string
  name: string
  /** 脚本模板 */
  template: ScriptTemplateId
  /** 模板参数 */
  params: TaskParams
  /** cron 表达式 */
  cronExpression: string
  enabled: boolean
  /** 调度模式 */
  mode: TaskScheduleMode
  /** 通知策略：仅成功 / 仅失败 / 都通知 */
  notifyOn: 'success' | 'failure' | 'both'
  /** 连续失败告警升级 */
  alertEscalation: AlertEscalation
  /** 连续失败计数 */
  consecutiveFailures: number
  /** 最多保留执行日志条数 */
  maxLogRetention: number
  /** 日志 */
  runLogs: TaskRunLog[]
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  lastRunStatus?: TaskRunStatus
}

/** 创建任务的参数 */
export interface CreateTaskPayload {
  name: string
  template: ScriptTemplateId
  params: TaskParams
  cronExpression: string
  enabled: boolean
  notifyOn: 'success' | 'failure' | 'both'
  alertEscalation: AlertEscalation
  maxLogRetention: number
}

/** 更新任务的参数 */
export interface UpdateTaskPayload extends Partial<CreateTaskPayload> {
  id: string
}

/** 自动化工作台标签页状态 */
export interface AutomationTabState {
  /** 当前选中的任务 ID（用于右侧详情面板） */
  selectedTaskId: string | null
  /** 是否正在编辑/创建任务 */
  editingTaskId: string | null
  /** 编辑器是否处于新建模式 */
  isCreating: boolean
}

/** 任务状态变更推送数据 */
export interface TaskStatusChangePayload {
  taskId: string
  status: TaskRunStatus
  error?: string
  runLog?: TaskRunLog
}
