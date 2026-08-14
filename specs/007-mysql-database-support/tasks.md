# 任务清单：MySQL 数据库连接支持

**输入**：[plan.md](./plan.md)、[spec.md](./spec.md)、[data-model.md](./data-model.md)、[contracts/db-ipc-mysql.md](./contracts/db-ipc-mysql.md)、[research.md](./research.md)、[quickstart.md](./quickstart.md)
**分支**：`007-mysql-database-support`
**测试策略**：项目当前无自动化测试框架（`vitest`/`jest` 均未引入），本清单不生成测试任务；验证方式为 `pnpm run typecheck` + `pnpm run lint` 零错误，以及按 [quickstart.md](./quickstart.md) 逐条手动验证（见各阶段 Checkpoint 与 Final Phase）。

## 格式说明

`- [ ] [TaskID] [P?] [Story?] 描述（含文件路径）`

- `[P]`：可与同阶段其他 `[P]` 任务并行执行（不同文件、无相互依赖）
- `[US1]`～`[US6]`：对应 spec.md 中的用户故事编号，仅用户故事阶段任务标注
- 未特别注明依赖的任务默认可在其所在阶段的前置任务完成后立即开始

---

## Phase 1：Setup（项目初始化）

- [X] T001 在根目录 `package.json` 新增 `mysql2` 依赖并执行 `pnpm install`（唯一新增依赖，见 research.md §1）
- [X] T002 [P] 创建 `src/main/db/driver/mysql/` 目录骨架：`MySQLDriver.ts`（导出空类占位，暂不实现方法）与 `index.ts`（桶导出，镜像 `src/main/db/driver/pg/index.ts`）
- [X] T003 [P] 修改 `src/renderer/src/types/ipc.ts`：`DatabaseType` 联合类型由 `'postgresql'` 扩展为 `'postgresql' | 'mysql'`；`BackupParams` 新增可选字段 `mysqlDumpPath?: string`（保留现有 `pgDumpPath?` 不变，见 data-model.md §7/§8）

**Checkpoint**：依赖安装完成，新驱动目录与共享类型改动就位，`pnpm run typecheck` 此时会因缺失 `mysql` 分支而在多处报错——这些报错正是后续阶段要修复的必改点（见 plan.md Constitution Check II）。

---

## Phase 2：Foundational（阻塞性前置任务，所有用户故事共享）

**目的**：让 `MySQLDriver` 可被工厂正确构造、被渲染进程选中，为 Phase 3 起的各用户故事任务提供可复用的驱动骨架与工具方法。

- [X] T004 在 `src/main/db/driver/mysql/MySQLDriver.ts` 实现 `MySQLDriver` 类骨架：`readonly id`/`readonly type = 'mysql'` 字段、私有 `Map<string, Pool>` 连接池字段、私有 `getPool(database)` 辅助方法（按需创建/复用对应数据库的连接池，镜像 `PostgreSQLDriver.pools` 模式，见 research.md §2）、`getStatus(): ConnectionStatus`（依赖：T002、T003）
- [X] T005 在 `src/main/db/driver/mysql/MySQLDriver.ts` 构建 `mysql2` 导出的 `Types` 反转类型码映射表，并实现 `mapField()` 风格的字段类型转换辅助函数（镜像 `PostgreSQLDriver` 的 `OID_TO_TYPE_NAME`，见 research.md §10）（依赖：T004）
- [X] T006 修改 `src/main/db/factory.ts` 的 `createDriver()`：新增 `case 'mysql': return new MySQLDriver(id)` 分支（依赖：T004）
- [X] T007 [P] 修改 `src/renderer/src/config/databaseCapabilities.ts`：`DATABASE_CAPABILITIES` 新增 `mysql` 条目（参照 `postgresql` 条目的 `databaseLevelModules`/`schemaLevelModules`/`hasSecurityModule` 结构）（依赖：T003）
- [X] T008 [P] 修改 `src/renderer/src/components/work/ConnectionForm.tsx`：数据库类型下拉新增 "MySQL" 选项；切换类型时联动默认端口（`5432` ↔ `3306`）与默认用户名（依赖：T003）

