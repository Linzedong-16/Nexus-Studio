/**
 * 数据库驱动管理器
 *
 * 全局单例，负责：
 * - 维护所有活跃的数据库驱动实例
 * - 提供统一的数据库无关操作入口
 * - 转发连接状态变更事件到渲染进程
 * - 应用退出时优雅关闭所有连接
 * - 应用重启后自动重连（从 configStore 读取配置）
 */
import { EventEmitter } from 'events'
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
  ErDiagramData,
  ImportResult
} from '../../../renderer/src/types/ipc'
import type { IDatabaseDriver } from './IDatabaseDriver'
import { createDriver } from '../factory'
import { dbLogger } from '../../logger/dbLogger'

/** 从持久化存储中加载连接配置的回调函数类型 */
export type ConfigLoader = (connectionId: string) => ConnectionConfig | null

export class DriverManager extends EventEmitter {
  private drivers = new Map<string, IDatabaseDriver>()
  private configLoader: ConfigLoader | null = null

  /**
   * 注入配置加载器，用于自动重连
   *
   * 应用重启后，workspace 标签页恢复时会触发查询，
   * 但 DriverManager 中的连接是内存级的，重启后丢失。
   * 通过 configLoader，DriverManager 可以在需要时自动从持久化存储中
   * 读取配置并重新建立连接。
   *
   * @param loader - 根据 connectionId 返回 ConnectionConfig 或 null 的回调
   */
  setConfigLoader(loader: ConfigLoader): void {
    this.configLoader = loader
  }

  async connect(config: ConnectionConfig): Promise<ConnectionResult> {
    const existing = this.drivers.get(config.id)
    if (existing) {
      await existing.disconnect()
    }

    const driver = createDriver(config.type, config.id)
    this.drivers.set(config.id, driver)

    dbLogger.log('info', 'connection', `正在创建连接 ${config.id}`, { connectionId: config.id })
    try {
      const result = await driver.connect(config)
      this.emitStatus(config.id)
      dbLogger.log('info', 'connection', `连接 ${config.id} 已建立`, { connectionId: config.id })
      return result
    } catch (error) {
      this.drivers.delete(config.id)
      this.emitStatus(config.id, error)
      dbLogger.log(
        'error',
        'connection',
        `连接 ${config.id} 建立失败: ${error instanceof Error ? error.message : String(error)}`,
        { connectionId: config.id }
      )
      throw error
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const driver = this.drivers.get(connectionId)
    if (!driver) return

    dbLogger.log('info', 'connection', `正在关闭连接 ${connectionId}`, { connectionId })
    try {
      await driver.disconnect()
      dbLogger.log('info', 'connection', `连接 ${connectionId} 已关闭`, { connectionId })
    } finally {
      this.drivers.delete(connectionId)
      this.emitStatus(connectionId)
    }
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.drivers.keys())
    await Promise.all(ids.map((id) => this.disconnect(id)))
  }

