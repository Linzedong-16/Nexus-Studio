/**
 * ER 分析画布运行态 Store
 *
 * 会话级状态（节点拖拽位置、布局中标志、悬浮面板显隐），不持久化。
 */
import { create } from 'zustand'

interface ErStoreState {
  pickerOpen: boolean
  /** tabId -> tableId -> position */
  nodePositions: Record<string, Record<string, { x: number; y: number }>>
  /** tabId -> 是否正在自动布局中 */
  isLayouting: Record<string, boolean>

  setPickerOpen: (open: boolean) => void
  setNodePositions: (tabId: string, positions: Record<string, { x: number; y: number }>) => void
  setLayouting: (tabId: string, loading: boolean) => void
  clearTabState: (tabId: string) => void
}

export const useErStore = create<ErStoreState>()((set) => ({
  pickerOpen: false,
  nodePositions: {},
  isLayouting: {},

  setPickerOpen: (open) => {
    set({ pickerOpen: open })
  },

  setNodePositions: (tabId, positions) => {
    set((state) => ({
      nodePositions: { ...state.nodePositions, [tabId]: positions }
    }))
  },

  setLayouting: (tabId, loading) => {
    set((state) => ({
      isLayouting: { ...state.isLayouting, [tabId]: loading }
    }))
  },

  clearTabState: (tabId) => {
    set((state) => {
      const nodePositions = { ...state.nodePositions }
      const isLayouting = { ...state.isLayouting }
      delete nodePositions[tabId]
      delete isLayouting[tabId]
      return { nodePositions, isLayouting }
    })
  }
}))
