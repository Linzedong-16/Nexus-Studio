import { create } from 'zustand'
import type { ConversationReference } from '@/types/conversation'
import type { Conversation, ConversationMessage } from '@/types/conversation'
import type { AgentRun } from '@/types/agent'
import { agentService } from '@/services/agentService'
import { conversationService } from '@/services/conversationService'
import { useConnectionStore } from '@/store/connectionStore'
import { createRafBatcher } from '@/lib/markdownUtils'

/** 一轮"指令 → Agent 运行结果"，单轮对话模式下一次发送对应一个 turn */
export interface ConversationTurn {
  id: string
  instruction: string
  /** 发送时携带的引用快照（数据库连接/文件等），用于在消息气泡中渲染引用标签 */
  references: ConversationReference[]
  /** 请求已发出但尚未收到结果（含暂停确认后恢复期间）时为 true */
  pending: boolean
  /** 本轮的 Agent 运行快照；请求仍在进行时为 null */
  run: AgentRun | null
  /** IPC 调用本身抛出异常时的提示（区别于 AgentRun.error 携带的业务错误） */
  dispatchError?: string
  /** 流式模式下正在累积的文本内容 */
  streamingText?: string
}

interface ConversationState {
  /* ─── 引用管理（既有功能，保留） ─── */
  references: ConversationReference[]

  addReference: (ref: ConversationReference) => void
  removeReference: (id: string) => void
  clearReferences: () => void

  /* ─── 对话列表管理（009 新增） ─── */
  /** 对话索引列表（仅元数据） */
  conversations: Conversation[]
  /** 当前选中的对话 ID */
  activeConversationId: string | null
  /** 当前对话的消息列表 */
  messages: ConversationMessage[]
  /** 消息总数（用于分页） */
  messagesTotal: number
  /** 消息加载中 */
  messagesLoading: boolean
  /** 对话列表加载中 */
  listLoading: boolean

  /** 从主进程加载对话索引列表 */
  loadConversationList: () => Promise<void>
  /** 选中一条对话并加载消息历史 */
  selectConversation: (id: string) => Promise<void>
  /** 创建新对话 */
  createConversation: () => Promise<string>
  /** 删除对话 */
  deleteConversation: (id: string) => Promise<void>
  /** 归档/取消归档 */
  archiveConversation: (id: string) => Promise<void>
  /** 加载消息历史（分页） */
  loadMessages: (offset?: number, limit?: number) => Promise<void>
  /** 检查对话是否有进行中的 AgentRun */
  checkActiveRun: () => Promise<AgentRun | null>

  /* ─── Agent 交互（既有功能，009 升级） ─── */
  /** 当前对话的消息回合 */
  turns: ConversationTurn[]

  /** 发起一次多轮 Agent 对话；自动携带当前连接上下文和 conversationId */
  sendInstruction: (instruction: string) => Promise<void>
  /** 发起一次流式 Agent 对话（逐 token 推送增量内容） */
  sendInstructionStream: (instruction: string) => Promise<void>
  /** 确认或拒绝最新一轮中暂停等待确认的工具调用 */
  confirmPendingToolCall: (approved: boolean) => Promise<void>
}

/**
 * 将持久化的 ConversationMessage[]（user/assistant 成对存储）还原为可展示的 ConversationTurn[]
 *
 * `selectConversation` 加载历史消息后必须调用此函数才能在界面上重建之前的多轮对话，
 * 否则切换到已有历史的对话时界面会因 `turns` 为空而完全空白。
 */
function messagesToTurns(
  messages: ConversationMessage[],
  conversationId: string
): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  for (let i = 0; i < messages.length; i++) {
    const userMsg = messages[i]
    if (userMsg.role !== 'user') continue
    const replyMsg = messages[i + 1]
    if (!replyMsg || replyMsg.role !== 'assistant') continue

    turns.push({
      id: replyMsg.runId ?? userMsg.id,
      instruction: userMsg.instruction,
      references: userMsg.references ?? [],
      pending: false,
      run: {
        id: replyMsg.runId ?? '',
        status: replyMsg.runStatus ?? 'completed',
        instruction: userMsg.instruction,
        conversationId,
        references: userMsg.references ?? [],
        iterationCount: 0,
        toolCalls: replyMsg.toolCalls,
        pendingConfirmation: null,
        finalMessage: replyMsg.content || null,
        error: replyMsg.error
      }
    })
  }
  return turns
}

