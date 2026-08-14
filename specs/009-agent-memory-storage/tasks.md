# Tasks: AI Agent 多轮对话与本地记忆化存储

**Input**: Design documents from `specs/009-agent-memory-storage/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: 本项目当前未引入自动化测试框架，测试由用户通过 `quickstart.md` 手动验证。

**Organization**: 任务按用户故事分组，支持独立实现和独立测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（操作不同文件，无依赖关系）
- **[Story]**: 所属用户故事（US1, US2, US3）
- 每个任务描述包含精确的文件路径

---

## Phase 1: Setup（基础设施）

**Purpose**: 类型定义与存储层搭建——所有用户故事的前置依赖

- [x] T001 [P] 新增 `Conversation` / `ConversationMessage` 类型定义到 `src/renderer/src/types/conversation.ts`（扩展现有文件，新增实体类型，见 data-model.md §1/§2）
- [x] T002 [P] 扩展 `AgentChatRequest` 类型（新增 `conversationId?: string`）在 `src/renderer/src/types/agent.ts`
- [x] T003 创建主进程对话存储服务 `src/main/services/conversationService.ts`：实现 JSONL 消息文件读写（`readMessages`/`appendMessage`）、electron-store 索引管理（`loadIndex`/`saveIndex`/`rebuildIndex`），参考 research.md §1 混合存储方案
- [x] T004 注册 `conversation:*` IPC 通道（`list`/`get`/`create`/`delete`/`archive`/`get-active-run`）在 `src/main/ipc/conversation.ts`，参考 contracts/ipc-conversation.md
- [x] T005 在 `src/main/ipc/index.ts` 中注册 `conversation:*` handler（调用 `registerConversationIPC()`）
- [x] T006 扩展预加载脚本 `src/preload/index.ts`：新增 `conversation.*` API 封装（`list`/`get`/`create`/`delete`/`archive`/`getActiveRun`）
- [x] T007 扩展预加载类型声明 `src/preload/index.d.ts`：新增 `ConversationApi` 接口及 `Api.conversation` 字段

**Checkpoint**: 类型定义、存储层、IPC 通道就绪——可从渲染进程创建/读取/删除对话

---

## Phase 2: Foundational（阻塞性前置）

**Purpose**: Agent 循环扩展 + Store 重写——US1/US2/US3 的共同依赖

**⚠️ CRITICAL**: 任何用户故事实现前必须完成本阶段

- [x] T008 扩展 `AgentRun` 主进程类型 `src/main/ai/loop/AgentRun.ts`：`history` 从预留占位升级为实际使用（`createAgentRun` 接受 `history: AgentMessage[]` 参数）；新增 `conversationId` 字段
- [x] T009 扩展 `startRun` 函数 `src/main/ai/loop/reactLoop.ts`：接受 `historyMessages: ChatMessage[]` 参数，在 system prompt 与当前用户指令之间插入历史上下文；实现 token 估算与上下文裁剪逻辑（见 research.md §3，字符数/2 估算，裁剪至 ~100K tokens 以内）
- [x] T010 扩展 `agent:chat` handler `src/main/ipc/agent.ts`：解析 `conversationId` 参数；有值时从 `conversationService` 加载历史消息并传入 `startRun`；无值时自动创建新对话；每轮完成后调用 `conversationService.appendMessage` 持久化本轮消息 + 更新索引
- [x] T011 扩展 `agent:confirm-tool-call` handler `src/main/ipc/agent.ts`：恢复执行后的结果同样写入对应对话的持久化存储
- [x] T012 [P] 创建渲染进程对话服务层 `src/renderer/src/services/conversationService.ts`：封装 `window.api.conversation.*` 调用（遵循宪法 III：组件不直接调用 window.api）
- [x] T013 重写 `src/renderer/src/store/conversationStore.ts`：从当前单轮 `turns[]` 扩展为多对话管理（`conversations` / `activeConversationId` / `loadConversationList` / `selectConversation` / `createConversation` / `deleteConversation` / `archiveConversation` / `loadMessages` / `checkActiveRun`），接口定义参考 contracts/ui-sidebar-panel.md Store 接口约定
- [x] T014 在 `src/renderer/src/services/index.ts` 中导出 `conversationService`

**Checkpoint**: 基础设施就绪——Agent 循环支持多轮上下文，Store 支持多对话管理，IPC 链路贯通

---

## Phase 3: User Story 1 - 同一对话中连续多轮交互 (Priority: P1) 🎯 MVP

**Goal**: 用户在同一对话中发送多条指令，Agent 能记住前文上下文，无需重复提供数据库连接或表名

**Independent Test**: 在 Code 模式下先查一张表的结构，再追问"刚才那张表的索引呢？"，验证 Agent 正确理解指代

### Implementation for User Story 1

- [x] T015 [US1] 更新 `sendInstruction` 方法 `src/renderer/src/store/conversationStore.ts`：发送指令时自动携带 `activeConversationId`；如果无活跃对话则自动创建新对话；本轮完成后的 `AgentRun` 追加到 `turns[]`
- [x] T016 [US1] 更新 `confirmPendingToolCall` 方法 `src/renderer/src/store/conversationStore.ts`：确认/拒绝操作的 `AgentRun` 更新正确地关联到当前活跃对话
- [x] T017 [US1] 在 `src/renderer/src/services/agentService.ts` 扩展 `chat()` 方法签名：新增 `conversationId?: string` 参数透传至 IPC
- [x] T018 [US1] 在 Code 模式页面 `src/renderer/src/pages/code/CodeHomePage.tsx` 中接入 `conversationStore`：页面挂载时加载对话列表并自动选中最近对话（或创建新对话）；输入框提交后触发多轮流程
- [x] T019 [US1] 实现对话切换中断逻辑：`selectConversation` 时检查当前活跃对话是否有进行中 run；如有则通过 `agent:chat` 的暂停机制（已存在）中断并保存状态；切换后通过 `checkActiveRun` 判断是否需要展示恢复 UI
- [x] T020 [US1] 实现上下文裁剪透明化：当历史消息被裁剪时（`startRun` 内部处理），Agent 正常工作且用户无感知；渲染进程侧始终展示完整历史（不被裁剪的本地存储）

**Checkpoint**: 多轮对话核心功能可独立验证——用户可在同一对话中连续交互 5+ 轮，Agent 正确引用前文

---

## Phase 4: User Story 2 - 重启后恢复对话并继续 (Priority: P2)

**Goal**: 对话列表在左侧面板可见，重启应用后对话不丢失，可选择历史对话继续交互

**Independent Test**: 完成多轮对话后重启应用，验证对话列表显示、消息完整、可继续发送新指令

### Implementation for User Story 2

- [x] T021 [P] [US2] 创建 `src/renderer/src/config/modes.tsx` 中 Code 模式专用菜单构建函数 `buildCodeMenuGroups()`，替换 `buildPlaceholderMenuGroups()`：第 1 组 actions（新建对话）、第 2 组"对话历史"（动态渲染活跃对话列表 + "已归档"子分组），从 `useConversationStore` 获取数据
- [x] T022 [P] [US2] 创建对话列表项组件 `src/renderer/src/components/ai/ConversationItem.tsx`：展示标题（截断 + tooltip）、更新时间、消息计数；支持右键菜单（归档/取消归档、删除）；选中态高亮
- [x] T023 [US2] 创建对话列表组件 `src/renderer/src/components/ai/ConversationList.tsx`：渲染活跃对话项列表 + "已归档"子分组（可折叠）；集成 `conversationStore` 的选择/删除/归档操作
- [x] T024 [US2] 实现空状态引导 `src/renderer/src/components/ai/ConversationList.tsx`：当 `conversations.length === 0` 时展示引导文案"暂无对话记录，开始一段新的对话吧"和"新建对话"按钮
- [x] T025 [US2] 实现对话删除确认：右键删除时弹出确认对话框（复用现有 `TaskCloseConfirmDialog` 或 shadcn/ui `AlertDialog`），确认后调用 `conversationStore.deleteConversation`
- [x] T026 [US2] 在 `src/renderer/src/pages/code/CodeHomePage.tsx` 中接入对话选择逻辑：用户点击侧边栏对话项 → `selectConversation` → 加载消息历史 → 展示在 Code 模式主区域；用户可继续发送新指令
- [x] T027 [US2] 实现应用启动时的对话列表加载：在 `AppShell.tsx` 或 Code 模式页面挂载时调用 `conversationStore.loadConversationList()`

**Checkpoint**: 对话持久化与面板管理可独立验证——重启后对话恢复、面板展示正确、归档/删除生效

---

## Phase 5: User Story 3 - 高性能存储 (Priority: P3)

**Goal**: 大数据量下应用性能不受影响——增量写入、按需加载、崩溃恢复

**Independent Test**: 构造 50 条对话 + 5000 条消息数据，验证启动耗时、滚动流畅度、写入延迟均达标

### Implementation for User Story 3

- [x] T028 [P] [US3] 实现 JSONL 增量追加写入 `src/main/services/conversationService.ts`：`appendMessage` 使用 `fs.promises.appendFile`，每次仅追加一行 JSON，确保 O(1) 开销（FR-010）
- [x] T029 [P] [US3] 实现消息分页加载 `src/main/services/conversationService.ts`：`readMessages` 支持 `offset`/`limit` 参数，按需逐行读取 JSONL（FR-013）；`conversation:get` IPC handler 透传分页参数
- [x] T030 [US3] 实现对话列表快速加载：`conversation:list` 仅读取 electron-store 索引（~10KB），不读取任何 JSONL 消息文件（FR-012）
- [x] T031 [US3] 优化 `src/renderer/src/components/ai/ConversationPanel.tsx`：列表容器使用 CSS `overflow-y: auto` + 硬件加速
- [x] T032 [US3] 实现 AgentRun 中间状态持久化 `src/main/services/conversationService.ts`：`saveActiveRun` / `loadActiveRun` / `clearActiveRun` 方法，将进行中 run 的 `LoopState` 序列化到 electron-store 的 `active-runs` key（FR-015/FR-016）
- [x] T033 [US3] 实现崩溃恢复 `src/main/ipc/agent.ts`：启动时调用 `drainActiveRuns()` 清除上次会话残留的进行中状态（FR-015）
- [x] T034 [US3] 实现存储损坏容错 `src/main/services/conversationService.ts`：`loadIndex` 使用 try-catch，损坏时遍历 `conversations/` 目录下 JSONL 文件重建索引（FR-017）；重建失败时返回空数组，不阻塞应用启动
- [x] T035 [US3] 确保所有文件 I/O 异步化 `src/main/services/conversationService.ts`：所有 `fs` 操作使用 `fs.promises` API，不阻塞主进程事件循环（FR-009）
- [x] T036 [US3] 在 `src/main/ipc/conversation.ts` 中实现 `conversation:get-active-run` handler：检查 runs Map 中是否有对应 conversationId 的进行中 run，返回其快照或 null

**Checkpoint**: 性能与容错机制可独立验证——大数据量场景性能达标，崩溃恢复正常工作

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨用户故事的完善与验证

- [x] T037 [P] 对话标题自动更新：首条消息写入后，`conversationService` 自动从首条用户指令截取前 50 字符更新 `conversation.title`（FR-014）
- [x] T038 [P] 实现对话切换时进行中任务处理：`selectConversation` 中检测当前对话的 run 状态，`running` → 保存部分结果，`paused_for_confirmation` → 保持等待状态（FR-016 已部分在 T019 实现，此处补充边界情况）
- [x] T039 [P] 为所有新增/修改的导出函数添加 JSDoc 中文注释（遵循宪法 VII）：`src/main/services/conversationService.ts`、`src/main/ipc/conversation.ts`、`src/renderer/src/services/conversationService.ts`、`src/renderer/src/store/conversationStore.ts`
- [x] T040 运行 `pnpm run typecheck` 确保零 TypeScript 错误
- [x] T041 运行 `pnpm run lint` 确保零 ESLint 错误
- [x] T042 运行 `pnpm run format` 确保 Prettier 格式一致
- [x] T043 按 `quickstart.md` 执行全部 7 个验证场景（V1-V7），确保功能完整

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖——可立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1 完成——**阻塞所有用户故事**
- **User Stories (Phase 3-5)**: 全部依赖 Phase 2 完成
  - US1 (Phase 3) 和 US2 (Phase 4) 可并行实现（不同文件、独立功能）
  - US3 (Phase 5) 依赖 US1/US2 的基础存储通路就绪后才能进行性能优化
- **Polish (Phase 6)**: 依赖所有用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**: Phase 2 完成后即可开始——不依赖 US2/US3
- **User Story 2 (P2)**: Phase 2 完成后即可开始——核心依赖 `conversationStore`（在 Phase 2 完成），不依赖 US1 完成
- **User Story 3 (P3)**: 建议在 US1/US2 实现后开始——性能优化需要目标代码就绪

### Within Each Phase

- [P] 标记的任务可并行执行（操作不同文件）
- 无 [P] 标记的任务需按序号顺序执行
- US1 和 US2 内部的任务大致按：类型 → Service → Store → 组件 → 集成 的顺序

### Parallel Opportunities

- T001、T002 可并行（不同文件）
- T012 可与其他 Phase 2 任务并行（独立新文件）
- T021、T022 可并行（不同组件文件）
- T028、T029 可并行（同一文件不同方法，但均为新方法无冲突）
- T037、T038、T039 可并行（不同文件）
- **US1 和 US2 整体可并行实现**（不同文件、不同功能维度）

---

## Parallel Example: User Story 1 & 2 并行

```text
# Phase 2 完成后，可同时启动 US1 和 US2：
# Developer A (US1):
Task: "T015 更新 sendInstruction 方法"
Task: "T016 更新 confirmPendingToolCall 方法"
Task: "T017 扩展 agentService.chat() 签名"
Task: "T018 在 CodeHomePage 接入 conversationStore"
Task: "T019 实现对话切换中断逻辑"

