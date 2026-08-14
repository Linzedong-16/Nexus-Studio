import type {
  AgentChatRequest,
  AgentToolCallRecord,
  ToolExecutionResult
} from '../../../renderer/src/types/agent'
import type { ModelProviderConfig } from '../config'
import { isProviderConfigured } from '../config'
import type {
  ChatMessage,
  ChatToolCall,
  IModelProvider,
  ModelResponse,
  ModelToolSpec
} from '../provider/IModelProvider'
import { ModelProviderError } from '../provider/IModelProvider'
import { toolRegistry } from '../tools'
import {
  type AgentRun,
  type AgentMessage,
  appendToolCall,
  completeRun,
  createAgentRun,
  failRun,
  incrementIteration,
  pauseForConfirmation,
  resumeFromConfirmation,
  updateToolCall
} from './AgentRun'

const SYSTEM_PROMPT =
  '你是 Nexus Studio 数据库客户端 Code 模式下的助手，通过调用工具查询数据库结构、执行 SQL、' +
  '校验/格式化 SQL 语句来完成用户提出的数据库相关任务。每次工具调用后你会收到执行结果（成功数据或失败原因），' +
  '请据此继续推理直到能给出最终结论；若结论已明确请直接输出自然语言最终答案，不要再发起新的工具调用。' +
  '若指令需要数据库连接与数据库上下文，但下方”当前上下文”未提供，请不要猜测，直接在最终答案中说明需要先选择一个数据库连接。'

/** 上下文窗口上限 token 数（DeepSeek Chat 128K × 80% 保守值） */
const MAX_CONTEXT_TOKENS = 100_000

/**
 * 估算文本的 token 数量
 *
 * 无 tokenizer 时的近似计算：英文 ~3 字符/token，中文 ~1.5 字符/token，
 * 工具调用 JSON ~2 字符/token。综合采用 字符数 / 2 的保守估算（research.md §3）。
 *
 * @param text - 待估算的文本
 * @returns 估算的 token 数
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2)
}

/**
 * 裁剪历史消息以适应上下文窗口
 *
 * 从最早的消息开始丢弃，保留 system prompt + 最近的消息，
 * 直到总估算 token 数 < MAX_CONTEXT_TOKENS。
 * 完整消息历史在本地存储中不受影响（FR-011）。
 *
 * @param systemPrompt - 系统提示词
 * @param historyMessages - 历史消息（可能很长）
 * @param currentInstruction - 当前用户指令（必须保留）
 * @returns 裁剪后的历史消息列表
 */
function trimHistory(
  systemPrompt: string,
  historyMessages: AgentMessage[],
  currentInstruction: string
): AgentMessage[] {
  const systemTokens = estimateTokens(systemPrompt)
  const instructionTokens = estimateTokens(currentInstruction)
  const reservedTokens = systemTokens + instructionTokens + 500 // 500 token 缓冲
  const availableTokens = MAX_CONTEXT_TOKENS - reservedTokens

  if (availableTokens <= 0) {
    // 极端情况：system prompt + 当前指令已接近窗口上限，不保留历史
    return []
  }

  // 估算每条历史消息的 token 数
  const tokenCounts = historyMessages.map(
    (m) => estimateTokens(m.instruction) + estimateTokens(m.content)
  )

  // 从最早的消息开始丢弃
  let totalTokens = tokenCounts.reduce((sum, t) => sum + t, 0)
  let startIndex = 0
  while (startIndex < historyMessages.length && totalTokens > availableTokens) {
    totalTokens -= tokenCounts[startIndex]
    startIndex++
  }

  return historyMessages.slice(startIndex)
}

/**
 * 将 AgentMessage 转换为 LLM 所需的 ChatMessage 格式
 *
 * DeepSeek/OpenAI 协议要求：assistant 消息若携带 `tool_calls`，必须紧跟对应数量的
 * `role: 'tool'` 消息逐一回应每个 `tool_call_id`，否则下一次请求会被 API 以 400 拒绝
 * （insufficient tool messages following tool_calls message）。持久化的历史消息里
 * 工具调用结果保存在 `AgentToolCallRecord.result` 中，这里需要还原为对应的 tool 消息。
 *
 * @param historyMessages - 对话历史消息
 * @returns ChatMessage 数组（不含 system prompt 和当前用户指令）
 */
