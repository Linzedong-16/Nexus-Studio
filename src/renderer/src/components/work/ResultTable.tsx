import { AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QueryResult } from '@/types/ipc'

interface ResultTableProps {
  result: QueryResult | null
  error?: string
  loading: boolean
}

/** 单元格格式化：null → NULL，对象/数组 → JSON，其余转字符串 */
function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground">NULL</span>
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value)
}

/**
 * 查询结果表格（手写实现，未引入 TanStack）
 */
export default function ResultTable({
  result,
  error,
  loading
}: ResultTableProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm">查询执行中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-start justify-center p-6">
        <div className="flex w-full max-w-xl items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">查询失败</p>
            <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!result || result.rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {result ? '无结果' : '执行查询后显示结果'}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          共 {result.rows.length} 行 · {result.fields.length} 列
        </span>
        <span>{result.durationMs} ms</span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {result.fields.map((field) => (
                <th
                  key={field.name}
                  className="whitespace-nowrap border-b border-r px-3 py-1.5 text-left font-medium"
                >
                  <span className="mr-1.5">{field.name}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {field.dataType}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn('hover:bg-accent/40', rowIndex % 2 === 1 && 'bg-muted/30')}
              >
                {result.fields.map((field) => (
                  <td
                    key={field.name}
                    className="max-w-[300px] truncate whitespace-nowrap border-b px-3 py-1 font-mono text-xs"
                  >
                    {formatCell(row[field.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
