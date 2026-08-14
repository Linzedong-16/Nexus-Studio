import { create } from 'zustand'
import type { ConversationReference } from '@/types/conversation'
import type { AgentRun } from '@/types/agent'
import { agentService } from '@/services/agentService'
import { useConnectionStore } from '@/store/connectionStore'

/** 一轮"指令 → Agent 运行结果"，单轮对话模式下一次发送对应一个 turn */
export interface ConversationTurn {
  id: string
  instruction: string
  /** 请求已发出但尚未收到结果（含暂停确认后恢复期间）时为 true */
  pending: boolean
  /** 本轮的 Agent 运行快照；请求仍在进行时为 null */
  run: AgentRun | null
  /** IPC 调用本身抛出异常时的提示（区别于 AgentRun.error 携带的业务错误） */
  dispatchError?: string
}

interface ConversationState {
  references: ConversationReference[]
  turns: ConversationTurn[]

  addReference: (ref: ConversationReference) => void
  removeReference: (id: string) => void
  clearReferences: () => void

  /** 发起一次单轮 Agent 对话；自动携带当前激活连接与数据库作为上下文 */
  sendInstruction: (instruction: string) => Promise<void>
  /** 确认或拒绝最新一轮中暂停等待确认的工具调用 */
  confirmPendingToolCall: (approved: boolean) => Promise<void>
}

/**
 * 对话状态管理（Code 模式）
 *
 * 管理用户右键添加到对话的引用（文件/数据库对象），以及单轮 Agent 对话的
 * 指令-结果轨迹。多轮上下文管理（跨 turn 共享历史）将在后续迭代进行。
 */
export const useConversationStore = create<ConversationState>()((set, get) => ({
  references: [],
  turns: [],

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

  clearReferences: () => set({ references: [] }),

  sendInstruction: async (instruction) => {
    const turnId = crypto.randomUUID()
    set((s) => ({
      turns: [...s.turns, { id: turnId, instruction, pending: true, run: null }]
    }))

    const { activeConnectionId, connections } = useConnectionStore.getState()
    const database = activeConnectionId
      ? (connections[activeConnectionId]?.activeDatabase ?? null)
      : null

    const updateTurn = (updater: (turn: ConversationTurn) => ConversationTurn): void => {
      set((s) => ({
        turns: s.turns.map((t) => (t.id === turnId ? updater(t) : t))
      }))
    }

    try {
      const run = await agentService.chat(instruction, activeConnectionId, database)
      updateTurn((t) => ({ ...t, pending: false, run }))
    } catch (error) {
      updateTurn((t) => ({
        ...t,
        pending: false,
        dispatchError: error instanceof Error ? error.message : '发送失败'
      }))
    }
  },

  confirmPendingToolCall: async (approved) => {
    const turns = get().turns
    const lastTurn = turns[turns.length - 1]
    if (!lastTurn?.run || lastTurn.run.status !== 'paused_for_confirmation') return

    const runId = lastTurn.run.id
    set((s) => ({
      turns: s.turns.map((t) => (t.id === lastTurn.id ? { ...t, pending: true } : t))
    }))

    try {
      const run = await agentService.confirmToolCall(runId, approved)
      set((s) => ({
        turns: s.turns.map((t) => (t.id === lastTurn.id ? { ...t, pending: false, run } : t))
      }))
    } catch (error) {
      set((s) => ({
        turns: s.turns.map((t) =>
          t.id === lastTurn.id
            ? {
                ...t,
                pending: false,
                dispatchError: error instanceof Error ? error.message : '发送失败'
              }
            : t
        )
      }))
    }
  }
}))
