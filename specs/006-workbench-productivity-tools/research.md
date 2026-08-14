# Research: 工作台效率工具集（导出/DDL/格式化/复制/导入）

**Feature**: `006-workbench-productivity-tools` | **Date**: 2026-08-13

本文档记录 Phase 0 阶段对技术选型与实现方式的调研结论。规格文档（spec.md）不包含任何 `[NEEDS CLARIFICATION]` 标记（均已通过 Assumptions 解决），因此本阶段调研聚焦于"如何在现有架构下实现"而非"需求本身该如何取舍"。

## 1. SQL 格式化库选型

- **Decision**: 引入 `sql-formatter`（npm 包）作为 SQL 编辑器格式化能力的实现依赖。
- **Rationale**:
  - `.specify/memory/constitution.md` 的技术栈表中已明确将 `sql-formatter` 列为 SQL 格式化场景的推荐库，符合"依赖最小化"原则下"新增依赖需有明确、不可替代的价值"的要求。
  - 支持多种 SQL 方言（`postgresql` 等）、可配置关键字大小写、缩进风格，满足 FR-018（统一关键字大小写、子句换行、缩进）。
  - 纯字符串输入输出、无需与数据库连接交互，可在渲染进程本地同步调用，不涉及新增 IPC 通道或安全面扩大。
  - 对无法解析的输入会抛出异常而不是静默产生错误结果，便于实现 FR-020（无法解析时提示并保留原文本）。
- **Alternatives considered**:
  - 自实现基于正则的关键字换行/缩进规则：无法正确处理嵌套子查询、字符串字面量中的关键字等场景，误改语义风险高，与 SC-004（0 处语义偏差）冲突，放弃。
  - `node-sql-parser`（构建 AST 再反向生成）：功能更强大但引入完整 SQL Parser/AST 生成器，超出"格式化排版"这一单一需求所需的复杂度，且体积远大于 `sql-formatter`，违反依赖最小化原则，放弃（仅用于格式化场景）。

## 2. SQL 文件语句拆分（数据导入 - SQL 文件场景）

- **Decision**: 引入 `node-sql-parser`（npm 包）用于将 SQL 文件内容拆分为独立语句数组。该库放在渲染进程侧一个新的 `src/renderer/src/lib/sqlStatements.ts` 工具模块中封装调用，与现有 `QueryPanel.tsx` 的多语句执行入口共用拆分逻辑。
- **Rationale**:
  - `.specify/memory/constitution.md` 的推荐技术栈表已将 `node-sql-parser` 列为"SQL 解析"场景的推荐库（与 `sql-formatter` 并列），因此引入它属于使用宪法既定推荐依赖，而非新增未经论证的依赖，不需要额外的复杂度证明。
  - 相比手写的分号状态机拆分（会忽略字符串字面量/注释中的分号等边界情况，且需要自行维护正确性），`node-sql-parser` 基于真实 SQL 语法解析语句边界，能正确处理字符串字面量内的分号（如 `INSERT INTO t VALUES ('a;b')`），对 FR-024（按语句顺序执行）与 FR-027（写入前校验文件可解析——解析失败即视为无效文件）更可靠。
  - 现有 `queryService.executeMultiple(statements: string[])`（`src/renderer/src/services/queryService.ts:82`）已经要求调用方传入拆分好的语句数组，说明"拆分"这一步职责本就在渲染进程侧；引入统一的拆分工具可同时服务 SQL 文件导入与未来的多语句执行场景，不重复实现。
  - 无法解析的语句（如数据库特有的存储过程/触发器体语法）会在解析阶段直接报错，符合 FR-027"写入任何数据前拒绝无效文件"的要求，不会产生部分写入。
- **Alternatives considered**:
  - 手写状态机分号拆分器：虽然可行，但重新实现了宪法已推荐、成熟度更高的 `node-sql-parser` 的能力，且手写实现的边界情况覆盖不如成熟解析器，放弃。
  - 直接 `sql.split(';')`：无法处理字符串内分号，会产生错误的语句边界，违反 FR-024 语义正确性要求，放弃。

## 3. CSV 解析库选型（数据导入 - CSV 文件场景）

