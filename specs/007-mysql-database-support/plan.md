# Implementation Plan: MySQL 数据库连接支持

**Branch**: `007-mysql-database-support` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-mysql-database-support/spec.md`

## Summary

在现有基于 `IDatabaseDriver` 适配器模式的数据库连接层中新增 `MySQLDriver`，使 MySQL 连接可复用目前 PostgreSQL 已对接的绝大部分能力：连接管理与测试、数据库/表/视图/列浏览、索引/触发器/存储过程与函数、用户权限查看（FR-017 全量对齐）、SQL 查询执行、DDL 查看、事务性数据导入、ER 图生成与数据库备份。技术方案是新增 `mysql2` 驱动依赖并实现一个新的驱动类（`src/main/db/driver/mysql/MySQLDriver.ts`），通过既有的 `DriverManager`/`factory.ts` 分发机制接入，无需新增 IPC 通道；同时修复两处目前硬编码指向 PostgreSQL 的 IPC 处理逻辑（`db:test-connection`、`db:backup-database`），并在渲染进程侧补齐连接表单、能力注册表、SQL 方言相关的少量分支，使 MySQL 连接与 PostgreSQL 连接在界面上获得一致的操作体验。

## Technical Context

**Language/Version**: TypeScript 5.9+（strict 模式），Electron 39+ 三进程架构（主进程 / 预加载 / 渲染进程），Node.js（Electron 内置运行时）

**Primary Dependencies**: 新增 `mysql2`（Promise API，自带 TypeScript 类型，无需 `@types/mysql2`，作为本功能唯一新增依赖）；复用现有 `pg`（对照参考实现）、`sql-formatter`、`node-sql-parser`、`@monaco-editor/react`、React 19、Zustand 5、Tailwind CSS 4、shadcn/ui

**Storage**: N/A — 应用本身不持久化业务数据，仅通过驱动连接用户自有的 MySQL/PostgreSQL 服务器实例；连接配置的本地加密持久化复用现有 `electron-store` + `safeStorage` 机制，本功能不涉及其结构变更

**Testing**: 无自动化测试框架（项目当前无 `vitest`/`jest` 等测试依赖），遵循宪法"自测验证流程"：`pnpm run typecheck` + `pnpm run lint` 零错误，并按 `quickstart.md` 中的手动验证步骤逐项核对（对照 spec.md 各用户故事的 Independent Test）

**Target Platform**: Windows / macOS / Linux 桌面（Electron 打包应用）

**Project Type**: desktop-app（Electron 三进程架构，单一代码仓库）

**Performance Goals**: 与现有 PostgreSQL 驱动同量级，不新增独立性能目标——连接建立、结构浏览、单次查询响应应与 `PostgreSQLDriver` 无可感知差异（同为基于连接池的异步 I/O 驱动）

**Constraints**: 遵循宪法 I（进程隔离，凭据加密存储，参数化查询）、II（TypeScript 全栈类型安全，零 `any`）、IV（数据库适配器模式，新增数据库类型只需新增适配器，不改动 IPC 层与 UI 层的通用结构）、V（IPC 命名与 invoke/handle 契约）、VII（中文注释与 JSDoc）、VIII（依赖最小化，仅新增 `mysql2` 一个包）

**Scale/Scope**: 单机桌面客户端场景；覆盖 spec.md 全部 6 个用户故事（P1–P4，FR-001 至 FR-018）；新增 1 个驱动类 + 1 个工厂注册项，修改约 9 处既有文件，不新增 IPC 通道、不新增数据库表/持久化结构

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                        | 评估                                                                                                                                                                                                                                                                                                                                                                                                                                  | 结论 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| I. 进程隔离与安全           | `MySQLDriver` 与 `PostgreSQLDriver` 同处主进程 `src/main/db/driver/`，渲染进程不直接接触 `mysql2`；凭据加密存储机制不变。**关于"SQL 注入防护"条款字面写明 `$1, $2` 占位符**：该表述以 PostgreSQL 语法为例，其宪法意图是"禁止字符串拼接、强制参数化查询"，`mysql2` 的原生参数化语法是 `?` 占位符——本功能遵循该意图，`MySQLDriver` 内部一律使用 `?` 占位符传参，不进行字符串拼接拼 SQL；不视为对宪法的违反，仅为跨驱动的语法差异        | PASS |
| II. TypeScript 全栈类型安全 | `MySQLDriver` 实现与 `PostgreSQLDriver` 相同的 `IDatabaseDriver` 接口，复用 `types/ipc.ts` 中已定义的全部共享类型（`ColumnInfo`、`IndexInfo`、`TriggerInfo`、`RoutineInfo`、`RoleInfo`、`ErDiagramData` 等），不新增 `any`；`DatabaseType` 联合类型扩展为 `'postgresql' \| 'mysql'`，触发的 TS 编译错误（如 `databaseCapabilities.ts`、`sqlConfig.ts` 中缺失 `mysql` 键）将在实现阶段逐一补全，属于类型系统主动暴露的必改点，而非遗漏 | PASS |
| III. 组件化与关注点分离     | 渲染进程改动集中在既有组件内部补充分支（`ConnectionForm.tsx` 增加类型选项、`sqlConfig.ts` 增加一条方言配置），不新增跨职责组件，不违反单一职责；不通过 `window.electronAPI` 直连，改动均在既有 Service/组件边界内                                                                                                                                                                                                                     | PASS |
| IV. 数据库适配器模式        | 这正是该原则预留的扩展场景："新增数据库类型只需新增适配器"。`MySQLDriver` 实现统一的 `IDatabaseDriver`，通过 `factory.ts` 一行 `case` 分支接入，`DriverManager.ts` 因已有的方法存在性防御式分发（`typeof driver.xxx === 'function'`）无需任何改动即可支持                                                                                                                                                                             | PASS |
| V. IPC 通信契约             | 不新增任何 IPC 通道；现有 `db:*` 通道通过 `type` 字段和 `DriverManager` 分发到正确的驱动实例。修复 `db:test-connection`（当前硬编码调用 `PostgreSQLDriver.testConnection`）与 `db:backup-database`（当前硬编码 `pg_dump` 参数）两处历史遗留的硬编码分支，使其按连接的 `type` 正确分发——这是缺陷修复，不是契约变更                                                                                                                     | PASS |
| VI. 分阶段交付与向后兼容    | 本功能不改变现有 PostgreSQL 连接的任何行为（新增 `mysqlDumpPath?` 为可选字段，`pgDumpPath?` 保留不变），MySQL 支持作为增量能力叠加，不破坏已交付阶段                                                                                                                                                                                                                                                                                  | PASS |
| VII. 中文文档与注释规范     | `MySQLDriver.ts` 及所有修改文件的导出函数/接口均按宪法要求补充中文 JSDoc；本计划及后续 research/data-model/quickstart 文档全部使用简体中文                                                                                                                                                                                                                                                                                            | PASS |
| VIII. 依赖最小化            | 仅新增 `mysql2`（宪法"推荐技术栈"表未列出 MySQL 驱动选项，但 IV 条款明确预留 MySQL 扩展；`mysql2` 是 Node.js 生态事实标准的 MySQL 驱动，纯 JS 实现、Promise API、自带类型、无需额外 `@types` 包，符合 VIII 条款"评估包体积和原生依赖"的选型标准）；不引入 ORM、连接池抽象库或额外的 SQL 方言处理库                                                                                                                                    | PASS |

无宪法违规项，无需填写 Complexity Tracking。

**Post-Design 复核**（Phase 1 设计产出 `research.md`/`data-model.md`/`contracts/db-ipc-mysql.md`/`quickstart.md` 后回填）：设计阶段确认 `MySQLDriver` 需要实现的接口方法集合（`IDatabaseDriver` 全部必需方法 + FR-006/007/008/010/013/017 对应的可选方法）与既有接口定义完全吻合，未发现需要修改 `IDatabaseDriver`/`DriverManager`/IPC 契约的新增诉求；唯一发现的范围内契约变更是 `contracts/db-ipc-mysql.md` 中记录的两处 IPC 处理器缺陷修复（`db:test-connection`、`db:backup-database`）以及 `BackupParams` 新增可选字段 `mysqlDumpPath?`，二者均已在 Constitution Check 表 V/VI 两行评估为 PASS，设计阶段没有引出新的宪法风险，**结论：Constitution Check 全部 8 项原则复核后仍为 PASS，无需新增 Complexity Tracking 条目**。

## Project Structure

### Documentation (this feature)

```text
specs/007-mysql-database-support/
├── plan.md              # 本文件（/speckit-plan 命令输出）
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出
│   └── db-ipc-mysql.md
└── checklists/
    └── requirements.md  # /speckit-specify 阶段已生成
