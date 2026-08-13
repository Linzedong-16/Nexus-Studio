import { useEffect, useRef } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { cn } from '@/lib/utils'
import ExplorerPanel from '@/components/work/ExplorerPanel'
import { useShellStore } from '@/store/shellStore'

interface ExplorerLayoutProps {
  children: React.ReactNode
}

/**
 * 共享布局：左侧 ExplorerPanel（连接树/文件管理）+ 右侧内容区，可拖拽调整宽度
 * Work 和 Code 模式共用此布局，避免重复实现面板逻辑
 */
export default function ExplorerLayout({ children }: ExplorerLayoutProps): React.JSX.Element {
  const panelRef = useRef<PanelImperativeHandle>(null)
  const schemaTreeWrapRef = useRef<HTMLDivElement>(null)
  const schemaTreeCollapsed = useShellStore((s) => s.schemaTreeCollapsed)
  const setSchemaTreeCollapsed = useShellStore((s) => s.setSchemaTreeCollapsed)
  const setSchemaTreeExtraWidth = useShellStore((s) => s.setSchemaTreeExtraWidth)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (schemaTreeCollapsed && !panel.isCollapsed()) {
      panel.collapse()
    } else if (!schemaTreeCollapsed && panel.isCollapsed()) {
      panel.expand()
    }
  }, [schemaTreeCollapsed])

  // Schema 树宽度（含 1px 边框分隔条）会随拖拽/折叠变化，实时测量供 LogPanel 等全局浮层避让
  useEffect(() => {
    const el = schemaTreeWrapRef.current
    if (!el) return

    const SEPARATOR_WIDTH = 4
    const measure = (): void => setSchemaTreeExtraWidth(el.offsetWidth + SEPARATOR_WIDTH)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
      setSchemaTreeExtraWidth(0)
    }
  }, [setSchemaTreeExtraWidth])

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel
          id="schema-tree"
          defaultSize="22"
          minSize="12"
          maxSize="40"
          collapsible
          panelRef={panelRef}
          onResize={() => {
            const collapsed = panelRef.current?.isCollapsed() ?? false
            if (collapsed !== schemaTreeCollapsed) {
              setSchemaTreeCollapsed(collapsed)
            }
          }}
        >
          <div ref={schemaTreeWrapRef} className="h-full">
            <ExplorerPanel />
          </div>
        </Panel>
        <Separator
          className={cn(
            'w-1 shrink-0 bg-border hover:bg-primary/50 data-separator-active:bg-primary'
          )}
        />
        <Panel id="workspace-area">
          <div className="flex h-full min-w-0 flex-col">{children}</div>
        </Panel>
      </Group>
    </div>
  )
}