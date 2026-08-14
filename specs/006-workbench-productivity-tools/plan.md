# Implementation Plan: 工作台效率工具集（导出/DDL/格式化/复制/导入）

**Branch**: `006-workbench-productivity-tools` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-workbench-productivity-tools/spec.md`

## Summary

为工作台补齐 5 项独立的效率能力：（1）导航树右键查看表/视图 DDL；（2）查询结果表格右键直接导出为 CSV/JSON（替代当前必须先创建定时任务的间接路径）；（3）结果表格勾选行后右键复制为 INSERT/JSON/CSV；（4）SQL 编辑器一键格式化；（5）从本地 CSV/JSON/SQL 文件导入数据到已存在的表，失败时整体回滚。

技术方案：DDL 查看通过在 `PostgreSQLDriver` 中组合已有的 `information_schema`/`pg_catalog` 系统目录查询（复用 `getColumns`/`getIndexes` 已验证的查询方式）拼装 DDL 文本，作为 `IDatabaseDriver` 上的可选方法（`getTableDdl?`/`getViewDdl?`），遵循既有 `getFunctions?` 可选能力降级模式。导出/复制功能完全在渲染进程内完成序列化（查询结果集本就完整驻留在渲染进程内存中，`ResultTable` 的虚拟滚动只是 DOM 优化），只新增两个文件对话框 IPC 通道（`fs:pick-save-file`、`fs:pick-open-file`）。SQL 格式化引入宪法推荐技术栈中已列出的 `sql-formatter`，纯渲染进程本地计算，不涉及 IPC。数据导入新增 `IDatabaseDriver.importRows`/`importSql` 两个**必需**方法（因为 FR-025 的整体回滚是核心承诺），在 `PostgreSQLDriver` 内通过显式 `pool.connect()` 获取的客户端执行 `BEGIN`/参数化写入/`COMMIT`或`ROLLBACK`；SQL 文件的语句拆分复用宪法推荐的 `node-sql-parser`；CSV 文件解析新增 `papaparse`（渲染进程内可用、无 Node API 依赖）。全部新增 IPC 通道遵循 `模块:操作` kebab-case 命名与 `invoke/handle` 双向契约。

## Technical Context

**Language/Version**: TypeScript 5.9+（strict 模式），Electron 39+，React 19

**Primary Dependencies**: 新增 `sql-formatter`（SQL 格式化，宪法推荐技术栈已列出）、`node-sql-parser`（SQL 文件语句拆分，宪法推荐技术栈已列出）、`papaparse`（CSV 导入解析，新增第三方依赖，理由见 [research.md](./research.md) §3）；复用现有 `pg`（新增事务方法）、`@monaco-editor/react`（格式化结果写回编辑器）、`@tanstack/react-table` + `@tanstack/react-virtual`（结果表格右键菜单挂载）、`@radix-ui/react-context-menu`（shadcn `ContextMenu`）、`zustand`

**Storage**: 用户的 PostgreSQL 数据库（通过 `pg` 驱动，导入写入目标表、DDL 查询读取系统目录）；不涉及应用自身持久化配置的 schema 变更

**Testing**: 当前仓库未配置自动化测试框架，遵循宪法"自测验证"流程——`pnpm dev` 启动后按 [quickstart.md](./quickstart.md) 场景手动验证，`pnpm typecheck`/`pnpm lint`/`pnpm format` 作为静态门禁

**Target Platform**: 桌面端（Electron），Windows / macOS / Linux

**Project Type**: desktop-app（单一 Electron 应用，复用现有 `src/main` + `src/preload` + `src/renderer` 三层结构）

**Performance Goals**: 对应 SC-001——右键查看 DDL 到展示 ≤2 次点击、≤1 秒（常规大小表）；对应 FR-010——导出过程中界面保持可响应；对应 Edge Cases——数千行级别的"复制为…"操作响应及时，不阻塞主线程过久

**Constraints**: 对应 FR-025/SC-005——导入操作必须在单一事务内执行，失败整体回滚，不产生部分写入；对应原则 I——所有数据库/文件系统操作仅在主进程执行，渲染进程经 IPC 请求；对应原则 VIII——新增依赖限于宪法推荐技术栈内的库（`sql-formatter`、`node-sql-parser`）或有明确论证的最小新增（`papaparse`）

**Scale/Scope**: 单用户桌面客户端；导出/复制针对渲染进程内存中已有的完整结果集（不重新发起无限制全表扫描）；导入规模为"数千行级别"（SC-005），非大数据 ETL 场景；首期仅支持 PostgreSQL（spec.md Assumptions）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                        | 评估                                                                                                                                                                                                                                                                                                                                                                                       | 结论                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| I. 进程隔离与安全           | 新增的 DDL 查询、事务性导入、文件对话框均作为主进程 `db:*`/`fs:*` IPC 处理器实现，渲染进程仅经 `queryService`/`fsService` 调用；导入写入使用参数化查询（`$1, $2...`），不拼接 SQL 字符串；导出/复制的序列化在渲染进程完成但只操作已在内存中的结果集（非新的数据库/文件系统访问），不违反"主进程独占危险操作"（真正的文件写入仍经 `fs:write-file`）                                         | PASS                  |
| II. TypeScript 全栈类型安全 | 新增 `DdlResult`/`ImportRowsRequest`/`ImportSqlRequest`/`ImportResult`/`ExportJob`/`RowClipboardPayload`/`ImportWizardState`/`ColumnMapping` 均在 [data-model.md](./data-model.md) 中给出完整字段类型；IPC 新方法在 `preload/index.d.ts` 与主进程处理器间保持签名一致，零 `any`                                                                                                            | PASS                  |
| III. 组件化与关注点分离     | 新增 `DdlViewerDialog.tsx`、`ImportDataDialog.tsx` 职责单一；`ResultTable.tsx`/`TableNode.tsx` 仅扩展右键菜单项，不承载业务逻辑；所有新增 IPC 调用经 `queryService`/`fsService` 封装，组件不直接调用 `window.api`；导入向导/导出进度状态为组件本地 `useState`（单次操作生命周期，不适合放入 Zustand 全局 Store 或 Context）                                                                | PASS                  |
| IV. 数据库适配器模式        | `getTableDdl?`/`getViewDdl?` 设为可选方法，遵循既有 `getFunctions?`/`getProcedures?` 模式，`DriverManager` 中防御性检查 `typeof driver.xxx !== 'function'`；`importRows`/`importSql` 设为**必需**方法，因为原子性回滚是本功能对用户的核心承诺，理由记录在 [contracts/db-ipc-productivity.md](./contracts/db-ipc-productivity.md)；仅新增 `PostgreSQLDriver` 内实现，不改动现有必需方法签名 | PASS                  |
| V. IPC 通信契约             | 新增通道均为 `模块:操作` kebab-case 命名（`db:get-table-ddl`、`db:get-view-ddl`、`db:import-rows`、`db:import-sql`、`fs:pick-save-file`、`fs:pick-open-file`），均为双向 `invoke/handle`；主进程 catch 异常后 throw，渲染进程 Service 层统一捕获展示；主进程不含格式化/文案等 UI 逻辑                                                                                                      | PASS                  |
| VI. 分阶段交付              | 本功能属于宪法 Phase 3（高级功能：数据导入导出）范围内的增量交付，不影响已交付的 Phase 1/2 功能                                                                                                                                                                                                                                                                                            | N/A（不新增阶段划分） |
| VII. 中文文档与注释规范     | 本计划、`research.md`、`data-model.md`、`contracts/*.md`、`quickstart.md` 均使用简体中文；实现阶段新增的导出函数/方法/类型将补充中文 JSDoc                                                                                                                                                                                                                                                 | PASS                  |
| VIII. 依赖最小化            | `sql-formatter`、`node-sql-parser` 均为宪法推荐技术栈表中已列出的库，非额外新增；`papaparse` 为唯一真正新增的第三方依赖，理由（避免手写 CSV 解析器覆盖不全导致导入数据错误）已在 research.md §3 论证，且不引入原生编译依赖，不影响跨平台打包                                                                                                                                               | PASS                  |

结论：无宪法违规项，无需填写 Complexity Tracking。

**Post-Design Re-check**（完成 Phase 1 `research.md`/`data-model.md`/`contracts/*.md` 设计后复核）：`db:get-table-ddl`/`db:get-view-ddl`/`db:import-rows`/`db:import-sql`/`fs:pick-save-file`/`fs:pick-open-file` 均遵循既定 IPC 命名与 invoke/handle 契约，主进程独占数据库/文件系统访问不变（原则 I/V）；`DdlResult`/`ImportResult` 等数据模型字段类型明确、无 `any`（原则 II）；`importRows`/`importSql` 定为必需方法、`getTableDdl?`/`getViewDdl?` 定为可选方法的取舍在 data-model.md 与 contracts 中均有据可查（原则 IV）；确认新增依赖仅 `papaparse` 一项超出推荐技术栈且已充分论证（原则 VIII）。结论不变：PASS，无需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/006-workbench-productivity-tools/
├── plan.md              # 本文件（/speckit-plan 输出）
├── research.md          # Phase 0 输出
├── data-model.md         # Phase 1 输出
├── quickstart.md         # Phase 1 输出
├── contracts/             # Phase 1 输出
│   ├── db-ipc-productivity.md
│   └── fs-ipc-productivity.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

现有 Electron 应用结构不变，本功能在既有 `src/main` / `src/preload` / `src/renderer` 三层内新增与修改文件，不新建项目根目录：

```text
src/main/
├── db/
│   ├── core/
│   │   ├── IDatabaseDriver.ts        # [修改] 新增 getTableDdl?/getViewDdl?（可选）、importRows/importSql（必需）
│   │   └── DriverManager.ts          # [修改] 新增 getTableDdl/getViewDdl 防御性透传；importRows/importSql 直接透传
│   └── driver/pg/
│       └── PostgreSQLDriver.ts       # [修改] 实现 getTableDdl/getViewDdl（拼装 DDL）与 importRows/importSql（事务化写入）
└── ipc/
    ├── db.ts                          # [修改] 新增 db:get-table-ddl / db:get-view-ddl / db:import-rows / db:import-sql 处理器
    └── fs.ts                          # [修改] 新增 fs:pick-save-file / fs:pick-open-file 处理器

src/preload/
├── index.ts                           # [修改] database/fs 命名空间新增对应 invoke 方法
└── index.d.ts                         # [修改] DatabaseApi 新增 4 个方法签名，FileSystemApi 新增 2 个方法签名

src/renderer/src/
├── components/
│   ├── schema/
│   │   └── TableNode.tsx              # [修改] 右键菜单新增"查看 DDL"（按 table.type 区分调用 getTableDdl/getViewDdl）
│   └── work/
│       ├── ResultTable.tsx            # [修改] 右键菜单新增"导出为 CSV/JSON"（整体结果集）与"复制为 INSERT/JSON/CSV"（选中行）
│       ├── SqlEditor.tsx              # [修改] 新增"格式化"按钮 + 快捷键，调用 lib/sqlFormat
│       ├── DdlViewerDialog.tsx        # [新增] 展示 DDL 文本弹窗 + 一键复制
│       └── ImportDataDialog.tsx       # [新增] 导入向导：选择文件 → 列映射（CSV/JSON）→ 确认 → 结果汇总
├── lib/
│   ├── sqlFormat.ts                   # [新增] 封装 sql-formatter，格式化失败时返回原文本 + 错误
│   ├── sqlStatements.ts               # [新增] 封装 node-sql-parser，将 SQL 文件拆分为语句数组
│   ├── exportFormat.ts                # [新增] 结果集 → CSV/JSON 文本序列化（复用现有转义规则）
│   └── rowClipboard.ts                # [新增] 选中行 → INSERT/JSON/CSV 文本序列化（含来源表判定逻辑）
├── services/
│   ├── queryService.ts                # [修改] 新增 getTableDdl/getViewDdl/importRows/importSql 方法
│   └── fsService.ts                   # [修改] 新增 pickSaveFile/pickOpenFile 方法
└── types/
    └── ipc.ts                         # [修改] 新增 DdlResult/ImportRowsRequest/ImportSqlRequest/ImportResult 等类型

package.json                            # [修改] 新增依赖 sql-formatter、node-sql-parser、papaparse
```

**Structure Decision**：沿用现有 electron-vite 三层结构（`src/main` 主进程 / `src/preload` 预加载桥接 / `src/renderer` 渲染进程），不引入新的顶层目录。数据库适配层能力在既有 `db/core/`、`db/driver/pg/` 路径下原地扩展；渲染进程新增的纯计算工具（格式化、语句拆分、导出序列化、行剪贴板序列化）统一放入已存在的 `lib/` 目录，与现有 `lib/sqlTemplates.ts`、`lib/utils.ts` 同级，不新建子目录；两个新增业务组件（`DdlViewerDialog.tsx`、`ImportDataDialog.tsx`）放入已存在的 `components/work/` 目录，与 `ResultTable.tsx`、`SqlEditor.tsx` 同级，因为它们都是"工作台"场景下与查询/结果交互直接相关的弹窗，不引入新的组件分类目录。导入向导与导出进度等瞬时状态不新增 Zustand Store，保持为触发组件内的局部 `useState`（生命周期限于单次操作）。

## Complexity Tracking

> 无宪法违规项，本节不适用。
