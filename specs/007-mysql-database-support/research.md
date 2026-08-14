# Phase 0 研究：MySQL 数据库连接支持

**输入**：[plan.md](./plan.md) Technical Context 中标记的技术决策点
**目的**：为 `MySQLDriver` 的实现方式给出有据可依的结论，解决 Technical Context 中不确定的技术选型，本功能规格中不存在 `[NEEDS CLARIFICATION]` 标记（已在 `/speckit-clarify` 阶段全部解决），本阶段的"研究"聚焦于将 PostgreSQL 驱动的既有实现模式映射到 MySQL 的具体技术决策。

## 1. 驱动包选型

**Decision**：使用 `mysql2`（Promise API）作为唯一新增依赖。

**Rationale**：

- Node.js 生态中 MySQL 驱动的事实标准，纯 JavaScript 实现，无原生编译依赖，符合宪法 VIII"评估包体积和原生依赖"的选型标准，不影响 Electron 跨平台打包
- 自带完整 TypeScript 类型定义，无需额外安装 `@types/mysql2`（对照 `pg` 需要 `@types/pg`，`mysql2` 更贴合宪法"依赖最小化"）
- 原生支持 Promise API（`connection.promise()`/`createPool` 的 promise 变体），与现有 `pg` 驱动基于 `async/await` 的代码风格一致，不需要额外的回调转 Promise 封装
- 内置连接池（`mysql2/promise` 的 `createPool`），语义与 `pg.Pool` 接近，便于复用 `PostgreSQLDriver` 的连接池管理模式

**Alternatives considered**：

- `mysql`（旧版官方驱动）：仅回调 API，社区已转向 `mysql2`，且已多年缺乏活跃维护，排除
- `knex` / `typeorm` 等 ORM 或查询构建器：引入远超需求的抽象层，且与宪法 VIII"同类依赖只选一个""按需引入"及 IV"适配器不魔改"的精简原则冲突，排除

## 2. 连接池管理模型

**Decision**：延续 `PostgreSQLDriver` 的 `Map<string, Pool>` 按数据库名分池模式，每个数据库对应一个独立的 `mysql2` Pool。

**Rationale**：

- 与 `PostgreSQLDriver.pools` 字段的既有模式完全一致，`DriverManager` 无需感知驱动内部差异
- MySQL 协议中，连接一旦建立即绑定到某个 `USE` 过的数据库；若改用单一全局池 + 运行时 `USE database` 切换，连接归还池后状态不确定，后续借出的连接可能仍停留在上一次的数据库上下文，产生隐蔽的跨数据库串号问题
- 按数据库分池可完全避免连接状态污染，代价是同一服务器下浏览多个数据库时会建立多个池，但与 `pg` 驱动的行为一致，用户侧无感知差异

**Alternatives considered**：

- 单一服务器级连接池 + 每次查询前 `USE database`：曾评估但因池化连接的 `USE` 状态在并发场景下不可控，可能导致查询在错误的数据库上执行，风险明显高于多池的内存/连接数开销，排除

## 3. 管理连接（无默认数据库）

**Decision**：`connect()` 建立管理连接时不强制指定 `database`，允许 MySQL 协议原生的"无数据库"连接模式；仅当 `config.database` 显式提供时才在建池参数中传入。

**Rationale**：

- MySQL 协议层面允许客户端在不选择任何数据库的情况下完成认证与后续 `SHOW DATABASES` 等操作，与 PostgreSQL 强制要求连接到某个具体数据库（因此 `PostgreSQLDriver` 需要 `DEFAULT_MANAGEMENT_DATABASE = 'postgres'` 兜底）不同
- 省去了"猜测一个总是存在的系统数据库名"的必要性，避免 PostgreSQL 侧因 `postgres` 库被删除或改名导致管理连接失败的同类问题

**Alternatives considered**：

- 参照 pg 强制指定 `information_schema` 或 `mysql` 作为管理数据库：可行但不必要，MySQL 原生支持无库连接，强制指定反而增加一个"该库必须存在且可访问"的隐性前提，排除

## 4. 数据库列表是否过滤系统库

**Decision**：`getDatabases()` 返回全部数据库，不过滤 `information_schema`/`mysql`/`performance_schema`/`sys`。

**Rationale**：

- FR-003"列出已连接 MySQL 服务器上当前账号可访问的全部数据库"未提及排除项
- 这些系统库在 MySQL 中是可正常查询、具备实用价值的数据库（例如 `information_schema` 本身常被用户直接查询），与 PostgreSQL `getSchemas()` 排除 `pg_catalog`/`information_schema`（那是 schema 级排除，且这些 schema 内容对用户浏览价值有限）以及 `getDatabases()` 中过滤 `datistemplate = true` 的模板库（`template0`/`template1` 本身不可连接使用）性质不同——MySQL 没有"不可用模板库"这一类别，不需要类比过滤

