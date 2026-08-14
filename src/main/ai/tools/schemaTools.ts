import { z } from 'zod'
import { driverManager } from '../../db/core/DriverManager'
import type { ToolDefinition } from './types'
import type {
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  DdlResult
} from '../../../renderer/src/types/ipc'

/**
 * Schema 内省类工具：全部只读，直接委托 `driverManager` 现有方法，
 * 输入/输出严格对照 `specs/008-code-mode-agent/contracts/tool-catalog.md` §一
 */

const listDatabasesSchema = z.object({
  connectionId: z.string().min(1)
})

/**
 * 列出指定连接下的所有数据库
 *
 * @example
 * await toolRegistry.invoke('schema.listDatabases', { connectionId: 'conn-1' })
 */
export const listDatabasesTool: ToolDefinition<
  z.infer<typeof listDatabasesSchema>,
  DatabaseInfo[]
> = {
  name: 'schema.listDatabases',
  description: '列出指定数据库连接下的所有数据库',
  mutates: false,
  inputSchema: listDatabasesSchema,
  execute: ({ connectionId }) => driverManager.getDatabases(connectionId)
}

const listSchemasSchema = z.object({
  connectionId: z.string().min(1),
  database: z.string().min(1)
})

/**
 * 列出指定数据库下的所有 schema（PostgreSQL）或等价命名空间
 *
 * @example
 * await toolRegistry.invoke('schema.listSchemas', { connectionId: 'conn-1', database: 'app_db' })
 */
export const listSchemasTool: ToolDefinition<z.infer<typeof listSchemasSchema>, SchemaInfo[]> = {
  name: 'schema.listSchemas',
  description: '列出指定数据库下的所有 schema（PostgreSQL）或等价命名空间',
  mutates: false,
  inputSchema: listSchemasSchema,
  execute: ({ connectionId, database }) => driverManager.getSchemas(connectionId, database)
}

const listTablesSchema = z.object({
  connectionId: z.string().min(1),
  database: z.string().min(1),
  schema: z.string().min(1)
})

/**
 * 列出指定 schema 下的所有表
 *
 * @example
 * await toolRegistry.invoke('schema.listTables', {
 *   connectionId: 'conn-1',
 *   database: 'app_db',
 *   schema: 'public'
 * })
 */
export const listTablesTool: ToolDefinition<z.infer<typeof listTablesSchema>, TableInfo[]> = {
  name: 'schema.listTables',
  description: '列出指定 schema 下的所有表',
  mutates: false,
  inputSchema: listTablesSchema,
  execute: ({ connectionId, database, schema }) =>
    driverManager.getTables(connectionId, database, schema)
}

const tableRefSchema = z.object({
  connectionId: z.string().min(1),
  database: z.string().min(1),
  schema: z.string().min(1),
  table: z.string().min(1)
})

/**
 * 列出指定表的全部列及其类型信息，是"分析表结构"能力的核心数据来源
 *
 * @example
 * await toolRegistry.invoke('schema.listColumns', {
 *   connectionId: 'conn-1',
 *   database: 'app_db',
 *   schema: 'public',
 *   table: 'users'
 * })
 */
export const listColumnsTool: ToolDefinition<z.infer<typeof tableRefSchema>, ColumnInfo[]> = {
  name: 'schema.listColumns',
  description: '列出指定表的全部列及其类型信息，是"分析表结构"能力的核心数据来源',
  mutates: false,
  inputSchema: tableRefSchema,
  execute: ({ connectionId, database, schema, table }) =>
    driverManager.getColumns(connectionId, database, schema, table)
}

/**
 * 列出指定表的索引信息，供"优化查询"能力判断是否存在可用索引
 *
 * @example
 * await toolRegistry.invoke('schema.listIndexes', {
 *   connectionId: 'conn-1',
 *   database: 'app_db',
 *   schema: 'public',
 *   table: 'users'
 * })
 */
export const listIndexesTool: ToolDefinition<z.infer<typeof tableRefSchema>, IndexInfo[]> = {
  name: 'schema.listIndexes',
  description: '列出指定表的索引信息，供"优化查询"能力判断是否存在可用索引',
  mutates: false,
  inputSchema: tableRefSchema,
  execute: ({ connectionId, database, schema, table }) =>
    driverManager.getIndexes(connectionId, database, schema, table)
}

const getDdlSchema = z.object({
  connectionId: z.string().min(1),
  database: z.string().min(1),
  schema: z.string().min(1),
  objectType: z.enum(['table', 'view']),
  name: z.string().min(1)
})

/**
 * 获取指定表或视图的 DDL 语句
 *
 * @example
 * await toolRegistry.invoke('schema.getDdl', {
 *   connectionId: 'conn-1',
 *   database: 'app_db',
 *   schema: 'public',
 *   objectType: 'table',
 *   name: 'users'
 * })
 */
export const getDdlTool: ToolDefinition<z.infer<typeof getDdlSchema>, DdlResult> = {
  name: 'schema.getDdl',
  description: '获取指定表或视图的 DDL 语句',
  mutates: false,
  inputSchema: getDdlSchema,
  async execute({ connectionId, database, schema, objectType, name }) {
    const ddl =
      objectType === 'table'
        ? await driverManager.getTableDdl(connectionId, database, schema, name)
        : await driverManager.getViewDdl(connectionId, database, schema, name)
    return { objectType, schema, name, ddl }
  }
}

export const schemaTools: ToolDefinition[] = [
  listDatabasesTool,
  listSchemasTool,
  listTablesTool,
  listColumnsTool,
  listIndexesTool,
  getDdlTool
]
