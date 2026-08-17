import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type {
  AgentChatRequest,
  AgentRun as RendererAgentRun,
  AgentToolSummary,
  ToolExecutionResult
} from '../../renderer/src/types/agent'
import type {
  ConversationMessage,
  ConversationReference
} from '../../renderer/src/types/conversation'
import type { ModelProviderTestResult } from '../../renderer/src/types/ipc'
import { loadModelProviderConfig } from '../ai/config'
import { DeepSeekProvider } from '../ai/provider/DeepSeekProvider'
import { resumeRun, startRun, startRunStream, type LoopState } from '../ai/loop/reactLoop'
import type { AgentRun as MainAgentRun, AgentMessage } from '../ai/loop/AgentRun'
import { toolRegistry } from '../ai/tools'
import { createIPCHandler, safeSend } from './utils'
import {
  appendMessage,
  createConversation,
  drainActiveRuns,
  readMessages,
  saveActiveRun,
  clearActiveRun,
  updateConversationMeta
} from '../services/conversationService'

/** 全局 runs Map 的引用，供 conversation:get-active-run 查询 */
let runsMap: Map<string, LoopState> | null = null

/**
 * 根据 conversationId 查找当前进行中的 AgentRun
 *
 * 供 `conversation:get-active-run` handler 调用。
 *
 * @param conversationId - 对话 ID
 * @returns 渲染进程 AgentRun 快照，若无进行中 run 则返回 null
 */
export function getAgentRunByConversationId(conversationId: string): RendererAgentRun | null {
  if (!runsMap) return null
  for (const state of runsMap.values()) {
    // 仅返回真正进行中的 run；已终结的 run 会在 handler 中从 Map 移除，
    // 这里的状态过滤是双重防护，避免历史 run 被误判为"进行中"而在渲染层与已持久化的历史消息产生重复 key
    if (
      state.run.conversationId === conversationId &&
      (state.run.status === 'running' || state.run.status === 'paused_for_confirmation')
    ) {
      return toRendererAgentRun(state.run)
    }
  }
  return null
}

/**
 * 主进程内部 `AgentRun`（`src/main/ai/loop/AgentRun.ts`）→ 渲染进程展示所需的精简版
 *
 * 009 升级：新增 `conversationId` 字段透传至渲染进程。
 */
function toRendererAgentRun(run: MainAgentRun): RendererAgentRun {
  return {
    id: run.id,
    status: run.status,
    instruction: run.instruction,
    conversationId: run.conversationId,
    references: run.references,
    iterationCount: run.iterationCount,
    toolCalls: run.toolCalls,
    pendingConfirmation: run.pendingConfirmation,
    finalMessage: run.finalMessage,
    error: run.error
  }
}

/**
 * 将持久化的 ConversationMessage[] 转换为 AgentMessage[]（LLM 上下文格式）
 */
function toAgentMessages(messages: ConversationMessage[]): AgentMessage[] {
  return messages.map((m) => ({
    role: m.role,
    instruction: m.instruction,
    content: m.content,
    toolCalls: m.toolCalls,
    createdAt: m.createdAt
  }))
}

/**
 * 将 AgentRun 的最终结果转换为 ConversationMessage
 */
function buildConversationMessage(
  conversationId: string,
  run: MainAgentRun,
  instruction: string,
  sequence: number,
  references: ConversationReference[]
): ConversationMessage[] {
  const now = Date.now()
  const messages: ConversationMessage[] = [
    // 用户消息
    {
      id: randomUUID(),
      conversationId,
      role: 'user',
      instruction,
      content: '',
      toolCalls: [],
      references,
      runId: run.id,
      runStatus: run.status,
      error: null,
      sequence,
      createdAt: now
    },
    // Agent 回复消息
    {
      id: randomUUID(),
      conversationId,
      role: 'assistant',
      instruction: '',
      content: run.finalMessage ?? '',
      toolCalls: run.toolCalls,
      references: [],
      runId: run.id,
      runStatus: run.status,
      error: run.error,
      sequence: sequence + 1,
      createdAt: now + 1
    }
  ]
  return messages
}

