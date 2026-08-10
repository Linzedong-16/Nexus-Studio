import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/shellStore'

/** 占位用户数据（data-model.md §3）—— 后续接入真实账号体系时迁移 */
const PLACEHOLDER_USER = {
  displayName: 'LLinzex',
  avatarUrl: null as string | null,
  plan: 'free' as 'free' | 'pro' | 'team'
}

const PLAN_LABELS = { free: '免费', pro: 'Pro', team: '团队' } as const

interface UserPanelProps {
  /** 折叠态：头像 + tooltip，齿轮按钮挪到头像下方 */
  collapsed?: boolean
}

/**
 * 侧边栏底部用户信息区（FR-014）
 * avatarUrl 为 null 时显示首字符 fallback（spec Edge Case）
 *
 * 齿轮按钮的展开⇄折叠位移只改 transform（不改 top/left/width 等触发布局的属性），
 * 命中合成层、不重排；两态的目标偏移量基于侧边栏固定宽度（w-65/w-14，Sidebar.tsx）
 * 预先算好的常量，不需要像 ModeSwitcher 那样用 ref 测量。头像保持在正常文档流中，
 * 折叠时只是随容器 padding 收窄小幅漂移，无需特殊处理。
 */
export default function UserPanel({ collapsed = false }: UserPanelProps): React.JSX.Element {
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen)

  const avatar = (
    <Avatar className="size-7">
      {PLACEHOLDER_USER.avatarUrl && (
        <AvatarImage src={PLACEHOLDER_USER.avatarUrl} alt={PLACEHOLDER_USER.displayName} />
      )}
      <AvatarFallback className="bg-primary/10 text-xs text-primary">
        {PLACEHOLDER_USER.displayName[0]}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <div
      className={cn(
        'border-t border-sidebar-border transition-[padding] duration-150 ease-out',
        collapsed ? 'px-1.5 pb-10 pt-3' : 'px-3 py-3'
      )}
    >
      <div className={cn('relative flex h-7 items-center', collapsed && 'justify-center')}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">{avatar}</button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {PLACEHOLDER_USER.displayName} · {PLAN_LABELS[PLACEHOLDER_USER.plan]}
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            {avatar}
            <span className="min-w-0 flex-1 truncate pl-2 pr-7 text-[13px] font-medium">
              {PLACEHOLDER_USER.displayName}
            </span>
          </>
        )}
        <button
          type="button"
          title="设置"
          onClick={() => setSettingsOpen(true)}
          className={cn(
            'absolute left-1/2 top-1/2 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-transform duration-150 ease-out will-change-transform hover:bg-sidebar-accent hover:text-foreground',
            collapsed ? 'translate-x-[-50%] translate-y-[calc(-50%+32px)]' : 'translate-x-26.5 translate-y-[-50%]'
          )}
        >
          <Settings className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
