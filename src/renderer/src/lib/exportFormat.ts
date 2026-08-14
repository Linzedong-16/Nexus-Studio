import type { QueryResult } from '@/types/ipc'

/**
 * CSV 字段转义：逗号/双引号/换行触发整体加引号，内嵌双引号双写；
 * NULL/undefined 渲染为空字段（而非字符串 "null"/"undefined"）；
 * Date 转为 ISO 字符串而非 JSON.stringify（否则会保留 JSON 字符串自带的引号，
 * 导致该字段被误判为"含引号"而被二次转义、写出畸形内容）
 *
 * @param value - 待转义的单元格原始值，可为任意类型
 * @returns 转义后可直接拼接进 CSV 行的字段文本
 * @example
 * escapeCsvField('a,b') // => '"a,b"'
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * 查询结果 → CSV 文本：表头 + 数据行，空结果集仅输出表头行
 *
 * @param result - 待导出的查询结果
 * @returns 完整 CSV 文本（含表头行，行间以 `\n` 分隔）
 * @example
 * resultToCsv(result) // => 'id,name\n1,Alice'
 */
export function resultToCsv(result: QueryResult): string {
  const headers = result.fields.map((f) => f.name)
  const headerLine = headers.map(escapeCsvField).join(',')
  const dataLines = result.rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(','))
  return [headerLine, ...dataLines].join('\n')
}

/**
 * 查询结果 → JSON 文本：对象数组，字段名与结果列名一致，NULL 渲染为 JSON null
 *
 * @param result - 待导出的查询结果
 * @returns 格式化（2 空格缩进）的 JSON 文本
 * @example
 * resultToJson(result) // => '[\n  {\n    "id": 1\n  }\n]'
 */
export function resultToJson(result: QueryResult): string {
  return JSON.stringify(result.rows, null, 2)
}
