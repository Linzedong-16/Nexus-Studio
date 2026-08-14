# Tasks: Code 模式 Agent 化改造

**Input**: Design documents from `/specs/008-code-mode-agent/`

**Prerequisites**: plan.md（必需）, spec.md（必需，用户故事与优先级）, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 本功能的测试由用户自行实现（spec.md Assumptions），故不生成自动化测试任务；`quickstart.md` 中的手动验证步骤作为各阶段的完成判据任务列出。

**Organization**: 任务按用户故事分组，每个故事在完成 Setup + Foundational 后应可独立实现与验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，且不依赖同阶段内尚未完成的任务）
- **[Story]**: 所属用户故事（US1/US2/US3），Setup/Foundational/Polish 阶段不带该标签

## Path Conventions

沿用 `plan.md` 的 Project Structure：`src/main/`（主进程）、`src/preload/`（桥接）、`src/renderer/src/`（渲染进程），无新增顶层项目。

---

## Phase 1: Setup

**Purpose**: 引入新依赖、准备环境配置占位文件

- [x] T001 在 `package.json` 中新增依赖并执行 `pnpm add openai dotenv zod zod-to-json-schema`（版本按 plan.md：`openai` ^4.x、`dotenv` ^16.x、`zod` ^3.x、`zod-to-json-schema` ^3.x）
- [x] T002 [P] 在仓库根目录创建 `.env.example`，包含 `DEEPSEEK_API_KEY`（留空）、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`DEEPSEEK_MODEL=deepseek-chat`、`AGENT_MAX_ITERATIONS=8`、`AGENT_REQUEST_TIMEOUT_MS=60000` 占位项，并附中文注释说明每项含义
- [x] T003 [P] 编辑根目录 `.gitignore`，新增一行忽略 `.env`（当前缺失，FR-008 要求密钥不得提交版本库）

---

## Phase 2: Foundational（阻塞性前置，US1 与 US2 共同依赖）

**Purpose**: 建立工具定义类型、注册表与全部 11 个标准化工具，这是 ReAct 循环（US1）与独立工具调用入口（US2）共同的基础

**⚠️ CRITICAL**：本阶段完成前不得开始任何用户故事的实现

- [x] T004 [P] 在 `src/renderer/src/types/agent.ts` 中定义渲染进程可见类型：`AgentToolSummary`、`ToolExecutionResult<T>`、`AgentToolCallRecord`、`AgentRunStatus`、`AgentRun`（渲染进程精简版，省略 `history`）、`AgentErrorCode`，字段与 `data-model.md` 保持一致
- [x] T005 在 `src/main/ai/tools/types.ts` 中定义 `ToolDefinition<TInput, TOutput>` 接口（`name`/`description`/`mutates`/`inputSchema`/`execute`）及 `buildInputJsonSchema(schema: z.ZodType)` 辅助函数（基于 `zod-to-json-schema`），供后续所有工具复用
- [x] T006 在 `src/main/ai/tools/registry.ts` 中实现工具注册表：`registerTool(def)`、`list(): AgentToolSummary[]`、`get(name): ToolDefinition`、`invoke(name, input): Promise<ToolExecutionResult<unknown>>`（内部先 `inputSchema.safeParse`，失败返回 `fieldErrors`；`execute` 抛出的异常统一捕获为 `{status:'error'}`，不穿透）（依赖 T005）
- [x] T007 [P] 在 `src/main/ai/tools/schemaTools.ts` 中实现 6 个只读工具：`schema.listDatabases`/`schema.listSchemas`/`schema.listTables`/`schema.listColumns`/`schema.listIndexes`/`schema.getDdl`，均委托 `driverManager` 对应方法（`src/main/db/core/DriverManager.ts`），输入/输出严格对照 `contracts/tool-catalog.md` §一（依赖 T005）
- [x] T008 [P] 在 `src/main/ai/tools/sqlTools.ts` 中实现 5 个 SQL 工具：`sql.validate`/`sql.format`/`sql.explain`/`sql.executeReadOnly`/`sql.executeWrite`；`sql.validate`/`executeReadOnly` 内部使用 `node-sql-parser` 做语句类型判定（非 `SELECT`/`SHOW`/`EXPLAIN` 时拒绝只读执行），`sql.format` 基于 `sql-formatter`；仅 `sql.executeWrite` 标注 `mutates: true`，其余 4 个为 `mutates: false`，输入/输出严格对照 `contracts/tool-catalog.md` §二（依赖 T005）
- [x] T009 在 `src/main/ai/tools/index.ts` 中创建注册表单例，调用 `registerTool` 将 T007/T008 的全部 11 个工具注册进 T006 的 registry，并导出该单例供后续模块使用（依赖 T006、T007、T008）

