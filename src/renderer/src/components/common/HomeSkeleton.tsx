import type { LucideIcon } from 'lucide-react'
import { ArrowUp, AtSign, ChevronDown, Folder, Mic, Monitor, Paperclip, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface QuickAction {
  icon: LucideIcon
  label: string
}

interface HomeSkeletonProps {
  /** 大标题前置图标（如 Code 模式的 </>） */
  titleIcon?: LucideIcon
  title: string
  inputPlaceholder: string
  quickActions: QuickAction[]
}

const toolBtnClass =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

/**
 * 模式首页占位骨架（FR-019/021）—— 参考 TRAE Code 首页
 * 大标题 + 居中输入框卡片（工具栏/模型选择/主操作按钮）+ 环境项目选择行 + 快捷操作组
 * 全部元素纯展示，仅 hover/焦点视觉反馈
 */
export default function HomeSkeleton({
  titleIcon: TitleIcon,
  title,
  inputPlaceholder,
  quickActions
}: HomeSkeletonProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      <h1 className="flex items-center gap-2.5 text-[32px] font-semibold tracking-tight">
        {TitleIcon && <TitleIcon className="size-8" />}
        {title}
      </h1>

      <div className="w-full max-w-2xl">
        {/* 输入框卡片 */}
        <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:shadow-md">
          <textarea
            rows={3}
            placeholder={inputPlaceholder}
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

      {/* 快捷操作按钮组 */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[13px]',
              'text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground'
            )}
          >
            <action.icon className="size-3.5" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
