# Quickstart: Code 模式 Agent 化改造

本指南用于端到端验证本功能是否按预期工作，覆盖 FR-012 要求的"独立测试入口"的使用方式。不包含实现代码，具体实现见 `tasks.md`（由 `/speckit-tasks` 生成）。

## 1. 配置 DeepSeek 密钥

1. 复制 `.env.example` 为 `.env`（项目根目录）：
   ```bash
   cp .env.example .env
   ```
2. 编辑 `.env`，填入：
   ```ini
   DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
   # 以下均为可选，未设置时使用默认值
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   DEEPSEEK_MODEL=deepseek-chat
   AGENT_MAX_ITERATIONS=8
   AGENT_REQUEST_TIMEOUT_MS=60000
   ```
3. 确认 `.env` 不会被提交：`git status` 中不应出现 `.env`（`.gitignore` 已忽略）。

## 2. 启动应用

```bash
pnpm install
pnpm dev
```

## 3. 验证 User Story 3（未配置密钥的降级提示）

1. 暂时清空或注释 `.env` 中的 `DEEPSEEK_API_KEY`，重启 `pnpm dev`。
2. 打开 Code 模式，选择任意已连接的数据库，输入任意指令（如"帮我查看这张表的结构"）并发送。
3. **预期结果**：响应中 `AgentRun.status === 'failed'`，`error.code === 'provider_not_configured'`，界面展示"尚未配置 DeepSeek API 密钥…"提示（见 contracts/ipc-contract.md 的错误提示对照表），而不是无响应或崩溃。

## 4. 验证 User Story 1（一句话指令完成一次完整任务）

1. 恢复 `.env` 中的有效 `DEEPSEEK_API_KEY`，重启应用。
2. 在 Code 模式选择一个已连接的数据库连接与具体数据库，输入例如："帮我看看 users 表有哪些字段，并给出这张表上适合加索引的建议"。
3. **预期结果**：
   - 最终回复中包含基于 `schema.listColumns`/`schema.listIndexes` 真实调用结果得出的结论（不是模型凭空捏造的字段名）。
   - 界面展示本次调用的工具轨迹（FR-010）：至少包含 `schema.listColumns`、`schema.listIndexes` 两条记录，均为 `confirmation: 'not_required'`（只读工具）。

## 5. 验证 User Story 1 场景 4（修改类工具的执行前确认）

1. 输入例如："把 users 表里 email 重复的行删掉，只保留每组最早创建的一条"。
2. **预期结果**：
   - Agent 循环判断需要执行 `DELETE`，`AgentRun.status` 变为 `paused_for_confirmation`，界面展示 `pendingConfirmation.summary`（将要执行的具体 SQL 语句与目标数据库）。
   - 点击"拒绝"：调用 `agent:confirm-tool-call(runId, false)`，验证 Agent 能给出替代说明或询问更多信息，而不是直接报错终止。
   - 换一次指令并点击"确认"：调用 `agent:confirm-tool-call(runId, true)`，验证 `sql.executeWrite` 真正执行，且最终 `AgentRun.status === 'completed'`。

## 6. 验证 User Story 2（独立调用单个工具）

绕开对话界面，直接通过渲染进程 DevTools 控制台（或后续用户自行编写的测试脚本）调用：

```javascript
// 合法参数
await window.api.agent.runTool('schema.listColumns', {
  connectionId: '<有效连接ID>',
  database: '<数据库名>',
  schema: 'public',
  table: 'users'
})
// 预期：{ status: 'success', data: ColumnInfo[] }

// 非法参数（缺少 table）
await window.api.agent.runTool('schema.listColumns', {
  connectionId: '<有效连接ID>',
  database: '<数据库名>',
  schema: 'public'
})
// 预期：{ status: 'error', error: { message: '...', fieldErrors: { table: '缺少必填参数' } } }
```

完整工具清单与每个工具的输入/输出规范见 [contracts/tool-catalog.md](./contracts/tool-catalog.md)；IPC 通道的完整契约见 [contracts/ipc-contract.md](./contracts/ipc-contract.md)。

## 7. 验证边界情形

- **未选择数据库连接时发起指令**：预期 `AgentRun.status === 'completed'`，`finalMessage` 中说明需要先选择连接（而非报错），对应 spec.md Edge Cases 第 6 条。
- **达到最大工具调用轮次**：可临时将 `.env` 中 `AGENT_MAX_ITERATIONS` 调小（如 `1`）复现，验证 `AgentRun.status === 'failed'`、`error.code === 'max_iterations_exceeded'`，且提示文案不是原始异常堆栈。
