# Tool Catalog: `agent:*` 标准化工具清单

本文档是 FR-002/FR-012 要求的工具说明文档，SC-003"工具文档覆盖率 100%"的交付物。每个工具的 `inputSchema` 均用 zod 定义并通过 `zod-to-json-schema` 派生出 `agent:list-tools` 返回的 JSON Schema；本文档中的"输入参数"表与该 schema 一一对应，不应出现不同源的第二份定义。

所有工具均可通过 `agent:run-tool(toolName, input)` 独立调用（见 ipc-contract.md），无需经过完整对话流程。

## 一、Schema 内省类工具（均为只读，`mutates: false`）

### 1. `schema.listDatabases`

- **功能描述**：列出指定数据库连接下的所有数据库。
- **输入参数**：

  | 参数           | 类型   | 必填 | 说明                   |
  | -------------- | ------ | ---- | ---------------------- |
  | `connectionId` | string | 是   | 已建立的数据库连接标识 |

- **输出（成功）**：`DatabaseInfo[]`（复用 `src/renderer/src/types/ipc.ts` 现有类型，字段含 `name` 等）
- **底层依赖**：`driverManager.getDatabases(connectionId)`（`src/main/ipc/db.ts` 中 `db:get-databases` 的同一实现）

### 2. `schema.listSchemas`

- **功能描述**：列出指定数据库下的所有 schema（PostgreSQL）或等价命名空间。
- **输入参数**：

  | 参数           | 类型   | 必填 | 说明           |
  | -------------- | ------ | ---- | -------------- |
  | `connectionId` | string | 是   | 数据库连接标识 |
  | `database`     | string | 是   | 数据库名       |

- **输出（成功）**：`SchemaInfo[]`
- **底层依赖**：`driverManager.getSchemas(connectionId, database)`

### 3. `schema.listTables`

- **功能描述**：列出指定 schema 下的所有表。
- **输入参数**：

  | 参数           | 类型   | 必填 | 说明           |
  | -------------- | ------ | ---- | -------------- |
  | `connectionId` | string | 是   | 数据库连接标识 |
  | `database`     | string | 是   | 数据库名       |
  | `schema`       | string | 是   | schema 名称    |

- **输出（成功）**：`TableInfo[]`
- **底层依赖**：`driverManager.getTables(connectionId, database, schema)`

### 4. `schema.listColumns`

- **功能描述**：列出指定表的全部列及其类型信息，是"分析表结构"能力的核心数据来源。
- **输入参数**：

  | 参数           | 类型   | 必填 | 说明           |
  | -------------- | ------ | ---- | -------------- |
  | `connectionId` | string | 是   | 数据库连接标识 |
  | `database`     | string | 是   | 数据库名       |
  | `schema`       | string | 是   | schema 名称    |
  | `table`        | string | 是   | 表名           |

- **输出（成功）**：`ColumnInfo[]`
- **底层依赖**：`driverManager.getColumns(connectionId, database, schema, table)`

### 5. `schema.listIndexes`

- **功能描述**：列出指定表的索引信息，供"优化查询"能力判断是否存在可用索引。
- **输入参数**：同 `schema.listColumns`（`connectionId`/`database`/`schema`/`table`，均必填）
- **输出（成功）**：`IndexInfo[]`
- **底层依赖**：`driverManager.getIndexes(connectionId, database, schema, table)`

### 6. `schema.getDdl`

- **功能描述**：获取指定表或视图的 DDL 语句（对应 FR-001 中的"查看 DDL"能力）。
- **输入参数**：

  | 参数           | 类型                | 必填 | 说明           |
  | -------------- | ------------------- | ---- | -------------- |
  | `connectionId` | string              | 是   | 数据库连接标识 |
  | `database`     | string              | 是   | 数据库名       |
  | `schema`       | string              | 是   | schema 名称    |
  | `objectType`   | `'table' \| 'view'` | 是   | 目标对象类型   |
  | `name`         | string              | 是   | 表名或视图名   |

- **输出（成功）**：`DdlResult`（`{ objectType, schema, name, ddl }`）
- **底层依赖**：`objectType === 'table'` → `driverManager.getTableDdl(...)`；`objectType === 'view'` → `driverManager.getViewDdl(...)`（与 `db:get-table-ddl`/`db:get-view-ddl` 复用同一驱动方法）

## 二、SQL 类工具

### 7. `sql.validate`（只读，`mutates: false`）

- **功能描述**：对一段 SQL 文本做语法解析校验，不连接数据库、不执行，是"修复 SQL 错误"能力判断语法层错误的第一道依据。
- **输入参数**：

  | 参数      | 类型                      | 必填 | 说明                   |
  | --------- | ------------------------- | ---- | ---------------------- |
  | `sql`     | string                    | 是   | 待校验的 SQL 文本      |
  | `dialect` | `'postgresql' \| 'mysql'` | 是   | SQL 方言，决定解析规则 |

