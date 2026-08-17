# Phase 0 Research: 内存占用优化

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

spec.md 中所有验收标准均已给出明确默认值（5 万行、10 分钟、40 轮），无 `[NEEDS CLARIFICATION]` 标记遗留。本文档记录的是技术实现路径上的关键决策——每一项都存在"更彻底"与"更保守"的两种做法，需要在改动量、依赖引入、与现有代码风格一致性之间权衡。

## 1. 查询结果行数上限的实现方式

**Decision**：在结果已经被 `pg`/`mysql2` 驱动一次性物化到内存后，再执行行数裁剪（"先物化再裁剪"），硬性上限 `MAX_RESULT_ROWS = 50_000`，抽取为 `src/main/db/core/resultLimits.ts` 中的共享常量与 `truncateRows()` 函数，供 `PostgreSQLDriver.runQuery` 与 `MySQLDriver.runQuery` 共同调用。

**Rationale**：

- `package.json` 中未包含任何流式查询依赖（如 `pg-query-stream`、`mysql2` 的 streaming 模式虽然原生支持但需要重写 `runQuery` 的调用约定），引入真正的流式读取会改变查询执行的异步模型（从一次性 `await pool.query()` 变为事件流），改动面从"驱动层内部一个函数"扩大到"上层所有调用 `query()` 的地方"（schema 浏览、ER 图、DDL 查看等均复用同一 `query` 方法），违反宪法 VIII 依赖/改动最小化原则与 plan.md 中"改动集中"的约束。
- 先物化再裁剪的方式下，`rows.length`（裁剪前）天然就是"数据库本次查询实际返回的总行数"，可以直接赋值给 `QueryResult.rowCount`，无需额外一次 `COUNT` 查询即可满足 FR-002"提示已展示行数与上限"的要求。
- 两个驱动的 `runQuery` 结构高度对称（均是 `连接池.query() → 组装 QueryField[] → 组装 QueryResult`），把截断逻辑抽成共享函数可以保证两个驱动的截断行为（上限值、`truncated` 判定条件）永远一致，避免未来只改一处导致行为漂移。

**Alternatives considered**：

- _真正的流式读取（`pg-query-stream` / mysql2 streaming）_：内存峰值理论上更低（不必先物化全部行），但需要新依赖、需要重写 `runQuery` 调用方的返回值处理方式（从 Promise 变为流），且 SC-001 要求的是"峰值不随行数增大而继续升高"，先物化再裁剪对 5 万行这个量级本身已经足够满足（十万行 JS 数组物化后再裁剪至 5 万，峰值仍是可控的、一次性的，不会随行数增长到百万级才出现明显差异）。舍弃：改动面过大、收益在当前上限量级下不明显。
- _在 SQL 层强制注入 `LIMIT`_：对用户原始 SQL 做文本改写风险很高（子查询、CTE、聚合查询语义可能被破坏，直接违反 Edge Cases 中"`COUNT` 类聚合查询不应受影响"的约束），舍弃。

## 2. 导出功能与结果截断的架构冲突

**Decision**：新增一条独立的 IPC 通道 `db:export-query-result`，由主进程重新执行一次原始查询（不截断）并直接在主进程内序列化写入目标文件；仅当 `QueryResult.truncated === true` 时，渲染层的导出操作才走这条新通道，否则沿用现状（本地序列化已持有的完整结果，减少不必要的往返）。

**Rationale**：

- 现状 `ResultTable.tsx` 的 `handleExport` 直接序列化渲染进程内存中已持有的 `result` 对象。一旦驱动层引入截断（决策 1），`result.rows` 本身就已经是被裁剪后的数据，若不改造导出路径，导出结果会连带被截断，直接违反 FR-003（"导出功能不受预览行数上限限制"）与 SC-002（"100% 完整原始数据"）。这是本次调研中发现的关键架构冲突点，必须在设计阶段显式解决，而非留给实现阶段"顺手改一下"。
- 让主进程重新执行一次查询并直接写文件，而不是"渲染进程持有全量数据再导出"，是为了避免"为了不截断预览而把全量数据整体传回渲染进程"这一反模式——那样等于把 P0 试图解决的内存问题重新引入了一遍（全量数据仍会在某个时刻整体驻留在内存里，只是从驱动层挪到了 IPC 传输和渲染进程）。主进程边算边写文件（或至少不经过渲染进程中转）可以让全量数据只在主进程内短暂存在一次。
- 只在 `truncated === true` 时才走新通道，是为了不给"结果未截断"的常见场景增加一次额外的主进程往返和重复查询开销——这种场景下渲染进程已经持有的就是完整数据，直接本地序列化更快。

**Alternatives considered**：

- _始终统一走主进程导出通道（无论是否截断）_：实现更简单（只有一条路径），但对绝大多数"结果本来就没超过 5 万行"的日常查询导出场景，多了一次不必要的重复查询与 IPC 往返，増加了导出耗时。舍弃，采用条件分流。
- _渲染进程持有截断前的完整副本，专门供导出使用_：等于在渲染进程内存中同时保留"截断后用于展示"与"完整用于导出"两份数据，直接违背本功能治理内存的初衷，舍弃。

## 3. 标签页非激活检测与结果释放机制

