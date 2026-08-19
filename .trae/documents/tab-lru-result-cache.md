# Tab 查询结果 LRU 缓存优化方案

## 摘要

将 `tab.result` 从 Zustand store 中剥离，改为模块级 `LRUCache`（容量 3），用 `resultVersion` 版本计数器驱动 Zustand 响应式更新。被踢 Tab 自动标记 `resultReleased`，UI 显示"结果已回收，点击重新执行"。保留现存的 10 分钟闲置超时机制作为第二道防线。

---

## 当前状态分析

### 现状

- `result` 直接挂在 `WorkspaceTab.result` 上，存在 Zustand store 中
- Zustand 的 `persist` 中间件通过 `sanitizeForPersist` 清空 `result` 后持久化（仅存元数据）
- 闲置释放机制：每 60 秒扫描，非激活 Tab 的 `result` 超过 10 分钟不访问则置 null
- 问题：打开 N 个 Tab 各自执行查询后，N 份 `result` 全部常驻 JS 堆内存，10 分钟内不释放

### 所有读写 `tab.result` 的位置

| 文件 | 行号 | 操作 | 说明 |
|---|---|---|---|
| `workspaceStore.ts` | 95-126 | 写 | `sanitizeForPersist` 将 `result` 置 null |
| `workspaceStore.ts` | 334-349 | 写 | `setQueryResult` 写入 `result`/`error`/`loading`/`lastActiveAt`/`resultReleased` |
| `workspaceStore.ts` | 584-597 | 写 | 闲置释放定时器将超时 Tab 的 `result` 置 null |
| `QueryPanel.tsx` | 71 | 读 | `tab.loading` guard |
| `QueryPanel.tsx` | 132 | 读 | `tab.resultReleased` 判定显示"已释放"提示 |
| `QueryPanel.tsx` | 142 | 读 | `<ResultTable result={tab.result ?? null}>` |
| `QueryPanel.tsx` | 143 | 读 | `<ResultTable error={tab.error}>` |
| `QueryPanel.tsx` | 144 | 读 | `<ResultTable loading={tab.loading ?? false}>` |
| `DataBrowser.tsx` | 76 | 读 | `tab.result?.rows.length` 计算行数 |
| `DataBrowser.tsx` | 192 | 读 | `tab.result?.rows ?? []` 获取行数据 |
| `DataBrowser.tsx` | 234 | 读 | `tab.result` 获取完整 result 对象 |
| `DataBrowser.tsx` | 254-257 | 写 | `setQueryResult` 原地更新 result（编辑单元格后刷新） |
| `DataBrowser.tsx` | 394 | 读 | `tab.resultReleased` 判定显示"已释放"提示 |
| `DataBrowser.tsx` | 408 | 读 | `<ResultTable result={tab.result ?? null}>` |
| `DataBrowser.tsx` | 427 | 读 | `tab.result?.rows.length` 计算行数 |
| `workspace.ts` | 111 | 定义 | `result?: QueryResult \| null` 类型声明 |

---

## 方案设计

### 核心架构

```
┌─────────────────────────────────────────────────┐
│  Zustand store（持久化）                         │
│  tabs: WorkspaceTab[]  ← result 字段删除         │
│    resultVersion?: number  ← 新增：版本计数器    │
│    resultReleased?: boolean ← 保留               │
│    error?: string           ← 保留               │
│    loading?: boolean        ← 保留               │
│    lastActiveAt?: number    ← 保留               │
│                                                 │
│  ← partialize: sanitizeForPersist 清除 resultVersion │
└─────────────────────────────────────────────────┘
                      ↑ resultVersion 变化 → React 重渲染
┌─────────────────────────────────────────────────┐
│  模块级 LRUCache（纯内存，不持久化）               │
│  key: tabId (string)                            │
│  value: { result: QueryResult; error?: string }  │
│  max: 3                                         │
│  set() 返回被踢出的 key（用于同步 resultReleased）  │
└─────────────────────────────────────────────────┘
```

### 渲染层读取方式

```typescript
// 改前
const result = tab.result

// 改后
const resultVersion = tab.resultVersion
const cached = useMemo(
  () => resultCache.get(tab.id),
  [tab.id, resultVersion]
)
const result = cached?.result ?? null
const error = cached?.error ?? tab.error  // 优先读缓存中的 error
```