- **Decision**: 引入 `papaparse`（npm 包）用于导入侧的 CSV 解析（读取待导入文件），复用其流式/同步解析 API。导出侧（生成 CSV）沿用现有 `TaskScheduler.ts` 中 `toCsv` 助手已验证过的转义规则（对逗号/引号/换行进行转义、双写内嵌引号、`null` 渲染为空字段），在新模块中以相同规则重新实现一个无 Node.js 依赖、可在渲染进程直接调用的版本，不引入额外依赖。
- **Rationale**:
  - 手写 CSV 解析（读取方向）需要正确处理带引号字段、字段内逗号/换行、转义引号等边界情况（Edge Cases 已列出"结果集中某些单元格包含逗号、换行、双引号"及类似场景在导入侧同样存在），手写实现出错概率高且是本功能中价值最高的健壮性来源，因此选择成熟库而非手写。
  - `papaparse` 无 Node.js 专有 API 依赖，可在渲染进程（沙盒环境，`nodeIntegration=false`）中直接使用，不需要经过主进程往返，符合导入流程"先在渲染进程内校验/预览再确认导入"的交互需求（FR-023 列映射步骤、FR-027 写入前校验）。
  - 导出方向（生成 CSV 文本）本身逻辑简单（只是转义规则的应用，没有"解析歧义"问题），复用已在 `TaskScheduler.ts:385-396` 验证过的转义规则手写实现即可，不需要引入额外库，符合依赖最小化原则。
- **Alternatives considered**:
  - 全部手写（含解析）：调研中确认对含引号转义字段的 CSV 解析手写实现测试成本高、边界情况多，放弃。
  - `csv-parse`（Node.js 生态常见库）：功能与 `papaparse` 类似，但更贴近 Node.js Stream API，在纯浏览器沙盒渲染进程中使用体验不如 `papaparse` 直接，选择 `papaparse`。

## 4. JSON 导入/导出

- **Decision**: 直接使用平台内置 `JSON.parse`/`JSON.stringify`，不引入额外依赖。
- **Rationale**: JSON 是结构化格式，浏览器/Node.js 运行时内置解析器已完全满足 FR-022（JSON 文件导入）与 FR-006/FR-008（JSON 导出）的所有要求，无需额外校验库。
- **Alternatives considered**: 无需考虑替代方案，内置能力已充分。

## 5. PostgreSQL DDL 生成方式（查看 DDL 功能）

- **Decision**: PostgreSQL 没有原生 `SHOW CREATE TABLE` 语句，DDL 文本需要在 `PostgreSQLDriver.ts` 中通过组合以下已知可用的系统目录/函数在主进程内"拼装"生成：
  - 列定义：复用 `getColumns` 已使用的 `information_schema.columns`（`PostgreSQLDriver.ts:188` 起）查询到的列名、类型、默认值、可空性、注释信息，拼装为 `CREATE TABLE` 的列子句。
  - 主键/唯一约束/外键：复用 `getColumns` 中已查询的 `information_schema.table_constraints`/`key_column_usage`/`referential_constraints`/`constraint_column_usage`（`PostgreSQLDriver.ts:200-201, 281-286`）拼装为 `CONSTRAINT` 子句。
  - 索引：复用 `getIndexes` 已使用的 `pg_catalog.pg_get_indexdef(idx.oid)`（`PostgreSQLDriver.ts:324`）直接输出可执行的 `CREATE INDEX` 语句，附加在表 DDL 之后。
  - 视图定义：使用 `pg_catalog.pg_get_viewdef(oid, true)`（格式化输出），比照现有 `pg_get_triggerdef`/`pg_get_indexdef` 用法（`PostgreSQLDriver.ts:324, 350`），组装为 `CREATE OR REPLACE VIEW <schema>.<view> AS\n<viewdef>`。
- **Rationale**: 这些系统目录表和 `pg_get_*` 函数均是 PostgreSQL 内置、稳定的公开接口（无需超级用户权限，遵循用户现有连接权限，符合 spec.md Assumption"不额外提升或绕过数据库本身的权限控制"），且与本代码库现有 `getIndexes`/`getTriggers` 已经验证过的调用方式一致，不需要新增第三方库或第三方元数据服务。
- **Alternatives considered**:
  - 使用 `pg_dump --schema-only` 子进程调用：`pg_dump` 已在 `TaskScheduler.ts`（`pgDump` 模板）中用于备份场景，但那是"整库/整对象导出到文件"的重量级操作，需要额外的子进程管理和二进制路径依赖，对"右键查看单表 DDL，1 秒内展示"（SC-001）这种轻量高频交互而言过重，放弃。
  - 第三方 npm 包（如 `pg-structure`）：会引入完整的数据库结构反射框架，远超"生成 DDL 文本"这一单点需求，违反依赖最小化原则，放弃。

## 6. 事务性批量写入（数据导入 - 原子性回滚需求）