function historyToChatMessages(historyMessages: AgentMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  for (const msg of historyMessages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.instruction })
    } else {
      result.push({
        role: 'assistant',
        content: msg.content,
        toolCalls:
          msg.toolCalls.length > 0
            ? msg.toolCalls.map((tc) => ({
                id: tc.id,
                toolName: tc.toolName,
                input: tc.input
              }))
            : undefined
      })
      for (const tc of msg.toolCalls) {
        result.push({
          role: 'tool',
          content: JSON.stringify(tc.result ?? { status: 'error', error: { message: '未执行' } }),
          toolCallId: tc.id
        })
      }
    }
  }
  return result
}

/** 流式运行回调：ReAct 循环在运行时通过此回调向外部推送增量更新 */
export interface StreamCallbacks {
  /** 本轮开始新的工具调用 */
  onToolCallStart?: (toolCall: {
    id: string
    toolName: string
    input: unknown
    mutates: boolean
  }) => void
  /** 工具调用完成 */
  onToolCallEnd?: (toolCallId: string, result: ToolExecutionResult<unknown>) => void
  /** 流式文本增量（累积到 finalMessage） */
  onTextDelta?: (delta: string) => void
  /** 运行完成 */
  onCompleted?: (finalMessage: string) => void
  /** 运行暂停等待确认 */
  onPaused?: (toolCallId: string, summary: string) => void
  /** 运行失败 */
  onFailed?: (error: { code: string; message: string }) => void
}
interface LoopContext {
  provider: IModelProvider
  config: ModelProviderConfig
  tools: ModelToolSpec[]
}

/**
 * ReAct 循环的完整内部状态
 *
 * 比对外暴露的 `AgentRun`（`data-model.md` §4）多两项内部字段：`messages`（喂给模型的对话上下文，
 * 含工具调用结果）与 `pendingBatch`（当前模型响应中，因命中修改类工具而暂停时尚未处理的剩余工具调用）。
 * IPC 层（`src/main/ipc/agent.ts`）应以 `runId` 为键持有完整的 `LoopState`，而不仅是 `run` 快照，
 * 否则 `resumeRun` 无法在确认/拒绝后继续同一批工具调用。
 */
export interface LoopState {
  run: AgentRun
  messages: ChatMessage[]
  pendingBatch: ChatToolCall[]
  context: LoopContext
}

/** 派生自工具注册表的 `tools` function-calling 说明（research.md §4） */
function buildModelTools(): ModelToolSpec[] {
  return toolRegistry.list().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputJsonSchema: tool.inputJsonSchema
  }))
}

/** 将连接/数据库上下文与用户指令拼接为首条用户消息，供模型判断是否缺少数据库上下文 */
function buildContextMessage(request: AgentChatRequest): string {
  const connectionId = request.connectionId ?? '（未选择连接）'
  const database = request.database ?? '（未选择数据库）'
  return `当前上下文：connectionId=${connectionId}，database=${database}\n\n用户指令：${request.instruction}`
}

/** 将 provider 抛出的异常统一转换为 `ModelProviderError`，未知异常归为 `provider_unavailable` */
function toModelProviderError(error: unknown): ModelProviderError {
  if (error instanceof ModelProviderError) return error
  return new ModelProviderError(
    'provider_unavailable',
    error instanceof Error ? error.message : String(error)
  )
}

