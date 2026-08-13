import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import SearchPalette from './SearchPalette'
import AboutDialog from './AboutDialog'
import LogPanel from './LogPanel'
import SettingsPanel from '@/components/settings/SettingsPanel'
import ERPickerPanel from '@/components/er/ERPickerPanel'
import { resolveModeByPath } from '@/config/modes'
import { useShellStore } from '@/store/shellStore'
import { useKeybindingStore } from '@/store/keybindingStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useLogStore } from '@/store/logStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { installGlobalKeybindingDispatcher } from '@/lib/keybinding/dispatcher'
import { queryService } from '@/services/queryService'

/**
 * 外壳布局容器（FR-001）：TitleBar 置顶，下方 Sidebar + 内容视图
 * 纯布局组件，不含业务逻辑（宪法 III / FR-022）
 * 副作用：路由变化时将当前模式同步到 lastMode（供启动重定向，FR-008）
 */
export default function AppShell(): React.JSX.Element {
  const location = useLocation()
  const setLastMode = useShellStore((s) => s.setLastMode)
  const setContentInsetLeft = useShellStore((s) => s.setContentInsetLeft)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setLastMode(resolveModeByPath(location.pathname).id)
  }, [location.pathname, setLastMode])

  useEffect(() => {
    void useKeybindingStore.getState().loadFromDisk()
    return installGlobalKeybindingDispatcher()
  }, [])

  useEffect(() => {
    void useConnectionStore.getState().hydrateSavedConnections()
  }, [])

  // 恢复文件标签页内容
  useEffect(() => {
    void useWorkspaceStore.getState().hydrateFileTabs()
  }, [])

  // 无论日志面板是否展开都持续拉取/订阅，避免关闭期间错过日志
  useEffect(() => {
    void queryService.getLogBacklog().then((entries) => useLogStore.getState().setBacklog(entries))
    return queryService.onDbLog((entry) => useLogStore.getState().append(entry))
  }, [])

  // main 的左边界随侧边栏折叠/窗口尺寸变化，供 LogPanel 等全局浮层避让侧边栏
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const measure = (): void => setContentInsetLeft(el.getBoundingClientRect().left)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [setContentInsetLeft])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
      <SearchPalette />
      <AboutDialog />
      <SettingsPanel />
      <ERPickerPanel />
      <LogPanel />
    </div>
  )
}
