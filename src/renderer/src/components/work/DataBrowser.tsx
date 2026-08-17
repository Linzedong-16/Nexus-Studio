import { useEffect, useCallback, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Loader2,
  Plus,
  RotateCcw,
  SquarePen,
  Trash2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ColumnInfo } from '@/types/ipc'
import type { TableTabState, WorkspaceTab } from '@/types/workspace'
import { queryService } from '@/services/queryService'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import AddRowDialog from './AddRowDialog'
import ImportDataDialog from './ImportDataDialog'
import ResultTable from './ResultTable'

interface DataBrowserProps {
  tab: WorkspaceTab
}

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500]

/**
 * 表数据浏览标签页
 *
 * 进入时自动按 `SELECT * FROM "<schema>"."<table>"` 分页加载第一页（默认 100 条），
 * 提供上一页/下一页/首页/末页与每页条数切换。分页采用 LIMIT/OFFSET。
 */
export default function DataBrowser({ tab }: DataBrowserProps): React.JSX.Element {
  const state = tab.state as TableTabState
  const updateTableTab = useWorkspaceStore((s) => s.updateTableTab)
  const setQueryLoading = useWorkspaceStore((s) => s.setQueryLoading)
  const setQueryResult = useWorkspaceStore((s) => s.setQueryResult)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const connectionId = activeConnectionId ?? state.connectionId

  /** 请求序号，防止快速翻页时旧请求结果覆盖新请求结果 */
  const requestSeqRef = useRef(0)

  const [editMode, setEditMode] = useState(false)
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(() => new Set())
  const [addRowOpen, setAddRowOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const rowCount = tab.result?.rows.length ?? 0
  const allSelected = rowCount > 0 && selectedRowIndexes.size === rowCount
  const someSelected = selectedRowIndexes.size > 0 && !allSelected
  const selectAllChecked: boolean | 'indeterminate' = allSelected
    ? true
    : someSelected
      ? 'indeterminate'
      : false

  const toggleEditMode = (): void => {
    setEditMode((prev) => {
      if (prev) setSelectedRowIndexes(new Set())
      return !prev
    })
  }

  const toggleRowSelected = (rowIndex: number): void => {
    setSelectedRowIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  const toggleSelectAll = (): void => {
    setSelectedRowIndexes((prev) =>
      prev.size === rowCount ? new Set() : new Set(Array.from({ length: rowCount }, (_, i) => i))
    )
  }

  const handleAddRow = (): void => {
    setAddRowOpen(true)
  }

  const handleDeleteSelectedRows = (): void => {
    if (selectedRowIndexes.size === 0) return
    setDeleteError(null)
    setDeleteConfirmOpen(true)
  }

  const totalPages = state.totalPages ?? 0
  const hasPrev = state.page > 1
  const hasNext = state.page < totalPages

  const loadPage = useCallback(
    async (page: number, pageSize: number): Promise<void> => {
      if (tab.loading) return
      const seq = ++requestSeqRef.current
      const offset = (page - 1) * pageSize
      const whereClause = state.filter ? ` WHERE ${state.filter}` : ''
      const sql = `SELECT * FROM "${state.schema}"."${state.table}"${whereClause} LIMIT ${pageSize} OFFSET ${offset};`
      setQueryLoading(tab.id, true)
      try {
        const result = await queryService.execute(connectionId, state.database, sql)
        // 防竞态：仅当该请求仍是最后一次发起的请求时，才更新结果
        if (requestSeqRef.current !== seq) return
        setQueryResult(tab.id, result)
      } catch (error) {
        if (requestSeqRef.current !== seq) return
        setQueryResult(tab.id, null, error instanceof Error ? error.message : '查询表数据失败')
      }
    },
    [
      connectionId,
      state.database,
      state.schema,
      state.table,
      state.filter,
      tab.id,
      tab.loading,
      setQueryLoading,
      setQueryResult
    ]
  )

  // 进入标签页时加载第一页、统计总行数（用于计算总页数），并缓存列元数据供编辑/删除复用
  useEffect(() => {
    void loadPage(1, state.pageSize)
    void (async () => {
      try {
        const whereClause = state.filter ? ` WHERE ${state.filter}` : ''
        const result = await queryService.execute(
          connectionId,
          state.database,
          `SELECT COUNT(*) AS "count" FROM "${state.schema}"."${state.table}"${whereClause};`
        )
        const count = Number(result.rows[0]?.count ?? 0)
        const totalPages = count === 0 ? 0 : Math.ceil(count / state.pageSize)
        updateTableTab(tab.id, { total: count, totalPages })
      } catch {
        // 统计失败不阻塞数据展示，分页按钮退化为仅首页可查看
      }
    })()
    queryService
      .getColumns(connectionId, state.database, state.schema, state.table)
      .then(setColumns)
      .catch(() => {
        // 列元数据获取失败不阻塞数据展示，仅影响编辑/删除时的主键定位（将退化为整行匹配）
      })
    // 仅在首次进入时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  const goTo = (page: number): void => {
    const clamped = Math.max(1, Math.min(page, totalPages))
    updateTableTab(tab.id, { page: clamped })
    void loadPage(clamped, state.pageSize)
  }

  const changePageSize = (pageSize: number): void => {
    updateTableTab(tab.id, { pageSize, page: 1 })
    void loadPage(1, pageSize)
  }

  const confirmDeleteSelectedRows = async (): Promise<void> => {
    const rows = tab.result?.rows ?? []
    setDeleting(true)
    setDeleteError(null)
    try {
      const pkColumns = columns.filter((c) => c.isPrimaryKey)
      // 无主键时退化为整行匹配：按当前所有列的值做等值比较来定位该行
      const identifyingColumns = pkColumns.length > 0 ? pkColumns : columns

      for (const rowIndex of selectedRowIndexes) {
        const row = rows[rowIndex]
        if (!row) continue
        const conditions: string[] = []
        const params: unknown[] = []
        for (const column of identifyingColumns) {
          const value = row[column.name]
          if (value === null || value === undefined) {
            conditions.push(`"${column.name}" IS NULL`)
          } else {
            params.push(value)
            conditions.push(`"${column.name}" = $${params.length}`)
          }
        }
        const sql = `DELETE FROM "${state.schema}"."${state.table}" WHERE ${conditions.join(' AND ')}`
        await queryService.execute(connectionId, state.database, sql, params)
      }

      setDeleteConfirmOpen(false)
      setSelectedRowIndexes(new Set())
      void loadPage(state.page, state.pageSize)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  /** 编辑模式下提交单元格新值：按主键（无主键则整行）定位目标行并执行 UPDATE，成功后原地更新本地结果 */
  const commitCellEdit = async (
    rowIndex: number,
    columnName: string,
    rawValue: string
  ): Promise<void> => {
    const result = tab.result
    const row = result?.rows[rowIndex]
    if (!result || !row) return

    const pkColumns = columns.filter((c) => c.isPrimaryKey)
    const identifyingColumns = pkColumns.length > 0 ? pkColumns : columns
    const newValue = rawValue.length === 0 ? null : rawValue
    const params: unknown[] = [newValue]
    const conditions: string[] = []
    for (const column of identifyingColumns) {
      const value = row[column.name]
      if (value === null || value === undefined) {
        conditions.push(`"${column.name}" IS NULL`)
      } else {
        params.push(value)
        conditions.push(`"${column.name}" = $${params.length}`)
      }
    }
    const sql = `UPDATE "${state.schema}"."${state.table}" SET "${columnName}" = $1 WHERE ${conditions.join(' AND ')}`
    await queryService.execute(connectionId, state.database, sql, params)
    setQueryResult(tab.id, {
      ...result,
      rows: result.rows.map((r, i) => (i === rowIndex ? { ...r, [columnName]: newValue } : r))
    })
  }

  /** 编辑模式下追加在切换按钮同一行的操作项，从左往右依次浮现/下沉 */
  const editTools: { key: string; content: React.ReactNode }[] = [
    {
      key: 'select-all',
      content: (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Checkbox 本身即 Radix 的 <button>，不可再嵌套一层 <button>（否则浏览器会拆解非法的
                button-in-button 结构，导致点击中间区域实际命中的是被拆出的错位节点）。
                用不可交互的 <span> 承载点击区域与 hover 样式，点击事件从内部 Checkbox 冒泡上来即可。 */}
            <span
              className="flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
              onClick={toggleSelectAll}
            >
              <Checkbox checked={selectAllChecked} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">全选</TooltipContent>
        </Tooltip>
      )
    },
    {
      key: 'add-row',
      content: (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleAddRow}>
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新增行</TooltipContent>
        </Tooltip>
      )
    },
    {
      key: 'import-data',
      content: (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">导入数据</TooltipContent>
        </Tooltip>
      )
    },
    {
      key: 'delete-rows',
      content: (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={selectedRowIndexes.size === 0}
              onClick={handleDeleteSelectedRows}
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">删除选中行</TooltipContent>
        </Tooltip>
      )
    }
  ]

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* 工具栏 */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Badge variant="secondary" className="shrink-0">
          {state.connectionName}
        </Badge>
        <Badge variant="outline" className="shrink-0">
          {state.breadcrumb ?? `${state.database} · ${state.schema}.${state.table}`}
        </Badge>
        {state.filter && (
          <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
            WHERE {state.filter}
          </Badge>
        )}
        <div className="flex-1" />
        {tab.loading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            加载中…
          </span>
        )}
      </div>

      {/* 编辑/只读模式切换：全选/新增/删除按钮追加在同一行，编辑模式下从行底部依次浮现 */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={toggleEditMode}
              aria-pressed={editMode}
            >
              {editMode ? <SquarePen className="size-4" /> : <BookOpen className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {editMode ? '切换为只读模式' : '进入编辑模式'}
          </TooltipContent>
        </Tooltip>

        {editTools.map(({ key, content }, index) => (
          <span key={key} className="flex h-9 items-center overflow-hidden">
            <span
              className={cn(
                'flex transition-[transform,opacity] duration-200 ease-out',
                editMode
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-full opacity-0 pointer-events-none'
              )}
              style={{ transitionDelay: `${index * 70}ms` }}
            >
              {content}
            </span>
          </span>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {tab.resultReleased ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>结果已释放以节省内存</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadPage(state.page, state.pageSize)}
            >
              <RotateCcw className="size-3.5" />
              重新执行
            </Button>
          </div>
        ) : (
          <ResultTable
            result={tab.result ?? null}
            error={tab.error}
            loading={tab.loading ?? false}
            editMode={editMode}
            selectedRowIndexes={editMode ? selectedRowIndexes : undefined}
            onToggleRow={toggleRowSelected}
            onCellCommit={commitCellEdit}
            sourceTable={{ schema: state.schema, name: state.table }}
            queryContext={{
              connectionId,
              database: state.database,
              sql: `SELECT * FROM "${state.schema}"."${state.table}"${state.filter ? ` WHERE ${state.filter}` : ''};`
            }}
          />
        )}

        {/* 分页栏 */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-t px-3 text-xs text-muted-foreground">
          <span>
            共 {state.total ?? tab.result?.rows.length ?? 0} 行
            {totalPages > 0 && ` · 第 ${state.page}/${totalPages} 页`}
          </span>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <span className="shrink-0">每页</span>
            <Select value={String(state.pageSize)} onValueChange={(v) => changePageSize(Number(v))}>
              <SelectTrigger size="sm" className="h-7 w-18">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!hasPrev || tab.loading}
              onClick={() => goTo(1)}
              title="首页"
            >
              <ChevronFirst className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!hasPrev || tab.loading}
              onClick={() => goTo(state.page - 1)}
              title="上一页"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!hasNext || tab.loading}
              onClick={() => goTo(state.page + 1)}
              title="下一页"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!hasNext || tab.loading}
              onClick={() => goTo(totalPages)}
              title="末页"
            >
              <ChevronLast className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <AddRowDialog
        open={addRowOpen}
        onOpenChange={setAddRowOpen}
        connectionId={connectionId}
        database={state.database}
        schema={state.schema}
        table={state.table}
        onInserted={() => loadPage(state.page, state.pageSize)}
      />

      <ImportDataDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        connectionId={connectionId}
        database={state.database}
        defaultSchema={state.schema}
        defaultTable={state.table}
        onImported={() => loadPage(state.page, state.pageSize)}
      />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(o) => {
          if (!deleting) setDeleteConfirmOpen(o)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除选中的 {selectedRowIndexes.size} 行数据？</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            此操作将从数据库中永久删除这些行，且不可撤销。
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDeleteSelectedRows()}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
