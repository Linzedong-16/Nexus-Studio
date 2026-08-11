/**
 * PostgreSQL 驱动实现
 *
 * 基于 node-postgres (pg) 的 IDatabaseDriver 实现。
 * 适配器层只做接口适配，不修改 pg 的默认行为。
 *
 * PostgreSQL 协议层不支持跨库会话，因此本驱动按数据库名维护独立的
 * 连接池集合：`connect()` 只建立"管理连接"（用于列出服务器上的数据库），
 * 实际访问某个数据库时才按需创建/复用该数据库专属的连接池。
 */
import { Pool, types, type PoolConfig, type QueryResult as PgQueryResult } from 'pg'
import type {
  ConnectionConfig,
  ConnectionResult,
  ConnectionStatus,
  QueryResult,
  QueryField,
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
  ErDiagramTable,
  ForeignKeyInfo
} from '../../../../renderer/src/types/ipc'
import type { IDatabaseDriver } from '../../core/IDatabaseDriver'

/** 未指定数据库时使用的默认管理数据库 */
const DEFAULT_MANAGEMENT_DATABASE = 'postgres'

/** 由 pg.types.builtins（name → OID）构建 OID → 名称 的反向映射 */
const OID_TO_TYPE_NAME: Record<number, string> = Object.entries(types.builtins).reduce(
  (acc, [name, oid]) => {
    acc[oid as number] = name
    return acc
  },
  {} as Record<number, string>
)

/**
 * 确保值为数组类型
 *
 * pg 驱动在解析 PostgreSQL 数组时，`COALESCE(array_agg(...), '{}')` 中的
 * 字符串 `'{}'` 可能不会被转换为数组，而是保持为字符串形式。
 * 此函数将字符串形式的 PostgreSQL 数组（如 `'{a,b,c}'`）转换为 JavaScript 数组，
 * 已是数组的值直接返回，null/undefined 返回空数组。
 *
 * @param value - 可能是数组、字符串或 null 的值
 * @returns 归一化后的 JavaScript 字符串数组
 */
function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    // 解析 PostgreSQL 数组字符串表示: '{val1,val2,val3}' → ['val1', 'val2', 'val3']
    const trimmed = value.trim()
    if (trimmed === '{}' || trimmed === '') return []
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^"(.*)"$/, '$1'))
  }
  return []
}

export class PostgreSQLDriver implements IDatabaseDriver {
  readonly id: string
  readonly type = 'postgresql' as const

  private baseConfig: ConnectionConfig | null = null
  private managementDatabase = DEFAULT_MANAGEMENT_DATABASE
  private pools = new Map<string, Pool>()

  constructor(id: string) {
    this.id = id
  }

  async connect(config: ConnectionConfig): Promise<ConnectionResult> {
    this.baseConfig = config
    this.managementDatabase = config.database || DEFAULT_MANAGEMENT_DATABASE

    const pool = this.createPool(config, this.managementDatabase)
    const startTime = Date.now()
    const client = await pool.connect()
    try {
      const result = await client.query('SELECT version()')
      this.pools.set(this.managementDatabase, pool)
      const latencyMs = Date.now() - startTime
      return {
        success: true,
        message: '连接成功',
        connectionId: this.id,
        serverVersion: result.rows[0]?.version as string,
        latencyMs
      }
    } catch (error) {
      await pool.end()
      throw error
    } finally {
      client.release()
    }
  }

  async disconnect(): Promise<void> {
    const pools = Array.from(this.pools.values())
    this.pools.clear()
    this.baseConfig = null
    await Promise.all(pools.map((pool) => pool.end()))
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.runQuery(
      this.getPool(this.managementDatabase),
      `
        SELECT datname AS name, pg_catalog.pg_get_userbyid(datdba) AS owner
        FROM pg_catalog.pg_database
        WHERE datistemplate = false
        ORDER BY datname
      `
    )
    return result.rows as unknown as DatabaseInfo[]
  }

  async query(database: string, sql: string, params?: unknown[]): Promise<QueryResult> {
    return this.runQuery(this.getPool(database), sql, params)
  }

  async getRoles(): Promise<RoleInfo[]> {
    const result = await this.runQuery(
      this.getPool(this.managementDatabase),
      `
        SELECT
          rolname AS name,
          rolsuper AS "isSuperuser",
          rolcanlogin AS "canLogin",
          rolcreatedb AS "canCreateDb",
          rolcreaterole AS "canCreateRole",
          rolreplication AS "isReplication",
          rolconnlimit AS "connectionLimit",
          rolvaliduntil::text AS "validUntil"
        FROM pg_catalog.pg_roles
        ORDER BY rolname
      `
    )
    return result.rows as unknown as RoleInfo[]
  }

