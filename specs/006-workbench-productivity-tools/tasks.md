---
description: 'Task list template for feature implementation'
---

# Tasks: 工作台效率工具集（导出/DDL/格式化/复制/导入）

**Input**: Design documents from `/specs/006-workbench-productivity-tools/`

**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（必需，用户故事）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 本仓库未配置自动化测试框架，spec.md 未要求 TDD，因此不生成自动化测试任务；每个用户故事的验收改为遵循 [quickstart.md](./quickstart.md) 中对应场景的手动验证步骤，并在“检查点”中列出。

**Organization**: 任务按 spec.md 中的 5 个用户故事（P1~P5）分组，每个故事可独立实现、独立验证、独立交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可并行执行（不同文件、无未完成依赖）
- **[Story]**：任务所属用户故事（US1~US5）
- 每个任务均给出确切文件路径

## Path Conventions

沿用现有 electron-vite 三层结构：`src/main/`（主进程）、`src/preload/`（预加载桥接）、`src/renderer/src/`（渲染进程），不新建顶层目录（详见 [plan.md](./plan.md) Project Structure）。

---

## Phase 1: Setup（共享基础设施）

**目的**：安装本功能所需的新增第三方依赖

- [x] T001 在 `package.json` 中新增依赖并安装：`pnpm add sql-formatter node-sql-parser papaparse`（对应 research.md §1/§2/§3 的选型结论；`sql-formatter`/`node-sql-parser` 均为宪法推荐技术栈已列出的库，`papaparse` 为唯一真正新增的第三方依赖）；另补装 `@types/papaparse` 开发依赖以满足严格类型检查

---

## Phase 2: Foundational（阻塞性前置条件）

**说明**：本功能的 5 个用户故事彼此独立——各自新增不同的 IPC 通道、不同的渲染进程模块（DDL 查看 / 导出 / 复制 / 格式化 / 导入互不共享运行时状态或前置改造），不存在必须在所有用户故事之前统一完成的阻塞性基础设施。因此本阶段无任务，各用户故事所需的类型定义、驱动方法、IPC 处理器均在对应故事阶段内新增。

**检查点**：无需等待，可直接从 Phase 3（User Story 1）开始实现。

---

## Phase 3: User Story 1 - 查看表 / 视图的 DDL（Priority: P1）🎯 MVP

**Goal**：在导航树右键表或视图，1 秒内展示包含列定义、约束、索引（或视图定义）的完整 DDL 文本，并可一键复制（对应 spec.md FR-001~FR-005、SC-001）。

**Independent Test**：按 [quickstart.md](./quickstart.md) User Story 1 步骤，对一张含主键+索引的表与一个视图分别执行“右键 → 查看 DDL”，验证展示内容完整、复制按钮可用；用权限受限连接重复操作验证展示明确错误提示而非空白/崩溃。

### Implementation for User Story 1

- [x] T002 [P] [US1] 在 `src/renderer/src/types/ipc.ts` 新增 `DdlResult` 类型定义（`objectType`/`schema`/`name`/`ddl` 字段，见 [data-model.md](./data-model.md)）
- [x] T003 [P] [US1] 在 `src/main/db/core/IDatabaseDriver.ts` 新增可选方法 `getTableDdl?(database: string, schema: string, table: string): Promise<string>` 与 `getViewDdl?(database: string, schema: string, view: string): Promise<string>`（见 [contracts/db-ipc-productivity.md](./contracts/db-ipc-productivity.md)）
- [x] T004 [US1] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 实现 `getTableDdl`：复用 `getColumns` 已使用的 `information_schema.columns`/`table_constraints`/`key_column_usage`/`referential_constraints`/`constraint_column_usage` 查询拼装列定义与约束子句，并附加 `pg_get_indexdef` 输出的索引语句（依赖 T003）
- [x] T005 [US1] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 实现 `getViewDdl`：使用 `pg_get_viewdef(oid, true)` 拼装 `CREATE OR REPLACE VIEW <schema>.<view> AS ...` 语句（依赖 T003）
- [x] T006 [US1] 在 `src/main/db/core/DriverManager.ts` 新增 `getTableDdl`/`getViewDdl` 防御性透传方法：`typeof driver.getTableDdl !== 'function'` 时抛出“不支持当前数据库类型的 DDL 查看”错误（依赖 T004、T005）
- [x] T007 [US1] 在 `src/main/ipc/db.ts` 新增 `db:get-table-ddl`（`connectionId, database, schema, table`）与 `db:get-view-ddl`（`connectionId, database, schema, view`）IPC 处理器，返回 `DdlResult`（依赖 T006）
- [x] T008 [P] [US1] 在 `src/preload/index.ts` 与 `src/preload/index.d.ts` 的 `DatabaseApi` 命名空间新增 `getTableDdl`/`getViewDdl` 方法签名与 `invoke` 实现（依赖 T007）
- [x] T009 [US1] 在 `src/renderer/src/services/queryService.ts` 新增 `getTableDdl(connectionId, database, schema, table)`/`getViewDdl(connectionId, database, schema, view)` 方法，透传 `window.api.database.*` 调用（依赖 T008）
- [x] T010 [P] [US1] 新建 `src/renderer/src/components/work/DdlViewerDialog.tsx`：展示 DDL 文本的弹窗组件，含语法高亮展示区域与一键复制按钮
- [x] T011 [US1] 在 `src/renderer/src/components/schema/TableNode.tsx` 右键菜单新增“查看 DDL”项：按 `table.type` 分支调用 `queryService.getTableDdl`/`getViewDdl`，成功后打开 `DdlViewerDialog`，失败（权限不足/对象已被删除或重命名）时展示明确错误提示而非空白弹窗（依赖 T009、T010）

