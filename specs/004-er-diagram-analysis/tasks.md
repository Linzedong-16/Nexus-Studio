---
description: 'Task list template for feature implementation'
---

# Tasks: ER 图分析

**Input**: Design documents from `/specs/004-er-diagram-analysis/`

**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（必需，用户故事）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 项目当前未配置自动化测试框架（见 plan.md Technical Context「Testing」），spec.md 未要求 TDD，因此本任务列表不包含自动化测试任务；验证方式为 quickstart.md 的手动验证场景（见 Phase 8）。

**Organization**: 任务按用户故事分组，便于独立实现与验证每个故事。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成依赖）
- **[Story]**: 任务所属用户故事（US1/US2/US3/US4/US5）
- 每个任务均包含具体文件路径

## Path Conventions

本项目是既有 Electron 三进程桌面应用，实际路径以 `src/main/`、`src/preload/`、`src/renderer/src/` 为准（见 plan.md「Project Structure」），不使用模板默认的 `src/`、`tests/` 通用占位路径。

---

## Phase 1: Setup（共享基础设施）

**Purpose**: 安装新增依赖、搭建渲染层新目录与最基础的类型定义

- [x] T001 在根目录执行 `pnpm add @xyflow/react elkjs framer-motion html-to-image`，安装 research.md R-001~R-004 决策的 4 个新依赖
- [x] T002 [P] 创建 `src/renderer/src/components/er/types.ts`，定义 `ERTableNodeData`（tableId/schema/tableName/columns/comment?/foreignKeyColumnNames）与 `Node<ERTableNodeData>`/`Edge` 类型别名（per data-model.md 3.2、contracts/renderer-store-component.md）

---

## Phase 2: Foundational（阻塞性前置任务）

**Purpose**: 所有用户故事都依赖的跨进程批量查询能力、工作区标签页类型与画布运行态 Store

**⚠️ CRITICAL**: 本阶段完成前，任何用户故事均无法开始

- [x] T003 [P] 在 `src/renderer/src/types/ipc.ts` 新增 `ForeignKeyInfo`、`ErDiagramTable`、`ErDiagramData` 类型，并为 `DatabaseApi` 追加 `getErDiagramData(connectionId, database, schemas)` 方法签名（per data-model.md 一、contracts/ipc-er-diagram.md）
- [x] T004 在 `src/main/db/core/IDatabaseDriver.ts` 为 `IDatabaseDriver` 新增可选方法 `getErDiagramData?(database: string, schemas: string[]): Promise<ErDiagramData>`（依赖 T003；per research.md R-007）
- [x] T005 在 `src/main/db/core/DriverManager.ts` 实现 `getErDiagramData(connectionId, database, schemas)` 委派方法：定位驱动实例后检测 `driver.getErDiagramData` 是否存在，不存在则抛出「当前数据库类型暂不支持 ER 分析」（依赖 T004；per contracts/ipc-er-diagram.md）
- [x] T006 [P] 在 `src/main/db/driver/pg/PostgreSQLDriver.ts` 实现 `getErDiagramData`：用 contracts/ipc-er-diagram.md 给出的 2 条批量 SQL（表+列元数据、外键关系，均按 `schema = ANY($1)`）取数并聚合为 `ErDiagramTable[]`/`ForeignKeyInfo[]`（依赖 T004）
- [x] T007 在 `src/main/ipc/db.ts` 注册 `db:get-er-diagram-data` IPC 通道，委派给 `driverManager.getErDiagramData`（依赖 T005）
- [x] T008 [P] 在 `src/preload/index.ts` 的 `api.db` 上暴露 `getErDiagramData: createInvoke<[string, string, string[]], ErDiagramData>('db:get-er-diagram-data')`（依赖 T003）
- [x] T009 [P] 在 `src/renderer/src/services/queryService.ts` 新增 `getErDiagramData(connectionId, database, schemas)` 薄封装，透传 `window.api.db.getErDiagramData`（依赖 T008）
- [x] T010 [P] 在 `src/renderer/src/types/workspace.ts` 将 `WorkspaceTabType` 扩展为包含 `'er-analysis'`，新增 `ErAnalysisTabState`、`OpenErAnalysisTabPayload` 类型（per data-model.md 3.1）
- [x] T011 在 `src/renderer/src/store/workspaceStore.ts` 实现 `openErAnalysisTab(payload)`：按 `connectionId + database` 查找既有标签页，存在则 `activateTab` 复用，否则新建并激活（依赖 T010；per contracts/renderer-store-component.md，满足 FR-008/FR-009）
- [x] T012 [P] 新建 `src/renderer/src/store/erStore.ts`：`pickerOpen`/`nodePositions`（`Record<tabId, Record<tableId, {x,y}>>`）/`isLayouting`（`Record<tabId, boolean>`）及对应 `setPickerOpen`/`setNodePositions`/`setLayouting`/`clearTabState` actions，不使用 `persist` 中间件（per data-model.md 3.3）

