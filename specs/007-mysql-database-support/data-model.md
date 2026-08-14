# 数据模型：MySQL 数据库连接支持

**输入**：[spec.md](./spec.md) Key Entities、[research.md](./research.md) 各项技术决策
**目的**：描述本功能涉及的实体、字段与它们之间的关系。本功能不引入任何新的持久化数据结构（不新增数据库表、不修改 `electron-store` 的存储 schema），下述"实体"均为既有 TypeScript 类型（定义于 `src/renderer/src/types/ipc.ts`，由主进程与渲染进程共享）在运行时承载的数据形状；MySQL 与 PostgreSQL 共用同一套类型定义，差异仅体现在字段的取值来源（即 `MySQLDriver` 与 `PostgreSQLDriver` 各自如何填充这些字段）。

## 1. 数据库连接（Connection）

复用既有 `ConnectionConfig` 类型，仅扩展其 `type` 字段的取值范围。

| 字段 | 类型 | 说明 | MySQL 差异 |
| --- | --- | --- | --- |
| `id` | `string` | 连接唯一标识 | 无差异 |
| `name` | `string` | 连接名称 | 无差异 |
| `type` | `DatabaseType` | `'postgresql' \| 'mysql'`（**[修改]** 新增 `'mysql'`） | 新增取值 |
| `host` | `string` | 主机地址 | 无差异 |
| `port` | `number` | 端口 | MySQL 默认 `3306`（pg 默认 `5432`），仅体现在 `ConnectionForm.tsx` 新建时的默认值逻辑，不改变字段类型 |
| `database` | `string?` | 默认数据库 | MySQL 下可为空（管理连接可不选库，见 research.md §3） |
| `username` | `string` | 用户名 | 无差异 |
| `password` | `string` | 密码（加密存储） | 无差异 |
| `ssl` | `boolean?` | 是否启用 SSL | 无差异，`mysql2` 原生支持 `ssl` 连接选项 |
| `connectTimeout` | `number?` | 连接超时（毫秒） | 无差异，`mysql2` 原生支持 `connectTimeout` 选项 |
| `color` | `string?` | 颜色标签 | 无差异 |
| `group` | `string?` | 分组 | 无差异 |

**校验规则**：与现有 PostgreSQL 连接一致（必填 `name`/`host`/`port`/`username`；`password` 允许空但需用户二次确认，复用现有表单校验逻辑），不新增 MySQL 专属校验规则。

**关联**：一个 Connection 对应主进程 `DriverManager` 中一个 `IDatabaseDriver` 实例（`PostgreSQLDriver` 或 `MySQLDriver`），由 `factory.ts` 按 `type` 字段构造。

## 2. 数据库 / 表 / 视图 / 列（Database / Table / View / Column）

复用既有 `DatabaseInfo`、`TableInfo`、`ColumnInfo` 类型，字段定义不变。

| 类型 | 字段 | MySQL 取值来源 |
| --- | --- | --- |
| `DatabaseInfo` | `name` | `SHOW DATABASES` / `information_schema.SCHEMATA.SCHEMA_NAME` |
| `SchemaInfo` | `name`、`owner` | 合成值：`name = database`，`owner = ''`（见 research.md §5） |
| `TableInfo` | `name`、`type`（`'table' \| 'view'`）、`comment` | `information_schema.TABLES`：`TABLE_TYPE = 'BASE TABLE'` → `'table'`，`= 'VIEW'` → `'view'`；`comment` ← `TABLE_COMMENT` |
| `ColumnInfo` | `name`、`dataType`、`nullable`、`defaultValue`、`isPrimaryKey`、`comment` | `information_schema.COLUMNS`：`COLUMN_NAME`、`DATA_TYPE`、`IS_NULLABLE = 'YES'`、`COLUMN_DEFAULT`、`COLUMN_KEY = 'PRI'`、`COLUMN_COMMENT` |

**关系**：Connection 1—N Database，Database 1—1 Schema（合成)，Schema 1—N Table/View，Table/View 1—N Column。层级深度与 PostgreSQL 完全一致，渲染进程结构树组件无需感知数据库类型差异。

## 3. 索引 / 触发器 / 例程（Index / Trigger / Routine）

复用既有 `IndexInfo`、`TriggerInfo`、`RoutineInfo` 类型。