**Checkpoint**：User Story 1 此时应可完全独立运行与验证（MVP 交付点）。

---

## Phase 4: User Story 2 - 导出查询结果为 CSV / JSON（Priority: P2）

**Goal**：查询结果表格右键直接导出为 CSV/JSON 文件，替代当前必须先创建定时任务的间接路径（对应 FR-006~FR-011、SC-002）。

**Independent Test**：按 [quickstart.md](./quickstart.md) User Story 2 步骤，对含特殊字符/NULL 字段、0 行、数千行三种结果集分别导出 CSV 与 JSON，验证转义正确、空结果集不报错、大结果集导出时界面仍可交互。

### Implementation for User Story 2

- [x] T012 [P] [US2] 在 `src/renderer/src/types/ipc.ts` 新增 `ExportJob` 类型定义（`format`/`filePath`/`rowCount`/`status`/`errorMessage`，见 [data-model.md](./data-model.md)）
- [x] T013 [P] [US2] 在 `src/main/ipc/fs.ts` 新增 `fs:pick-save-file` IPC 处理器（参数 `defaultFileName: string, filters: {name, extensions}[]`，对应 `dialog.showSaveDialog`，用户取消返回 `null`，复用 `fs:pick-folder` 的实现风格，见 [contracts/fs-ipc-productivity.md](./contracts/fs-ipc-productivity.md)）
- [x] T014 [US2] 在 `src/preload/index.ts` 与 `src/preload/index.d.ts` 的 `FileSystemApi` 命名空间新增 `pickSaveFile` 方法签名与实现（依赖 T013）
- [x] T015 [US2] 在 `src/renderer/src/services/fsService.ts` 新增 `pickSaveFile(defaultFileName, filters)` 方法（依赖 T014）
- [x] T016 [P] [US2] 新建 `src/renderer/src/lib/exportFormat.ts`：结果集 → CSV/JSON 文本序列化工具，复用 `TaskScheduler.ts`（约 385-396 行）已验证的转义规则（逗号/引号/换行转义、内嵌引号双写、`NULL` 在 CSV 中渲染为空字段、在 JSON 中渲染为 `null`），空结果集生成只含表头的 CSV / 空数组的 JSON
- [x] T017 [US2] 在 `src/renderer/src/components/work/ResultTable.tsx` 右键菜单新增“导出为 CSV”/“导出为 JSON”：调用 `fsService.pickSaveFile` 选择保存路径 → `exportFormat` 序列化 → `fsService.writeFile` 写入；导出期间展示进行中状态且不阻塞表格交互（依赖 T015、T016）

**Checkpoint**：User Story 1 与 2 此时均应可独立运行与验证。

---

## Phase 5: User Story 3 - 复制选中行为 INSERT / JSON / CSV（Priority: P3）

**Goal**：结果表格勾选行后右键复制为 INSERT/JSON/CSV 文本到系统剪贴板，供调试场景频繁使用（对应 FR-012~FR-017）。

