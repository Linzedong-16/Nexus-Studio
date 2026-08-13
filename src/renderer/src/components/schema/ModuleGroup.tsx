import {
  ChevronDown,
  ChevronRight,
  Cog,
  Loader2,
  Plus,
  RefreshCw,
  Sigma,
  Table2,
  Terminal,
  View
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { ModuleKind } from '@/types/database'
import type { RoutineInfo, TableInfo } from '@/types/ipc'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { getSqlTemplate } from '@/lib/sqlTemplates'
import AddToConversationMenuItem from '@/components/code/AddToConversationMenuItem'
import { useInCodeMode } from '@/components/code/useInCodeMode'
import TableNode from './TableNode'

interface ModuleGroupProps {
  connectionId: string
  connectionName: string
  database: string
  /** 省略时为数据库层级的模块（如 PostgreSQL 的 Query 快捷入口） */
  schema?: string
  moduleKind: ModuleKind
}

const MODULE_LABEL: Record<ModuleKind, string> = {
  query: 'Query',
  tables: 'Tables',
  views: 'Views',
  functions: 'Functions',
  procedures: 'Procedures'
}

const MODULE_ICON: Record<ModuleKind, typeof Table2> = {
  query: Terminal,
  tables: Table2,
  views: View,
  functions: Sigma,
  procedures: Cog
}

/**
 * 结构树模块分组
 *
 * 渲染方式由 `moduleKind` 决定：`query` 为直接可点击的快捷入口（不展开、不加载列表），
 * 其余模块（Tables/Views/Functions/Procedures）为可展开分组，按需加载并独立维护加载中/错误态。
 * 具体某数据库类型下出现哪些模块由 `databaseCapabilities.ts` 决定，本组件不做任何类型判断（宪法 IV）。
 */
export default function ModuleGroup({
  connectionId,
  connectionName,
  database,
  schema,
  moduleKind
}: ModuleGroupProps): React.JSX.Element {
  const module = useConnectionStore((s) =>
    schema
      ? s.connections[connectionId]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.modules?.[
          moduleKind
        ]
      : undefined
  )
  const toggleModule = useConnectionStore((s) => s.toggleModule)
  const loadModuleItems = useConnectionStore((s) => s.loadModuleItems)
  const openQueryTab = useWorkspaceStore((s) => s.openQueryTab)
  const inCodeMode = useInCodeMode()

  const Icon = MODULE_ICON[moduleKind]
  const label = MODULE_LABEL[moduleKind]

  if (moduleKind === 'query') {
    const handleOpenQuery = (): void => {
      if (inCodeMode) return
      openQueryTab({
        connectionId,
        connectionName,
        database,
        schema,
        defaultSql: '-- 在此输入 SQL\n'
      })
    }
    return (
      <button
        type="button"
        onClick={handleOpenQuery}
        title="打开查询标签页"
        className="flex w-full items-center gap-1.5 px-2 py-0.5 pl-6 text-left text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        <Icon className="size-3.5 shrink-0 text-purple-500 dark:text-purple-400" />
        <span className="truncate">{label}</span>
      </button>
    )
  }

  if (!schema) return <></>

  const expanded = module?.expanded ?? false
  const items = module?.items
  const loading = module?.loading ?? false
  const error = module?.error

  const handleToggle = (): void => toggleModule(connectionId, database, schema, moduleKind)
  const handleRefresh = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void loadModuleItems(connectionId, database, schema, moduleKind, { force: true })
  }

  const handleCreate = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (inCodeMode || !schema) return
    const actionKind =
      moduleKind === 'views'
        ? ('createView' as const)
        : moduleKind === 'procedures'
          ? ('createProcedure' as const)
          : ('createFunction' as const)
    openQueryTab({
      connectionId,
      connectionName,
      database,
      schema,
      defaultSql: getSqlTemplate(actionKind, { schema })
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <button
            type="button"
            onClick={handleToggle}
            className="group flex w-full items-center gap-1 px-2 py-0.5 pl-6 text-left text-[13px] hover:bg-accent/50"
          >
            {expanded ? (
              <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            )}
            <Icon className="size-3.5 shrink-0 text-green-500 dark:text-green-400" />
            <span className="truncate">{label}</span>
            {items && items.length > 0 && (
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {items.length}
              </span>
            )}
            {expanded && moduleKind !== 'tables' && (
              <span title={`创建${label}`}>
                <Plus
                  className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                  onClick={handleCreate}
                />
              </span>
            )}
            {expanded && (
              <RefreshCw
                className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                onClick={handleRefresh}
              />
            )}
          </button>

          {expanded && (
            <div>
              {loading && (
                <div className="flex items-center gap-1.5 px-2 py-1 pl-10 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  加载中…
                </div>
              )}
              {!loading && error && (
                <div className="flex items-center gap-1.5 px-2 py-1 pl-10 text-xs text-destructive">
                  <span className="truncate">{error}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 gap-1 px-1"
                    onClick={handleRefresh}
                  >
                    <RefreshCw className="size-3" />
                    重试
                  </Button>
                </div>
              )}
              {!loading && !error && items && items.length === 0 && (
                <div className="px-2 py-1 pl-10 text-xs text-muted-foreground">暂无数据</div>
              )}
              {!loading &&
                !error &&
                (moduleKind === 'tables' || moduleKind === 'views') &&
                (items as TableInfo[] | undefined)?.map((table) => (
                  <TableNode
                    key={table.name}
                    connectionId={connectionId}
                    connectionName={connectionName}
                    database={database}
                    schema={schema}
                    table={table}
                  />
                ))}
              {!loading &&
                !error &&
                (moduleKind === 'functions' || moduleKind === 'procedures') &&
                (items as RoutineInfo[] | undefined)?.map((routine) => (
                  <RoutineRow key={routine.name} routine={routine} />
                ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      {inCodeMode && schema && (
        <ContextMenuContent>
          <AddToConversationMenuItem
            id={`module:${connectionId}:${database}:${schema}:${moduleKind}`}
            type="moduleGroup"
            label={MODULE_LABEL[moduleKind]}
            detail={`${connectionName} / ${database} / ${schema}`}
          />
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

/** 表/视图行节点已抽离到 TableNode.tsx（含 Columns/Indexes/Triggers 子模块） */

function RoutineRow({ routine }: { routine: RoutineInfo }): React.JSX.Element {
  return (
    <div
      title={routine.comment}
      className="flex items-center gap-1.5 px-2 py-0.5 pl-10 text-[13px] text-muted-foreground"
    >
      <span className="truncate">{routine.name}</span>
      {routine.argumentsSignature !== undefined && (
        <span className="truncate text-xs text-muted-foreground/70">
          ({routine.argumentsSignature})
        </span>
      )}
    </div>
  )
}
