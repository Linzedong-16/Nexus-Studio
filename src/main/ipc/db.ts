import type { BrowserWindow } from 'electron'
import { createIPCHandler } from './utils'
import { driverManager } from '../db/core/DriverManager'
import { PostgreSQLDriver } from '../db/driver/pg'
import { configStore } from '../config/store'
import { decryptPassword } from '../config/crypto'
import type { StoredConnection } from '../../renderer/src/types/ipc'
import type {
  ConnectionConfig,
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
  TestResult,
  ErDiagramData,
  DdlResult,
  ImportRowsRequest,
  ImportSqlRequest,
  ImportResult
} from '../../renderer/src/types/ipc'

/**
 * 从持久化存储中加载连接配置并解密密码
 *
 * 用于 DriverManager 的自动重连机制：当查询时发现连接不在内存中，
 * 会通过此函数从 electron-store 读取配置并重新建立连接。
 *
 * @param connectionId - 连接的唯一标识符
 * @returns 解密后的连接配置，若不存在则返回 null
 */
function loadConnectionConfig(connectionId: string): ConnectionConfig | null {
  const stored = configStore.get('connections') as StoredConnection[]
  const found = stored.find((c) => c.id === connectionId)
  if (!found) return null
  const { encryptedPassword, ...rest } = found
  return {
    ...rest,
    password: encryptedPassword ? decryptPassword(encryptedPassword) : ''
  }
}

/**
 * 数据库 IPC 处理器
 *
 * 宪法 IV：采用驱动模式，IPC 层只负责调用 DriverManager，
 * 不直接依赖任何具体数据库驱动。
 */
export function registerDbIPC(mainWindow: BrowserWindow): void {
  // 注入配置加载器，使 DriverManager 支持自动重连
  driverManager.setConfigLoader(loadConnectionConfig)
  driverManager.onStatusChange((status) => {
    mainWindow.webContents.send('db:status-changed', status)
  })

  createIPCHandler<[ConnectionConfig], TestResult>('db:test-connection', async (config) => {
    return PostgreSQLDriver.testConnection(config)
  })

  createIPCHandler<[ConnectionConfig], ConnectionResult>('db:connect', async (config) => {
    return driverManager.connect(config)
  })

  createIPCHandler<[string], void>('db:disconnect', async (connectionId) => {
    await driverManager.disconnect(connectionId)
  })

  createIPCHandler<[string], DatabaseInfo[]>('db:get-databases', async (connectionId) => {
    return driverManager.getDatabases(connectionId)
  })

  createIPCHandler<[string], RoleInfo[]>('db:get-roles', async (connectionId) => {
    return driverManager.getRoles(connectionId)
  })

  createIPCHandler<[string, string, string, unknown[]?], QueryResult>(
    'db:query',
    async (connectionId, database, sql, params) => {
      return driverManager.query(connectionId, database, sql, params)
    }
  )

  createIPCHandler<[string, string], SchemaInfo[]>(
    'db:get-schemas',
    async (connectionId, database) => {
      return driverManager.getSchemas(connectionId, database)
    }
  )

  createIPCHandler<[string, string, string], TableInfo[]>(
    'db:get-tables',
    async (connectionId, database, schema) => {
      return driverManager.getTables(connectionId, database, schema)
    }
  )

  createIPCHandler<[string, string, string, string], ColumnInfo[]>(
    'db:get-columns',
    async (connectionId, database, schema, table) => {
      return driverManager.getColumns(connectionId, database, schema, table)
    }
  )

  createIPCHandler<[string, string, string, string], IndexInfo[]>(
    'db:get-indexes',
    async (connectionId, database, schema, table) => {
      return driverManager.getIndexes(connectionId, database, schema, table)
    }
  )

  createIPCHandler<[string, string, string, string], TriggerInfo[]>(
    'db:get-triggers',
    async (connectionId, database, schema, table) => {
      return driverManager.getTriggers(connectionId, database, schema, table)
    }
  )

  createIPCHandler<[string, string, string], RoutineInfo[]>(
    'db:get-functions',
    async (connectionId, database, schema) => {
      return driverManager.getFunctions(connectionId, database, schema)
    }
  )

  createIPCHandler<[string, string, string], RoutineInfo[]>(
    'db:get-procedures',
    async (connectionId, database, schema) => {
      return driverManager.getProcedures(connectionId, database, schema)
    }
  )

  createIPCHandler<[string, string, string[]], ErDiagramData>(
    'db:get-er-diagram-data',
    async (connectionId, database, schemas) => {
      return driverManager.getErDiagramData(connectionId, database, schemas)
    }
  )

  createIPCHandler<[string, string, string, string], DdlResult>(
    'db:get-table-ddl',
    async (connectionId, database, schema, table) => {
      const ddl = await driverManager.getTableDdl(connectionId, database, schema, table)
      return { objectType: 'table', schema, name: table, ddl }
    }
  )

  createIPCHandler<[string, string, string, string], DdlResult>(
    'db:get-view-ddl',
    async (connectionId, database, schema, view) => {
      const ddl = await driverManager.getViewDdl(connectionId, database, schema, view)
      return { objectType: 'view', schema, name: view, ddl }
    }
  )

  createIPCHandler<[string, string, ImportRowsRequest], ImportResult>(
    'db:import-rows',
    async (connectionId, database, request) => {
      const { schema, table, columns, rows } = request
      const invalidRow = rows.findIndex((row) => row.length !== columns.length)
      if (invalidRow !== -1) {
        throw new Error(`第 ${invalidRow + 1} 行的字段数与列数不一致，未写入任何数据`)
      }
      return driverManager.importRows(connectionId, database, schema, table, columns, rows)
    }
  )

  createIPCHandler<[string, string, ImportSqlRequest], ImportResult>(
    'db:import-sql',
    async (connectionId, database, request) => {
      return driverManager.importSql(connectionId, database, request.statements)
    }
  )
}
