# IPC Contracts: 内存占用优化

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Data Model**: [data-model.md](../data-model.md)

本文档记录本功能新增/修改的 IPC 通道契约。命名遵循宪法 V 条约束：`模块:操作` kebab-case。所有通道均在预加载脚本中经 `contextBridge` 封装后以 `window.api.db.*` 形式暴露，渲染进程组件不得直接调用，必须经 `src/renderer/src/services/queryService.ts` 封装。

## 1. `db:query`（既有通道，返回值扩展）

**变更类型**：向后兼容扩展，不改变参数签名。

**Request**（不变）：

```ts
window.api.db.query(connectionId: string, database: string, sql: string, params?: unknown[]): Promise<QueryResult>
```

**Response**（新增 `truncated` 字段）：

```ts
interface QueryResult {
  fields: QueryField[]
  rows: Record<string, unknown>[]
  rowCount: number // 截断前的真实总行数
  durationMs: number
  truncated: boolean // 新增：本次结果是否被截断
}
```

**主进程行为变更**：`PostgreSQLDriver.runQuery`/`MySQLDriver.runQuery` 在组装返回值前，调用 `src/main/db/core/resultLimits.ts` 的 `truncateRows(rows, MAX_RESULT_ROWS)`，若原始行数超过上限则裁剪 `rows` 并设置 `truncated: true`，`rowCount` 保持为裁剪前的原始行数。

**错误处理**：与既有 `db:query` 行为一致，不新增错误类型；截断本身不是错误状态。

## 2. `db:release-database`（新增通道）

**用途**：对应 FR-007/FR-008，释放指定数据库在当前连接下的后台连接池。

**Request**：

```ts
window.api.db.releaseDatabase(connectionId: string, database: string): Promise<void>
```

**主进程 Handler**（`src/main/ipc/db.ts`）：

```ts
ipcMain.handle('db:release-database', async (_event, connectionId: string, database: string) => {
  await driverManager.releaseDatabase(connectionId, database)
})
```

**行为约定**：

- 若目标数据库是该连接的管理数据库，主进程静默跳过（不抛出异常，返回值仍为 `void`）。
- 若目标数据库当前没有已建立的连接池（已被释放或从未访问过），视为空操作，不抛出异常。
- 调用方（渲染层）负责判定"该数据库是否仍被其他标签页引用"，主进程本身不感知标签页概念（对应 research.md 第 4 节的进程职责边界决策）。

**服务层封装**（`queryService.ts` 新增方法）：

```ts
async releaseDatabase(connectionId: string, database: string): Promise<void> {
  return window.api.db.releaseDatabase(connectionId, database)
}
```

**调用时机**：`workspaceStore.ts` 的 `closeTab`/`closeOtherTabs`/`closeAllTabs` 在移除标签页后，遍历剩余 `tabs` 判断 `(connectionId, database)` 组合是否仍被引用，无引用时调用本方法。

## 3. `db:export-query-result`（新增通道）

**用途**：对应 FR-003/SC-002，为已被截断的查询结果提供不受预览上限限制的完整导出路径。

**Request**：

```ts
interface ExportQueryResultRequest {
  connectionId: string
  database: string
  sql: string
  params?: unknown[]
  filePath: string
  format: 'csv' | 'json'
}

window.api.db.exportQueryResult(request: ExportQueryResultRequest): Promise<{ rowCount: number }>
```

**主进程 Handler**（`src/main/ipc/db.ts`）：

1. 调用 `driverManager.query(connectionId, database, sql, params)` 的"无截断"变体——为避免破坏 `db:query` 的既有截断契约，新增 `IDatabaseDriver.query` 的可选第 4 参数 `options?: { unbounded?: boolean }`，导出路径传入 `{ unbounded: true }`，驱动层在该选项为真时跳过 `truncateRows` 调用。
2. 用 `src/main/utils/resultExport.ts` 新增的 `toCsv(result)`/`toJson(result)` 函数（主进程侧独立实现，不依赖渲染进程的 `lib/exportFormat.ts`，避免主进程反向依赖渲染进程代码）序列化结果。
3. 用 Node.js `fs.writeFile` 写入 `filePath`。
4. 返回 `{ rowCount: result.rowCount }` 供渲染层提示"已导出 N 行"。

**错误处理**：文件写入失败（如路径无写权限）时 reject，渲染层捕获后提示用户；沿用现有 `db:backup-database` 等通道的错误提示模式。

**服务层封装**（`queryService.ts` 新增方法）：

```ts
async exportQueryResult(request: ExportQueryResultRequest): Promise<{ rowCount: number }> {
  return window.api.db.exportQueryResult(request)
}
```

**渲染层调用时机**：`ResultTable.tsx` 的 `handleExport` 中，仅当 `result.truncated === true` 时调用本方法（需要将当前标签页的 `connectionId`/`database`/`sql`/`params` 一并传给 `ResultTable`，这几项均已存在于对应 `QueryTabState`/`TableTabState` 中）；`truncated === false` 时沿用现状的本地序列化逻辑，不发起本次新增的 IPC 调用。

## 4. 契约变更影响范围小结

| 通道                     | 变更类型       | 影响的既有调用点                                                                                                                                                                                                                                                          |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db:query`               | 返回值新增字段 | 所有调用 `queryService.execute()` 的地方（Schema 浏览、ER 分析等）均会收到 `truncated` 字段，但均为可忽略的新增字段，不破坏既有解构逻辑（除非既有代码用了穷尽性的对象类型检查，需在实现阶段核实 `ResultTable.tsx` 之外是否有其他消费者对 `QueryResult` 做了严格字段匹配） |
| `db:release-database`    | 新增通道       | 无既有调用点，纯新增                                                                                                                                                                                                                                                      |
| `db:export-query-result` | 新增通道       | 无既有调用点，纯新增；`ResultTable.tsx` 的 `handleExport` 需要接收额外的查询上下文 props                                                                                                                                                                                  |
