# Phase 0 Research: 数据库服务器级连接与结构树重构

规格中的 `[NEEDS CLARIFICATION]`（历史连接迁移策略）已在 `/speckit-specify` 阶段由用户确认解决（自动升级为服务器连接）。本阶段研究的是将规格落地为技术方案时必须提前敲定的关键设计决策——这些决策直接决定 Phase 1 的数据模型与接口契约。

## 决策 1：服务器级连接如何在驱动层实现（多数据库单连接的技术可行性）

- **Decision**: 一条"服务器连接"在驱动实例内部按数据库维护独立的连接池（PostgreSQL 场景下为多个 `pg.Pool`），服务器连接本身只是这些池的管理容器；用户展开某数据库节点时才为该数据库创建/复用对应的池。
- **Rationale**: PostgreSQL（以及绝大多数关系型数据库）的单个会话/连接绑定到一个具体数据库，协议层不支持在同一连接内跨库查询或切换数据库。要在 UI 上呈现"一次连接、浏览服务器全部数据库"的体验，只能在驱动内部对每个被访问的数据库单独建立连接，服务器级连接是"一组用相同凭据管理的连接池"的逻辑抽象，而非底层单一物理连接。这与规格 FR-002/FR-008 的按需加载要求天然吻合。
- **Alternatives considered**:
  - 每次切换数据库都重新 `connect`/`disconnect` —— 违背"一次性建立"的体验目标，且无法同时保留多个已展开数据库的状态，回退到旧的单库连接模式，不采纳。
  - 为每个数据库分配独立的"虚拟连接 ID"伪装成多条独立连接 —— 会破坏"一条连接 = 一次断开操作"的语义（FR-004），且要求 UI/Store 层大量拼接与解析复合 ID，复杂度更高，不采纳。

## 决策 2：IPC 契约的扩展方式

- **Decision**: 新增 `db:get-databases` 通道用于枚举服务器上的数据库；`db:query`、`db:get-schemas`、`db:get-tables`、`db:get-columns` 在现有参数基础上新增 `database` 参数；新增 `db:get-functions`、`db:get-procedures` 用于 PostgreSQL 专属模块。
- **Rationale**: 延续宪法 V 规定的 `模块:操作` 命名与 `invoke/handle` 模式，改动面最小化，且 `createInvoke`/`createIPCHandler` 均为参数透传的工厂函数，新增参数不需要改动预加载/主进程的基础设施代码。
- **Alternatives considered**: 将 `database` 编码进 `connectionId`（如 `${connectionId}::${database}`）避免修改函数签名 —— 会让"连接"与"数据库"的领域概念在类型系统中变得模糊，且 `DriverManager` 需要额外的字符串拆分逻辑，不采纳。

## 决策 3：PostgreSQL 专属模块（Query / Functions / Procedures）与通用模块（Tables / Views）的隔离机制

- **Decision**: 在渲染进程维护一份按 `DatabaseType` 索引的静态"数据库类型能力配置"（`databaseLevelModules` + `schemaLevelModules`），结构树组件只消费该配置来决定渲染哪些模块节点，不在组件内写死数据库类型判断。主进程侧 `IDatabaseDriver` 接口中 `getFunctions`/`getProcedures` 设计为可选方法，未来不支持这些概念的数据库类型驱动无需实现空方法。
- **Rationale**: 直接对应宪法 IV"新增数据库类型只需新增适配器"的约束与规格 FR-010～FR-012 的隔离/可扩展要求。能力配置是纯静态展示元数据、不依赖运行时连接状态，放在渲染进程可避免不必要的 IPC 往返；主进程是否实现某个查询方法与渲染进程是否展示对应节点是两个独立但一致的决策点，两者都以"数据库类型"为唯一索引键，不会出现主进程能查但 UI 不显示、或 UI 显示但主进程报错的不一致。
- **Alternatives considered**: 由主进程通过 IPC 返回能力集 —— 增加一次不必要的跨进程往返，且能力集合与代码版本强绑定，实际不存在"运行时才能确定能力"的场景，不采纳。

## 决策 4：Functions / Procedures 数据来源

- **Decision**: 通过 `information_schema.routines`，按 `routine_type = 'FUNCTION'` 与 `routine_type = 'PROCEDURE'` 区分两类对象，返回名称、所属 schema、参数签名、返回类型等基础信息。
- **Rationale**: 项目现有 `getSchemas`/`getTables`/`getColumns` 已统一使用 `information_schema`，风格一致、无需额外 join `pg_proc`/`pg_language`；`routine_type` 字段本身就能区分函数与存储过程（PostgreSQL 11+ 引入 `PROCEDURE`），满足本期"列表 + 基础签名展示"的范围（不涉及函数体编辑与执行）。
- **Alternatives considered**: 直接查询 `pg_proc` 系统表 —— 信息更底层、需要额外解析 `proargtypes`/`prokind`，超出本期"仅展示清单"的范围，不采纳。

## 决策 5："Query" 模块节点的行为定位

- **Decision**: "Query" 节点是一个快捷入口：点击后以该节点所在的数据库（及可选 schema）为上下文打开一个新的查询标签页，复用现有 `openQueryTab` 机制，只需为其 payload 增加 `database`（及可选 `schema`）字段。不引入"已保存查询"或新的持久化实体。
- **Rationale**: 规格假设已明确"Query 模块特指浏览入口/快捷方式……具体 SQL 编辑与执行能力由现有查询功能提供"，与现有工作区标签页体系无缝衔接，改动集中在 payload 扩展与去重键调整（去重键从 `connectionId` 扩展为 `connectionId + database`），风险可控。
- **Alternatives considered**: 做成"最近查询/已保存查询"列表 —— 超出规格范围，不采纳。

## 决策 6：历史单库连接的兼容处理

- **Decision**: `ConnectionConfig.database`（及持久化的 `StoredConnection.database`）字段保留、类型改为可选，语义由"连接范围限制"重新解释为"默认/初始数据库"。旧版本保存的连接无需任何数据迁移脚本，读取时直接可用，且其原绑定的数据库自动成为该服务器连接下默认展开/激活的数据库节点。
- **Rationale**: 与用户在 `/speckit-specify` 阶段确认的"自动升级为服务器连接"方案一致，且不改变持久化 Schema、不需要 Store 版本升级，符合宪法 VIII"依赖最小化/不过度设计"的精神。
- **Alternatives considered**: 编写一次性迁移脚本重写存储结构 —— 本特性没有结构性破坏（字段只是从必填变可选），迁移脚本纯属过度设计，不采纳。

## Technical Context 结论

以上决策已覆盖 Phase 1 设计所需的全部前提，Technical Context 中不再有待澄清项。