**Independent Test**：按 [quickstart.md](./quickstart.md) User Story 3 步骤，分别在数据浏览视图（来源表已知）与查询面板多表 JOIN 结果（来源表不可确定）中勾选行执行“复制为 INSERT”，验证前者使用真实表名、后者使用占位符表名并提示核对；验证“复制为 JSON/CSV”内容正确；验证未勾选行时菜单禁用或提示。

### Implementation for User Story 3

- [x] T018 [P] [US3] 在 `src/renderer/src/types/ipc.ts` 新增 `RowClipboardPayload` 类型定义（`format`/`sourceTable`/`rowCount`/`text`，见 [data-model.md](./data-model.md)）
- [x] T019 [P] [US3] 新建 `src/renderer/src/lib/rowClipboard.ts`：选中行 → INSERT/JSON/CSV 文本序列化工具，含来源表判定逻辑（`DataBrowser` 场景使用已知真实表名；`QueryPanel` 场景来源表不可确定时使用占位符表名并附带提示文案）与值转义规则（字符串/日期加引号并转义、数字/布尔不加引号、`null`/`undefined` 渲染为裸 `NULL` 关键字）
- [x] T020 [US3] 在 `src/renderer/src/components/work/ResultTable.tsx` 右键菜单新增”复制为 INSERT”/”复制为 JSON”/”复制为 CSV”：读取当前勾选行调用 `rowClipboard` 序列化后写入系统剪贴板；未勾选任何行时相关菜单项禁用或提示”请先选择行”（依赖 T019）

**Checkpoint**：User Story 1、2、3 此时均应可独立运行与验证。

---

## Phase 6: User Story 4 - SQL 编辑器一键格式化（Priority: P4）

**Goal**：编辑器内一键格式化 SQL，统一关键字大小写、子句换行、缩进风格，且不改变查询语义（对应 FR-018~FR-021、SC-004）。

**Independent Test**：按 [quickstart.md](./quickstart.md) User Story 4 步骤，对无缩进单条 SQL、以分号分隔的多条 SQL 分别触发格式化并对比格式化前后的执行结果完全一致；对有意构造的语法错误 SQL 触发格式化验证提示“无法格式化”且原文本不变；格式化后执行 Ctrl+Z 验证可撤销。

### Implementation for User Story 4

- [x] T021 [P] [US4] 新建 `src/renderer/src/lib/sqlFormat.ts`：封装 `sql-formatter`（`dialect: 'postgresql'`），格式化成功返回新文本，捕获解析异常时返回原文本与错误信息（不抛出未捕获异常）
- [x] T022 [US4] 在 `src/renderer/src/components/work/SqlEditor.tsx` 新增“格式化”按钮与快捷键：调用 `sqlFormat` 并通过 Monaco 编辑器 API 将结果写回（保证可被标准 Ctrl+Z 撤销恢复原文本），格式化失败时提示“无法格式化”并保留原文本不变（依赖 T021）

**Checkpoint**：User Story 1~4 此时均应可独立运行与验证。

---

## Phase 7: User Story 5 - 导入 CSV / JSON / SQL 文件到表（Priority: P5）

**Goal**：从本地 CSV/JSON/SQL 文件导入数据到已存在的表，写入任何数据前校验文件有效性，失败时整体回滚不产生部分写入（对应 FR-022~FR-027、SC-005）。

**Independent Test**：按 [quickstart.md](./quickstart.md) User Story 5 步骤，分别导入列名匹配的 CSV、字段匹配的 JSON、含多条语句的 SQL 文件验证正确写入；导入列名不匹配的 CSV 验证出现列映射步骤且未映射必填列被提示；导入含约束冲突行的文件验证整体回滚（用 SELECT 确认表数据量与导入前一致）并报告具体失败行号；导入空文件或损坏 JSON 验证在写入任何数据前提示文件无效。

### Implementation for User Story 5