**Checkpoint**: 基础设施就绪——批量查询、标签页去重、画布状态 Store 均可用，用户故事可以开始实现

---

## Phase 3: User Story 1 - 从连接管理面板直接进入 ER 分析 (Priority: P1) 🎯 MVP

**Goal**: 用户在数据库节点下拉菜单选择「ER 分析」后，直接看到该数据库渲染完成的 ER 图（表结构 + 外键连线 + 自动布局 + 缩放/平移/拖拽）

**Independent Test**: 展开一个已连接的连接，左键点击其下任意业务数据库，从下拉菜单选择「ER 分析」，验证打开的新标签页展示该数据库的表结构与外键关系图，且可缩放/平移/拖拽

### Implementation for User Story 1

- [x] T013 [P] [US1] 在 `src/renderer/src/components/er/layout/ERLayoutEngine.ts` 实现 `computeLayout(nodes, edges)`：封装 `elkjs` 的 `org.eclipse.elk.layered` 分层算法，输入输出均为 React Flow 原生 `Node`/`Edge` 类型（依赖 T002；per research.md R-002、contracts/renderer-store-component.md）
- [x] T014 [P] [US1] 在 `src/renderer/src/components/er/ERTableNode.tsx` 实现自定义表节点：展示表名/schema、各列列名与数据类型、主键列图标标识（依赖 T002；per 09-ER图实现提示词.md 视觉规范、SC-003）
- [x] T015 [US1] 在 `src/renderer/src/components/er/ERDiagram.tsx` 实现标签页根组件：调用 `queryService.getSchemas` + `queryService.getErDiagramData` 取数，将 `ErDiagramData` 转换为 `Node<ERTableNodeData>[]`/`Edge[]`（按 `sourceTable` 聚合出每表 `foreignKeyColumnNames`），调用 `ERLayoutEngine.computeLayout` 得到初始位置，渲染 `<ReactFlow>` + `<Controls>` + `<Background>` + `<MiniMap>`，支持鼠标滚轮缩放、空白区域拖拽平移、节点拖拽移动（依赖 T009、T012、T013、T014；per contracts/renderer-store-component.md，满足 FR-010/FR-011/FR-012/FR-013）
- [x] T016 [US1] 在 `src/renderer/src/components/schema/DatabaseNode.tsx` 用 shadcn `DropdownMenu` 包裹现有数据库节点按钮，新增「ER 分析」`DropdownMenuItem`，`onSelect` 调用 `useWorkspaceStore.getState().openErAnalysisTab({ connectionId, connectionName, database: database.name })`，保留原有左键展开/激活行为（依赖 T011；per contracts/renderer-store-component.md，满足 FR-001/FR-002）
- [x] T017 [US1] 在 `src/renderer/src/components/work/WorkspacePanel.tsx` 新增 `activeTab?.type === 'er-analysis' && <ERDiagram tab={activeTab} />` 分发分支（依赖 T015）

**Checkpoint**: User Story 1 应完全可独立运行与验证——从连接管理面板打开数据库的 ER 分析标签页，看到渲染完成、可交互的 ER 图

---

## Phase 4: User Story 2 - 从侧边栏入口通过筛选确认目标数据库 (Priority: P1)

**Goal**: 用户从侧边栏「ER 分析」入口打开居中悬浮面板，通过选择/筛选连接与数据库，最终打开与 User Story 1 完全一致的 ER 分析标签页

