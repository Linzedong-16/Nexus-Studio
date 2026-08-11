/**
 * ER 分析悬浮选择面板
 *
 * 侧边栏「ER 分析」入口的确认流程：筛选/选择已连接的连接 →
 * 加载该连接下的业务数据库列表 → 选中数据库后打开 ER 分析标签页。
 */
import { useMemo, useState } from 'react'
import { Database, Loader2, RefreshCw, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useConnectionStore } from '@/store/connectionStore'
import { useErStore } from '@/store/erStore'
import { useWorkspaceStore } from '@/store/workspaceStore'

export default function ERPickerPanel(): React.JSX.Element {
  const pickerOpen = useErStore((s) => s.pickerOpen)
  const setPickerOpen = useErStore((s) => s.setPickerOpen)
  const connections = useConnectionStore((s) => s.connections)
  const loadDatabases = useConnectionStore((s) => s.loadDatabases)

  const [filterText, setFilterText] = useState('')
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [prevPickerOpen, setPrevPickerOpen] = useState(pickerOpen)

  // 面板由打开切换为关闭时重置筛选与选中状态，渲染期间调整状态，避免额外一次级联重渲染
  if (pickerOpen !== prevPickerOpen) {
    setPrevPickerOpen(pickerOpen)
    if (!pickerOpen) {
      setFilterText('')
      setConnectionId(null)
    }
  }

  const connectedList = useMemo(
    () => Object.values(connections).filter((c) => c.status === 'connected'),
    [connections]
  )
  const filteredList = useMemo(() => {
    const keyword = filterText.trim().toLowerCase()
    if (!keyword) return connectedList
    return connectedList.filter((c) => c.config.name.toLowerCase().includes(keyword))
  }, [connectedList, filterText])

  // 已选连接被筛选条件排除后，视为未选中（派生值而非额外状态，避免多一次渲染）
  const visibleConnectionId = useMemo(
    () =>
      connectionId && filteredList.some((c) => c.config.id === connectionId) ? connectionId : null,
    [connectionId, filteredList]
  )
  const selectedConnection = visibleConnectionId ? connections[visibleConnectionId] : undefined

  const handleSelectConnection = (id: string): void => {
    setConnectionId(id)
    void loadDatabases(id)
  }

  const handleSelectDatabase = (database: string): void => {
    if (!selectedConnection) return
    useWorkspaceStore.getState().openErAnalysisTab({
      connectionId: selectedConnection.config.id,
      connectionName: selectedConnection.config.name,
      database
    })
    setPickerOpen(false)
  }

  return (
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <DialogContent className="top-[28%] gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ER 分析</DialogTitle>
          <DialogDescription>选择要分析的连接与业务数据库</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="按连接名称筛选…"
              className="pl-8"
            />
          </div>

          {filteredList.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">未找到匹配连接</p>
          ) : (
            <Select value={visibleConnectionId ?? undefined} onValueChange={handleSelectConnection}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择连接" />
              </SelectTrigger>
              <SelectContent>
                {filteredList.map((c) => (
                  <SelectItem key={c.config.id} value={c.config.id}>
                    {c.config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedConnection && (
          <div className="space-y-1.5 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">业务数据库</span>
              {!selectedConnection.databasesLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-xs"
                  onClick={() => void loadDatabases(selectedConnection.config.id, { force: true })}
                >
                  <RefreshCw className="size-3" />
                  刷新
                </Button>
              )}
            </div>

            {selectedConnection.databasesLoading && (
              <div className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                加载中…
              </div>
            )}
            {!selectedConnection.databasesLoading && selectedConnection.databasesError && (
              <p className="py-2 text-sm text-destructive">{selectedConnection.databasesError}</p>
            )}
            {!selectedConnection.databasesLoading &&
              !selectedConnection.databasesError &&
              selectedConnection.databases?.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">该连接下暂无业务数据库</p>
              )}
            {!selectedConnection.databasesLoading &&
              !selectedConnection.databasesError &&
              selectedConnection.databases &&
              selectedConnection.databases.length > 0 && (
                <div className="max-h-52 space-y-0.5 overflow-y-auto">
                  {selectedConnection.databases.map((db) => (
                    <button
                      key={db.name}
                      type="button"
                      onClick={() => handleSelectDatabase(db.name)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Database className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                      <span className="truncate">{db.name}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
