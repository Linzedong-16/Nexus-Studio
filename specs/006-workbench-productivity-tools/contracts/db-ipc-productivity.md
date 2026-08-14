# IPC 契约：数据库效率工具（DDL 查看 / 事务性导入）

**Feature**: `006-workbench-productivity-tools` | **关联文件**: `src/main/ipc/db.ts`、`src/main/db/core/IDatabaseDriver.ts`、`src/main/db/core/DriverManager.ts`、`src/main/db/driver/pg/PostgreSQLDriver.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`

## 现状

`db:*` 通道（`src/main/ipc/db.ts`）目前不提供：

- 获取表/视图 DDL 文本的能力。
- 任何跨多条语句共享事务的批量写入能力（`db:query` 单条执行，`queryService.executeMultiple` 只是渲染进程侧循环调用 `db:query`，各语句互不共享事务）。

## 改造后

新增两个 IPC 通道：

| 通道               | 参数                                                                      | 返回                    | 说明                                       |
| ------------------ | ------------------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| `db:get-table-ddl` | `(connectionId: string, database: string, schema: string, table: string)` | `Promise<DdlResult>`    | 对应 FR-001~FR-002                         |
| `db:get-view-ddl`  | `(connectionId: string, database: string, schema: string, view: string)`  | `Promise<DdlResult>`    | 对应 FR-001, FR-003                        |
| `db:import-rows`   | `(connectionId: string, database: string, request: ImportRowsRequest)`    | `Promise<ImportResult>` | 对应 FR-022~FR-026（CSV/JSON 场景）        |
| `db:import-sql`    | `(connectionId: string, database: string, request: ImportSqlRequest)`     | `Promise<ImportResult>` | 对应 FR-022, FR-024~FR-026（SQL 文件场景） |

`DdlResult`、`ImportRowsRequest`、`ImportSqlRequest`、`ImportResult` 类型定义见 [data-model.md](../data-model.md)。

### `IDatabaseDriver` 接口契约新增

```typescript
export interface IDatabaseDriver {
  // ...现有必需/可选方法不变...

  /** 获取表的完整 DDL 文本；PostgreSQL 无原生 SHOW CREATE TABLE，需组合系统目录查询拼装，见 research.md §5 */
  getTableDdl?(database: string, schema: string, table: string): Promise<string>

  /** 获取视图的完整定义语句，基于 pg_get_viewdef */
  getViewDdl?(database: string, schema: string, view: string): Promise<string>

  /**
   * 在单一事务内逐行执行参数化 INSERT；任意一行失败立即 ROLLBACK，
   * 不产生部分导入（FR-025）。必需方法（不设为可选），因为原子性回滚是本功能的核心承诺。
   */
  importRows(
    schema: string,
    table: string,
    columns: string[],
    rows: unknown[][]
  ): Promise<ImportResult>

  /**
   * 在单一事务内按顺序执行语句数组；任意语句失败立即 ROLLBACK。
   */
  importSql(statements: string[]): Promise<ImportResult>
}
```

- `getTableDdl`/`getViewDdl` 设计为**可选方法**，遵循 `getFunctions?`/`getProcedures?`/`getErDiagramData?` 的既有模式（`DriverManager.ts:163-182`）：`DriverManager` 在调用前检查 `typeof driver.getTableDdl !== 'function'`，未实现时直接抛出"当前数据库类型不支持查看 DDL"的明确错误（而非静默返回空字符串），交由渲染进程展示为 FR-005 所要求的错误提示。
- `importRows`/`importSql` 设计为**必需方法**：不同于"元数据查看"类的锦上添花能力，事务性写入回滚是 spec.md SC-005 与 FR-025 的强约束，若某驱动完全不支持事务则该驱动本身不应声称支持数据导入；PostgreSQL 驱动作为本期唯一实现无此问题。

## 错误契约

| 场景                      | 触发条件                                                                                                                               | 行为                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 权限不足 / 对象不存在     | `getTableDdl`/`getViewDdl` 底层查询返回空结果或数据库报错（对应 spec.md Acceptance Scenario 1.4，Edge Case「表或视图被删除或重命名」） | IPC 调用向渲染进程抛出错误，附带原始数据库错误信息；渲染进程展示明确提示，不展示空白 DDL                 |
| 驱动不支持 DDL 查看       | `typeof driver.getTableDdl !== 'function'`                                                                                             | 抛出 `不支持当前数据库类型的 DDL 查看` 错误                                                              |
| 导入过程中任意行/语句失败 | `importRows`/`importSql` 执行中数据库报错（约束冲突、类型不匹配等，对应 FR-025）                                                       | 立即 `ROLLBACK`，返回 `ImportResult.failedAt`，`succeededCount` 恒为 0（因整体回滚）                     |
| 导入过程中连接断开        | 数据库连接在事务执行期间中断（对应 Edge Case「导出/导入过程中用户断开数据库连接」）                                                    | 事务自动失效等效于回滚；IPC 调用向渲染进程抛出连接错误，渲染进程提示"导入未完成，已中止"                 |
| 导入请求行数/列数不匹配   | `rows` 中某个子数组长度与 `columns.length` 不一致                                                                                      | 在进入事务前校验并直接抛出参数错误，不发起任何数据库写入（对应 FR-027 的"写入任何数据前"原则的扩展应用） |

## 渲染进程 Service 层新增方法（`src/renderer/src/services/queryService.ts`）

```typescript
async getTableDdl(connectionId: string, database: string, schema: string, table: string): Promise<DdlResult>
async getViewDdl(connectionId: string, database: string, schema: string, view: string): Promise<DdlResult>
async importRows(connectionId: string, database: string, request: ImportRowsRequest): Promise<ImportResult>
async importSql(connectionId: string, database: string, request: ImportSqlRequest): Promise<ImportResult>
```

风格与现有 `getSchemas`/`getTables`/`execute` 等方法一致（Chinese JSDoc、直接透传 `window.api.database.*` 调用）。

## SQL 格式化：不涉及 IPC

SQL 格式化（User Story 4）完全在渲染进程内通过 `sql-formatter` 库同步计算完成（见 research.md §1），不与主进程通信，因此不产生新的 IPC 契约。
