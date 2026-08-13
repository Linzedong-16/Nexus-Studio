import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  ListTree,
  Loader2,
  Plus,
  RefreshCw,
  Table2,
  View,
  Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { TableInfo, ColumnInfo, IndexInfo, TriggerInfo } from '@/types/ipc'
import type { TableModuleKind } from '@/types/database'
import { useConnectionStore } from '@/store/connectionStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { getSqlTemplate } from '@/lib/sqlTemplates'
import AddToConversationMenuItem from '@/components/code/AddToConversationMenuItem'
import { useInCodeMode } from '@/components/code/useInCodeMode'
import { cn } from '@/lib/utils'

interface TableNodeProps {
  connectionId: string
  connectionName: string
  database: string
  schema: string
  table: TableInfo
}

const TABLE_MODULE_LABEL: Record<TableModuleKind, string> = {
  columns: 'Columns',
  indexes: 'Indexes',
  triggers: 'Triggers'
}

const TABLE_MODULE_ICON: Record<TableModuleKind, typeof ListTree> = {
  columns: ListTree,
  indexes: ListTree,
  triggers: Zap
}

const TABLE_MODULE_EMPTY: Record<TableModuleKind, string> = {
  columns: '暂无字段',
  indexes: '没有找到索引',
  triggers: '没有找到触发器'
}

/**
 * 结构树表节点
 *
 * 单击过滤剪头展开/收起自身的子模块（Columns / Indexes / Triggers），
 * 双击（或单击表名）打开表数据浏览标签页。子模块按需加载，主键字段与普通字段区分标识。
 */