**Checkpoint**：`MySQLDriver` 可被 `factory.ts` 正确实例化，连接表单可选择 "MySQL" 类型并获得正确的端口默认值；驱动尚无任何实际数据库操作能力（Phase 3 起逐步补全）。

---

## Phase 3：User Story 1 - 新建并连接 MySQL 数据库（P1）

**目标**：用户可新建 MySQL 类型连接、测试连接可达性、建立连接并看到可访问的数据库列表。
**独立测试标准**：按 [quickstart.md](./quickstart.md) Step 1 执行——新建连接选择 MySQL、测试连接成功显示版本与延迟、错误密码测试显示明确失败原因、保存并双击连接后导航树展示全部可访问数据库；对应 FR-001/FR-002/FR-003、SC-001（2 分钟内完成整套流程）。

- [X] T009 [US1] 在 `MySQLDriver.ts` 实现静态方法 `testConnection(config): Promise<TestResult>`：一次性探测连接（不进入连接池生命周期），成功返回 `{ success: true, serverVersion, latencyMs }`，失败返回携带中文错误信息的 `{ success: false, error }`（依赖：T004）
- [X] T010 [US1] 在 `MySQLDriver.ts` 实现 `connect(config): Promise<ConnectionResult>`：建立管理连接，不强制指定 `database`（仅当 `config.database` 显式提供时才传入建池参数，见 research.md §3），更新内部连接状态（依赖：T004）
- [X] T011 [US1] 在 `MySQLDriver.ts` 实现 `disconnect(): Promise<void>`：遍历连接池 `Map` 逐一调用 `pool.end()`（依赖：T004）
- [X] T012 [US1] 在 `MySQLDriver.ts` 实现 `getDatabases(): Promise<DatabaseInfo[]>`：执行 `SHOW DATABASES`，不过滤 `information_schema`/`mysql`/`performance_schema`/`sys`（见 research.md §4）（依赖：T010）
- [X] T013 [US1] 修复 `src/main/ipc/db.ts` 的 `db:test-connection` 处理器：新增 `getDriverClass(type)` 小工具函数，按 `config.type` 分发到 `PostgreSQLDriver` 或 `MySQLDriver` 的静态 `testConnection`（替换当前无条件调用 `PostgreSQLDriver.testConnection` 的缺陷，见 contracts/db-ipc-mysql.md B.1）（依赖：T009）

**Checkpoint**：User Story 1 可独立验证（quickstart.md Step 1 全部通过）。

---

## Phase 4：User Story 2 - 浏览数据库结构并执行查询（P1）

**目标**：用户可浏览 MySQL 数据库下的 schema/表/视图/列结构，并在 SQL 编辑器中执行查询获得结果或明确的错误提示。
**独立测试标准**：按 quickstart.md Step 2 执行——展开数据库看到表与视图、查看列定义与 `SHOW FULL COLUMNS` 一致、执行 `SELECT ... LIMIT 10` 得到结果集与耗时、执行语法错误语句得到 MySQL 原始错误信息且不崩溃；对应 FR-004/FR-005/FR-009、SC-002。

- [X] T014 [US2] 在 `MySQLDriver.ts` 实现 `query(database, sql, params?): Promise<QueryResult>`：取/建对应数据库连接池，使用 `?` 占位符参数化执行，返回字段信息/行数据/行数/耗时；执行失败时抛出携带 MySQL 原始错误信息的 `Error`（依赖：T004）
- [X] T015 [US2] 在 `MySQLDriver.ts` 实现 `getSchemas(database): Promise<SchemaInfo[]>`：返回合成单元素数组 `[{ name: database, owner: '' }]`（见 research.md §5）（依赖：T004）
- [X] T016 [US2] 在 `MySQLDriver.ts` 实现 `getTables(database, schema): Promise<TableInfo[]>`：查询 `information_schema.TABLES`，`TABLE_TYPE = 'BASE TABLE'` 映射为 `'table'`、`= 'VIEW'` 映射为 `'view'`，`comment` 取 `TABLE_COMMENT`（依赖：T004）
- [X] T017 [US2] 在 `MySQLDriver.ts` 实现 `getColumns(database, schema, table): Promise<ColumnInfo[]>`：查询 `information_schema.COLUMNS`，映射 `name`/`dataType`/`nullable`/`defaultValue`/`isPrimaryKey`/`comment`（依赖：T005）

