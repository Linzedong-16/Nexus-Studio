import { randomUUID } from 'node:crypto'
import type {
  AgentChatRequest,
  AgentRun as RendererAgentRun,
  AgentToolSummary,
  ToolExecutionResult
} from '../../renderer/src/types/agent'
import { loadModelProviderConfig } from '../ai/config'
import { DeepSeekProvider } from '../ai/provider/DeepSeekProvider'
import { resumeRun, startRun, type LoopState } from '../ai/loop/reactLoop'
import type { AgentRun as MainAgentRun } from '../ai/loop/AgentRun'
import { toolRegistry } from '../ai/tools'
import { createIPCHandler } from './utils'

/**
 * 主进程内部 `AgentRun`（`src/main/ai/loop/AgentRun.ts`）→ 渲染进程展示所需的精简版
 *
 * 省略 `history`：多轮对话预留字段，本阶段始终为空数组，对渲染进程无展示价值（data-model.md §4）。
 */
function toRendererAgentRun(run: MainAgentRun): RendererAgentRun {
  return {
    id: run.id,
    status: run.status,
    instruction: run.instruction,
    iterationCount: run.iterationCount,
    toolCalls: run.toolCalls,
    pendingConfirmation: run.pendingConfirmation,
    finalMessage: run.finalMessage,
    error: run.error
  }
}

/**
 * 注册 Agent 对话相关 IPC 通道：`agent:chat`、`agent:confirm-tool-call`、
 * `agent:list-tools`、`agent:run-tool`
 *
 * `config`/`provider` 在注册时（`app.whenReady()` 之后）读取一次并复用，确保 `.env` 已被
 * `src/main/index.ts` 加载到 `process.env`；`runs` 以内存 Map 保存每个运行的完整循环状态
 * （含喂给模型的对话上下文），供 `agent:confirm-tool-call` 恢复同一运行继续执行。
 */
export function registerAgentIPC(): void {
  const config = loadModelProviderConfig()
  const provider = new DeepSeekProvider(config)
  const runs = new Map<string, LoopState>()

  createIPCHandler<[AgentChatRequest], RendererAgentRun>('agent:chat', async (request) => {
    const runId = randomUUID()
    const state = await startRun(runId, request, provider, config)
    runs.set(runId, state)
    return toRendererAgentRun(state.run)
  })

  createIPCHandler<[string, boolean], RendererAgentRun>(
    'agent:confirm-tool-call',
    async (runId, approved) => {
      const state = runs.get(runId)
      if (!state) {
        throw new Error(`未找到进行中的运行: ${runId}`)
      }
      const nextState = await resumeRun(state, approved)
      runs.set(runId, nextState)
      return toRendererAgentRun(nextState.run)
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
}
