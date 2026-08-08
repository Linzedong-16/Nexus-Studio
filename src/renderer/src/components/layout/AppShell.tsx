import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import SearchPalette from './SearchPalette'
import { resolveModeByPath } from '@/config/modes'
import { useShellStore } from '@/store/shellStore'

/**
 * 外壳布局容器（FR-001）：TitleBar 置顶，下方 Sidebar + 内容视图
 * 纯布局组件，不含业务逻辑（宪法 III / FR-022）
 * 副作用：路由变化时将当前模式同步到 lastMode（供启动重定向，FR-008）
 */
export default function AppShell(): React.JSX.Element {
  const location = useLocation()
  const setLastMode = useShellStore((s) => s.setLastMode)

  useEffect(() => {
    setLastMode(resolveModeByPath(location.pathname).id)
  }, [location.pathname, setLastMode])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
      <SearchPalette />
    </div>
  )
}
