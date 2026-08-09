import { createIPCHandler } from './utils'

/**
 * 数据库 IPC 处理器 —— 占位实现
 *
 * 宪法 IV：采用适配器模式，当前为 PostgreSQL 适配器占位
 * Phase 2 接入 pg 后替换 TODO 处的实现
 *
 * 通道命名：db:xxx（宪法 V：模块:操作 格式）
 */

// ─── 类型定义（Phase 2 迁移到 src/renderer/src/types/ipc.ts） ───

export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl?: {
    enabled: boolean
    ca?: string
    cert?: string
    key?: string
  }
}

export interface ConnectionResult {
  success: boolean
  message: string
  connectionId?: string
}

export interface TestResult {
  success: boolean
  message: string
  serverVersion?: string
  latencyMs?: number
}

export interface QueryResult {
  fields: Array<{ name: string; dataType: string; nullable: boolean }>
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

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

export interface ConnectionStatus {
  id: string
  state: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: string
}

// ─── 注册 IPC 处理器 ───

export function registerDbIPC(): void {
  // 测试连接
  createIPCHandler<[ConnectionConfig], TestResult>('db:test-connection', async (config) => {
    // TODO: Phase 2 — 接入 pg，调用 PostgreSQLAdapter.testConnection(config)
    console.log('[db:test-connection]', config.name)
    return {
      success: true,
      message: '占位：连接测试功能将在 Phase 2 实现',
      serverVersion: 'PostgreSQL 16.2 (placeholder)',
      latencyMs: 1
    }
  })

  // 建立连接
  createIPCHandler<[ConnectionConfig], ConnectionResult>('db:connect', async (config) => {
    // TODO: Phase 2 — 接入 pg，创建 Pool 并存入 ConnectionManager
    console.log('[db:connect]', config.name)
    return {
      success: true,
      message: '占位：连接功能将在 Phase 2 实现',
      connectionId: config.id
    }
  })

  // 断开连接
  createIPCHandler<[string], void>('db:disconnect', async (connectionId) => {
    // TODO: Phase 2 — ConnectionManager 释放连接池
    console.log('[db:disconnect]', connectionId)
  })

  // 执行 SQL 查询
  createIPCHandler<[string, string], QueryResult>('db:query', async (connectionId, sql) => {
    // TODO: Phase 2 — 调用适配器执行 SQL（宪法 I：使用参数化查询）
    console.log('[db:query]', connectionId, sql.substring(0, 50))
    return {
      fields: [{ name: 'id', dataType: 'integer', nullable: false }],
      rows: [{ id: 1 }],
      rowCount: 1,
      durationMs: 0
    }
  })

  // 获取 Schema 列表
  createIPCHandler<[string], SchemaInfo[]>('db:get-schemas', async (connectionId) => {
    // TODO: Phase 2 — 查询 pg_catalog.pg_namespace
    console.log('[db:get-schemas]', connectionId)
    return [{ name: 'public', owner: 'postgres' }]
  })

  // 获取表列表
  createIPCHandler<[string, string], TableInfo[]>('db:get-tables', async (connectionId, schema) => {
    // TODO: Phase 2 — 查询 information_schema.tables
    console.log('[db:get-tables]', connectionId, schema)
    return [
      { schema: 'public', name: 'users', type: 'table' },
      { schema: 'public', name: 'orders', type: 'table' }
    ]
  })

  // 获取列信息
  createIPCHandler<[string, string, string], ColumnInfo[]>(
    'db:get-columns',
    async (connectionId, schema, table) => {
      // TODO: Phase 2 — 查询 information_schema.columns
      console.log('[db:get-columns]', connectionId, schema, table)
      return [{ name: 'id', dataType: 'integer', nullable: false, isPrimaryKey: true }]
    }
  )
}