export default function TableNode({
  connectionId,
  connectionName,
  database,
  schema,
  table
}: TableNodeProps): React.JSX.Element {
  const node = useConnectionStore(
    (s) =>
      s.connections[connectionId]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.tableNodes?.[
        table.name
      ]
  )
  const toggleTableNode = useConnectionStore((s) => s.toggleTableNode)
  const loadTableModuleItems = useConnectionStore((s) => s.loadTableModuleItems)
  const openTableTab = useWorkspaceStore((s) => s.openTableTab)
  const inCodeMode = useInCodeMode()

  const expanded = node?.expanded ?? false

  const handleToggle = (): void => {
    toggleTableNode(connectionId, database, schema, table.name)
  }
  const handleOpenData = (): void => {
    if (inCodeMode) return
    openTableTab({ connectionId, connectionName, database, schema, table: table.name })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <div className="group flex w-full items-center gap-1 px-2 py-0.5 pl-10 text-left text-[13px] hover:bg-accent/50">
            <button
              type="button"
              onClick={handleToggle}
              className="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
              title={expanded ? '收起' : '展开'}
            >
              {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
            <button
              type="button"
              onClick={handleOpenData}
              title={`打开 ${schema}.${table.name} 数据`}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              {table.type === 'view' ? (
                <View className="size-3.5 shrink-0 text-green-500 dark:text-green-400" />
              ) : (
                <Table2 className="size-3.5 shrink-0 text-green-500 dark:text-green-400" />
              )}
              <span className="truncate">{table.name}</span>
            </button>
            {expanded && (
              <button
                type="button"
                className="shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                title="刷新"
                onClick={() => {
                  for (const kind of ['columns', 'indexes', 'triggers'] as const) {
                    if (node?.modules?.[kind]?.items) {
                      void loadTableModuleItems(connectionId, database, schema, table.name, kind, {
                        force: true
                      })
                    }
                  }
                }}
              >
                <RefreshCw className="size-3" />
              </button>
            )}
            {table.type === 'table' && expanded && (
              <button
                type="button"
                className="shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                title="添加行"
                onClick={(e) => {
                  e.stopPropagation()
                  if (inCodeMode) return
                  useWorkspaceStore.getState().openQueryTab({
                    connectionId,
                    connectionName,
                    database,
                    schema,
                    defaultSql: getSqlTemplate('insertRow', { schema, table: table.name })
                  })
                }}
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>

          {expanded && (
            <div>
              {(['columns', 'indexes', 'triggers'] as const).map((kind) => (
                <TableModule
                  key={kind}
                  connectionId={connectionId}
                  database={database}
                  schema={schema}
                  table={table.name}
                  moduleKind={kind}
                />
              ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      {inCodeMode && (
        <ContextMenuContent>
          <AddToConversationMenuItem
            id={`table:${connectionId}:${database}:${schema}:${table.name}`}
            type="table"
            label={table.name}
            detail={`${schema}.${table.name}`}
          />
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

function TableModule({
  connectionId,
  database,
  schema,
  table,
  moduleKind
}: {
  connectionId: string
  database: string
  schema: string
  table: string
  moduleKind: TableModuleKind
}): React.JSX.Element {
  const mod = useConnectionStore(
    (s) =>
      s.connections[connectionId]?.databaseNodes?.[database]?.schemaNodes?.[schema]?.tableNodes?.[
        table
      ]?.modules?.[moduleKind]
  )
  const toggleTableModule = useConnectionStore((s) => s.toggleTableModule)
  const loadTableModuleItems = useConnectionStore((s) => s.loadTableModuleItems)

  const expanded = mod?.expanded ?? false
  const items = mod?.items
  const loading = mod?.loading ?? false
  const error = mod?.error

  const Icon = TABLE_MODULE_ICON[moduleKind]
  const label = TABLE_MODULE_LABEL[moduleKind]

  const handleToggle = (): void =>
    toggleTableModule(connectionId, database, schema, table, moduleKind)
  const handleRefresh = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void loadTableModuleItems(connectionId, database, schema, table, moduleKind, { force: true })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className="group flex w-full items-center gap-1 px-2 py-0.5 pl-12 text-left text-[13px] hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <Icon className="size-3.5 shrink-0 text-sky-500 dark:text-sky-400" />
        <span className="truncate">{label}</span>
        {items && items.length > 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{items.length}</span>
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
            <div className="flex items-center gap-1.5 px-2 py-1 pl-16 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              加载中…
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-1.5 px-2 py-1 pl-16 text-xs text-destructive">
              <span className="truncate">{error}</span>
              <Button variant="ghost" size="sm" className="h-5 gap-1 px-1" onClick={handleRefresh}>
                <RefreshCw className="size-3" />
                重试
              </Button>
            </div>
          )}
          {!loading && !error && items && items.length === 0 && (
            <div className="px-2 py-1 pl-16 text-xs text-muted-foreground">
              {TABLE_MODULE_EMPTY[moduleKind]}
            </div>
          )}
          {!loading &&
            !error &&
            moduleKind === 'columns' &&
            (items as ColumnInfo[] | undefined)?.map((col) => (
              <ColumnRow key={col.name} column={col} />
            ))}
          {!loading &&
            !error &&
            moduleKind === 'indexes' &&
            (items as IndexInfo[] | undefined)?.map((idx) => (
              <IndexRow key={idx.name} index={idx} />
            ))}
          {!loading &&
            !error &&
            moduleKind === 'triggers' &&
            (items as TriggerInfo[] | undefined)?.map((trg) => (
              <TriggerRow key={trg.name} trigger={trg} />
            ))}
        </div>
      )}
    </div>
  )
}

/** 字段行：主键字段用 🔑 图标与强调色区分，普通字段用普通图标 */
function ColumnRow({ column }: { column: ColumnInfo }): React.JSX.Element {
  return (
    <div
      title={column.comment}
      className={cn(
        'flex w-full items-center gap-1.5 px-2 py-0.5 pl-16 text-left text-[13px]',
        column.isPrimaryKey ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
      )}
    >
      {column.isPrimaryKey ? (
        <KeyRound className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
      ) : (
        <ListTree className="size-3.5 shrink-0 text-muted-foreground/60" />
      )}
      <span className={cn('truncate', column.isPrimaryKey && 'font-medium')}>{column.name}</span>
      <span className="truncate text-xs text-muted-foreground/70">{column.dataType}</span>
      {column.isPrimaryKey && (
        <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
          PK
        </span>
      )}
    </div>
  )
}

function IndexRow({ index }: { index: IndexInfo }): React.JSX.Element {
  return (
    <div
      title={index.columns.join(', ')}
      className="flex w-full items-center gap-1.5 px-2 py-0.5 pl-16 text-left text-[13px] text-muted-foreground"
    >
      <ListTree className="size-3.5 shrink-0 text-sky-500 dark:text-sky-400" />
      <span className="truncate">{index.name}</span>
      <span className="truncate text-xs text-muted-foreground/70">
        {index.method} ({index.columns.join(', ')})
      </span>
      {index.unique && (
        <span className="shrink-0 rounded bg-sky-500/15 px-1 text-[10px] text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">
          UNIQUE
        </span>
      )}
      {index.isPrimary && (
        <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
          PK
        </span>
      )}
    </div>
  )
}

function TriggerRow({ trigger }: { trigger: TriggerInfo }): React.JSX.Element {
  return (
    <div
      title={trigger.definition}
      className="flex w-full items-center gap-1.5 px-2 py-0.5 pl-16 text-left text-[13px] text-muted-foreground"
    >
      <Zap className="size-3.5 shrink-0 text-orange-500 dark:text-orange-400" />
      <span className="truncate">{trigger.name}</span>
      {!trigger.enabled && (
        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
          DISABLED
        </span>
      )}
    </div>
  )
}