**Alternatives considered**：

- 完全对齐 pg 过滤系统 schema 的思路，隐藏 `mysql`/`information_schema` 等库：评估后认为这会让希望直接查看 `mysql.user` 权限表（本功能 FR-017 用户权限查看本身就依赖读取 `mysql.user`）的高级用户失去入口，且规格未要求过滤，排除

## 5. Schema 层级映射

**Decision**：`getSchemas(database)` 返回单一合成条目 `[{ name: database, owner: '' }]`。

**Rationale**：

- spec.md Assumptions 已明确"MySQL 没有独立于 database 的 schema 概念；每个 MySQL 数据库同时充当其唯一的 schema"，此决策直接落实该假设
- 复用现有"连接 → 数据库 → schema → 表"三级导航结构，不改变 `SchemaInfo` 类型定义，不改变渲染进程结构树组件的层级逻辑
- `owner` 字段留空字符串而非省略：MySQL 无数据库级 owner 概念，但 `SchemaInfo.owner` 为必填字段，返回空字符串是信息缺失场景下最直接的表达，UI 层已有的"owner 为空则不展示"逻辑（复用现有渲染逻辑）自然处理

**Alternatives considered**：

- 修改 `SchemaInfo` 使 `owner` 变为可选：会波及 PostgreSQL 侧的类型使用点，违反"不破坏现有功能"的原则，且收益甚微，排除

## 6. DDL 查看的实现方式

**Decision**：`getTableDdl`/`getViewDdl` 直接调用 MySQL 原生的 `SHOW CREATE TABLE`/`SHOW CREATE VIEW`，不手动拼装。

**Rationale**：

- MySQL 提供了官方保证语义完整、格式规范的原生语句，直接返回其 `Create Table`/`Create View` 列即可满足 FR-010，且与 spec.md Assumptions"视图 DDL 通过 MySQL 原生的 `SHOW CREATE VIEW` 获取"直接对应
- 相较 `PostgreSQLDriver.getTableDdl()` 需要 5 个并行的 `information_schema`/`pg_catalog` 查询手动拼接 `CREATE TABLE` 语句（因 PostgreSQL 没有对应的一体化原生命令），这是一处真实的实现简化，不是功能缩水
- 找不到表/视图或无权限时，与 pg 侧行为对齐：捕获 `SHOW CREATE` 执行失败的错误，统一抛出"表/视图不存在或当前用户无权限查看其结构"的中文错误信息，满足 FR-016

**Alternatives considered**：

- 手动拼装 `information_schema.COLUMNS` + `KEY_COLUMN_USAGE` 重建 DDL（完全模拟 pg 的做法）：可行但徒增复杂度且更容易与数据库引擎的真实行为（如存储引擎、字符集、AUTO_INCREMENT 起始值等只有原生命令才能完整还原的细节）产生偏差，排除

## 7. 索引 / 触发器 / 例程查询方式

**Decision**：

- `getIndexes()`：查询 `information_schema.STATISTICS`，按 `(TABLE_SCHEMA, TABLE_NAME, INDEX_NAME)` 聚合列，`INDEX_NAME === 'PRIMARY'` 判定为主键索引，`NON_UNIQUE = 0` 判定为唯一索引
- `getTriggers()`：调用 `SHOW CREATE TRIGGER <name>` 获取完整定义文本；MySQL 无触发器禁用机制（不同于 PostgreSQL 的 `tgenabled`），`enabled` 字段固定返回 `true`，并在 research 与用户文档中记录为平台差异而非功能缺口
- `getFunctions`/`getProcedures`：查询 `information_schema.ROUTINES` 联合 `information_schema.PARAMETERS`（用 `GROUP_CONCAT` 拼接参数签名字符串），按 `ROUTINE_TYPE = 'FUNCTION' | 'PROCEDURE'` 区分，与 `PostgreSQLDriver` 中共享私有方法 `getRoutines()` 的分流方式一致，`MySQLDriver` 内部同样封装一个私有 `getRoutines()` 辅助方法减少重复代码

**Rationale**：均为 MySQL `information_schema` 标准视图的直接查询，字段语义可直接映射到既有 `IndexInfo`/`TriggerInfo`/`RoutineInfo` 类型，无需新增字段。触发器禁用机制的缺失是 MySQL 平台的客观限制（MySQL 触发器一旦创建即始终启用，没有 `ALTER TRIGGER ... DISABLE` 这类命令），在 UI 上会始终显示为"已启用"，这如实反映了数据库的实际状态，不构成信息误导。

