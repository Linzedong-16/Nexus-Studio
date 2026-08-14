import { Parser } from 'node-sql-parser'
import { format } from 'sql-formatter'
import { z } from 'zod'
import { driverManager } from '../../db/core/DriverManager'
import type { ToolDefinition } from './types'
import type { QueryResult, DatabaseType } from '../../../renderer/src/types/ipc'

/**
 * SQL 类工具：语法层校验/格式化为纯本地解析，不接触数据库；
 * `explain`/`executeReadOnly`/`executeWrite` 委托 `driverManager.query`，
 * 输入/输出严格对照 `specs/008-code-mode-agent/contracts/tool-catalog.md` §二
 */

const parser = new Parser()

/** 语句类型判定允许列表：只有这三类算作"只读"，其余（含 DDL/DML 修改类）一律视为会变更数据 */
const READ_ONLY_STATEMENT_TYPES = new Set(['select', 'show', 'explain'])

/** 解析 SQL 首条语句的类型（`select`/`insert`/`update`/... ），解析失败时抛出 */
function detectStatementType(sql: string, dialect: DatabaseType): string {
  const ast = parser.astify(sql, { database: dialect })
  const first = Array.isArray(ast) ? ast[0] : ast
  return first.type
}

const dialectSchema = z.enum(['postgresql', 'mysql'])

const validateSchema = z.object({
  sql: z.string().min(1),
  dialect: dialectSchema
})

/**
 * 对一段 SQL 文本做纯语法解析校验，不连接数据库、不执行
 *
 * @example
 * await toolRegistry.invoke('sql.validate', { sql: 'SELECT * FROM users', dialect: 'mysql' })
 */
export const validateSqlTool: ToolDefinition<
  z.infer<typeof validateSchema>,
  { valid: boolean; errorMessage?: string; statementType?: string }
> = {
  name: 'sql.validate',
  description: '对一段 SQL 文本做语法解析校验，不连接数据库、不执行',
  mutates: false,
  inputSchema: validateSchema,
  execute({ sql, dialect }) {
    try {
      return Promise.resolve({ valid: true, statementType: detectStatementType(sql, dialect) })
    } catch (err) {
      return Promise.resolve({
        valid: false,
        errorMessage: err instanceof Error ? err.message : String(err)
      })
    }
  }
}

const formatSchema = z.object({
  sql: z.string().min(1),
  dialect: dialectSchema
})

/**
 * 将 SQL 文本格式化为统一风格，不连接数据库
 *
 * @example
 * await toolRegistry.invoke('sql.format', { sql: 'select * from users', dialect: 'mysql' })
 */
export const formatSqlTool: ToolDefinition<z.infer<typeof formatSchema>, { formatted: string }> = {
  name: 'sql.format',
  description: '将 SQL 文本格式化为统一风格',
  mutates: false,
  inputSchema: formatSchema,
  execute: ({ sql, dialect }) => Promise.resolve({ formatted: format(sql, { language: dialect }) })
}

const sqlExecSchema = z.object({
  connectionId: z.string().min(1),
  database: z.string().min(1),
  sql: z.string().min(1)
})

/**
 * 获取数据库对指定 SELECT 查询的执行计划
 *
 * @example
 * await toolRegistry.invoke('sql.explain', {
 *   connectionId: 'conn-1',
 *   database: 'app_db',
 *   sql: 'SELECT * FROM users WHERE id = 1'
 * })
 * @throws 当 `sql` 不是 SELECT 语句时抛出错误，由 registry 捕获为 `{status:'error'}`
 */
export const explainSqlTool: ToolDefinition<z.infer<typeof sqlExecSchema>, QueryResult> = {
  name: 'sql.explain',
  description: '获取数据库对指定查询的执行计划，仅支持 SELECT 语句',
  mutates: false,
  inputSchema: sqlExecSchema,
  async execute({ connectionId, database, sql }) {
    const dialect = await driverManager.getDriverType(connectionId)
    if (detectStatementType(sql, dialect) !== 'select') {
      throw new Error('仅支持对 SELECT 语句生成执行计划')
    }
    return driverManager.query(connectionId, database, `EXPLAIN ${sql}`)
  }
}

/**
 * 执行只读查询（SELECT/SHOW/EXPLAIN 等不产生数据变更的语句）并返回结果集
 *
 * @example
 * await toolRegistry.invoke('sql.executeReadOnly', {
 *   connectionId: 'conn-1',
 *   database: 'app_db',
 *   sql: 'SELECT * FROM users'
 * })
 * @throws 当 `sql` 会修改数据时抛出错误，由 registry 捕获为 `{status:'error'}`
 */
export const executeReadOnlySqlTool: ToolDefinition<z.infer<typeof sqlExecSchema>, QueryResult> = {
  name: 'sql.executeReadOnly',
  description: '执行只读查询（SELECT/SHOW/EXPLAIN 等不产生数据变更的语句）并返回结果集',
  mutates: false,
  inputSchema: sqlExecSchema,
  async execute({ connectionId, database, sql }) {
    const dialect = await driverManager.getDriverType(connectionId)
    if (!READ_ONLY_STATEMENT_TYPES.has(detectStatementType(sql, dialect))) {
      throw new Error('该语句会修改数据，请改用 sql.executeWrite')
    }
    return driverManager.query(connectionId, database, sql)
  }
}

/**
 * 执行会修改数据或表结构的 SQL 语句（INSERT/UPDATE/DELETE/DDL 等），`mutates: true`，
 * ReAct 循环中调用前需经用户确认（见 `reactLoop.ts` 的 `paused_for_confirmation` 分支）
 *
 * @example
 * await toolRegistry.invoke('sql.executeWrite', {
 *   connectionId: 'conn-1',
 *   database: 'app_db',
 *   sql: "DELETE FROM users WHERE id = 1"
 * })
 */
export const executeWriteSqlTool: ToolDefinition<z.infer<typeof sqlExecSchema>, QueryResult> = {
  name: 'sql.executeWrite',
  description: '执行会修改数据或表结构的 SQL 语句（INSERT/UPDATE/DELETE/DDL 等）',
  mutates: true,
  inputSchema: sqlExecSchema,
  execute: ({ connectionId, database, sql }) => driverManager.query(connectionId, database, sql)
}

export const sqlTools: ToolDefinition[] = [
  validateSqlTool,
  formatSqlTool,
  explainSqlTool,
  executeReadOnlySqlTool,
  executeWriteSqlTool
]
