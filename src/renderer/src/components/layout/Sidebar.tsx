import ModeSwitcher from './ModeSwitcher'
import SidebarNav from './SidebarNav'
import UserPanel from './UserPanel'
import { useShellStore } from '@/store/shellStore'
import { cn } from '@/lib/utils'

/**
 * 侧边栏容器（FR-011/013/015）
 * 展开 220px ⇄ 折叠 56px 图标窄栏，宽度过渡 150ms
 * 使用 will-change: width 提升为独立合成层，配合已移除的 ResizeObserver 级联链路，不再触发表格式重渲染
 * US3：底部集成 UserPanel（滚动区之外）
 */
export default function Sidebar(): React.JSX.Element {
  const collapsed = useShellStore((s) => s.sidebarCollapsed)

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col bg-sidebar transition-[width] duration-150 ease-out will-change-[width]',
        collapsed ? 'w-14' : 'w-55'
      )}
    >
      <div className={cn('pb-1 pt-2', collapsed ? 'px-1.5' : 'px-3')}>
        <ModeSwitcher collapsed={collapsed} />
      </div>
      <div className="min-h-0 flex-1 flex flex-col">
        <SidebarNav collapsed={collapsed} />
      </div>
      <UserPanel collapsed={collapsed} />
    </aside>
  )
}
