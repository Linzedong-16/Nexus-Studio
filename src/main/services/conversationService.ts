/**
 * 对话存储服务（主进程）
 *
 * 采用混合存储方案（research.md §1）：
 * - 对话索引：electron-store（仅元数据，~10KB/100 条对话）
 * - 消息正文：{userData}/conversations/{id}.jsonl（每行一条 JSON，O(1) 增量追加）
 * - 进行中状态：electron-store 独立 key
 *
 * 所有文件 I/O 使用 fs.promises，不阻塞主进程事件循环。
 */
import { app } from 'electron'
import { join } from 'path'
import { access, mkdir, readFile, unlink } from 'fs/promises'
import { appendFile } from 'fs/promises'
import Store from 'electron-store'
import type {
  Conversation,
  ConversationMessage,
  ConversationGetResponse,
  ConversationStatus
} from '../../renderer/src/types/conversation'

// ─── electron-store 索引 ───

interface ConversationIndexStore {
  conversations: Conversation[]
  'active-runs'?: ActiveRunRecord[]
}

/**
 * 对话索引 store（复用 electron-store）
 *
 * 存储路径：{userData}/nexus-studio-conversations.json
 * 与主配置 store（nexus-studio-config.json）分离，避免索引读写干扰主配置。
 */
const indexStore = new Store<ConversationIndexStore>({
  name: 'nexus-studio-conversations',
  defaults: { conversations: [] }
})

// ─── JSONL 文件路径 ───

/** 获取对话消息文件的存储目录 */
function conversationsDir(): string {
  return join(app.getPath('userData'), 'conversations')
}

/** 获取指定对话的消息文件路径 */
function messagesFilePath(conversationId: string): string {
  return join(conversationsDir(), `${conversationId}.jsonl`)
}

// ─── 初始化 ───

/** 确保 conversations 目录存在 */
async function ensureDir(): Promise<void> {
  const dir = conversationsDir()
  try {
    await access(dir)
  } catch {
    await mkdir(dir, { recursive: true })
  }
}

// ─── 索引操作 ───

/**
 * 加载对话索引
 *
 * 损坏时自动从 JSONL 文件重建（FR-017）。
 *
 * @returns 对话元数据列表，按 updatedAt 倒序
 */
