# Implementation Plan: ER 图分析

**Branch**: `004-er-diagram-analysis` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-er-diagram-analysis/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

为项目新增 ER 图分析能力：用户通过（1）连接管理面板中业务数据库节点的左键下拉菜单，或（2）Work 模式侧边栏「ER 分析」入口触发的居中悬浮选择面板，精准确定「连接 + 数据库」目标后，以新工作区标签页的形式打开该数据库的 ER 图——将所有可见表渲染为带列信息与主键标识的节点，将外键约束渲染为节点间连接线，首次打开自动完成无重叠布局，并支持缩放/平移/拖拽/导出图片。技术方案采用 `@xyflow/react` 承载画布渲染、`elkjs` 承载自动布局、`framer-motion` 承载过渡动画、`html-to-image` 承载导出；性能关键点是新增驱动层批量方法 `getErDiagramData(database, schemas)`，用固定 2 次 SQL 查询取代逐表查询，避免 O(N) 次 IPC/SQL 往返；架构关键点是将该能力实现为 `IDatabaseDriver` 上的可选方法，使当前 PostgreSQL 之外的未来适配器可以按需选择性支持，不影响 IPC 层与 UI 层。详细决策见 [research.md](./research.md)，数据结构见 [data-model.md](./data-model.md)，接口契约见 [contracts/](./contracts/)。

## Technical Context

**Language/Version**: TypeScript 5.9+（strict 模式），Node.js（Electron 主进程运行时）

**Primary Dependencies**: Electron 39+、React 19、Zustand 5、Tailwind CSS 4、shadcn/ui（Radix）、`pg`（现有 PostgreSQL 驱动依赖）；新增 `@xyflow/react`、`elkjs`、`framer-motion`、`html-to-image`（均为本功能引入，理由见 research.md，复杂度证明见下文 Complexity Tracking）

**Storage**: PostgreSQL（用户连接的目标数据库，通过现有 `IDatabaseDriver` 适配器访问；本功能不引入应用自身的持久化存储，ER 图的画布状态为会话级内存状态，见 data-model.md 三节）

**Testing**: 项目当前未配置自动化测试框架（`package.json` 无 vitest/jest），本功能沿用项目现状，通过 `quickstart.md` 手动验证 + `pnpm typecheck`/`pnpm lint` 静态检查作为质量门槛

**Target Platform**: 跨平台 Electron 桌面应用（Windows/macOS/Linux）

**Project Type**: 桌面应用（Electron 三进程架构：main / preload / renderer）

**Performance Goals**: 对应 SC-001/SC-005——常规数据库（≤50 表）从确认目标到渲染完成 ≤5 秒；≤100 表规模下缩放/平移/拖拽保持流畅无明显卡顿

**Constraints**: 表结构+外键数据的获取必须是固定次数（2 次）的数据库往返，不得随 schema/表数量线性增长（对应用户明确提出的"注意性能优化"要求与宪法对复杂度的审视）；新增的 ER 分析能力必须通过可选驱动方法实现，不得修改 IPC 通道签名或 UI 层以侵入式地感知具体数据库类型（对应宪法 IV 数据库适配器模式与用户"后续其他关系型数据库也可能需要做适配"的明确诉求）

