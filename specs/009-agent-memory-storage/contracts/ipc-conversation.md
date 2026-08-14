# IPC Contract: `conversation:*`

遵循宪法 V：通道命名为 `模块:操作`，双向通信使用 `ipcMain.handle` / `ipcRenderer.invoke`。
本文件为本功能新增的对话管理 IPC 通道，与 008 号功能的 `agent:*` 通道族并列。

## 通用约定

- 所有时间戳为毫秒级 Unix 时间（`number`）。
- 所有 ID 为 UUID v4（`crypto.randomUUID()`）。
- 主进程异常以 `Error` 实例 throw，`.message` 跨进程保留。
- 文件 I/O 在主进程执行，渲染进程不接触文件系统（宪法 I）。

---

## `conversation:list`

获取所有对话的元数据列表，不含消息正文。

- **请求参数**: 无
- **返回**: `Conversation[]`（见 data-model.md §3）
  - 按 `updatedAt` 倒序排列
  - 仅包含 `id, title, status, createdAt, updatedAt, messageCount` 字段
- **失败情形**: 索引文件损坏时自动重建，不应 reject（FR-017）

---

## `conversation:get`

获取单条对话的完整消息历史，支持分页。

- **请求参数**: `ConversationGetRequest`
  ```typescript
  {
    conversationId: string
    offset?: number   // 消息序号偏移，默认 0
    limit?: number    // 返回条数，默认 50
  }
  ```
- **返回**: `ConversationGetResponse`
  ```typescript
  {
    conversation: Conversation       // 对话元数据
    messages: ConversationMessage[]  // 消息列表，按 sequence 升序
    total: number                    // 该对话消息总数
  }
  ```
- **失败情形**: `conversationId` 不存在 → throw `Error('对话不存在: {id}')`

---

## `conversation:create`

创建一个新的空对话（无消息）。

- **请求参数**: 无
- **返回**: `Conversation`（初始 `title` 为 `"新对话"`，首条消息后自动更新）
- **失败情形**: 磁盘空间不足 → throw `Error('无法创建对话：磁盘空间不足')`

---

## `conversation:delete`

永久删除对话及其关联消息文件。

- **请求参数**: `{ conversationId: string }`
- **返回**: `void`（操作成功时无返回值）
- **行为**:
  1. 从 electron-store 索引中移除该对话元数据
  2. 删除 `conversations/{conversationId}.jsonl` 文件
  3. 若该对话有进行中的 AgentRun，将其标记为 `failed`（`error.code = 'conversation_deleted'`）并从内存 runs Map 中移除
- **失败情形**: `conversationId` 不存在 → throw `Error('对话不存在: {id}')`

---

## `conversation:archive`

切换对话的归档状态。

- **请求参数**: `{ conversationId: string }`
- **返回**: `Conversation`（更新后的对话元数据，含新状态）
- **行为**: `active` ↔ `archived` 互相切换
- **失败情形**: `conversationId` 不存在 → throw `Error('对话不存在: {id}')`

---

## `conversation:get-active-run`

获取对话当前是否有进行中（running/paused_for_confirmation）的 AgentRun。

- **请求参数**: `{ conversationId: string }`
- **返回**: `AgentRun | null`
  - 有进行中 run → 返回 AgentRun 快照（含 `status`、`pendingConfirmation` 等信息）
  - 无 → 返回 `null`
- **用途**: 用户切回对话时，渲染进程据此判断是否需要展示"恢复执行"或"继续等待确认"的 UI
- **失败情形**: `conversationId` 不存在 → throw `Error('对话不存在: {id}')`

---

## 修改的现有通道

### `agent:chat`（扩展）

**请求参数**扩展为:

```typescript
interface AgentChatRequest {
  instruction: string
  connectionId: string | null
  database: string | null
  conversationId?: string // 新增：不传时自动创建新对话
}
```

**行为变更**:

1. 若 `conversationId` 已传且存在 → 加载该对话的历史消息，构建 `ChatMessage[]` 上下文传入 `startRun()`
2. 若 `conversationId` 未传 → 自动创建新对话（`conversation:create` 内部调用），后续消息写入该新对话
3. 每轮完成后 → 将本轮用户指令和 Agent 回复写入对应对话的 JSONL 文件 + 更新索引
4. 历史上下文裁剪由主进程在 `startRun` 时根据 token 估算自动执行（见 research.md §3）

**返回**: 不变（仍为 `AgentRun`），但渲染进程侧 `AgentRun` 现包含 `conversationId`

### `agent:confirm-tool-call`（不变）

无需变更。但确认/拒绝后的结果同样写入对话存储。

---

## 存储路径约定

所有对话相关文件存储在 Electron `userData` 目录下：

```
{userData}/
├── config.json              # electron-store 主配置（含 conversations 索引 key）
└── conversations/
    ├── {uuid-1}.jsonl       # 对话 1 的消息文件
    ├── {uuid-2}.jsonl       # 对话 2 的消息文件
    └── ...
```

---

## 通用错误提示语（新增场景）

| 场景                 | 面向用户的提示                                       |
| -------------------- | ---------------------------------------------------- |
| 磁盘空间不足         | "存储空间不足，无法保存对话记录，请清理磁盘后重试"   |
| 消息文件损坏         | "对话记录文件损坏，已自动重建索引，部分数据可能丢失" |
| 对话 ID 不存在       | "对话不存在或已被删除"                               |
| 上下文过长（裁剪后） | Agent 正常运行，不通知用户（透明裁剪）               |
