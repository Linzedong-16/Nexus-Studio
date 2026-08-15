import OpenAI from 'openai'
import type { ModelProviderConfig } from '../config'
import type { ModelProviderTestResult } from '../../../renderer/src/types/ipc'
import type {
  ChatMessage,
  ChatToolCall,
  IModelProvider,
  ModelResponse,
  ModelToolSpec,
  StreamEvent
} from './IModelProvider'
import { ModelProviderError } from './IModelProvider'

type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam
type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool
type ChatCompletionMessageToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall

/** 将内部 `ChatMessage[]` 转换为 openai SDK 所需的消息格式 */
function toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((msg): ChatCompletionMessageParam => {
    if (msg.role === 'tool') {
      return { role: 'tool', content: msg.content, tool_call_id: msg.toolCallId ?? '' }
    }
    if (msg.role === 'assistant') {
      if (msg.toolCalls?.length) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: sanitizeToolName(tc.toolName),
              arguments: JSON.stringify(tc.input ?? {})
            }
          }))
        }
      }
      return { role: 'assistant', content: msg.content }
    }
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content }
    }
    return { role: 'user', content: msg.content }
  })
}

/**
 * DeepSeek（与 OpenAI 一致）要求 `tools[].function.name` 匹配 `^[a-zA-Z0-9_-]+$`，
 * 而工具注册表的命名约定是 `<namespace>.<method>`（如 `schema.listColumns`），点号不合法。
 * 用 `_` 替换点号发给模型，收到 `tool_calls` 后再用 `nameMap` 还原为注册表原名。
 */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** 将工具注册表派生的工具说明转换为 openai function-calling 所需的 `tools` 参数（research.md §4） */
function toOpenAITools(tools: ModelToolSpec[], nameMap: Map<string, string>): ChatCompletionTool[] {
  return tools.map((tool) => {
    const sanitized = sanitizeToolName(tool.name)
    nameMap.set(sanitized, tool.name)
    return {
      type: 'function',
      function: {
        name: sanitized,
        description: tool.description,
        parameters: tool.inputJsonSchema as Record<string, unknown>
      }
    }
  })
}

/** 将模型返回的 `tool_calls` 转换为内部 `ChatToolCall[]`；`arguments` 是 JSON 字符串，解析失败时按空对象处理 */
function fromOpenAIToolCalls(
  toolCalls: ChatCompletionMessageToolCall[],
  nameMap: Map<string, string>
): ChatToolCall[] {
  return toolCalls.map((tc) => {
    let input: unknown = {}
    try {
      input = JSON.parse(tc.function.arguments)
    } catch {
      input = {}
    }
    const toolName = nameMap.get(tc.function.name) ?? tc.function.name
    return { id: tc.id, toolName, input }
  })
}

/**
 * 将 openai SDK 抛出的异常映射为结构化的 `ModelProviderError`（research.md §7）
 *
 * 超时判定必须先于通用 `APIError` 判定：`APIConnectionTimeoutError` 继承自
 * `APIConnectionError`/`APIError`，但其 `status` 为 `undefined`，若先判 `status`
 * 会被错误地归入 `provider_unavailable`。
 */
function toProviderError(error: unknown): ModelProviderError {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new ModelProviderError('provider_timeout', 'DeepSeek 服务响应超时')
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new ModelProviderError('provider_auth_failed', 'DeepSeek 密钥校验失败')
    }
    if (error.status === 429) {
      return new ModelProviderError('provider_rate_limited', 'DeepSeek 服务当前限流')
    }
  }
  return new ModelProviderError(
    'provider_unavailable',
    error instanceof Error ? error.message : String(error)
  )
}

/**
 * `IModelProvider` 的 DeepSeek 实现
 *
 * 通过 openai SDK 调用 DeepSeek 的 OpenAI 兼容 Chat Completions 接口（research.md §1），
 * 携带工具注册表派生的 JSON Schema 作为 function-calling 的 `tools` 参数。
 */
export class DeepSeekProvider implements IModelProvider {
  private readonly client: OpenAI
  private readonly model: string

  constructor(config: ModelProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? '',
      baseURL: config.baseURL,
      timeout: config.requestTimeoutMs
    })
    this.model = config.model
  }

  /**
   * 发起一次 Chat Completions 调用
   *
   * @throws {ModelProviderError} 鉴权失败（401/403）/限流（429）/超时/服务不可用
   */
  async chat(messages: ChatMessage[], tools: ModelToolSpec[]): Promise<ModelResponse> {
    const nameMap = new Map<string, string>()
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: toOpenAIMessages(messages),
        tools: tools.length > 0 ? toOpenAITools(tools, nameMap) : undefined
      })
      const choice = response.choices[0]?.message
      if (choice?.tool_calls?.length) {
        return { kind: 'tool_calls', toolCalls: fromOpenAIToolCalls(choice.tool_calls, nameMap) }
      }
      return { kind: 'final', content: choice?.content ?? '' }
    } catch (error) {
      if (error instanceof ModelProviderError) throw error
      throw toProviderError(error)
    }
  }

  /**
   * 流式 Chat Completions 调用
   *
   * 通过 `stream: true` 启动 SSE 流式响应，逐 token 产出文本增量或工具调用。
   * 每接收到一块模型输出即 yield 对应的 `StreamEvent`，供 ReAct 循环实时推送到渲染进程。
   *
   * @throws {ModelProviderError} 鉴权失败/限流/超时/服务不可用
   */
  async *chatStream(messages: ChatMessage[], tools: ModelToolSpec[]): AsyncGenerator<StreamEvent> {
    const nameMap = new Map<string, string>()
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: toOpenAIMessages(messages),
        tools: tools.length > 0 ? toOpenAITools(tools, nameMap) : undefined,
        stream: true
      })

      // 累积 tool_calls delta 的临时存储
      const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>()

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta

        // 文本增量
        if (delta?.content) {
          yield { kind: 'text-delta', content: delta.content }
        }

        // tool_calls 增量（OpenAI streaming 模式下分多块返回，每块含 index）
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            const existing = toolCallAccumulator.get(idx) ?? { id: '', name: '', arguments: '' }
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name = tc.function.name
            if (tc.function?.arguments) existing.arguments += tc.function.arguments
            toolCallAccumulator.set(idx, existing)
          }
        }

        // 检查是否结束：有 finish_reason 表示本块是最后一块
        if (chunk.choices[0]?.finish_reason === 'tool_calls') {
          // 累积的 tool_calls 全部到达，解析并 yield
          const toolCalls: ChatToolCall[] = []
          for (const [, tc] of toolCallAccumulator) {
            let input: unknown = {}
            try {
              input = JSON.parse(tc.arguments)
            } catch {
              input = {}
            }
            const toolName = nameMap.get(tc.name) ?? tc.name
            toolCalls.push({ id: tc.id, toolName, input })
          }
          yield { kind: 'tool_calls', toolCalls }
        }
      }
      yield { kind: 'done' }
    } catch (error) {
      if (error instanceof ModelProviderError) throw error
      throw toProviderError(error)
    }
  }

  /**
   * 测试当前配置的 baseURL/apiKey 是否可用（"模型配置"页"测试连接"按钮专用）
   *
   * 用 `models.list()` 探测鉴权与网络可达性，不占用生成 token；
   * 失败时把 SDK 抛出的真实错误信息原样返回，不做场景假设。
   */
  async testConnection(): Promise<ModelProviderTestResult> {
    const start = Date.now()
    try {
      await this.client.models.list()
      return { success: true, message: '连接成功', latencyMs: Date.now() - start }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
