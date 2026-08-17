/**
 * MySQL 数据库驱动
 *
 * 实现 IDatabaseDriver 接口，基于 mysql2 的 Promise API 提供与 PostgreSQLDriver
 * 对等的连接管理、结构浏览、查询执行、DDL 查看、数据导入与 ER 图能力。
 */
import {
  createPool as createMySQLPool,
  Types,
  type Pool,
  type PoolOptions,
  type FieldPacket,
  type RowDataPacket,
  type ResultSetHeader,
  type QueryValues
} from 'mysql2/promise'
import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionResult,
  ConnectionStatus,
  DatabaseInfo,
  ErDiagramData,
  ErDiagramTable,
  ForeignKeyInfo,
  ImportResult,
  IndexInfo,
  QueryField,
  QueryResult,
  RoleInfo,
  RoutineInfo,
  SchemaInfo,
  TableInfo,
  TestResult,
  TriggerInfo
} from '../../../../renderer/src/types/ipc'
import type { IDatabaseDriver } from '../../core/IDatabaseDriver'
import { dbLogger } from '../../../logger/dbLogger'
import { MAX_RESULT_ROWS, truncateRows } from '../../core/resultLimits'

/** mysql2 的 Types 对象为数字码与名称双向映射，此处仅保留“名称 → 数字码”方向再反转，镜像 PostgreSQLDriver 的 OID_TO_TYPE_NAME */
const TYPE_CODE_TO_NAME: Record<number, string> = Object.entries(Types).reduce(
  (acc, [name, code]) => {
    if (typeof code === 'number') {
      acc[code] = name.toLowerCase()
    }
    return acc
  },
  {} as Record<number, string>
)

type MySQLQueryData = RowDataPacket[] | ResultSetHeader

export class MySQLDriver implements IDatabaseDriver {
  readonly id: string
  readonly type = 'mysql' as const

  private baseConfig: ConnectionConfig | null = null
  /** 未显式指定 database 时的管理连接池键；与真实数据库名不会冲突 */
  private managementKey = ''
  private pools = new Map<string, Pool>()

  constructor(id: string) {
    this.id = id
  }

  async connect(config: ConnectionConfig): Promise<ConnectionResult> {
    this.baseConfig = config
    this.managementKey = config.database ?? ''

    const pool = this.createPool(config, config.database)
    const startTime = Date.now()
    const conn = await pool.getConnection()
    try {
      const [rows] = await conn.query<RowDataPacket[]>('SELECT VERSION() AS version')
      this.pools.set(this.managementKey, pool)
      return {
        success: true,
        message: '连接成功',
        connectionId: this.id,
        serverVersion: rows[0]?.version as string,
        latencyMs: Date.now() - startTime
      }
    } catch (error) {
      await pool.end()
      throw error
    } finally {
      conn.release()
    }
  }

  async disconnect(): Promise<void> {
    const pools = Array.from(this.pools.values())
    this.pools.clear()
    this.baseConfig = null
    await Promise.all(pools.map((pool) => pool.end()))
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.runQuery(this.getManagementPool(), 'SHOW DATABASES')
    return result.rows.map((row) => ({ name: row.Database as string }))
  }

  async getRoles(): Promise<RoleInfo[]> {
    const result = await this.runQuery(
      this.getManagementPool(),
      `
        SELECT
          CONCAT(User, '@', Host) AS name,
          (Super_priv = 'Y') AS isSuperuser,
          (account_locked <> 'Y') AS canLogin,
          (Create_priv = 'Y') AS canCreateDb,
          (Create_user_priv = 'Y') AS canCreateRole,
          (Repl_slave_priv = 'Y') AS isReplication,
          max_user_connections AS connectionLimit
        FROM mysql.user
        ORDER BY User, Host
      `
    )
    return result.rows as unknown as RoleInfo[]
  }

  async query(
    database: string,
    sql: string,
    params?: unknown[],
    options?: { unbounded?: boolean }
  ): Promise<QueryResult> {
    return this.runQuery(this.getPool(database), sql, params, options)
  }

  async getSchemas(database: string): Promise<SchemaInfo[]> {
    return [{ name: database, owner: '' }]
  }