**Checkpoint**：11 个标准化工具已在主进程内可通过 registry 调用，但尚未对外暴露任何 IPC 通道——US1、US2 均可基于此并行展开

---

## Phase 3: User Story 1 - 通过一句话指令完成一次完整的辅助任务 (Priority: P1) 🎯 MVP

**Goal**: 用户在 Code 模式输入一条自然语言指令，Agent 通过 ReAct 循环自动选择并调用 Foundational 阶段建立的工具，必要时暂停等待用户确认修改类操作，最终返回包含工具调用轨迹与结论的完整回复

**Independent Test**: 参照 `quickstart.md` 第 3-5 节：配置有效 DeepSeek 密钥后，在 Code 模式发起一条需要查询表结构的指令，验证能在一次响应内看到工具调用轨迹与最终结论；发起一条需要执行 DELETE 的指令，验证系统在执行前暂停并等待确认

### Implementation for User Story 1

- [x] T010 [P] [US1] 在 `src/main/ai/config.ts` 中实现 `.env` → `ModelProviderConfig` 的加载与解析（`DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`/`AGENT_MAX_ITERATIONS`/`AGENT_REQUEST_TIMEOUT_MS`，含默认值），并提供 `isProviderConfigured(): boolean` 判定（`apiKey` 为空即未配置）
- [x] T011 [P] [US1] 在 `src/main/ai/provider/IModelProvider.ts` 中定义模型提供方抽象接口：`chat(messages, tools): Promise<ModelResponse>`（`ModelResponse` 含最终文本或工具调用请求两种形态）
- [x] T012 [US1] 在 `src/main/ai/provider/DeepSeekProvider.ts` 中实现 `IModelProvider`：使用 `openai` SDK、`baseURL` 指向 DeepSeek，携带 T009 registry 派生的工具 JSON Schema 作为 `tools` 参数；按 `requestTimeoutMs` 设置超时；将 401/403 → `provider_auth_failed`、429 → `provider_rate_limited`、超时 → `provider_timeout`、其他网络错误 → `provider_unavailable` 映射为结构化错误（research.md §7）（依赖 T010、T011）
- [x] T013 [P] [US1] 在 `src/main/ai/loop/AgentRun.ts` 中实现 `AgentRun` 状态机（`running`/`paused_for_confirmation`/`completed`/`failed` 及其转移规则，见 `data-model.md` §4），提供创建、暂停、恢复、完成、失败的纯函数式状态转换方法
- [x] T014 [US1] 在 `src/main/ai/loop/reactLoop.ts` 中实现 ReAct 循环主体：解析指令 → 调用 `DeepSeekProvider.chat` → 若返回工具调用请求，查 registry 的 `mutates` 标志，`mutates=true` 时将 `AgentRun` 置为 `paused_for_confirmation` 并中断本轮（等待外部恢复），`mutates=false` 时直接 `registry.invoke` 并将结果（含失败原因，FR-011）追加进下一轮上下文 → 若返回最终文本则置 `completed` → 达到 `maxIterations` 仍未完成则置 `failed`（`error.code='max_iterations_exceeded'`）；未配置密钥时在第一次思考前直接返回 `failed`（`provider_not_configured'`）（依赖 T009、T012、T013）
- [x] T015 [US1] 在 `src/main/ai/index.ts` 中导出 T010-T014 的主进程内部入口（`config`/`provider`/`loop` 的统一出口），供 `src/main/ipc/agent.ts` 引用（依赖 T014）
- [x] T016 [US1] 创建 `src/main/ipc/agent.ts`，参照 `src/main/ipc/utils.ts` 的 `createIPCHandler` 模式注册 `agent:chat`（输入 `AgentChatRequest`，内部用内存 `Map<runId, AgentRun>` 保存运行状态并驱动 `reactLoop`）与 `agent:confirm-tool-call`（`(runId, approved)` → 恢复对应 `AgentRun` 并继续循环；`runId` 不存在时 throw）两个通道，均返回 `contracts/ipc-contract.md` 定义的 `AgentRun` 快照（依赖 T015）
- [x] T017 [US1] 编辑 `src/main/ipc/index.ts`，新增 `import { registerAgentIPC } from './agent'` 并在 `registerAllIPC` 中调用 `registerAgentIPC(mainWindow)`（依赖 T016）
- [x] T018 [US1] 编辑 `src/main/index.ts`，在文件顶部（`app.whenReady()` 之前）调用 `dotenv.config()` 加载 `.env` 到 `process.env`（区分开发态项目根目录与打包态 `app.isPackaged` 场景的 `.env` 路径，见 research.md §3）（依赖 T010）
- [x] T019 [US1] 编辑 `src/preload/index.d.ts` 与 `src/preload/index.ts`，新增 `agent` 命名空间，包含 `chat: createInvoke<[AgentChatRequest], AgentRun>('agent:chat')` 与 `confirmToolCall: createInvoke<[string, boolean], AgentRun>('agent:confirm-tool-call')`（依赖 T016）
- [x] T020 [US1] 创建 `src/renderer/src/services/agentService.ts`，参照 `src/renderer/src/services/queryService.ts` 的服务层模式，封装 `chat(instruction, connectionId, database)` 与 `confirmToolCall(runId, approved)`，是渲染进程中唯一调用 `window.api.agent.*` 的位置（依赖 T019、T004）
- [x] T021 [US1] 编辑 `src/renderer/src/store/conversationStore.ts`，新增消息列表、当前 `AgentRun` 快照、`sendInstruction()`/`confirmPendingToolCall(approved)` 方法，内部调用 T020 的 `agentService`，并从 `connectionStore` 读取 `activeConnectionId`/当前数据库作为 `agent:chat` 请求参数
- [x] T022 [US1] 编辑 `src/renderer/src/components/code/ConversationView.tsx`，接入 T021 的 store：渲染最终回复、工具调用轨迹（FR-010，逐条展示工具名/参数/状态）、`paused_for_confirmation` 时展示确认弹窗（`pendingConfirmation.summary` + 确认/拒绝按钮）、`failed` 时按 `contracts/ipc-contract.md` 的错误码对照表展示中文提示

