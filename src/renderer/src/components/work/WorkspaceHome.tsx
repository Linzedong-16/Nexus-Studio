import { Group, Panel, Separator } from 'react-resizable-panels'
import { cn } from '@/lib/utils'
import SchemaTree from '@/components/schema/SchemaTree'
import WorkspaceTabs from './WorkspaceTabs'
import WorkspacePanel from './WorkspacePanel'

/**
 * Work 模式核心视图
 *
 * 左侧 Schema 树 + 右侧标签页工作区，可拖拽调整宽度。
 */
export default function WorkspaceHome(): React.JSX.Element {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel id="schema-tree" defaultSize="22" minSize="12" maxSize="40" collapsible>
          <SchemaTree />
        </Panel>
        <Separator
          className={cn(
            'w-1 shrink-0 bg-border hover:bg-primary/50 data-separator-active:bg-primary'
          )}
        />
        <Panel id="workspace-area">
          <div className="flex h-full min-w-0 flex-col">
            <WorkspaceTabs />
            <div className="min-h-0 flex-1">
              <WorkspacePanel />
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  )
}
