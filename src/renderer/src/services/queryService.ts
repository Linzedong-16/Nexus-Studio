import type {
  ConnectionConfig,
  TestResult,
  ConnectionResult,
  QueryResult,
  SchemaInfo,
  TableInfo,
  ColumnInfo
} from '../types/ipc'

/**
 * 数据库查询服务层
 *
 * 宪法 III：组件不直接调用 window.api，通过 Service 层封装
 * 好处：统一错误处理、性能计时、日志记录
 *
 * 当前为占位实现，Phase 2 接入真实 pg 后替换
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
   * 建立数据库连接
   */
  async connect(config: ConnectionConfig): Promise<ConnectionResult> {
    return window.api.db.connect(config)
  },

  /**
   * 断开数据库连接
   */
  async disconnect(connectionId: string): Promise<void> {
    return window.api.db.disconnect(connectionId)
  },

  /**
   * 执行 SQL 查询，自动计时
   */
  async execute(connectionId: string, sql: string): Promise<QueryResult> {
    const startTime = performance.now()
    const result = await window.api.db.query(connectionId, sql)
    const durationMs = Math.round(performance.now() - startTime)
    return { ...result, durationMs }
  },

  /**
   * 批量执行多条 SQL 语句
   */
  async executeMultiple(connectionId: string, statements: string[]): Promise<QueryResult[]> {
    const results: QueryResult[] = []
    for (const sql of statements) {
      const result = await this.execute(connectionId, sql)
      results.push(result)
    }
    return results
  },

  /**
   * 获取 Schema 列表
   */
  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    return window.api.db.getSchemas(connectionId)
  },

  /**
   * 获取表列表
   */
  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    return window.api.db.getTables(connectionId, schema)
  },

  /**
   * 获取列信息
   */
  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    return window.api.db.getColumns(connectionId, schema, table)
  }
}