| 类型 | 字段 | MySQL 取值来源 |
| --- | --- | --- |
| `IndexInfo` | `name`、`isUnique`、`isPrimary`、`columns: string[]` | `information_schema.STATISTICS`：按 `INDEX_NAME` 聚合 `COLUMN_NAME`；`isUnique = (NON_UNIQUE = 0)`；`isPrimary = (INDEX_NAME = 'PRIMARY')` |
| `TriggerInfo` | `name`、`definition`、`enabled` | `SHOW CREATE TRIGGER <name>` 取 `SQL Original Statement` 列作为 `definition`；`enabled` 固定 `true`（见 research.md §7，MySQL 无禁用机制） |
| `RoutineInfo` | `name`、`type`（`'function' \| 'procedure'`）、`parameters`、`returnType?`、`comment` | `information_schema.ROUTINES` + `information_schema.PARAMETERS`（`GROUP_CONCAT` 拼接参数签名）；`ROUTINE_TYPE` 决定 `type`；`returnType` 仅函数有值，取 `DTD_IDENTIFIER` |

## 4. 用户 / 权限（User / Privilege）

复用既有 `RoleInfo` 类型（FR-017 全量对齐要求映射到与 PostgreSQL 角色列表一致的字段集）。

| `RoleInfo` 字段 | 类型 | MySQL 取值来源 |
| --- | --- | --- |
| `name` | `string` | `CONCAT(User, '@', Host)`（`mysql.user` 表） |
| `isSuperuser` | `boolean` | `Super_priv = 'Y'` |
| `canLogin` | `boolean` | `account_locked <> 'Y'` |
| `connectionLimit` | `number` | `max_user_connections`（`0` = 无限制） |

**说明**：MySQL 的账号身份由 `用户名@主机` 二元组唯一确定（同一用户名可对应多个不同 `Host` 的独立账号），因此 `name` 字段需拼接两者，与 PostgreSQL 角色名（单一字符串）在展示上保持一致的"一行一账号"语义，仅内容多了主机部分。

## 5. ER 图数据（ER Diagram Data）

复用既有 `ErDiagramData`（含 `tables: ErTableNode[]` 与 `relations: ErRelation[]`）。

| 字段 | MySQL 取值来源 |
| --- | --- |
| `ErTableNode.name`、`.columns` | 同 §2 Table/Column 查询结果 |
| `ErRelation.fromTable`/`.fromColumn`/`.toTable`/`.toColumn` | `information_schema.KEY_COLUMN_USAGE` 联合 `information_schema.REFERENTIAL_CONSTRAINTS`，筛选 `REFERENCED_TABLE_NAME IS NOT NULL` 的行 |

**边界情况**：所选范围内表均无外键（如 MyISAM 引擎）时，`relations` 为空数组，`tables` 仍完整返回，对应 FR-013 与 spec.md Edge Cases。

## 6. 导入结果（Import Result）

复用既有 `ImportResult` 类型（`succeededCount`、`failedAt?: { index: number; message: string }`、`rolledBack: boolean`），字段语义不变，MySQL 侧由 `mysql2` 事务 API（`beginTransaction`/`commit`/`rollback`）产生，行为与 pg 侧完全一致（见 research.md §11）。

## 7. 备份结果（Backup Result）与 `BackupParams` 扩展

复用既有 `BackupResult` 类型（`success`、`filePath?`、`error?`），字段语义不变。

`BackupParams` **[修改]** 新增可选字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `pgDumpPath` | `string?`（已存在） | PostgreSQL 备份工具路径，不变 |
| `mysqlDumpPath` | `string?`（**新增**） | MySQL 备份工具（`mysqldump`）路径，用户手动指定时填充；未填写时由主进程 `detectMysqldump()` 自动探测 |

**取值规则**：调用方（IPC 层 `db:backup-database` 处理器）按连接的 `type` 决定读取 `pgDumpPath` 还是 `mysqlDumpPath`，两字段互斥使用，互不影响。

## 8. 类型定义改动汇总（`src/renderer/src/types/ipc.ts`）

| 改动 | 内容 |
| --- | --- |
| `DatabaseType` | `'postgresql'` → `'postgresql' \| 'mysql'` |
| `BackupParams` | 新增 `mysqlDumpPath?: string` |

其余全部共享类型（`ColumnInfo`、`IndexInfo`、`TriggerInfo`、`RoutineInfo`、`RoleInfo`、`ErDiagramData`、`ImportResult`、`BackupResult` 等）**不改变字段定义**，仅由 `MySQLDriver` 提供新的取值来源实现，验证了 Constitution Check 中"复用共享类型，不新增 `any`"的评估结论。

## 状态转换

本功能不涉及具体的实体状态机（连接的"已连接/未连接"状态复用现有 `ConnectionStatus` 枚举与 `DriverManager` 生命周期管理，逻辑不因数据库类型而分支）。
