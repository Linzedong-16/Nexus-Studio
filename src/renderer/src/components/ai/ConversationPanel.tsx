import { useState } from 'react'
import {
  MessageSquarePlus,
  MessageSquare,
  Archive,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderArchive
} from 'lucide-react'
import { useLocation } from 'react-router'
import { useConversationStore } from '@/store/conversationStore'
import { resolveModeByPath } from '@/config/modes'
import { useShellStore } from '@/store/shellStore'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Conversation } from '@/types/conversation'

/**
 * 格式化相对时间（如"3 分钟前"、"2 小时前"）
 */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

/**
 * Code 模式左侧"对话历史"面板
 *
 * 替换原有"任务列表-示例项目"占位区域。
 * 支持：对话选择、新建、右键归档/删除、空状态引导。
 */
export default function ConversationPanel(): React.JSX.Element | null {
  const location = useLocation()
  const collapsed = useShellStore((s) => s.sidebarCollapsed)
  const mode = resolveModeByPath(location.pathname)

  // 所有 hooks 必须在条件判断之前调用（React Hooks 规则）
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const selectConversation = useConversationStore((s) => s.selectConversation)
  const createConversation = useConversationStore((s) => s.createConversation)
  const deleteConversation = useConversationStore((s) => s.deleteConversation)
  const archiveConversation = useConversationStore((s) => s.archiveConversation)

  const [archivedOpen, setArchivedOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null)

  // 仅在 Code 模式下渲染；折叠态不渲染面板内容
  if (mode.id !== 'code') return null
  if (collapsed) return null

  const activeList = conversations.filter((c) => c.status === 'active')
  const archivedList = conversations.filter((c) => c.status === 'archived')

  const handleSelect = (id: string): void => {
    void selectConversation(id)
  }

  const handleNew = (): void => {
    void createConversation()
  }

  const handleArchive = (id: string): void => {
    void archiveConversation(id)
  }

  const handleDeleteConfirm = (): void => {
    if (deleteTarget) {
      void deleteConversation(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col border-t border-sidebar-border px-2 pt-1">
      {/* 标题行 + 新建按钮 */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs text-muted-foreground">对话历史</span>
        <button
          type="button"
          title="新建对话"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          onClick={handleNew}
        >
          <MessageSquarePlus className="size-3.5" />
        </button>
      </div>

      {/* 空状态 */}
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
          <MessageSquare className="size-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">暂无对话记录，开始一段新的对话吧</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleNew}>
            <MessageSquarePlus className="mr-1 size-3" />
            新建对话
          </Button>
        </div>
      ) : (
        <div className="min-h-0 overflow-y-auto">
          {/* 活跃对话列表 */}
          <ul className="space-y-0.5">
            {activeList.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
                onArchive={handleArchive}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>

          {/* 已归档分组 */}
          {archivedList.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                className="flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60"
                onClick={() => setArchivedOpen(!archivedOpen)}
              >
                {archivedOpen ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                <FolderArchive className="size-3" />
                <span>已归档</span>
                <span className="ml-auto text-[10px]">{archivedList.length}</span>
              </button>
              {archivedOpen && (
                <ul className="mt-0.5 space-y-0.5">
                  {archivedList.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === activeConversationId}
                      onSelect={handleSelect}
                      onArchive={handleArchive}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除对话</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget?.title}」吗？此操作不可撤销，对话中的全部消息将被永久移除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 单条对话项 */
function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onArchive,
  onDelete
}: {
  conversation: Conversation
  isActive: boolean
  onSelect: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (conv: Conversation) => void
}): React.JSX.Element {
  const isArchived = conversation.status === 'archived'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
              isActive
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
            )}
            onClick={() => onSelect(conversation.id)}
            title={conversation.title}
          >
            <MessageSquare
              className={cn(
                'size-3.5 shrink-0',
                isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate">{conversation.title}</div>
              <div className="text-[10px] text-muted-foreground">
                {relativeTime(conversation.updatedAt)}
                {conversation.messageCount > 0 && ` · ${conversation.messageCount} 条`}
              </div>
            </div>
          </button>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-36">
        <ContextMenuItem onClick={() => onArchive(conversation.id)}>
          <Archive className="mr-2 size-3.5" />
          {isArchived ? '取消归档' : '归档'}
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(conversation)}
        >
          <Trash2 className="mr-2 size-3.5" />
          删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
