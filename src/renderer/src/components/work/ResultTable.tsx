import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, Loader2, Search } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { QueryResult } from '@/types/ipc'
import LargeValueEditorDialog from './LargeValueEditorDialog'

interface ResultTableProps {
  result: QueryResult | null
  error?: string
  loading: boolean
  editMode?: boolean
  selectedRowIndexes?: Set<number>
  onToggleRow?: (rowIndex: number) => void
  /** 编辑模式下提交单元格新值：由外层构建 UPDATE 语句并真正写入数据库 */
  onCellCommit?: (rowIndex: number, columnName: string, rawValue: string) => Promise<void>
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

/** 单元格原始文本：供行内编辑框/大文本弹框回填初始值，与 formatCell 的展示态区分 */
function rawCellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

interface EditingCell {
  rowIndex: number
  columnName: string
}

/** 单元格内容固定单行截断，行高恒定，供虚拟滚动按固定尺寸计算而无需逐行测量 */
const ROW_HEIGHT = 25
/** 每列最小宽度：列少时按容器宽度均分撑满，列多到分不下时退化为该宽度并出现横向滚动 */
const MIN_COL_WIDTH = 140
/** 行首选择框列宽度，与原先 `w-9` 一致 */
const CHECKBOX_COL_WIDTH = 36

/**
 * 查询结果表格：div + CSS Grid 实现，行级虚拟滚动（@tanstack/react-virtual）。
 * 表头与每一行共享同一份 gridTemplateColumns 以保证列对齐；同一时刻仅挂载可视区域
 * 内的行，避免整表渲染导致 DOM 过重（尤其影响主题切换的 view-transition 快照性能）。
 */
export default function ResultTable({
  result,
  error,
  loading,
  editMode = false,
  selectedRowIndexes,
  onToggleRow,
  onCellCommit
}: ResultTableProps): React.JSX.Element {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingCell, setSavingCell] = useState(false)
  const [largeEditCell, setLargeEditCell] = useState<EditingCell | null>(null)
  const skipBlurCommitRef = useRef(false)
  const [prevEditMode, setPrevEditMode] = useState(editMode)

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // 退出编辑模式时，放弃尚未提交的行内编辑，避免残留编辑框
  // （渲染期间的状态调整，而非副作用，避免额外的一次级联重渲染）
  if (editMode !== prevEditMode) {
    setPrevEditMode(editMode)
    if (!editMode) {
      setEditingCell(null)
      setEditError(null)
    }
  }

