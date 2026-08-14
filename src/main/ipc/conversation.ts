/**
 * 对话管理 IPC 通道注册（conversation:*）
 *
 * 遵循宪法 V：通道命名 `模块:操作`，双向通信使用 invoke/handle。
 *
 * 所有文件 I/O 通过 conversationService 在主进程执行，
 * 渲染进程仅通过 IPC 获取数据（宪法 I）。
 */
import type {
  Conversation,
  ConversationActionRequest,
  ConversationGetRequest,
  ConversationGetResponse
} from '../../renderer/src/types/conversation'
import {
  appendMessage,
  archiveConversation,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversationMeta
} from '../services/conversationService'
import { getAgentRunByConversationId } from './agent'
import { createIPCHandler } from './utils'

/**
 * 注册 conversation:* 系列 IPC 通道
 *
 * 6 个通道（contracts/ipc-conversation.md）：
 * list / get / create / delete / archive / get-active-run
 * + 导出工具函数供 agent.ts 复用（appendMessage / updateConversationMeta）
 */
export function registerConversationIPC(): void {
  // ─── conversation:list ───
  createIPCHandler<[], Conversation[]>('conversation:list', async () => {
    return listConversations()
  })

  // ─── conversation:get ───
  createIPCHandler<[ConversationGetRequest], ConversationGetResponse>(
    'conversation:get',
    async (request) => {
      return getConversation(request.conversationId, request.offset, request.limit)
    }
  )

  // ─── conversation:create ───
  createIPCHandler<[], Conversation>('conversation:create', async () => {
    return createConversation()
  })

  // ─── conversation:delete ───
  createIPCHandler<[ConversationActionRequest], void>('conversation:delete', async (request) => {
    await deleteConversation(request.conversationId)
  })

  // ─── conversation:archive ───
  createIPCHandler<[ConversationActionRequest], Conversation>(
    'conversation:archive',
    async (request) => {
      return archiveConversation(request.conversationId)
    }
  )

  // ─── conversation:get-active-run ───
  createIPCHandler<
    [ConversationActionRequest],
    { run: import('../../renderer/src/types/agent').AgentRun } | null
  >('conversation:get-active-run', async (request) => {
    const run = getAgentRunByConversationId(request.conversationId)
    return run ? { run } : null
  })
}

/**
 * 导出供 agent.ts 使用的存储写入函数
 *
 * agent:chat 每轮完成后调用，将消息持久化 + 更新索引。
 */
export { appendMessage, updateConversationMeta }
