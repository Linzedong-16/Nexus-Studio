import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pin, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceTab } from '@/types/workspace'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'

interface WorkspaceTabProps {
  tab: WorkspaceTab
  active: boolean
  onActivate: () => void
  onClose: () => void
  /** 切换固定状态回调 */
  onTogglePin: () => void
}

/**
 * 单个可拖拽标签页
 *
 * 使用 @dnd-kit/useSortable 实现拖拽排序。
 * 支持右键菜单固定/取消固定。
 */
export default function WorkspaceTab({
  tab,
  active,
  onActivate,
  onClose,
  onTogglePin
}: WorkspaceTabProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    disabled: !tab.closable
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          className={cn(
            'group relative flex h-9 flex-shrink-0 cursor-pointer select-none items-center',
            'border-r border-border/50 px-3 text-[13px] transition-colors',
            active
              ? 'bg-background text-foreground'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted/80'
          )}
          onClick={(e) => {
            // 点击关闭按钮时不切换
            if ((e.target as HTMLElement).closest('[data-tab-close]')) return
            onActivate()
          }}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              if (tab.closable) onClose()
            }
          }}
        >
          {/* 激活态顶部指示条 */}
          {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}

          {/* 固定图标 */}
          {tab.pinned && <Pin className="mr-1 size-3 shrink-0 text-muted-foreground" />}

          <span className={cn('mr-2 truncate max-w-[140px]', active && 'font-medium')}>
            {tab.title}
          </span>

          {tab.closable && (
            <button
              type="button"
              data-tab-close
              className={cn(
                'flex size-4 items-center justify-center rounded-sm opacity-0 transition-opacity',
                'hover:bg-accent hover:text-foreground',
                active ? 'opacity-100' : 'group-hover:opacity-100'
              )}
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              title="关闭"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onTogglePin}>
          <Pin className="size-3.5" />
          {tab.pinned ? '取消固定' : '固定'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
