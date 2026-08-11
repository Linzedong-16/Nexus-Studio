/**
 * 跨进程共享类型定义
 *
 * 这些类型在主进程（ipc/db.ts, ipc/config.ts）和渲染进程
 * （preload/index.d.ts, services/）中共享引用
 *
 * 宪法 II：IPC 接口类型化，确保三个进程的类型一致
 */

// ─── 数据库类型 ───

export type DatabaseType = 'postgresql'

// ─── 数据库连接 ───

export interface ConnectionConfig {
  id: string
  name: string
  type: DatabaseType
  host: string
  port: number
  /** 服务器级连接下可选：留空时驱动使用该数据库类型的默认管理数据库 */
  database?: string
  username: string
  password: string
  ssl?: {
    enabled: boolean
    rejectUnauthorized?: boolean
    ca?: string
    cert?: string
    key?: string
  }
}

export interface ConnectionResult {
  success: boolean
  message: string
  connectionId?: string
  serverVersion?: string
  latencyMs?: number
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

// ─── 数据库日志面板 ───

export type DbLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type DbLogCategory = 'connection' | 'sql'

export interface DbLogEntry {
  id: number
  timestamp: number
  level: DbLogLevel
  category: DbLogCategory
  connectionId?: string
  database?: string
  message: string
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

// ─── 数据库信息 ───

export interface DatabaseInfo {
  name: string
  owner?: string
}

// ─── 角色信息（集群级安全对象，PostgreSQL 专属）───

export interface RoleInfo {
  name: string
  isSuperuser: boolean
  canLogin: boolean
  canCreateDb: boolean
  canCreateRole: boolean
  isReplication: boolean
  connectionLimit: number
  validUntil?: string
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

export interface IndexInfo {
  schema: string
  table: string
  name: string
  /** 索引覆盖的列名（按顺序） */
  columns: string[]
  unique: boolean
  isPrimary: boolean
  /** 索引访问方法，如 btree */
  method: string
}

export interface TriggerInfo {
  schema: string
  table: string
  name: string
  /** pg_get_triggerdef 生成的完整定义 */
  definition: string
  enabled: boolean
}

// ─── ER 图分析 ───

/** ER 图中的一张表（含全部列） */
export interface ErDiagramTable {
  schema: string
  name: string
  type: 'table' | 'view'
  comment?: string
  columns: ColumnInfo[]
}

/** 外键约束（聚合多列外键为单条记录） */
export interface ForeignKeyInfo {
  constraintName: string
  sourceSchema: string
  sourceTable: string
  sourceColumns: string[]
  targetSchema: string
  targetTable: string
  targetColumns: string[]
  updateRule?: string
  deleteRule?: string
}

/** ER 图分析所需的完整数据 */
export interface ErDiagramData {
  tables: ErDiagramTable[]
  foreignKeys: ForeignKeyInfo[]
}

// ─── 函数 / 存储过程信息（PostgreSQL 专属模块）───

export interface RoutineInfo {
  schema: string
  name: string
  kind: 'function' | 'procedure'
  argumentsSignature?: string
  returnType?: string
  comment?: string
}

// ─── 配置 ───

export interface StoredConnection {
  id: string
  name: string
  type: DatabaseType
  host: string
  port: number
  /** 服务器级连接下可选，见 ConnectionConfig.database */
  database?: string
  username: string
  encryptedPassword?: string
  ssl?: {
    enabled: boolean
    rejectUnauthorized?: boolean
    ca?: string
    cert?: string
    key?: string
  }
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
  /** 获取 ER 图分析所需的表结构与外键数据（固定 2 次数据库往返，见 contracts/ipc-er-diagram.md） */
  getErDiagramData(
    connectionId: string,
    database: string,
    schemas: string[]
  ): Promise<ErDiagramData>
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

// ─── 配置 API ───

export interface ConfigApi {
  get<T = unknown>(key: string): Promise<T>
  set(key: string, value: unknown): Promise<void>
  getAll(): Promise<ConfigStore>
  delete(key: string): Promise<void>

  // 连接配置专用方法（主进程内部处理 safeStorage 加解密）
  getConnections(): Promise<ConnectionConfig[]>
  saveConnection(config: ConnectionConfig): Promise<void>
  removeConnection(id: string): Promise<void>
}

// ─── 应用信息 ───

/** 应用版本与环境信息（IPC 通道 app:get-versions） */
export interface AppVersions {
  appVersion: string
  appName: string
  electron: string
  node: string
  chrome: string
  v8: string
  os: string
}

// ─── 全局 API ───

export interface Api {
  windowControls: WindowControlsApi
  db: DatabaseApi
  config: ConfigApi
}