# Developer B (US2):
Task: "T021 创建 buildCodeMenuGroups()"
Task: "T022 创建 ConversationItem 组件"
Task: "T023 创建 ConversationList 组件"
Task: "T024 实现空状态引导"
Task: "T025 实现删除确认"
Task: "T026 在 CodeHomePage 接入对话选择逻辑"
```

---

## Implementation Strategy

### MVP First (仅 User Story 1)

1. 完成 Phase 1: Setup（类型 + 存储 + IPC）
2. 完成 Phase 2: Foundational（Agent 循环扩展 + Store 重写）
3. 完成 Phase 3: User Story 1（多轮对话）
4. **STOP and VALIDATE**: 在同一对话中连续发送 5+ 条指令，验证 Agent 跨轮次记忆
5. 可演示/交付 MVP

### Incremental Delivery

1. Setup + Foundational → 基础架构就绪
2. - User Story 1 → 多轮对话可用 → **MVP!**
3. - User Story 2 → 对话持久化 + 面板管理 → 完整功能
4. - User Story 3 → 高性能 + 容错 → 生产就绪
5. - Polish → 质量门禁通过

### 应避免的反模式

- ❌ 在 Phase 1 中就实现完整的对话列表 UI
- ❌ 跳过 Phase 2 的 Store 重写直接修改组件
- ❌ 在 IPC 未完成时就开始渲染进程开发
- ❌ 性能优化（Phase 5）放在基础功能之前

---

## Notes

- [P] = 可并行（不同文件，无顺序依赖）
- [US1]/[US2]/[US3] = 所属用户故事，便于追溯
- 每个 Checkpoint 后可独立验证当前故事
- 每个任务或逻辑组完成后提交（Conventional Commits，中文描述）
- 质量门禁（Phase 6 T040-T042）必须在最终提交前全部通过
- 所有文件路径均为项目根目录的相对路径
