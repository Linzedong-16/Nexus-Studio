import { Database, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SchemaTree from '@/components/schema/SchemaTree'
import FileExplorer from '@/components/file/FileExplorer'
import { useShellStore } from '@/store/shellStore'
import { useFileExplorerStore } from '@/store/fileExplorerStore'
import { cn } from '@/lib/utils'

/**
 * 结构树 / 文件资源管理器 切换面板
 *
 * 顶部两个图标按钮在「数据库连接」结构树与「项目文件资源管理器」间切换，二者共用同一侧边面板空间。
 */
export default function ExplorerPanel(): React.JSX.Element {
  const view = useShellStore((s) => s.explorerPanelView)
  const setView = useShellStore((s) => s.setExplorerPanelView)
  const activeProjectPath = useFileExplorerStore((s) => s.activeProjectPath)
  const openFolder = useFileExplorerStore((s) => s.openFolder)
  const isFiles = view === 'files'

  const btnBase =
    'flex items-center justify-center size-7 rounded-md transition-colors hover:bg-accent'

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-center gap-1 border-b px-1">
        <button
          type="button"
          className={cn(
            btnBase,
            !isFiles ? 'text-foreground bg-accent/50' : 'text-muted-foreground'
          )}
          onClick={() => setView('connections')}
          aria-label="数据库连接结构树"
        >
          <Database className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            btnBase,
            isFiles ? 'text-foreground bg-accent/50' : 'text-muted-foreground'
          )}
          onClick={() => setView('files')}
          aria-label="文件资源管理器"
        >
          <FolderOpen className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {isFiles ? (
          activeProjectPath === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
              <p>尚未打开任何项目文件夹</p>
              <Button size="sm" variant="outline" onClick={() => void openFolder()}>
                <FolderOpen className="size-3.5" />
                打开文件夹
              </Button>
            </div>
          ) : (
            <FileExplorer />
          )
        ) : (
          <SchemaTree />
        )}
      </div>
    </div>
  )
}
