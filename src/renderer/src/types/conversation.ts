/**
 * 对话引用与消息类型
 *
 * 009 号功能：在 008 号功能的 `AgentMessage`（预留占位）基础上，
 * 新增完整的对话管理类型体系。
 */

/** 可引用的实体类型（008 号功能已有，保留不变） */
export type ReferenceType = 'file' | 'connection' | 'database' | 'schema' | 'table' | 'moduleGroup'

/** 对话引用实体（008 号功能已有，保留不变） */
export interface ConversationReference {
  /** 唯一标识（如文件路径、connectionId/database/schema 组合） */
  id: string
  /** 实体类型 */
  type: ReferenceType
  /** 显示名称 */
  label: string
  /** 附加描述（如文件路径、数据库名等） */
  detail?: string
  /** 添加时间戳 */
  timestamp: number
}

// ─── 009 号功能新增类型 ───

import type { AgentErrorCode, AgentRunStatus, AgentToolCallRecord } from './agent'

/** 对话状态 */
export type ConversationStatus = 'active' | 'archived'

/**
 * 对话元数据（data-model.md §1）
 *
 * 仅包含对话摘要信息，存储在 electron-store 索引中。
 * 消息正文独立存储于 JSONL 文件。
 */
export interface Conversation {
  /** UUID，创建时由主进程生成 */
  id: string
  /** 自动生成的标题（首条用户指令截取前 50 字符） */
  title: string
  /** 活跃 / 已归档 */
  status: ConversationStatus
  /** 创建时间戳（毫秒） */
  createdAt: number
  /** 最后更新时间戳（毫秒） */
  updatedAt: number
  /** 消息总数 */
  messageCount: number
}

/**
 * 对话消息（data-model.md §2）
 *
 * 一条消息 = 一轮用户指令 + Agent 运行结果。
 * 以 JSONL 格式存入 conversations/{conversationId}.jsonl。
 */
export interface ConversationMessage {
  /** 消息 UUID */
  id: string
  /** 所属对话 ID */
  conversationId: string
  /** 消息发出方 */
  role: 'user' | 'assistant'
  /** 用户原始指令（仅 role === 'user' 时有值） */
  instruction: string
  /** Agent 最终回复文本（仅 role === 'assistant' 时有值） */
  content: string
  /** 本轮产生的工具调用记录（复用 008 类型） */
  toolCalls: AgentToolCallRecord[]
  /** 发送时携带的引用快照（仅 role === 'user' 时可能非空；旧数据可能不含此字段） */
  references?: ConversationReference[]
  /** 关联的 AgentRun ID（用于切换恢复），完成/失败后置 null */
  runId: string | null
  /** AgentRun 的最终状态 */
  runStatus: AgentRunStatus | null
  /** 失败时的错误信息 */
  error: { code: AgentErrorCode; message: string } | null
  /** 对话内的序号，自 0 递增，严格连续 */
  sequence: number
  /** 时间戳（毫秒） */
  createdAt: number
}

// ─── IPC 负载类型 ───

/** `conversation:get` 请求参数 */
export interface ConversationGetRequest {
  conversationId: string
  /** 消息序号偏移，默认 0（从最早开始） */
  offset?: number
  /** 返回条数，默认 50 */
  limit?: number
}

/** `conversation:get` 返回 */
export interface ConversationGetResponse {
  conversation: Conversation
  messages: ConversationMessage[]
  /** 该对话消息总数 */
  total: number
}

/** `conversation:delete` / `conversation:archive` 请求参数 */
export interface ConversationActionRequest {
  conversationId: string
}