```

### Source Code (repository root)

```text
src/
├── main/
│   └── db/
│       ├── driver/
│       │   ├── pg/
│       │   │   ├── PostgreSQLDriver.ts        # 参考实现，不修改
│       │   │   └── index.ts                   # 不修改
│       │   └── mysql/                         # [新增]
│       │       ├── MySQLDriver.ts              # [新增] 实现 IDatabaseDriver，mysql2 驱动
│       │       └── index.ts                    # [新增] 桶导出，镜像 pg/index.ts
│       ├── factory.ts                          # [修改] 新增 case 'mysql': return new MySQLDriver(id)
│       └── core/
│           ├── DriverManager.ts                 # 不修改（既有防御式分发已足够支持新驱动）
│           └── types.ts                         # 不修改（DatabaseType 从 renderer/src/types/ipc.ts 重导出）
│
├── main/ipc/
│   └── db.ts                                    # [修改] db:test-connection 按 type 分发到正确驱动的静态
│                                                 #        testConnection；db:backup-database 按 type 分支
│                                                 #        生成 mysqldump 参数；新增 detectMysqldump()
│
└── renderer/src/
    ├── types/
    │   └── ipc.ts                               # [修改] DatabaseType 增加 'mysql'；BackupParams 增加
    │                                             #        可选字段 mysqlDumpPath?: string
    ├── config/
    │   └── databaseCapabilities.ts              # [修改] DATABASE_CAPABILITIES 增加 mysql 能力条目
    ├── lib/
    │   ├── sqlFormat.ts                          # [修改] formatSql 按数据库类型选择 sql-formatter 的
    │   │                                         #        language（'postgresql' | 'mysql'）
    │   ├── sqlStatements.ts                      # [修改] splitSqlStatements 按数据库类型选择
    │   │                                         #        node-sql-parser 的 database 方言参数
    │   └── monaco/
    │       └── sqlConfig.ts                      # [修改] SQL_COMPLETION_CONFIG 增加 mysql 关键字/
    │                                             #        函数/数据类型/代码片段条目
    └── components/work/
        ├── ConnectionForm.tsx                    # [修改] 数据库类型下拉增加 "MySQL" 选项；切换类型时
        │                                         #        联动默认端口（5432 ↔ 3306）与默认用户名
        ├── SqlEditor.tsx                         # [修改] 依据连接的 DatabaseType（经 connectionStore
        │                                         #        按 connectionId 查得）决定补全 dbType 与格式化
        │                                         #        方言，替换目前硬编码的 'postgresql'
        └── ImportDataDialog.tsx                  # [修改] 调用 splitSqlStatements 时传入当前连接的
                                                    #        数据库类型