- **输出（成功）**：`{ valid: boolean; errorMessage?: string; statementType?: string }`
- **底层依赖**：主进程内新增的 `node-sql-parser` 包装（与渲染进程 `lib/sqlStatements.ts` 逻辑等价，物理上独立实现，因跨进程不可直接 import 渲染进程代码）

### 8. `sql.format`（只读，`mutates: false`）

- **功能描述**：将 SQL 文本格式化为统一风格，供"生成 SQL"能力输出可读性更好的结果。
- **输入参数**：

  | 参数      | 类型                      | 必填 | 说明                |
  | --------- | ------------------------- | ---- | ------------------- |
  | `sql`     | string                    | 是   | 待格式化的 SQL 文本 |
  | `dialect` | `'postgresql' \| 'mysql'` | 是   | SQL 方言            |

- **输出（成功）**：`{ formatted: string }`
- **底层依赖**：`sql-formatter`（主进程内新增等价调用）

### 9. `sql.explain`（只读，`mutates: false`）

- **功能描述**：获取数据库对指定查询的执行计划，是"优化查询"能力判断性能瓶颈的核心依据。
- **输入参数**：

  | 参数           | 类型   | 必填 | 说明                                |
  | -------------- | ------ | ---- | ----------------------------------- |
  | `connectionId` | string | 是   | 数据库连接标识                      |
  | `database`     | string | 是   | 数据库名                            |
  | `sql`          | string | 是   | 待分析的查询语句（必须是 `SELECT`） |

- **输出（成功）**：`QueryResult`（执行 `EXPLAIN <sql>` 后的结果集，复用现有 `driverManager.query` 返回结构）
- **失败情形**：若 `sql.validate` 判定该语句非 `SELECT`，直接返回 `{ status: 'error', error: { message: '仅支持对 SELECT 语句生成执行计划' } }`，不会真正下发到数据库
- **底层依赖**：`driverManager.query(connectionId, database, \`EXPLAIN ${sql}\`)`（PostgreSQL/MySQL 语法差异由驱动层已有的方言适配处理）

### 10. `sql.executeReadOnly`（只读，`mutates: false`）

- **功能描述**：执行只读查询（`SELECT`/`SHOW`/`EXPLAIN` 等不产生数据变更的语句）并返回结果集，对应 FR-001 的"执行查询"能力。
- **输入参数**：

  | 参数           | 类型   | 必填 | 说明              |
  | -------------- | ------ | ---- | ----------------- |
  | `connectionId` | string | 是   | 数据库连接标识    |
  | `database`     | string | 是   | 数据库名          |
  | `sql`          | string | 是   | 待执行的 SQL 语句 |

- **输出（成功）**：`QueryResult`
- **执行前校验**：调用前用 `node-sql-parser` 解析语句类型（复用 `sql.validate` 的解析逻辑）；若判定为非只读语句（`INSERT`/`UPDATE`/`DELETE`/DDL 等），直接返回 `{ status: 'error', error: { message: '该语句会修改数据，请改用 sql.executeWrite' } }`，不会静默执行（research.md §9）
- **底层依赖**：`driverManager.query(connectionId, database, sql)`

### 11. `sql.executeWrite`（修改类，`mutates: true`）

- **功能描述**：执行会修改数据或表结构的 SQL 语句（`INSERT`/`UPDATE`/`DELETE`/DDL 等），对应 FR-014 中需要执行前确认的典型场景。
- **输入参数**：

  | 参数           | 类型   | 必填 | 说明              |
  | -------------- | ------ | ---- | ----------------- |
  | `connectionId` | string | 是   | 数据库连接标识    |
  | `database`     | string | 是   | 数据库名          |
  | `sql`          | string | 是   | 待执行的 SQL 语句 |

- **输出（成功）**：`QueryResult`（含 `rowsAffected` 等既有字段）
- **确认流程**：当 Agent 循环选中该工具时，不会直接执行——`AgentRun` 先进入 `paused_for_confirmation`，`pendingConfirmation.summary` 展示"即将在数据库 {database} 上执行以下语句：{sql}"，用户确认后才真正调用 `driverManager.query`；通过 `agent:run-tool` 独立调用时不受此限制（见 ipc-contract.md 的 `agent:run-tool` 行为说明第 3 点）
- **底层依赖**：`driverManager.query(connectionId, database, sql)`

## 工具与 FR-001 能力类别的对应关系

| FR-001 能力类别      | 对应工具（作为 Agent 推理的事实依据，见 research.md §5）                            |
| -------------------- | ----------------------------------------------------------------------------------- |
| 根据自然语言生成 SQL | `schema.listTables` / `schema.listColumns` / `sql.format` / `sql.validate`          |
| 分析表结构/Schema    | `schema.listTables` / `schema.listColumns` / `schema.listIndexes` / `schema.getDdl` |
| 优化查询             | `sql.explain` / `schema.listIndexes`                                                |
| 修复 SQL 错误        | `sql.validate` / `sql.explain`（执行报错信息）                                      |
| 查看 DDL             | `schema.getDdl`                                                                     |
| 执行查询             | `sql.executeReadOnly` / `sql.executeWrite`                                          |