**Checkpoint**：User Story 1 应可独立运行与验证——配置好密钥后，从输入指令到看到最终结果（含确认流程）全流程可用

---

## Phase 4: User Story 2 - 开发者独立验证单个工具的行为 (Priority: P2)

**Goal**: 开发者/测试人员无需经过对话界面，直接调用任意已封装工具并核对输出是否符合规范

**Independent Test**: 参照 `quickstart.md` 第 6 节：通过 `window.api.agent.runTool(name, input)` 分别用合法与非法参数调用 `schema.listColumns`，验证成功返回数据结构与失败返回的逐字段错误信息

### Implementation for User Story 2

- [x] T023 [US2] 编辑 `src/main/ipc/agent.ts`（T016 已创建），新增 `agent:list-tools`（返回 T009 registry 的 `list()`）与 `agent:run-tool`（`(toolName, input)` → 直接 `registry.invoke`，不触发确认流程，见 `contracts/ipc-contract.md`）两个通道
- [x] T024 [US2] 编辑 `src/preload/index.d.ts` 与 `src/preload/index.ts`，在 `agent` 命名空间下新增 `listTools: createInvoke<[], AgentToolSummary[]>('agent:list-tools')` 与 `runTool: createInvoke<[string, unknown], ToolExecutionResult<unknown>>('agent:run-tool')`
- [x] T025 [US2] 编辑 `src/renderer/src/services/agentService.ts`（T020 已创建），新增 `listTools()` 与 `runTool(toolName, input)` 方法
- [x] T026 [P] [US2] 创建 `docs/agent-tools.md`：面向"用户自行编写测试"的说明文档，指导如何在渲染进程 DevTools 控制台调用 `window.api.agent.runTool`，并链接到 `specs/008-code-mode-agent/contracts/tool-catalog.md`（完整工具规范）与 `contracts/ipc-contract.md`（通道契约）

**Checkpoint**：User Story 2 应可独立验证——即使 DeepSeek 密钥未配置，也能通过 `agent:list-tools`/`agent:run-tool` 完整测试全部 11 个工具

---

## Phase 5: User Story 3 - 通过配置文件启用真实的 DeepSeek 推理能力 (Priority: P3)

**Goal**: 未配置密钥时给出清晰的"未配置"提示；填入有效密钥后无需改代码即可切换为真实推理；密钥无效时给出明确的认证失败提示而非原始异常

**Independent Test**: 参照 `quickstart.md` 第 3 节与本节验证：分别在"未配置密钥"“有效密钥”“无效密钥”三种 `.env` 状态下发起对话，核对三种状态下的用户可见提示均符合 `contracts/ipc-contract.md` 的错误码对照表

### Implementation for User Story 3

- [x] T027 [US3] 复核并补全 `src/main/ai/config.ts`（T010）与 `src/main/ai/provider/DeepSeekProvider.ts`（T012）的错误映射，确保 `provider_not_configured`/`provider_auth_failed`/`provider_rate_limited`/`provider_timeout`/`provider_unavailable` 五种状态均能被 `reactLoop.ts` 正确捕获并写入 `AgentRun.error.code`，不出现未分类的裸异常堆栈传给渲染进程
- [x] T028 [US3] 核对 `src/renderer/src/components/code/ConversationView.tsx`（T022）中的错误提示渲染，确保五种 `AgentErrorCode` 均能映射到 `contracts/ipc-contract.md` 表格中的对应中文文案，而不是笼统的"请求失败"
- [ ] T029 [P] [US3] 按 `quickstart.md` 第 3 节手动执行验证：分别清空 `DEEPSEEK_API_KEY`、填入错误密钥、填入有效密钥三种状态重启应用并发起对话，记录三次响应的 `AgentRun.status`/`error.code`/界面文案是否与预期一致

