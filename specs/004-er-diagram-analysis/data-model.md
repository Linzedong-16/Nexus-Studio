# 数据模型：ER 图分析

**输入**：[spec.md](./spec.md) 的 Key Entities · [research.md](./research.md) 的 R-005/R-006/R-008

本文档描述本功能涉及的数据结构，按"跨进程共享类型 → 渲染进程状态类型 → 关系与派生规则"分层组织。类型最终落地位置见各节标注的文件路径。

---

## 一、跨进程共享类型（`src/renderer/src/types/ipc.ts`）

这些类型由主进程（驱动实现、IPC 处理器）与渲染进程（Service、Store）共同引用，是"数据库里实际有什么"的忠实描述，不包含任何图形渲染库的概念。

### ForeignKeyInfo（外键关系）

对应 spec 的「外键关联关系」实体。

| 字段             | 类型       | 说明                                                      |
| ---------------- | ---------- | --------------------------------------------------------- |
| `constraintName` | `string`   | 外键约束名称，作为 ER 图连线的唯一标识                    |
| `sourceSchema`   | `string`   | 源表（持有外键的表）所属 schema                           |
| `sourceTable`    | `string`   | 源表名                                                    |
| `sourceColumns`  | `string[]` | 源表外键列名，按序号排列                                  |
| `targetSchema`   | `string`   | 目标表（被引用的表）所属 schema                           |
| `targetTable`    | `string`   | 目标表名                                                  |
| `targetColumns`  | `string[]` | 目标表被引用列名，按序号排列（通常是主键）                |
| `updateRule`     | `string`   | 外键更新规则（CASCADE / SET NULL / NO ACTION / RESTRICT） |
| `deleteRule`     | `string`   | 外键删除规则                                              |

校验规则：`sourceColumns.length === targetColumns.length`（由数据库约束天然保证，驱动层按 `ordinal_position` 聚合后不需要再做额外校验）。

### ErDiagramTable（表 + 列，为 ER 分析场景合并返回）

对应 spec 的「表实体」实体，是 `TableInfo` 与其 `ColumnInfo[]` 的合并视图，避免渲染层再做二次拼装。

| 字段       | 类型                | 说明                                                                   |
| ---------- | ------------------- | ---------------------------------------------------------------------- |
| `schema`   | `string`            | 所属 schema                                                            |
| `name`     | `string`            | 表名                                                                   |
| `type`     | `'table' \| 'view'` | 复用现有 `TableInfo.type` 语义                                         |
| `comment?` | `string`            | 表注释                                                                 |
| `columns`  | `ColumnInfo[]`      | 复用现有 `ColumnInfo`（含 `isPrimaryKey`），按 `ordinal_position` 排序 |

唯一标识规则：`schema + '.' + name`（同名表可能出现在不同 schema，见 spec Assumptions），下文所有"表 ID"均指这个组合键。

### ErDiagramData（getErDiagramData 的返回整体）

| 字段          | 类型               | 说明                                       |
| ------------- | ------------------ | ------------------------------------------ |
| `tables`      | `ErDiagramTable[]` | 目标数据库下所有非系统 schema 的表（含列） |
| `foreignKeys` | `ForeignKeyInfo[]` | 目标数据库下所有非系统 schema 的外键关系   |

### DatabaseApi 新增方法

```typescript
getErDiagramData(
  connectionId: string,
  database: string,
  schemas: string[]
): Promise<ErDiagramData>
```

`schemas` 由调用方（渲染进程）传入——复用已有的 `getSchemas(connectionId, database)` 结果（该方法已排除 `pg_catalog`/`information_schema`/`pg_toast%`），驱动层不再重复做排除逻辑，避免"哪些 schema 算系统 schema"的判断逻辑出现两份实现。

---

## 二、主进程内部类型（`src/main/db/core/IDatabaseDriver.ts` 等）

不新增独立类型，直接复用第一节的 `ErDiagramData`/`ForeignKeyInfo`/`ErDiagramTable`（该文件本就 `import type { ... } from '../../../renderer/src/types/ipc'`，与现有 `ColumnInfo` 等类型的引用方式一致）。

新增接口方法（可选能力，语义同 `getRoles?`/`getFunctions?`）：

```typescript
/** 获取指定数据库下所有可见 schema 的表结构与外键关系（用于 ER 图分析）；不支持该能力的驱动可不实现 */
getErDiagramData?(database: string, schemas: string[]): Promise<ErDiagramData>
```

---

## 三、渲染进程运行态类型

### 3.1 ErAnalysisTabState（`src/renderer/src/types/workspace.ts`）

新增 `WorkspaceTab.state` 的第四种变体，与 `QueryTabState`/`TableTabState` 同级：

| 字段             | 类型     | 说明                                  |
| ---------------- | -------- | ------------------------------------- |
| `connectionId`   | `string` | 目标连接                              |
| `connectionName` | `string` | 目标连接名称（用于标签页标题/面包屑） |
| `database`       | `string` | 目标数据库                            |

