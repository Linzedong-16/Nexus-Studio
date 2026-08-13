import { PanelLeft, Search } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import WindowControls from './WindowControls'
import ThemeToggleButton from './ThemeToggleButton'
import ProjectPicker from './ProjectPicker'
import { useShellStore } from '@/store/shellStore'

const noDrag = '[-webkit-app-region:no-drag]'
const iconBtnClass =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
const menuTriggerClass =
  'rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground'

/**
 * 顶部全局栏（FR-001/002/016/018）
 * 容器整栏可拖拽（-webkit-app-region: drag），全部交互元素标注 no-drag
 */
export default function TitleBar(): React.JSX.Element {
  const toggleSidebar = useShellStore((s) => s.toggleSidebar)
  const setSearchOpen = useShellStore((s) => s.setSearchOpen)
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen)
  const setAboutOpen = useShellStore((s) => s.setAboutOpen)

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background [-webkit-app-region:drag]">
      <div className="flex items-center gap-0.5 pl-2">
        <button
          type="button"
          title="折叠/展开侧边栏"
          onClick={toggleSidebar}
          className={`${iconBtnClass} ${noDrag}`}
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          type="button"
          title="全局搜索"
          onClick={() => setSearchOpen(true)}
          className={`${iconBtnClass} ${noDrag}`}
        >
          <Search className="size-4" />
        </button>
        <ThemeToggleButton className={`${iconBtnClass} ${noDrag}`} />
        <ProjectPicker />

        <DropdownMenu>
          <DropdownMenuTrigger className={`${menuTriggerClass} ${noDrag}`}>
            编辑(E)
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem>
              撤销<DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              重做<DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              剪切<DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              复制<DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              粘贴<DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={`${menuTriggerClass} ${noDrag}`}>
            帮助(H)
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>快捷键</DropdownMenuItem>
            <DropdownMenuItem>检查更新</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void window.api.windowControls.openDevTools()}>
              切换开发人员工具
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAboutOpen(true)}>
              关于 Nexus Studio
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <WindowControls />
    </header>
  )
}
