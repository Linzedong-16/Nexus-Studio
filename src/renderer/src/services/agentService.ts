import type {
  AgentChatRequest,
  AgentRun,
  AgentToolSummary,
  ToolExecutionResult
} from '../types/agent'

/**
 * Agent 对话服务层（Code 模式）
 *
 * 宪法 III：组件不直接调用 window.api，通过 Service 层封装
 * 是渲染进程中唯一调用 window.api.agent.* 的位置
 */

export const agentService = {
  /**
   * 发起一次多轮 Agent 对话，返回本轮运行的最终快照（含工具调用轨迹）
   *
   * 009 升级：新增 conversationId 参数，不传则自动创建新对话
   */
  async chat(
    instruction: string,
    connectionId: string | null,
    database: string | null,
    conversationId?: string
  ): Promise<AgentRun> {
    const request: AgentChatRequest = { instruction, connectionId, database, conversationId }
    return window.api.agent.chat(request)
  },

  /**
   * 发起流式 Agent 对话，返回 { runId, conversationId }
   *
   * 增量内容通过 `window.api.agent.onStreamEvent(callback)` 推送，
   * 在 store 层订阅事件并累积到 ConversationTurn.streamingText。
   */
  async chatStream(
    instruction: string,
    connectionId: string | null,
    database: string | null,
    conversationId?: string
  ): Promise<{ runId: string; conversationId: string }> {
    const request: AgentChatRequest = { instruction, connectionId, database, conversationId }
    return window.api.agent.chatStream(request)
  },

  /**
   * 确认或拒绝某次暂停中的修改类工具调用，恢复对应运行
   */
  async confirmToolCall(runId: string, approved: boolean): Promise<AgentRun> {
    return window.api.agent.confirmToolCall(runId, approved)
  },

  /**
   * 列出全部已注册工具及其展示信息（FR-012 独立测试入口）
   */
  async listTools(): Promise<AgentToolSummary[]> {
    return window.api.agent.listTools()
  },

  /**
   * 绕过对话与确认流程，直接调用指定工具
   */
  async runTool(toolName: string, input: unknown): Promise<ToolExecutionResult<unknown>> {
    return window.api.agent.runTool(toolName, input)
  }
}
