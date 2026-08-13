import { useEffect, useState } from 'react'
import { ChevronDown, Folder, FolderOpen } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useFileExplorerStore } from '@/store/fileExplorerStore'

/**
 * 顶部项目选择器（FR-001~008）
 *
 * 展示当前激活项目名称（未激活时为占位文案），下拉菜单提供
 * 「打开文件夹」入口与「最近」项目列表——跨重启持久化，点击「最近」条目
 * 直接切换项目而不再弹出系统选择器。
 */
export default function ProjectPicker(): React.JSX.Element {
  const activeProjectName = useFileExplorerStore((s) => s.activeProjectName)
  const recentProjects = useFileExplorerStore((s) => s.recentProjects)
  const loadRecentProjects = useFileExplorerStore((s) => s.loadRecentProjects)
  const openFolder = useFileExplorerStore((s) => s.openFolder)
  const openRecentProject = useFileExplorerStore((s) => s.openRecentProject)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadRecentProjects()
  }, [loadRecentProjects])

  const handleOpenRecent = async (path: string): Promise<void> => {
    try {
      setError(null)
      await openRecentProject(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开项目失败')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors [-webkit-app-region:no-drag] hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground">
        <FolderOpen className="size-3.5" />
        <span className="max-w-40 truncate">{activeProjectName ?? '选择项目'}</span>
        <ChevronDown className="size-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => void openFolder()}>
          <Folder className="size-3.5" />
          打开文件夹…
        </DropdownMenuItem>
        {error && <div className="px-2 py-1 text-xs text-destructive">{error}</div>}
        {recentProjects.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>最近</DropdownMenuLabel>
            {recentProjects.map((project) => (
              <DropdownMenuItem
                key={project.path}
                onClick={() => void handleOpenRecent(project.path)}
              >
                <Folder className="size-3.5" />
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
