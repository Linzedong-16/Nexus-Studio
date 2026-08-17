---
description: 'Task list template for feature implementation'
---

# Tasks: 内存占用优化：查询结果与对话历史管控

**Input**: Design documents from `specs/010-memory-optimization/`

**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（必需，含用户故事优先级）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/db-ipc.md](./contracts/db-ipc.md)、[quickstart.md](./quickstart.md)

**Tests**: 本项目当前未引入自动化测试框架（见 CLAUDE.md 测试策略），且 spec.md 未要求 TDD，故不生成测试任务；验证方式统一收敛到最终 Polish 阶段执行 [quickstart.md](./quickstart.md) 的手动验证步骤。

**Organization**: 任务按 spec.md 中的用户故事分组（US1~~US4，对应 P1~~P4），每个故事均可独立实现与验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可并行执行（不同文件、且不依赖尚未完成的任务）
- **[Story]**：任务所属用户故事（US1/US2/US3/US4）
- 每个任务均包含明确文件路径

## Path Conventions

本项目为 Electron 单体应用，采用既有目录结构：`src/main/`（主进程）、`src/preload/`（预加载）、`src/renderer/src/`（渲染进程）。所有路径均基于仓库根目录 `d:\coding\project\desktop\DB-client`。

---

## Phase 1: Setup

**Purpose**: 确认改动前的质量门禁基线，为后续所有用户故事提供一个干净的起点

- [x] T001 确认工作区无未提交冲突改动（`git status`），并执行 `pnpm run typecheck && pnpm run lint` 确保改动前代码库处于绿色基线

---

## Phase 2: Foundational (Blocking Prerequisites)

**说明**：本功能的四个用户故事分别落在互不重叠的文件集合上（US1：驱动层截断/导出；US2：`workspaceStore.ts` 的激活时间追踪；US3：驱动层连接池释放；US4：对话面板 UI），**不存在跨故事共享的阻塞性基础设施**。唯一需要注意的是 US2 与 US3 都会修改 `src/renderer/src/store/workspaceStore.ts`（US2 新增非激活扫描逻辑，US3 在 `closeTab` 系列方法中新增释放判定），已在下方 Dependencies 中标注按优先级顺序（US2 先于 US3）执行以避免修改冲突。

**Checkpoint**：无需等待，可直接从 Phase 3 开始。

---

## Phase 3: User Story 1 - 大结果集查询不拖累应用运行 (Priority: P1) 🎯 MVP

**Goal**：查询结果超过默认上限（5 万行）时自动截断展示并明确提示，同时保证导出功能可以获取不受截断限制的完整数据。

**Independent Test**：对一张 10 万行以上的表执行不带 `LIMIT` 的全表查询，验证应用无明显卡顿、结果区域出现截断提示；通过导出入口验证导出文件包含完整行数（对应 [quickstart.md](./quickstart.md) 场景 1）。

### Implementation for User Story 1

