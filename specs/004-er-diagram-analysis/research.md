# Research: ER 图分析

**输入**：[spec.md](./spec.md) · 参考方案：[doc/09-ER图实现提示词.md](../../doc/09-ER图实现提示词.md)

本文档记录技术方案中所有需要提前决策的问题，格式统一为 Decision / Rationale / Alternatives considered。

---

## R-001 图形渲染引擎选型

- **Decision**：采用 `@xyflow/react`（React Flow v12）作为 ER 图画布渲染引擎。
- **Rationale**：项目当前无任何图形/关系图渲染依赖（`package.json` 未安装 `react-flow`、`cytoscape`、`vis-network` 等）。`@xyflow/react` 纯 TypeScript、零原生依赖，内置画布缩放/平移/拖拽/框选/MiniMap，且原生支持自定义 Node/Edge 组件，可直接承载 FR-010～FR-013 的表实体与连线渲染，避免手写 SVG/Canvas 交互层（命中测试、缩放矩阵、拖拽阈值等）带来的复杂度与缺陷面。方案文档（09-ER图实现提示词.md）亦以此为基础给出交互规范，采用同一技术可直接复用其设计细节。
- **Alternatives considered**：
  - 手写 SVG/Canvas 渲染：完全掌控但需自行实现平移缩放矩阵、命中测试、拖拽、自动布局对接，开发与维护成本远高于收益，排除。
  - `cytoscape.js` / `vis-network`：面向通用图可视化，样式定制（表头/列表/主键图标等 DataGrip 级别的节点内部结构）不如 React 组件树自然，且体积与学习成本更高，排除。

## R-002 自动布局引擎选型

- **Decision**：采用 `elkjs`（`org.eclipse.elk.layered` 分层算法）作为自动布局引擎，封装为独立的 `ERLayoutEngine` 模块。
- **Rationale**：FR-012/FR-015 要求初次打开与"无外键关系"场景下都要给出可读、无重叠的布局。`elkjs` 是纯 JS（Web Worker 内运行）移植版，无原生依赖，其分层算法+正交边路由对"表-外键"这种有向层次关系的图形表现明显优于力导向布局，是 ER 图/依赖图场景的业界常见选择。
- **Alternatives considered**：
  - `dagre`：更轻量，但边路由为直线/贝塞尔曲线，密集外键场景下交叉线可读性差于 ELK 的正交路由；缺少 ELK 丰富的分层/对齐配置项。
  - 力导向布局（`d3-force`）：适合无方向关系图，ER 图有清晰的引用方向，层次布局的可读性更符合 DataGrip 级别体验目标，排除。
  - 完全依赖用户手动摆放：直接违反 FR-012（必须自动初始布局），排除。

## R-003 动画方案选型

- **Decision**：采用 `framer-motion` 承载节点入场动画与自动布局触发后的位置过渡动画；画布本身的实时拖拽/缩放/平移仍由 React Flow 原生处理，不接入 framer-motion。
- **Rationale**：SC-005 要求"缩放/平移/拖拽保持流畅、无感知卡顿"，自动布局重新计算后表实体位置会整体跳变，若无过渡动画用户会感知为"画面闪烁/错乱"，损害可用性；参考方案文档亦将其列为核心交互要求（§5.3/§5.4/§7.4）。`framer-motion` 是声明式、按需渲染时才计算的动画库，纯 JS 无原生依赖，接入成本低于手写 `requestAnimationFrame` 过渡。
- **Alternatives considered**：
  - 纯 CSS `transition`：可覆盖简单的位置过渡，但无法方便地表达"入场 scale+opacity"与"退场"两种不同曲线组合，且与 React 状态驱动的重渲染时机协调更繁琐。
  - 不做过渡动画：直接跳变，实现最简单，但明显偏离参考方案与 DataGrip 级体验目标，作为兜底方案而非首选。

## R-004 图片导出方案选型