`WorkspaceTabType` 扩展为 `'connection' \| 'query' \| 'table' \| 'er-analysis'`。

去重规则（对应 FR-009）：与 `openQueryTab`/`openTableTab` 一致的模式——`openErAnalysisTab` 在新建前先查找是否存在 `type === 'er-analysis' && state.connectionId === x && state.database === y` 的标签页，存在则 `activateTab` 复用，不存在才 `push` 新标签页。

### 3.2 ERTableNodeData / ER 图形层类型（`src/renderer/src/components/er/types.ts`）

不进入 `ipc.ts`（见 research.md R-006）。

| 字段                    | 类型           | 说明                                                                                                                                                                       |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tableId`               | `string`       | `schema.name` 组合键，供节点/连线互相引用                                                                                                                                  |
| `schema`                | `string`       | 所属 schema（多 schema 场景下节点头部展示 `schema.table`）                                                                                                                 |
| `tableName`             | `string`       | 表名                                                                                                                                                                       |
| `columns`               | `ColumnInfo[]` | 直接复用 `ErDiagramTable.columns`                                                                                                                                          |
| `comment?`              | `string`       | 表注释                                                                                                                                                                     |
| `foreignKeyColumnNames` | `Set<string>`  | 该表中作为外键的列名集合，驱动"外键列显示链接图标"的渲染判断（来自 `foreignKeys[].sourceColumns` 按 `tableId` 聚合而来，构建时一次性计算，避免节点渲染时重复遍历全部外键） |

`ERTableNodeData` 作为 React Flow 的 `Node<ERTableNodeData>['data']`；连线 `Edge` 直接使用 `ForeignKeyInfo` 的必要字段（`id = constraintName`, `source = sourceTableId`, `target = targetTableId`），不再定义额外的 EREdgeData 类型，减少一层不必要的包装（对应"不引入无谓抽象"的实现原则）。

### 3.3 erStore 状态（`src/renderer/src/store/erStore.ts`，会话级，不持久化）

对应 research.md R-008 的拆分决策。

| 字段            | 类型                                                  | 说明                                               |
| --------------- | ----------------------------------------------------- | -------------------------------------------------- |
| `pickerOpen`    | `boolean`                                             | 侧边栏悬浮选择面板的开关状态（FR-004/FR-007）      |
| `nodePositions` | `Record<tabId, Record<tableId, {x:number;y:number}>>` | 每个 ER 分析标签页各自的节点拖拽位置缓存（FR-018） |
| `isLayouting`   | `Record<tabId, boolean>`                              | 每个标签页是否正在执行自动布局计算                 |

对应的 actions：`setPickerOpen(open)`、`setNodePositions(tabId, positions)`、`setLayouting(tabId, loading)`、`clearTabState(tabId)`（标签页关闭时清理，避免内存随标签页开关次数无限增长）。

---

## 四、关系与派生规则

```text
ErDiagramData
├── tables: ErDiagramTable[]  ──┐
│                                 ├─→ 渲染进程按 tableId 建索引 → Node<ERTableNodeData>[]
└── foreignKeys: ForeignKeyInfo[] ┘   （同时按 sourceTable 聚合出每个表的 foreignKeyColumnNames）
                                  │
                                  └─→ 渲染进程映射为 Edge[]（source/target 用 tableId，label 用 constraintName 缩写）
```

- **1 个 ER 分析标签页 = 1 个 `(connectionId, database)` 组合**：一个组合在同一时刻至多对应一个标签页（FR-009 去重）。
- **1 个 `ErDiagramTable` = 1 个 Node**：`tableId` 是 Node 的 `id`，同名表分属不同 schema 时天然不冲突。
- **1 个 `ForeignKeyInfo` = 1 条 Edge**：`constraintName` 是 Edge 的 `id`；若 `sourceTable`/`targetTable` 在当前 `tables` 集合中找不到对应 `tableId`（理论上不应发生，因为外键约束天然指向同库内的表），渲染层需忽略该条外键并可在开发环境下打印警告，而不是抛出运行时错误中断整个画布渲染。
- **空数据分支**：`tables.length === 0` → FR-014 空状态；`tables.length > 0 && foreignKeys.length === 0` → FR-015 网格布局 + 提示文案。

---

## 五、状态转换（ER 分析标签页生命周期）

```text
[未打开] --(FR-002/FR-007 触发)--> [创建/复用 Tab, loading=true]
   --(getErDiagramData 成功)--> [loaded：ERLayoutEngine 计算初始布局 → 渲染画布]
   --(getErDiagramData 失败)--> [error：展示可读错误 + 重试按钮]
[loaded] --(用户点击"自动布局"/FR-012 重新触发)--> [isLayouting=true] --(布局计算完成)--> [loaded，位置已更新]
[loaded] --(用户关闭 Tab)--> [erStore.clearTabState(tabId) 清理该 Tab 的位置缓存与布局态]
```

不存在"实时刷新"状态转换（对应 spec Assumptions：本期不要求自动感知数据库结构变更）。
