# Contract: 数据库类型能力配置（可扩展性契约）

范围：`src/renderer/src/config/databaseCapabilities.ts`（新增）。这是本特性满足"PostgreSQL 专属模块隔离 + 未来数据库类型可扩展"（FR-010～FR-012）的核心可扩展点，供结构树组件（`components/schema/`）与查询入口消费。

## 契约形状

```text
export interface DatabaseCapability {
  /** 数据库节点下直接展示的模块（如 PostgreSQL 的快捷 Query 入口） */
  databaseLevelModules: ModuleKind[]
  /** Schema 节点下展示的模块，数组顺序即渲染顺序 */
  schemaLevelModules: ModuleKind[]
}

export const DATABASE_CAPABILITIES: Record<DatabaseType, DatabaseCapability>
```

## 当前取值

| DatabaseType | databaseLevelModules | schemaLevelModules                                        |
| ------------ | -------------------- | --------------------------------------------------------- |
| `postgresql` | `['query']`          | `['query', 'tables', 'views', 'functions', 'procedures']` |

## 扩展规则（新增数据库类型时必须遵守）

1. 只需在 `DATABASE_CAPABILITIES` 中新增一条以该 `DatabaseType` 为键的记录，**不得**修改已存在类型（如 `postgresql`）的记录。
2. 若新类型不支持 Functions/Procedures/Query 中的某一项，对应模块直接从数组中省略，不使用空占位或禁用态节点（对应 FR-011）。
3. 通用树渲染组件（`SchemaNode`/`DatabaseNode`）只允许通过遍历 `schemaLevelModules`/`databaseLevelModules` 数组来决定渲染哪些子节点，**不得**在组件内出现 `if (type === 'postgresql')` 之类的硬编码分支（对应 FR-012、SC-006 的验证方式：新增类型的改动只落在本配置文件与该类型自己的适配器/驱动内）。
4. 若某模块出现在能力配置中，则对应的驱动方法（如 `getFunctions`/`getProcedures`）必须在该类型的驱动中实现；反之，未出现在能力配置中的模块，驱动可不实现（可选接口成员，见 `contracts/db-ipc.md`）。两侧以 `DatabaseType` 保持一致，避免"UI 显示但驱动报错"或"驱动支持但 UI 不显示"的不一致。

## 验证方式（对应 SC-006）

新增一种数据库类型的验收标准：diff 中除 `DATABASE_CAPABILITIES` 新增记录、该类型自身的驱动文件外，不触及 `components/schema/` 下任何既有文件与 PostgreSQL 驱动文件。
