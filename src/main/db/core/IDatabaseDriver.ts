/**
 * 数据库驱动契约
 *
 * 宪法 IV：采用适配器/驱动模式，所有数据库驱动必须实现统一接口，
 * 为多数据库支持预留扩展点。新增数据库类型只需新增驱动实现。
 */
import type {
  ConnectionConfig,
  ConnectionResult,
  ConnectionStatus,
  QueryResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  TriggerInfo,
  RoutineInfo,
  RoleInfo,
  TestResult,
  ErDiagramData,
  ImportResult
} from '../../../renderer/src/types/ipc'
import type { DatabaseType } from './types'

export interface IDatabaseDriver {
  readonly id: string
  readonly type: DatabaseType

  /** 建立服务器级管理连接 */
  connect(config: ConnectionConfig): Promise<ConnectionResult>
  /** 关闭该连接下全部数据库连接池 */
  disconnect(): Promise<void>
  /** 获取当前账号在服务器上有权限访问的全部数据库 */
  getDatabases(): Promise<DatabaseInfo[]>
  /** 获取服务器上全部角色（集群级安全对象）；不支持角色概念的类型可不实现 */
  getRoles?(): Promise<RoleInfo[]>

  query(database: string, sql: string, params?: unknown[]): Promise<QueryResult>
  getSchemas(database: string): Promise<SchemaInfo[]>
  getTables(database: string, schema: string): Promise<TableInfo[]>
  getColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]>
  /** 获取表的索引列表 */
  getIndexes(database: string, schema: string, table: string): Promise<IndexInfo[]>
  /** 获取表的触发器列表 */
  getTriggers(database: string, schema: string, table: string): Promise<TriggerInfo[]>

  /** PostgreSQL 等支持存储函数的数据库实现；不支持该概念的类型可不实现 */
  getFunctions?(database: string, schema: string): Promise<RoutineInfo[]>
  /** PostgreSQL 等支持存储过程的数据库实现；不支持该概念的类型可不实现 */
  getProcedures?(database: string, schema: string): Promise<RoutineInfo[]>

  /** 获取 ER 图分析所需的表结构与外键数据；不支持该能力的类型可不实现 */
  getErDiagramData?(database: string, schemas: string[]): Promise<ErDiagramData>

  /** 获取表的完整 DDL 文本；PostgreSQL 无原生 SHOW CREATE TABLE，需组合系统目录查询拼装；不支持该能力的类型可不实现 */
  getTableDdl?(database: string, schema: string, table: string): Promise<string>
  /** 获取视图的完整定义语句，基于 pg_get_viewdef；不支持该能力的类型可不实现 */
  getViewDdl?(database: string, schema: string, view: string): Promise<string>

  /** 按行导入数据到目标表，整体事务：任意一行失败立即回滚 */
  importRows(
    database: string,
    schema: string,
    table: string,
    columns: string[],
    rows: unknown[][]
  ): Promise<ImportResult>
  /** 按顺序执行 SQL 语句数组导入数据，整体事务：任意一条失败立即回滚 */
  importSql(database: string, statements: string[]): Promise<ImportResult>

  getStatus(): ConnectionStatus
}

export interface IDatabaseDriverStatic {
  testConnection(config: ConnectionConfig): Promise<TestResult>
}