### LRU 踢出时同步 `resultReleased`

```typescript
setQueryResult: (id, result, error) => {
  const evicted = resultCache.set(id, { result: result ?? null, error })
  set((state) => ({
    tabs: state.tabs.map((t) => {
      if (t.id === id) {
        return {
          ...t,
          resultVersion: (t.resultVersion ?? 0) + 1,
          resultReleased: false,
          error: undefined,
          loading: false,
          lastActiveAt: Date.now()
        }
      }
      if (t.id === evicted) {
        return { ...t, resultReleased: true, resultVersion: (t.resultVersion ?? 0) + 1 }
      }
      return t
    }
  }))
}
```

### 10 分钟超时机制的改造

原逻辑：直接置 `result: null`。改为：从 `resultCache` 中删除对应条目 + bump `resultVersion` + 标记 `resultReleased`。

---

## 具体改动

### 1. `src/renderer/src/types/workspace.ts`

**`WorkspaceTab` 接口（第 94-118 行）**：

- 新增字段 `resultVersion?: number`（第 117 行之前）
- **保留** `result?: QueryResult | null`（兼容过渡期，后续可删除）

```typescript
export interface WorkspaceTab {
  // ... 现有字段 ...
  /** 查询结果版本号，每次 setQueryResult 时 +1，用于驱动 LRU 缓存重读 */
  resultVersion?: number
  /** 查询标签页的瞬时结果（不持久化）—— 过渡期保留，最终由 LRUCache 取代 */
  result?: QueryResult | null
  // ...
}
```

### 2. `src/renderer/src/store/workspaceStore.ts`

#### 2.1 新增 `LRUCache` 类（模块级，第 1 行之前）

```typescript
/** LRU 缓存，用于限制查询结果数量 */
class LRUCache<K, V> {
  #map = new Map<K, V>()
  #max: number

  constructor(max: number) {
    this.#max = max
  }

  get(key: K): V | undefined {
    const val = this.#map.get(key)
    if (val !== undefined) {
      this.#map.delete(key)
      this.#map.set(key, val)
    }
    return val
  }

  /** 返回被踢出的 key，无淘汰时返回 undefined */
  set(key: K, val: V): K | undefined {
    let evicted: K | undefined
    if (this.#map.has(key)) {
      this.#map.delete(key)
    } else if (this.#map.size >= this.#max) {
      evicted = this.#map.keys().next().value
      this.#map.delete(evicted!)
    }
    this.#map.set(key, val)
    return evicted
  }

  delete(key: K): boolean {
    return this.#map.delete(key)
  }

  has(key: K): boolean {
    return this.#map.has(key)
  }

  get size(): number {
    return this.#map.size
  }
}

/** 查询结果 LRU 缓存，最多保留 3 个 Tab 的结果 */
const resultCache = new LRUCache<string, { result: QueryResult | null; error?: string }>(3)
```

#### 2.2 `setQueryResult`（改造第 334-349 行）

```typescript
setQueryResult: (id, result, error) => {
  const evicted = resultCache.set(id, { result: result ?? null, error })
  set((state) => ({
    tabs: state.tabs.map((t) => {
      if (t.id === id) {
        return {
          ...t,
          resultVersion: (t.resultVersion ?? 0) + 1,
          resultReleased: false,
          error: undefined,
          loading: false,
          lastActiveAt: Date.now()
        }
      }
      if (evicted && t.id === evicted) {
        return {
          ...t,
          resultReleased: true,
          error: undefined,
          resultVersion: (t.resultVersion ?? 0) + 1
        }
      }
      return t
    }
  }))
}
```

#### 2.3 `sanitizeForPersist`（改造第 95-126 行）

新增对 `resultVersion` 的清除（值重置为 0）：

```typescript
function sanitizeForPersist(tabs: WorkspaceTab[]): WorkspaceTab[] {
  return tabs.map((tab) => {
    // ... 现有逻辑 ...
    return {
      ...tab,
      result: null,
      resultVersion: 0,   // ← 新增
      error: undefined,
      loading: false
    }
  })
}
```

#### 2.4 闲置释放定时器（改造第 584-597 行）