- [x] T002 [P] [US1] 创建 `src/main/db/core/resultLimits.ts`：定义 `MAX_RESULT_ROWS = 50_000` 常量与 `truncateRows<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean }` 工具函数
- [x] T003 [P] [US1] 在 `src/renderer/src/types/ipc.ts` 的 `QueryResult` 接口新增 `truncated: boolean` 字段
- [x] T004 [P] [US1] 在 `src/main/db/core/IDatabaseDriver.ts` 的 `query` 方法签名新增可选第 4 参数 `options?: { unbounded?: boolean }`，用于导出路径跳过截断
- [x] T005 [P] [US1] 修改 `src/main/db/driver/pg/PostgreSQLDriver.ts` 的 `query`/`runQuery`：接入 `truncateRows`（依赖 T002），支持 `options.unbounded` 跳过截断（依赖 T004），组装返回值时设置 `truncated` 与截断前的 `rowCount`（依赖 T003）
- [x] T006 [P] [US1] 修改 `src/main/db/driver/mysql/MySQLDriver.ts` 的 `query`/`runQuery`，实现与 T005 对称的截断与 `unbounded` 逃生口逻辑
- [x] T007 [P] [US1] 新建 `src/main/utils/resultExport.ts`：实现 `toCsv(result: QueryResult): string`、`toJson(result: QueryResult): string`（主进程侧独立序列化实现，不依赖渲染进程 `src/renderer/src/lib/exportFormat.ts`）
- [x] T008 [US1] 在 `src/main/ipc/db.ts` 新增 `db:export-query-result` IPC handler：调用 `driverManager.query(connectionId, database, sql, params, { unbounded: true })`，用 T007 的序列化函数生成文本并 `fs.writeFile` 写入目标路径（依赖 T004、T005、T006、T007）
- [x] T009 [P] [US1] 在 `src/preload/index.ts` 的 `db` 命名空间新增 `exportQueryResult: createInvoke<[ExportQueryResultRequest], { rowCount: number }>('db:export-query-result')`（依赖 T008）
- [x] T010 [P] [US1] 在 `src/preload/index.d.ts` 补充 `exportQueryResult` 方法的类型声明（依赖 T008）
- [x] T011 [US1] 在 `src/renderer/src/services/queryService.ts` 新增 `exportQueryResult(request): Promise<{ rowCount: number }>` 方法，封装 `window.api.db.exportQueryResult`（依赖 T009、T010）
- [x] T012 [US1] 修改 `src/renderer/src/components/work/ResultTable.tsx`：`result.truncated` 为真时在结果区域展示截断提示（已展示行数/上限/导出引导）；`handleExport` 按 `result.truncated` 分流——为真时调用 `queryService.exportQueryResult`（新增 `connectionId`/`database`/`sql`/`params` 等 props），为假时沿用现状本地序列化逻辑（依赖 T003、T011）
- [x] T013 [US1] 修改 `src/renderer/src/components/work/QueryPanel.tsx` 与 `src/renderer/src/components/work/DataBrowser.tsx`：向 `ResultTable` 传递 T012 新增的查询上下文 props（`connectionId`/`database`/`sql`/`params`，其中表数据浏览场景需按 `schema`/`table`/`filter` 重建不含分页的完整查询语句）（依赖 T012）

**Checkpoint**：User Story 1 此时应可独立完整验证——大结果集查询截断展示、导出获取完整数据均不依赖其余任何用户故事的改动。

---

## Phase 4: User Story 2 - 同时打开多个查询标签页不会让内存持续攀升 (Priority: P2)

**Goal**：非激活标签页闲置超过默认时长（10 分钟）后自动释放其查询结果，当前激活标签页永不受影响，释放后用户可一键重新执行获取结果。

**Independent Test**：打开 5 个标签页各自执行查询，长时间聚焦其中 1 个，验证其余标签页结果被释放且提供重新执行入口，当前聚焦标签页结果始终可用（对应 [quickstart.md](./quickstart.md) 场景 2）。

### Implementation for User Story 2

- [x] T014 [US2] 在 `src/renderer/src/types/workspace.ts` 的 `WorkspaceTab` 接口新增 `lastActiveAt?: number` 与 `resultReleased?: boolean` 字段
- [x] T015 [US2] 修改 `src/renderer/src/store/workspaceStore.ts` 的 `activateTab(id)`：切换为激活标签页时刷新目标标签页的 `lastActiveAt`（依赖 T014）
- [x] T016 [US2] 修改 `src/renderer/src/store/workspaceStore.ts` 的 `setQueryResult(id, result, error)`：写入新结果时同步刷新 `lastActiveAt` 并将 `resultReleased` 重置为 `false`（依赖 T014，与 T015 同文件顺序执行）
- [x] T017 [US2] 在 `src/renderer/src/store/workspaceStore.ts` 新增模块级 `INACTIVE_RELEASE_MS = 10 * 60 * 1000` 常量与 `setInterval` 定时扫描逻辑（建议 60 秒周期）：扫描所有非当前激活、`type` 为 `query`/`table`、`result != null` 且闲置超时的标签页，清空 `result` 并设置 `resultReleased: true`（依赖 T015、T016）
- [x] T018 [US2] 修改 `src/renderer/src/components/work/QueryPanel.tsx` 与 `src/renderer/src/components/work/DataBrowser.tsx`：`tab.resultReleased` 为真时展示"结果已释放，点击重新执行"提示与按钮，点击后触发既有查询执行逻辑（依赖 T017）

**Checkpoint**：User Story 1、2 此时均可独立验证；两者互不影响。

---