/**
 * 对话状态管理（Code 模式）
 *
 * 009 升级：从单轮 turns 管理扩展为完整的多对话生命周期管理。
 * 支持对话的创建、选择、消息加载、归档/删除以及多轮上下文传递。
 */
export const useConversationStore = create<ConversationState>()((set, get) => ({
  /* ─── 引用管理（既有功能） ─── */
  references: [],

  addReference: (ref) =>
    set((s) => {
      const filtered = s.references.filter((r) => r.id !== ref.id)
      return { references: [...filtered, ref] }
    }),

  removeReference: (id) =>
    set((s) => ({
      references: s.references.filter((r) => r.id !== id)
    })),

  clearReferences: () => set({ references: [] }),

  /* ─── 对话列表管理（009 新增） ─── */
  conversations: [],
  activeConversationId: null,
  messages: [],
  messagesTotal: 0,
  messagesLoading: false,
  listLoading: false,

  loadConversationList: async () => {
    set({ listLoading: true })
    try {
      const conversations = await conversationService.list()
      set({ conversations, listLoading: false })
    } catch {
      set({ listLoading: false })
    }
  },

  selectConversation: async (id) => {
    // 切换前：若当前对话有进行中任务，保持其状态（renderer 侧不主动中断，主进程 runs Map 保留）
    set({
      activeConversationId: id,
      messages: [],
      messagesTotal: 0,
      messagesLoading: true,
      turns: []
    })
    try {
      const result = await conversationService.get({ conversationId: id, offset: 0, limit: 50 })
      // 还原历史消息为可展示的 turns（此前被忽略，导致重新打开多轮对话时界面空白）
      const historyTurns = messagesToTurns(result.messages, id)
      // 检查是否有进行中的 AgentRun（FR-016 切换恢复）
      const activeRunResult = await conversationService.getActiveRun(id)
      // 若有进行中 run（paused_for_confirmation），将其作为 pending turn 展示
      const resumeTurns: ConversationTurn[] = []
      if (activeRunResult?.run) {
        const run = activeRunResult.run
        resumeTurns.push({
          id: run.id,
          instruction: run.instruction,
          references: run.references,
          pending: run.status === 'running',
          run
        })
      }
      set({
        messages: result.messages,
        messagesTotal: result.total,
        messagesLoading: false,
        turns: [...historyTurns, ...resumeTurns]
      })
    } catch {
      set({ messagesLoading: false })
    }
  },

  createConversation: async () => {
    const conversation = await conversationService.create()
    set((s) => ({
      conversations: [conversation, ...s.conversations],
      activeConversationId: conversation.id,
      messages: [],
      messagesTotal: 0,
      turns: []
    }))
    return conversation.id
  },

  deleteConversation: async (id) => {
    await conversationService.delete(id)
    set((s) => {
      const nextConversations = s.conversations.filter((c) => c.id !== id)
      const nextActiveId =
        s.activeConversationId === id ? (nextConversations[0]?.id ?? null) : s.activeConversationId
      const nextTurns = s.activeConversationId === id ? [] : s.turns
      const nextMessages = s.activeConversationId === id ? [] : s.messages
      return {
        conversations: nextConversations,
        activeConversationId: nextActiveId,
        turns: nextTurns,
        messages: nextMessages,
        messagesTotal: s.activeConversationId === id ? 0 : s.messagesTotal
      }
    })
  },

  archiveConversation: async (id) => {
    const updated = await conversationService.archive(id)
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? updated : c))
    }))
  },

  loadMessages: async (offset = 0, limit = 50) => {
    const { activeConversationId } = get()
    if (!activeConversationId) return
    set({ messagesLoading: true })
    try {
      const result = await conversationService.get({
        conversationId: activeConversationId,
        offset,
        limit
      })
      set({
        messages: result.messages,
        messagesTotal: result.total,
        messagesLoading: false
      })
    } catch {
      set({ messagesLoading: false })
    }
  },

  checkActiveRun: async () => {
    const { activeConversationId } = get()
    if (!activeConversationId) return null
    const result = await conversationService.getActiveRun(activeConversationId)
    return result?.run ?? null
  },

  /* ─── Agent 交互（009 升级） ─── */
  turns: [],

  sendInstruction: async (instruction) => {
    const turnId = crypto.randomUUID()
    const { activeConversationId, references } = get()
    // 立即清空"待发送"引用，避免残留到下一轮；后续统一使用这份快照变量，
    // 不再重新读取 store，防止 AI 处理期间用户为下一轮新增的引用被本轮误用
    get().clearReferences()

    // 自动创建对话（如果没有活跃对话）
    let convId = activeConversationId
    if (!convId) {
      convId = await get().createConversation()
    }

    set((s) => ({
      turns: [...s.turns, { id: turnId, instruction, references, pending: true, run: null }]
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
      const run = await agentService.chat(
        instruction,
        activeConnectionId,
        database,
        convId,
        references
      )
      updateTurn((t) => ({ ...t, pending: false, run }))
      // 刷新对话列表以更新元数据（标题、时间、消息计数）
      await get().loadConversationList()
    } catch (error) {
      updateTurn((t) => ({
        ...t,
        pending: false,
        dispatchError: error instanceof Error ? error.message : '发送失败'
      }))
    }
  },

  sendInstructionStream: async (instruction) => {
    const turnId = crypto.randomUUID()
    const { activeConversationId, references } = get()
    // 立即清空"待发送"引用，避免残留到下一轮；后续统一使用这份快照变量，
    // 不再重新读取 store，防止 AI 处理期间用户为下一轮新增的引用被本轮误用
    get().clearReferences()

    let convId = activeConversationId
    if (!convId) {
      convId = await get().createConversation()
    }

    set((s) => ({
      turns: [
        ...s.turns,
        { id: turnId, instruction, references, pending: true, run: null, streamingText: '' }
      ]
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

    // 订阅流式事件
    // RAF 批量更新缓冲：将同一帧内的多个 text-delta 合并为一次 Zustand set()
    const rafBatcher = createRafBatcher((fullText) => {
      const currentTurns = get().turns
      const turn = currentTurns.find((t) => t.id === turnId)
      if (!turn) return
      updateTurn((t) => ({ ...t, streamingText: fullText }))
    })

    const unsubscribe = window.api.agent.onStreamEvent((event) => {
      const currentTurns = get().turns
      const turn = currentTurns.find((t) => t.id === turnId)
      if (!turn || !event.conversationId) return

      switch (event.type) {
        case 'text-delta':
          rafBatcher.append(event.content ?? '')
          break
        case 'tool-call-start':
          rafBatcher.reset()
          // 流式模式下将工具调用记录追加到当前 run（tool-call-end 时按 id 匹配更新，而非新增）
          if (event.toolCall) {
            updateTurn((t) => {
              const run = t.run ?? {
                id: event.runId,
                status: 'running',
                instruction,
                conversationId: convId ?? '',
                references,
                iterationCount: 0,
                toolCalls: [],
                pendingConfirmation: null,
                finalMessage: null,
                error: null
              }
              return {
                ...t,
                run: {
                  ...run,
                  toolCalls: [
                    ...run.toolCalls,
                    {
                      id: event.toolCall!.id,
                      toolName: event.toolCall!.toolName,
                      input: event.toolCall!.input,
                      mutates: event.toolCall!.mutates,
                      confirmation: event.toolCall!.mutates ? 'pending' : 'not_required',
                      result: null,
                      startedAt: Date.now(),
                      finishedAt: null
                    }
                  ]
                },
                streamingText: undefined // 工具调用开始时暂缓存流式文本
              }
            })
          }
          break
        case 'tool-call-end':
          updateTurn((t) => ({
            ...t,
            run: t.run
              ? {
                  ...t.run,
                  toolCalls: t.run.toolCalls.map((tc) =>
                    tc.id === event.toolCallId
                      ? { ...tc, result: event.result ?? null, finishedAt: Date.now() }
                      : tc
                  )
                }
              : t.run
          }))
          break
        case 'completed':
          updateTurn((t) => ({
            ...t,
            pending: false,
            run: {
              id: event.runId,
              status: 'completed',
              instruction,
              conversationId: convId ?? '',
              references,
              iterationCount: 0,
              toolCalls: t.run?.toolCalls ?? [],
              pendingConfirmation: null,
              finalMessage: event.finalMessage ?? t.streamingText ?? '',
              error: null
            },
            streamingText: undefined
          }))
          unsubscribe()
          void get().loadConversationList()
          break
        case 'failed':
          updateTurn((t) => ({
            ...t,
            pending: false,
            dispatchError: event.error?.message ?? '请求失败',
            streamingText: undefined
          }))
          unsubscribe()
          break
      }
    })

    try {
      await agentService.chatStream(instruction, activeConnectionId, database, convId, references)
    } catch (error) {
      updateTurn((t) => ({
        ...t,
        pending: false,
        dispatchError: error instanceof Error ? error.message : '发送失败',
        streamingText: undefined
      }))
      unsubscribe()
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
      // 刷新对话列表
      await get().loadConversationList()
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
