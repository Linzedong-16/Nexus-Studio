import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/shellStore'
import { useUserStore } from '@/store/userStore'
import { useAvatarSrc } from '@/hooks/useAvatarSrc'
import UserProfileDialog from './UserProfileDialog'

interface UserPanelProps {
  collapsed?: boolean
}

/**
 * 侧边栏底部用户信息区（FR-014）
 *
 * 点击头像打开用户信息编辑面板，齿轮按钮打开设置面板。
 */
export default function UserPanel({ collapsed = false }: UserPanelProps): React.JSX.Element {
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen)
  const userStore = useUserStore()
  const [profileOpen, setProfileOpen] = useState(false)
  const avatarSrc = useAvatarSrc()

  const avatar = (
    <Avatar className="size-7">
      {avatarSrc && <AvatarImage src={avatarSrc} alt={userStore.displayName} />}
      <AvatarFallback className="bg-primary/10 text-xs text-primary">
        {userStore.displayName[0]}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <>
      <div
        className={cn(
          'border-t border-sidebar-border transition-[padding] duration-150 ease-out',
          collapsed ? 'px-1.5 pb-10 pt-3' : 'px-3 py-3'
        )}
      >
        {collapsed ? (
          <div className="relative flex h-7 items-center justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => setProfileOpen(true)}>
                  {avatar}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{userStore.displayName}</TooltipContent>
            </Tooltip>
            <button
              type="button"
              title="设置"
              onClick={() => setSettingsOpen(true)}
              className="absolute left-1/2 top-[calc(100%+8px)] flex size-6 -translate-x-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Settings className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex h-7 items-center gap-1">
            <button type="button" className="shrink-0" onClick={() => setProfileOpen(true)}>
              {avatar}
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:text-foreground/80"
            >
              {userStore.displayName}
            </button>
            <button
              type="button"
              title="设置"
              onClick={() => setSettingsOpen(true)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Settings className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <UserProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        currentAvatarSrc={avatarSrc}
      />
    </>
  )
}
