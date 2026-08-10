import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  toggle: () => void
}

/**
 * 主题偏好状态（specs/003-theme-toggle-transition/data-model.md）
 * 独立于 shellStore 持久化，避免两者 localStorage key 耦合
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light',
      toggle: (): void => {
        set((s) => ({ mode: s.mode === 'light' ? 'dark' : 'light' }))
      }
    }),
    {
      name: 'theme-store'
    }
  )
)
