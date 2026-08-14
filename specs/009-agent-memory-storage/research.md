# 技术研究：AI Agent 多轮对话与本地记忆化存储

**创建日期**: 2026-08-14
**关联规格**: [spec.md](./spec.md)

## §1 高性能本地存储方案选型

### Decision: 混合存储方案——electron-store（索引）+ 独立 JSONL 文件（消息正文）

**Rationale**:

- 规格要求 O(1) 增量追加写入。electron-store 本身是全量 JSON 读写，若将所有消息存储在其中，每次新增消息需读写整个 JSON 文件，复杂度为 O(n)。
- 解决方案：将对话元数据索引与消息正文分层存储。
  - **对话索引**（`electron-store`）：仅存储对话元数据（id、标题、时间戳、消息计数、状态），数据量小（100 条对话约 10KB），全量读写开销可忽略。electron-store 提供原子写入和 JSON Schema 验证，在主进程中使用安全可靠。
  - **消息正文**（独立 JSONL 文件）：每条对话对应一个 `conversations/{id}.jsonl` 文件，每行一条消息的 JSON 序列化。新消息通过 `fs.appendFile` 追加一行，O(1) 写入开销。读取时按需逐行解析，支持分页加载。
  - **进行中状态**（`electron-store` 单独 key）：AgentRun 中间状态（FR-015 崩溃恢复）以 key-value 形式存入 electron-store 的独立命名空间，写入频率低。

**Alternatives considered**:

| 方案                     | 优点                       | 缺点                                                 | 结论                              |
| ------------------------ | -------------------------- | ---------------------------------------------------- | --------------------------------- |
| 纯 electron-store        | 项目已有依赖，API 简单     | 全量读写 O(n)，10k+ 消息时性能恶化                   | ❌ 不满足性能要求                 |
| SQLite (better-sqlite3)  | 查询灵活，支持索引，高性能 | 需原生编译模块，增加跨平台打包复杂度；引入新依赖类型 | ❌ 违反依赖最小化原则             |
| LevelDB / abstract-level | 嵌入式 K-V 存储，增量写入  | 额外原生依赖，API 不直观，生态较小                   | ❌ 增加无必要的复杂度             |
| 纯 fs JSONL 文件         | 零依赖，O(1) 追加          | 需自建索引机制和管理逻辑                             | ✅ 与 electron-store 组合使用最佳 |

---

## §2 多轮对话架构

### Decision: 在现有 AgentRun 基础上扩展 Conversation 生命周期，消息历史以 ChatMessage[] 形式传入 ReAct 循环

**Rationale**:

- 008 号功能已在 `AgentRun` 中预留 `history: AgentMessage[]` 字段和 `AgentMessage` 类型（data-model.md §5），0809 号功能需将其从占位字段升级为实际可用的上下文载体。
- 架构变更摘要：
  1. `AgentChatRequest` 新增可选 `conversationId` 字段：主进程据此加载对话历史消息，构建 `ChatMessage[]` 传入 `startRun`
  2. `startRun` 接受 `historyMessages: ChatMessage[]` 参数，在 system prompt 和当前用户指令之间插入历史消息
  3. 每轮完成后：主进程将本轮消息（用户指令 + assistant 回复 + 工具调用结果）追加写入持久化存储
  4. `LoopState.messages` 在每轮结束后保留完整上下文，下一轮从已有 messages 基础上追加
- 上下文窗口管理：见 §3

**Alternatives considered**:

| 方案                      | 优点             | 缺点                                         | 结论                  |
| ------------------------- | ---------------- | -------------------------------------------- | --------------------- |
| 每次重新构建完整上下文    | 实现简单         | 无上下文记忆，每轮都是新对话                 | ❌ 不是多轮对话       |
| 主进程内存保留 + 崩溃丢失 | 性能最优，零 I/O | 不满足 FR-004 持久化要求                     | ❌                    |
| 仅存储"摘要"而非完整历史  | 节省 token       | 丢失细节上下文，Agent 无法引用前文的精确内容 | ❌ 摘要可作为未来优化 |

---

## §3 上下文窗口管理策略

### Decision: 基于 token 估算的滑动窗口裁剪——保留最近 N 条消息，确保总 token 数在模型限制 80% 以内

**Rationale**:

- DeepSeek Chat 模型上下文窗口为 128K tokens。保守策略：将总上下文控制在 ~100K tokens（约 80%）以内。
- Token 估算公式（无 tokenizer 时的近似）：英文 ~3 字符/token，中文 ~1.5 字符/token，工具调用 JSON 返回 ~2 字符/token。综合采用 `字符数 / 2` 的保守估算。
- 裁剪策略：从最早的消息开始丢弃，保留 system prompt + 最近的消息，直到总估算 token 数 < 100K。完整消息历史在本地 JSONL 文件中不受裁剪影响（FR-011）。
- 裁剪在主进程 `startRun` 阶段执行，在将历史消息传入模型之前。