export async function loadIndex(): Promise<Conversation[]> {
  try {
    const data = indexStore.store
    return [...data.conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    // 索引损坏 → 重建
    return rebuildIndex()
  }
}

/**
 * 保存对话索引（全量覆写）
 *
 * electron-store 自动原子写入，无需手动 fsync。
 */
function saveIndex(conversations: Conversation[]): void {
  indexStore.set('conversations', conversations)
}

/**
 * 重建对话索引（FR-017）
 *
 * 遍历 conversations/ 目录下所有 JSONL 文件，从首行/末行消息重建元数据。
 * 若目录不存在或为空，返回空数组。
 *
 * @returns 重建后的对话列表
 */
async function rebuildIndex(): Promise<Conversation[]> {
  await ensureDir()
  const fs = await import('fs/promises')
  const dir = conversationsDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const conversations: Conversation[] = []
  const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'))
  for (const file of jsonlFiles) {
    const id = file.replace(/\.jsonl$/, '')
    try {
      const content = await readFile(join(dir, file), 'utf-8')
      if (!content.trim()) {
        // 空文件 → 跳过
        continue
      }
      const lines = content.trim().split('\n')
      const firstMsg: ConversationMessage = JSON.parse(lines[0])
      const lastMsg: ConversationMessage = JSON.parse(lines[lines.length - 1])
      const createdAt = firstMsg.createdAt
      // 标题优先级：首条用户指令 → "新对话" → 文件创建时间
      let title = '新对话'
      for (const line of lines) {
        const msg: ConversationMessage = JSON.parse(line)
        if (msg.role === 'user' && msg.instruction) {
          title = msg.instruction.slice(0, 50)
          break
        }
      }
      conversations.push({
        id,
        title,
        status: 'active',
        createdAt,
        updatedAt: lastMsg.createdAt,
        messageCount: lines.length
      })
    } catch {
      // 文件损坏 → 跳过该对话
      continue
    }
  }
  // 保存重建后的索引
  saveIndex(conversations)
  return conversations.sort((a, b) => b.updatedAt - a.updatedAt)
}

// ─── 消息读写 ───

/**
 * 读取对话消息（支持分页）
 *
 * JSONL 文件按需逐行读取，仅返回请求的分页范围。
 *
 * @param conversationId - 对话 ID
 * @param offset - 消息序号偏移（默认 0）
 * @param limit - 返回条数（默认 50）
 * @returns 分页消息列表 + 总数
 */
export async function readMessages(
  conversationId: string,
  offset: number = 0,
  limit: number = 50
): Promise<{ messages: ConversationMessage[]; total: number }> {
  await ensureDir()
  const filePath = messagesFilePath(conversationId)
  try {
    const content = await readFile(filePath, 'utf-8')
    if (!content.trim()) {
      return { messages: [], total: 0 }
    }
    const allLines = content.trim().split('\n')
    const total = allLines.length
    const sliced = allLines.slice(offset, offset + limit)
    const messages: ConversationMessage[] = sliced.map((line) => JSON.parse(line))
    return { messages, total }
  } catch {
    return { messages: [], total: 0 }
  }
}

/**
 * 追加一条消息到对话 JSONL 文件（O(1) 增量写入，FR-010）
 *
 * 使用 fs.promises.appendFile，每次仅追加一行 JSON。
 *
 * @param conversationId - 对话 ID
 * @param message - 消息对象
 */
export async function appendMessage(
  conversationId: string,
  message: ConversationMessage
): Promise<void> {
  await ensureDir()
  const filePath = messagesFilePath(conversationId)
  const line = JSON.stringify(message) + '\n'
  await appendFile(filePath, line, 'utf-8')
}

/**
 * 删除对话的消息文件
 *
 * @param conversationId - 对话 ID
 */
async function deleteMessagesFile(conversationId: string): Promise<void> {
  const filePath = messagesFilePath(conversationId)
  try {
    await unlink(filePath)
  } catch {
    // 文件不存在 → 无需处理
  }
}

// ─── 对话 CRUD（供 IPC handler 调用） ───

/**
 * 获取对话索引列表
 *
 * @returns 所有对话元数据，按 updatedAt 倒序
 */
export async function listConversations(): Promise<Conversation[]> {
  return loadIndex()
}

/**
 * 获取单条对话的完整消息历史（支持分页）
 *
 * @param conversationId - 对话 ID
 * @param offset - 偏移（默认 0）
 * @param limit - 条数（默认 50）
 * @returns 对话元数据 + 分页消息 + 总数
 */
export async function getConversation(
  conversationId: string,
  offset?: number,
  limit?: number
): Promise<ConversationGetResponse> {
  const conversations = await loadIndex()
  const conversation = conversations.find((c) => c.id === conversationId)
  if (!conversation) {
    throw new Error(`对话不存在: ${conversationId}`)
  }
  const result = await readMessages(conversationId, offset, limit)
  return {
    conversation,
    messages: result.messages,
    total: result.total
  }
}

/**
 * 创建新对话
 *
 * @returns 新对话元数据
 */
export async function createConversation(): Promise<Conversation> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const conversation: Conversation = {
    id,
    title: '新对话',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    messageCount: 0
  }
  const conversations = await loadIndex()
  conversations.unshift(conversation)
  saveIndex(conversations)
  return conversation
}

