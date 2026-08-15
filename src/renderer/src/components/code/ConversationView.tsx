import { useState, useEffect, useRef, memo } from 'react'
import {
  X,
  MessageSquare,
  AtSign,
  Mic,
  Paperclip,
  Wand2,
  ArrowUp,
  ChevronDown,
  Monitor,
  Folder,
  Database,
  Server,
  File,
  FolderTree,
  Table2,
  Package,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConversationStore } from '@/store/conversationStore'
import type { ConversationTurn } from '@/store/conversationStore'
import type { ReferenceType } from '@/types/conversation'
import type { AgentErrorCode, AgentToolCallRecord } from '@/types/agent'
import MemoizedMarkdown from './MarkdownContent'
import { streamingMarkdownKey, completedMarkdownKey } from '@/lib/markdownUtils'

const toolBtnClass =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

/** 各引用类型的图标映射 */
const REFERENCE_ICON: Record<ReferenceType, typeof File> = {
  file: File,
  connection: Server,
  database: Database,
  schema: FolderTree,
  table: Table2,
  moduleGroup: Package
}

/** `AgentErrorCode` → 面向用户的中文提示 */
const ERROR_CODE_TEXT: Record<AgentErrorCode, string> = {
  provider_not_configured:
    '尚未配置 DeepSeek API 密钥，请在 .env 中填入 DEEPSEEK_API_KEY 后重启应用',
  provider_auth_failed: 'DeepSeek 密钥校验失败，请检查密钥是否正确或已过期',
  provider_rate_limited: 'DeepSeek 服务当前限流，请稍后重试',
  provider_timeout: 'DeepSeek 服务响应超时，请稍后重试',
  provider_unavailable: 'DeepSeek 服务暂时不可用，请稍后重试',
  max_iterations_exceeded: '未能在限定步数内完成任务，已在结果中列出目前收集到的信息'
}

/** 单条工具调用轨迹
 *
 * 自定义 arePropsEqual：只比较 toolCall.id 和 toolCall.result，
 * 避免 Zustand set() 产生的数组新引用导致不必要的重渲染。
 */
const areToolCallPropsEqual = (
  prev: { toolCall: AgentToolCallRecord },
  next: { toolCall: AgentToolCallRecord }
): boolean => prev.toolCall.id === next.toolCall.id && prev.toolCall.result === next.toolCall.result

const ToolCallTraceItem = memo(function ToolCallTraceItem({
  toolCall
}: {
  toolCall: AgentToolCallRecord
}): React.JSX.Element {
  const StatusIcon =
    toolCall.confirmation === 'rejected'
      ? XCircle
      : toolCall.result?.status === 'error'
        ? XCircle
        : toolCall.result?.status === 'success'
          ? CheckCircle2
          : Loader2

  const errorMsg = toolCall.result?.status === 'error' ? toolCall.result.error.message : undefined

  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
      <StatusIcon
        className={
          toolCall.confirmation === 'rejected' || toolCall.result?.status === 'error'
            ? 'mt-0.5 size-3.5 shrink-0 text-destructive'
            : toolCall.result?.status === 'success'
              ? 'mt-0.5 size-3.5 shrink-0 text-emerald-500'
              : 'mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground'
        }
      />
      <div className="flex-1 space-y-0.5">
        <div className="font-medium text-foreground">
          {toolCall.toolName}
          {toolCall.mutates && (
            <span className="ml-1.5 rounded-sm bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-600">
              写操作
            </span>
          )}
        </div>
        <div className="truncate text-muted-foreground" title={JSON.stringify(toolCall.input)}>
          {JSON.stringify(toolCall.input)}
        </div>
        {errorMsg && <div className="text-destructive">{errorMsg}</div>}
      </div>
    </div>
  )
}, areToolCallPropsEqual)

/** 单轮"用户指令 → Agent 结果"展示
 *
 * 自定义 arePropsEqual：只比较影响渲染的关键字段（turn.id、streamingText、
 * run.status、run.finalMessage、pending、confirmPendingToolCall 引用），
 * 避免 Zustand set() 新数组引用导致历史 turn 全量重新渲染。
 */
