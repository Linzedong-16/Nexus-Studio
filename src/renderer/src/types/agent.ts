/**
 * Code 模式 Agent 相关类型定义
 *
 * 与主进程 `src/main/ai/` 共享的数据结构（渲染进程侧仅保留展示所需字段），
 * 字段定义与 `specs/008-code-mode-agent/data-model.md` 保持一致。
 */
import type { ConversationReference } from './conversation'

// ─── 工具定义（展示形态） ───

/** `agent:list-tools` 返回的单个工具展示信息，不含 `execute` 与内部 zod schema */
export interface AgentToolSummary {
  name: string
  description: string
  mutates: boolean
  /** 由 zod-to-json-schema 从 inputSchema 派生的 JSON Schema */
  inputJsonSchema: object
}

// ─── 工具输出格式 ───

/** 全部工具统一的输出结构，成功携带数据、失败携带错误信息 */
export type ToolExecutionResult<TOutput> =
  | { status: 'success'; data: TOutput }
  | { status: 'error'; error: { message: string; fieldErrors?: Record<string, string> } }

// ─── 工具调用记录 ───

export type AgentToolCallConfirmation = 'not_required' | 'pending' | 'approved' | 'rejected'

/** 一次工具调用的完整轨迹，用于 FR-010 的调用轨迹展示 */
export interface AgentToolCallRecord {
  id: string
  toolName: string
  input: unknown
  mutates: boolean
  confirmation: AgentToolCallConfirmation
  result: ToolExecutionResult<unknown> | null
  startedAt: number | null
  finishedAt: number | null
}

// ─── AgentRun 状态机 ───

export type AgentRunStatus = 'running' | 'paused_for_confirmation' | 'completed' | 'failed'

export type AgentErrorCode =
  | 'provider_not_configured'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'max_iterations_exceeded'

/** `AgentRun` 的渲染进程精简版：省略 `history`（多轮对话历史，渲染进程无需展示全量）；
 * 009 新增 `conversationId` 关联所属对话 */
export interface AgentRun {
  id: string
  status: AgentRunStatus
  instruction: string
  /** 关联的对话 ID（009 新增） */
  conversationId: string
  /** 本轮发送时携带的引用快照（数据库连接/文件等） */
  references: ConversationReference[]
  iterationCount: number
  toolCalls: AgentToolCallRecord[]
  pendingConfirmation: { toolCallId: string; summary: string } | null
  finalMessage: string | null
  error: { code: AgentErrorCode; message: string } | null
}

/** 流式 Agent 事件的载荷类型 */
export interface AgentStreamEvent {
  runId: string
  conversationId: string
  type: 'tool-call-start' | 'tool-call-end' | 'text-delta' | 'completed' | 'failed'
  toolCall?: { id: string; toolName: string; input: unknown; mutates: boolean }
  toolCallId?: string
  result?: ToolExecutionResult<unknown>
  content?: string
  finalMessage?: string
  error?: { code: string; message: string }
}

/** 一条历史消息的上下文快照（对应 008 data-model.md §5 `AgentMessage`） */
export interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls: AgentToolCallRecord[]
  createdAt: number
}

/** `agent:chat` 的请求参数（009 扩展：新增 conversationId） */
export interface AgentChatRequest {
  instruction: string
  connectionId: string | null
  database: string | null
  /** 可选：指定对话 ID，不传则自动创建新对话 */
  conversationId?: string
  /** 可选：本轮发送时携带的引用快照（数据库连接/文件等），用于让模型感知用户关注的上下文对象 */
  references?: ConversationReference[]
}
