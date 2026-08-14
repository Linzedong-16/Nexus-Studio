# 契约：MySQL 数据库连接支持

**输入**：[data-model.md](./data-model.md)、[research.md](./research.md)、现有 `src/main/db/core/IDatabaseDriver.ts`、`src/main/ipc/db.ts`
**目的**：明确本功能涉及的两类契约——(A) `MySQLDriver` 必须满足的内部驱动接口契约，(B) 现有 IPC 层需要修复的两处硬编码分支契约。本功能**不新增任何 IPC 通道**，因此本文档不是一份"新增接口"清单，而是"新增实现"与"缺陷修复"的契约说明。

## A. 驱动接口契约（`IDatabaseDriver`）

`MySQLDriver` 必须实现 `src/main/db/core/IDatabaseDriver.ts` 定义的 `IDatabaseDriver` 接口（与 `PostgreSQLDriver` 完全相同的契约，无需修改接口定义本身），以及静态契约 `IDatabaseDriverStatic`。

### 必须实现的方法（无 `?` 修饰，接口强制）

| 方法                                                                        | 契约                                                                                                               | MySQL 实现要点                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `connect(config): Promise<ConnectionResult>`                                | 建立服务器级管理连接，成功返回 `{ success: true, serverVersion, latencyMs }`，失败返回 `{ success: false, error }` | 见 research.md §3，不强制 `database`                               |
| `disconnect(): Promise<void>`                                               | 关闭该连接下全部数据库连接池                                                                                       | 遍历 `Map<string, Pool>` 逐一 `pool.end()`                         |
| `getDatabases(): Promise<DatabaseInfo[]>`                                   | 返回当前账号可访问的全部数据库                                                                                     | `SHOW DATABASES`，不过滤系统库（research.md §4）                   |
| `query(database, sql, params?): Promise<QueryResult>`                       | 对指定数据库执行任意 SQL，返回字段信息、行数据、行数、耗时；执行失败抛出携带数据库原始错误信息的 `Error`           | 使用 `?` 占位符参数化查询（宪法 I 意图对齐，research.md 前置结论） |
| `getSchemas(database): Promise<SchemaInfo[]>`                               | 返回数据库下的 schema 列表                                                                                         | 合成单元素数组（research.md §5）                                   |
| `getTables(database, schema): Promise<TableInfo[]>`                         | 返回表与视图列表，标注类型                                                                                         | `information_schema.TABLES`                                        |
| `getColumns(database, schema, table): Promise<ColumnInfo[]>`                | 返回列的完整定义                                                                                                   | `information_schema.COLUMNS`                                       |
| `getIndexes(database, schema, table): Promise<IndexInfo[]>`                 | 返回索引列表                                                                                                       | `information_schema.STATISTICS`（research.md §7）                  |
| `getTriggers(database, schema, table): Promise<TriggerInfo[]>`              | 返回触发器列表                                                                                                     | `SHOW CREATE TRIGGER`（research.md §7）                            |
| `importRows(database, schema, table, columns, rows): Promise<ImportResult>` | 整体事务性按行导入                                                                                                 | `beginTransaction`/`commit`/`rollback`（research.md §11）          |
| `importSql(database, statements): Promise<ImportResult>`                    | 整体事务性按语句导入                                                                                               | 同上                                                               |
| `getStatus(): ConnectionStatus`                                             | 返回当前连接状态枚举                                                                                               | 复用与 `PostgreSQLDriver` 相同的状态字段维护逻辑                   |

### 可选实现的方法（`?` 修饰，本功能范围内必须提供，因 FR 明确要求）

| 方法                                                           | 对应 FR | MySQL 实现要点                                                   |
| -------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| `getRoles?(): Promise<RoleInfo[]>`                             | FR-017  | 查询 `mysql.user`（research.md §8）                              |
| `getFunctions?(database, schema): Promise<RoutineInfo[]>`      | FR-008  | `information_schema.ROUTINES` where `ROUTINE_TYPE='FUNCTION'`    |
| `getProcedures?(database, schema): Promise<RoutineInfo[]>`     | FR-008  | 同上 where `='PROCEDURE'`                                        |
| `getErDiagramData?(database, schemas): Promise<ErDiagramData>` | FR-013  | `KEY_COLUMN_USAGE` + `REFERENTIAL_CONSTRAINTS`（research.md §9） |
| `getTableDdl?(database, schema, table): Promise<string>`       | FR-010  | `SHOW CREATE TABLE`（research.md §6）                            |
| `getViewDdl?(database, schema, view): Promise<string>`         | FR-010  | `SHOW CREATE VIEW`（research.md §6）                             |

**契约约束**：`DriverManager.ts` 对全部可选方法均已实现"方法存在性防御式分发"（`typeof driver.xxx === 'function'` 判断后才调用，否则抛出"该数据库类型不支持此操作"之类的统一错误），因此 `MySQLDriver` 提供以上全部可选方法后，无需改动 `DriverManager.ts` 即可被正确分发调用。