**Checkpoint**：User Story 1 + 2 可独立验证（quickstart.md Step 1-2 全部通过）。

---

## Phase 5：User Story 3 - 索引、触发器、存储过程/函数、DDL、用户权限（P2）

**目标**：用户可查看表的索引与触发器、数据库的存储过程/函数、表和视图的 DDL 定义，以及服务器级用户/权限列表（FR-017 全量对齐）。
**独立测试标准**：按 quickstart.md Step 3 执行——索引面板与 `SHOW INDEX` 一致、触发器面板与 `SHOW CREATE TRIGGER` 一致且显示"已启用"、存储过程/函数面板与 `information_schema.ROUTINES` 一致、DDL 查看与 `SHOW CREATE TABLE`/`SHOW CREATE VIEW` 一致且可一键复制、用户/权限面板与 `mysql.user` 查询逐行一致；对应 FR-006/FR-007/FR-008/FR-010/FR-017、SC-002。

- [X] T018 [US3] 在 `MySQLDriver.ts` 实现 `getIndexes(database, schema, table): Promise<IndexInfo[]>`：查询 `information_schema.STATISTICS`，按 `INDEX_NAME` 聚合列，`INDEX_NAME = 'PRIMARY'` 判定主键、`NON_UNIQUE = 0` 判定唯一（见 research.md §7）（依赖：T004）
- [X] T019 [US3] 在 `MySQLDriver.ts` 实现 `getTriggers(database, schema, table): Promise<TriggerInfo[]>`：调用 `SHOW CREATE TRIGGER <name>` 取 `SQL Original Statement` 作为 `definition`，`enabled` 固定返回 `true`（MySQL 无禁用机制，见 research.md §7）（依赖：T004）
- [X] T020 [US3] 在 `MySQLDriver.ts` 实现私有 `getRoutines(database, schema, routineType)` 辅助方法：查询 `information_schema.ROUTINES` 联合 `PARAMETERS`（`GROUP_CONCAT` 拼接参数签名），按 `ROUTINE_TYPE` 过滤（依赖：T004）
- [X] T021 [US3] 在 `MySQLDriver.ts` 实现 `getFunctions(database, schema): Promise<RoutineInfo[]>`：调用 `getRoutines(..., 'FUNCTION')`，`returnType` 取 `DTD_IDENTIFIER`（依赖：T020）
- [X] T022 [US3] 在 `MySQLDriver.ts` 实现 `getProcedures(database, schema): Promise<RoutineInfo[]>`：调用 `getRoutines(..., 'PROCEDURE')`（依赖：T020）
- [X] T023 [US3] 在 `MySQLDriver.ts` 实现 `getRoles(): Promise<RoleInfo[]>`：查询 `mysql.user` 表，映射 `name ← CONCAT(User,'@',Host)`、`isSuperuser ← Super_priv='Y'`、`canLogin ← account_locked<>'Y'`、`connectionLimit ← max_user_connections`（见 research.md §8）（依赖：T004）
- [X] T024 [US3] 在 `MySQLDriver.ts` 实现 `getTableDdl(database, schema, table): Promise<string>`：执行 `SHOW CREATE TABLE`，失败时抛出"表不存在或当前用户无权限查看其结构"等中文错误（依赖：T004）
- [X] T025 [US3] 在 `MySQLDriver.ts` 实现 `getViewDdl(database, schema, view): Promise<string>`：执行 `SHOW CREATE VIEW`，失败时抛出对应中文错误（依赖：T004）

**Checkpoint**：User Story 1-3 可独立验证（quickstart.md Step 1-3 全部通过）。

---

## Phase 6：User Story 4 - 导入数据（P3）

**目标**：用户可整体事务性地按行或按 SQL 语句向 MySQL 表导入数据，失败时整体回滚并报告出错位置。
**独立测试标准**：按 quickstart.md Step 4 执行——按行导入全部成功报告成功行数、构造约束冲突数据验证整体回滚并报告出错行号、按 SQL 语句导入验证成功计数与中途失败整体回滚并报告失败语句序号；对应 FR-011/FR-012。

