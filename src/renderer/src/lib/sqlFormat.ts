import { format } from 'sql-formatter'

/** SQL 格式化结果：成功时 `text` 为格式化后的文本，失败时 `text` 为原文本并附带 `error` */
export interface SqlFormatResult {
  /** 格式化后的文本；解析失败时原样返回传入的原文本 */
  text: string
  /** 解析异常信息；仅格式化失败时存在 */
  error?: string
}

/**
 * 格式化 SQL 文本（FR-018~FR-021）：统一关键字大小写、子句换行、缩进风格。
 * 捕获解析异常时返回原文本与错误信息，不抛出未捕获异常。
 *
 * @param sql - 待格式化的原始 SQL 文本，可包含以分号分隔的多条语句
 * @returns 格式化结果；解析失败时 `text` 为原文本、`error` 为错误信息
 * @example
 * formatSql('select * from t') // => { text: 'SELECT\n  *\nFROM\n  t' }
 */
export function formatSql(sql: string): SqlFormatResult {
  try {
    return { text: format(sql, { language: 'postgresql' }) }
  } catch (err) {
    return { text: sql, error: err instanceof Error ? err.message : '无法格式化' }
  }
}
