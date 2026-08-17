import { useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { QueryTabState, WorkspaceTab } from '@/types/workspace'
import { queryService } from '@/services/queryService'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import SqlEditor from './SqlEditor'
import ResultTable from './ResultTable'

interface QueryPanelProps {
  tab: WorkspaceTab
}

/**
 * 查询标签页面板
 *
 * 顶部工具栏 + 可拖拽分割的编辑器/结果区域。
 */
export default function QueryPanel({ tab }: QueryPanelProps): React.JSX.Element {
  const state = tab.state as QueryTabState
  const updateQueryTab = useWorkspaceStore((s) => s.updateQueryTab)
  const setQueryLoading = useWorkspaceStore((s) => s.setQueryLoading)
  const setQueryResult = useWorkspaceStore((s) => s.setQueryResult)
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(() => new Set())

  const toggleRowSelected = (rowIndex: number): void => {
    setSelectedRowIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  /** 执行成功后根据 SQL 类型自动刷新对应数据列表 */
  const autoRefresh = (state: QueryTabState): void => {
    const sql = state.sql.trim().toUpperCase()
    const connStore = useConnectionStore.getState()
    const connectionId = state.connectionId
    const database = state.database
    const schema = state.schema

    if (sql.startsWith('CREATE DATABASE')) {
      void connStore.loadDatabases(connectionId, { force: true })
    } else if (sql.startsWith('CREATE TABLE')) {
      if (schema) {
        void connStore.loadModuleItems(connectionId, database, schema, 'tables', { force: true })
      }
    } else if (sql.startsWith('CREATE VIEW')) {
      if (schema) {
        void connStore.loadModuleItems(connectionId, database, schema, 'views', { force: true })
      }
    } else if (sql.startsWith('CREATE PROCEDURE')) {
      if (schema) {
        void connStore.loadModuleItems(connectionId, database, schema, 'procedures', {
          force: true
        })
      }
    } else if (sql.startsWith('CREATE FUNCTION')) {
      if (schema) {
        void connStore.loadModuleItems(connectionId, database, schema, 'functions', { force: true })
      }
    }
  }

  const runQuery = async (): Promise<void> => {
    if (!state.sql.trim() || tab.loading) return
    setQueryLoading(tab.id, true)
    setSelectedRowIndexes(new Set())
    try {
      const result = await queryService.execute(state.connectionId, state.database, state.sql)
      setQueryResult(tab.id, result)
      // 执行成功后根据 SQL 类型自动刷新对应数据列表
      autoRefresh(state)
    } catch (error) {
      setQueryResult(tab.id, null, error instanceof Error ? error.message : '查询执行失败')
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* 工具栏 */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Badge variant="secondary" className="shrink-0">
          {state.connectionName}
        </Badge>
        <Badge variant="outline" className="shrink-0">
          {state.database}
          {state.schema ? ` · ${state.schema}` : ''}
        </Badge>
        <div className="flex-1" />
        {tab.loading && <span className="text-xs text-muted-foreground">运行中…</span>}
        <Button
          size="sm"
          onClick={() => void runQuery()}
          disabled={tab.loading || !state.sql.trim()}
          title="执行 (Ctrl+Enter)"
        >
          <Play className="size-3.5" />
          执行
        </Button>
      </div>

      {/* 编辑器 / 结果分割 */}
      <div className="min-h-0 flex-1">
        <Group orientation="vertical" className="h-full">
          <Panel id="editor" defaultSize="50" minSize="20">
            <div className="h-full">
              <SqlEditor
                value={state.sql}
                onChange={(value) => updateQueryTab(tab.id, { sql: value })}
                onExecute={() => void runQuery()}
                connectionId={state.connectionId}
                database={state.database}
                schema={state.schema}
              />
            </div>
          </Panel>
          <Separator
            id="editor-result-separator"
            className={cn(
              'h-1 shrink-0 bg-border data-separator:bg-border',
              'hover:bg-primary/50 data-separator-active:bg-primary'
            )}
          />
          <Panel id="result" defaultSize="50" minSize="15">
            <div className="h-full">
              {tab.resultReleased ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span>结果已释放以节省内存</span>
                  <Button size="sm" variant="outline" onClick={() => void runQuery()}>
                    <RotateCcw className="size-3.5" />
                    重新执行
                  </Button>
                </div>
              ) : (
                <ResultTable
                  result={tab.result ?? null}
                  error={tab.error}
                  loading={tab.loading ?? false}
                  selectedRowIndexes={selectedRowIndexes}
                  onToggleRow={toggleRowSelected}
                  queryContext={{
                    connectionId: state.connectionId,
                    database: state.database,
                    sql: state.sql
                  }}
                />
              )}
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  )
}
