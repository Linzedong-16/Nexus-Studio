# Agent 工具独立测试指南

Code 模式的 Agent 将全部数据库/SQL 操作封装为标准化工具（见 [`tool-catalog.md`](../specs/008-code-mode-agent/contracts/tool-catalog.md)）。除了通过对话界面触发 ReAct 循环，还可以绕过对话与确认流程，直接调用任意工具来验证其行为——这是 FR-012 要求的"独立测试入口"。

本功能未引入自动化测试框架（测试由使用者自行实现），本文档说明如何手动或编写脚本调用这些工具进行验证。

## 前置条件

- 应用已启动（`pnpm dev` 或已打包运行），渲染进程可访问 `window.api.agent`
- 需要连接数据库的工具（`schema.*`、`sql.executeReadOnly`/`sql.executeWrite`/`sql.explain`）要求先在应用内建立好对应的数据库连接，并拿到其 `connectionId`（可在连接管理界面或 `window.api.config.getConnections()` 中查看）
- `sql.validate`/`sql.format` 不依赖数据库连接，可离线调用

## 在 DevTools 控制台中调用

打开应用的渲染进程 DevTools（快捷键或 `window.api.windowControls.openDevTools()`），在 Console 中：

```js
// 1. 列出全部已注册工具及其 JSON Schema
const tools = await window.api.agent.listTools()
console.table(tools.map((t) => ({ name: t.name, mutates: t.mutates })))

// 2. 调用一个只读工具（合法参数）
const result = await window.api.agent.runTool('schema.listColumns', {
  connectionId: 'conn-1',
  database: 'app_db',
  schema: 'public',
  table: 'users'
})
console.log(result)
// { status: 'success', data: ColumnInfo[] } 或
// { status: 'error', error: { message, fieldErrors? } }

// 3. 用非法参数触发字段级校验错误
const bad = await window.api.agent.runTool('schema.listColumns', { connectionId: 'conn-1' })
console.log(bad.error.fieldErrors) // { database: '...', schema: '...', table: '...' }
```

## `agent:run-tool` 的行为要点

- 无论目标工具的 `mutates` 是否为 `true`，`runTool` 都会**直接执行**，不会像对话模式一样暂停等待确认——确认流程只针对"Agent 自动决策执行"的场景，不是工具本身的固有约束（见 [`ipc-contract.md`](../specs/008-code-mode-agent/contracts/ipc-contract.md) 中 `agent:run-tool` 的说明）
- 输入参数校验失败时返回 `{ status: 'error', error: { message, fieldErrors } }`，不会 throw；只有 `toolName` 本身不存在时才会 throw
- 因此对 `sql.executeWrite` 等修改类工具调用 `runTool` 前务必确认参数正确，它会真实修改数据库

## 完整工具清单与参数规范

每个工具的输入参数、输出格式与底层依赖详见 [`tool-catalog.md`](../specs/008-code-mode-agent/contracts/tool-catalog.md)，其 `inputSchema` 与 `agent:list-tools` 返回的 `inputJsonSchema` 一一对应，不存在第二份不同源定义。

IPC 通道的完整契约（参数、返回值、错误情形）见 [`ipc-contract.md`](../specs/008-code-mode-agent/contracts/ipc-contract.md)。
