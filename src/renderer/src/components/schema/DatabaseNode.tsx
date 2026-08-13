import {
  ChevronDown,
  ChevronRight,
  Database,
  GitFork,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { DATABASE_CAPABILITIES } from '@/config/databaseCapabilities'
import { getSqlTemplate } from '@/lib/sqlTemplates'
import type { DatabaseInfo, DatabaseType } from '@/types/ipc'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import AddToConversationMenuItem from '@/components/code/AddToConversationMenuItem'
import { useInCodeMode } from '@/components/code/useInCodeMode'
import ModuleGroup from './ModuleGroup'
import SchemaNode from './SchemaNode'

interface DatabaseNodeProps {
  connectionId: string
  connectionName: string
  connectionType: DatabaseType
  database: DatabaseInfo
}

/**
 * 数据库节点
 *
 * 点击/展开时切换当前浏览的数据库上下文（`setActiveDatabase`），并按需加载该数据库下的 Schema 列表。
 * 数据库层级的模块快捷入口（如 PostgreSQL 的 Query）由 `databaseCapabilities.ts` 驱动渲染。
 */
export default function DatabaseNode({
  connectionId,
  connectionName,
  connectionType,
  database
}: DatabaseNodeProps): React.JSX.Element {
  const node = useConnectionStore(
    (s) => s.connections[connectionId]?.databaseNodes?.[database.name]
  )
  const activeDatabase = useConnectionStore((s) => s.connections[connectionId]?.activeDatabase)
  const toggleDatabaseNode = useConnectionStore((s) => s.toggleDatabaseNode)
  const setActiveDatabase = useConnectionStore((s) => s.setActiveDatabase)
  const loadSchemas = useConnectionStore((s) => s.loadSchemas)
  const inCodeMode = useInCodeMode()

  const expanded = node?.expanded ?? false
  const isActive = activeDatabase === database.name
  const databaseLevelModules = DATABASE_CAPABILITIES[connectionType].databaseLevelModules

  const handleClick = (): void => {
    setActiveDatabase(connectionId, database.name)
    toggleDatabaseNode(connectionId, database.name)
  }

  const handleRefresh = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void loadSchemas(connectionId, database.name, { force: true })
  }

  const handleErAnalysis = (): void => {
    if (inCodeMode) return
    useWorkspaceStore.getState().openErAnalysisTab({
      connectionId,
      connectionName,
      database: database.name
    })
  }

  const handleCreateTable = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (inCodeMode) return
    const defaultSchema = node?.schemas?.[0]?.name ?? 'public'
    useWorkspaceStore.getState().openQueryTab({
      connectionId,
      connectionName,
      database: database.name,
      schema: defaultSchema,
      defaultSql: getSqlTemplate('createTable', { schema: defaultSchema })
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <div
            className={cn(
              'group flex w-full items-center gap-1 px-2 py-0.5 text-[13px]',
              isActive ? 'bg-accent/70 text-accent-foreground' : 'hover:bg-accent/50'
            )}
          >
            <button
              type="button"
              onClick={handleClick}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              {expanded ? (
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
              )}
              <Database className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
              <span className="truncate">{database.name}</span>
            </button>

            {expanded && (
              <RefreshCw
                className="size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                onClick={handleRefresh}
              />
            )}
            {expanded && (
              <span title="创建表">
                <Plus
                  className="size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                  onClick={handleCreateTable}
                />
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                  title="更多操作"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={handleErAnalysis} className="gap-2">
                  <GitFork className="size-3.5" />
                  ER 分析
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {expanded && (
            <div>
              {databaseLevelModules.map((moduleKind) => (
                <ModuleGroup
                  key={moduleKind}
                  connectionId={connectionId}
                  connectionName={connectionName}
                  database={database.name}
                  moduleKind={moduleKind}
                />
              ))}

              {node?.schemasLoading && (
                <div className="flex items-center gap-1.5 px-2 py-1 pl-8 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  加载中…
                </div>
              )}
              {!node?.schemasLoading && node?.schemasError && (
                <div className="flex items-center gap-1.5 px-2 py-1 pl-8 text-xs text-destructive">
                  <span className="truncate">{node.schemasError}</span>
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
              {!node?.schemasLoading && !node?.schemasError && node?.schemas?.length === 0 && (
                <div className="px-2 py-1 pl-8 text-xs text-muted-foreground">暂无 Schema</div>
              )}
              {!node?.schemasLoading &&
                !node?.schemasError &&
                node?.schemas?.map((schema) => (
                  <SchemaNode
                    key={schema.name}
                    connectionId={connectionId}
                    connectionName={connectionName}
                    connectionType={connectionType}
                    database={database.name}
                    schema={schema}
                  />
                ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      {inCodeMode && (
        <ContextMenuContent>
          <AddToConversationMenuItem
            id={`database:${connectionId}:${database.name}`}
            type="database"
            label={database.name}
            detail={connectionName}
          />
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}