**Scale/Scope**: 2 个新增触发入口（数据库节点下拉菜单、侧边栏悬浮面板）、1 个新增工作区标签页类型、1 个新增驱动层方法 + 1 个新增 IPC 通道、约 8-10 个新增渲染层文件（组件/Store/布局引擎），当前仅对接 PostgreSQL 一种数据库类型

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则 | 评估 | 结论 |
|---|---|---|
| I. 进程隔离与安全 | 数据库访问（新 SQL 查询）只在主进程驱动层执行；渲染进程通过 `window.api.db.getErDiagramData` 经 `contextBridge` 访问，不直接触达 `pg`/Node API；连接凭据不经过本功能任何新代码路径 | 通过 |
| II. TypeScript 全栈类型安全 | 新增 `ForeignKeyInfo`/`ErDiagramTable`/`ErDiagramData` 作为跨进程共享类型定义在 `types/ipc.ts`，主进程与渲染进程共同引用，IPC 参数/返回值类型化（见 contracts/ipc-er-diagram.md） | 通过 |
| III. 组件化与关注点分离 | 渲染层新增组件（`ERDiagram`/`ERTableNode`/`EREdge`/`ERToolbar`/`ERPickerPanel`）各自单一职责；`ERLayoutEngine` 作为独立纯函数模块封装布局引擎细节；Service 层（`queryService`）保持组件不直接调用 `window.api` | 通过 |
| IV. 数据库适配器模式 | 新方法 `getErDiagramData` 声明为 `IDatabaseDriver` 上的可选方法，与现有 `getRoles?`/`getFunctions?` 同模式；未实现的驱动类型走明确的"不支持"提示分支，IPC 层与 UI 层不感知具体数据库类型（见 research.md R-007） | 通过 |
| V. IPC 通信契约 | 新增 `db:get-er-diagram-data` 通道遵循 `模块:操作` 命名规范，用 `createIPCHandler`/`createInvoke` 既有工厂函数实现，请求/响应类型化（见 contracts/ipc-er-diagram.md） | 通过 |
| VI. 分阶段交付与向后兼容 | 新功能不修改任何现有 IPC 通道签名、不修改现有 `WorkspaceTabType` 成员的语义、不修改现有 `DatabaseNode` 左键点击展开行为的既有效果（仅追加下拉菜单能力），纯增量交付 | 通过（实现阶段需验证下拉菜单触发与原有展开点击的交互细节不产生回归，见 contracts/renderer-store-component.md 末尾说明） |
| VII. 中文文档与注释规范 | 本 plan 及全部 Phase 0/1 产出物（research.md/data-model.md/contracts/quickstart.md）均使用中文撰写 | 通过 |
| VIII. 依赖最小化 | 新增 4 个依赖（`@xyflow/react`/`elkjs`/`framer-motion`/`html-to-image`），均超出宪法推荐技术栈表，需要 Complexity Tracking 中逐一证明必要性 | 需在 Complexity Tracking 中证明，见下文 |

**结论**：除依赖引入需要在 Complexity Tracking 中正式证明外，其余原则均直接通过，无需变更设计。

**Phase 1 设计后复查**：以上表格已依据 Phase 1 产出物（data-model.md、contracts/、quickstart.md）填写完成，各条评估均引用了具体的设计决策与文件位置；Complexity Tracking（见下文）已对 VIII 的 4 项新依赖逐一给出必要性证明与被拒绝的更简单替代方案。设计阶段未引入任何 Technical Context 中未预见的新违规项，Constitution Check 复查通过，可进入 `/speckit-tasks`。

## Project Structure

### Documentation (this feature)

