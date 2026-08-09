/**
 * 跨进程共享类型定义
 *
 * 这些类型在主进程（ipc/db.ts, ipc/config.ts）和渲染进程
 * （preload/index.d.ts, services/）中共享引用
 *
 * 宪法 II：IPC 接口类型化，确保三个进程的类型一致
 */

// ─── 数据库连接 ───

export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl?: {
    enabled: boolean
    ca?: string
    cert?: string
    key?: string
  }
}

export interface ConnectionResult {
  success: boolean
  message: string
  connectionId?: string
}

export interface TestResult {
  success: boolean
  message: string
  serverVersion?: string
  latencyMs?: number
}

export interface ConnectionStatus {
  id: string
  state: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: string
}

// ─── 查询结果 ───

export interface QueryField {
  name: string
  dataType: string
  nullable: boolean
}

export interface QueryResult {
  fields: QueryField[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

// ─── Schema 信息 ───

export interface SchemaInfo {
  name: string
  owner: string
}

export interface TableInfo {
  schema: string
  name: string
  type: 'table' | 'view'
  comment?: string
}

export interface ColumnInfo {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue?: string
  comment?: string
}

// ─── 配置 ───

export interface StoredConnection {
  id: string
  name: string
  host: string
  port: number
  database: string
  username: string
  encryptedPassword?: string
}

export interface ConfigStore {
  theme: 'light' | 'dark'
  fontSize: number
  pageSize: number
  connections: StoredConnection[]
  recentFiles: string[]
  windowBounds?: { x: number; y: number; width: number; height: number }
}

// ─── 窗口控制 ───

export interface WindowControlsApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}

// ─── 数据库 API ───

export interface DatabaseApi {
  testConnection(config: ConnectionConfig): Promise<TestResult>
  connect(config: ConnectionConfig): Promise<ConnectionResult>
  disconnect(connectionId: string): Promise<void>
  query(connectionId: string, sql: string): Promise<QueryResult>
  getSchemas(connectionId: string): Promise<SchemaInfo[]>
  getTables(connectionId: string, schema: string): Promise<TableInfo[]>
  getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]>
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

// ─── 配置 API ───

export interface ConfigApi {
  get<T = unknown>(key: string): Promise<T>
  set(key: string, value: unknown): Promise<void>
  getAll(): Promise<ConfigStore>
  delete(key: string): Promise<void>
}

// ─── 全局 API ───

export interface Api {
  windowControls: WindowControlsApi
  db: DatabaseApi
  config: ConfigApi
}