  async getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    return driver.getDatabases()
  }

  /** 驱动未实现 getRoles 时返回空数组而非抛错，见 contracts/db-ipc.md 错误契约 */
  async getRoles(connectionId: string): Promise<RoleInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getRoles !== 'function') return []
    return driver.getRoles()
  }

  async query(
    connectionId: string,
    database: string,
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult> {
    const driver = await this.ensureConnection(connectionId)
    return driver.query(database, sql, params)
  }

  async getSchemas(connectionId: string, database: string): Promise<SchemaInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    return driver.getSchemas(database)
  }

  async getTables(connectionId: string, database: string, schema: string): Promise<TableInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    return driver.getTables(database, schema)
  }

  async getColumns(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    return driver.getColumns(database, schema, table)
  }

  async getIndexes(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<IndexInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getIndexes !== 'function') return []
    return driver.getIndexes(database, schema, table)
  }

  async getTriggers(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TriggerInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getTriggers !== 'function') return []
    return driver.getTriggers(database, schema, table)
  }

  /** 驱动未实现 getFunctions 时返回空数组而非抛错，见 contracts/db-ipc.md 错误契约 */
  async getFunctions(
    connectionId: string,
    database: string,
    schema: string
  ): Promise<RoutineInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getFunctions !== 'function') return []
    return driver.getFunctions(database, schema)
  }

  /** 驱动未实现 getProcedures 时返回空数组而非抛错，见 contracts/db-ipc.md 错误契约 */
  async getProcedures(
    connectionId: string,
    database: string,
    schema: string
  ): Promise<RoutineInfo[]> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getProcedures !== 'function') return []
    return driver.getProcedures(database, schema)
  }

  /** 驱动未实现 getErDiagramData 时抛出明确的不支持提示，见 contracts/ipc-er-diagram.md */
  async getErDiagramData(
    connectionId: string,
    database: string,
    schemas: string[]
  ): Promise<ErDiagramData> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getErDiagramData !== 'function') {
      throw new Error('当前数据库类型暂不支持 ER 分析')
    }
    return driver.getErDiagramData(database, schemas)
  }

  /** 驱动未实现 getTableDdl 时抛出明确的不支持提示，见 contracts/db-ipc-productivity.md */
  async getTableDdl(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<string> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getTableDdl !== 'function') {
      throw new Error('不支持当前数据库类型的 DDL 查看')
    }
    return driver.getTableDdl(database, schema, table)
  }

  /** 驱动未实现 getViewDdl 时抛出明确的不支持提示，见 contracts/db-ipc-productivity.md */
  async getViewDdl(
    connectionId: string,
    database: string,
    schema: string,
    view: string
  ): Promise<string> {
    const driver = await this.ensureConnection(connectionId)
    if (typeof driver.getViewDdl !== 'function') {
      throw new Error('不支持当前数据库类型的 DDL 查看')
    }
    return driver.getViewDdl(database, schema, view)
  }

  /** 按行导入数据到目标表，必需方法，直接透传 */
  async importRows(
    connectionId: string,
    database: string,
    schema: string,
    table: string,
    columns: string[],
    rows: unknown[][]
  ): Promise<ImportResult> {
    const driver = await this.ensureConnection(connectionId)
    return driver.importRows(database, schema, table, columns, rows)
  }

  /** 按顺序执行 SQL 语句导入数据，必需方法，直接透传 */
  async importSql(
    connectionId: string,
    database: string,
    statements: string[]
  ): Promise<ImportResult> {
    const driver = await this.ensureConnection(connectionId)
    return driver.importSql(database, statements)
  }

  getStatus(connectionId: string): ConnectionStatus {
    const driver = this.drivers.get(connectionId)
    if (driver) return driver.getStatus()
    return { id: connectionId, state: 'disconnected' }
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.on('status-changed', listener)
    return () => {
      this.off('status-changed', listener)
    }
  }

  /**
   * 确保连接存在，不存在时尝试自动重连
   *
   * 应用重启后，workspace 标签页恢复时可能触发对已断开连接的查询。
   * 此方法会先从内存中查找，若未找到则通过 configLoader 从持久化存储
   * 中读取配置并自动重新建立连接。
   *
   * @param connectionId - 连接的唯一标识符
   * @returns 活跃的数据库驱动实例
   * @throws 当连接配置不存在或重连失败时抛出异常
   */
  private async ensureConnection(connectionId: string): Promise<IDatabaseDriver> {
    const existing = this.drivers.get(connectionId)
    if (existing) return existing

    // 自动重连：从持久化存储中读取配置
    if (!this.configLoader) {
      throw new Error(`未找到连接: ${connectionId}（配置加载器未注入）`)
    }

    const config = this.configLoader(connectionId)
    if (!config) {
      throw new Error(`未找到连接: ${connectionId}（配置不存在）`)
    }

    dbLogger.log('info', 'connection', `连接 ${connectionId} 不存在，尝试自动重连`, {
      connectionId
    })

    // 使用配置重新建立连接
    const driver = createDriver(config.type, config.id)
    this.drivers.set(config.id, driver)

    try {
      const result = await driver.connect(config)
      this.emitStatus(config.id)
      if (!result.success) {
        this.drivers.delete(config.id)
        throw new Error(result.message)
      }
      return driver
    } catch (error) {
      this.drivers.delete(config.id)
      this.emitStatus(config.id, error)
      throw error
    }
  }

  private emitStatus(connectionId: string, error?: unknown): void {
    const status = this.getStatus(connectionId)
    if (error instanceof Error) {
      status.state = 'error'
      status.error = error.message
    }
    this.emit('status-changed', status)
  }
}

export const driverManager = new DriverManager()