- [x] T023 [P] [US5] 在 `src/renderer/src/types/ipc.ts` 新增 `ImportWizardState`、`ColumnMapping`、`ImportRowsRequest`、`ImportSqlRequest`、`ImportResult` 类型定义（见 [data-model.md](./data-model.md)）
- [x] T024 [P] [US5] 在 `src/main/db/core/IDatabaseDriver.ts` 新增**必需**方法 `importRows(schema: string, table: string, columns: string[], rows: unknown[][]): Promise<ImportResult>` 与 `importSql(statements: string[]): Promise<ImportResult>`（见 [contracts/db-ipc-productivity.md](./contracts/db-ipc-productivity.md)）
- [x] T025 [US5] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 实现 `importRows`：通过 `pool.connect()` 获取客户端执行 `BEGIN` → 逐行参数化 `INSERT`（`$1, $2...`）→ 全部成功 `COMMIT`；任意一行失败立即 `ROLLBACK` 并返回失败行号与原因（依赖 T024）
- [x] T026 [US5] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 实现 `importSql`：复用同一 `BEGIN`/`COMMIT`/`ROLLBACK` 事务原语按顺序执行语句数组，任意语句失败立即 `ROLLBACK`（依赖 T024）
- [x] T027 [US5] 在 `src/main/db/core/DriverManager.ts` 新增 `importRows`/`importSql` 直接透传方法（依赖 T025、T026）
- [x] T028 [US5] 在 `src/main/ipc/db.ts` 新增 `db:import-rows`（`connectionId, database, request: ImportRowsRequest`）与 `db:import-sql`（`connectionId, database, request: ImportSqlRequest`）IPC 处理器；进入事务前校验 `rows` 各子数组长度与 `columns.length` 一致，不一致时直接抛参数错误，不发起任何数据库写入（依赖 T027）
- [x] T029 [P] [US5] 在 `src/preload/index.ts` 与 `src/preload/index.d.ts` 新增 `importRows`/`importSql` 方法签名与实现（依赖 T028）
- [x] T030 [US5] 在 `src/renderer/src/services/queryService.ts` 新增 `importRows(connectionId, database, request)`/`importSql(connectionId, database, request)` 方法（依赖 T029）
- [x] T031 [P] [US5] 在 `src/main/ipc/fs.ts` 新增 `fs:pick-open-file` IPC 处理器（参数 `filters: {name, extensions}[]`，对应 `dialog.showOpenDialog({ properties: ['openFile'] })`，用户取消返回 `null`）
- [x] T032 [US5] 在 `src/preload/index.ts` 与 `src/preload/index.d.ts` 新增 `pickOpenFile` 方法签名与实现（依赖 T031）
- [x] T033 [US5] 在 `src/renderer/src/services/fsService.ts` 新增 `pickOpenFile(filters)` 方法（依赖 T032）
- [x] T034 [P] [US5] 新建 `src/renderer/src/lib/sqlStatements.ts`：封装 `node-sql-parser` 将 SQL 文件内容拆分为独立语句数组，解析失败时抛出错误（视为无效文件，不产生部分结果）
- [x] T035 [US5] 新建 `src/renderer/src/components/work/ImportDataDialog.tsx`：导入向导组件——选择目标表 → 调用 `fsService.pickOpenFile` 选择文件 → 按扩展名分流解析预览（CSV 用 `papaparse`，JSON 用 `JSON.parse`，均在写入前校验可解析，解析失败或空文件直接提示无效并终止）→ 若字段名与目标表列名不完全一致展示列映射步骤（未映射的必填列高亮提示）→ 确认后 CSV/JSON 调用 `queryService.importRows`，SQL 文件先用 `sqlStatements` 拆分后调用 `importSql` → 展示结果汇总（成功行数/失败行号与原因）（依赖 T030、T033、T034）

**Checkpoint**：User Story 1~5 全部应可独立运行与验证，功能全集交付完成。

---

## Phase 8: Polish & Cross-Cutting Concerns

**目的**：跨用户故事的收尾质量门槛

- [x] T036 [P] 运行 `pnpm typecheck`、`pnpm lint`、`pnpm format` 并修复全部问题（对应宪法原则 II、静态检查门槛）
- [x] T037 按 [quickstart.md](./quickstart.md) 完整走查全部 5 个用户故事的手动验证步骤，确认每条 Acceptance Scenario 均通过
- [x] T038 [P] 为本功能新增的全部导出函数/方法/类型补充中文 JSDoc（`@param`/`@returns`/`@throws`/`@description`，对应宪法原则 VII）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：无依赖，可立即开始
- **Foundational（Phase 2）**：本功能为空阶段，无阻塞
- **User Stories（Phase 3~7）**：均只依赖 Phase 1 完成（`pnpm add` 已执行），彼此之间**无依赖**，可按任意顺序或并行推进；建议按 P1→P2→P3→P4→P5 优先级顺序交付
- **Polish（Phase 8）**：依赖希望交付的用户故事已全部完成

### User Story Dependencies

