import { useState, useEffect, useLayoutEffect, useRef, memo } from 'react'
import {
  X,
  MessageSquare,
  AtSign,
  Mic,
  Paperclip,
  Wand2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useConversationStore } from '@/store/conversationStore'
import type { ConversationTurn } from '@/store/conversationStore'
import { useUserStore } from '@/store/userStore'
import { useAvatarSrc } from '@/hooks/useAvatarSrc'
import type { ReferenceType } from '@/types/conversation'
import type { AgentErrorCode, AgentToolCallRecord } from '@/types/agent'
import { DEEPSEEK_MODEL_OPTIONS } from '@/types/agent'
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
  provider_not_configured: '尚未配置 DeepSeek API 密钥，请前往设置面板「模型配置」页填写后重试',
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

/** 通用可折叠灰色面板：用于容纳过程性/轨迹类内容（目前是工具调用轨迹，
 * 未来若接入模型思考过程等同类内容，可复用同一套折叠展示）。
 *
 * 展开状态：未手动交互前跟随 defaultOpen（通常与"是否仍在执行"绑定，执行中
 * 自动展开、结束后自动收起）；用户手动点击过一次后，该轮内固定使用手动状态，
 * 不再被 defaultOpen 覆盖。
 */
function CollapsibleTracePanel({
  defaultOpen,
  summary,
  children
}: {
  defaultOpen: boolean
  summary: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const isOpen = manualOpen ?? defaultOpen

  return (
    <div className="rounded-md border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setManualOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`}
        />
        <div className="flex-1">{summary}</div>
      </button>
      {isOpen && <div className="animate-in space-y-1.5 border-t p-2 fade-in-0">{children}</div>}
    </div>
  )
}

interface ToolCallsSummary {
  /** 是否仍有工具调用在执行中（未产生结果且未被拒绝） */
  isRunning: boolean
  node: React.ReactElement
}

/** 汇总工具调用列表的状态，用于折叠面板收起时的一行摘要展示 */
function summarizeToolCalls(toolCalls: AgentToolCallRecord[]): ToolCallsSummary {
  const total = toolCalls.length
  const runningCount = toolCalls.filter((tc) => !tc.result && tc.confirmation !== 'rejected').length
  const hasError = toolCalls.some(
    (tc) => tc.confirmation === 'rejected' || tc.result?.status === 'error'
  )

  if (runningCount > 0) {
    return {
      isRunning: true,
      node: (
        <span className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          正在执行工具调用…（{total - runningCount}/{total}）
        </span>
      )
    }
  }

  if (hasError) {
    return {
      isRunning: false,
      node: (
        <span className="flex items-center gap-1.5 text-destructive">
          <XCircle className="size-3.5 shrink-0" />
          已执行 {total} 个工具调用，其中存在失败
        </span>
      )
    }
  }

  return {
    isRunning: false,
    node: (
      <span className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        已执行 {total} 个工具调用
      </span>
    )
  }
}

/** 工具调用轨迹折叠面板：收起时展示一行摘要，展开时渲染完整轨迹列表 */
function ToolCallsPanel({ toolCalls }: { toolCalls: AgentToolCallRecord[] }): React.JSX.Element {
  const { isRunning, node } = summarizeToolCalls(toolCalls)
  return (
    <CollapsibleTracePanel defaultOpen={isRunning} summary={node}>
      {toolCalls.map((tc) => (
        <ToolCallTraceItem key={tc.id} toolCall={tc} />
      ))}
    </CollapsibleTracePanel>
  )
}

/** 单轮"用户指令 → Agent 结果"展示
 *
 * 自定义 arePropsEqual：只比较影响渲染的关键字段（turn.id、streamingText、
 * run.status、run.finalMessage、pending、confirmPendingToolCall 引用、
 * avatarSrc、displayName），避免 Zustand set() 新数组引用导致历史 turn 全量重新渲染。
 */
const areTurnPropsEqual = (
  prev: {
    turn: ConversationTurn
    confirmPendingToolCall: (approved: boolean) => void
    avatarSrc: string | null
    displayName: string
  },
  next: {
    turn: ConversationTurn
    confirmPendingToolCall: (approved: boolean) => void
    avatarSrc: string | null
    displayName: string
  }
): boolean =>
  prev.turn.id === next.turn.id &&
  prev.turn.streamingText === next.turn.streamingText &&
  prev.turn.run?.status === next.turn.run?.status &&
  prev.turn.run?.finalMessage === next.turn.run?.finalMessage &&
  prev.turn.pending === next.turn.pending &&
  prev.confirmPendingToolCall === next.confirmPendingToolCall &&
  prev.avatarSrc === next.avatarSrc &&
  prev.displayName === next.displayName

const ConversationTurnItem = memo(function ConversationTurnItem({
  turn,
  confirmPendingToolCall,
  avatarSrc,
  displayName
}: {
  turn: ConversationTurn
  confirmPendingToolCall: (approved: boolean) => void
  avatarSrc: string | null
  displayName: string
}): React.JSX.Element {
  const { run, pending, dispatchError, streamingText } = turn

  return (
    <div className="space-y-2">
      {/* 用户指令：发送时携带的引用快照（只读，不可移除）+ 指令文本 + 头像标记，
          用头像与 Agent 响应区分开发送方 */}
      <div className="flex items-start justify-end gap-2">
        <div className="flex max-w-[80%] flex-col items-end gap-1.5">
          {turn.references.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {turn.references.map((ref) => {
                const Icon = REFERENCE_ICON[ref.type]
                return (
                  <div
                    key={ref.id}
                    className="flex items-center gap-1 rounded-md border bg-accent/40 px-1.5 py-0.5 text-[12px]"
                  >
                    <Icon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="max-w-32 truncate text-foreground">{ref.label}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="rounded-xl bg-primary px-3.5 py-2 text-sm text-primary-foreground">
            {turn.instruction}
          </div>
        </div>
        <Avatar className="size-7 shrink-0">
          {avatarSrc && <AvatarImage src={avatarSrc} alt={displayName} />}
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {displayName[0]}
          </AvatarFallback>
        </Avatar>
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

        {run && run.toolCalls.length > 0 && <ToolCallsPanel toolCalls={run.toolCalls} />}

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
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const sendInstructionStream = useConversationStore((s) => s.sendInstructionStream)
  const confirmPendingToolCall = useConversationStore((s) => s.confirmPendingToolCall)
  const loadConversationList = useConversationStore((s) => s.loadConversationList)
  const selectConversation = useConversationStore((s) => s.selectConversation)
  const createConversation = useConversationStore((s) => s.createConversation)
  const selectedModel = useConversationStore((s) => s.selectedModel)
  const setSelectedModel = useConversationStore((s) => s.setSelectedModel)
  const displayName = useUserStore((s) => s.displayName)
  const avatarSrc = useAvatarSrc()

  const [input, setInput] = useState('')
  const isBusy = turns.length > 0 && turns[turns.length - 1].pending

  // 滚动容器 ref
  const scrollRef = useRef<HTMLDivElement>(null)
  // 是否自动跟随滚动到底部（同时决定"回到底部"悬浮按钮的显隐）
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const prevTurnsLength = useRef(turns.length)
  // 标记刚切换/加载了一个对话，下次内容落地时需强制跳到底部（忽略"是否已接近底部"的判断）
  const justSwitchedRef = useRef(true)

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

  // 切换对话（含首次加载）时，标记下一次内容落地需强制跳底，不受历史滚动位置影响
  useLayoutEffect(() => {
    justSwitchedRef.current = true
    // 切换对话时必须立即重置为可自动滚动，避免沿用上一个对话的滚动状态；标准场景
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShouldAutoScroll(true)
  }, [activeConversationId])

  // 新消息到达时自动滚到底部
  useEffect(() => {
    if (turns.length > prevTurnsLength.current) {
      setShouldAutoScroll(true)
    }
    prevTurnsLength.current = turns.length
  }, [turns.length])

  // 自动滚动（requestAnimationFrame 节流）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // 切换对话后的第一次有内容渲染：直接跳底，不做"是否接近底部"的判断。
    // 历史消息容器用了 content-visibility: auto 做渲染性能优化（见下方渲染部分），
    // 屏幕外的轮次此时高度只是 contain-intrinsic-size 占位值，跳底后原本在
    // 占位区域、现在进入可视范围的轮次才会逐步替换成真实高度，导致 scrollHeight
    // 持续增长——只赋值一次 scrollTop 会"够不到"真正的底部。这里用 ResizeObserver
    // 持续监听内容容器的高度变化并反复贴底，直到一段时间内高度不再变化（渐进渲染
    // 收敛）才解除强制跳底标记，交还给下面的常规自动滚动逻辑。
    if (justSwitchedRef.current) {
      if (turns.length === 0) return undefined // 历史消息尚未加载完成，等下一次渲染再判断
      const inner = el.firstElementChild
      if (!inner) {
        justSwitchedRef.current = false
        return undefined
      }

      el.scrollTop = el.scrollHeight
      let settleTimer: ReturnType<typeof setTimeout>
      const observer = new ResizeObserver(() => {
        el.scrollTop = el.scrollHeight
        clearTimeout(settleTimer)
        settleTimer = setTimeout(() => {
          justSwitchedRef.current = false
          observer.disconnect()
        }, 300)
      })
      observer.observe(inner)
      settleTimer = setTimeout(() => {
        justSwitchedRef.current = false
        observer.disconnect()
      }, 300)

      return () => {
        observer.disconnect()
        clearTimeout(settleTimer)
      }
    }

    if (!shouldAutoScroll) return undefined
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
    return undefined
  })

  const handleScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    setShouldAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 100)
  }

  // "回到底部"悬浮按钮：丝滑（平滑）滚动到最新一条对话结果
  const handleScrollToBottomClick = (): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShouldAutoScroll(true)
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
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
          />
        </div>
      ) : (
        <>
          <div className="relative flex-1 overflow-hidden">
            <div ref={scrollRef} className="h-full overflow-y-auto p-6" onScroll={handleScroll}>
              <div className="flex flex-col gap-4 [&>*]:[content-visibility:auto] [&>*]:[contain-intrinsic-size:auto_200px]">
                {turns.map((turn) => (
                  <ConversationTurnItem
                    key={turn.id}
                    turn={turn}
                    confirmPendingToolCall={confirmPendingToolCall}
                    avatarSrc={avatarSrc}
                    displayName={displayName}
                  />
                ))}
              </div>
            </div>
            {!shouldAutoScroll && (
              <button
                type="button"
                onClick={handleScrollToBottomClick}
                title="回到底部"
                className="absolute bottom-4 right-6 flex size-9 animate-in items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md fade-in-0 slide-in-from-bottom-2 duration-200 transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowDown className="size-4" />
              </button>
            )}
          </div>
          <div className="mx-auto w-full max-w-2xl p-4">
            <ConversationInputCard
              input={input}
              setInput={setInput}
              references={references}
              removeReference={removeReference}
              onSend={handleSend}
              disabled={isBusy}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
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
  selectedModel: string
  setSelectedModel: (model: string) => void
}

/** 输入框卡片：指令输入 + 引用小图标 + 工具栏 */
function ConversationInputCard({
  input,
  setInput,
  references,
  removeReference,
  onSend,
  disabled,
  selectedModel,
  setSelectedModel
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
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground">
                {selectedModel}
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {DEEPSEEK_MODEL_OPTIONS.map((m) => (
                  <DropdownMenuItem key={m} onClick={() => setSelectedModel(m)}>
                    {m}
                    {m === selectedModel && <Check className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