/** 依次处理一批工具调用；命中 `mutates=true` 的工具时立即暂停，返回尚未处理的剩余调用（FR-011、data-model.md §4） */
async function processBatch(
  toolCalls: ChatToolCall[],
  run: AgentRun,
  messages: ChatMessage[]
): Promise<{ run: AgentRun; messages: ChatMessage[]; paused: boolean; remaining: ChatToolCall[] }> {
  let currentRun = run
  let currentMessages = messages

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i]

    let mutates = false
    try {
      mutates = toolRegistry.get(toolCall.toolName).mutates
    } catch {
      mutates = false
    }

    const baseRecord: AgentToolCallRecord = {
      id: toolCall.id,
      toolName: toolCall.toolName,
      input: toolCall.input,
      mutates,
      confirmation: mutates ? 'pending' : 'not_required',
      result: null,
      startedAt: Date.now(),
      finishedAt: null
    }
    currentRun = appendToolCall(currentRun, baseRecord)

    if (mutates) {
      currentRun = pauseForConfirmation(
        currentRun,
        toolCall.id,
        `即将执行会修改数据的工具 ${toolCall.toolName}，参数：${JSON.stringify(toolCall.input)}`
      )
      return {
        run: currentRun,
        messages: currentMessages,
        paused: true,
        remaining: toolCalls.slice(i + 1)
      }
    }

    const result = await toolRegistry.invoke(toolCall.toolName, toolCall.input)
    currentRun = updateToolCall(currentRun, toolCall.id, (record) => ({
      ...record,
      result,
      finishedAt: Date.now()
    }))
    currentMessages = [
      ...currentMessages,
      { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    ]
  }

  return { run: currentRun, messages: currentMessages, paused: false, remaining: [] }
}

/** 循环主体：持续「思考→行动」直到得出最终答案、暂停等待确认、达到轮次上限或模型调用失败 */
async function runLoop(state: LoopState): Promise<LoopState> {
  let run = state.run
  let messages = state.messages
  const { context } = state

  while (run.status === 'running') {
    if (run.iterationCount >= context.config.maxIterations) {
      run = failRun(
        run,
        'max_iterations_exceeded',
        '未能在限定步数内完成任务，已在结果中列出目前收集到的信息'
      )
      break
    }
    run = incrementIteration(run)

    let response: ModelResponse
    try {
      response = await context.provider.chat(messages, context.tools)
    } catch (error) {
      const providerError = toModelProviderError(error)
      run = failRun(run, providerError.code, providerError.message)
      break
    }

    if (response.kind === 'final') {
      run = completeRun(run, response.content)
      break
    }

    messages = [...messages, { role: 'assistant', content: '', toolCalls: response.toolCalls }]
    const batchResult = await processBatch(response.toolCalls, run, messages)
    run = batchResult.run
    messages = batchResult.messages
    if (batchResult.paused) {
      return { run, messages, pendingBatch: batchResult.remaining, context }
    }
  }

  return { run, messages, pendingBatch: [], context }
}

/**
 * 发起一次新的 Agent 运行
 *
 * 009 升级：接受 historyMessages 和 conversationId，支持多轮上下文。
 * 未配置密钥时在第一次思考前直接返回 `failed`（`provider_not_configured`），不发起任何网络调用（FR-008）。
 *
 * @param runId - 运行唯一标识
 * @param conversationId - 关联的对话 ID
 * @param request - `agent:chat` 的请求载荷（指令 + 连接/数据库上下文）
 * @param historyMessages - 该对话之前全部轮次的历史消息（空数组表示新对话）
 * @param provider - 模型提供方实现（当前始终是 `DeepSeekProvider`）
 * @param config - 已加载的模型提供方配置
 * @returns 循环执行到下一个暂停点（完成/失败/等待确认）时的完整内部状态
 */
export async function startRun(
  runId: string,
  conversationId: string,
  request: AgentChatRequest,
  historyMessages: AgentMessage[],
  provider: IModelProvider,
  config: ModelProviderConfig
): Promise<LoopState> {
  const run = createAgentRun(runId, conversationId, request.instruction, historyMessages)
  const context: LoopContext = { provider, config, tools: buildModelTools() }

  if (!isProviderConfigured(config)) {
    return {
      run: failRun(
        run,
        'provider_not_configured',
        '尚未配置 DeepSeek API 密钥，请在 .env 中填入 DEEPSEEK_API_KEY 后重启应用'
      ),
      messages: [],
      pendingBatch: [],
      context
    }
  }

  // 构建完整消息上下文：system prompt → 裁剪后的历史 → 当前上下文+指令
  const trimmedHistory = trimHistory(SYSTEM_PROMPT, historyMessages, request.instruction)
  const historyChatMessages = historyToChatMessages(trimmedHistory)
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historyChatMessages,
    { role: 'user', content: buildContextMessage(request) }
  ]

  return runLoop({ run, messages, pendingBatch: [], context })
}