  async getTables(database: string, schema: string): Promise<TableInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT
          TABLE_SCHEMA AS \`schema\`,
          TABLE_NAME AS name,
          CASE TABLE_TYPE WHEN 'BASE TABLE' THEN 'table' ELSE 'view' END AS type,
          TABLE_COMMENT AS comment
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME
      `,
      [schema]
    )
    return result.rows as unknown as TableInfo[]
  }

  async getColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT
          COLUMN_NAME AS name,
          COLUMN_TYPE AS dataType,
          (IS_NULLABLE = 'YES') AS nullable,
          COLUMN_DEFAULT AS defaultValue,
          COLUMN_COMMENT AS comment,
          (COLUMN_KEY = 'PRI') AS isPrimaryKey
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `,
      [schema, table]
    )
    return result.rows as unknown as ColumnInfo[]
  }

  async getIndexes(database: string, schema: string, table: string): Promise<IndexInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT
          TABLE_SCHEMA AS tableSchema,
          TABLE_NAME AS tableName,
          INDEX_NAME AS indexName,
          NON_UNIQUE AS nonUnique,
          INDEX_TYPE AS indexType,
          COLUMN_NAME AS columnName
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `,
      [schema, table]
    )

    const indexes = new Map<string, IndexInfo>()
    for (const row of result.rows) {
      const name = row.indexName as string
      let index = indexes.get(name)
      if (!index) {
        index = {
          schema: row.tableSchema as string,
          table: row.tableName as string,
          name,
          columns: [],
          unique: Number(row.nonUnique) === 0,
          isPrimary: name === 'PRIMARY',
          method: row.indexType as string
        }
        indexes.set(name, index)
      }
      index.columns.push(row.columnName as string)
    }
    return Array.from(indexes.values())
  }

  async getTriggers(database: string, schema: string, table: string): Promise<TriggerInfo[]> {
    const listResult = await this.query(
      database,
      `
        SELECT TRIGGER_NAME AS name
        FROM information_schema.TRIGGERS
        WHERE EVENT_OBJECT_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?
        ORDER BY TRIGGER_NAME
      `,
      [schema, table]
    )

    const triggers: TriggerInfo[] = []
    for (const row of listResult.rows) {
      const name = row.name as string
      const showResult = await this.query(database, `SHOW CREATE TRIGGER \`${schema}\`.\`${name}\``)
      const definition = showResult.rows[0]?.['SQL Original Statement'] as string | undefined
      triggers.push({ schema, table, name, definition: definition ?? '', enabled: true })
    }
    return triggers
  }

  async getFunctions(database: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(database, schema, 'FUNCTION', 'function')
  }

  async getProcedures(database: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(database, schema, 'PROCEDURE', 'procedure')
  }

  async getTableDdl(database: string, schema: string, table: string): Promise<string> {
    try {
      const result = await this.query(database, `SHOW CREATE TABLE \`${schema}\`.\`${table}\``)
      const ddl = result.rows[0]?.['Create Table'] as string | undefined
      if (!ddl) throw new Error('SHOW CREATE TABLE 返回结果为空')
      return `${ddl};`
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`表 ${schema}.${table} 不存在或当前用户无权限查看其结构：${detail}`)
    }
  }

  async getViewDdl(database: string, schema: string, view: string): Promise<string> {
    try {
      const result = await this.query(database, `SHOW CREATE VIEW \`${schema}\`.\`${view}\``)
      const ddl = result.rows[0]?.['Create View'] as string | undefined
      if (!ddl) throw new Error('SHOW CREATE VIEW 返回结果为空')
      return `${ddl};`
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`视图 ${schema}.${view} 不存在或当前用户无权限查看其定义：${detail}`)
    }
  }

  async getErDiagramData(database: string, schemas: string[]): Promise<ErDiagramData> {
    const [tablesResult, foreignKeysResult] = await Promise.all([
      this.query(
        database,
        `
          SELECT
            c.TABLE_SCHEMA AS \`schema\`,
            c.TABLE_NAME AS name,
            CASE t.TABLE_TYPE WHEN 'BASE TABLE' THEN 'table' ELSE 'view' END AS type,
            t.TABLE_COMMENT AS comment,
            c.COLUMN_NAME AS columnName,
            c.COLUMN_TYPE AS dataType,
            (c.IS_NULLABLE = 'YES') AS nullable,
            c.COLUMN_DEFAULT AS defaultValue,
            c.COLUMN_COMMENT AS columnComment,
            (c.COLUMN_KEY = 'PRI') AS isPrimaryKey,
            c.ORDINAL_POSITION AS ordinalPosition
          FROM information_schema.COLUMNS c
          JOIN information_schema.TABLES t
            ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
          WHERE c.TABLE_SCHEMA IN (?)
          ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
        `,
        [schemas]
      ),
      this.query(
        database,
        `
          SELECT
            kcu.CONSTRAINT_NAME AS constraintName,
            kcu.TABLE_SCHEMA AS sourceSchema,
            kcu.TABLE_NAME AS sourceTable,
            kcu.COLUMN_NAME AS sourceColumn,
            kcu.ORDINAL_POSITION AS ordinalPosition,
            kcu.REFERENCED_TABLE_SCHEMA AS targetSchema,
            kcu.REFERENCED_TABLE_NAME AS targetTable,
            kcu.REFERENCED_COLUMN_NAME AS targetColumn,
            rc.UPDATE_RULE AS updateRule,
            rc.DELETE_RULE AS deleteRule
          FROM information_schema.KEY_COLUMN_USAGE kcu
          JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
            ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          WHERE kcu.TABLE_SCHEMA IN (?) AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
          ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
        `,
        [schemas]
      )
    ])

    return {
      tables: this.aggregateErDiagramTables(tablesResult.rows),
      foreignKeys: this.aggregateForeignKeys(foreignKeysResult.rows)
    }
  }

  async importRows(
    database: string,
    schema: string,
    table: string,
    columns: string[],
    rows: unknown[][]
  ): Promise<ImportResult> {
    const pool = this.getPool(database)
    const conn = await pool.getConnection()
    const columnList = columns.map((column) => `\`${column}\``).join(', ')
    const placeholders = columns.map(() => '?').join(', ')
    const insertSql = `INSERT INTO \`${schema}\`.\`${table}\` (${columnList}) VALUES (${placeholders})`

    try {
      await conn.beginTransaction()
      for (let index = 0; index < rows.length; index++) {
        try {
          await conn.query(insertSql, rows[index] as unknown as QueryValues)
        } catch (error) {
          await conn.rollback()
          return {
            succeededCount: 0,
            failedAt: { index, message: error instanceof Error ? error.message : '导入失败' },
            rolledBack: true
          }
        }
      }
      await conn.commit()
      return { succeededCount: rows.length, rolledBack: false }
    } finally {
      conn.release()
    }
  }

  async importSql(database: string, statements: string[]): Promise<ImportResult> {
    const pool = this.getPool(database)
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()
      for (let index = 0; index < statements.length; index++) {
        try {
          await conn.query(statements[index])
        } catch (error) {
          await conn.rollback()
          return {
            succeededCount: 0,
            failedAt: { index, message: error instanceof Error ? error.message : '导入失败' },
            rolledBack: true
          }
        }
      }
      await conn.commit()
      return { succeededCount: statements.length, rolledBack: false }
    } finally {
      conn.release()
    }
  }

  getStatus(): ConnectionStatus {
    return { id: this.id, state: this.pools.size === 0 ? 'disconnected' : 'connected' }
  }

  /**
   * 释放指定数据库的连接池
   *
   * 管理连接池（承载 `getDatabases`/`getRoles` 等跨数据库能力）需保持常驻，故静默跳过。
   */
  async releaseDatabase(database: string): Promise<void> {
    if (database === this.managementKey) return
    const pool = this.pools.get(database)
    if (!pool) return
    this.pools.delete(database)
    await pool.end()
    dbLogger.log('info', 'connection', `释放连接池 ${this.id}/${database}`, {
      connectionId: this.id,
      database
    })
  }

  static async testConnection(config: ConnectionConfig): Promise<TestResult> {
    const pool = new MySQLDriver('test').createPool(config, config.database)
    const startTime = Date.now()
    try {
      const conn = await pool.getConnection()
      try {
        const [rows] = await conn.query<RowDataPacket[]>('SELECT VERSION() AS version')
        return {
          success: true,
          message: '连接成功',
          serverVersion: rows[0]?.version as string,
          latencyMs: Date.now() - startTime
        }
      } finally {
        conn.release()
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '连接失败' }
    } finally {
      await pool.end()
    }
  }

  private async getRoutines(
    database: string,
    schema: string,
    routineType: 'FUNCTION' | 'PROCEDURE',
    kind: RoutineInfo['kind']
  ): Promise<RoutineInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT
          r.ROUTINE_SCHEMA AS \`schema\`,
          r.ROUTINE_NAME AS name,
          (
            SELECT GROUP_CONCAT(
              CONCAT(COALESCE(p.PARAMETER_MODE, ''), ' ', p.PARAMETER_NAME, ' ', p.DTD_IDENTIFIER)
              ORDER BY p.ORDINAL_POSITION SEPARATOR ', '
            )
            FROM information_schema.PARAMETERS p
            WHERE p.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA
              AND p.SPECIFIC_NAME = r.ROUTINE_NAME
              AND p.ROUTINE_TYPE = r.ROUTINE_TYPE
              AND p.PARAMETER_NAME IS NOT NULL
          ) AS argumentsSignature,
          r.DTD_IDENTIFIER AS returnType,
          r.ROUTINE_COMMENT AS comment
        FROM information_schema.ROUTINES r
        WHERE r.ROUTINE_SCHEMA = ? AND r.ROUTINE_TYPE = ?
        ORDER BY r.ROUTINE_NAME
      `,
      [schema, routineType]
    )
    return (result.rows as unknown as Omit<RoutineInfo, 'kind'>[]).map((row) => ({ ...row, kind }))
  }

  private aggregateErDiagramTables(rows: Record<string, unknown>[]): ErDiagramTable[] {
    const tables = new Map<string, ErDiagramTable>()
    for (const row of rows) {
      const key = `${row.schema as string}.${row.name as string}`
      let table = tables.get(key)
      if (!table) {
        table = {
          schema: row.schema as string,
          name: row.name as string,
          type: row.type as 'table' | 'view',
          comment: (row.comment as string) || undefined,
          columns: []
        }
        tables.set(key, table)
      }
      table.columns.push({
        name: row.columnName as string,
        dataType: row.dataType as string,
        nullable: Boolean(row.nullable),
        isPrimaryKey: Boolean(row.isPrimaryKey),
        defaultValue: (row.defaultValue as string) ?? undefined,
        comment: (row.columnComment as string) || undefined
      })
    }
    return Array.from(tables.values())
  }

  private aggregateForeignKeys(rows: Record<string, unknown>[]): ForeignKeyInfo[] {
    const foreignKeys = new Map<string, ForeignKeyInfo>()
    for (const row of rows) {
      const key = `${row.sourceSchema as string}.${row.constraintName as string}`
      let fk = foreignKeys.get(key)
      if (!fk) {
        fk = {
          constraintName: row.constraintName as string,
          sourceSchema: row.sourceSchema as string,
          sourceTable: row.sourceTable as string,
          sourceColumns: [],
          targetSchema: row.targetSchema as string,
          targetTable: row.targetTable as string,
          targetColumns: [],
          updateRule: (row.updateRule as string) ?? undefined,
          deleteRule: (row.deleteRule as string) ?? undefined
        }
        foreignKeys.set(key, fk)
      }
      fk.sourceColumns.push(row.sourceColumn as string)
      fk.targetColumns.push(row.targetColumn as string)
    }
    return Array.from(foreignKeys.values())
  }

  private getManagementPool(): Pool {
    if (!this.baseConfig) throw new Error('未连接到数据库')
    const existing = this.pools.get(this.managementKey)
    if (existing) return existing
    const pool = this.createPool(this.baseConfig, this.managementKey || undefined)
    this.pools.set(this.managementKey, pool)
    return pool
  }

  private getPool(database: string): Pool {
    if (!this.baseConfig) throw new Error('未连接到数据库')
    const existing = this.pools.get(database)
    if (existing) return existing
    const pool = this.createPool(this.baseConfig, database)
    this.pools.set(database, pool)
    return pool
  }

  private createPool(config: ConnectionConfig, database?: string): Pool {
    const poolOptions: PoolOptions = {
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0
    }
    if (database) poolOptions.database = database
    if (config.ssl?.enabled) {
      poolOptions.ssl = {
        rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
        ca: config.ssl.ca,
        cert: config.ssl.cert,
        key: config.ssl.key
      }
    }

    const pool = createMySQLPool(poolOptions)
    dbLogger.log('info', 'connection', `创建连接池 ${this.id}/${database ?? '(未指定数据库)'}`, {
      connectionId: this.id,
      database
    })
    return pool
  }

  private async runQuery(
    pool: Pool,
    sql: string,
    params?: unknown[],
    options?: { unbounded?: boolean }
  ): Promise<QueryResult> {
    const database = this.findDatabaseForPool(pool)
    const startTime = Date.now()
    try {
      const [data, fields] = params
        ? await pool.query<MySQLQueryData>(sql, params as unknown as QueryValues)
        : await pool.query<MySQLQueryData>(sql)
      const durationMs = Date.now() - startTime
      dbLogger.log('info', 'sql', `[${durationMs}ms] ${sql}`, { connectionId: this.id, database })

      const rawRows = Array.isArray(data) ? (data as RowDataPacket[]) : []
      const { rows, truncated } = options?.unbounded
        ? { rows: rawRows, truncated: false }
        : truncateRows(rawRows, MAX_RESULT_ROWS)

      return {
        fields: fields.map((field) => this.mapField(field)),
        rows,
        rowCount: Array.isArray(data) ? data.length : (data as ResultSetHeader).affectedRows,
        durationMs,
        truncated
      }
    } catch (error) {
      dbLogger.log(
        'error',
        'sql',
        `SQL 执行失败: ${sql} — ${error instanceof Error ? error.message : String(error)}`,
        { connectionId: this.id, database }
      )
      throw error
    }
  }

  private findDatabaseForPool(pool: Pool): string | undefined {
    for (const [database, candidate] of this.pools) {
      if (candidate === pool) return database || undefined
    }
    return undefined
  }

  private mapField(field: FieldPacket): QueryField {
    return {
      name: field.name,
      dataType: (field.type !== undefined && TYPE_CODE_TO_NAME[field.type]) || 'unknown',
      nullable: true
    }
  }
}
