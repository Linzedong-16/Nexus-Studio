import { create } from 'zustand'
import type { DbLogEntry } from '@/types/ipc'

const MAX_ENTRIES = 1000

/** 面板默认高度（px），拖拽收纳后重新打开也会恢复到该高度 */
export const DEFAULT_LOG_PANEL_HEIGHT = 288
/** 拖拽调整时的最小高度（px），松手时低于此值会回弹到该值（除非触发收纳） */
export const MIN_LOG_PANEL_HEIGHT = 120

interface LogState {
  open: boolean
  entries: DbLogEntry[]
  height: number
  toggle: () => void
  setOpen: (open: boolean) => void
  setBacklog: (entries: DbLogEntry[]) => void
  append: (entry: DbLogEntry) => void
  clear: () => void
  setHeight: (height: number) => void
}

/**
 * 数据库日志面板状态（Ctrl+J 底部滑出）
 *
 * entries 不持久化：面板关闭期间仍通过 onDbLog 持续追加，避免错过日志；
 * 客户端侧按 MAX_ENTRIES 环形裁剪，主进程侧另有独立上限（backlog）。
 */
export const useLogStore = create<LogState>()((set) => ({
  open: false,
  entries: [],
  height: DEFAULT_LOG_PANEL_HEIGHT,
  toggle: (): void => {
    set((s) => ({ open: !s.open }))
  },
  setOpen: (open): void => {
    set({ open })
  },
  setBacklog: (entries): void => {
    set({ entries: entries.slice(-MAX_ENTRIES) })
  },
  append: (entry): void => {
    set((s) => ({ entries: [...s.entries, entry].slice(-MAX_ENTRIES) }))
  },
  clear: (): void => {
    set({ entries: [] })
  },
  setHeight: (height): void => {
    set({ height })
  }
}))
