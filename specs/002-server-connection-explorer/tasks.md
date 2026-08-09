# Tasks: 数据库服务器级连接与结构树重构

**Input**: Design documents from `specs/002-server-connection-explorer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/db-ipc.md, contracts/database-capabilities.md, quickstart.md

**Tests**: 规格未要求 TDD/自动化测试，且项目当前无自动化测试框架（见 plan.md Technical Context），因此不生成测试任务；验证方式为质量门禁（typecheck/lint/format）+ quickstart.md 手动走查。

**Organization**: 任务按用户故事分组，Setup/Foundational 为所有故事的前置基础设施。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1/US2/US3），Setup/Foundational/Polish 阶段无此标签

## Path Conventions

单体 Electron 三进程项目：`src/main/`（主进程）、`src/preload/`（预加载）、`src/renderer/src/`（渲染进程）。具体文件路径见下方各任务及 plan.md 的 Project Structure。

---

## Phase 1: Setup（共享类型基础）

**Purpose**: 定义跨进程共享类型与渲染进程本地类型，为后续所有分层改动提供类型基础

- [x] T001 [P] 在 `src/renderer/src/types/ipc.ts` 中新增 `DatabaseInfo`、`RoutineInfo` 类型；将 `ConnectionConfig.database` 与 `StoredConnection.database` 由必填改为可选；同步更新 `DatabaseApi` 接口签名（新增 `getDatabases`/`getFunctions`/`getProcedures`，`query`/`getSchemas`/`getTables`/`getColumns` 新增 `database` 参数）
- [x] T002 [P] 新建 `src/renderer/src/types/database.ts`，定义 `ModuleKind`、`DatabaseCapability`，以及结构树运行态类型 `DatabaseNodeState`/`SchemaNodeState`/`ModuleState`

---

## Phase 2: Foundational（阻塞性前置基础设施）

**Purpose**: 服务器级多数据库连接池架构、IPC 通道扩展、预加载与服务层同步——三个用户故事均依赖此阶段完成

**⚠️ CRITICAL**: 本阶段完成前不可开始任何用户故事的实现

- [x] T003 扩展 `src/main/db/core/IDatabaseDriver.ts`：新增 `getDatabases(): Promise<DatabaseInfo[]>` 必需方法；`query`/`getSchemas`/`getTables`/`getColumns` 新增 `database` 参数；新增可选方法 `getFunctions?`/`getProcedures?`（依赖 T001）
- [x] T004 更新 `src/main/db/core/DriverManager.ts`：转发 `getDatabases` 及各方法新增的 `database` 参数；对 `getFunctions`/`getProcedures` 做防御性判断，驱动未实现时返回空数组而非抛错（依赖 T003）
- [x] T005 重构 `src/main/db/driver/pg/PostgreSQLDriver.ts` 的连接池管理：由单一 `Pool` 改为按数据库名维护的 `Pool` 集合，`connect()` 建立管理连接，`disconnect()` 关闭全部数据库池（依赖 T003）
- [x] T006 [P] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 中实现 `getDatabases()`：查询 `pg_database` 并过滤模板库，返回当前账号有权限访问的 `DatabaseInfo[]`（依赖 T005）
- [x] T007 [P] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 中为 `getSchemas`/`getTables`/`getColumns` 新增 `database` 参数，按需获取或创建对应数据库的连接池后再查询（依赖 T005）
- [x] T008 更新主进程 IPC 处理器 `src/main/ipc/db.ts`：新增 `db:get-databases` 通道处理器；为 `db:query`/`db:get-schemas`/`db:get-tables`/`db:get-columns` 新增 `database` 参数转发（依赖 T004, T006, T007）
- [x] T009 更新预加载脚本 `src/preload/index.ts` 与 `src/preload/index.d.ts`：新增 `getDatabases` 的 invoke 声明，同步既有方法新增的 `database` 参数（依赖 T008）
- [x] T010 更新渲染进程服务层 `src/renderer/src/services/queryService.ts`：新增 `getDatabases` 方法，既有 `query`/`getSchemas`/`getTables`/`getColumns` 方法签名新增 `database` 参数（依赖 T009）
- [x] T011 [P] 放宽持久化配置校验：`src/main/config/store.ts` 与 `src/main/ipc/config.ts` 中 `StoredConnection.database` 改为可选，不升级 Store 版本、不做数据迁移（依赖 T001）

**Checkpoint**: 基础设施就绪，三个用户故事均可开始实现

---

## Phase 3: User Story 1 - 一次配置，访问整台服务器 (Priority: P1) 🎯 MVP

**Goal**: 用户只需填写服务器地址、端口与认证信息即可建立一次服务器级连接，连接成功后可自由浏览该账号有权限访问的全部数据库，无需为每个数据库单独建连接；断开连接时一并清空所有数据库的浏览状态。

**Independent Test**: 使用一个拥有多个数据库的 PostgreSQL 服务器新建并保存一条连接，验证：①表单不要求预先锁定唯一数据库；②连接成功后能看到服务器上全部有权限的数据库；③无需新建第二条连接即可切换浏览另一数据库；④断开连接后该连接下的浏览状态一并清空。

### Implementation for User Story 1

- [x] T012 [P] [US1] 更新连接表单 `src/renderer/src/components/work/ConnectionForm.tsx`：移除"数据库"字段的必填校验，调整为可选输入并更新文案为服务器级连接说明；"测试连接/仅保存/保存并连接"按钮行为保持不变（依赖 T010）
- [x] T013 [US1] 扩展 `src/renderer/src/store/connectionStore.ts` 的 `ConnectedConnection`：新增 `databases`/`databasesLoading`/`databasesError`/`activeDatabase` 字段及 `loadDatabases()`/`setActiveDatabase()` 方法，替换原扁平 `schemas`/`tablesBySchema` 状态（依赖 T010, T002）
- [x] T014 [US1] 在 `connectionStore.ts` 中实现历史连接自动升级（FR-016）：`activate()` 时若存在旧版 `config.database`，将其设为 `activeDatabase` 默认值，无需用户手动操作（依赖 T013）
- [x] T015 [US1] 在 `connectionStore.ts` 中实现 `disconnect()` 语义调整（FR-004）：断开时清空该连接下 `databases`、`activeDatabase` 及全部数据库运行态；重新连接后重新加载（依赖 T013）
- [x] T016 [P] [US1] 新建 `src/renderer/src/components/schema/ServerNode.tsx`：渲染服务器连接节点（名称/地址/状态），展开时调用 `loadDatabases()` 动态列出全部数据库，支持加载中/错误重试状态（依赖 T013）
- [x] T017 [US1] 新建 `src/renderer/src/components/schema/DatabaseNode.tsx`：渲染单个数据库节点，点击/展开时调用 `setActiveDatabase()` 切换当前浏览的数据库（依赖 T016）
- [x] T018 [US1] 更新 `src/renderer/src/store/workspaceStore.ts`：`QueryTabState`/`OpenQueryTabPayload` 新增必填 `database` 字段与可选 `schema` 字段，标签页去重键调整为 `connectionId+database`（依赖 T002）
- [x] T019 [US1] 更新 `src/renderer/src/components/work/QueryPanel.tsx`：执行查询时传入当前数据库上下文（`queryService.query(connectionId, database, sql)`），工具栏展示当前查询作用的数据库名称（依赖 T010, T018）

**Checkpoint**: User Story 1 可独立验证（连接、查看全部数据库、切换数据库、断开清空均可通过 `ServerNode`/`DatabaseNode` 基础渲染与 `connectionStore` 状态核对；Schema/表结构的完整展开由 User Story 2 交付）

---

## Phase 4: User Story 2 - 侧边栏结构树按服务器层级正确展示 (Priority: P1)

**Goal**: 侧边栏结构树以"服务器 → 数据库 → Schema → 结构模块（Tables/Views）"层级正确渲染，结构数据来自数据库驱动的实时查询与按需加载，各节点独立维护加载中/错误状态。

**Independent Test**: 连接一个真实的 PostgreSQL 服务器（含多个数据库），逐层展开服务器 → 数据库 → Schema 节点，核对每层展示的名称、数量与真实数据一致；未展开的节点不应提前发起数据请求；触发一次加载失败仅影响该节点。

### Implementation for User Story 2

- [x] T020 [US2] 在 `connectionStore.ts` 中新增 `databaseNodes`（含 `schemaNodes`/`modules`）运行态及 `loadSchemas()`/`loadModuleItems()` 等按需加载方法，遵循"仅展开时请求、单节点失败不影响其他节点"的状态机（依赖 T013, T003）
- [x] T021 [US2] 新建 `src/renderer/src/components/schema/SchemaNode.tsx`：渲染 Schema 节点，展开时按需加载并展示通用模块分组（Tables、Views），独立维护加载中/错误重试状态（依赖 T020）
- [x] T022 [US2] 新建 `src/renderer/src/components/schema/ModuleGroup.tsx`：通用模块分组渲染组件，接收模块类型与数据列表，渲染表/视图行，支持加载中/空态/错误重试（依赖 T021）
- [x] T023 [US2] 更新 `src/renderer/src/components/schema/DatabaseNode.tsx`：展开时调用 `loadSchemas()` 动态列出该数据库下的 Schema 列表并渲染 `SchemaNode` 子节点（依赖 T020, T021, T017）
- [x] T024 [US2] 新建 `src/renderer/src/components/schema/SchemaTree.tsx`：组装 `ServerNode` 顶层容器，处理空态（无可访问数据库）与整体加载态（依赖 T016, T023）
- [x] T025 [US2] 更新 `src/renderer/src/components/work/WorkspaceHome.tsx`：将侧边栏引用从旧的 `components/work/SchemaTree.tsx` 切换为新的 `components/schema/SchemaTree.tsx`，并删除旧文件（依赖 T024）
- [x] T026 [US2] 恢复数据浏览能力（FR-014）：在 `ModuleGroup.tsx` 中为 Tables/Views 行绑定双击打开查询标签页（`SELECT * FROM ... LIMIT 100`），复用 T019 的数据库上下文（依赖 T022, T019）
- [x] T027 [US2] 在 `ServerNode.tsx`/`DatabaseNode.tsx`/`SchemaNode.tsx` 中新增刷新入口（FR-005）：保持 `expanded` 状态不变，重新拉取该节点数据覆盖旧缓存（依赖 T024）

**Checkpoint**: User Story 1 与 2 均完整可测（完整层级结构树、按需加载、独立错误态、数据浏览回归验证）

---

## Phase 5: User Story 3 - PostgreSQL 专属模块隔离且架构可扩展 (Priority: P2)

**Goal**: PostgreSQL 特有的 Query/Functions/Procedures 模块通过独立的数据库类型能力配置驱动展示，与通用树渲染逻辑解耦；新增数据库类型时只需调整该配置与自身驱动文件。

**Independent Test**: 在 PostgreSQL 连接下核对 Query/Functions/Procedures 节点按设计图位置出现；走查代码确认这些模块的可用性由 `databaseCapabilities.ts` 决定而非硬编码在通用树组件中。

### Implementation for User Story 3

- [x] T028 [P] [US3] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 中新增 `getFunctions()`/`getProcedures()`，基于 `information_schema.routines` 按 `routine_type` 区分并返回 `RoutineInfo[]`（依赖 T005）
- [x] T029 [US3] 更新 `src/main/ipc/db.ts`：新增 `db:get-functions`/`db:get-procedures` 通道处理器（依赖 T004, T028）
- [x] T030 [US3] 更新 `src/preload/index.ts` 与 `src/preload/index.d.ts`：新增 `getFunctions`/`getProcedures` 的 invoke 声明（依赖 T029）
- [x] T031 [US3] 更新 `src/renderer/src/services/queryService.ts`：新增 `getFunctions`/`getProcedures` 方法（依赖 T030）
- [x] T032 [P] [US3] 新建 `src/renderer/src/config/databaseCapabilities.ts`：定义 `DATABASE_CAPABILITIES`，PostgreSQL 记录 `databaseLevelModules=['query']`，`schemaLevelModules=['query','tables','views','functions','procedures']`（依赖 T002）
- [x] T033 [US3] 更新 `src/renderer/src/components/schema/ModuleGroup.tsx` 与 `SchemaNode.tsx`：改为遍历 `DATABASE_CAPABILITIES[type].schemaLevelModules` 决定渲染哪些模块分组（含 Functions/Procedures），移除任何硬编码的 `type === 'postgresql'` 分支（依赖 T032, T031, T021, T022）
- [x] T034 [US3] 更新 `src/renderer/src/components/schema/DatabaseNode.tsx`：按 `databaseLevelModules` 渲染数据库层级的 Query 快捷入口（依赖 T032, T023）
- [x] T035 [US3] 实现 Query 快捷入口交互：点击数据库/Schema 层级的 Query 节点时，通过 `workspaceStore` 打开携带对应 `database`（及可选 `schema`）上下文的新查询标签页（依赖 T018, T034, T033）

**Checkpoint**: 三个用户故事均可独立验证；新增数据库类型时改动只涉及 `databaseCapabilities.ts` 与该类型自身驱动文件

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T036 [P] 运行 `pnpm run typecheck`，修复所有跨进程类型不一致问题
- [x] T037 [P] 运行 `pnpm run lint` 与 `pnpm run format`，确保新增/修改文件符合项目规范
- [x] T038 走查 `quickstart.md` 全部 4 个验证场景，确认无回归（依赖 T001-T035 全部完成）
- [x] T039 [P] 为新增/修改的导出函数、类型、接口补充中文 JSDoc 注释（宪法原则 VII）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无前置依赖，可立即开始
- **Foundational (Phase 2)**：依赖 Setup 完成；阻塞全部用户故事
- **User Story 1 (Phase 3)**：依赖 Foundational 完成；MVP 范围
- **User Story 2 (Phase 4)**：依赖 Foundational 完成；部分任务依赖 US1 的 `DatabaseNode.tsx`/`QueryPanel.tsx` 改动（T017, T019），因两者同为 P1 且紧密耦合于同一结构树骨架
- **User Story 3 (Phase 5)**：依赖 Foundational 完成，且依赖 US1/US2 建立的树组件骨架（`DatabaseNode.tsx`/`SchemaNode.tsx`/`ModuleGroup.tsx`）与查询标签页上下文（T018）
- **Polish (Phase 6)**：依赖所有已交付用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**：可在 Foundational 完成后独立开始；不依赖 US2/US3
- **User Story 2 (P1)**：可在 Foundational 完成后开始；因共享结构树组件文件，与 US1 的 `DatabaseNode.tsx`/查询上下文存在实现顺序上的先后关系，但功能验证仍可独立进行
- **User Story 3 (P2)**：在 US1、US2 交付的树组件基础上追加能力配置驱动的模块，不修改已支持类型的现有展示逻辑

### Within Each User Story

- Store/状态层任务先于组件渲染任务
- 底层节点组件（ServerNode）先于其子节点组件（DatabaseNode → SchemaNode → ModuleGroup）
- 故事内核心实现完成后再进行 Checkpoint 验证

### Parallel Opportunities

- Setup 阶段 T001、T002 可并行（不同文件）
- Foundational 阶段 T006、T007 可并行（同文件不同方法，但均基于 T005 完成后的池管理，建议同一开发者顺序处理以避免合并冲突）；T011 可与驱动层任务并行
- US1 中 T012、T016 可并行
- US3 中 T028、T032 可并行
- Polish 阶段 T036、T037、T039 可并行

---

## Parallel Example: Foundational

```bash
# T001、T002 类型定义任务可并行：
Task: "在 src/renderer/src/types/ipc.ts 中新增 DatabaseInfo、RoutineInfo 类型..."
Task: "新建 src/renderer/src/types/database.ts，定义 ModuleKind、DatabaseCapability..."
```

## Parallel Example: User Story 3

```bash
# T028、T032 可并行（不同层，无直接文件依赖）：
Task: "在 PostgreSQLDriver.ts 中新增 getFunctions()/getProcedures()"
Task: "新建 src/renderer/src/config/databaseCapabilities.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键阻塞项）
3. 完成 Phase 3: User Story 1
4. **停止并验证**：按 User Story 1 的 Independent Test 走查
5. 视情况决定是否在此基础上继续 US2/US3

### Incremental Delivery

1. Setup + Foundational → 基础就绪
2. - User Story 1 → 独立验证 → 服务器级连接可用（MVP）
3. - User Story 2 → 独立验证 → 完整结构树可用
4. - User Story 3 → 独立验证 → PostgreSQL 专属模块与可扩展架构就位
5. 每个故事在不破坏前一故事的前提下增量交付

---

## Notes

- `[P]` 任务代表不同文件、无未完成依赖
- `[Story]` 标签用于追溯任务与用户故事的映射关系
- 本特性无自动化测试框架，验证以 T036-T038（质量门禁 + quickstart 走查）为准
- 每完成一个任务或逻辑分组后建议提交一次
- 可在任一 Checkpoint 处停止并独立验证对应用户故事