## Phase 5: User Story 3 - 切换或不再使用某个数据库后，相关连接资源及时释放 (Priority: P3)

**Goal**：某数据库对应的全部标签页关闭后，释放其后台连接池；其他数据库不受影响；重新访问时自动透明重建。

**Independent Test**：同一连接下打开 db_a、db_b 各自标签页，关闭 db_a 全部标签页后验证其连接池被释放且 db_b 不受影响，重新打开 db_a 标签页验证自动重建（对应 [quickstart.md](./quickstart.md) 场景 3）。

### Implementation for User Story 3

- [x] T019 [US3] 在 `src/main/db/core/IDatabaseDriver.ts` 新增可选方法 `releaseDatabase?(database: string): Promise<void>`
- [x] T020 [P] [US3] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 实现 `releaseDatabase`：从 `pools` 中取出目标数据库对应的 `Pool` 调用 `.end()` 并从 Map 删除，管理数据库静默跳过（依赖 T019）
- [x] T021 [P] [US3] 在 `src/main/db/driver/mysql/MySQLDriver.ts` 实现 `releaseDatabase`，逻辑与 T020 对称（依赖 T019）
- [x] T022 [US3] 在 `src/main/db/core/DriverManager.ts` 新增 `releaseDatabase(connectionId: string, database: string): Promise<void>` 转发方法（依赖 T020、T021）
- [x] T023 [US3] 在 `src/main/ipc/db.ts` 新增 `db:release-database` IPC handler，调用 `driverManager.releaseDatabase(...)`（依赖 T022）
- [x] T024 [US3] 在 `src/preload/index.ts` 与 `src/preload/index.d.ts` 新增 `releaseDatabase` 调用声明与类型（依赖 T023）
- [x] T025 [US3] 在 `src/renderer/src/services/queryService.ts` 新增 `releaseDatabase(connectionId: string, database: string): Promise<void>` 方法（依赖 T024）
- [x] T026 [US3] 修改 `src/renderer/src/store/workspaceStore.ts` 的 `closeTab`/`closeOtherTabs`/`closeAllTabs`：移除标签页后遍历剩余 `tabs` 判断对应 `(connectionId, database)` 是否仍被引用，无引用则调用 `queryService.releaseDatabase(...)`（依赖 T025；因与 US2 共同修改 `workspaceStore.ts`，建议在 Phase 4 完成后进行）

**Checkpoint**：User Story 1、2、3 此时均可独立验证。

---

## Phase 6: User Story 4 - 长对话在达到一定轮次后提醒用户新建对话 (Priority: P4)

**Goal**：对话累计轮次达到默认阈值（40 轮）后在对话底部展示不遮挡输入的引导提示，提供"新建对话"入口，忽略提示不影响正常使用。

**Independent Test**：在同一对话中连续完成 40 轮及以上交互，验证提示在第 40 轮出现、此前不出现、忽略提示不影响后续交互、点击"新建对话"后原对话历史保留且新对话独立计数（对应 [quickstart.md](./quickstart.md) 场景 4）。

### Implementation for User Story 4

- [x] T027 [US4] 在 `src/renderer/src/components/code/ConversationView.tsx` 新增 `CONVERSATION_LENGTH_NOTICE_THRESHOLD = 40` 常量，并基于 `turns.length >= CONVERSATION_LENGTH_NOTICE_THRESHOLD` 派生展示状态
- [x] T028 [US4] 在 `src/renderer/src/components/code/ConversationView.tsx` 的 `ConversationInputCard` 上方渲染提示条（说明文案 + "新建对话"按钮，点击调用 `useConversationStore.getState().createConversation()`）（依赖 T027）

**Checkpoint**：全部四个用户故事均可独立验证。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**：跨故事的收尾验证，不新增功能性改动