/**
 * 注册 Agent 对话相关 IPC 通道：`agent:chat`、`agent:confirm-tool-call`、
 * `agent:list-tools`、`agent:run-tool`、`agent:test-model-provider`
 *
 * 009 升级：agent:chat 支持多轮——加载历史上下文、自动创建对话、持久化消息。
 *
 * `config`/`provider` 改为在 `agent:chat`/`agent:chat-stream` 每次收到请求时动态创建
 * （而非注册时一次性创建并被闭包长期复用），确保用户在设置面板"模型配置"页保存新配置后，
 * 下一次对话立即生效，无需重启应用；`request.model`（对话框"选择模型"下拉）可临时覆盖
 * 已保存的默认模型。`runs` 以内存 Map 保存每个运行的完整循环状态（含喂给模型的对话上下文
 * 及运行开始时固定的 provider/config），供 `agent:confirm-tool-call` 恢复同一运行继续执行
 * ——运行中途不应切换 provider/model。
 */
export function registerAgentIPC(): void {
  const runs = new Map<string, LoopState>()
  runsMap = runs

  // 启动时清除上次会话残留的进行中状态（FR-015 崩溃恢复）
  drainActiveRuns()

  createIPCHandler<[AgentChatRequest], RendererAgentRun>('agent:chat', async (request) => {
    const runId = randomUUID()
    const baseConfig = loadModelProviderConfig()
    const config = request.model ? { ...baseConfig, model: request.model } : baseConfig
    const provider = new DeepSeekProvider(config)

    // 确定对话 ID：使用传入的或自动创建
    let conversationId = request.conversationId
    if (!conversationId) {
      const conv = await createConversation()
      conversationId = conv.id
    }

    // 加载历史消息
    const { messages: historyMessages } = await readMessages(conversationId)

    // 启动 ReAct 循环（带历史上下文）
    const state = await startRun(
      runId,
      conversationId,
      request,
      toAgentMessages(historyMessages),
      provider,
      config
    )

    // 持久化本轮的完成/暂停状态
    const isTerminal = state.run.status === 'completed' || state.run.status === 'failed'
    if (isTerminal) {
      // 计算新消息的序号
      const nextSeq = historyMessages.length
      const newMessages = buildConversationMessage(
        conversationId,
        state.run,
        request.instruction,
        nextSeq,
        request.references ?? []
      )
      // 持久化消息
      for (const msg of newMessages) {
        await appendMessage(conversationId, msg)
      }
      // 更新对话元数据
      const title = historyMessages.length === 0 ? request.instruction.slice(0, 50) : undefined
      const newCount = historyMessages.length + newMessages.length
      await updateConversationMeta(conversationId, {
        title,
        messageCount: newCount
      })
      // 清除进行中状态；同时从内存 Map 移除，避免历史 run 被 getAgentRunByConversationId 误判为进行中
      clearActiveRun(conversationId)
      runs.delete(runId)
    } else {
      // paused_for_confirmation：保存进行中状态，保留在 Map 中供确认时恢复
      runs.set(runId, state)
      saveActiveRun(conversationId, runId, state.run.status)
    }

    return toRendererAgentRun(state.run)
  })

  createIPCHandler<[string, boolean], RendererAgentRun>(
    'agent:confirm-tool-call',
    async (runId, approved) => {
      const state = runs.get(runId)
      if (!state) {
        throw new Error(`未找到进行中的运行: ${runId}`)
      }
      const conversationId = state.run.conversationId
      const instruction = state.run.instruction

      const nextState = await resumeRun(state, approved)

      // 持久化完成/继续暂停
      const isTerminal = nextState.run.status === 'completed' || nextState.run.status === 'failed'
      if (isTerminal) {
        const { messages: historyMessages } = await readMessages(conversationId)
        const nextSeq = historyMessages.length
        const newMessages = buildConversationMessage(
          conversationId,
          nextState.run,
          instruction,
          nextSeq,
          nextState.run.references
        )
        for (const msg of newMessages) {
          await appendMessage(conversationId, msg)
        }
        await updateConversationMeta(conversationId, {
          messageCount: historyMessages.length + newMessages.length
        })
        // 清除进行中状态；同时从内存 Map 移除，避免历史 run 被 getAgentRunByConversationId 误判为进行中
        clearActiveRun(conversationId)
        runs.delete(runId)
      } else {
        runs.set(runId, nextState)
        saveActiveRun(conversationId, runId, nextState.run.status)
      }

      return toRendererAgentRun(nextState.run)
    }
  )

  // ─── agent:chat-stream（流式多轮对话） ───
  createIPCHandler<[AgentChatRequest], { runId: string; conversationId: string }>(
    'agent:chat-stream',
    async (request) => {
      const runId = randomUUID()
      const baseConfig = loadModelProviderConfig()
      const config = request.model ? { ...baseConfig, model: request.model } : baseConfig
      const provider = new DeepSeekProvider(config)
      const mainWindow = BrowserWindow.getAllWindows()[0]
      /** 流式事件推送：mainWindow 可能在长耗时的 Agent 运行期间被用户关闭/销毁 */
      const sendStreamEvent = (payload: object): void => {
        if (mainWindow) safeSend(mainWindow, 'agent:stream-event', payload)
      }

      let conversationId = request.conversationId
      if (!conversationId) {
        const conv = await createConversation()
        conversationId = conv.id
      }

      const { messages: historyMessages } = await readMessages(conversationId)

      // 流式回调：通过 webContents.send 推送增量更新到渲染进程
      const callbacks = {
        onToolCallStart: (tc: {
          id: string
          toolName: string
          input: unknown
          mutates: boolean
        }) => {
          sendStreamEvent({
            runId,
            conversationId,
            type: 'tool-call-start',
            toolCall: tc
          })
        },
        onToolCallEnd: (toolCallId: string, result: ToolExecutionResult<unknown>) => {
          sendStreamEvent({
            runId,
            conversationId,
            type: 'tool-call-end',
            toolCallId,
            result
          })
        },
        onTextDelta: (delta: string) => {
          sendStreamEvent({
            runId,
            conversationId,
            type: 'text-delta',
            content: delta
          })
        },
        onCompleted: (finalMessage: string) => {
          sendStreamEvent({
            runId,
            conversationId,
            type: 'completed',
            finalMessage
          })
        },
        onFailed: (error: { code: string; message: string }) => {
          sendStreamEvent({
            runId,
            conversationId,
            type: 'failed',
            error
          })
        }
      }

      const state = await startRunStream(
        runId,
        conversationId,
        request,
        toAgentMessages(historyMessages),
        provider,
        config,
        callbacks
      )

      // 持久化
      const isTerminal = state.run.status === 'completed' || state.run.status === 'failed'
      if (isTerminal) {
        const nextSeq = historyMessages.length
        const newMessages = buildConversationMessage(
          conversationId,
          state.run,
          request.instruction,
          nextSeq,
          request.references ?? []
        )
        for (const msg of newMessages) {
          await appendMessage(conversationId, msg)
        }
        const title = historyMessages.length === 0 ? request.instruction.slice(0, 50) : undefined
        const newCount = historyMessages.length + newMessages.length
        await updateConversationMeta(conversationId, { title, messageCount: newCount })
        // 清除进行中状态；同时从内存 Map 移除，避免历史 run 被 getAgentRunByConversationId 误判为进行中
        clearActiveRun(conversationId)
      } else {
        runs.set(runId, state)
        saveActiveRun(conversationId, runId, state.run.status)
      }

      return { runId, conversationId }
    }
  )

  createIPCHandler<[], AgentToolSummary[]>('agent:list-tools', async () => {
    return toolRegistry.list()
  })

  createIPCHandler<[string, unknown], ToolExecutionResult<unknown>>(
    'agent:run-tool',
    async (toolName, input) => {
      return toolRegistry.invoke(toolName, input)
    }
  )

  // 用较短的 10s 超时（而非对话默认的 60s），避免地址不可达时设置页 UI 长时间卡住
  createIPCHandler<[{ baseURL: string; apiKey: string }], ModelProviderTestResult>(
    'agent:test-model-provider',
    async ({ baseURL, apiKey }) => {
      const testProvider = new DeepSeekProvider({
        provider: 'deepseek',
        baseURL,
        apiKey,
        model: '',
        maxIterations: 1,
        requestTimeoutMs: 10_000
      })
      return testProvider.testConnection()
    }
  )
}
