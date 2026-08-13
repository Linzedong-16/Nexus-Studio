import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/shellStore'
import { useUserStore } from '@/store/userStore'
import UserProfileDialog from './UserProfileDialog'

interface UserPanelProps {
  collapsed?: boolean
}

/**
 * 侧边栏底部用户信息区（FR-014）
 *
 * 点击头像打开用户信息编辑面板，齿轮按钮打开设置面板。
 * 启动时根据 avatarType 加载头像：
 * - 'local' → 通过 IPC 从 userData/avatar/avatar.png 读取 base64
 * - 'remote' → 直接使用 avatarUrl
 */
export default function UserPanel({ collapsed = false }: UserPanelProps): React.JSX.Element {
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen)
  const userStore = useUserStore()
  const [profileOpen, setProfileOpen] = useState(false)
  const [localAvatarSrc, setLocalAvatarSrc] = useState<string | null>(null)

  // 启动时加载本地头像文件，avatarVersion 变化时重新加载
  useEffect(() => {
    if (userStore.avatarType === 'local') {
      window.api.avatar.load().then((dataUrl) => {
        if (dataUrl) setLocalAvatarSrc(dataUrl)
      })
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步外部 Store 状态变化
      setLocalAvatarSrc(null)
    }
  }, [userStore.avatarType, userStore.avatarVersion])

  // 头像显示源：远程 URL > 本地 base64 > null
  const avatarSrc =
    userStore.avatarType === 'remote' && userStore.avatarUrl ? userStore.avatarUrl : localAvatarSrc

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