**Alternatives considered**：无——这些查询路径是 `information_schema` 标准用法，没有需要权衡的替代实现。

## 8. 用户 / 权限查看（FR-017 全量对齐）

**Decision**：`getRoles()` 查询 `mysql.user` 系统表，选取 `User`、`Host`、`Super_priv`、`account_locked`、`max_user_connections` 等列，映射为 `RoleInfo`：

- `name` ← `CONCAT(User, '@', Host)`（用户名 + 可登录主机的组合，因 MySQL 账号身份由二者共同确定）
- `isSuperuser` ← `Super_priv = 'Y'`
- `canLogin` ← `account_locked <> 'Y'`（账号未被锁定视为可登录；MySQL 没有与 pg `rolcanlogin` 完全对应的单一布尔列，`account_locked` 是语义最接近的字段）
- `connectionLimit` ← `max_user_connections`（`0` 表示无限制，与 pg 语义一致，复用现有 UI 侧"0 视为无限制"的展示逻辑）

**Rationale**：直接落实用户在 `/speckit-clarify` 阶段选择的"做完整对齐"决策与 FR-017 的字段要求，映射关系逐字段有据可依，不是近似猜测。查询 `mysql.user` 要求连接账号对该系统表有 `SELECT` 权限（通常需要全局 `SELECT` 权限或 MySQL 8.0 的 `information_schema` 只读视图权限）——权限不足时按 FR-016 统一错误提示处理，不视为额外场景需要特殊 UI。

**Alternatives considered**：

- 使用 `information_schema.USER_PRIVILEGES`/`SHOW GRANTS`：`SHOW GRANTS` 需要针对每个用户单独执行，无法一次性批量获取全部账号列表，不满足"服务器级用户/权限列表"一次性展示的需求；`information_schema.USER_PRIVILEGES` 仅覆盖已授予的具体权限项，不含 `account_locked`/`max_user_connections` 等账号级属性，信息不完整，排除

## 9. ER 图数据聚合

**Decision**：沿用 `PostgreSQLDriver.getErDiagramData()` 的"两个并行查询 + 聚合"模式：一个查询获取所选范围内全部表的列结构，另一个查询获取外键关系（`information_schema.KEY_COLUMN_USAGE` 联合 `information_schema.REFERENTIAL_CONSTRAINTS`，通过 `REFERENCED_TABLE_NAME`/`REFERENCED_COLUMN_NAME` 非空行筛出外键列）。由于 MySQL 场景下 schema 恒等于 database，调用方传入的 `schemas` 参数值即为 `[database]`。

**Rationale**：MySQL 的 `information_schema.KEY_COLUMN_USAGE` 天然包含外键引用列信息（非 MySQL 特有表，是 SQL 标准信息模式的一部分），可直接类比 pg 的 `pg_constraint` 查询思路。不支持外键的存储引擎（如 MyISAM）建表时不会在 `REFERENTIAL_CONSTRAINTS` 中产生记录，查询自然返回空结果，天然满足 FR-013"无外键约束时仍展示表结构本身，不报错"的要求，无需额外的存储引擎判断分支。

**Alternatives considered**：无——`information_schema` 标准查询已完整覆盖需求，不存在需要权衡的替代方案。

## 10. 字段类型映射

**Decision**：构建一个从 `mysql2` 导出的 `Types`（类型码 → 名称的正向映射）反转得到的"类型码 → 名称"映射表，供查询结果集的 `FieldPacket.type` 转换为可读类型名称，映射方式与 `PostgreSQLDriver` 中 `OID_TO_TYPE_NAME`（反转 `pg-types` 的 `builtins`）完全类比。

**Rationale**：`mysql2` 与 `pg` 都在协议层用数字类型码标识列类型，两者都提供了官方的类型码常量导出，反转为查找表是两个驱动实现中完全一致的模式，保证 `mapField()` 风格的转换逻辑可以直接复用相同的代码结构。

**Alternatives considered**：无，这是两个驱动共有的、无需重新设计的既定模式。

## 11. 事务性导入

**Decision**：`importRows`/`importSql` 通过 `mysql2` 连接的 `beginTransaction()`/`commit()`/`rollback()` 实现整体事务性，SQL 参数化统一使用 `?` 占位符，逐行/逐语句执行，首次失败即回滚并返回 `{ succeededCount: 0, failedAt: { index, message }, rolledBack: true }`，全部成功则 `commit()` 并返回 `{ succeededCount: N, rolledBack: false }`，结构与 `PostgreSQLDriver.importRows/importSql` 完全一致，仅 API 调用方式（`mysql2` 的事务方法 vs `pg` 的 `BEGIN`/`COMMIT`/`ROLLBACK` 原始 SQL）不同。