### 静态契约（`IDatabaseDriverStatic`）

`MySQLDriver` 类本身（而非实例）必须提供静态方法：

```ts
static testConnection(config: ConnectionConfig): Promise<TestResult>
```

契约：使用给定配置发起一次性探测连接（不进入 `DriverManager` 的连接池生命周期），成功返回 `{ success: true, serverVersion, latencyMs }`，失败返回 `{ success: false, error }`，与 `PostgreSQLDriver.testConnection` 语义完全一致。此静态方法是修复下方 B.1 缺陷的直接依赖。

### 错误处理契约

所有方法在对象不存在或权限不足时，必须抛出包含明确中文错误信息的 `Error`（不静默返回空结果、不导致进程崩溃），对应 FR-016；IPC 层的 `createIPCHandler` 包装器统一捕获并转换为渲染进程可读的错误响应，`MySQLDriver` 内部无需重复实现这层转换，只需保证抛出的 `Error.message` 是面向用户可读的中文文本。

## B. IPC 层缺陷修复契约

以下两处是 `src/main/ipc/db.ts` 中现存的、独立于本功能新增驱动的历史遗留硬编码分支，必须修复才能让 MySQL 连接获得与 PostgreSQL 一致的体验（对应 FR-002、FR-014）。

### B.1 `db:test-connection`

**现状**（缺陷）：

```ts
createIPCHandler<[ConnectionConfig], TestResult>('db:test-connection', async (config) => {
  return PostgreSQLDriver.testConnection(config)
})
```

无论 `config.type` 是什么，一律调用 `PostgreSQLDriver.testConnection`，导致 MySQL 连接的"测试连接"请求会被错误地当作 PostgreSQL 连接处理。

**修复后契约**：按 `config.type` 分发到对应驱动类的静态 `testConnection`：

```ts
createIPCHandler<[ConnectionConfig], TestResult>('db:test-connection', async (config) => {
  const DriverClass = getDriverClass(config.type) // 复用/新增一个按 type 返回驱动类的小工具函数
  return DriverClass.testConnection(config)
})
```

**输入/输出不变**：请求参数 `ConnectionConfig`、返回类型 `TestResult` 均不改变，属于纯粹的内部分发修复，渲染进程侧调用方（`ConnectionForm.tsx` 的"测试连接"按钮）无需任何改动。

### B.2 `db:backup-database`

**现状**（缺陷）：处理器无条件按 PostgreSQL 语义处理——固定使用 `pg_dump` 可执行文件名探测（`detectPgDump()`）、固定通过环境变量 `PGPASSWORD` 传密码、固定拼装 `pg_dump` 的命令行参数格式（`-f <path>` 等）。

**修复后契约**：处理器新增按连接 `type` 的分支：

```ts
createIPCHandler<[string, string, string, string?], BackupResult>(
  'db:backup-database',
  async (connectionId, database, exportDir, dumpToolPath) => {
    const stored = /* 同现状：查找连接配置 */
    if (stored.type === 'mysql') {
      const dumpBin = dumpToolPath || (await detectMysqldump())
      // 使用 MYSQL_PWD 环境变量传密码；mysqldump -h <host> -P <port> -u <user> <database> --result-file=<outFile>
      // 注意 MySQL 的端口参数是大写 -P，与 pg_dump 的小写 -p 不同
    } else {
      // 现状 PostgreSQL 分支逻辑保持不变
    }
  }
)
```

**新增内部函数契约**：`detectMysqldump(): Promise<string | null>`，逻辑镜像既有 `detectPgDump()`（见 research.md §12），返回可执行文件的绝对路径或 `null`（未检测到）。

**参数命名说明**：现有函数签名的第 4 个参数原名 `pgDumpPath`，修复时泛化为通用命名（如 `dumpToolPath`）以承载两种数据库类型的工具路径值——这是 IPC 处理器**内部实现细节**的重命名，不改变对外的 IPC 通道名 `db:backup-database`、参数个数与参数类型（仍是 `string?`），因此不构成契约破坏；渲染进程侧调用点按连接的 `type` 决定传入 `mysqlDumpPath` 还是 `pgDumpPath`（见 data-model.md §7 的字段区分）。

**输出不变**：返回类型 `BackupResult` 不改变。

## C. 未改动的契约（明确排除项）

以下内容确认本次功能**不涉及改动**，列出以避免实现阶段误判范围：

- 不新增、不重命名任何 `db:*` IPC 通道
- `DriverManager.ts` 的公开方法签名不变
- `src/main/db/core/types.ts`（`DatabaseType` 重导出 shim）不变
- 除 `DatabaseType` 联合类型扩展、`BackupParams.mysqlDumpPath?` 新增字段外，`src/renderer/src/types/ipc.ts` 中的其余全部类型定义不变
