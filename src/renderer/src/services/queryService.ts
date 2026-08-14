import type {
  ConnectionConfig,
  TestResult,
  ConnectionResult,
  QueryResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  TriggerInfo,
  RoutineInfo,
  RoleInfo,
  ErDiagramData,
  DdlResult,
  DbLogEntry,
  ImportRowsRequest,
  ImportSqlRequest,
  ImportResult,
  BackupResult
} from '../types/ipc'

/**
 * 数据库查询服务层
 *
 * 宪法 III：组件不直接调用 window.api，通过 Service 层封装
 * 好处：统一错误处理、性能计时、日志记录
 */

export const queryService = {
  /**
   * 测试数据库连接
   */
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    const startTime = performance.now()
    const result = await window.api.db.testConnection(config)
    const latencyMs = Math.round(performance.now() - startTime)
    return { ...result, latencyMs }
  },

  /**
   * 建立服务器级数据库连接
   */
  async connect(config: ConnectionConfig): Promise<ConnectionResult> {
    return window.api.db.connect(config)
  },

  /**
   * 断开数据库连接（关闭该连接下全部数据库池）
   */
  async disconnect(connectionId: string): Promise<void> {
    return window.api.db.disconnect(connectionId)
  },

  /**
   * 获取当前账号在服务器上有权限访问的全部数据库
   */
  async getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
    return window.api.db.getDatabases(connectionId)
  },

  /**
   * 获取服务器上全部角色（集群级安全对象，PostgreSQL 专属）
   */
  async getRoles(connectionId: string): Promise<RoleInfo[]> {
    return window.api.db.getRoles(connectionId)
  },

  /**
   * 在指定数据库上执行 SQL 查询，自动计时
   */
  async execute(
    connectionId: string,
    database: string,
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult> {
    const startTime = performance.now()
    const result = await window.api.db.query(connectionId, database, sql, params)
    const durationMs = Math.round(performance.now() - startTime)
    return { ...result, durationMs }
  },

  /**
   * 在指定数据库上批量执行多条 SQL 语句
   */
  async executeMultiple(
    connectionId: string,
    database: string,
    statements: string[]
  ): Promise<QueryResult[]> {
    const results: QueryResult[] = []
    for (const sql of statements) {
      const result = await this.execute(connectionId, database, sql)
      results.push(result)
    }
    return results
  },

  /**
   * 获取指定数据库下的 Schema 列表
   */
  async getSchemas(connectionId: string, database: string): Promise<SchemaInfo[]> {
    return window.api.db.getSchemas(connectionId, database)
  },

  /**
   * 获取指定 Schema 下的表/视图列表
   */
  async getTables(connectionId: string, database: string, schema: string): Promise<TableInfo[]> {
    return window.api.db.getTables(connectionId, database, schema)
  },

  /**
   * 获取指定表的列信息
   */
  async getColumns(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]> {
    return window.api.db.getColumns(connectionId, database, schema, table)
  },

  /**
   * 获取指定表的索引列表
   */
  async getIndexes(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<IndexInfo[]> {
    return window.api.db.getIndexes(connectionId, database, schema, table)
  },

  /**
   * 获取指定表的触发器列表
   */
  async getTriggers(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TriggerInfo[]> {
    return window.api.db.getTriggers(connectionId, database, schema, table)
  },

  /**
   * 获取指定 Schema 下的函数列表（PostgreSQL 专属模块）
   */
  async getFunctions(
    connectionId: string,
    database: string,
    schema: string
  ): Promise<RoutineInfo[]> {
    return window.api.db.getFunctions(connectionId, database, schema)
  },

  /**
   * 获取指定 Schema 下的存储过程列表（PostgreSQL 专属模块）
   */
  async getProcedures(
    connectionId: string,
    database: string,
    schema: string
  ): Promise<RoutineInfo[]> {
    return window.api.db.getProcedures(connectionId, database, schema)
  },

  /**
   * 获取 ER 图分析所需的表结构与外键数据
   */
  async getErDiagramData(
    connectionId: string,
    database: string,
    schemas: string[]
  ): Promise<ErDiagramData> {
    return window.api.db.getErDiagramData(connectionId, database, schemas)
  },

  /**
   * 获取表的完整 DDL 文本（列定义 + 约束 + 索引）
   */
  async getTableDdl(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<DdlResult> {
    return window.api.db.getTableDdl(connectionId, database, schema, table)
  },

  /**
   * 获取视图的完整定义语句
   */
  async getViewDdl(
    connectionId: string,
    database: string,
    schema: string,
    view: string
  ): Promise<DdlResult> {
    return window.api.db.getViewDdl(connectionId, database, schema, view)
  },

  /**
   * 按行导入数据到目标表，整体事务，任意一行失败即回滚
   */
  async importRows(
    connectionId: string,
    database: string,
    request: ImportRowsRequest
  ): Promise<ImportResult> {
    return window.api.db.importRows(connectionId, database, request)
  },

  /**
   * 按顺序执行 SQL 语句导入数据，整体事务，任意一条失败即回滚
   */
  async importSql(
    connectionId: string,
    database: string,
    request: ImportSqlRequest
  ): Promise<ImportResult> {
    return window.api.db.importSql(connectionId, database, request)
  },

  /**
   * 备份数据库，通过 pg_dump 导出到指定目录
   */
  async backupDatabase(
    connectionId: string,
    database: string,
    exportDir: string,
    pgDumpPath?: string
  ): Promise<BackupResult> {
    return window.api.db.backupDatabase(connectionId, database, exportDir, pgDumpPath)
  },

  /**
   * 获取数据库日志历史（进程内环形缓冲，上限 500 条）
   */
  async getLogBacklog(): Promise<DbLogEntry[]> {
    return window.api.log.getBacklog()
  },

  /**
   * 订阅实时数据库日志推送
   */
  onDbLog(callback: (entry: DbLogEntry) => void): () => void {
    return window.api.log.onLog(callback)
  }
}
