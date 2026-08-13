# Tasks

- [x] Task 1: 创建 ConversationReference 类型定义
  - [x] 新建 `src/renderer/src/types/conversation.ts`，定义 `ConversationReference`、`ReferenceType` 等类型

- [x] Task 2: 创建 conversationStore
  - [x] 新建 `src/renderer/src/store/conversationStore.ts`，使用 Zustand 管理 references 状态
  - [x] 实现 `addReference`、`removeReference`、`clearReferences` 操作
  - [x] 实现同 id 去重逻辑

- [x] Task 3: 为 SchemaTree 各节点添加右键菜单
  - [x] 创建 `src/renderer/src/components/code/AddToConversationMenuItem.tsx` 共享菜单项组件
  - [x] 修改 `ServerNode.tsx`，添加 ContextMenu（仅 Code 模式）
  - [x] 修改 `DatabaseNode.tsx`，添加 ContextMenu（仅 Code 模式）
  - [x] 修改 `SchemaNode.tsx`，添加 ContextMenu（仅 Code 模式）
  - [x] 修改 `ModuleGroup.tsx`，添加 ContextMenu（仅 Code 模式）
  - [x] 修改 `TableNode.tsx`，添加 ContextMenu（仅 Code 模式）

- [x] Task 4: 为 FileTreeNode 右键菜单添加"添加到对话"
  - [x] 修改 `FileTreeNode.tsx`，在 ContextMenu 中条件添加"添加到对话"选项

- [x] Task 5: 创建 Code 模式对话引用视图
  - [x] 新建 `src/renderer/src/components/code/ConversationView.tsx`
  - [x] 实现引用标签列表（带图标、名称、关闭按钮）
  - [x] 实现空态引导
  - [x] 实现底部输入框骨架

- [x] Task 6: 集成到 CodeHomePage
  - [x] 修改 `CodeHomePage.tsx`，替换 HomeSkeleton 为 ConversationView

- [x] Task 7: 类型检查验证
  - [x] 运行 `npx tsc --noEmit -p tsconfig.node.json` 确保通过
  - [x] 运行 `npx tsc --noEmit -p tsconfig.web.json` 确保通过

# Task Dependencies

- Task 2 依赖 Task 1
- Task 3、Task 4 依赖 Task 1、Task 2
- Task 5 依赖 Task 1、Task 2
- Task 6 依赖 Task 5
- Task 3 和 Task 4 可并行
- Task 3、Task 4、Task 5 可并行
