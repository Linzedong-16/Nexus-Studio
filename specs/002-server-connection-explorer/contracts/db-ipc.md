# Contract: 数据库 IPC 通道（`db:*`）

范围：`src/main/ipc/db.ts`（`ipcMain.handle`）↔ `src/preload/index.ts`（`contextBridge` 暴露）↔ `src/renderer/src/services/queryService.ts`（消费方）。命名遵循宪法 V：`模块:操作`，全部使用 `invoke/handle`。

## 现状（改造前）

| 通道                 | 参数                            | 返回               |
| -------------------- | ------------------------------- | ------------------ |
| `db:test-connection` | `(config: ConnectionConfig)`    | `TestResult`       |
| `db:connect`         | `(config: ConnectionConfig)`    | `ConnectionResult` |
| `db:disconnect`      | `(connectionId: string)`        | `void`             |
| `db:query`           | `(connectionId, sql, params?)`  | `QueryResult`      |
| `db:get-schemas`     | `(connectionId)`                | `SchemaInfo[]`     |
| `db:get-tables`      | `(connectionId, schema)`        | `TableInfo[]`      |
| `db:get-columns`     | `(connectionId, schema, table)` | `ColumnInfo[]`     |
| `db:status-changed`  | 推送（`send/on`）               | `ConnectionStatus` |

## 改造后

| 通道                 | 参数                                               | 返回               | 变更类型                                                                                     |
| -------------------- | -------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `db:test-connection` | `(config: ConnectionConfig)`                       | `TestResult`       | 不变                                                                                         |
| `db:connect`         | `(config: ConnectionConfig)`                       | `ConnectionResult` | 不变（语义调整：建立服务器级"管理连接"，`config.database` 为空时驱动使用类型默认管理数据库） |
| `db:disconnect`      | `(connectionId: string)`                           | `void`             | 不变（语义调整：断开该服务器连接下的全部数据库池）                                           |
| `db:get-databases`   | `(connectionId: string)`                           | `DatabaseInfo[]`   | **新增**                                                                                     |
| `db:query`           | `(connectionId, database: string, sql, params?)`   | `QueryResult`      | **新增参数** `database`                                                                      |
| `db:get-schemas`     | `(connectionId, database: string)`                 | `SchemaInfo[]`     | **新增参数** `database`                                                                      |
| `db:get-tables`      | `(connectionId, database: string, schema)`         | `TableInfo[]`      | **新增参数** `database`                                                                      |
| `db:get-columns`     | `(connectionId, database: string, schema, table)`  | `ColumnInfo[]`     | **新增参数** `database`                                                                      |
| `db:get-functions`   | `(connectionId, database: string, schema: string)` | `RoutineInfo[]`    | **新增**，仅 PostgreSQL 驱动实现                                                             |
| `db:get-procedures`  | `(connectionId, database: string, schema: string)` | `RoutineInfo[]`    | **新增**，仅 PostgreSQL 驱动实现                                                             |
| `db:status-changed`  | 推送（`send/on`）                                  | `ConnectionStatus` | 不变                                                                                         |

## 错误契约

延续现有约定（`createIPCHandler` 统一捕获异常并序列化为 `{name, message, stack}` 抛回渲染进程）：

- 目标数据库/schema 不存在或无权限访问 → 抛出错误，Service 层捕获后写入对应节点的 `error` 状态，不影响其他节点（对应 FR-009、Edge Case "展开失败"）。
- `getFunctions`/`getProcedures` 在未实现该方法的驱动上 → `DriverManager` 判断驱动是否提供该方法，未提供时直接返回空数组而非抛错（因为渲染进程按能力配置决定是否调用，理论上不会对不支持的类型发起此请求；防御性处理避免未来集成疏漏导致崩溃）。

## `IDatabaseDriver` 接口契约（`src/main/db/core/IDatabaseDriver.ts`）

```text
interface IDatabaseDriver {
  readonly id: string
  readonly type: DatabaseType

  connect(config: ConnectionConfig): Promise<ConnectionResult>   // 建立管理连接
  disconnect(): Promise<void>                                    // 关闭全部数据库池
  getDatabases(): Promise<DatabaseInfo[]>                        // 新增

  query(database: string, sql: string, params?: unknown[]): Promise<QueryResult>       // 新增 database 参数
  getSchemas(database: string): Promise<SchemaInfo[]>                                   // 新增 database 参数
  getTables(database: string, schema: string): Promise<TableInfo[]>                     // 新增 database 参数
  getColumns(database: string, schema: string, table: string): Promise<ColumnInfo[]>    // 新增 database 参数

  getFunctions?(database: string, schema: string): Promise<RoutineInfo[]>   // 新增，可选
  getProcedures?(database: string, schema: string): Promise<RoutineInfo[]>  // 新增，可选

  getStatus(): ConnectionStatus
}
```

`getFunctions`/`getProcedures` 设为可选方法：`PostgreSQLDriver` 必须实现；未来新增的、不具备存储过程/函数概念的数据库类型驱动可不实现，`DriverManager` 据此做防御性判断（见上文错误契约），既满足宪法 IV"新增数据库类型只需新增适配器"，也不强迫新适配器实现无意义的空方法。
