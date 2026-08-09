import { Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import ConnectionForm from './ConnectionForm'
import DataBrowser from './DataBrowser'
import QueryPanel from './QueryPanel'

/**
 * 工作区面板
 *
 * 根据当前激活的标签页类型渲染对应内容。
 */
export default function WorkspacePanel(): React.JSX.Element {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const tabs = useWorkspaceStore((s) => s.tabs)

  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        未选择标签页
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden bg-background">
      {activeTab.type === 'welcome' && <WelcomeView />}
      {activeTab.type === 'connection' && <ConnectionForm tab={activeTab} />}
      {activeTab.type === 'query' && <QueryPanel tab={activeTab} />}
      {activeTab.type === 'table' && <DataBrowser tab={activeTab} />}
      {/* 新增标签页类型时在此补充渲染分支；TypeScript 的 WorkspaceTabType 联合类型
          会确保所有分支都被覆盖，遗漏时将触发 typecheck 错误 */}
    </div>
  )
}

function WelcomeView(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <Sparkles className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Work 工作区</h2>
        <p className="text-sm text-muted-foreground">
          选择左侧菜单或点击“新建连接”开始管理数据库连接
        </p>
      </div>
    </div>
  )
}
