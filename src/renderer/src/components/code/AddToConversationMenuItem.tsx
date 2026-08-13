import { MessageSquarePlus } from 'lucide-react'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { useConversationStore } from '@/store/conversationStore'
import type { ConversationReference, ReferenceType } from '@/types/conversation'

interface AddToConversationMenuItemProps {
  /** 引用 id（唯一标识） */
  id: string
  /** 引用类型 */
  type: ReferenceType
  /** 显示名称 */
  label: string
  /** 附加描述 */
  detail?: string
}

/**
 * "添加到对话"右键菜单项（共享组件）
 *
 * 仅在 Code 模式下渲染，用于将文件/数据库对象以引用形式添加到对话中。
 */
export default function AddToConversationMenuItem({
  id,
  type,
  label,
  detail
}: AddToConversationMenuItemProps): React.JSX.Element {
  const addReference = useConversationStore((s) => s.addReference)

  const handleAdd = (): void => {
    const ref: ConversationReference = {
      id,
      type,
      label,
      detail,
      timestamp: Date.now()
    }
    addReference(ref)
  }

  return (
    <ContextMenuItem onClick={handleAdd} className="gap-2">
      <MessageSquarePlus className="size-3.5" />
      添加到对话
    </ContextMenuItem>
  )
}
