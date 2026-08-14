# IPC Contract: `agent:*`

遵循宪法 V：通道命名为 `模块:操作`，均为需要返回值的调用，统一用 `ipcMain.handle` / `ipcRenderer.invoke`（复用 `src/main/ipc/utils.ts` 的 `createIPCHandler`）；主进程异常以 `Error` 实例 throw，渲染进程在 `agentService.ts` 中统一捕获，`.message` 会跨进程保留。

本文件与 `tool-catalog.md` 共同构成 FR-012（独立测试入口 + 文档）与 SC-003 的交付物。

## `agent:list-tools`

列出全部已注册工具及其面向模型/开发者的展示信息，不需要输入参数。

- **请求参数**：无
- **返回**：`AgentToolSummary[]`
  ```typescript
  interface AgentToolSummary {
    name: string
    description: string
    mutates: boolean
    inputJsonSchema: object // 由 zod-to-json-schema 从 inputSchema 派生
  }
  ```
- **失败情形**：无业务失败路径（纯内存读取），不会 reject。

## `agent:run-tool`

FR-012 要求的"独立于对话界面的调用入口"：绕过 Agent 循环，直接对单个工具发起一次调用。

- **请求参数**：`(toolName: string, input: unknown)`
- **返回**：`ToolExecutionResult<unknown>`（见 data-model.md §2）
- **行为**：
  1. 若 `toolName` 不存在于注册表 → throw `Error('未找到工具: {toolName}')`
  2. 用工具的 `inputSchema.safeParse(input)` 校验；失败 → 返回（不是 throw）`{ status: 'error', error: { message, fieldErrors } }`
  3. 校验通过 → 执行 `execute(input)`，无论 `mutates` 是否为 `true` 均直接执行、不触发确认流程（该入口专供开发者/测试人员绕过对话界面直接验证工具本身，确认流程是面向"Agent 自动决策执行"场景的保护，不是工具本身的固有约束）
- **示例**（开发者独立测试 `schema.listTables`）：
  ```typescript
  const result = await window.api.agent.runTool('schema.listTables', {
    connectionId: 'conn-1',
    database: 'app_db',
    schema: 'public'
  })
  // result.status === 'success' ? result.data : result.error
  ```

## `agent:chat`

发起一次单轮对话（FR-005），触发完整的 ReAct 循环。

- **请求参数**：
  ```typescript
  interface AgentChatRequest {
    instruction: string
    connectionId: string | null // 当前激活的数据库连接（来自 connectionStore.activeConnectionId）
    database: string | null
  }
  ```
- **返回**：`AgentRun`（见 data-model.md §4）中 `status` 为 `completed`、`failed` 或 `paused_for_confirmation` 三者之一的完整快照。
  - `status === 'paused_for_confirmation'`：渲染进程需要展示 `pendingConfirmation.summary`，并调用 `agent:confirm-tool-call` 恢复
  - `status === 'completed'`：渲染进程展示 `finalMessage` 与完整 `toolCalls` 轨迹
  - `status === 'failed'`：渲染进程根据 `error.code` 展示对应的中文状态提示（见 quickstart.md 的错误提示对照表）
- **前置条件缺失**（Edge Case：未选择数据库连接）：若指令的执行依赖数据库上下文但 `connectionId`/`database` 为 `null`，Agent 在思考阶段会将其作为"缺少必要信息"处理，直接以 `status: 'completed'` 返回、在 `finalMessage` 中说明需要先选择连接，不算作错误路径。

## `agent:confirm-tool-call`

恢复处于 `paused_for_confirmation` 状态的 `AgentRun`（research.md §8）。

- **请求参数**：`(runId: string, approved: boolean)`
- **返回**：与 `agent:chat` 相同的 `AgentRun` 快照类型（循环从暂停点继续，可能再次进入 `paused_for_confirmation`，也可能直接 `completed`/`failed`）
- **失败情形**：若 `runId` 不存在（例如已完成或应用重启后状态已丢失）→ throw `Error('未找到进行中的运行: {runId}')`

## 通用错误提示语（`AgentErrorCode` → 中文文案）

| `error.code`              | 面向用户的提示                                                             |
| ------------------------- | -------------------------------------------------------------------------- |
| `provider_not_configured` | "尚未配置 DeepSeek API 密钥，请在 .env 中填入 DEEPSEEK_API_KEY 后重启应用" |
| `provider_auth_failed`    | "DeepSeek 密钥校验失败，请检查密钥是否正确或已过期"                        |
| `provider_rate_limited`   | "DeepSeek 服务当前限流，请稍后重试"                                        |
| `provider_timeout`        | "DeepSeek 服务响应超时，请稍后重试"                                        |
| `provider_unavailable`    | "DeepSeek 服务暂时不可用，请稍后重试"                                      |
| `max_iterations_exceeded` | "未能在限定步数内完成任务，已在结果中列出目前收集到的信息"                 |
