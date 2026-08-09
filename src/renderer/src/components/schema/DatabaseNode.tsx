import { ChevronDown, ChevronRight, Database, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DATABASE_CAPABILITIES } from '@/config/databaseCapabilities'
import type { DatabaseInfo, DatabaseType } from '@/types/ipc'
import { useConnectionStore } from '@/store/connectionStore'
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

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'group flex w-full items-center gap-1 px-2 py-0.5 text-left text-[13px]',
          isActive ? 'bg-accent/70 text-accent-foreground' : 'hover:bg-accent/50'
        )}
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <Database className="size-3.5 shrink-0 text-blue-500" />
        <span className="truncate">{database.name}</span>
        {expanded && (
          <RefreshCw
            className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            onClick={handleRefresh}
          />
        )}
      </button>

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
              <Button variant="ghost" size="sm" className="h-5 gap-1 px-1" onClick={handleRefresh}>
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
  )
}
