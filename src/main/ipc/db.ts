import type { BrowserWindow } from 'electron'
import { createIPCHandler, safeSend } from './utils'
import { driverManager } from '../db/core/DriverManager'
import { PostgreSQLDriver } from '../db/driver/pg'
import { MySQLDriver } from '../db/driver/mysql'
import { configStore } from '../config/store'
import { decryptPassword } from '../config/crypto'
import type { DatabaseType, StoredConnection } from '../../renderer/src/types/ipc'
import type { IDatabaseDriverStatic } from '../db/core/IDatabaseDriver'
import { execFile } from 'child_process'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { toCsv, toJson } from '../utils/resultExport'

/** 按数据库类型返回对应驱动类，用于分发静态方法（如 testConnection） */
function getDriverClass(type: DatabaseType): IDatabaseDriverStatic {
  switch (type) {
    case 'postgresql':
      return PostgreSQLDriver
    case 'mysql':
      return MySQLDriver
    default:
      throw new Error(`不支持的数据库类型: ${type}`)
  }
}

/** 自动探测 pg_dump 路径（Windows / macOS / Linux） */
async function detectPgDump(): Promise<string | null> {
  // 先尝试 PATH 中的 pg_dump
  try {
    const bin = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'
    await new Promise<void>((resolve, reject) => {
      execFile(bin, ['--version'], (err) => (err ? reject(err) : resolve()))
    })
    return bin
  } catch {
    // 不在 PATH 中，继续探测
  }

  // 扫描常见安装路径
  if (process.platform === 'win32') {
    const baseDir = 'C:\\Program Files\\PostgreSQL'
    if (existsSync(baseDir)) {
      const versions = readdirSync(baseDir)
      for (const ver of versions.sort().reverse()) {
        const candidate = path.join(baseDir, ver, 'bin', 'pg_dump.exe')
        if (existsSync(candidate)) return candidate
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS: Homebrew 安装路径
    const candidates = ['/opt/homebrew/bin/pg_dump', '/usr/local/bin/pg_dump']
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  } else {
    // Linux 常见路径
    const candidates = ['/usr/bin/pg_dump', '/usr/lib/postgresql']
    if (existsSync('/usr/lib/postgresql')) {
      const versions = readdirSync('/usr/lib/postgresql')
      for (const ver of versions.sort().reverse()) {
        const candidate = path.join('/usr/lib/postgresql', ver, 'bin', 'pg_dump')
        if (existsSync(candidate)) return candidate
      }
    }
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  }

  return null
}

/** 自动探测 mysqldump 路径（Windows / macOS / Linux），镜像 detectPgDump() */
async function detectMysqldump(): Promise<string | null> {
  // 先尝试 PATH 中的 mysqldump
  try {
    const bin = process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump'
    await new Promise<void>((resolve, reject) => {
      execFile(bin, ['--version'], (err) => (err ? reject(err) : resolve()))
    })
    return bin
  } catch {
    // 不在 PATH 中，继续探测
  }

  // 扫描常见安装路径
  if (process.platform === 'win32') {
    const baseDir = 'C:\\Program Files\\MySQL'
    if (existsSync(baseDir)) {
      const versions = readdirSync(baseDir)
      for (const ver of versions.sort().reverse()) {
        const candidate = path.join(baseDir, ver, 'bin', 'mysqldump.exe')
        if (existsSync(candidate)) return candidate
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS: Homebrew 安装路径
    const candidates = ['/opt/homebrew/bin/mysqldump', '/usr/local/bin/mysqldump']
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  } else {
    // Linux 常见路径
    const candidates = ['/usr/bin/mysqldump']
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  }

  return null
}
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
  ImportResult,
  BackupResult,
  ExportQueryResultRequest
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
    safeSend(mainWindow, 'db:status-changed', status)
  })

  createIPCHandler<[ConnectionConfig], TestResult>('db:test-connection', async (config) => {
    const DriverClass = getDriverClass(config.type)
    return DriverClass.testConnection(config)
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

  createIPCHandler<[ExportQueryResultRequest], { rowCount: number }>(
    'db:export-query-result',
    async (request) => {
      const result = await driverManager.query(
        request.connectionId,
        request.database,
        request.sql,
        request.params,
        { unbounded: true }
      )
      const content = request.format === 'csv' ? toCsv(result) : toJson(result)
      await writeFile(request.filePath, content, 'utf-8')
      return { rowCount: result.rowCount }
    }
  )

  createIPCHandler<[string, string], void>(
    'db:release-database',
    async (connectionId, database) => {
      await driverManager.releaseDatabase(connectionId, database)
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

  createIPCHandler<[string, string, string, string?], BackupResult>(
    'db:backup-database',
    async (connectionId, database, exportDir, dumpToolPath) => {
      const stored = configStore.get('connections') as StoredConnection[]
      const found = stored.find((c) => c.id === connectionId)
      if (!found) throw new Error(`连接配置不存在: ${connectionId}`)

      if (!existsSync(exportDir)) {
        mkdirSync(exportDir, { recursive: true })
      }
      const now = new Date().toISOString().replace(/[:.]/g, '-')
      const outFile = path.join(exportDir, `dump-${database}-${now}.sql`)

      if (found.type === 'mysql') {
        const dumpBin = dumpToolPath || (await detectMysqldump())
        if (!dumpBin) {
          return {
            success: false,
            filePath: '',
            error: '未找到 mysqldump，请安装 MySQL 客户端或在对话框中手动指定 mysqldump 路径'
          }
        }
        const env = { ...process.env } as Record<string, string | undefined>
        if (found.encryptedPassword) {
          env.MYSQL_PWD = decryptPassword(found.encryptedPassword)
        }

        const args = [
          '-h',
          found.host,
          '-P',
          String(found.port),
          '-u',
          found.username,
          database,
          `--result-file=${outFile}`
        ]

        return new Promise<BackupResult>((resolve) => {
          execFile(dumpBin, args, { env }, (err) => {
            if (err) {
              resolve({ success: false, filePath: outFile, error: err.message })
            } else {
              resolve({ success: true, filePath: outFile })
            }
          })
        })
      }

      const dumpBin = dumpToolPath || (await detectPgDump())
      if (!dumpBin) {
        return {
          success: false,
          filePath: '',
          error: '未找到 pg_dump，请安装 PostgreSQL 客户端或在对话框中手动指定 pg_dump 路径'
        }
      }
      const env = { ...process.env } as Record<string, string | undefined>
      if (found.encryptedPassword) {
        env.PGPASSWORD = decryptPassword(found.encryptedPassword)
      }

      const args = [
        '-h',
        found.host,
        '-p',
        String(found.port),
        '-U',
        found.username,
        '-d',
        database,
        '-f',
        outFile,
        '--no-owner'
      ]

      return new Promise<BackupResult>((resolve) => {
        execFile(dumpBin, args, { env }, (err) => {
          if (err) {
            resolve({ success: false, filePath: outFile, error: err.message })
          } else {
            resolve({ success: true, filePath: outFile })
          }
        })
      })
    }
  )
}
