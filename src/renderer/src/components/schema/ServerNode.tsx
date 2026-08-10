import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Server, Unplug } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DATABASE_CAPABILITIES } from '@/config/databaseCapabilities'
import { useConnectionStore } from '@/store/connectionStore'
import DatabaseNode from './DatabaseNode'
import SecurityNode from './SecurityNode'

interface ServerNodeProps {
  connectionId: string
}

const STATUS_LABEL: Record<string, string> = {
  connecting: '连接中',
  connected: '已连接',
  error: '连接失败'
}

/**
 * 服务器连接节点（结构树顶层）
 *
 * 展示服务器名称与连接状态；展开时按需调用 `loadDatabases()` 动态列出
 * 该账号在服务器上有权限访问的全部数据库（FR-008 按需加载）。
 */
export default function ServerNode({ connectionId }: ServerNodeProps): React.JSX.Element | null {
  const conn = useConnectionStore((s) => s.connections[connectionId])
  const loadDatabases = useConnectionStore((s) => s.loadDatabases)
  const disconnect = useConnectionStore((s) => s.disconnect)
  const activate = useConnectionStore((s) => s.activate)
  const [expanded, setExpanded] = useState(false)

  if (!conn) return null

  const handleToggle = (): void => {
    activate(connectionId)
    const next = !expanded
    setExpanded(next)
    if (next && !conn.databases) {
      void loadDatabases(connectionId)
    }
  }

  const handleRefresh = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void loadDatabases(connectionId, { force: true })
  }

  const handleDisconnect = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void disconnect(connectionId)
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className="group flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <Server className="size-3.5 shrink-0 text-blue-600" />
        <span className="truncate font-medium">{conn.config.name}</span>
        <Badge
          variant={conn.status === 'error' ? 'destructive' : 'secondary'}
          className="shrink-0 px-1.5 py-0 text-[10px]"
        >
          {STATUS_LABEL[conn.status]}
        </Badge>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 opacity-0 group-hover:opacity-100">
          <RefreshCw
            className="size-3 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
          />
          <span title="断开并删除该连接">
            <Unplug
              className="size-3 text-muted-foreground hover:text-destructive"
              onClick={handleDisconnect}
            />
          </span>
        </div>
      </button>

      {expanded && conn.status === 'connected' && (
        <div>
          {DATABASE_CAPABILITIES[conn.config.type].hasSecurityModule && (
            <SecurityNode connectionId={connectionId} connectionName={conn.config.name} />
          )}
          {conn.databasesLoading && (
            <div className="flex items-center gap-1.5 px-2 py-1 pl-6 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              加载中…
            </div>
          )}
          {!conn.databasesLoading && conn.databasesError && (
            <div className="flex items-center gap-1.5 px-2 py-1 pl-6 text-xs text-destructive">
              <span className="truncate">{conn.databasesError}</span>
              <Button variant="ghost" size="sm" className="h-5 gap-1 px-1" onClick={handleRefresh}>
                <RefreshCw className="size-3" />
                重试
              </Button>
            </div>
          )}
          {!conn.databasesLoading && !conn.databasesError && conn.databases?.length === 0 && (
            <div className="px-2 py-1 pl-6 text-xs text-muted-foreground">暂无可访问的数据库</div>
          )}
          {!conn.databasesLoading &&
            !conn.databasesError &&
            conn.databases?.map((database) => (
              <DatabaseNode
                key={database.name}
                connectionId={connectionId}
                connectionName={conn.config.name}
                connectionType={conn.config.type}
                database={database}
              />
            ))}
        </div>
      )}
    </div>
  )
}
