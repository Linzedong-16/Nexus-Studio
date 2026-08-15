import type {
  AgentErrorCode,
  AgentRunStatus,
  AgentToolCallRecord
} from '../../../renderer/src/types/agent'
import type { ConversationReference } from '../../../renderer/src/types/conversation'

/**
 * 消息，多轮对话上下文载体（data-model.md §5 → 009 升级为实际使用）
 *
 * 从 ConversationMessage（持久化格式）派生，仅保留 LLM 推理所需的字段。
 * `instruction` 在 role === 'user' 时承载用户原始指令文本。
 */
export interface AgentMessage {
  role: 'user' | 'assistant'
  instruction: string
  content: string
  toolCalls: AgentToolCallRecord[]
  createdAt: number
}

/**
 * 主进程内部持有的完整 Agent 运行状态
 *
 * 比渲染进程可见的 `AgentRun`（`src/renderer/src/types/agent.ts`）多一个 `history` 字段，
 * 后者是多轮对话的预留结构，本阶段对渲染进程无展示价值（data-model.md §4）。
 */
export interface AgentRun {
  id: string
  status: AgentRunStatus
  conversationId: string
  instruction: string
  /** 本轮发送时携带的引用快照，用于确认/恢复流程结束后持久化时仍能带上这轮最初的引用 */
  references: ConversationReference[]
  /** 当前打开的项目根目录；null 表示未打开项目，用于限定 file.readFile 工具的读取范围 */
  activeProjectPath: string | null
  history: AgentMessage[]
  iterationCount: number
  toolCalls: AgentToolCallRecord[]
  pendingConfirmation: { toolCallId: string; summary: string } | null
  finalMessage: string | null
  error: { code: AgentErrorCode; message: string } | null
}

/**
 * 创建一个新的 `AgentRun`，初始状态为 `running`（data-model.md §4 状态机起点）
 *
 * 009 升级：history 从预留占位升级为实际使用。
 *
 * @param id - 运行唯一标识（`runId`）
 * @param conversationId - 关联的对话 ID
 * @param instruction - 用户提交的原始自然语言指令
 * @param history - 对话历史消息（多轮上下文），当前 run 之前的所有轮次
 * @param references - 本轮发送时携带的引用快照（数据库连接/文件等），默认为空
 * @param activeProjectPath - 当前打开的项目根目录，默认为 null（未打开项目）
 */
export function createAgentRun(
  id: string,
  conversationId: string,
  instruction: string,
  history: AgentMessage[] = [],
  references: ConversationReference[] = [],
  activeProjectPath: string | null = null
): AgentRun {
  return {
    id,
    status: 'running',
    conversationId,
    instruction,
    references,
    activeProjectPath,
    history,
    iterationCount: 0,
    toolCalls: [],
    pendingConfirmation: null,
    finalMessage: null,
    error: null
  }
}

/** `running` → `paused_for_confirmation`：选中修改类工具时中断本轮，等待外部确认（data-model.md §4） */
export function pauseForConfirmation(run: AgentRun, toolCallId: string, summary: string): AgentRun {
  return { ...run, status: 'paused_for_confirmation', pendingConfirmation: { toolCallId, summary } }
}

/** `paused_for_confirmation` → `running`：无论确认还是拒绝都回到 `running`，由循环据此继续推理 */
export function resumeFromConfirmation(run: AgentRun): AgentRun {
  return { ...run, status: 'running', pendingConfirmation: null }
}

/** `running` → `completed`：模型给出最终自然语言答案 */
export function completeRun(run: AgentRun, finalMessage: string): AgentRun {
  return { ...run, status: 'completed', finalMessage }
}

/** `running` → `failed`：轮次上限耗尽 / 模型调用失败 / 密钥未配置等终态错误 */
export function failRun(run: AgentRun, code: AgentErrorCode, message: string): AgentRun {
  return { ...run, status: 'failed', error: { code, message } }
}

/** 追加一条工具调用记录（不可变更新） */
export function appendToolCall(run: AgentRun, record: AgentToolCallRecord): AgentRun {
  return { ...run, toolCalls: [...run.toolCalls, record] }
}

/** 更新指定 id 的工具调用记录（如确认/执行完成后写入结果）；id 不存在时原样返回 */
export function updateToolCall(
  run: AgentRun,
  toolCallId: string,
  updater: (record: AgentToolCallRecord) => AgentToolCallRecord
): AgentRun {
  return {
    ...run,
    toolCalls: run.toolCalls.map((tc) => (tc.id === toolCallId ? updater(tc) : tc))
  }
}

/** 迭代计数 +1，每完成一轮"思考-行动"调用一次（research.md §6） */
export function incrementIteration(run: AgentRun): AgentRun {
  return { ...run, iterationCount: run.iterationCount + 1 }
}