/**
 * 删除对话（永久移除消息文件 + 索引）
 *
 * @param conversationId - 对话 ID
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const conversations = await loadIndex()
  const filtered = conversations.filter((c) => c.id !== conversationId)
  if (filtered.length === conversations.length) {
    throw new Error(`对话不存在: ${conversationId}`)
  }
  saveIndex(filtered)
  await deleteMessagesFile(conversationId)
}

/**
 * 切换对话归档状态
 *
 * @param conversationId - 对话 ID
 * @returns 更新后的对话元数据
 */
export async function archiveConversation(conversationId: string): Promise<Conversation> {
  const conversations = await loadIndex()
  const conversation = conversations.find((c) => c.id === conversationId)
  if (!conversation) {
    throw new Error(`对话不存在: ${conversationId}`)
  }
  const newStatus: ConversationStatus = conversation.status === 'active' ? 'archived' : 'active'
  conversation.status = newStatus
  saveIndex(conversations)
  return conversation
}

/**
 * 更新对话元数据（标题、时间、消息计数）
 *
 * 每轮新消息后由 agent:chat handler 调用。
 *
 * @param conversationId - 对话 ID
 * @param updates - 要更新的字段
 */
export async function updateConversationMeta(
  conversationId: string,
  updates: { title?: string; messageCount?: number }
): Promise<void> {
  const conversations = await loadIndex()
  const conversation = conversations.find((c) => c.id === conversationId)
  if (!conversation) return
  if (updates.title !== undefined) {
    conversation.title = updates.title
  }
  if (updates.messageCount !== undefined) {
    conversation.messageCount = updates.messageCount
  }
  conversation.updatedAt = Date.now()
  saveIndex(conversations)
}

// ─── 进行中状态（崩溃恢复，FR-015） ───

/** 进行中 AgentRun 的持久化存储 key */
const ACTIVE_RUNS_KEY = 'active-runs'

interface ActiveRunRecord {
  conversationId: string
  runId: string
  /** 序列化时的状态快照 */
  status: string
  updatedAt: number
}

/**
 * 保存进行中的 AgentRun 引用
 *
 * @param conversationId - 关联的对话 ID
 * @param runId - AgentRun ID
 * @param status - 当前状态
 */
export function saveActiveRun(conversationId: string, runId: string, status: string): void {
  const runs = loadActiveRunsRaw()
  runs.set(conversationId, {
    conversationId,
    runId,
    status,
    updatedAt: Date.now()
  })
  indexStore.set(ACTIVE_RUNS_KEY, Array.from(runs.values()))
}

/**
 * 加载指定对话的进行中 AgentRun 引用
 *
 * @param conversationId - 对话 ID
 * @returns 运行记录或 null
 */
export function loadActiveRun(conversationId: string): ActiveRunRecord | null {
  const runs = loadActiveRunsRaw()
  return runs.get(conversationId) ?? null
}

/**
 * 清除指定对话的进行中 AgentRun 引用
 *
 * @param conversationId - 对话 ID
 */
export function clearActiveRun(conversationId: string): void {
  const runs = loadActiveRunsRaw()
  runs.delete(conversationId)
  indexStore.set(ACTIVE_RUNS_KEY, Array.from(runs.values()))
}

/** 从 indexStore 读取原始 active-runs Map */
function loadActiveRunsRaw(): Map<string, ActiveRunRecord> {
  try {
    const arr = indexStore.get(ACTIVE_RUNS_KEY, []) as unknown as ActiveRunRecord[]
    if (!Array.isArray(arr)) return new Map()
    return new Map(arr.map((r) => [r.conversationId, r]))
  } catch {
    return new Map()
  }
}

/**
 * 清除所有进行中的 AgentRun 引用（启动时调用）
 *
 * @returns 残留的运行记录列表（供 IPC handler 恢复或标记失败）
 */
export function drainActiveRuns(): ActiveRunRecord[] {
  try {
    const arr = indexStore.get(ACTIVE_RUNS_KEY, []) as unknown as ActiveRunRecord[]
    if (!Array.isArray(arr)) return []
    indexStore.delete(ACTIVE_RUNS_KEY)
    return arr
  } catch {
    return []
  }
}
