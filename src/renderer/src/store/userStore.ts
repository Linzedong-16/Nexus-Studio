import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 用户基本信息 */
export interface UserProfile {
  /**
   * 头像来源类型
   * - 'none': 无头像
   * - 'local': 本地裁剪头像，存储于 userData/avatar/avatar.png
   * - 'remote': 远程链接头像，通过 avatarUrl 直接加载
   */
  avatarType: 'none' | 'local' | 'remote'
  /** 远程头像 URL（仅在 avatarType='remote' 时使用） */
  avatarUrl: string | null
  /** 昵称 */
  displayName: string
  /** 邮箱 */
  email: string
  /** 头像版本号（每次保存递增，用于触发 UserPanel 重新加载本地文件） */
  avatarVersion: number
}

export interface UserStore extends UserProfile {
  updateProfile: (patch: Partial<UserProfile>) => void
}

/**
 * 用户信息 Store
 *
 * 头像持久化策略：
 * - 本地裁剪：头像文件写入 userData/avatar/avatar.png（始终只有一张），
 *   store 中仅记录 avatarType='local'，启动时通过 IPC 从文件加载 base64。
 * - 远程链接：store 中记录 avatarUrl，直接使用 URL 渲染。
 * - 切换为远程链接时，自动删除旧的本地头像文件。
 */
export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      avatarType: 'none',
      avatarUrl: null,
      displayName: 'LLinzex',
      email: '',
      avatarVersion: 0,
      updateProfile: (patch): void => {
        set(patch)
      }
    }),
    {
      name: 'nexus-studio-user-profile'
    }
  )
)
