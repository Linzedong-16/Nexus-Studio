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

// ─── 全局 API ───

export interface Api {
  windowControls: WindowControlsApi
  db: DatabaseApi
  config: ConfigApi
  keybindings: KeybindingsApi
  log: LogApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