**Alternatives considered**:

| 方案                             | 优点     | 缺点                                          | 结论           |
| -------------------------------- | -------- | --------------------------------------------- | -------------- |
| 精确 tokenizer (tiktoken)        | 精确计数 | 需额外依赖，针对 DeepSeek 的 tokenizer 不公开 | ❌             |
| 固定消息数量裁剪                 | 最简单   | 短消息浪费窗口，长消息 OOM                    | ❌             |
| 递归摘要（长对话→摘要+最近消息） | 保留语义 | 额外 API 调用成本，延迟增加                   | ⏸ 未来优化方向 |

---

## §4 IPC 通道设计

### Decision: 在现有 `agent:*` 通道基础上新增 `conversation:*` 通道族

**Rationale**:

- 遵循宪法 V：`模块:操作` 命名，`conversation:*` 是新模块。
- 现有 `agent:chat` 和 `agent:confirm-tool-call` 保留，扩展其内部逻辑以支持多轮上下文。
- 新增通道：

| 通道                          | 方向                   | 用途                                         |
| ----------------------------- | ---------------------- | -------------------------------------------- |
| `conversation:list`           | renderer→main→renderer | 获取对话索引列表（仅元数据，不含消息正文）   |
| `conversation:get`            | renderer→main→renderer | 获取单条对话的完整消息历史（支持分页参数）   |
| `conversation:create`         | renderer→main→renderer | 创建新对话（无消息）                         |
| `conversation:delete`         | renderer→main→renderer | 删除对话及关联消息文件                       |
| `conversation:archive`        | renderer→main→renderer | 切换对话归档状态                             |
| `conversation:get-active-run` | renderer→main→renderer | 获取对话当前的中断运行状态（切换回来时恢复） |

- `agent:chat` 扩展：`AgentChatRequest` 新增 `conversationId?: string`，有值时加载历史上下文。
- 安全约束：所有 `conversation:*` 的数据存储/读取在主进程中完成（宪法 I）。

---

## §5 UI 组件架构

### Decision: 在 Sidebar 中替换 Code 模式占位菜单，新增对话历史面板组件

**Rationale**:

- 现有 Code 模式使用 `buildPlaceholderMenuGroups()` 展示"任务列表-示例项目"占位内容。
- 替换方案：在 `modes.tsx` 中为 Code 模式构建专用的 `buildCodeMenuGroups()`，复用 `SidebarNav` 组件渲染对话历史列表。
- 交互设计：
  - 对话列表项显示：自动生成标题（截取首条指令前 50 字符）+ 更新时间 + 消息计数
  - 右键菜单：归档/取消归档、删除
  - 点击选中 → 加载对话消息到 Code 模式主区域
  - 顶部"新建对话"按钮（空状态时突出显示）
- 状态管理：`conversationStore.ts` 扩展——从当前的单轮 `turns[]` 扩展为多对话 `conversations[] + activeConversationId + turns[]`

**现有代码影响**:

- `src/renderer/src/config/modes.tsx`：`buildPlaceholderMenuGroups()` → `buildCodeMenuGroups()`
- `src/renderer/src/store/conversationStore.ts`：扩展为多对话管理
- `src/renderer/src/components/layout/SidebarNav.tsx`：无需改动（通用渲染）
- 新增 `src/renderer/src/components/ai/ConversationList.tsx`：对话列表组件
- 新增 `src/renderer/src/components/ai/ConversationItem.tsx`：对话项组件

---

## §6 性能设计要点

| 需求                      | 实现策略                                                     |
| ------------------------- | ------------------------------------------------------------ |
| O(1) 增量写入 (FR-010)    | JSONL 文件 `fs.appendFile`，每次追加一行                     |
| 异步非阻塞 (FR-009)       | 所有文件 I/O 使用 `fs.promises` API，不阻塞事件循环          |
| 对话列表快速加载 (FR-012) | 仅加载索引 store（~10KB），不读取消息文件                    |
| 消息按需加载 (FR-013)     | JSONL 按行流式读取，前端虚拟滚动仅渲染视口内消息             |
| 崩溃恢复 (FR-015)         | AgentRun 中间状态独立 key 存储，启动时检测并恢复             |
| 数据完整性 (FR-017)       | 启动时 try-catch 读取索引 store，损坏时从 JSONL 文件重建索引 |
