# 契约：渲染进程 Store 与组件边界

对应 [data-model.md](../data-model.md) 三节；决策依据见 [research.md](../research.md) R-006/R-008/R-009。

## workspaceStore 新增契约

### 类型（`src/renderer/src/types/workspace.ts`）

```typescript
type WorkspaceTabType = 'connection' | 'query' | 'table' | 'er-analysis'

interface ErAnalysisTabState {
  connectionId: string
  connectionName: string
  database: string
}

interface OpenErAnalysisTabPayload {
  connectionId: string
  connectionName: string
  database: string
}
```

`WorkspaceTab['state']` 联合类型追加 `ErAnalysisTabState`。

### Action

```typescript
openErAnalysisTab(payload: OpenErAnalysisTabPayload): string // 返回 tabId
```

行为契约：

1. 在现有 `tabs` 中查找 `type === 'er-analysis' && state.connectionId === payload.connectionId && state.database === payload.database` 的标签页。
2. 若找到：调用 `activateTab(existing.id)`，返回 `existing.id`，**不**新建标签页（FR-009）。
3. 若未找到：新建 `WorkspaceTab`（`type: 'er-analysis'`，`title` 用 `${payload.database}` 或 `${payload.connectionName} · ${payload.database}`，`closable: true`，`state: payload`），`push` 后 `activateTab`，返回新 `id`。

FR-002（数据库节点下拉菜单）与 FR-007（悬浮面板确认）两条入口最终都调用这同一个 action，天然满足 FR-008"两入口最终呈现能力一致"。

## erStore 契约（新文件 `src/renderer/src/store/erStore.ts`）

不使用 `persist` 中间件（会话级状态，见 R-008）。

```typescript
interface ErStoreState {
  pickerOpen: boolean
  nodePositions: Record<string, Record<string, { x: number; y: number }>> // tabId -> tableId -> position
  isLayouting: Record<string, boolean> // tabId -> bool

  setPickerOpen(open: boolean): void
  setNodePositions(tabId: string, positions: Record<string, { x: number; y: number }>): void
  setLayouting(tabId: string, loading: boolean): void
  clearTabState(tabId: string): void
}
```

`clearTabState` 由 `workspaceStore.closeTab` 关闭 `er-analysis` 类型标签页时联动调用（组件层在 `ERDiagram` 卸载时的 `useEffect` cleanup 中调用，不要求 `workspaceStore` 反向依赖 `erStore`，保持两个 Store 单向解耦）。

## 组件 Props 契约（`src/renderer/src/components/er/`）

### `ERPickerPanel`（悬浮选择面板，侧边栏入口触发，FR-004~FR-007）

```typescript
// 无 props；内部读取 erStore.pickerOpen 控制显隐，读取 connectionStore 中已连接的连接列表
function ERPickerPanel(): JSX.Element
```

内部状态机（组件私有 `useState`，不进 Store，因为是一次性选择流程，关闭面板即可重置）：
`selectedConnectionId: string | null` → 选中后触发 `connectionStore.loadDatabases`（若未加载）→ 展示该连接的 `databases` → 选中 `database` 后调用 `workspaceStore.getState().openErAnalysisTab(...)` 并 `erStore.getState().setPickerOpen(false)`。

连接筛选（FR-005 的名称输入匹配）为纯前端字符串过滤已连接连接列表，不发起新 IPC。

### `ERDiagram`（标签页内容根组件，挂载于 `WorkspacePanel`）

```typescript
interface ERDiagramProps {
  tab: WorkspaceTab & { state: ErAnalysisTabState }
}
function ERDiagram(props: ERDiagramProps): JSX.Element
```

职责：调用 `queryService.getSchemas` → `queryService.getErDiagramData` → 转换为 `Node<ERTableNodeData>[]`/`Edge[]` → 交给 `ERLayoutEngine` 计算初始布局 → 渲染 `<ReactFlow>` 画布；处理 loading/error/empty 三态（FR-014/FR-016）。

### `ERTableNode`（React Flow 自定义节点）

```typescript
type ERTableNodeType = Node<ERTableNodeData>
function ERTableNode(props: NodeProps<ERTableNodeType>): JSX.Element
```

### `ERToolbar` / `ERMinimap`

```typescript
interface ERToolbarProps {
  onAutoLayout: () => void
  onExport: () => void
  isLayouting: boolean
}
function ERToolbar(props: ERToolbarProps): JSX.Element
```

`ERMinimap` 直接使用 `@xyflow/react` 提供的 `<MiniMap>`，不做自定义包装（无额外 props 契约）。

### `ERLayoutEngine`（纯函数模块，非 React 组件，`src/renderer/src/components/er/layout/ERLayoutEngine.ts`）

```typescript
async function computeLayout(
  nodes: Node<ERTableNodeData>[],
  edges: Edge[]
): Promise<Node<ERTableNodeData>[]> // 返回带 position 的节点数组
```

内部封装 `elkjs` 的 `org.eclipse.elk.layered` 调用，输入输出均为 React Flow 原生类型，不泄漏 ELK 的内部图结构给调用方——这是"封装解耦"的具体体现：更换布局引擎只需重写这一个模块。

## 侧边栏入口契约（`src/renderer/src/config/modes.tsx`）

新增一个 Work 模式侧边栏菜单项（`id: 'er-analysis'`），`onClick` 调用：

```typescript
useErStore.getState().setPickerOpen(true)
```

风格与现有 `'new-task'` 菜单项直接调用 `useWorkspaceStore.getState().addConnectionTab()` 一致（见 research.md R-009）。

## 数据库节点下拉菜单契约（`src/renderer/src/components/schema/DatabaseNode.tsx`）

将现有 `<button>` 包裹进 shadcn `DropdownMenu`（复用 `WorkspaceTabs.tsx` 已验证的 `DropdownMenu`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuTrigger` 用法），新增菜单项：

```tsx
<DropdownMenuItem
  onSelect={() => {
    useWorkspaceStore.getState().openErAnalysisTab({
      connectionId,
      connectionName,
      database: database.name
    })
  }}
>
  ER 分析
</DropdownMenuItem>
```

原有左键点击展开/激活数据库节点的行为（`handleClick`）保持不变，仅在其外层追加下拉菜单触发能力，两者不冲突（点击行为通常绑定到 `DropdownMenuTrigger asChild` 包裹的原按钮，展开与菜单弹出可共存，具体触发时机——单击展开节点还是单击弹出菜单——在实现阶段按 shadcn `DropdownMenu` 默认行为验证，若冲突则参考 `WorkspaceTabs.tsx` 中"右键弹出菜单，左键正常触发行为"的既有区分方式调整为右键触发，但契约层面菜单入口本身的存在与"ER 分析"菜单项行为不变）。
