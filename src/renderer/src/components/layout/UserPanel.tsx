import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 占位用户数据（data-model.md §3）—— 后续接入真实账号体系时迁移 */
const PLACEHOLDER_USER = {
  displayName: 'LLinzex',
  avatarUrl: null as string | null,
  plan: 'free' as 'free' | 'pro' | 'team',
  mobileEntryLabel: '移动端'
}

const PLAN_LABELS = { free: '免费', pro: 'Pro', team: '团队' } as const

interface UserPanelProps {
  /** 折叠态：仅显示头像（tooltip 承载用户名） */
  collapsed?: boolean
}

/**
 * 侧边栏底部用户信息区（FR-014）
 * avatarUrl 为 null 时显示首字符 fallback（spec Edge Case）
 */
export default function UserPanel({ collapsed = false }: UserPanelProps): React.JSX.Element {
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

  if (collapsed) {
    return (
      <div className="flex justify-center border-t border-sidebar-border px-1.5 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button">{avatar}</button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {PLACEHOLDER_USER.displayName} · {PLAN_LABELS[PLACEHOLDER_USER.plan]}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="space-y-2 border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-2">
        {avatar}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {PLACEHOLDER_USER.displayName}
        </span>
        <Badge variant="secondary" className="text-[11px]">
          {PLAN_LABELS[PLACEHOLDER_USER.plan]}
        </Badge>
      </div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
          'text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground'
        )}
      >
        <Smartphone className="size-4" />
        {PLACEHOLDER_USER.mobileEntryLabel}
      </button>
    </div>
  )
}
