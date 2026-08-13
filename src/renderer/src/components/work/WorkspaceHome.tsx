import ExplorerLayout from '@/components/layout/ExplorerLayout'
import WorkspaceTabs from './WorkspaceTabs'
import WorkspacePanel from './WorkspacePanel'

/**
 * Work 模式核心视图
 *
 * 左侧 ExplorerLayout（连接树/文件管理）+ 右侧标签页工作区，可拖拽调整宽度。
 */
export default function WorkspaceHome(): React.JSX.Element {
  return (
    <ExplorerLayout>
      <WorkspaceTabs />
      <div className="min-h-0 flex-1">
        <WorkspacePanel />
      </div>
    </ExplorerLayout>
  )
}
