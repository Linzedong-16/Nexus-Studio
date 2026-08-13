import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ConnectionConfig,
  ConnectionResult,
  TestResult,
  QueryResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  TriggerInfo,
  RoutineInfo,
  RoleInfo,
  ConnectionStatus,
  ConfigStore,
  ErDiagramData,
  DbLogEntry
} from '../renderer/src/types/ipc'
import type { KeybindingEntry } from '../renderer/src/types/keybinding'
import type { FileNode } from '../renderer/src/types/fileExplorer'
import type {
  ScheduledTask,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskRunLog,
  TaskStatusChangePayload
} from '../renderer/src/types/task'

// ─── 窗口控制 API ───

export interface WindowControlsApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  /** 订阅最大化状态变化；返回取消订阅函数 */
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}

// ─── 数据库 API ───

export interface DatabaseApi {
  testConnection(config: ConnectionConfig): Promise<TestResult>
  connect(config: ConnectionConfig): Promise<ConnectionResult>
  disconnect(connectionId: string): Promise<void>
  getDatabases(connectionId: string): Promise<DatabaseInfo[]>
  /** 获取服务器上全部角色（集群级，PostgreSQL 专属） */
  getRoles(connectionId: string): Promise<RoleInfo[]>
  query(
    connectionId: string,
    database: string,
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult>
  getSchemas(connectionId: string, database: string): Promise<SchemaInfo[]>
  getTables(connectionId: string, database: string, schema: string): Promise<TableInfo[]>
  getColumns(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]>
  getIndexes(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<IndexInfo[]>
  getTriggers(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TriggerInfo[]>
  getFunctions(connectionId: string, database: string, schema: string): Promise<RoutineInfo[]>
  getProcedures(connectionId: string, database: string, schema: string): Promise<RoutineInfo[]>
  /** 获取指定 schema 列表下所有表结构与外键关系（用于 ER 分析） */
  getErDiagramData(
    connectionId: string,
    database: string,
    schemas: string[]
  ): Promise<ErDiagramData>
  /** 订阅连接状态变化；返回取消订阅函数 */
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

// ─── 配置 API ───

export interface ConfigApi {
  get<T = unknown>(key: string): Promise<T>
  set(key: string, value: unknown): Promise<void>
  getAll(): Promise<ConfigStore>
  delete(key: string): Promise<void>
  /** 获取所有连接配置（主进程已解密密码） */
  getConnections(): Promise<ConnectionConfig[]>
  /** 保存连接配置（主进程会加密密码） */
  saveConnection(config: ConnectionConfig): Promise<void>
  /** 删除指定连接配置 */
  removeConnection(id: string): Promise<void>
}

// ─── 快捷键 API ───

export interface KeybindingsApi {
  getAll(): Promise<KeybindingEntry[]>
  saveAll(entries: KeybindingEntry[]): Promise<KeybindingEntry[]>
  resetDefaults(): Promise<KeybindingEntry[]>
}

// ─── 数据库日志 API ───

export interface LogApi {
  /** 获取当前已缓存的历史日志（进程内环形缓冲，上限 500 条） */
  getBacklog(): Promise<DbLogEntry[]>
  /** 订阅实时日志推送；返回取消订阅函数 */
  onLog(callback: (entry: DbLogEntry) => void): () => void
}

// ─── 头像 API ───

export interface AvatarApi {
  /** 保存头像 base64 DataURL 到本地文件 */
  save(base64Data: string): Promise<void>
  /** 加载本地头像文件，返回 base64 DataURL；无文件返回 null */
  load(): Promise<string | null>
  /** 删除本地头像文件 */
  delete(): Promise<void>
}

// ─── 应用信息 API ───

/** 应用版本与环境信息 */
export interface AppVersions {
  appVersion: string
  appName: string
  electron: string
  node: string
  chrome: string
  v8: string
  os: string
}

export interface AppApi {
  /** 获取应用版本、Electron / Node / Chrome / V8 版本及操作系统信息 */
  getVersions(): Promise<AppVersions>
}

// ─── 文件系统 API ───

export interface FileSystemApi {
  /** 唤起系统目录选择器，返回选中路径或 null */
  pickFolder(): Promise<string | null>
  /** 读取目录内容（排除隐藏文件），返回直接子节点 */
  readDir(dirPath: string): Promise<FileNode[]>
  /** 读取文件内容（UTF-8） */
  readFile(filePath: string): Promise<string>
  /** 写入文件内容（UTF-8） */
  writeFile(filePath: string, content: string): Promise<void>
  /** 在系统文件管理器中定位文件 */
  showItemInFolder(filePath: string): Promise<void>
  /** 检查文件是否存在 */
  fileExists(filePath: string): Promise<boolean>
  /** 在指定目录下新建空文件，同名条目已存在时抛错 */
  createFile(parentDir: string, name: string): Promise<string>
  /** 在指定目录下新建空文件夹，同名条目已存在时抛错 */
  createDirectory(parentDir: string, name: string): Promise<string>
  /** 重命名文件或文件夹（同目录内改名），目标名称冲突或原路径不存在时抛错 */
  rename(oldPath: string, newName: string): Promise<string>
  /** 删除文件或文件夹（移入系统回收站，可恢复） */
  deleteItem(path: string): Promise<void>
  /** 将文件或文件夹移动到目标目录下，目标已有同名条目或目标是源自身/子孙目录时抛错 */
  moveItem(sourcePath: string, targetDirPath: string): Promise<string>
  /** 安全读取文件：先探测是否为二进制文件，二进制文件不读取全文内容 */
  readFileSafe(path: string): Promise<{ isBinary: boolean; content?: string }>
}

// ─── 定时任务 API ───

export interface TaskApi {
  /** 获取所有任务 */
  list(): Promise<ScheduledTask[]>
  /** 创建任务 */
  create(payload: CreateTaskPayload): Promise<ScheduledTask>
  /** 更新任务 */
  update(payload: UpdateTaskPayload): Promise<ScheduledTask | null>
  /** 删除任务 */
  delete(id: string): Promise<boolean>
  /** 立即执行一次 */
  runNow(taskId: string): Promise<void>
  /** 获取任务执行日志 */
  getLogs(taskId: string): Promise<TaskRunLog[]>
  /** 暂停指定连接关联的所有任务 */
  pauseByConnection(connectionId: string): Promise<void>
  /** 检查是否有正在运行的任务 */
  hasRunning(): Promise<boolean>
  /** 用户确认强制退出：取消所有任务并关闭窗口 */
  forceClose(): Promise<void>
  /** 订阅任务状态变更；返回取消订阅函数 */
  onStatusChange(callback: (payload: TaskStatusChangePayload) => void): () => void
  /** 订阅退出确认请求；返回取消订阅函数 */
  onConfirmClose(callback: () => void): () => void
}

// ─── 全局 API ───

export interface Api {
  windowControls: WindowControlsApi
  db: DatabaseApi
  config: ConfigApi
  keybindings: KeybindingsApi
  log: LogApi
  avatar: AvatarApi
  app: AppApi
  fs: FileSystemApi
  task: TaskApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
