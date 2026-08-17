/**
 * 跨进程共享类型定义
 *
 * 这些类型在主进程（ipc/db.ts, ipc/config.ts）和渲染进程
 * （preload/index.d.ts, services/）中共享引用
 *
 * 宪法 II：IPC 接口类型化，确保三个进程的类型一致
 */
import type { RecentProjectEntry } from './fileExplorer'

// ─── 数据库类型 ───

export type DatabaseType = 'postgresql' | 'mysql'

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
  /** 截断前的真实总行数 */
  rowCount: number
  durationMs: number
  /** 本次结果是否因超过预览行数上限（默认 5 万行）被截断 */
  truncated: boolean
}

/** 导出查询结果请求（跳过预览行数上限，导出完整数据） */
export interface ExportQueryResultRequest {
  connectionId: string
  database: string
  sql: string
  params?: unknown[]
  filePath: string
  format: 'csv' | 'json'
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

// ─── DDL 查看 ───

/** 查看表/视图 DDL 的结果 */
export interface DdlResult {
  /** 对象类型：表或视图 */
  objectType: 'table' | 'view'
  /** 所属 schema 名 */
  schema: string
  /** 表名或视图名 */
  name: string
  /** 拼装完成的完整 DDL 文本 */
  ddl: string
}

// ─── 导出任务 ───

/** 一次查询结果导出操作（CSV/JSON），组件本地状态，不经 IPC 传递 */
export interface ExportJob {
  /** 导出目标格式 */
  format: 'csv' | 'json'
  /** 来自 fs:pick-save-file 的返回值 */
  filePath: string
  /** 导出前已知的结果集行数（QueryResult.rowCount） */
  rowCount: number
  /** 导出流程当前阶段 */
  status: 'preparing' | 'writing' | 'done' | 'error'
  /** 失败原因；仅 status 为 error 时存在 */
  errorMessage?: string
}

// ─── 行数据复制 ───

/** 一次选中行复制操作（INSERT/JSON/CSV），组件本地状态，不经 IPC 传递 */
export interface RowClipboardPayload {
  /** 复制目标格式 */
  format: 'insert' | 'json' | 'csv'
  /** null 表示来源表不可确定（如多表 JOIN 查询结果），此时 INSERT 语句使用占位符表名 */
  sourceTable: { schema: string; name: string } | null
  /** 本次复制涉及的行数 */
  rowCount: number
  /** 最终写入系统剪贴板的文本 */
  text: string
}

// ─── 数据导入 ───

/** 导入向导单个字段的列映射结果 */
export interface ColumnMapping {
  /** 源文件中的字段名（CSV 表头 / JSON 键名） */
  sourceField: string
  /** 映射到的目标表列名，null 表示未映射 */
  targetColumn: string | null
  /** 目标列是否为必填（非空且无默认值），未映射时应阻止进入确认步骤 */
  required: boolean
}

/** 导入向导组件本地状态，不经 IPC 传递 */
export interface ImportWizardState {
  /** 用户选择的本地源文件 */
  sourceFile: {
    /** 本地文件路径 */
    path: string
    /** 文件格式，决定解析方式 */
    format: 'csv' | 'json' | 'sql'
    /** 文件编码，当前仅支持 UTF-8 */
    encoding: 'utf-8'
  }
  /** 导入目标表 */
  targetTable: {
    schema: string
    name: string
  }
  /** 源字段 → 目标列的映射；字段名与目标列名完全一致时可省略 */
  columnMapping?: ColumnMapping[]
  /** 导入前预览的前若干行数据 */
  previewRows: Record<string, unknown>[]
  /** 向导当前所处步骤 */
  status: 'selecting-file' | 'mapping-columns' | 'confirming' | 'importing' | 'done' | 'error'
}

/** 按行导入请求（CSV/JSON 来源） */
export interface ImportRowsRequest {
  /** 目标表所属 schema */
  schema: string
  /** 目标表名 */
  table: string
  /** 按顺序对应每行数据的目标列名 */
  columns: string[]
  /** 待写入的行数据，每行元素顺序与 columns 一一对应 */
  rows: unknown[][]
}

/** 按 SQL 语句导入请求（SQL 文件来源） */
export interface ImportSqlRequest {
  /** 待顺序执行的 SQL 语句数组 */
  statements: string[]
}

/** 导入操作结果：失败时整体回滚，`succeededCount` 为 0 */
export interface ImportResult {
  /** 成功写入/执行的行数或语句数 */
  succeededCount: number
  /** 首个失败项的位置与原因；全部成功时不存在 */
  failedAt?: { index: number; message: string }
  /** 是否发生了回滚（存在失败项时必为 true） */
  rolledBack: boolean
}

// ─── 数据库备份 ───

/** 备份参数 */
export interface BackupParams {
  connectionId: string
  database: string
  exportDir: string
  /** pg_dump 可执行文件路径，为空则自动探测 PATH */
  pgDumpPath?: string
  /** mysqldump 可执行文件路径，为空则自动探测 PATH */
  mysqlDumpPath?: string
}

/** 备份操作结果 */
export interface BackupResult {
  success: boolean
  filePath: string
  error?: string
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

/** 落盘持久化的模型提供方配置（当前仅 DeepSeek），apiKey 经 safeStorage 加密 */
export interface StoredModelProviderConfig {
  baseURL: string
  model?: string
  encryptedApiKey?: string
}

export interface ConfigStore {
  theme: 'light' | 'dark'
  fontSize: number
  pageSize: number
  connections: StoredConnection[]
  recentFiles: string[]
  /** 「最近项目」列表，按最近使用排序，上限 20 条 */
  recentProjects: RecentProjectEntry[]
  windowBounds?: { x: number; y: number; width: number; height: number }
  /** DeepSeek 模型提供方配置（设置面板"模型配置"页维护） */
  deepseekConfig?: StoredModelProviderConfig
}

/** "模型配置"设置表单读写用的明文形态，仅在 IPC 边界内传输 */
export interface ModelProviderFormValue {
  baseURL: string
  model: string
  apiKey: string
}

/** 模型提供方"测试连接"的结果 */
export interface ModelProviderTestResult {
  success: boolean
  message: string
  latencyMs?: number
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
  /** 获取表的完整 DDL 文本（列定义 + 约束 + 索引） */
  getTableDdl(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<DdlResult>
  /** 获取视图的完整定义语句 */
  getViewDdl(
    connectionId: string,
    database: string,
    schema: string,
    view: string
  ): Promise<DdlResult>
  /** 按行导入数据到目标表，整体事务，任意一行失败即回滚 */
  importRows(
    connectionId: string,
    database: string,
    request: ImportRowsRequest
  ): Promise<ImportResult>
  /** 按顺序执行 SQL 语句导入数据，整体事务，任意一条失败即回滚 */
  importSql(
    connectionId: string,
    database: string,
    request: ImportSqlRequest
  ): Promise<ImportResult>
  /** 导出查询结果为完整数据文件（跳过预览行数上限） */
  exportQueryResult(request: ExportQueryResultRequest): Promise<{ rowCount: number }>
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

  // 模型提供方配置专用方法（主进程内部处理 safeStorage 加解密）
  getModelProviderConfig(): Promise<ModelProviderFormValue>
  saveModelProviderConfig(value: ModelProviderFormValue): Promise<void>
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