- [X] T026 [US4] 在 `MySQLDriver.ts` 实现 `importRows(database, schema, table, columns, rows): Promise<ImportResult>`：使用 `beginTransaction`/`commit`/`rollback`，`?` 占位符逐行插入，首次失败即整体回滚并返回 `{ succeededCount: 0, failedAt: { index, message }, rolledBack: true }`（见 research.md §11）（依赖：T004）
- [X] T027 [US4] 在 `MySQLDriver.ts` 实现 `importSql(database, statements): Promise<ImportResult>`：同上事务模型，逐语句执行，失败报告失败语句序号（依赖：T004）
- [X] T028 [US4] 修改 `src/renderer/src/lib/sqlStatements.ts` 的 `splitSqlStatements()`：新增数据库类型参数，按类型选择 `node-sql-parser` 的 `database` 方言（`'postgresql' | 'mysql'`）（依赖：T003）
- [X] T029 [US4] 修改 `src/renderer/src/components/work/ImportDataDialog.tsx`：调用 `splitSqlStatements` 时，按当前连接的 `DatabaseType`（经 `connectionStore` 按 `connectionId` 查得）传入方言参数（依赖：T028）

**Checkpoint**：User Story 1-4 可独立验证（quickstart.md Step 1-4 全部通过）。

---

## Phase 7：User Story 5 - 生成 ER 图（P3）

**目标**：用户可为所选表生成包含外键关系连线的 ER 图；不支持外键的表仍正常展示结构而不报错。
**独立测试标准**：按 quickstart.md Step 5 执行——选择有外键关系的表验证连线与 `SHOW CREATE TABLE` 的 `FOREIGN KEY` 定义一致；选择 MyISAM 等不支持外键的表验证仍正常展示结构、无连线、不报错；对应 FR-013。

- [X] T030 [US5] 在 `MySQLDriver.ts` 实现 `getErDiagramData(database, schemas): Promise<ErDiagramData>`：并行执行列结构查询与 `information_schema.KEY_COLUMN_USAGE` 联合 `REFERENTIAL_CONSTRAINTS` 的外键关系查询（筛选 `REFERENCED_TABLE_NAME IS NOT NULL`），聚合为 `tables`/`relations`；无外键时 `relations` 返回空数组（见 research.md §9）（依赖：T017）

**Checkpoint**：User Story 1-5 可独立验证（quickstart.md Step 1-5 全部通过）。

---

## Phase 8：User Story 6 - 备份数据库（P4）

**目标**：用户可使用 `mysqldump` 备份 MySQL 数据库，未检测到工具时可手动指定路径，权限不足时展示明确错误。
**独立测试标准**：按 quickstart.md Step 6 执行——`mysqldump` 可用时触发备份生成有效 SQL 文件并提示成功；移除/未安装 `mysqldump` 时提示"未找到 mysqldump"并支持手动指定路径重试；无导出权限账号触发备份展示具体错误原因；对应 FR-014。

- [X] T031 [US6] 修改 `src/main/ipc/db.ts`：新增 `detectMysqldump(): Promise<string | null>`，镜像既有 `detectPgDump()`——优先探测 PATH 中的 `mysqldump`（`execFile` 调用 `--version` 验证），失败则按操作系统扫描常见安装路径（见 research.md §12）
- [X] T032 [US6] 修复 `src/main/ipc/db.ts` 的 `db:backup-database` 处理器：新增按连接 `type` 的分支——MySQL 分支使用 `detectMysqldump()`/手动指定路径、`MYSQL_PWD` 环境变量传密码、拼装 `mysqldump -h <host> -P <port> -u <user> <database> --result-file=<outFile>`（注意大写 `-P`，与 pg 的小写 `-p` 不同）；第 4 个参数内部重命名为 `dumpToolPath`（不改变 IPC 通道名、参数个数与参数类型，见 contracts/db-ipc-mysql.md B.2）（依赖：T031）
- [X] T033 [US6] 修改 `src/renderer/src/components/schema/BackupDialog.tsx`：按当前连接的 `DatabaseType` 决定传入 `pgDumpPath` 还是 `mysqlDumpPath` 参数，并联动"pg_dump 路径"/"mysqldump 路径"提示文案（依赖：T003、T032）

**Checkpoint**：User Story 1-6 全部可独立验证（quickstart.md Step 1-6 全部通过）。

---

## Final Phase：Polish & Cross-Cutting Concerns

