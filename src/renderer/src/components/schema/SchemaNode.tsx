import { ChevronDown, ChevronRight, FolderTree, RefreshCw } from 'lucide-react'
import { DATABASE_CAPABILITIES } from '@/config/databaseCapabilities'
import type { DatabaseType, SchemaInfo } from '@/types/ipc'
import { useConnectionStore } from '@/store/connectionStore'
import ModuleGroup from './ModuleGroup'

interface SchemaNodeProps {
  connectionId: string
  connectionName: string
  connectionType: DatabaseType
  database: string
  schema: SchemaInfo
}

/**
 * Schema 节点
 *
 * 展开时按 `databaseCapabilities.ts` 中该数据库类型的 `schemaLevelModules`
 * 渲染模块分组（通用 Tables/Views 与 PostgreSQL 专属 Query/Functions/Procedures 一并列出）。
 */
export default function SchemaNode({
  connectionId,
  connectionName,
  connectionType,
  database,
  schema
}: SchemaNodeProps): React.JSX.Element {
  const node = useConnectionStore(
    (s) => s.connections[connectionId]?.databaseNodes?.[database]?.schemaNodes?.[schema.name]
  )
  const toggleSchemaNode = useConnectionStore((s) => s.toggleSchemaNode)
  const loadModuleItems = useConnectionStore((s) => s.loadModuleItems)

  const expanded = node?.expanded ?? false
  const modules = DATABASE_CAPABILITIES[connectionType].schemaLevelModules

  const handleRefresh = (e: React.MouseEvent): void => {
    e.stopPropagation()
    // Schema 节点自身无独立缓存数据，刷新即重新拉取其下已加载过的模块（FR-005）
    for (const moduleKind of modules) {
      if (moduleKind === 'query') continue
      if (node?.modules?.[moduleKind]?.items) {
        void loadModuleItems(connectionId, database, schema.name, moduleKind, {
          force: true
        }).catch(() => {
          // 单个模块刷新失败不影响其他模块，错误由各模块自身 error 状态展示
        })
      }
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleSchemaNode(connectionId, database, schema.name)}
        className="group flex w-full items-center gap-1 px-2 py-0.5 pl-4 text-left text-[13px] hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <FolderTree className="size-3.5 shrink-0 text-amber-500" />
        <span className="truncate">{schema.name}</span>
        {expanded && (
          <RefreshCw
            className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            onClick={handleRefresh}
          />
        )}
      </button>

      {expanded && (
        <div>
          {modules.map((moduleKind) => (
            <ModuleGroup
              key={moduleKind}
              connectionId={connectionId}
              connectionName={connectionName}
              database={database}
              schema={schema.name}
              moduleKind={moduleKind}
            />
          ))}
        </div>
      )}
    </div>
  )
}
