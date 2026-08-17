# Phase 1 Data Model: 内存占用优化

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

本文档基于 spec.md 的 Key Entities 章节，将业务实体映射为具体的 TypeScript 类型变更。所有变更均为在既有类型上新增可选字段或新增独立类型，不破坏现有字段的语义与既有调用点的兼容性。

## 1. 查询结果（Query Result）

**对应文件**：`src/renderer/src/types/ipc.ts`（渲染进程侧类型）；主进程侧 `PostgreSQLDriver.ts`/`MySQLDriver.ts` 内部构造的 `QueryResult` 对象需同步返回新字段。

```ts
export interface QueryResult {
  fields: QueryField[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  /** 本次结果是否因超过预览行数上限（默认 5 万行）被截断 */
  truncated: boolean
}
```

**字段说明**：

- `rowCount`：语义不变，仍表示"数据库本次查询实际返回的总行数"——截断发生时，`rowCount` 记录的是截断前的真实总行数，`rows.length` 记录的是截断后实际展示的行数（≤ `rowCount`）。这使渲染层可以直接展示"已展示 X / 共 Y 行"（对应 FR-002）。
- `truncated`：新增必填字段（非可选），因为无论是否发生截断都需要显式返回该状态，避免渲染层用 `rows.length === rowCount` 这种隐式推断（`COUNT` 类聚合查询本身 `rowCount` 就等于 1，隐式推断容易产生歧义，显式字段更安全，也符合 Edge Cases 第一条对聚合查询的保护）。

**校验规则**：`truncated === true` 当且仅当 `rowCount > MAX_RESULT_ROWS`（常量定义于 `src/main/db/core/resultLimits.ts`，默认 `50_000`）。

**状态转换**：查询结果为一次性快照，不存在跨状态转换；每次执行查询都会产生一个全新的 `QueryResult` 对象整体替换旧值。

## 2. 查询标签页（Workspace Tab）

**对应文件**：`src/renderer/src/types/workspace.ts`（`WorkspaceTab` 接口）

```ts
export interface WorkspaceTab {
  id: string
  type: WorkspaceTabType
  title: string
  closable: boolean
  pinned: boolean
  state: QueryTabState | TableTabState | /* 既有其他 state 类型 */ unknown
  result?: QueryResult
  error?: string
  loading: boolean
  /** 上次被设为激活标签页的时间戳（ms）；非激活释放扫描据此判断闲置时长 */
  lastActiveAt?: number
  /** 结果是否因非激活超时被系统主动释放（区别于"从未执行过查询"的 undefined） */
  resultReleased?: boolean
}
```

**字段说明**：

- `lastActiveAt`：标签页创建时初始化为创建时刻的时间戳；每次通过 `activateTab(id)` 被切换为激活标签页时刷新；每次 `setQueryResult`（写入新结果）时也刷新（避免"刚执行完查询、还没被系统认定为激活"这一时间窗口内被误判为闲置）。
- `resultReleased`：初始为 `undefined`（表示"尚未发生过释放，可能从未查询过，也可能结果仍然有效"）；被非激活释放扫描命中后设为 `true`；用户重新执行查询、结果被重新写入后（`setQueryResult`）重置为 `false`。

**校验规则**：

- `resultReleased === true` 时，`result` 必须为 `undefined`（释放动作是"清空 result 并设置标记"的原子操作，不允许两者状态不一致）。
- 当前激活标签页（`activeTabId === tab.id`）任意时刻 `resultReleased` 不应为 `true`——非激活释放扫描逻辑必须显式跳过当前激活标签页（对应 FR-005 / Acceptance Scenario 3）。

**状态转换**：

```text
（创建，result=undefined, resultReleased=undefined）
   ↓ 用户执行查询 setQueryResult
（result=有值, resultReleased=false, lastActiveAt=now）
   ↓ 非激活超过 10 分钟且非当前激活标签页（定时扫描命中）
（result=undefined, resultReleased=true）
   ↓ 用户重新执行查询 setQueryResult
（result=有值, resultReleased=false, lastActiveAt=now）
```

## 3. 数据库连接资源（Database Connection Resource）

本实体在代码中始终以"隐式资源"形式存在（`pools: Map<string, Pool>` 的一个条目），本功能不新增独立的 TypeScript 类型来表示它，而是新增操作它的方法签名。

**对应文件**：`src/main/db/core/IDatabaseDriver.ts`

```ts
export interface IDatabaseDriver {
  // ...既有方法保持不变...

  /**
   * 释放指定数据库对应的后台连接池；管理数据库（管理连接）不受此方法影响
   * 数据库当前无任何活跃引用时由上层（DriverManager/渲染层）判定后调用
   */
  releaseDatabase?(database: string): Promise<void>
}
```

**对应文件**：`src/main/db/core/DriverManager.ts`

```ts
async releaseDatabase(connectionId: string, database: string): Promise<void>
```

**校验规则**：

- 调用 `releaseDatabase` 时若目标 `database` 等于该连接的管理数据库（`managementKey`/管理连接标识），静默跳过，不抛出异常（因为管理连接是浏览操作的公共依赖，不应被单个标签页关闭动作影响）。
- 释放后若再次通过 `getPool(database)` 访问同一数据库，驱动应按现有"按需创建"逻辑自动重建连接池，无需任何额外的"重新连接"方法（对应 FR-009）。

## 4. 对话（Conversation）与对话轮次提示（Conversation Length Notice）

**对应文件**：`src/renderer/src/store/conversationStore.ts`——**不修改**（`turns: ConversationTurn[]` 已完整支持 `turns.length` 读取，见 research.md 第 5 节）。

对话轮次提示不作为持久化实体或 store 字段存在，而是渲染层的纯派生 UI 状态：

```ts
// 渲染组件内部派生，不写入任何 store
const CONVERSATION_LENGTH_NOTICE_THRESHOLD = 40
const shouldShowLengthNotice = turns.length >= CONVERSATION_LENGTH_NOTICE_THRESHOLD
```

**校验规则**：阈值判断以"当前选中对话"的 `turns.length` 为准，切换到不同对话时该派生值自动随 `turns` 引用变化重新计算，天然满足 FR-013（"轮次统计针对每个对话单独计算"），无需额外实现。

## 5. 新增共享常量汇总

| 常量                                   | 默认值           | 定义位置                                   | 对应需求 |
| -------------------------------------- | ---------------- | ------------------------------------------ | -------- |
| `MAX_RESULT_ROWS`                      | `50_000`         | `src/main/db/core/resultLimits.ts`         | FR-001   |
| `INACTIVE_RELEASE_MS`                  | `10 * 60 * 1000` | `src/renderer/src/store/workspaceStore.ts` | FR-004   |
| `CONVERSATION_LENGTH_NOTICE_THRESHOLD` | `40`             | 对话面板组件（渲染层）                     | FR-010   |

以上三个常量均不提供用户配置入口（spec.md Assumptions 明确要求），因此不建模为可持久化的配置项类型，直接作为源码内的模块级常量。
