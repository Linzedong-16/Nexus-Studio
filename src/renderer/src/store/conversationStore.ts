import { create } from 'zustand'
import type { ConversationReference } from '@/types/conversation'

interface ConversationState {
  references: ConversationReference[]

  addReference: (ref: ConversationReference) => void
  removeReference: (id: string) => void
  clearReferences: () => void
}

/**
 * 对话引用状态管理
 *
 * 管理 Code 模式下用户右键添加到对话的引用（文件/数据库对象）。
 * 多轮对话与 AI SDK 对接将在后续迭代进行。
 */
export const useConversationStore = create<ConversationState>()((set) => ({
  references: [],

  addReference: (ref) =>
    set((s) => {
      // 同 id 引用去重：先移除旧引用，再追加到末尾
      const filtered = s.references.filter((r) => r.id !== ref.id)
      return { references: [...filtered, ref] }
    }),

  removeReference: (id) =>
    set((s) => ({
      references: s.references.filter((r) => r.id !== id)
    })),

  clearReferences: () => set({ references: [] })
}))
