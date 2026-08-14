/**
 * 对话管理服务层（渲染进程）
 *
 * 宪法 III：组件不直接调用 window.api，通过 Service 层封装
 * 是渲染进程中唯一调用 window.api.conversation.* 的位置
 */
import type {
  Conversation,
  ConversationGetRequest,
  ConversationGetResponse,
  ConversationActionRequest
} from '../types/conversation'

export const conversationService = {
  /** 获取所有对话的元数据列表 */
  async list(): Promise<Conversation[]> {
    return window.api.conversation.list()
  },

  /** 获取单条对话的消息历史（支持分页） */
  async get(request: ConversationGetRequest): Promise<ConversationGetResponse> {
    return window.api.conversation.get(request)
  },

  /** 创建新的空对话 */
  async create(): Promise<Conversation> {
    return window.api.conversation.create()
  },

  /** 永久删除对话 */
  async delete(conversationId: string): Promise<void> {
    const req: ConversationActionRequest = { conversationId }
    return window.api.conversation.delete(req)
  },

  /** 切换对话归档状态 */
  async archive(conversationId: string): Promise<Conversation> {
    const req: ConversationActionRequest = { conversationId }
    return window.api.conversation.archive(req)
  },

  /** 获取对话当前是否有进行中的 AgentRun */
  async getActiveRun(
    conversationId: string
  ): Promise<{ run: import('../types/agent').AgentRun } | null> {
    const req: ConversationActionRequest = { conversationId }
    return window.api.conversation.getActiveRun(req)
  }
}