**Decision**：`WorkspaceTab` 新增 `lastActiveAt?: number`（上次激活时刻的时间戳）字段；`activateTab(id)` 在切换激活标签页时更新该字段；在 `workspaceStore.ts` 模块级维护一个 `setInterval`（扫描周期无需精确，建议每 60 秒一次），扫描所有 `type` 为 `query`/`table` 且非当前激活、且 `result != null`、且 `Date.now() - (lastActiveAt ?? 创建时刻) > INACTIVE_RELEASE_MS`（默认 10 分钟）的标签页，将其 `result` 置空并标记 `resultReleased: true`，仅保留 `state`（SQL 文本、筛选条件等恢复查询所需信息）。

**Rationale**：

- 复用 `sanitizeForPersist()`（`workspaceStore.ts` L45-76）已经验证过的模式——持久化时清空 `result` 但保留 `state`，说明"结果可丢弃、状态需保留"这一设计在本项目中已有先例，非激活释放只是把这个模式从"持久化时机"扩展到"运行时的定时检测"。
- 用 `setInterval` + 时间戳比较而非引入专门的调度库，符合宪法 VIII 依赖最小化；扫描周期选 60 秒（而非精确到秒）是因为 10 分钟的释放阈值本身允许若干分钟级别的抖动，不需要高精度定时器，减少不必要的性能开销。
- `setQueryResult`/表格结果写入时必须同步把 `resultReleased` 重置为 `false` 并刷新 `lastActiveAt`——否则用户刚执行完查询、还没切换标签页，就可能被误判为"已释放"（如果创建时刻早于查询完成时刻）。

**Alternatives considered**：

- _用 WeakMap 让结果随标签页对象的 GC 自动释放_：doc/08 已经论证过——本项目的 tab 索引结构是"字符串 ID → 对象"的 `Map`/`Record`，而非"对象引用做 key"，且释放必须是用户可感知的确定性时机（切回旧 tab 要立刻看到"已释放"提示，而不是等不可预测的 GC 发生），WeakMap 无法满足"确定性释放 + 可枚举扫描"的需求，舍弃（沿用 doc/08 第 4.1 节结论）。
- _标签页关闭前才释放，不做非激活定时释放_：无法满足 FR-004/SC-003（未关闭但长期非激活的标签页也要释放），舍弃。

## 4. 连接池按数据库维度释放的时机判定

**Decision**：`IDatabaseDriver` 新增可选方法 `releaseDatabase?(database: string): Promise<void>`，两个驱动各自从 `pools: Map<string, Pool>` 中取出对应 `Pool` 调用 `.end()` 并从 Map 中删除；`DriverManager` 新增 `releaseDatabase(connectionId, database)` 转发方法；渲染层在 `workspaceStore.closeTab`/`closeOtherTabs`/`closeAllTabs` 执行关闭后，遍历剩余 `tabs` 检查该 `(connectionId, database)` 组合是否还被引用，无引用才调用 `queryService.releaseDatabase(...)`。

**Rationale**：

- 释放判定必须在"关闭动作发生之后、基于剩余标签页快照"来做，而不是基于"即将关闭的标签页数量"做简单计数——因为同一个数据库可能同时被 query tab、table tab、甚至 ER 分析 tab 引用，只有全部关闭后才能安全释放，这与 spec.md Acceptance Scenario 2（"仍有其他标签页依赖时不释放"）直接对应。
- `releaseDatabase` 设计为可选接口方法（`?`），是因为如果未来出现不支持"按数据库切分连接池"的驱动类型（当前只有 PostgreSQL/MySQL，两者都支持），不强制所有实现者提供该方法，保持接口向后兼容。
- 管理连接（`managementKey`/管理数据库）不参与本次释放逻辑——它是数据库列表浏览等操作依赖的公共连接，与具体某个"用户打开的数据库标签页"生命周期无关，释放时需要显式跳过，避免误释放导致后续 `getDatabases` 等操作失败。

**Alternatives considered**：

- _引用计数字段直接维护在驱动层_：把"谁在用这个数据库"的知识放进主进程驱动层，需要驱动层感知渲染进程的标签页概念，违反宪法 I 的进程职责边界（驱动层应只关心连接/查询，不关心 UI 状态），舍弃，改为渲染层做引用判定、主进程只提供无状态的释放动作。

## 5. 对话轮次提示的实现层级

**Decision**：不修改 `conversationStore.ts` 本身（`turns: ConversationTurn[]` 已完整支持读取当前长度），仅在渲染对话内容的组件层新增一个基于 `turns.length >= 40` 的条件渲染提示条，提供"新建对话"按钮调用既有的 `createConversation()`。

**Rationale**：

- spec.md 明确要求"提示而非截断"（用户需求原文即"要给用户最底部提示"），`turns` 数组本身不需要任何裁剪或上限逻辑，这与 P0~P2 的"主动释放内存"策略不同——P3 的内存增长是被有意接受的，只是需要引导用户主动新建对话来间接控制单个对话的历史长度。
- 完全在渲染层实现，不新增 IPC、不新增主进程改动，是四项改动中改动面最小的一项，符合 doc/08 中"改动量小、优先级低"的定位（对应文档建议实施顺序的第 5 项）。

**Alternatives considered**：

- _在 `conversationStore.ts` 内部计算并存储一个 `shouldShowLengthNotice` 派生字段_：会引入"派生状态需要手动同步"的维护负担（每次 `turns` 变化都要记得更新该字段），不如在渲染时直接用 `turns.length >= threshold` 做一次比较，属于纯函数式派生，无需额外状态。

## 结论

以上 5 项决策均不引入新依赖、不改变现有类型系统的 `any` 使用状态、不违反宪法任一条款，可以直接进入 Phase 1 设计阶段。
