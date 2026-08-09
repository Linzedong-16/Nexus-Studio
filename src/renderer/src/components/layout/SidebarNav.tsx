import { NavLink, useLocation } from 'react-router'
import { resolveModeByPath } from '@/config/modes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MenuItem } from '@/types/shell'
import { cn } from '@/lib/utils'

interface SidebarNavProps {
  /** 折叠态：仅显示图标（tooltip 承载文案），分组标题收缩为分隔线 */
  collapsed?: boolean
}

const itemClass = (active: boolean, collapsed: boolean): string =>
  cn(
    'flex w-full items-center rounded-md text-[13px] transition-colors',
    collapsed ? 'size-9 justify-center' : 'gap-2 px-2 py-1.5',
    active
      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
      : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
  )

function NavItem({ item, collapsed }: { item: MenuItem; collapsed: boolean }): React.JSX.Element {
  const content = (
    <>
      <item.icon
        className={cn('shrink-0', collapsed ? 'size-4' : 'size-4 text-muted-foreground')}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </>
  )
  // path 非空 → 路由链接；为 null → 占位按钮，触发 onClick 回调
  const element = item.path ? (
    <NavLink to={item.path} className={({ isActive }) => itemClass(isActive, collapsed)}>
      {content}
    </NavLink>
  ) : (
    <button type="button" className={itemClass(false, collapsed)} onClick={item.onClick}>
      {content}
    </button>
  )

  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{element}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  ) : (
    element
  )
}

/**
 * 侧边栏菜单区（FR-013/015）：按当前模式的 menuGroups 渲染
 * 当前模式由路由 URL 推导；列表超高时本区域滚动
 */
export default function SidebarNav({ collapsed = false }: SidebarNavProps): React.JSX.Element {
  const mode = resolveModeByPath(useLocation().pathname)

  return (
    <nav
      className={cn(
        'min-h-0 flex-1 overflow-y-auto py-2',
        collapsed ? 'space-y-2 px-1.5' : 'space-y-3 px-2'
      )}
    >
      {mode.menuGroups.map((group, groupIndex) => (
        <section key={group.id}>
          {/* 分组标题行：折叠态以分隔线代替（首组不显示） */}
          {collapsed
            ? groupIndex > 0 && <div className="mx-1 my-2 border-t border-sidebar-border" />
            : group.title && (
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs text-muted-foreground">{group.title}</span>
                  {group.headerActions.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      {group.headerActions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          title={action.label}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                        >
                          <action.icon className="size-3.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
          <ul className={cn(collapsed ? 'flex flex-col items-center space-y-0.5' : 'space-y-0.5')}>
            {group.items.map((item) => (
              <li key={item.id}>
                <NavItem item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