**目的**：补齐渲染进程侧 SQL 方言差异的最后一处硬编码分支，并完成宪法"自测验证流程"要求的整体质量门槛。

- [X] T034 [P] 修改 `src/renderer/src/lib/sqlFormat.ts` 的 `formatSql()`：新增数据库类型参数，按类型选择 `sql-formatter` 的 `language`（`'postgresql' | 'mysql'`）（依赖：T003）
- [X] T035 [P] 修改 `src/renderer/src/lib/monaco/sqlConfig.ts` 的 `SQL_COMPLETION_CONFIG`：新增 `mysql` 关键字/函数/数据类型/代码片段条目（依赖：T003）
- [X] T036 修改 `src/renderer/src/components/work/SqlEditor.tsx`：通过 `connectionId` 从 `connectionStore` 查得连接的 `DatabaseType`，替换当前硬编码的 `'postgresql'`，用于决定补全提供者的 `dbType` 以及传给 `formatSql`/`splitSqlStatements` 的方言参数（依赖：T028、T034、T035）
- [ ] T037 按 [quickstart.md](./quickstart.md) Step 7 手动验证：同时保有 PostgreSQL 与 MySQL 连接时 3 秒内可通过图标/文字区分类型（SC-005/FR-015）；对已撤销权限的对象查看时展示明确错误提示而非空白或崩溃（SC-005、FR-016）（依赖：T007、T008、全部功能任务）
  - 静态核查发现 `ServerNode.tsx`（连接列表顶层节点）此前未按连接类型区分图标或文案，仅有通用 `Server` 图标与连接状态徽标，不满足 FR-015；已补充按 `conn.config.type` 着色的图标（PostgreSQL 蓝 / MySQL 橙）与显式 "PostgreSQL"/"MySQL" 文字徽标，`pnpm run typecheck` 与该文件的 `eslint` 均为零错误零警告
  - 静态核查确认 FR-016 的错误展示路径已存在且为方言无关通用逻辑：`connectionStore` 的 `loadModuleItems` 捕获驱动方法异常写入 `module.error`，`ModuleGroup.tsx` 在 `!loading && error` 时渲染错误文案而非空白；`MySQLDriver.getTableDdl`/`getViewDdl` 等方法失败时已抛出携带中文提示的 `Error`，与 PostgreSQL 分支复用同一渲染路径
  - 本任务标注的"手动验证"要求需要真实 MySQL 5.7+/8.0 实例、已撤销权限的测试账号，并交互式运行 `pnpm run dev` 逐条核对 quickstart.md Step 0-7；当前工具环境无可用 MySQL 服务且无法驱动图形界面交互，因此保留未勾选——建议由使用者按 quickstart.md 补充执行该项手动验证
- [X] T038 执行 `pnpm run typecheck` 与 `pnpm run lint`，确认零错误零警告（quickstart.md Step 0 门槛，宪法"自测验证流程"）（依赖：全部实现任务）

---

## Dependencies & Execution Order

**阶段依赖**：

- Phase 1（Setup） → Phase 2（Foundational）：Phase 2 全部任务依赖 T002/T003
- Phase 2（Foundational） → Phase 3-8（各用户故事）：每个用户故事的驱动方法任务均依赖 T004（`MySQLDriver` 骨架），部分依赖 T005（字段映射，US2/US5）
- Phase 3（US1） → Phase 4（US2）：US2 的 `query()`/结构浏览方法不强制依赖 US1 的连接建立逻辑本身，但需要 T004 骨架；两者均为 P1，建议按顺序交付但技术上可并行开发
- Phase 4（US2） → Phase 5（US3）：T026（ER 图）依赖 T017（`getColumns`），其余 US3 任务仅依赖 T004，可与 US2 并行开发
- Phase 3-7 → Phase 8（US6）：备份功能不依赖驱动的具体查询方法，可与其他用户故事并行开发，仅依赖 T003（类型定义）
- 全部用户故事阶段 → Final Phase：Final Phase 的方言收口任务（T036）依赖 US4 的 T028 与 Polish 内部的 T034/T035

**故事内部依赖**：见各任务后括注的"依赖"字段；同一文件（`MySQLDriver.ts`）内的多个方法实现任务不可并行（避免同文件编辑冲突），仅跨文件任务标注 `[P]`。

