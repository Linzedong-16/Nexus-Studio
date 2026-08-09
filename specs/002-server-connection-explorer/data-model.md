# Data Model: 数据库服务器级连接与结构树重构

来源：`spec.md` 的 Key Entities，结合 `research.md` 的技术决策细化为跨进程共享类型（`src/renderer/src/types/ipc.ts`，主/预加载/渲染进程共用）与渲染进程本地类型（`src/renderer/src/types/database.ts`，UI 运行态与静态配置）。均不改变 `electron-store` 的持久化结构（见决策 6），只放宽既有字段的必填性。

## 跨进程共享类型（ipc.ts）

### ServerConnection（现有 `ConnectionConfig` 语义调整）

| 字段       | 类型                     | 变更                                              |
| ---------- | ------------------------ | ------------------------------------------------- |
| `id`       | `string`                 | 不变                                              |
| `name`     | `string`                 | 不变                                              |
| `type`     | `DatabaseType`           | 不变                                              |
| `host`     | `string`                 | 不变                                              |
| `port`     | `number`                 | 不变                                              |
| `database` | `string` → **`string?`** | 由"连接范围限制"改为"默认/初始数据库"提示，可为空 |
| `username` | `string`                 | 不变                                              |
| `password` | `string`                 | 不变                                              |
| `ssl`      | `SslConfig?`             | 不变                                              |

校验规则：`database` 为空时，驱动层使用类型相关的管理数据库（PostgreSQL 为 `postgres`）建立枚举用连接，不影响 UI 层"服务器上的全部数据库均可见"的语义。

`StoredConnection`（持久化形态）同步将 `database` 改为可选，不新增字段、不升级 Store 版本（决策 6）。

### DatabaseInfo（新增）

服务器连接下的一个可访问数据库。

| 字段    | 类型      | 说明                         |
| ------- | --------- | ---------------------------- |
| `name`  | `string`  | 数据库名                     |
| `owner` | `string?` | 数据库所有者（若驱动可获取） |

### RoutineInfo（新增，供 Functions / Procedures 复用）

| 字段                 | 类型                        | 说明                                  |
| -------------------- | --------------------------- | ------------------------------------- |
| `schema`             | `string`                    | 所属 schema                           |
| `name`               | `string`                    | 函数/存储过程名                       |
| `kind`               | `'function' \| 'procedure'` | 区分类别                              |
| `argumentsSignature` | `string?`                   | 参数签名（展示用，如 `(id integer)`） |
| `returnType`         | `string?`                   | 返回类型（存储过程通常为空）          |
| `comment`            | `string?`                   | 对象注释                              |

### DatabaseApi 契约变更（详见 `contracts/db-ipc.md`）

- 新增：`getDatabases(connectionId)`、`getFunctions(connectionId, database, schema)`、`getProcedures(connectionId, database, schema)`
- 变更（新增 `database` 参数）：`query`、`getSchemas`、`getTables`、`getColumns`

## 渲染进程本地类型（`src/renderer/src/types/database.ts`，UI 运行态，不持久化）

### ModuleKind（新增）

```text
'tables' | 'views' | 'functions' | 'procedures' | 'query'
```

### DatabaseCapability（新增，静态配置，按 `DatabaseType` 索引）

| 字段                   | 类型           | 说明                                                                                                       |
| ---------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `databaseLevelModules` | `ModuleKind[]` | 数据库节点下直接展示的模块（PostgreSQL: `['query']`）                                                      |
| `schemaLevelModules`   | `ModuleKind[]` | Schema 节点下展示的模块，决定渲染顺序（PostgreSQL: `['query','tables','views','functions','procedures']`） |

新增数据库类型时只需新增一条该类型的 `DatabaseCapability` 记录；不支持 Query/Functions/Procedures 的类型对应字段留空数组即可，通用树渲染逻辑无需改动（对应 FR-011/FR-012、SC-006）。

### 结构树运行态节点（扩展现有 `connectionStore` 的 `ConnectedConnection`）

```text
ConnectedConnection
├─ databases?: DatabaseInfo[]              // 服务器下的数据库清单
├─ databasesLoading? / databasesError?
├─ activeDatabase?: string                 // 默认取旧版 config.database，否则用户最近选中项
└─ databaseNodes?: Record<string, DatabaseNodeState>   // key = 数据库名

DatabaseNodeState
├─ expanded: boolean
├─ schemas?: SchemaInfo[] / schemasLoading? / schemasError?
└─ schemaNodes?: Record<string, SchemaNodeState>        // key = schema 名

SchemaNodeState
├─ expanded: boolean
└─ modules: Record<ModuleKind, ModuleState>             // 仅包含该数据库类型能力配置中列出的 key

ModuleState
├─ expanded: boolean
├─ items?: TableInfo[] | RoutineInfo[]                  // tables/views 复用现有 TableInfo；functions/procedures 用 RoutineInfo
├─ loading?: boolean
└─ error?: string
```

状态转换规则：

1. 节点默认 `expanded=false`，且不预取任何子级数据（FR-008 按需加载）。
2. 用户展开节点 → 若无缓存数据则置 `loading=true` 并发起对应 IPC 请求；成功后写入 `items`/`schemas`/`databases` 并清空 `loading`/`error`；失败则写入 `error`，`loading=false`，不影响同级或其他分支节点。
3. 断开服务器连接（FR-004）→ 清空该连接对应的 `databases`/`databaseNodes` 等全部运行态，不保留缓存；重新连接后按第 1 步重新开始。
4. 刷新操作（FR-005）→ 保持 `expanded` 状态不变，重新拉取该节点数据覆盖旧缓存。

### QueryTabState / OpenQueryTabPayload 扩展（`types/workspace.ts`）

| 字段       | 变更                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| `database` | 新增必填字段，标识该查询标签页作用的数据库                             |
| `schema`   | 新增可选字段，来自 Schema 级"Query"入口时携带，用于展示与默认 SQL 拼装 |

标签页去重键从"同连接"调整为"同连接 + 同数据库"（同一服务器下不同数据库的查询标签页不再合并）。
