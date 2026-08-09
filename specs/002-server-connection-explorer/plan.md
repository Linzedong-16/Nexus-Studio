# Implementation Plan: 数据库服务器级连接与结构树重构

**Branch**: `002-server-connection-explorer` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-server-connection-explorer/spec.md`

## Summary

将数据库连接的语义从"绑定单一数据库"调整为"服务器级连接"：一条连接配置建立后，用户可浏览该账号在服务器上有权限访问的全部数据库，无需为每个数据库单独建库连接。侧边栏结构树同步重构为"服务器 → 数据库 → Schema → 结构模块"的层级，结构数据按需通过数据库驱动动态获取；PostgreSQL 专属的 Query/Functions/Procedures 模块通过一份静态"数据库类型能力配置"驱动渲染，与通用的 Tables/Views 模块解耦，为未来新增数据库类型预留扩展点。技术方案的核心约束是 PostgreSQL 协议层不支持跨库会话，因此驱动内部按数据库维护独立连接池，仅在用户实际展开某数据库节点时才建立对应池并发起查询（详见 `research.md` 决策 1）。既有的查询执行、数据浏览、连接管理三类功能在改造后必须保持可用（FR-014~FR-016）。

## Technical Context

**Language/Version**: TypeScript 5.9+（strict 模式），Node.js（Electron 39 内置运行时）

**Primary Dependencies**: Electron 39、React 19、`pg`（PostgreSQL 驱动）、Zustand 5、`react-resizable-panels`、shadcn/ui（Radix UI）—— 均为项目既有依赖，本特性不新增第三方依赖

**Storage**: `electron-store`（JSON 文件，连接元数据）+ Electron `safeStorage`（连接密码加密存储）；本特性不改变持久化 Schema，仅将 `StoredConnection.database` 由必填改为可选（见 `research.md` 决策 6）

**Testing**: 项目当前无自动化测试框架，遵循宪法"开发工作流"约定的手动验证：`pnpm run typecheck` + `pnpm run lint` + `pnpm run format` 门禁 + 按 `quickstart.md` 场景手动走查

**Target Platform**: 桌面端 Electron 应用（Windows/macOS/Linux）

**Project Type**: Desktop app（Electron 三进程架构：main / preload / renderer）

**Performance Goals**: 展开服务器/数据库/Schema 节点后，在网络与服务器状态正常时 3 秒内完成加载或明确进入错误态（SC-004）

**Constraints**: PostgreSQL 单连接/会话不能跨库查询，多数据库浏览必须依赖驱动内多连接池管理；结构树各节点数据必须按需加载，禁止连接成功后一次性拉取整台服务器的全部数据库结构（性能与规格假设约束）

**Scale/Scope**: 影响 main（IPC、驱动层）、preload、renderer（类型、Store、Service、连接表单与结构树 UI）三层约 15 个文件的改动 + 少量新文件；不引入新的 Phase，仍属于宪法 Phase 2（PostgreSQL 核心）范围内的能力深化

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 宪法原则                    | 检查点                                                                                                                                                                                                                         | 结论                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| I. 进程隔离与安全           | 数据库连接、多连接池管理仍完全在主进程（`DriverManager`/`PostgreSQLDriver`）内完成；渲染进程只通过既有 `window.api.db.*` Service 层访问；密码仍经 `safeStorage` 加解密                                                         | PASS                   |
| II. TypeScript 全栈类型安全 | `ConnectionConfig`/`DatabaseInfo`/`RoutineInfo`/`DatabaseApi` 等改动集中在 `ipc.ts` 并被 main/preload/renderer 三端共享引用；新增渲染进程本地类型放在 `types/database.ts`；不引入 `any`                                        | PASS                   |
| III. 组件化与关注点分离     | 结构树按"服务器/数据库/Schema/模块"拆分为独立组件（`components/schema/`），组件不直接调用 `window.api`，统一经 `queryService`/新增的连接相关 Service 方法封装；布局壳（`WorkspaceHome`）与业务组件保持分离                     | PASS                   |
| IV. 数据库适配器模式        | `IDatabaseDriver` 新增 `getDatabases` 必需方法与 `getFunctions`/`getProcedures` 可选方法；`factory.ts`/`DriverManager` 无需为新增数据库类型改动；PostgreSQL 专属能力通过独立的能力配置隔离，符合"新增数据库类型只需新增适配器" | PASS                   |
| V. IPC 通信契约             | 新增通道 `db:get-databases`/`db:get-functions`/`db:get-procedures` 延续 `模块:操作` 命名与 `invoke/handle` 模式；既有通道新增 `database` 参数，异常仍统一 throw 由 Service 层捕获                                              | PASS                   |
| VI. 分阶段交付与向后兼容    | 属于 Phase 2（PostgreSQL 核心）范围内的能力深化，不影响 Phase 1 外壳、不提前实现 Phase 3/4 内容                                                                                                                                | PASS                   |
| VII. 中文文档与注释规范     | 新增/修改的导出函数、类型、接口均需附中文 JSDoc；本计划与后续 `tasks.md` 用中文撰写                                                                                                                                            | PASS（实现阶段需落实） |
| VIII. 依赖最小化            | 不引入新依赖，多连接池管理复用既有 `pg.Pool` API                                                                                                                                                                               | PASS                   |

无违反项，**Complexity Tracking 留空**。

## Project Structure

### Documentation (this feature)

```text
specs/002-server-connection-explorer/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md         # Phase 1 输出
├── contracts/
│   ├── db-ipc.md              # db:* IPC 通道契约
│   └── database-capabilities.md  # 数据库类型能力配置契约
└── tasks.md              # /speckit-tasks 输出（本命令不生成）
```

### Source Code (repository root)

Electron 三进程桌面应用，沿用项目既有目录结构（见 `.specify/memory/constitution.md` 目录结构规范），本特性新增/修改如下：

```text
src/
├── main/
│   ├── ipc/
│   │   └── db.ts                       # [修改] 新增 get-databases/get-functions/get-procedures 处理器；既有通道新增 database 参数
│   └── db/
│       ├── core/
│       │   ├── IDatabaseDriver.ts      # [修改] 新增 getDatabases、可选 getFunctions/getProcedures，既有方法新增 database 参数
│       │   └── DriverManager.ts        # [修改] 转发新增方法与参数，对可选方法做防御性判断
│       ├── factory.ts                  # [不变] 新增数据库类型时才需改动
│       └── driver/pg/
│           └── PostgreSQLDriver.ts     # [修改] 多数据库连接池管理、getDatabases、getFunctions、getProcedures
│
├── preload/
│   ├── index.ts                       # [修改] 新增 3 个 createInvoke 声明
│   └── index.d.ts                     # [修改] 同步 DatabaseApi 类型
│
└── renderer/src/
    ├── types/
    │   ├── ipc.ts                     # [修改] ConnectionConfig.database 可选化；新增 DatabaseInfo/RoutineInfo；DatabaseApi 契约更新
    │   ├── database.ts                # [新增] ModuleKind、DatabaseCapability、结构树运行态类型
    │   └── workspace.ts                # [修改] QueryTabState/OpenQueryTabPayload 新增 database（及可选 schema）
    │
    ├── config/
    │   └── databaseCapabilities.ts     # [新增] 按 DatabaseType 索引的模块能力配置（可扩展契约）
    │
    ├── services/
    │   └── queryService.ts             # [修改] 新增 getDatabases/getFunctions/getProcedures；既有方法新增 database 参数
    │
    ├── store/
    │   ├── connectionStore.ts          # [修改] 扩展为服务器/数据库/Schema/模块多层运行态，替换原扁平 schemas/tablesBySchema
    │   └── workspaceStore.ts           # [修改] 查询标签页去重键调整为 connectionId+database
    │
    └── components/
        ├── work/
        │   ├── ConnectionForm.tsx      # [修改] "数据库"字段改为可选提示，文案调整为服务器级连接
        │   ├── QueryPanel.tsx           # [修改] execute 调用新增 database 参数，工具栏展示数据库上下文
        │   └── WorkspaceHome.tsx        # [修改] 引用路径改为新的 components/schema/SchemaTree
        └── schema/                     # [新增目录，对应宪法目录规范中预留的 schema/ 分类]
            ├── SchemaTree.tsx           # [新增] 顶层容器 + 空态/加载态，替代原 work/SchemaTree.tsx
            ├── ServerNode.tsx           # [新增] 服务器节点：展示连接信息、展开加载数据库列表
            ├── DatabaseNode.tsx         # [新增] 数据库节点：展开加载 Schema 列表 + databaseLevelModules（Query）
            ├── SchemaNode.tsx           # [新增] Schema 节点：按 schemaLevelModules 渲染模块分组
            └── ModuleGroup.tsx          # [新增] 通用模块分组渲染（Tables/Views/Functions/Procedures 列表 + 加载/错误态）
```

**Structure Decision**: 采用项目既有的 Electron 三进程单体结构（非多包/多项目），不引入新的顶层目录。结构树相关组件从 `components/work/SchemaTree.tsx` 迁移并拆分到宪法目录规范中已预留但尚未使用的 `components/schema/`（"Schema 浏览组件"），使其职责与 `components/work/`（工作区标签页壳）、`components/connection/`（连接表单，如后续需要）区分开，符合"业务组件单一职责"与目录结构规范；其余改动均在既有文件内按跨进程数据流（main → preload → renderer types → services → store → components）自底向上推进，不新增顶层目录或新的技术栈依赖。

## Complexity Tracking

无违反项，本节留空。