- **Decision**：采用 `html-to-image` 库，结合 React Flow 提供的 `getNodesBounds` / `getViewportForBounds` 工具函数计算导出边界，实现 FR-019 的 PNG 导出。
- **Rationale**：`@xyflow/react` v12 不内置导出能力（早期 `react-flow-renderer` 的 `toPng` 已移除），`html-to-image` 是 React Flow 官方文档中导出画布截图的推荐配套库，纯 JS、体积小、无原生依赖，可直接对 React Flow 的 DOM 容器截图。
- **Alternatives considered**：
  - 手写 Canvas 重绘所有节点/连线生成图片：需要重新实现一套与 DOM 渲染平行的绘制逻辑，维护两套视觉表现，成本过高，排除。
  - 依赖后端（主进程）截图：ER 图完全是渲染进程内的可视化状态（节点位置、缩放视口都在渲染进程内存中），主进程截图需要额外的窗口级截图 IPC 且无法裁剪到画布区域，不如前端方案直接，排除。

## R-005 外键与列数据的查询粒度：整库批量查询 vs 逐表查询

- **Decision**：新增一个驱动层批量接口 `getErDiagramData(database, schemas)`，一次调用内用 2 条 SQL（表+列元数据一条、外键关系一条，均以 `schema = ANY($1)` 方式覆盖多个 schema）取回目标数据库下所有可见 schema 的表结构与外键关系，不复用现有逐表的 `getColumns(database, schema, table)`。
- **Rationale**：现有 `getTables`/`getColumns` 均是"每 schema 一次"/"每表一次"的细粒度接口，是为 Schema 树按需展开设计的。ER 分析场景要一次性拿到整库（可能跨多个 schema、数十至上百张表）的完整结构，若逐表调用会产生 `schema 数 × 表数` 次 IPC + SQL 往返，直接违反 SC-001（≤50 表要在 5 秒内渲染完成）与用户明确提出的"注意性能优化"要求。批量查询把往返次数从 O(N) 降到 O(1)，是本功能最关键的性能设计点。
- **Alternatives considered**：
  - 复用现有 `getSchemas` + 循环 `getTables` + 循环 `getColumns`：实现最简单、无需新增驱动方法，但在表数较多时往返次数与延迟线性增长，不满足性能目标，排除。
  - 前端并发发起多个 `getColumns` 请求：仍是多次 IPC + 多条 SQL，只是把串行改并行，无法降低数据库侧的往返总数，且对连接池瞬时压力更大，排除。

## R-006 跨进程共享类型 vs 渲染层图形库类型的边界

- **Decision**：`ForeignKeyInfo`、`ErDiagramTable`、`ErDiagramData` 三个类型作为跨进程共享类型定义在 `src/renderer/src/types/ipc.ts`（同时被 `IDatabaseDriver.ts`、IPC 处理器、预加载脚本、渲染进程 Service 引用）；而 React Flow 特定的 `Node<ERTableNodeData>`/`Edge` 包装类型，只定义在 `src/renderer/src/components/er/types.ts` 内，不进入 `ipc.ts`。
- **Rationale**：宪法 II 要求 IPC 接口类型化、跨进程共享；但 `Node`/`Edge` 是渲染层技术选型（React Flow）引入的包装类型，与"数据库返回了什么数据"无关。若把它们混入 `ipc.ts`，会让主进程/驱动层的类型定义间接依赖渲染进程的图形库选型，未来更换图形库（或复用同一批数据渲染成别的视图，如导出为 Markdown ER 描述）时需要连带修改跨进程契约。保持这条边界，是"封装解耦、提高代码可复用性"在类型层面的具体落地。
- **Alternatives considered**：
  - 全部类型都放 `ipc.ts`：省去一次类型转换，但耦合渲染层技术选型到跨进程契约，排除。

## R-007 驱动能力检测与"暂不支持"的呈现方式（FR-020）