  async getSchemas(database: string): Promise<SchemaInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT schema_name AS name, schema_owner AS owner
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
          AND schema_name NOT LIKE 'pg_toast%'
        ORDER BY schema_name
      `
    )
    return result.rows as unknown as SchemaInfo[]
  }

  async getTables(database: string, schema: string): Promise<TableInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT
          table_schema AS schema,
          table_name AS name,
          CASE table_type WHEN 'BASE TABLE' THEN 'table' ELSE 'view' END AS type,
          obj_description(
            (quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass,
            'pg_class'
          ) AS comment
        FROM information_schema.tables
        WHERE table_schema = $1
        ORDER BY table_name
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
          c.column_name AS name,
          c.data_type AS "dataType",
          (c.is_nullable = 'YES') AS nullable,
          c.column_default AS "defaultValue",
          pgd.description AS comment,
          EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = c.table_schema
              AND tc.table_name = c.table_name
              AND kcu.column_name = c.column_name
          ) AS "isPrimaryKey"
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_description pgd
          ON pgd.objoid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass::oid
          AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `,
      [schema, table]
    )
    return result.rows as unknown as ColumnInfo[]
  }

  async getFunctions(database: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(database, schema, 'FUNCTION', 'function')
  }

  async getProcedures(database: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(database, schema, 'PROCEDURE', 'procedure')
  }

  async getErDiagramData(database: string, schemas: string[]): Promise<ErDiagramData> {
    const [tablesResult, foreignKeysResult] = await Promise.all([
      this.query(
        database,
        `
          SELECT
            c.table_schema  AS schema,
            c.table_name    AS name,
            c.column_name   AS "columnName",
            c.data_type     AS "dataType",
            (c.is_nullable = 'YES') AS nullable,
            c.column_default AS "defaultValue",
            c.ordinal_position AS "ordinalPosition",
            t.table_type    AS "tableType",
            obj_description(pgc.oid, 'pg_class') AS "tableComment",
            pgd.description AS "columnComment",
            EXISTS (
              SELECT 1 FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
              WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = c.table_schema
                AND tc.table_name = c.table_name
                AND kcu.column_name = c.column_name
            ) AS "isPrimaryKey"
          FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          LEFT JOIN pg_catalog.pg_class pgc
            ON pgc.relname = c.table_name
            AND pgc.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = c.table_schema)
          LEFT JOIN pg_catalog.pg_description pgd
            ON pgd.objoid = pgc.oid AND pgd.objsubid = c.ordinal_position
          WHERE c.table_schema = ANY($1)
          ORDER BY c.table_schema, c.table_name, c.ordinal_position
        `,
        [schemas]
      ),
      this.query(
        database,
        `
          SELECT
            tc.constraint_name AS "constraintName",
            tc.table_schema     AS "sourceSchema",
            tc.table_name       AS "sourceTable",
            kcu.column_name     AS "sourceColumn",
            kcu.ordinal_position AS "ordinalPosition",
            ccu.table_schema    AS "targetSchema",
            ccu.table_name      AS "targetTable",
            ccu.column_name     AS "targetColumn",
            rc.update_rule      AS "updateRule",
            rc.delete_rule      AS "deleteRule"
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
          JOIN information_schema.constraint_column_usage ccu
            ON rc.unique_constraint_name = ccu.constraint_name
            AND rc.unique_constraint_schema = ccu.constraint_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = ANY($1)
          ORDER BY tc.constraint_name, kcu.ordinal_position
        `,
        [schemas]
      )
    ])

    return {
      tables: this.aggregateErDiagramTables(tablesResult.rows),
      foreignKeys: this.aggregateForeignKeys(foreignKeysResult.rows)
    }
  }

  async getIndexes(database: string, schema: string, table: string): Promise<IndexInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT
          n.nspname AS schema,
          tab.relname AS table,
          idx.relname AS name,
          am.amname AS method,
          ix.indisunique AS unique,
          ix.indisprimary AS "isPrimary",
          COALESCE(
            (
              SELECT array_agg(att.attname ORDER BY k.ord)
              FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_catalog.pg_attribute att
                ON att.attrelid = tab.oid AND att.attnum = k.attnum
              WHERE k.attnum > 0
            ),
            ARRAY[]::text[]
          ) AS columns,
          pg_catalog.pg_get_indexdef(idx.oid) AS indexdef
        FROM pg_catalog.pg_index ix
        JOIN pg_catalog.pg_class tab ON tab.oid = ix.indrelid
        JOIN pg_catalog.pg_class idx ON idx.oid = ix.indexrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = tab.relnamespace
        JOIN pg_catalog.pg_am am ON am.oid = idx.relam
        WHERE n.nspname = $1 AND tab.relname = $2
        ORDER BY idx.relname
      `,
      [schema, table]
    )
    // 确保 columns 字段始终是数组（pg 驱动在某些情况下返回 PostgreSQL 数组的字符串表示）
    return result.rows.map((row) => ({
      ...row,
      columns: ensureArray(row.columns)
    })) as unknown as IndexInfo[]
  }

  async getTriggers(database: string, schema: string, table: string): Promise<TriggerInfo[]> {
    const result = await this.query(
      database,
      `
        SELECT
          n.nspname AS schema,
          c.relname AS table,
          t.tgname AS name,
          pg_catalog.pg_get_triggerdef(t.oid) AS definition,
          t.tgenabled <> 'D' AS enabled
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND NOT t.tgisinternal
        ORDER BY t.tgname
      `,
      [schema, table]
    )
    return result.rows as unknown as TriggerInfo[]
  }

  getStatus(): ConnectionStatus {
    if (this.pools.size === 0) {
      return { id: this.id, state: 'disconnected' }
    }
    return { id: this.id, state: 'connected' }
  }

  static async testConnection(config: ConnectionConfig): Promise<TestResult> {
    const pool = new PostgreSQLDriver('test').createPool(
      config,
      config.database || DEFAULT_MANAGEMENT_DATABASE
    )
    const startTime = Date.now()

    try {
      const client = await pool.connect()
      try {
        const result = await client.query('SELECT version()')
        return {
          success: true,
          message: '连接成功',
          serverVersion: result.rows[0]?.version as string,
          latencyMs: Date.now() - startTime
        }
      } finally {
        client.release()
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    } finally {
      await pool.end()
    }
  }

  /** 将 getErDiagramData 查询1的行（每列一行）按 schema.table 聚合为 ErDiagramTable[] */
  private aggregateErDiagramTables(rows: Record<string, unknown>[]): ErDiagramTable[] {
    const tables = new Map<string, ErDiagramTable>()
    for (const row of rows) {
      const key = `${row.schema as string}.${row.name as string}`
      let table = tables.get(key)
      if (!table) {
        table = {
          schema: row.schema as string,
          name: row.name as string,
          type: row.tableType === 'VIEW' ? 'view' : 'table',
          comment: (row.tableComment as string) ?? undefined,
          columns: []
        }
        tables.set(key, table)
      }
      table.columns.push({
        name: row.columnName as string,
        dataType: row.dataType as string,
        nullable: row.nullable as boolean,
        defaultValue: (row.defaultValue as string) ?? undefined,
        comment: (row.columnComment as string) ?? undefined,
        isPrimaryKey: row.isPrimaryKey as boolean
      })
    }
    return Array.from(tables.values())
  }

  /** 将 getErDiagramData 查询2的行（每个外键列一行）按 constraintName 聚合为 ForeignKeyInfo[] */
  private aggregateForeignKeys(rows: Record<string, unknown>[]): ForeignKeyInfo[] {
    const foreignKeys = new Map<string, ForeignKeyInfo>()
    for (const row of rows) {
      const key = row.constraintName as string
      let fk = foreignKeys.get(key)
      if (!fk) {
        fk = {
          constraintName: key,
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

  /** 按需获取或创建目标数据库的连接池；同一数据库的池会被复用 */
  private getPool(database: string): Pool {
    if (!this.baseConfig) {
      throw new Error('未连接到数据库')
    }
    const existing = this.pools.get(database)
    if (existing) return existing

    const pool = this.createPool(this.baseConfig, database)
    this.pools.set(database, pool)
    return pool
  }

  private async runQuery(pool: Pool, sql: string, params?: unknown[]): Promise<QueryResult> {
    const startTime = Date.now()
    const result: PgQueryResult = params ? await pool.query(sql, params) : await pool.query(sql)
    const durationMs = Date.now() - startTime

    return {
      fields: result.fields.map((field) => this.mapField(field)),
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      durationMs
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
          routine_schema AS schema,
          routine_name AS name,
          pg_catalog.pg_get_function_arguments(p.oid) AS "argumentsSignature",
          data_type AS "returnType",
          obj_description(p.oid, 'pg_proc') AS comment
        FROM information_schema.routines r
        JOIN pg_catalog.pg_proc p ON p.proname = r.routine_name
        JOIN pg_catalog.pg_namespace n
          ON n.oid = p.pronamespace AND n.nspname = r.routine_schema
        WHERE r.routine_schema = $1 AND r.routine_type = $2
        ORDER BY routine_name
      `,
      [schema, routineType]
    )
    return (result.rows as unknown as Omit<RoutineInfo, 'kind'>[]).map((row) => ({
      ...row,
      kind
    }))
  }

  private createPool(config: ConnectionConfig, database: string): Pool {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database,
      user: config.username,
      // 空密码也显式传字符串，避免 pg 因 undefined 在 SCRAM 握手中报错
      password: config.password,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    }

    if (config.ssl?.enabled) {
      poolConfig.ssl = {
        rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
        ca: config.ssl.ca,
        cert: config.ssl.cert,
        key: config.ssl.key
      }
    }

    return new Pool(poolConfig)
  }

  private mapField(field: PgQueryResult['fields'][number]): QueryField {
    return {
      name: field.name,
      dataType: field.dataTypeID ? (OID_TO_TYPE_NAME[field.dataTypeID] ?? 'unknown') : 'unknown',
      nullable: true
    }
  }
}
