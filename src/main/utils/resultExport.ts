/**
 * 查询结果导出序列化（主进程侧）
 *
 * 独立于渲染进程的 `src/renderer/src/lib/exportFormat.ts` 实现，
 * 避免主进程反向依赖渲染进程代码（见 research.md 第 2 节）。
 */
import type { QueryResult } from '../../renderer/src/types/ipc'

/**
 * CSV 字段转义：逗号/双引号/换行触发整体加引号，内嵌双引号双写；
 * NULL/undefined 渲染为空字段；Date 转为 ISO 字符串
 *
 * @param value - 待转义的单元格原始值
 * @returns 转义后可直接拼接进 CSV 行的字段文本
 */
function escapeCsvField(value: unknown): string {
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
 */
export function toCsv(result: QueryResult): string {
  const headers = result.fields.map((f) => f.name)
  const headerLine = headers.map(escapeCsvField).join(',')
  const dataLines = result.rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(','))
  return [headerLine, ...dataLines].join('\n')
}

/**
 * 查询结果 → JSON 文本：对象数组，字段名与结果列名一致
 *
 * @param result - 待导出的查询结果
 * @returns 格式化（2 空格缩进）的 JSON 文本
 */
export function toJson(result: QueryResult): string {
  return JSON.stringify(result.rows, null, 2)
}