const areTurnPropsEqual = (
  prev: { turn: ConversationTurn; confirmPendingToolCall: (approved: boolean) => void },
  next: { turn: ConversationTurn; confirmPendingToolCall: (approved: boolean) => void }
): boolean =>
  prev.turn.id === next.turn.id &&
  prev.turn.streamingText === next.turn.streamingText &&
  prev.turn.run?.status === next.turn.run?.status &&
  prev.turn.run?.finalMessage === next.turn.run?.finalMessage &&
  prev.turn.pending === next.turn.pending &&
  prev.confirmPendingToolCall === next.confirmPendingToolCall

const ConversationTurnItem = memo(function ConversationTurnItem({
  turn,
  confirmPendingToolCall
}: {
  turn: ConversationTurn
  confirmPendingToolCall: (approved: boolean) => void
}): React.JSX.Element {
  const { run, pending, dispatchError, streamingText } = turn

  return (
    <div className="space-y-2">
      {/* 用户指令 */}
      <div className="ml-auto max-w-[80%] rounded-xl bg-primary px-3.5 py-2 text-sm text-primary-foreground">
        {turn.instruction}
      </div>

      {/* Agent 响应 */}
      <div className="max-w-[90%] space-y-2 text-sm">
        {pending && !streamingText && !run && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            正在处理…
          </div>
        )}

        {dispatchError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {dispatchError}
          </div>
        )}

        {run && run.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {run.toolCalls.map((tc) => (
              <ToolCallTraceItem key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* 流式文本（实时逐 token 渲染） */}
        {streamingText && (
          <div className="rounded-xl bg-muted px-3.5 py-2.5">
            <MemoizedMarkdown
              content={streamingText}
              isStreaming
              key={streamingMarkdownKey(streamingText)}
            />
          </div>
        )}

        {/* 完整结果（Markdown 渲染） */}
        {!streamingText && run?.status === 'completed' && run.finalMessage && (
          <div className="rounded-xl bg-muted px-3.5 py-2.5">
            <MemoizedMarkdown
              content={run.finalMessage}
              key={completedMarkdownKey(run.finalMessage)}
            />
          </div>
        )}

        {run?.status === 'failed' && run.error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {ERROR_CODE_TEXT[run.error.code]}
          </div>
        )}

        {run?.status === 'paused_for_confirmation' && run.pendingConfirmation && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="size-4 shrink-0" />
              {run.pendingConfirmation.summary}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={pending} onClick={() => confirmPendingToolCall(true)}>
                确认执行
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => confirmPendingToolCall(false)}
              >
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}, areTurnPropsEqual)

export default function ConversationView(): React.JSX.Element {
  const references = useConversationStore((s) => s.references)
  const removeReference = useConversationStore((s) => s.removeReference)
  const turns = useConversationStore((s) => s.turns)
  const sendInstructionStream = useConversationStore((s) => s.sendInstructionStream)
  const confirmPendingToolCall = useConversationStore((s) => s.confirmPendingToolCall)
  const loadConversationList = useConversationStore((s) => s.loadConversationList)
  const selectConversation = useConversationStore((s) => s.selectConversation)
  const createConversation = useConversationStore((s) => s.createConversation)

  const [input, setInput] = useState('')
  const isBusy = turns.length > 0 && turns[turns.length - 1].pending

  // 滚动容器 ref
  const scrollRef = useRef<HTMLDivElement>(null)
  // 是否自动跟随滚动到底部
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const prevTurnsLength = useRef(turns.length)

  // 挂载时加载对话列表
  useEffect(() => {
    void (async () => {
      await loadConversationList()
      const state = useConversationStore.getState()
      if (state.conversations.length > 0) {
        await selectConversation(state.conversations[0].id)
      } else {
        await createConversation()
      }
    })()
  }, [loadConversationList, selectConversation, createConversation])

  // 新消息到达时自动滚到底部
  useEffect(() => {
    if (turns.length > prevTurnsLength.current) {
      setShouldAutoScroll(true)
    }
    prevTurnsLength.current = turns.length
  }, [turns.length])

  // 自动滚动（requestAnimationFrame 节流）
  useEffect(() => {
    if (!shouldAutoScroll || !scrollRef.current) return
    const el = scrollRef.current
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  })

  const handleScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    setShouldAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 100)
  }

  const handleSend = (): void => {
    const instruction = input.trim()
    if (!instruction || isBusy) return
    setInput('')
    void sendInstructionStream(instruction)
  }

  return (
    <div className="flex h-full flex-col">
      {turns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
          {references.length === 0 ? (
            <>
              <h1 className="flex items-center gap-2.5 text-[32px] font-semibold tracking-tight">
                <MessageSquare className="size-8" />
                Code with Nexus Studio
              </h1>
              <p className="text-sm text-muted-foreground">
                在左侧连接树或文件树中右键，选择&ldquo;添加到对话&rdquo;来引用上下文
              </p>
            </>
          ) : (
            <h1 className="flex items-center gap-2.5 text-[32px] font-semibold tracking-tight">
              <MessageSquare className="size-8" />
              Code with Nexus Studio
            </h1>
          )}

          <ConversationInputCard
            input={input}
            setInput={setInput}
            references={references}
            removeReference={removeReference}
            onSend={handleSend}
            disabled={isBusy}
          />
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6" onScroll={handleScroll}>
            <div className="flex flex-col gap-4 [&>*]:[content-visibility:auto] [&>*]:[contain-intrinsic-size:auto_200px]">
              {turns.map((turn) => (
                <ConversationTurnItem
                  key={turn.id}
                  turn={turn}
                  confirmPendingToolCall={confirmPendingToolCall}
                />
              ))}
            </div>
          </div>
          <div className="mx-auto w-full max-w-2xl p-4">
            <ConversationInputCard
              input={input}
              setInput={setInput}
              references={references}
              removeReference={removeReference}
              onSend={handleSend}
              disabled={isBusy}
            />
          </div>
        </>
      )}
    </div>
  )
}