**建议实现顺序**（严格顺序，用于单人/单线程实现）：

```text
T001 → T002/T003 → T004 → T005 → T006 → T007/T008
  → T009 → T010 → T011 → T012 → T013            (US1)
  → T014 → T015 → T016 → T017                    (US2)
  → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025   (US3)
  → T026 → T027 → T028 → T029                    (US4)
  → T030                                          (US5)
  → T031 → T032 → T033                            (US6)
  → T034 → T035 → T036 → T037 → T038              (Polish)
```

---

## Parallel Example

**Phase 2（Foundational）**：T007（`databaseCapabilities.ts`）与 T008（`ConnectionForm.tsx`）为不同文件、互不依赖，可与 T004-T006（`MySQLDriver.ts`/`factory.ts`）并行开发：

```text
同时进行：
  开发者 A：T004 → T005 → T006（MySQLDriver 骨架 + 工厂注册）
  开发者 B：T007（databaseCapabilities.ts）
  开发者 C：T008（ConnectionForm.tsx）
```

**Final Phase（Polish）**：T034（`sqlFormat.ts`）与 T035（`sqlConfig.ts`）为不同文件，可并行，之后再汇入 T036（`SqlEditor.tsx`）：

```text
同时进行：
  开发者 A：T034（sqlFormat.ts 方言参数）
  开发者 B：T035（sqlConfig.ts 补全条目）
汇合后：
  T036（SqlEditor.tsx 依据连接类型派发方言）
```

跨用户故事的并行机会：由于 US1-US6 的驱动方法均集中在同一个 `MySQLDriver.ts` 文件中，多用户故事的驱动实现任务**不建议**并行（会产生同文件合并冲突），但 US6（备份，`db.ts` + `BackupDialog.tsx`）与 US1-US5（`MySQLDriver.ts`）分处不同文件，可作为独立并行轨道整体推进。

---

## Implementation Strategy

**MVP 优先**：由于 spec.md 中 User Story 1（新建并连接）与 User Story 2（浏览结构并执行查询）同为 P1，MVP 范围建议覆盖 Phase 1 → Phase 2 → Phase 3（US1） → Phase 4（US2），共 17 个任务（T001-T017），完成后即可交付"连接 MySQL 并执行基本查询"的最小可用增量，独立满足 quickstart.md Step 1-2。

**增量交付顺序**：

1. MVP：Phase 1-4（Setup + Foundational + US1 + US2）——T001-T017
2. 增量 1：Phase 5（US3，索引/触发器/例程/DDL/权限）——T018-T025，P2 优先级
3. 增量 2：Phase 6-7（US4 导入数据 + US5 ER 图）——T026-T030，P3 优先级，两者可并行推进（不同方法，同文件但可顺序快速交付）
4. 增量 3：Phase 8（US6 备份）——T031-T033，P4 优先级，可与增量 1/2 并行开发（不同文件）
5. 收尾：Final Phase（T034-T038），SQL 方言收口与整体质量门槛验证

**并行团队策略**（若多人协作）：一条轨道专注 `MySQLDriver.ts` 内的方法实现（按 US1→US2→US3→US4→US5 顺序单文件推进，避免合并冲突），另一条轨道专注渲染进程侧改动（T007/T008/T028/T029/T033/T034/T035/T036）与 `src/main/ipc/db.ts` 的两处缺陷修复（T013/T031/T032），两条轨道仅在 Final Phase 的 T036/T037 汇合。

---

## Notes

- 本功能不新增任何 IPC 通道、不新增数据库表或持久化结构（见 contracts/db-ipc-mysql.md C）；`DriverManager.ts`、`src/main/db/core/types.ts` 均不修改
- 全部驱动方法任务集中在单一文件 `src/main/db/driver/mysql/MySQLDriver.ts`，实现时建议严格按 T009→T038 的顺序推进以避免大量本地合并冲突
- 每个用户故事阶段完成后，均可直接对照 quickstart.md 对应 Step 手动验证，不等待后续阶段
- 触发器"已启用"状态、Schema 恒等于 Database、用户权限查看基于 `mysql.user` 等均为 research.md 中已有据可依的设计决策，实现时不应偏离