**Rationale**：直接落实 FR-011/FR-012"整体事务性、失败即整体回滚并报告失败位置"的要求，且与现有 `ImportResult` 类型定义完全兼容，无需改动共享类型。

**Alternatives considered**：无——事务语义要求是明确的，`mysql2` 的事务 API 是该驱动实现事务的唯一惯用方式。

## 12. 备份能力（`mysqldump`）

**Decision**：新增 `detectMysqldump()`，逻辑镜像既有 `detectPgDump()`：优先尝试 PATH 中的 `mysqldump`（通过 `execFile` 调用 `mysqldump --version` 验证可执行），失败则按操作系统扫描常见安装路径（Windows 下 MySQL 官方安装器的 `C:\Program Files\MySQL\MySQL Server <ver>\bin\mysqldump.exe`；macOS Homebrew 的 `/opt/homebrew/opt/mysql/bin/mysqldump` 或 `/usr/local/opt/mysql/bin/mysqldump`；Linux 的 `/usr/bin/mysqldump`）。`db:backup-database` 处理器按连接的 `type` 分支：MySQL 分支使用 `mysqldump --result-file=<path>` 替代 pg 的 `-f <path>`，使用环境变量 `MYSQL_PWD` 传递密码替代 `PGPASSWORD`，参数含 `-h -P -u <db>`（注意 MySQL 参数是大写 `-P` 表示端口，与 pg 的小写 `-p` 不同，避免误用）。

**Rationale**：与现有 `pg_dump` 检测/调用逻辑保持完全一致的用户体验（自动检测 → 未检测到则提示手动指定路径 → 复用同一套错误提示 UI），直接落实 FR-014 与 spec.md Assumptions"检测与容错行为与现有 PostgreSQL 备份能力保持一致的用户体验"。

**Decision（类型定义）**：在 `BackupParams` 新增可选字段 `mysqlDumpPath?: string`，保留现有 `pgDumpPath?: string` 不变，而非合并/重命名为通用字段。

**Rationale**：避免修改已上线的 `pgDumpPath` 字段名对现有 PostgreSQL 备份 UI 造成任何破坏性影响（宪法 VI"向后兼容"），两个可选字段互不干扰，调用方按连接的 `type` 决定读取哪一个。

**Alternatives considered**：

- 将 `pgDumpPath` 泛化重命名为 `dumpToolPath`：会导致所有引用旧字段名的既有代码同步破坏，且收益仅是"少一个字段"，与向后兼容原则冲突，排除

## 13. 渲染进程侧的 SQL 方言差异

**Decision**：`sqlFormat.ts`/`sqlStatements.ts` 增加一个数据库类型参数，按类型选择 `sql-formatter`/`node-sql-parser` 对应的方言标识（`'postgresql'` 或 `'mysql'`，两个库均原生支持这两种方言标识，无需新增依赖）；`SqlEditor.tsx` 通过 `connectionId` 从 `connectionStore` 查得连接的 `DatabaseType`，据此决定传给补全提供者的 `dbType` 与格式化方言，替代当前硬编码的 `'postgresql'`。Monaco 编辑器的语法高亮语言 id 暂不新增 MySQL 专属 tokenizer，沿用现有 `pgsql` 语言注册（不影响功能正确性，仅关键字高亮配色可能与 MySQL 方言存在细微差异，不属于 spec.md 任一 FR/SC 的强制要求）。

**Rationale**：`formatSql`/`splitSqlStatements` 的方言参数化改动成本很低（两个库都已原生支持），能直接消除"MySQL 连接下按 PostgreSQL 语法解析/格式化"这一潜在的用户可感知错误（例如 MySQL 反引号标识符 `` `col` `` 被 PostgreSQL 方言解析器判为语法错误）；而 Monaco 语法高亮的方言 tokenizer 属于纯粹的视觉细节，不影响 SC-001~SC-005 的任一验收标准，故按最小必要原则暂不实现，留作后续迭代空间。

**Alternatives considered**：

- 同步新增 MySQL 专属 Monaco tokenizer 与语言注册：技术上可行，但增加渲染进程打包体积与实现复杂度，且不为任何 FR/SC 所要求，按宪法 VIII"依赖最小化"及"不为假设的未来需求设计"的工程原则暂不采纳