```text
specs/004-er-diagram-analysis/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── ipc-er-diagram.md
│   └── renderer-store-component.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

本项目是既有的 Electron 三进程桌面应用（`src/main` / `src/preload` / `src/renderer`），不采用模板中的 library/web/mobile 结构选项。以下为本功能新增或修改的具体文件：

```text
src/
├── main/
│   ├── db/
│   │   ├── core/
│   │   │   ├── IDatabaseDriver.ts          # [修改] 新增可选方法 getErDiagramData?
│   │   │   └── DriverManager.ts            # [修改] 新增 getErDiagramData 委派方法（未实现时抛出明确错误）
│   │   └── driver/pg/
│   │       └── PostgreSQLDriver.ts         # [修改] 实现 getErDiagramData（2 条批量 SQL，见 contracts/ipc-er-diagram.md）
│   └── ipc/
│       └── db.ts                           # [修改] 注册 db:get-er-diagram-data 通道
├── preload/
│   └── index.ts                            # [修改] 暴露 api.db.getErDiagramData
└── renderer/src/
    ├── types/
    │   ├── ipc.ts                          # [修改] 新增 ForeignKeyInfo/ErDiagramTable/ErDiagramData 类型 + DatabaseApi 方法签名
    │   └── workspace.ts                    # [修改] 新增 'er-analysis' Tab 类型、ErAnalysisTabState、OpenErAnalysisTabPayload、openErAnalysisTab action
    ├── services/
    │   └── queryService.ts                 # [修改] 新增 getErDiagramData 薄封装
    ├── store/
    │   ├── workspaceStore.ts               # [修改] 实现 openErAnalysisTab（去重/复用逻辑）
    │   └── erStore.ts                      # [新增] 画布运行态 Store（pickerOpen/nodePositions/isLayouting）
    ├── config/
    │   └── modes.tsx                       # [修改] 新增侧边栏「ER 分析」菜单项，触发 erStore.setPickerOpen(true)
    ├── components/
    │   ├── schema/
    │   │   └── DatabaseNode.tsx            # [修改] 包裹 DropdownMenu，新增「ER 分析」菜单项
    │   ├── work/
    │   │   └── WorkspacePanel.tsx          # [修改] 新增 activeTab.type === 'er-analysis' 分支渲染 <ERDiagram>
    │   └── er/                             # [新增] 本功能核心目录
    │       ├── types.ts                    # ERTableNodeData、Node/Edge 类型别名
    │       ├── ERDiagram.tsx               # 标签页内容根组件：加载数据、状态机、承载 <ReactFlow>
    │       ├── ERPickerPanel.tsx           # 侧边栏入口悬浮选择面板
    │       ├── ERTableNode.tsx             # 自定义表节点组件
    │       ├── EREdge.tsx                  # 自定义外键连线组件（如需自定义样式/标签，否则用 React Flow 默认 Edge）
    │       ├── ERToolbar.tsx               # 自动布局/导出等操作入口
    │       └── layout/
    │           └── ERLayoutEngine.ts       # elkjs 封装，纯函数：(nodes, edges) => 带 position 的 nodes
    └── styles/
        └── (若需要) er-diagram.css 或复用 Tailwind 类，暗色主题适配细节见 research.md 参考文档 §8
```

**Structure Decision**：沿用项目现有的 `src/main` / `src/preload` / `src/renderer/src` 三层目录结构，不新建顶层目录。ER 分析相关的渲染层新文件全部集中在 `src/renderer/src/components/er/` 下，与 `components/schema/`、`components/work/` 等既有按功能域划分子目录的惯例一致；跨进程共享类型追加进已有的 `types/ipc.ts`（不新建类型文件），保持"一处查找所有 IPC 契约类型"的既有约定。

## Complexity Tracking

> 本节证明 Constitution Check 中"依赖最小化"原则下引入的 4 个新依赖的必要性（宪法 Governance 第 6 条）。

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| 新增依赖 `@xyflow/react` | 渲染 ER 图画布——表节点、外键连线、缩放/平移/拖拽/框选/MiniMap 均需要（FR-010~FR-013） | 手写 SVG/Canvas 需自行实现平移缩放矩阵、命中测试、拖拽阈值等交互底层逻辑，开发与维护成本远高于收益（见 research.md R-001） |
| 新增依赖 `elkjs` | 首次打开自动生成无重叠、可读的分层布局（FR-012/FR-015），且外键连线密集时需要正交路由保证可读性 | `dagre` 边路由为直线/贝塞尔曲线，密集外键场景交叉线可读性差；纯手动摆放直接违反 FR-012（见 research.md R-002） |
| 新增依赖 `framer-motion` | 自动布局重新计算后节点位置整体跳变，需要过渡动画避免用户感知为"画面错乱"（SC-005） | 纯 CSS transition 难以表达入场 scale+opacity 与位置过渡两种曲线组合，且与状态驱动重渲染时机协调更繁琐（见 research.md R-003） |
| 新增依赖 `html-to-image` | 实现 FR-019 图片导出；React Flow v12 不再内置导出能力 | 手写 Canvas 重绘所有节点/连线需要维护两套平行的视觉渲染逻辑，成本过高；主进程截图无法裁剪到画布区域且需要额外窗口级 IPC（见 research.md R-004） |