- [X] T029 [P] 执行完整质量门禁：`pnpm run typecheck && pnpm run lint && pnpm run format`
- [X] T030 按 [quickstart.md](./quickstart.md) 的四个场景逐一执行手动验证，并确认回归检查项（`db:query` 返回值新增字段未破坏既有 Schema 浏览/ER 分析/DDL 查看等调用点；应用整体关闭时 `disconnect()`/`disconnectAll()` 仍能一次性清理全部连接池）
- [X] T031 [P] 核对 `doc/08-性能优化方案-内存占用.md` 第 5 节"建议实施顺序"表，确认 P0~P3 全部落地，如实现细节与文档描述存在偏差则同步更新文档

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，立即开始
- **Foundational (Phase 2)**：无实际阻塞性任务，可直接跳过进入 Phase 3
- **User Story 1 (Phase 3)**：依赖 Setup 完成；可独立开始（MVP）
- **User Story 2 (Phase 4)**：依赖 Setup 完成；与 US1 改动文件不重叠，可与 US1 并行或在其后进行
- **User Story 3 (Phase 5)**：依赖 Setup 完成；建议在 US2（Phase 4）完成后进行，因 T026 与 US2 的 T015~T017 共同修改 `workspaceStore.ts`
- **User Story 4 (Phase 6)**：依赖 Setup 完成；与其余三个故事改动文件完全不重叠，可随时并行
- **Polish (Phase 7)**：依赖全部四个用户故事完成

### Within Each User Story

- US1：类型/常量/接口签名（T002~T004，可并行）→ 驱动层实现（T005/T006，可并行）→ 序列化工具（T007，可与前序并行）→ IPC handler（T008）→ 预加载层（T009/T010，可并行）→ 服务层（T011）→ UI 层（T012 → T013）
- US2：类型字段（T014）→ store 方法改动（T015 → T016，同文件顺序）→ 定时扫描（T017）→ UI 提示（T018）
- US3：接口签名（T019）→ 驱动层实现（T020/T021，可并行）→ DriverManager 转发（T022）→ IPC handler（T023）→ 预加载层（T024）→ 服务层（T025）→ store 释放判定（T026）
- US4：派生状态（T027）→ UI 渲染（T028）

### Parallel Opportunities

- Setup 阶段无需并行（仅 1 项检查任务）
- US1：T002/T003/T004 可并行；T005/T006/T007 可并行；T009/T010 可并行
- US3：T020/T021 可并行
- US2 与 US4 可与 US1 完全并行（不同文件），US3 建议排在 US2 之后
- Polish 阶段 T029/T031 可并行，T030 需等待前序全部故事完成后执行

---

## Parallel Example: User Story 1

```bash
# T002~T004 可并行执行（不同文件，互不依赖）：
Task: "创建 src/main/db/core/resultLimits.ts 的 MAX_RESULT_ROWS 常量与 truncateRows 函数"
Task: "在 src/renderer/src/types/ipc.ts 的 QueryResult 接口新增 truncated 字段"
Task: "在 src/main/db/core/IDatabaseDriver.ts 的 query 方法签名新增 unbounded 选项"

# T005~T007 可并行执行（依赖 T002~T004 完成，彼此不同文件）：
Task: "修改 PostgreSQLDriver.ts 接入截断与 unbounded 逃生口"
Task: "修改 MySQLDriver.ts 接入截断与 unbounded 逃生口"
Task: "新建 src/main/utils/resultExport.ts 的 toCsv/toJson"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 跳过 Phase 2（无阻塞性任务）
3. 完成 Phase 3: User Story 1
4. **停下并验证**：按 quickstart.md 场景 1 独立验证 US1
5. 若时间/资源有限，US1 本身已解决 spec.md 中风险最高的问题（大结果集查询导致的内存尖峰），可作为独立可交付的第一个增量

### Incremental Delivery

1. Setup 完成 → 直接进入用户故事实现（无 Foundational 阻塞）
2. 交付 US1 → 独立验证 → 内存尖峰风险解除（MVP）
3. 交付 US2 → 独立验证 → 长期使用下的稳步内存增长得到治理
4. 交付 US3 → 独立验证 → 连接池资源不再随浏览多个数据库累积
5. 交付 US4 → 独立验证 → 超长对话历史增长得到引导性治理
6. 每个故事均在不破坏此前故事的前提下增量交付价值

---

## Notes

- [P] 任务 = 不同文件且不依赖尚未完成的任务
- [Story] 标签用于追溯任务与用户故事的映射关系
- 本功能不新增自动化测试，验证收敛到 Phase 7 的 quickstart.md 手动验证
- US2/US3 共同修改 `workspaceStore.ts`，已在 Dependencies 中标注建议顺序，避免并行开发时的文件冲突
- 每个任务完成后建议提交一次（Conventional Commits，中文描述），便于按用户故事回溯
