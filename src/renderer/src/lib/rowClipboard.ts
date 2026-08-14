import type { QueryResult, RowClipboardPayload } from '@/types/ipc'
import { escapeCsvField } from './exportFormat'

/** SQL 标识符转义：内嵌双引号双写 */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * SQL 值转义（FR-014）：字符串/日期加单引号并转义内部单引号；数值/布尔不加引号；
 * null/undefined 渲染为裸 NULL 关键字；无法安全序列化的值转为字符串形式
 */
function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  return `'${s.replace(/'/g, "''")}'`
}

function selectRows(result: QueryResult, rowIndexes: number[]): Record<string, unknown>[] {
  return rowIndexes.map((i) => result.rows[i])
}

/** 选中行 → INSERT 语句；来源表不可确定时表名使用占位符 `<table_name>`（FR-015） */
function rowsToInsertText(
  result: QueryResult,
  rowIndexes: number[],
  sourceTable: { schema: string; name: string } | null
): string {
  const headers = result.fields.map((f) => f.name)
  const tableRef = sourceTable
    ? `${quoteIdent(sourceTable.schema)}.${quoteIdent(sourceTable.name)}`
    : '<table_name>'
  const columns = headers.map(quoteIdent).join(', ')
  return rowIndexes
    .map((idx) => {
      const row = result.rows[idx]
      const values = headers.map((h) => escapeSqlValue(row[h])).join(', ')
      return `INSERT INTO ${tableRef} (${columns}) VALUES (${values});`
    })
    .join('\n')
}

/** 选中行 → JSON 文本：对象数组，字段名与结果列名一致 */
function rowsToJsonText(result: QueryResult, rowIndexes: number[]): string {
  return JSON.stringify(selectRows(result, rowIndexes), null, 2)
}

/** 选中行 → CSV 文本：不含表头，行顺序与勾选顺序（已按表格显示顺序排序）一致 */
function rowsToCsvText(result: QueryResult, rowIndexes: number[]): string {
  const headers = result.fields.map((f) => f.name)
  return rowIndexes
    .map((idx) => {
      const row = result.rows[idx]
      return headers.map((h) => escapeCsvField(row[h])).join(',')
    })
    .join('\n')
}

/**
 * 构建一次行复制的完整载荷，供写入系统剪贴板与展示核对提示
 *
 * @param format - 目标格式：`insert` | `json` | `csv`
 * @param result - 行数据所属的查询结果（提供列名与全部行）
 * @param rowIndexes - 待复制的行在 `result.rows` 中的下标（顺序即输出顺序）
 * @param sourceTable - 已知的来源表；为 `null` 时（如多表 JOIN 结果）`insert` 格式使用占位符表名
 * @returns 复制载荷，含最终写入剪贴板的文本
 */
export function buildRowClipboardPayload(
  format: RowClipboardPayload['format'],
  result: QueryResult,
  rowIndexes: number[],
  sourceTable: { schema: string; name: string } | null
): RowClipboardPayload {
  const text =
    format === 'insert'
      ? rowsToInsertText(result, rowIndexes, sourceTable)
      : format === 'json'
        ? rowsToJsonText(result, rowIndexes)
        : rowsToCsvText(result, rowIndexes)
  return { format, sourceTable, rowCount: rowIndexes.length, text }
}