interface ConversationInputCardProps {
  input: string
  setInput: (value: string) => void
  references: ReturnType<typeof useConversationStore.getState>['references']
  removeReference: (id: string) => void
  onSend: () => void
  disabled: boolean
}

/** 输入框卡片：指令输入 + 引用小图标 + 工具栏 */
function ConversationInputCard({
  input,
  setInput,
  references,
  removeReference,
  onSend,
  disabled
}: ConversationInputCardProps): React.JSX.Element {
  return (
    <div className="w-full max-w-2xl">
      <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:shadow-md">
        {/* 引用小图标：嵌入输入框内部 */}
        {references.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            {references.map((ref) => {
              const Icon = REFERENCE_ICON[ref.type]
              return (
                <div
                  key={ref.id}
                  className="flex items-center gap-1 rounded-md border bg-accent/40 px-1.5 py-0.5 text-[12px]"
                >
                  <Icon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-32 truncate text-foreground">{ref.label}</span>
                  <button
                    type="button"
                    onClick={() => removeReference(ref.id)}
                    className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="移除引用"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder="帮你编写 SQL、优化查询、分析数据结构…"
          className="w-full resize-none rounded-t-xl bg-transparent px-4 pt-3.5 text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center justify-between px-3 pb-2.5">
          <div className="flex items-center gap-1">
            <button type="button" title="指令" className={toolBtnClass}>
              <Wand2 className="size-4" />
            </button>
            <button type="button" title="引用" className={toolBtnClass}>
              <AtSign className="size-4" />
            </button>
            <button type="button" title="附件" className={toolBtnClass}>
              <Paperclip className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              选择模型
              <ChevronDown className="size-3.5" />
            </button>
            <button type="button" title="语音输入" className={toolBtnClass}>
              <Mic className="size-4" />
            </button>
            <Button
              size="icon"
              className="size-7 rounded-lg"
              title="发送"
              disabled={disabled || !input.trim()}
              onClick={onSend}
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 环境 / 项目选择行 */}
      <div className="mt-2 flex items-center gap-2 px-1">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Monitor className="size-3.5" />
          本地
          <ChevronDown className="size-3" />
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Folder className="size-3.5" />
          选择项目
          <ChevronDown className="size-3" />
        </button>
      </div>
    </div>
  )
}