  // 监听滚动容器宽度变化，用于计算「列少时均分撑满、列多时退化为最小宽度」的列宽
  // 使用 rAF 节流，避免侧边栏收展动画期间每帧触发 ResizeObserver 导致全表重算列宽
  useEffect(() => {
    if (!scrollEl) return
    let rafId = 0
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width === undefined) return
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setContainerWidth(width)
      })
    })
    observer.observe(scrollEl)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [scrollEl])

  const virtualizer = useVirtualizer({
    count: result?.rows.length ?? 0,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const startEdit = (rowIndex: number, columnName: string, value: unknown): void => {
    setEditingCell({ rowIndex, columnName })
    setEditValue(rawCellText(value))
    setEditError(null)
  }

  const openViewer = (rowIndex: number, columnName: string): void => {
    setLargeEditCell({ rowIndex, columnName })
  }

  const cancelEdit = (): void => {
    skipBlurCommitRef.current = true
    setEditingCell(null)
    setEditError(null)
  }

  const commitEdit = async (): Promise<void> => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false
      return
    }
    if (!editingCell || savingCell) return
    const original = rawCellText(result?.rows[editingCell.rowIndex]?.[editingCell.columnName])
    if (editValue === original) {
      setEditingCell(null)
      setEditError(null)
      return
    }
    setSavingCell(true)
    try {
      await onCellCommit?.(editingCell.rowIndex, editingCell.columnName, editValue)
      setEditingCell(null)
      setEditError(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingCell(false)
    }
  }

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

  const checkboxColWidth = editMode ? CHECKBOX_COL_WIDTH : 0
  const availableWidth = Math.max(0, containerWidth - checkboxColWidth)
  const colWidth =
    result.fields.length > 0
      ? Math.max(MIN_COL_WIDTH, Math.floor(availableWidth / result.fields.length))
      : MIN_COL_WIDTH
  const gridTemplateColumns = `${checkboxColWidth}px repeat(${result.fields.length}, ${colWidth}px)`

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          共 {result.rows.length} 行 · {result.fields.length} 列
        </span>
        <span>{result.durationMs} ms</span>
      </div>

      <div ref={setScrollEl} className="flex-1 overflow-auto">
        <div role="table" className="text-sm">
          <div
            role="row"
            className="sticky top-0 z-10 w-full bg-muted"
            style={{ display: 'grid', gridTemplateColumns }}
          >
            <div className={cn('border-b', editMode && 'border-r')} />
            {result.fields.map((field) => (
              <div
                key={field.name}
                role="columnheader"
                className="min-w-0 truncate border-b border-r px-3 py-1.5 text-left font-medium whitespace-nowrap"
              >
                <span className="mr-1.5">{field.name}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {field.dataType}
                </span>
              </div>
            ))}
          </div>

          <div role="rowgroup" style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const rowIndex = virtualRow.index
              const row = result.rows[rowIndex]
              return (
                <div
                  key={rowIndex}
                  role="row"
                  className={cn(
                    'absolute top-0 left-0 w-full hover:bg-accent/40',
                    rowIndex % 2 === 1 && 'bg-muted/30',
                    selectedRowIndexes?.has(rowIndex) && 'bg-primary/10'
                  )}
                  style={{
                    display: 'grid',
                    gridTemplateColumns,
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                >
                  <div className="flex items-center justify-center border-b px-1">
                    {editMode && (
                      <span className="inline-flex animate-in fade-in-0 slide-in-from-left-1 duration-150">
                        <Checkbox
                          checked={selectedRowIndexes?.has(rowIndex) ?? false}
                          onCheckedChange={() => onToggleRow?.(rowIndex)}
                        />
                      </span>
                    )}
                  </div>
                  {result.fields.map((field) => {
                    const isEditingThisCell =
                      editingCell?.rowIndex === rowIndex && editingCell.columnName === field.name
                    return (
                      <div
                        key={field.name}
                        role="cell"
                        className={cn(
                          'group relative min-w-0 truncate border-b px-3 py-1 font-mono text-xs whitespace-nowrap',
                          editMode && !isEditingThisCell && 'cursor-text'
                        )}
                        onDoubleClick={
                          editMode
                            ? () => startEdit(rowIndex, field.name, row[field.name])
                            : () => openViewer(rowIndex, field.name)
                        }
                      >
                        {isEditingThisCell ? (
                          <input
                            autoFocus
                            value={editValue}
                            disabled={savingCell}
                            title={editError ?? undefined}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void commitEdit()
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                cancelEdit()
                              }
                            }}
                            onBlur={() => void commitEdit()}
                            className={cn(
                              'w-full bg-transparent outline-none',
                              editError && 'text-destructive'
                            )}
                          />
                        ) : (
                          <>
                            <span className={cn(editMode && 'pr-5')}>
                              {formatCell(row[field.name])}
                            </span>
                            {editMode && (
                              <button
                                type="button"
                                className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setLargeEditCell({ rowIndex, columnName: field.name })
                                }}
                              >
                                <Search className="size-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <LargeValueEditorDialog
        open={largeEditCell !== null}
        onOpenChange={(o) => !o && setLargeEditCell(null)}
        initialValue={
          largeEditCell
            ? rawCellText(result.rows[largeEditCell.rowIndex]?.[largeEditCell.columnName])
            : ''
        }
        readOnly={!editMode}
        onSave={
          editMode
            ? async (value) => {
                if (!largeEditCell) return
                await onCellCommit?.(largeEditCell.rowIndex, largeEditCell.columnName, value)
              }
            : undefined
        }
      />
    </div>
  )
}
