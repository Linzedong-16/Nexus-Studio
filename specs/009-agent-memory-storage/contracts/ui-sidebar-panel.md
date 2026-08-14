# UI Contract: 对话历史面板

本文件定义 Code 模式左侧侧边栏中"对话历史"面板组件的接口约定、组件树和交互行为。

## 组件树

```
Sidebar (现有，不变)
└── SidebarNav (现有，不变)
    └── [Code 模式 menuGroups]
        ├── MenuGroup "actions"
        │   └── MenuItem "新建对话" (icon: MessageSquarePlus)
        ├── MenuGroup "对话历史"
        │   ├── headerActions: [新建对话, 收起全部]
        │   └── items: ConversationItem[]  (按 updatedAt 倒序)
        │       ├── ConversationItem (active, 当前选中)
        │       │   └── 右键菜单: [归档, 删除]
        │       ├── ConversationItem (active)
        │       └── ConversationItem (archived, 在"已归档"子分组中)
        └── [空状态]
            └── EmptyState: "暂无对话记录" + "新建对话" 按钮
```

## MenuGroup 约定

### Code 模式菜单组

```typescript
function buildCodeMenuGroups(
  conversations: Conversation[],
  activeId: string | null,
  onSelect: (id: string) => void,
  onNew: () => void,
  onArchive: (id: string) => void,
  onDelete: (id: string) => void
): MenuGroup[]
```

- 第 1 组 `actions`：`{ id: 'new-conversation', label: '新建对话', icon: MessageSquarePlus, onClick: onNew }`
- 第 2 组 `对话历史`：
  - `headerActions`: `[新建对话图标, 收起全部图标]`
  - `items`: 每个活跃对话渲染为一个 `MenuItem`
    - `id`: `conversation-{conversationId}`
    - `label`: `conversation.title`
    - `path`: `null`（不导航，通过 onClick 选中）
    - `onClick`: `() => onSelect(conversationId)`
  - 子分组 `已归档`（当存在已归档对话时）：
    - `items`: 已归档对话的列表项
- 空状态（`conversations.length === 0`）：渲染 `EmptyState` 占位组件

## ConversationItem 行为约定

| 交互     | 行为                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| 左键点击 | 选中对话 → 加载消息历史到 Code 模式主区域 → 更新 `activeConversationId`       |
| 右键菜单 | 弹出上下文菜单，选项：`归档` `(active 时)` / `取消归档` (archived 时)、`删除` |
| 悬停     | 显示完整标题 tooltip（当标题被截断时）                                        |
| 选中态   | 高亮背景（`bg-sidebar-accent`），与 SidebarNav 现有 NavLink 激活态一致        |

## Store 接口约定

`conversationStore.ts` 扩展后的状态与方法：

```typescript
interface ConversationStoreState {
  // 数据
  conversations: Conversation[] // 对话索引列表（仅元数据）
  activeConversationId: string | null // 当前选中的对话 ID
  turns: ConversationTurn[] // 当前对话的消息回合（现有，保留）
  messagesLoading: boolean // 消息历史加载中

  // 对话管理
  loadConversationList: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  createConversation: () => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  archiveConversation: (id: string) => Promise<void>
  loadMessages: (id: string, offset?: number, limit?: number) => Promise<void>

  // Agent 交互（扩展现有）
  sendInstruction: (instruction: string) => Promise<void> // 增加 conversationId 自动关联
  confirmPendingToolCall: (approved: boolean) => Promise<void>

  // 恢复
  checkActiveRun: (id: string) => Promise<AgentRun | null>
}
```

## 模式配置变更

`src/renderer/src/config/modes.tsx` 中 Code 模式：

- **Before**: `menuGroups: buildPlaceholderMenuGroups()` → 硬编码"任务列表-示例项目"
- **After**: `menuGroups: buildCodeMenuGroups()` → 动态渲染对话历史，通过 `useConversationStore` 获取数据

## 渲染约束

- 所有文件 I/O 通过 IPC → Service → Store 链路（宪法 I/III）
- 对话列表项不包含消息正文（仅元数据），消息按需加载
- 滚动性能：列表使用 CSS `overflow-y: auto` + 硬件加速，不引入额外虚拟滚动库（数据量在可控范围内）