```typescript
setInterval(() => {
  const { tabs, activeTabId } = useWorkspaceStore.getState()
  const now = Date.now()
  let changed = false
  const nextTabs = tabs.map((t) => {
    if (t.id === activeTabId) return t
    if (t.type !== 'query' && t.type !== 'table') return t
    if (!resultCache.has(t.id)) return t                     // ← 改为检查 resultCache
    if (!t.lastActiveAt || now - t.lastActiveAt < INACTIVE_RELEASE_MS) return t
    changed = true
    resultCache.delete(t.id)                                  // ← 从缓存中删除
    return {
      ...t,
      resultVersion: (t.resultVersion ?? 0) + 1,             // ← 新增：触发重渲染
      resultReleased: true
    }
  })
  if (changed) useWorkspaceStore.setState({ tabs: nextTabs })
}, RELEASE_SCAN_INTERVAL_MS)
```

#### 2.5 `closeTab`（改造第 357-383 行）

关闭 Tab 时同步清理 resultCache：

```typescript
closeTab: (id) => {
  resultCache.delete(id)  // ← 新增
  // ... 现有逻辑保持不变 ...
}
```

### 3. `src/renderer/src/components/work/QueryPanel.tsx`

**改造所有 `tab.result` / `tab.error` 读取**（第 71, 132, 142, 143, 144 行）：

```typescript
export default function QueryPanel({ tab }: QueryPanelProps): React.JSX.Element {
  const state = tab.state as QueryTabState
  // ... 现有 hooks ...

  // ← 新增：从 LRU 缓存读取结果
  const resultVersion = tab.resultVersion
  const cached = useMemo(
    () => resultCache.get(tab.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.id, resultVersion]
  )
  const queryResult = cached?.result ?? null
  const queryError = cached?.error ?? undefined

  // 改：tab.loading → 不变（loading 仍在 store 中）
  // 改：tab.resultReleased → 不变

  return (
    // ...
    <ResultTable
      result={queryResult}           // 改：tab.result ?? null → queryResult
      error={queryError}             // 改：tab.error → queryError
      loading={tab.loading ?? false} // 不变
      // ... 其他 props 不变
    />
  )
}
```

**注意**：`resultCache` 需要从 `workspaceStore` 模块导入（需要 export）。

### 4. `src/renderer/src/components/work/DataBrowser.tsx`

**改造所有 `tab.result` 读取**（第 76, 192, 234, 254-257, 408, 427 行）：

```typescript
export default function DataBrowser({ tab }: DataBrowserProps): React.JSX.Element {
  const state = tab.state as TableTabState
  // ... 现有 hooks ...

  // ← 新增：从 LRU 缓存读取结果
  const resultVersion = tab.resultVersion
  const cached = useMemo(
    () => resultCache.get(tab.id),
    [tab.id, resultVersion]
  )
  const queryResult = cached?.result ?? null
}
```

将 `tab.result` 替换为 `queryResult`，`tab.result?.rows` 替换为 `queryResult?.rows`。

**`commitCellEdit` 中的 `setQueryResult` 调用（第 254-257 行）**：不需要改动，`setQueryResult` 内部已改为写 LRU 缓存。

---

## 验证步骤

1. `pnpm run typecheck` — 确保类型检查通过
2. `pnpm dev` — 启动应用验证
   - 打开 4 个表/查询 Tab，各执行查询
   - 观察第 4 个 Tab 查询后，最久未访问的 Tab 是否显示"结果已释放"
   - 切回被释放 Tab，确认显示"结果已释放以节省内存"并提供"重新执行"按钮
   - 等待 10 分钟后验证闲置超时仍生效
3. 关闭应用后重启，验证 Tab 元数据正常恢复，已释放结果不恢复

---

## 假设与决策

- **容量 3**：同时缓存 3 个 Tab 的查询结果，满足多数对比场景。如后续反馈不足，修改 `LRUCache(3)` 构造参数即可
- **保留 `result` 字段**：不做破坏性删除，类型层面保留 `result` 字段兼容过渡期
- **保留 10 分钟超时**：LRU 负责容量天花板，超时负责时间维度回收，两者互补不冲突
- **不导出 `resultCache` 给渲染层直接用**：统一通过 `resultVersion` 驱动 Zustand 响应式，避免渲染层绕过 store 直接操作缓存
- **`resultVersion` 初始值**：未设置时视为 `undefined`，`setQueryResult` 中以 `(t.resultVersion ?? 0) + 1` 处理首次写入