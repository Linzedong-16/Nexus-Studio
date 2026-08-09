import { useRef, useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import WorkspaceTab from './WorkspaceTab'

/**
 * 工作区标签栏
 *
 * 功能：
 * - 水平排列标签页
 * - 支持 @dnd-kit 拖拽排序
 * - 溢出检测：当标签页超出可视区域时显示下拉菜单
 * - 鼠标滚轮横向滚动
 */
export default function WorkspaceTabs(): React.JSX.Element {
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const activateTab = useWorkspaceStore((s) => s.activateTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)
  const reorderTabs = useWorkspaceStore((s) => s.reorderTabs)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [isOverflow, setIsOverflow] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    })
  )

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setIsOverflow(el.scrollWidth > el.clientWidth)
  }, [])

  // 挂载/卸载 ResizeObserver（仅一次，checkOverflow 引用稳定）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const resizeObserver = new ResizeObserver(checkOverflow)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [checkOverflow])

  // tabs 变化时重新检测溢出
  useEffect(() => {
    checkOverflow()
  }, [tabs.length, checkOverflow])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY === 0) return
    const el = scrollRef.current
    if (!el) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const fromIndex = tabs.findIndex((t) => t.id === active.id)
      const toIndex = tabs.findIndex((t) => t.id === over.id)
      reorderTabs(fromIndex, toIndex)
    },
    [tabs, reorderTabs]
  )

  return (
    <div className="flex h-9 flex-shrink-0 items-center bg-muted">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          <div
            ref={scrollRef}
            onWheel={handleWheel}
            className={cn(
              'flex min-w-0 flex-1 items-end overflow-x-auto',
              'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent'
            )}
          >
            {tabs.map((tab) => (
              <WorkspaceTab
                key={tab.id}
                tab={tab}
                active={tab.id === activeTabId}
                onActivate={() => activateTab(tab.id)}
                onClose={() => closeTab(tab.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {isOverflow && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-8 flex-shrink-0 items-center justify-center border-l border-border/50 bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              title="更多标签页"
            >
              <ChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            {tabs.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                className={cn(
                  'justify-between gap-4',
                  tab.id === activeTabId && 'bg-accent text-accent-foreground'
                )}
                onClick={() => activateTab(tab.id)}
              >
                <span className="truncate">{tab.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