- **User Story 1（P1，DDL 查看）**：仅依赖 Setup，与其他故事无耦合
- **User Story 2（P2，导出）**：仅依赖 Setup，与其他故事无耦合
- **User Story 3（P3，复制行）**：仅依赖 Setup，与其他故事无耦合
- **User Story 4（P4，SQL 格式化）**：仅依赖 Setup，与其他故事无耦合
- **User Story 5（P5，导入）**：仅依赖 Setup，与其他故事无耦合（不依赖 US2 的导出对话框，`fs:pick-open-file` 与 US2 的 `fs:pick-save-file` 是各自独立新增的通道）

### Within Each User Story

- 类型定义（`types/ipc.ts`）与纯计算 `lib/` 工具可先行且相互并行
- 主进程 `IDatabaseDriver`/`DriverManager`/`PostgreSQLDriver` 修改 → 才能新增 `ipc/db.ts` 处理器 → 才能新增 `preload` 签名 → 才能新增渲染进程 `Service` 方法 → 才能接入 UI 组件（严格自底向上顺序，同一故事内不可跳过前置层）
- 每个用户故事完成后，均应先按 quickstart.md 对应章节手动验证，再进入下一优先级故事

### Parallel Opportunities

- Phase 1 的 T001 为单一命令，无需并行
- 一旦 Setup 完成，US1~US5 五个故事可由不同开发者完全并行推进（互不阻塞）
- 每个故事内标记 `[P]` 的任务（不同文件、无前置依赖）可并行执行，例如 US1 的 T002（类型）/T003（接口）/T010（新组件）三者互不依赖，可并行
- Polish 阶段 T036/T038 可并行

---

## Parallel Example: User Story 1

```bash
# US1 中可并行启动的任务（互不依赖、不同文件）：
Task: "在 src/renderer/src/types/ipc.ts 新增 DdlResult 类型定义"
Task: "在 src/main/db/core/IDatabaseDriver.ts 新增 getTableDdl?/getViewDdl? 可选方法"
Task: "新建 src/renderer/src/components/work/DdlViewerDialog.tsx 弹窗组件"
```

## Parallel Example: 跨故事并行（团队协作）

```bash
# Setup 完成后，不同开发者可同时认领不同故事的起始任务：
Developer A: T002~T011（User Story 1）
Developer B: T012~T017（User Story 2）
Developer C: T018~T020（User Story 3）
Developer D: T021~T022（User Story 4）
Developer E: T023~T035（User Story 5）
```

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. 完成 Phase 1: Setup
2. 完成 Phase 3: User Story 1（查看 DDL）
3. **停止并验证**：按 quickstart.md User Story 1 章节独立测试
4. 可作为 MVP 单独交付（spec.md 中 US1 明确标注“路径最短、价值最高”）

### Incremental Delivery（推荐顺序）

1. Setup 完成 → 基础就绪
2. 新增 User Story 1（查看 DDL）→ 独立验证 → 交付（MVP）
3. 新增 User Story 2（导出 CSV/JSON）→ 独立验证 → 交付
4. 新增 User Story 3（复制为 INSERT/JSON/CSV）→ 独立验证 → 交付
5. 新增 User Story 4（SQL 格式化）→ 独立验证 → 交付
6. 新增 User Story 5（数据导入）→ 独立验证 → 交付
7. 每个故事均在不破坏此前已交付故事的前提下增量增加价值

### Parallel Team Strategy

多名开发者协作时：

1. 团队共同完成 Phase 1: Setup
2. Setup 完成后：
   - 开发者 A：User Story 1
   - 开发者 B：User Story 2
   - 开发者 C：User Story 3
   - 开发者 D：User Story 4
   - 开发者 E：User Story 5
3. 五个故事互相独立完成与集成，无需互相等待

---

## Notes

- `[P]` 任务 = 不同文件、无依赖，可并行
- `[Story]` 标签将任务映射到具体用户故事，便于追溯（Setup/Foundational/Polish 阶段不加此标签）
- 每个用户故事均可独立完成与独立验证
- 本仓库未配置自动化测试框架，验证方式为 quickstart.md 手动走查 + 静态检查门槛（T036）
- 每完成一个任务或一组逻辑相关任务后提交一次 commit
- 可在任一检查点停下先独立验证该故事，再决定是否继续下一优先级故事
- 避免：模糊任务描述、同文件冲突的并行标记、破坏故事独立性的跨故事强依赖
