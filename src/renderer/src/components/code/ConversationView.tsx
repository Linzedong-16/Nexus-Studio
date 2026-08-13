import {
  X,
  MessageSquare,
  AtSign,
  Mic,
  Paperclip,
  Wand2,
  ArrowUp,
  ChevronDown,
  Monitor,
  Folder,
  Database,
  Server,
  File,
  FolderTree,
  Table2,
  Package
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConversationStore } from '@/store/conversationStore'
import type { ReferenceType } from '@/types/conversation'

const toolBtnClass =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

/** 各引用类型的图标映射 */
const REFERENCE_ICON: Record<ReferenceType, typeof File> = {
  file: File,
  connection: Server,
  database: Database,
  schema: FolderTree,
  table: Table2,
  moduleGroup: Package
}

export default function ConversationView(): React.JSX.Element {
  const references = useConversationStore((s) => s.references)
  const removeReference = useConversationStore((s) => s.removeReference)

  return (
    <div className="flex h-full flex-col">
      {/* 主内容区：居中骨架 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        {references.length === 0 ? (
          <>
            <h1 className="flex items-center gap-2.5 text-[32px] font-semibold tracking-tight">
              <MessageSquare className="size-8" />
              Code with Nexus Studio
            </h1>
            <p className="text-sm text-muted-foreground">
              在左侧连接树或文件树中右键，选择&ldquo;添加到对话&rdquo;来引用上下文
            </p>
          </>
        ) : (
          <h1 className="flex items-center gap-2.5 text-[32px] font-semibold tracking-tight">
            <MessageSquare className="size-8" />
            Code with Nexus Studio
          </h1>
        )}

        <div className="w-full max-w-2xl">
          {/* 输入框卡片 */}
          <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:shadow-md">
            {/* 引用小图标：嵌入输入框内部 */}
            {references.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
                {references.map((ref) => {
                  const Icon = REFERENCE_ICON[ref.type]
                  return (
                    <div
                      key={ref.id}
                      className="flex items-center gap-1 rounded-md border bg-accent/40 px-1.5 py-0.5 text-[12px]"
                    >
                      <Icon className="size-3 shrink-0 text-muted-foreground" />
                      <span className="max-w-32 truncate text-foreground">{ref.label}</span>
                      <button
                        type="button"
                        onClick={() => removeReference(ref.id)}
                        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="移除引用"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <textarea
              rows={3}
              placeholder="帮你编写 SQL、优化查询、分析数据结构…"
              className="w-full resize-none rounded-t-xl bg-transparent px-4 pt-3.5 text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <div className="flex items-center gap-1">
                <button type="button" title="指令" className={toolBtnClass}>
                  <Wand2 className="size-4" />
                </button>
                <button type="button" title="引用" className={toolBtnClass}>
                  <AtSign className="size-4" />
                </button>
                <button type="button" title="附件" className={toolBtnClass}>
                  <Paperclip className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  选择模型
                  <ChevronDown className="size-3.5" />
                </button>
                <button type="button" title="语音输入" className={toolBtnClass}>
                  <Mic className="size-4" />
                </button>
                <Button size="icon" className="size-7 rounded-lg" title="发送">
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* 环境 / 项目选择行 */}
          <div className="mt-2 flex items-center gap-2 px-1">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Monitor className="size-3.5" />
              本地
              <ChevronDown className="size-3" />
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Folder className="size-3.5" />
              选择项目
              <ChevronDown className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