```

**Structure Decision**: 沿用单项目 Electron 三进程结构，不引入新的顶级目录。核心新增内容集中在 `src/main/db/driver/mysql/`（一个与 `driver/pg/` 并列的新驱动目录，遵循 IV 条款"适配器模式"的既定扩展方式），驱动通过 `factory.ts` 一行注册接入，`DriverManager.ts`、IPC 层的方法级分发、渲染进程的结构树/Store/Service 通用逻辑均按"数据驱动、不按数据库类型写死分支"的既有设计（`DATABASE_CAPABILITIES` 注册表、`SQL_COMPLETION_CONFIG` 注册表）天然支持新类型，只需补充 MySQL 一行/一个对象条目。唯二需要修改具体判断逻辑（而非仅注册表条目）的文件是 `src/main/ipc/db.ts`（两处历史遗留的 PostgreSQL 硬编码分支）与 `SqlEditor.tsx`（SQL 方言相关的补全/格式化开关目前硬编码为 `'postgresql'`），均在 Project Structure 中标注了具体改动点。ER 图、导入事务、用户权限查看等能力均在 `MySQLDriver` 内部通过实现与 `PostgreSQLDriver` 同名的接口方法获得，无需 IPC 层或渲染层的额外适配。

## Complexity Tracking

无宪法违规项，本节不适用。