/**
 * 恢复一个处于 `paused_for_confirmation` 的运行
 *
 * 无论确认还是拒绝都先回到 `running`：确认后执行该工具调用并将结果计入上下文；拒绝则将
 * “用户拒绝执行该操作”作为该工具调用的结果计入上下文（data-model.md §4）。随后继续处理同一批
 * 响应中尚未处理的剩余工具调用（若又命中修改类工具则再次暂停），最终回到主循环。
 *
 * @param state - 暂停前的完整内部状态（须与 `startRun`/上一次 `resumeRun` 的返回值一致）
 * @param approved - 用户是否确认执行
 * @returns 继续执行后的最新内部状态；若传入的 `state` 并非处于等待确认，原样返回
 */
export async function resumeRun(state: LoopState, approved: boolean): Promise<LoopState> {
  if (state.run.status !== 'paused_for_confirmation' || !state.run.pendingConfirmation) {
    return state
  }

  const { toolCallId } = state.run.pendingConfirmation
  let run = resumeFromConfirmation(state.run)
  let messages = state.messages

  if (approved) {
    const pendingRecord = run.toolCalls.find((tc) => tc.id === toolCallId)
    const result: ToolExecutionResult<unknown> = pendingRecord
      ? await toolRegistry.invoke(pendingRecord.toolName, pendingRecord.input)
      : { status: 'error', error: { message: '未找到待确认的工具调用记录' } }
    run = updateToolCall(run, toolCallId, (record) => ({
      ...record,
      confirmation: 'approved',
      result,
      finishedAt: Date.now()
    }))
    messages = [...messages, { role: 'tool', content: JSON.stringify(result), toolCallId }]
  } else {
    const rejectedResult: ToolExecutionResult<unknown> = {
      status: 'error',
      error: { message: '用户拒绝执行该操作' }
    }
    run = updateToolCall(run, toolCallId, (record) => ({
      ...record,
      confirmation: 'rejected',
      result: rejectedResult,
      finishedAt: Date.now()
    }))
    messages = [...messages, { role: 'tool', content: JSON.stringify(rejectedResult), toolCallId }]
  }

  const batchResult = await processBatch(state.pendingBatch, run, messages)
  if (batchResult.paused) {
    return {
      run: batchResult.run,
      messages: batchResult.messages,
      pendingBatch: batchResult.remaining,
      context: state.context
    }
  }

  return runLoop({
    run: batchResult.run,
    messages: batchResult.messages,
    pendingBatch: [],
    context: state.context
  })
}

/**
 * 流式 ReAct 循环主体（优化版 runLoop）
 *
 * 与非流式 `runLoop` 的区别：
 * 1. 工具调用阶段使用 `provider.chat()`（非流式，快速完成）
 * 2. 最终答案阶段使用 `provider.chatStream()`（逐 token 产出增量文本）
 * 3. 通过 `callbacks` 向外部实时推送增量更新
 *
 * @param state - 初始循环状态
 * @param callbacks - 流式更新回调
 * @returns 完成后的循环状态
 */
