import { Parser } from 'node-sql-parser'
import type { DatabaseType } from '@/types/ipc'

const parser = new Parser()

/**
 * 将 SQL 文件内容拆分为独立语句数组
 *
 * 基于 node-sql-parser 对指定数据库方言的语法解析校验有效性，
 * 解析失败视为无效文件，直接抛出错误而非返回部分结果（不产生部分导入）
 *
 * @param sqlText - SQL 文件全文内容，语句间以分号分隔
 * @param dbType - 目标数据库类型，决定 node-sql-parser 的解析方言
 * @returns 拆分后的独立语句文本数组
 * @throws 当 SQL 文本存在语法错误或为空文件时抛出
 */
export function splitSqlStatements(sqlText: string, dbType: DatabaseType = 'postgresql'): string[] {
  if (!sqlText.trim()) {
    throw new Error('SQL 文件内容为空')
  }

  let ast: object | object[]
  try {
    ast = parser.astify(sqlText, { database: dbType })
  } catch (error) {
    throw new Error(`SQL 文件解析失败：${error instanceof Error ? error.message : String(error)}`)
  }

  const statements = Array.isArray(ast) ? ast : [ast]
  if (statements.length === 0) {
    throw new Error('SQL 文件内容为空')
  }

  return statements.map((statement) => `${parser.sqlify(statement, { database: dbType })};`)
}