- **Decision**: 在 `PostgreSQLDriver.ts` 新增一个 `importRows` 方法（作为 `IDatabaseDriver` 上的必需方法，因为 FR-025 的原子性回滚是本功能的核心承诺，不适合作为可选能力降级为"不支持"），内部通过 `pool.connect()` 显式获取一个客户端连接（复用现有 `PostgreSQLDriver.ts:89, 378` 已经使用的 `pool.connect()` 模式），在该连接上依次执行 `BEGIN` → 逐行参数化 `INSERT` → 全部成功后 `COMMIT`；任意一行失败则立即 `ROLLBACK` 并释放连接，返回失败位置和原因。
- **Rationale**:
  - 代码库检索确认（`Grep` `BEGIN|COMMIT|ROLLBACK|pool.connect()`）目前主进程中不存在任何事务包裹逻辑，`queryService.executeMultiple` 只是循环调用非事务的 `execute`（`queryService.ts:82-92`），无法满足 FR-025"整体回滚，不产生部分导入"的强约束，因此必须新增能力，而非复用现有查询通道。
  - 复用同一个 `pool.connect()` 后获取的客户端执行 `BEGIN`/多条 `INSERT`/`COMMIT`/`ROLLBACK`，是 `pg` 库官方推荐的标准事务模式，与本文件已有的连接获取写法保持一致，不引入新的连接管理心智负担。
  - 参数化查询（`$1, $2, ...`）而非拼接 SQL 字符串写入用户数据，避免 SQL 注入风险，符合"安全编码"要求。
  - SQL 文件导入（FR-024）复用同一事务包裹思路：将拆分好的语句数组整体放入同一个 `BEGIN`/`COMMIT`/`ROLLBACK` 区间内顺序执行，与 CSV/JSON 行导入共享同一个事务执行原语，避免为两种输入格式各自实现一套事务逻辑。
- **Alternatives considered**:
  - 每行使用独立的 `driverManager.query` 调用（当前 `executeMultiple` 的模式）：不支持跨语句共享事务，无法满足 FR-025，放弃。
  - 在渲染进程侧收集所有行后一次性拼一条多值 `INSERT INTO t VALUES (...), (...), ...` 大语句发给现有 `db:query` 通道：对数千行级别（SC-005 提到的规模）会生成巨大的单条 SQL 字符串，且失败时无法精确报告"具体失败的行号"（FR-025 要求），放弃；采用逐行参数化执行以获得精确的行级错误定位。

## 7. 导出/导入文件对话框

- **Decision**: 在 `src/main/ipc/fs.ts` 新增 `fs:pick-save-file`（对应 Electron `dialog.showSaveDialog`，用于导出）与 `fs:pick-open-file`（对应 `dialog.showOpenDialog` 但允许按扩展名过滤且不限定为目录，用于导入选择文件），复用该文件已有的 `fs:pick-folder` 的实现风格（`createIPCHandler` + `dialog.show*Dialog`）。
- **Rationale**: 现有 `fs:pick-folder`（`src/main/ipc/fs.ts`）只支持选择目录，导出单个文件（FR-006 相关的"提示选择保存位置"）与导入选择单个文件（FR-022）都需要新的对话框类型，遵循已有 IPC 命名与实现约定即可满足，无需新依赖。
- **Alternatives considered**: 在渲染进程用 `<input type="file">`：无法用于"保存"场景（导出需要选择保存路径而不是选择已存在文件），且绕开了主进程集中管理文件系统访问的既有安全边界（`contextIsolation`），放弃。

## 8. 结论汇总

| 决策点           | 结论                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| SQL 格式化       | 新增依赖 `sql-formatter`                                                                               |
| SQL 文件语句拆分 | 新增依赖 `node-sql-parser`（宪法推荐技术栈已列出）                                                     |
| CSV 导入解析     | 新增依赖 `papaparse`                                                                                   |
| CSV 导出生成     | 复用现有转义规则手写实现，不新增依赖                                                                   |
| JSON 导入/导出   | 内置 `JSON.parse`/`stringify`，不新增依赖                                                              |
| 表/视图 DDL 生成 | 组合现有 PostgreSQL 系统目录查询 + `pg_get_viewdef`，不新增依赖                                        |
| 事务性批量导入   | 新增 `IDatabaseDriver.importRows` 必需方法，基于现有 `pool.connect()` 模式实现 `BEGIN/COMMIT/ROLLBACK` |
| 文件选择对话框   | 新增 `fs:pick-save-file`、`fs:pick-open-file` IPC 通道，复用现有 `dialog.show*Dialog` 模式             |

无遗留的 `[NEEDS CLARIFICATION]` 项。