async function runLoopStream(state: LoopState, callbacks: StreamCallbacks): Promise<LoopState> {
  let run = state.run
  let messages = state.messages
  const { context } = state

  while (run.status === 'running') {
    if (run.iterationCount >= context.config.maxIterations) {
      run = failRun(
        run,
        'max_iterations_exceeded',
        '未能在限定步数内完成任务，已在结果中列出目前收集到的信息'
      )
      callbacks.onFailed?.({ code: 'max_iterations_exceeded', message: run.error?.message ?? '' })
      break
    }
    run = incrementIteration(run)

    // 试用工具调用阶段使用非流式调用（快速完成工具选择）
    try {
      const response = await context.provider.chat(messages, context.tools)

      if (response.kind === 'final') {
        // 最终答案阶段：切换到流式调用
        let finalContent = ''
        const finalMessages = [...messages]

        try {
          for await (const event of context.provider.chatStream(finalMessages, context.tools)) {
            if (event.kind === 'text-delta') {
              finalContent += event.content
              callbacks.onTextDelta?.(event.content)
            } else if (event.kind === 'tool_calls') {
              // 流式过程中模型又选择了工具调用 → 处理之
              messages = [
                ...finalMessages,
                { role: 'assistant', content: '', toolCalls: event.toolCalls }
              ]
              const batchResult = await processBatch(event.toolCalls, run, messages)
              run = batchResult.run
              messages = batchResult.messages
              if (batchResult.paused) {
                if (batchResult.remaining.length > 0) {
                  state.pendingBatch = batchResult.remaining
                }
                return { run, messages, pendingBatch: state.pendingBatch, context }
              }
              // 工具结果返回后继续循环
              break
            }
          }
        } catch (error) {
          const providerError = toModelProviderError(error)
          run = failRun(run, providerError.code, providerError.message)
          callbacks.onFailed?.({
            code: providerError.code,
            message: providerError.message
          })
          break
        }

        if (finalContent) {
          run = completeRun(run, finalContent)
          callbacks.onCompleted?.(finalContent)
          break
        }

        // 如果流式调用后没有 finalContent（可能走了工具调用分支），继续循环
        if (run.status !== 'completed' && run.status !== 'failed') continue
        break
      }

      // 工具调用阶段：通知 renderer 并执行
      for (const tc of response.toolCalls) {
        let mutates = false
        try {
          mutates = toolRegistry.get(tc.toolName).mutates
        } catch {
          mutates = false
        }
        callbacks.onToolCallStart?.({
          id: tc.id,
          toolName: tc.toolName,
          input: tc.input,
          mutates
        })
      }

      messages = [...messages, { role: 'assistant', content: '', toolCalls: response.toolCalls }]
      const batchResult = await processBatch(response.toolCalls, run, messages)
      run = batchResult.run
      messages = batchResult.messages

      // 通知工具调用结果
      for (const tc of run.toolCalls.slice(-response.toolCalls.length)) {
        if (tc.result) {
          callbacks.onToolCallEnd?.(tc.id, tc.result)
        }
      }

      if (batchResult.paused) {
        if (batchResult.remaining.length > 0) {
          state.pendingBatch = batchResult.remaining
        }
        return { run, messages, pendingBatch: state.pendingBatch, context }
      }
    } catch (error) {
      const providerError = toModelProviderError(error)
      run = failRun(run, providerError.code, providerError.message)
      callbacks.onFailed?.({ code: providerError.code, message: providerError.message })
      break
    }
  }

  return { run, messages, pendingBatch: [], context }
}

/**
 * 发起一次流式 Agent 运行
 *
 * 与非流式 `startRun` 结构一致，但通过 `callbacks` 实时推送增量更新到渲染进程。
 * 渲染进程可通过 IPC 监听代理事件来实时渲染流式内容。
 *
 * @param runId - 运行唯一标识
 * @param conversationId - 关联的对话 ID
 * @param request - `agent:chat` 的请求载荷
 * @param historyMessages - 该对话之前全部轮次的历史消息
 * @param provider - 模型提供方实现
 * @param config - 已加载的模型提供方配置
 * @param callbacks - 流式更新回调（逐 token 推送文本、工具调用状态等）
 * @returns 最终循环状态
 */
export async function startRunStream(
  runId: string,
  conversationId: string,
  request: AgentChatRequest,
  historyMessages: AgentMessage[],
  provider: IModelProvider,
  config: ModelProviderConfig,
  callbacks: StreamCallbacks
): Promise<LoopState> {
  const run = createAgentRun(runId, conversationId, request.instruction, historyMessages)
  const context: LoopContext = { provider, config, tools: buildModelTools() }

  if (!isProviderConfigured(config)) {
    const failedRun = failRun(
      run,
      'provider_not_configured',
      '尚未配置 DeepSeek API 密钥，请在 .env 中填入 DEEPSEEK_API_KEY 后重启应用'
    )
    callbacks.onFailed?.({
      code: 'provider_not_configured',
      message: failedRun.error?.message ?? ''
    })
    return { run: failedRun, messages: [], pendingBatch: [], context }
  }

  const trimmedHistory = trimHistory(SYSTEM_PROMPT, historyMessages, request.instruction)
  const historyChatMessages = historyToChatMessages(trimmedHistory)
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historyChatMessages,
    { role: 'user', content: buildContextMessage(request) }
  ]

  return runLoopStream({ run, messages, pendingBatch: [], context }, callbacks)
}