- **Decision**：`IDatabaseDriver.getErDiagramData` 声明为可选方法（`getErDiagramData?(...)`），与现有 `getRoles?`/`getFunctions?`/`getProcedures?` 同款"可选能力"模式一致；`DriverManager.getErDiagramData` 在委派前检测目标驱动是否实现该方法，未实现时抛出明确的中文错误（如"当前数据库类型暂不支持 ER 分析"），由渲染层 Service/Store 捕获后展示为 FR-016 要求的可读错误信息，而不是静默失败或展示空图。
- **Rationale**：宪法 IV 明确"新增数据库类型只需新增适配器，不改动 IPC 层和 UI 层"。用可选方法+能力检测的方式，使得未来新增 MySQL/SQLite 等适配器时，只需在对应 Driver 类中实现该方法即可"解锁"ER 分析，IPC 通道、预加载、渲染层组件、Store 均不需要改动；同时也满足 FR-020 对不支持类型给出明确提示的要求。当前系统 `DatabaseType` 只有 `'postgresql'` 一个成员，因此该分支在本期实际不会触发，但接口设计上已经为将来铺好路。
- **Alternatives considered**：
  - 在 `DatabaseType` 上做联合类型穷举检查（如 `if (type !== 'postgresql') throw ...`）：与"新增类型不改动既有分支"的适配器模式相悖，排除。

## R-008 ER 分析标签页的状态归属：新建独立 Store vs 复用 workspaceStore

- **Decision**：ER 分析标签页的"元信息"（connectionId/connectionName/database）作为 `WorkspaceTab.state` 的新变体（`ErAnalysisTabState`）纳入既有 `workspaceStore`，与 `QueryTabState`/`TableTabState` 同级；而"画布运行态"（每个标签页的节点位置缓存、当前是否在重新布局中、悬浮选择面板的开关状态）新建一个独立的 `erStore`，不写入 `workspaceStore`，也不做持久化（无 `persist` 中间件）。
- **Rationale**：`workspaceStore` 现有的 Tab 状态字段都是"业务语义状态"（SQL 文本、分页参数等），关闭应用重开后不需要保留画布像素级坐标这类"纯展示态"；而拖拽产生的节点坐标属于高频变更的瞬态 UI 状态，与查询结果/分页状态的更新频率、生命周期都不同，拆到独立 Store 避免 `workspaceStore` 因高频画布更新而整体重渲染订阅它的其它组件（如标签栏）。这也直接对应 User Story 4/FR-018："各标签页画布状态互相独立"——用 `Record<tabId, ...>` 天然满足。
- **Alternatives considered**：
  - 完全塞进 `WorkspaceTab.state`：会让 `workspaceStore` 承担与其他 Tab 类型语义不一致的高频 UI 状态更新，且没有必要持久化的坐标信息会被现有对该 Store 的假设（如是否需要序列化）复杂化，排除。

## R-009 侧边栏悬浮选择面板的实现路径

- **Decision**：新建 `ERPickerPanel` 组件，复用 `SearchPalette.tsx` 已验证的"Radix Dialog 居中悬浮"模式（Esc/点击遮罩关闭），开关状态放在新建的 `erStore`（`pickerOpen: boolean`），由侧边栏配置 `modes.tsx` 中 `'templates'` 菜单项的 `onClick` 触发，与 `'new-task'` 菜单项调用 `useWorkspaceStore.getState().addConnectionTab()` 的既有写法保持同一风格（直接调用 Store action，不引入路由跳转）。
- **Rationale**：项目已经有一个"点击侧边栏 → 打开居中悬浮层"的先例（`SearchPalette` + `shellStore.searchOpen`），复用其交互骨架（而不是发明新的弹层机制）符合宪法 III 的组件职责单一与一致性要求，用户学习成本也更低。
- **Alternatives considered**：
  - 把开关状态放进已有 `shellStore`：`shellStore` 定位是"外壳级 UI 状态"（侧边栏折叠、窗口最大化等），ER 面板的开关与其后续要挂载的"已选连接/已选数据库"筛选态强相关，放进专属的 `erStore` 内聚性更好，排除放入 `shellStore`。

## 结论

以上 9 项决策均已落地为可执行方案，无遗留的 `NEEDS CLARIFICATION` 项，可进入 Phase 1 设计。
