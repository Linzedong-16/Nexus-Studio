import { useEffect, useState } from 'react'
import { useUserStore } from '@/store/userStore'

/**
 * 计算当前用户头像的可用图片地址（供侧边栏用户面板、对话消息头像等处共用）
 * - 'remote'：直接使用 avatarUrl
 * - 'local'：通过 IPC 从 userData/avatar/avatar.png 读取 base64（avatarVersion 变化时重新加载）
 * - 'none' 或加载中：返回 null，调用方应回退到 AvatarFallback 展示首字母
 */
export function useAvatarSrc(): string | null {
  const avatarType = useUserStore((s) => s.avatarType)
  const avatarUrl = useUserStore((s) => s.avatarUrl)
  const avatarVersion = useUserStore((s) => s.avatarVersion)
  const [localAvatarSrc, setLocalAvatarSrc] = useState<string | null>(null)

  useEffect(() => {
    if (avatarType === 'local') {
      window.api.avatar.load().then((dataUrl) => {
        if (dataUrl) setLocalAvatarSrc(dataUrl)
      })
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步外部 Store 状态变化
      setLocalAvatarSrc(null)
    }
  }, [avatarType, avatarVersion])

  return avatarType === 'remote' && avatarUrl ? avatarUrl : localAvatarSrc
}