**Independent Test**: 点击侧边栏「ER 分析」入口，验证悬浮面板出现；选择或筛选连接后验证展示该连接下的业务数据库列表；选中数据库后验证面板关闭且打开对应 ER 分析标签页

### Implementation for User Story 2

- [x] T018 [P] [US2] 在 `src/renderer/src/config/modes.tsx` 新增 Work 模式侧边栏「ER 分析」菜单项，`onClick` 调用 `useErStore.getState().setPickerOpen(true)`（依赖 T012；per research.md R-009）
- [x] T019 [US2] 新建 `src/renderer/src/components/er/ERPickerPanel.tsx`：复用 `SearchPalette.tsx` 的 Radix Dialog 居中悬浮模式，内部维护 `selectedConnectionId` 私有状态；提供连接下拉列表 + 连接名称筛选输入框（读取 `connectionStore` 中已连接的连接列表，前端按输入字符串过滤，未匹配到时提示「未找到匹配连接」并禁止继续）；连接确认后调用 `connectionStore.loadDatabases`（若未加载）展示业务数据库列表；选中数据库后调用 `openErAnalysisTab` 并 `setPickerOpen(false)`（依赖 T011、T012；per contracts/renderer-store-component.md，满足 FR-004/FR-005/FR-006/FR-007，Edge Case：未匹配连接）
- [x] T020 [US2] 在 Work 模式 Shell 根组件（`SearchPalette` 当前挂载的同级位置）挂载 `<ERPickerPanel />`，使其在 `erStore.pickerOpen` 为真时全局可见（依赖 T019）

**Checkpoint**: User Story 1 与 User Story 2 均可独立工作——两条入口最终打开的 ER 分析标签页呈现能力一致（FR-008）

---

## Phase 5: User Story 3 - 查看数据库的表结构与关联关系 (Priority: P1)

**Goal**: 补齐 ER 分析视图在真实场景下必须处理的边界情况——加载状态、查询失败重试、空库、无外键——使核心查看能力在所有场景下都不会静默失败或展示空白/错误画布

**Independent Test**: 分别对「空库」「有表无外键」「查询失败」三种数据库触发 ER 分析，验证均展示对应的明确提示而非空白或崩溃；对加载中的目标重复触发验证不会重复请求或产生重复标签页

### Implementation for User Story 3

- [x] T021 [US3] 在 `src/renderer/src/components/er/ERDiagram.tsx` 补充加载态：数据获取期间显示加载指示，加载完成前禁止重复触发（依赖 T015；per FR-016 前半、Edge Case「加载中重复触发」）
- [x] T022 [US3] 在 `src/renderer/src/components/er/ERDiagram.tsx` 补充错误态：`getErDiagramData`/`getSchemas` 失败时展示可读中文错误信息与「重试」按钮，不静默失败（依赖 T015；per FR-016 后半）
- [x] T023 [US3] 在 `src/renderer/src/components/er/ERDiagram.tsx` 补充空状态：`tables.length === 0` 时展示「该数据库暂无表」提示，替代空白画布（依赖 T015；per FR-014）
- [x] T024 [US3] 在 `src/renderer/src/components/er/ERDiagram.tsx`（或 `ERLayoutEngine.ts`）补充无外键分支：`foreignKeys.length === 0` 时所有表仍按网格排列展示，并附带「未发现关联关系」提示（依赖 T013、T015；per FR-015）
- [x] T025 [P] [US3] 新建 `src/renderer/src/components/er/EREdge.tsx` 或在 `ERDiagram.tsx` 中配置默认 Edge 样式：外键连线颜色、箭头样式、以 `constraintName` 缩写作为标签（依赖 T002；per 09-ER图实现提示词.md 视觉规范，SC-002 的可视化呈现）

**Checkpoint**: User Story 1/2/3 共同构成完整、健壮的核心 ER 分析能力，覆盖 spec.md 全部 Edge Cases 中与"查看"相关的场景

---

## Phase 6: User Story 4 - 同时对比多个数据库的 ER 结构 (Priority: P2)

**Goal**: 多个 ER 分析标签页的画布状态（节点拖拽位置、布局中标志）互相独立，关闭标签页后正确清理状态

