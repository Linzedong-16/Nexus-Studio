# Checklist

- [x] `ConversationReference` 类型定义在 `src/renderer/src/types/conversation.ts` 中，包含 id、type、label、detail、timestamp 字段
- [x] `conversationStore` 在 `src/renderer/src/store/conversationStore.ts` 中，提供 addReference、removeReference、clearReferences 操作
- [x] `addReference` 对同 id 引用去重（先移除旧引用再添加新引用）
- [x] `ServerNode` 在 Code 模式下右键显示 ContextMenu，包含"添加到对话"选项
- [x] `DatabaseNode` 在 Code 模式下右键显示 ContextMenu，包含"添加到对话"选项
- [x] `SchemaNode` 在 Code 模式下右键显示 ContextMenu，包含"添加到对话"选项
- [x] `ModuleGroup` 在 Code 模式下右键显示 ContextMenu，包含"添加到对话"选项
- [x] `TableNode` 在 Code 模式下右键显示 ContextMenu，包含"添加到对话"选项
- [x] `FileTreeNode` 在 Code 模式下右键显示 ContextMenu，包含"添加到对话"选项
- [x] Work 模式下各节点右键菜单不显示"添加到对话"选项
- [x] 点击"添加到对话"后，引用被正确添加到 conversationStore
- [x] `ConversationView` 组件渲染引用标签列表，每个标签有图标、类型名、名称、关闭按钮
- [x] `ConversationView` 无引用时显示空态引导提示
- [x] 点击引用标签的关闭按钮，引用从 conversationStore 中移除
- [x] `CodeHomePage` 使用 `ConversationView` 替代 `HomeSkeleton`
- [x] `tsc --noEmit -p tsconfig.node.json` 类型检查通过
- [x] `tsc --noEmit -p tsconfig.web.json` 类型检查通过
