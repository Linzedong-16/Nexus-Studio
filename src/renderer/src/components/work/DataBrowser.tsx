import { useEffect, useCallback, useRef } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { TableTabState, WorkspaceTab } from '@/types/workspace'
import { queryService } from '@/services/queryService'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
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

  // 进入标签页时加载第一页并统计总行数（用于计算总页数）
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

      <div className="flex flex-1 flex-col overflow-hidden">
        <ResultTable result={tab.result ?? null} error={tab.error} loading={tab.loading ?? false} />

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
    </div>
  )
}