**Independent Test**: 为两个不同数据库分别打开 ER 分析标签页，拖拽调整其中一个的节点位置后切换标签页来回验证位置各自保留；关闭其中一个标签页验证另一个不受影响

### Implementation for User Story 4

- [x] T026 [US4] 在 `src/renderer/src/components/er/ERDiagram.tsx` 的节点拖拽结束回调中调用 `erStore.setNodePositions(tabId, positions)`，并在组件挂载/数据加载完成时优先读取 `erStore.nodePositions[tabId]` 覆盖 `ERLayoutEngine` 计算出的默认位置（依赖 T012、T015；per FR-018）
- [x] T027 [US4] 在 `src/renderer/src/components/er/ERDiagram.tsx` 的卸载清理逻辑（或 `workspaceStore.closeTab` 关闭 `er-analysis` 标签页的调用点）中调用 `erStore.clearTabState(tabId)`，避免状态随标签页反复开关堆积（依赖 T012、T015；per FR-017）

**Checkpoint**: 多个 ER 分析标签页可同时存在且互不干扰（SC-006）

---

## Phase 7: User Story 5 - 导出 ER 图用于分享或存档 (Priority: P3)

**Goal**: 用户可将当前画布导出为一张反映当前表节点与连线的图片文件

**Independent Test**: 在已加载完成的 ER 分析标签页中触发导出操作，验证生成的图片包含当前画布内容

### Implementation for User Story 5

- [x] T028 [P] [US5] 新建 `src/renderer/src/components/er/ERToolbar.tsx`：提供「自动布局」「导出图片」操作按钮，`isLayouting` 时禁用自动布局按钮（依赖 T002）
- [x] T029 [US5] 在 `src/renderer/src/components/er/ERDiagram.tsx` 实现导出处理函数：结合 `@xyflow/react` 的 `getNodesBounds`/`getViewportForBounds` 计算导出边界，用 `html-to-image` 对画布 DOM 容器截图生成 PNG 文件（依赖 T015；per research.md R-004，满足 FR-019）
- [x] T030 [US5] 在 `src/renderer/src/components/er/ERDiagram.tsx` 挂载 `<ERToolbar>`，将「自动布局」按钮接回 T013 的 `computeLayout`（重新计算并通过 T026 的位置写入路径更新画布），「导出图片」按钮接入 T029（依赖 T026、T028、T029）

**Checkpoint**: 全部 5 个用户故事均已交付，功能范围与 spec.md 完全对齐

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 动效、主题适配与最终验证

- [x] T031 [P] 在 `src/renderer/src/components/er/ERTableNode.tsx` 使用 `framer-motion` 添加节点入场动画（fade + scale），在 `ERDiagram.tsx` 中为自动布局触发后的节点位置变化添加过渡动画（依赖 T014、T015、T024/T030；per research.md R-003）
- [x] T032 [P] 核对 `ERTableNode`/`EREdge`/`ERToolbar`/`ERPickerPanel` 在暗色主题下的配色与项目现有主题变量一致（依赖 T014、T019、T025、T028）
- [x] T033 执行 `pnpm typecheck` 与 `pnpm lint`，修复本功能引入的全部类型错误与代码规范问题
- [x] T034 按 [quickstart.md](./quickstart.md) 完整走一遍全部 5 个用户故事场景与边界/异常场景表格，记录结果

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，可立即开始
- **Foundational (Phase 2)**：依赖 Setup 完成——阻塞全部用户故事
- **User Story 3 的角色说明**：spec.md 中 User Story 3（查看能力）与 User Story 1/2（两条入口）优先级同为 P1，但技术上 US1/US2 的「独立测试」标准（打开标签页后必须看到渲染完成的表结构图）依赖核心渲染管线存在。为避免同一套渲染代码（ERDiagram/ERTableNode/ERLayoutEngine）被拆散到多个故事阶段重复出现，本任务列表将「核心渲染管线的搭建」放在 **User Story 1（Phase 3）** 中完成（US1 同时是 spec.md 明确指定的 MVP），User Story 3（Phase 5）承接的是核心渲染管线之上的**健壮性收尾**——加载态/错误态/空库/无外键四类边界场景，这正是 spec.md User Story 3 的 Edge Cases 与 FR-014/FR-015/FR-016 所覆盖的范围。因此实际实现顺序为 US1 → US2 → US3，而非严格按 spec.md 列出的 US1/US2/US3 平级顺序独立展开；三者仍同为 P1，可视为一组共同交付的核心能力。
- **User Story 4/5 (P2/P3)**：依赖 Foundational 与 User Story 1（复用其 `ERDiagram`/`erStore` 用法），可在 US1 完成后与 US2/US3 并行推进
- **Polish (Phase 8)**：依赖所有已交付的用户故事阶段

