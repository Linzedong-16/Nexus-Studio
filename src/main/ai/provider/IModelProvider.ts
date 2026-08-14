import type { AgentErrorCode } from '../../../renderer/src/types/agent'

/** 单次模型调用可能产生的结构化错误码；不含 `max_iterations_exceeded`（那是循环层的终止条件，不是单次调用的失败） */
export type ProviderErrorCode = Exclude<AgentErrorCode, 'max_iterations_exceeded'>

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatToolCall {
  id: string
  toolName: string
  input: unknown
}

export interface ChatMessage {
  role: ChatRole
  content: string
  /** `role = 'assistant'` 且本条消息发起了工具调用请求时携带 */
  toolCalls?: ChatToolCall[]
  /** `role = 'tool'` 时，对应被回应的工具调用 id，用于模型将结果关联回请求 */
  toolCallId?: string
}

/** 派生自工具注册表、传给模型 function-calling 的工具说明（research.md §4） */
export interface ModelToolSpec {
  name: string
  description: string
  inputJsonSchema: object
}

/** 模型的一次响应：要么是最终自然语言答案，要么是一组待执行的工具调用请求 */
export type ModelResponse =
  { kind: 'final'; content: string } | { kind: 'tool_calls'; toolCalls: ChatToolCall[] }

/** 单次模型调用失败时抛出的结构化错误，供 ReAct 循环捕获并写入 `AgentRun.error`（research.md §7） */
export class ModelProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ModelProviderError'
  }
}

/** 流式响应的单个增量事件：文本片段（累积到 finalMessage）或完整的工具调用列表 */
export type StreamEvent =
  | { kind: 'text-delta'; content: string }
  | { kind: 'tool_calls'; toolCalls: ChatToolCall[] }
  | { kind: 'done' }

/**
 * 模型提供方抽象接口
 *
 * Agent 循环只依赖此接口，不直接引用 `openai` 或 DeepSeek 特有字段（research.md §2），
 * 未来更换/新增兼容 Chat Completions 协议的提供方时无需改动循环逻辑。
 */
export interface IModelProvider {
  /**
   * 发起一次模型调用
   *
   * @param messages - 对话历史 + 本轮工具结果（若有）
   * @param tools - 派生自工具注册表的模型可调用工具列表
   * @returns 最终答案或工具调用请求
   * @throws {ModelProviderError} 鉴权失败/限流/超时/服务不可用
   */
  chat(messages: ChatMessage[], tools: ModelToolSpec[]): Promise<ModelResponse>

  /**
   * 发起一次流式模型调用，通过 AsyncGenerator 逐 token 产出内容
   *
   * 与 `chat()` 接口并行存在，ReAct 循环可根据需要选择流式或非流式调用。
   * 流式产出事件序列：`text-delta`... → `done` 或 `tool_calls` → `done`
   *
   * @param messages - 对话历史 + 本轮工具结果（若有）
   * @param tools - 派生自工具注册表的模型可调用工具列表
   * @yields 增量文本片段或工具调用列表
   * @throws {ModelProviderError} 鉴权失败/限流/超时/服务不可用
   */
  chatStream(messages: ChatMessage[], tools: ModelToolSpec[]): AsyncGenerator<StreamEvent>
}
