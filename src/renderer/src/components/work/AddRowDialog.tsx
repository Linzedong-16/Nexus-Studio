import { useEffect, useState } from 'react'
import { Info, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { queryService } from '@/services/queryService'
import type { ColumnInfo } from '@/types/ipc'
import LargeValueEditorDialog from './LargeValueEditorDialog'

interface AddRowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  database: string
  schema: string
  table: string
  onInserted: () => void
}

/** 存储数据量可能很大的类型：单行 Input 太窄，提供放大镜入口用大文本域编辑 */
const LARGE_TEXT_TYPES = new Set(['text', 'json', 'jsonb', 'xml'])

/**
 * 新增行弹框
 *
 * 根据当前表的列元数据动态生成表单，校验非空字段，
 * 构建参数化 INSERT 语句并真正执行写入。
 */
export default function AddRowDialog({
  open,
  onOpenChange,
  connectionId,
  database,
  schema,
  table,
  onInserted
}: AddRowDialogProps): React.JSX.Element {
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  // 弹框由关闭切换为打开时重置表单，渲染期间调整状态，避免额外一次级联重渲染
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setValues({})
      setSubmitError(null)
      setEditingColumn(null)
    }
  }

  useEffect(() => {
    if (!open) return
    // 打开弹框时拉取列信息，需要立即置为加载中；这是标准的数据获取场景
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingColumns(true)
    void queryService
      .getColumns(connectionId, database, schema, table)
      .then(setColumns)
      .catch((error) => {
        setSubmitError(error instanceof Error ? error.message : '获取列信息失败')
      })
      .finally(() => setLoadingColumns(false))
  }, [open, connectionId, database, schema, table])

  const setValue = (name: string, value: string): void => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async (): Promise<void> => {
    const missing = columns.filter(
      (c) => !c.nullable && !c.defaultValue && !(values[c.name] ?? '').trim()
    )
    if (missing.length > 0) {
      setSubmitError(`以下字段为必填：${missing.map((c) => c.name).join('、')}`)
      return
    }

    const insertColumns: string[] = []
    const params: string[] = []
    for (const column of columns) {
      const value = (values[column.name] ?? '').trim()
      if (!value) continue
      insertColumns.push(column.name)
      params.push(value)
    }

    const sql = `INSERT INTO "${schema}"."${table}" (${insertColumns
      .map((c) => `"${c}"`)
      .join(', ')}) VALUES (${params.map((_, i) => `$${i + 1}`).join(', ')})`

    setSubmitting(true)
    setSubmitError(null)
    try {
      await queryService.execute(connectionId, database, sql, params)
      onOpenChange(false)
      onInserted()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '插入失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Insert To table: {schema}.{table}
            </DialogTitle>
          </DialogHeader>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto py-1">
            {columns.map((column) => {
              const required = !column.nullable && !column.defaultValue
              const isLargeText = LARGE_TEXT_TYPES.has(column.dataType)
              return (
                <div key={column.name} className="space-y-1.5">
                  <Label className="justify-between">
                    <span className="flex items-center gap-1.5">
                      {column.name}
                      {column.isPrimaryKey && (
                        <Badge variant="outline" className="px-1 text-[10px]">
                          PK
                        </Badge>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{column.dataType}</p>
                          <p>{column.nullable ? '可为空' : '必填'}</p>
                          {column.defaultValue && <p>默认: {column.defaultValue}</p>}
                          {column.comment && <p>{column.comment}</p>}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    {isLargeText && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="flex size-5 items-center justify-center rounded hover:bg-accent"
                            onClick={() => setEditingColumn(column.name)}
                          >
                            <Search className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">编辑大文本 / JSON</TooltipContent>
                      </Tooltip>
                    )}
                  </Label>
                  <Input
                    value={values[column.name] ?? ''}
                    onChange={(e) => setValue(column.name, e.target.value)}
                    placeholder={
                      required
                        ? '必填'
                        : column.defaultValue
                          ? `默认: ${column.defaultValue}`
                          : '可为空'
                    }
                  />
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={submitting || loadingColumns}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LargeValueEditorDialog
        open={editingColumn !== null}
        onOpenChange={(o) => !o && setEditingColumn(null)}
        initialValue={editingColumn ? (values[editingColumn] ?? '') : ''}
        onSave={(v) => {
          if (editingColumn) setValue(editingColumn, v)
        }}
      />
    </>
  )
}