### User Story Dependencies

- **User Story 1 (P1)**：依赖 Foundational（Phase 2）——不依赖其他用户故事，是本功能技术上唯一的「起点」故事
- **User Story 2 (P1)**：依赖 Foundational 与 User Story 1 已建成的 `ERDiagram`/`openErAnalysisTab`（复用而非重新实现），新增内容仅为侧边栏入口与悬浮面板，可独立验证「入口触发」这一维度
- **User Story 3 (P1)**：依赖 Foundational 与 User Story 1 已建成的 `ERDiagram`（在其之上补充边界场景处理），可独立验证「健壮性」这一维度
- **User Story 4 (P2)**：依赖 Foundational 与 User Story 1（复用 `erStore`/`ERDiagram`），可独立验证「多标签页独立状态」
- **User Story 5 (P3)**：依赖 Foundational 与 User Story 1（复用 `ERDiagram`），可独立验证「导出」

### Within Each User Story

- 布局引擎/节点组件等展示单元先行，根组件整合其次，入口接线最后
- 核心渲染完成后再补充边界场景处理（US3）、状态隔离（US4）、导出（US5）

### Parallel Opportunities

- Setup 阶段 T002 可与 T001 并行
- Foundational 阶段 T003 完成后，T004（→T005/T006）与 T008（→T009）、T010（→T011）、T012 均可并行推进（不同文件）
- User Story 1 阶段 T013、T014 可并行（不同文件），完成后再合并进 T015
- User Story 2、3、4、5 在 User Story 1 完成后可由不同开发者并行推进
- Polish 阶段 T031、T032 可并行

---

## Parallel Example: Foundational Phase

```bash
# T003 完成后，以下任务可并行：
Task: "为 IDatabaseDriver 新增 getErDiagramData? 可选方法 in src/main/db/core/IDatabaseDriver.ts"
Task: "在 preload/index.ts 暴露 api.db.getErDiagramData"
Task: "扩展 workspace.ts 的 WorkspaceTabType 与新增 Tab 状态类型"
Task: "新建 erStore.ts"
```

## Parallel Example: User Story 1

```bash
# 可并行开工：
Task: "实现 ERLayoutEngine.computeLayout in src/renderer/src/components/er/layout/ERLayoutEngine.ts"
Task: "实现 ERTableNode 自定义节点 in src/renderer/src/components/er/ERTableNode.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键——阻塞所有用户故事）
3. 完成 Phase 3: User Story 1（包含核心渲染管线，是完整可用的最小可行版本）
4. **停下并验证**：按 quickstart.md 场景 1 独立测试 User Story 1
5. 视情况演示/交付

### Incremental Delivery

1. 完成 Setup + Foundational → 基础设施就绪
2. 加入 User Story 1 → 独立测试 → 演示（MVP！）
3. 加入 User Story 2 → 独立测试 → 演示（第二条入口）
4. 加入 User Story 3 → 独立测试 → 演示（边界场景健壮性）
5. 加入 User Story 4 → 独立测试 → 演示（多标签页独立状态）
6. 加入 User Story 5 → 独立测试 → 演示（导出图片）
7. Polish：动效、主题适配、静态检查、quickstart 全量验证

---

## Notes

- `[P]` 任务 = 不同文件、无未完成依赖
- `[Story]` 标签用于将任务追溯到具体用户故事
- 每个用户故事均应可独立完成与验证
- 每完成一个任务或一组逻辑相关任务后提交一次
- 可在任意 Checkpoint 处停下独立验证对应故事
- 避免：模糊任务描述、多个任务同时改动同一文件而未标注依赖顺序、破坏故事独立性的跨故事耦合（Phase 3 已就 US1/US3 的技术耦合给出明确说明，其余故事均保持独立）
