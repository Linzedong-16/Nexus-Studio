import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ShellUIState } from '@/types/shell'

/**
 * 外壳全局 UI 状态（research.md R-002）
 * - 仅 sidebarCollapsed / lastMode 持久化到 localStorage（partialize）
 * - 当前模式不入 Store —— 以路由 URL 为唯一事实源，lastMode 仅用于启动重定向
 */
export const useShellStore = create<ShellUIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      lastMode: 'work',
      searchOpen: false,
      settingsOpen: false,
      schemaTreeCollapsed: false,
      windowMaximized: false,
      toggleSidebar: (): void => {
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
      },
      setSearchOpen: (open): void => {
        set({ searchOpen: open })
      },
      setSettingsOpen: (open): void => {
        set({ settingsOpen: open })
      },
      toggleSchemaTree: (): void => {
        set((s) => ({ schemaTreeCollapsed: !s.schemaTreeCollapsed }))
      },
      setSchemaTreeCollapsed: (collapsed): void => {
        set({ schemaTreeCollapsed: collapsed })
      },
      setLastMode: (mode): void => {
        set({ lastMode: mode })
      },
      setWindowMaximized: (maximized): void => {
        set({ windowMaximized: maximized })
      }
    }),
    {
      name: 'shell-store',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, lastMode: s.lastMode })
    }
  )
)
