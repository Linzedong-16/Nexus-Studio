# Plan: Tab 页固定（Pin）功能

## 摘要

为 Work 工作区标签页实现固定（Pin）功能，对标 VSCode：

- 右键点击标签页弹出上下文菜单，提供「固定 / 取消固定」选项
- 固定后的标签页在「关闭所有标签页」快捷键操作时保留
- 固定标签页显示 Pin 图标以区分

## 当前状态分析

### 现有架构

| 文件                                                                                                                                | 角色                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [types/workspace.ts](file:///d:/coding/project/desktop/DB-client/src/renderer/src/types/workspace.ts)                               | 定义 `WorkspaceTab` 接口，含 `closable: boolean`，无 `pinned` 字段   |
| [store/workspaceStore.ts](file:///d:/coding/project/desktop/DB-client/src/renderer/src/store/workspaceStore.ts)                     | Zustand 状态管理，`closeAllTabs()` 清空 **全部** 标签页，无 pin 逻辑 |
| [components/work/WorkspaceTab.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/work/WorkspaceTab.tsx)   | 单个标签页渲染，无右键菜单，无 pin 图标                              |
| [components/work/WorkspaceTabs.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/work/WorkspaceTabs.tsx) | 标签栏容器，无右键菜单传递                                           |
| [lib/keybinding/actionRegistry.ts](file:///d:/coding/project/desktop/DB-client/src/renderer/src/lib/keybinding/actionRegistry.ts)   | `workspace.closeAllTabs` 直接调用 `closeAllTabs()`                   |

### 关键发现

1. **无 context-menu 组件**：项目仅有 `@radix-ui/react-slot` 一个 Radix 包，缺少 `@radix-ui/react-context-menu`
2. **`closeAllTabs` 无过滤**：直接设置 `tabs: []`，不区分 pinned 状态
3. **`closeOtherTabs` 同样无过滤**：只保留当前 tab，不检查 pinned
4. **标签页通过 `@dnd-kit/sortable` 实现拖拽**：右键菜单不能与拖拽事件冲突

## 变更方案

### 1. 新增依赖

安装 `@radix-ui/react-context-menu`：

```bash
pnpm add @radix-ui/react-context-menu
```

### 2. 新增文件：`src/renderer/src/components/ui/context-menu.tsx`

创建 shadcn/ui 风格的 ContextMenu 组件，遵循项目现有 UI 组件模式（参考 [dropdown-menu.tsx](file:///d:/coding/project/desktop/DB-client/src/renderer/src/components/ui/dropdown-menu.tsx) 的写法）：

```tsx
// 导出 ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator
```

### 3. 修改 `src/renderer/src/types/workspace.ts`

**`WorkspaceTab` 接口**新增字段：

```ts
pinned: boolean // 是否固定，默认 false
```

**`WorkspaceState` 接口**新增方法签名：

```ts
/** 切换标签页固定状态 */
togglePin: (id: string) => void
```

### 4. 修改 `src/renderer/src/store/workspaceStore.ts`

#### 4.1 新增 `togglePin` 方法

```ts
togglePin: (id) => {
  set((state) => ({
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
  }))
}
```

#### 4.2 修改 `closeAllTabs` 方法

过滤掉 pinned 标签页，只关闭未固定的：

```ts
closeAllTabs: () => {
  set((state) => {
    const pinnedTabs = state.tabs.filter((t) => t.pinned)
    for (const t of state.tabs) {
      if (t.type === 'er-analysis' && !t.pinned) useErStore.getState().clearTabState(t.id)
    }
    return {
      tabs: pinnedTabs,
      activeTabId: pinnedTabs[0]?.id ?? null
    }
  })
}
```

#### 4.3 修改 `closeOtherTabs` 方法

保留当前 tab 和所有 pinned tab：

```ts
closeOtherTabs: (id) => {
  set((state) => {
    const keep = state.tabs.find((t) => t.id === id)
    const pinned = state.tabs.filter((t) => t.id !== id && t.pinned)
    if (!keep) return state
    for (const t of state.tabs) {
      if (t.id !== id && !t.pinned && t.type === 'er-analysis')
        useErStore.getState().clearTabState(t.id)
    }
    return {
      tabs: [keep, ...pinned],
      activeTabId: keep.id
    }
  })
}
```

#### 4.4 新建标签页时默认 `pinned: false`

`openQueryTab`、`openTableTab`、`openErAnalysisTab`、`addConnectionTab` 创建 tab 时加上 `pinned: false`。

#### 4.5 持久化 `pinned` 状态

`sanitizeForPersist` 无需修改（`pinned` 是持久化属性，不应被剥离）。

### 5. 修改 `src/renderer/src/components/work/WorkspaceTab.tsx`

#### 5.1 添加 Pin 图标

当 `tab.pinned === true` 时，在标题前显示一个缩小的 Pin 图标（`Pin` from lucide-react），说明该标签页已固定。

#### 5.2 添加右键菜单

用 `ContextMenu` + `ContextMenuTrigger` 包裹整个标签页：

```tsx
<ContextMenu>
  <ContextMenuTrigger>{/* 现有标签页内容 */}</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onClick={handleTogglePin}>
      <Pin /> {tab.pinned ? '取消固定' : '固定'}
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

#### 5.3 新增 `onTogglePin` 回调 prop

```ts
interface WorkspaceTabProps {
  // ...existing
  onTogglePin: () => void
}
```

### 6. 修改 `src/renderer/src/components/work/WorkspaceTabs.tsx`

从 store 取出 `togglePin`，传递给每个 `WorkspaceTab`：

```tsx
const togglePin = useWorkspaceStore((s) => s.togglePin)

// ...
<WorkspaceTab
  // ...existing props
  onTogglePin={() => togglePin(tab.id)}
/>
```

## 行为定义

| 操作              | 未固定标签页                   | 已固定标签页                       |
| ----------------- | ------------------------------ | ---------------------------------- |
| 点击 × 关闭       | 关闭                           | 关闭                               |
| 中键点击关闭      | 关闭                           | 关闭                               |
| Ctrl+W 关闭       | 关闭                           | 关闭                               |
| 关闭其他          | 关闭（保留当前 + 所有 pinned） | 关闭其他（保留当前 + 所有 pinned） |
| 关闭所有 (快捷键) | 关闭                           | **保留**                           |
| 右键菜单          | 显示「固定」                   | 显示「取消固定」                   |
| Pin 图标          | 不显示                         | 显示 📌                            |

## 验证步骤

1. `pnpm run typecheck:web` — 0 错误
2. `pnpm run lint` — 0 错误 0 警告
3. `pnpm run format` — 格式一致
4. 手动测试：
   - 右键标签页 → 出现「固定」菜单项
   - 点击「固定」→ 标签页显示 Pin 图标，菜单变为「取消固定」
   - 再打开几个普通标签页 → 按快捷键关闭所有 → 仅固定标签页保留
   - 右键固定标签页 →「取消固定」→ Pin 图标消失 → 关闭所有时该标签页被关闭
   - 中键点击固定标签页 → 正常关闭
   - 「关闭其他」→ 固定标签页被保留