**Checkpoint**：三条用户故事均可独立运行与验证

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事的收尾工作

- [x] T030 [P] 为 `src/main/ai/**` 下所有导出函数补全中文 JSDoc（含 `@param`/`@returns`/`@throws`，工具函数额外补充 `@example`），满足宪法 VII
- [x] T031 [P] 更新 `doc/01-技术架构方案.md` 中 Phase 4 AI 集成一节，将预留的 `IAIProvider`/`OpenAIProvider` 等占位描述与本次实际落地的 `IModelProvider`/`DeepSeekProvider`/工具注册表结构对齐，避免文档与代码脱节
- [ ] T032 完整执行 `specs/008-code-mode-agent/quickstart.md` 全部 7 节验证步骤，确认三条用户故事与全部边界情形均按预期工作
- [x] T033 清理开发过程中残留的调试代码（如临时 `console.log`），确认 `src/main/ai/`、`src/main/ipc/agent.ts`、`src/renderer/src/services/agentService.ts` 无遗留调试输出

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，可立即开始
- **Foundational (Phase 2)**：依赖 Setup 完成；阻塞全部用户故事
- **User Story 1 (Phase 3)**：依赖 Foundational 完成；不依赖 US2/US3
- **User Story 2 (Phase 4)**：依赖 Foundational 完成；T023/T024/T025 分别是对 US1 已创建文件（`agent.ts`/`index.ts`/`agentService.ts`）的追加编辑，需在对应 US1 任务（T016/T019/T020）之后进行，但不依赖 US1 的业务逻辑（ReAct 循环）本身
- **User Story 3 (Phase 5)**：依赖 US1 的 T010/T012/T022 已存在（在其基础上补全错误映射与文案），故实质上在 US1 之后执行
- **Polish (Phase 6)**：依赖所有目标用户故事完成

### Parallel Opportunities

- Setup: T002、T003 可并行
- Foundational: T004 可与 T005 并行；T007、T008 在 T005 完成后可并行
- US1: T010、T011、T013 互相独立，可并行；T012 需等待 T010+T011
- US2: T026（文档）可与 T023-T025（代码）并行编写
- Polish: T030、T031 可并行

---

## Parallel Example: Foundational

```bash
# T005 完成后：
Task: "在 src/main/ai/tools/schemaTools.ts 中实现 6 个只读 Schema 工具"
Task: "在 src/main/ai/tools/sqlTools.ts 中实现 5 个 SQL 工具"
```

## Parallel Example: User Story 1

```bash
# Foundational 完成后立即可并行：
Task: "在 src/main/ai/config.ts 中实现 .env → ModelProviderConfig 加载"
Task: "在 src/main/ai/provider/IModelProvider.ts 中定义模型提供方抽象接口"
Task: "在 src/main/ai/loop/AgentRun.ts 中实现 AgentRun 状态机"
```

---

## Implementation Strategy

### MVP First（User Story 1）

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键阻塞阶段）
3. 完成 Phase 3: User Story 1
4. **停下并验证**：按 `quickstart.md` 第 3-5 节独立验证 US1
5. 此时已具备可演示的最小可用版本（前提：`.env` 中已填入有效 DeepSeek 密钥）

### Incremental Delivery

1. Setup + Foundational → 基础就绪（11 个工具可调用，尚无对外入口）
2. - User Story 1 → 完整对话体验可用 → 验证/演示（MVP）
3. - User Story 2 → 独立工具测试入口可用 → 验证/演示
4. - User Story 3 → 三种密钥状态下的提示均清晰 → 验证/演示
5. - Polish → 文档与代码收尾

---

## Notes

- [P] 任务 = 不同文件且不依赖同阶段内未完成任务
- [Story] 标签用于追溯任务归属的用户故事
- 本功能未引入自动化测试框架（spec.md Assumptions 明确"测试由用户自行实现"），验证步骤以 `quickstart.md` 手动场景为准
- `src/main/ipc/agent.ts`、`src/preload/index.ts`、`src/renderer/src/services/agentService.ts` 会被 US1 与 US2 先后追加编辑，属于预期内的共享文件演进，不破坏各自的独立可测试性
- 避免：模糊任务描述、同一文件的并行冲突编辑、破坏故事独立性的跨故事强依赖
