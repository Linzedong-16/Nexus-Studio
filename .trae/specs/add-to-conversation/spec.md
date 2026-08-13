# 上下文菜单"添加到对话" Spec

## Why

当前 Code 模式下的 ExplorerPanel（连接树/文件树）不支持右键上下文菜单，用户无法将文件或数据库对象以引用形式添加到对话中。需要实现类似 Trae 的"添加到对话"交互，让用户能在对话中引用文件/数据库连接，提升 AI 协作体验。

## What Changes

- 新增 `conversationStore`，管理对话引用（ConversationReference）状态
- 为 SchemaTree 各节点（ServerNode、DatabaseNode、SchemaNode、ModuleGroup、TableNode）添加右键 ContextMenu，包含"添加到对话"选项
- 为 FileTreeNode 的现有 ContextMenu 添加"添加到对话"选项
- 仅在 Code 模式下显示"添加到对话"菜单项（Work 模式不显示）
- Code 模式页面从纯占位骨架改为对话视图，渲染引用标签列表

## Impact

- Affected specs: 无（新功能）
- Affected code:
  - 新增 `src/renderer/src/store/conversationStore.ts`
  - 新增 `src/renderer/src/types/conversation.ts`
  - 修改 `src/renderer/src/components/schema/ServerNode.tsx`
  - 修改 `src/renderer/src/components/schema/DatabaseNode.tsx`
  - 修改 `src/renderer/src/components/schema/SchemaNode.tsx`
  - 修改 `src/renderer/src/components/schema/ModuleGroup.tsx`
  - 修改 `src/renderer/src/components/schema/TableNode.tsx`
  - 修改 `src/renderer/src/components/file/FileTreeNode.tsx`
  - 修改 `src/renderer/src/components/work/ExplorerPanel.tsx`（传递 mode 感知）
  - 修改 `src/renderer/src/pages/code/CodeHomePage.tsx`
  - 新增 `src/renderer/src/components/code/ConversationView.tsx`

## ADDED Requirements

### Requirement: ConversationReference 类型定义

系统 SHALL 定义 `ConversationReference` 类型，包含 id、type、label、detail、icon、timestamp 字段。

#### Scenario: 类型定义

- **WHEN** 定义 ConversationReference 类型
- **THEN** 包含 `id: string`、`type: 'file' | 'connection' | 'database' | 'schema' | 'table' | 'moduleGroup'`、`label: string`、`detail?: string`、`timestamp: number` 字段

### Requirement: Conversation Store

系统 SHALL 提供 `conversationStore`（Zustand），管理 references 数组和 `addReference`、`removeReference`、`clearReferences` 操作。

#### Scenario: 添加引用

- **WHEN** 调用 `addReference(ref)`
- **THEN** 引用被追加到 references 数组末尾，同 id 引用去重（先移除旧引用再添加）

#### Scenario: 移除引用

- **WHEN** 调用 `removeReference(id)`
- **THEN** 对应 id 的引用从 references 中移除

#### Scenario: 清空引用

- **WHEN** 调用 `clearReferences()`
- **THEN** references 数组被清空

### Requirement: SchemaTree 节点右键菜单

系统 SHALL 为 SchemaTree 的以下节点添加右键 ContextMenu，包含"添加到对话"选项（仅在 Code 模式下显示）：

- ServerNode（连接节点）
- DatabaseNode（数据库节点）
- SchemaNode（Schema 节点）
- ModuleGroup（Tables/Views/Functions/Procedures 分组）
- TableNode（表/视图节点）

#### Scenario: Code 模式下右键 SchemaTree 节点

- **WHEN** 用户在 Code 模式下右键点击 ServerNode
- **THEN** 显示 ContextMenu，包含"添加到对话"选项
- **WHEN** 点击"添加到对话"
- **THEN** 该连接以引用形式添加到 conversationStore

#### Scenario: Work 模式下右键 SchemaTree 节点

- **WHEN** 用户在 Work 模式下右键点击 ServerNode
- **THEN** 不显示 ContextMenu（或显示不含"添加到对话"的菜单）

### Requirement: FileTreeNode 右键菜单扩展

系统 SHALL 在 FileTreeNode 的现有 ContextMenu 中添加"添加到对话"选项（仅在 Code 模式下显示）。

#### Scenario: Code 模式下右键文件节点

- **WHEN** 用户在 Code 模式下右键点击文件节点
- **THEN** ContextMenu 中显示"添加到对话"选项
- **WHEN** 点击"添加到对话"
- **THEN** 该文件以引用形式添加到 conversationStore

#### Scenario: Work 模式下右键文件节点

- **WHEN** 用户在 Work 模式下右键点击文件节点
- **THEN** ContextMenu 中不显示"添加到对话"选项

### Requirement: Code 模式对话引用视图

系统 SHALL 在 Code 模式页面的右侧内容区渲染对话引用视图，包含：

- 顶部标题区域
- 引用标签列表（每个引用显示为可关闭的标签，带图标和名称）
- 底部输入框区域（骨架占位）

#### Scenario: 无引用时的空态

- **WHEN** conversationStore 中 references 为空
- **THEN** 显示空态引导提示

#### Scenario: 有引用时显示引用标签

- **WHEN** conversationStore 中 references 不为空
- **THEN** 每个引用显示为标签，包含图标、类型名、名称，右侧有关闭按钮
- **WHEN** 点击关闭按钮
- **THEN** 该引用从 conversationStore 中移除

### Requirement: 模式感知

系统 SHALL 通过 `useLocation` 判断当前是否为 Code 模式，仅在 Code 模式下显示"添加到对话"菜单项。

#### Scenario: 模式判断

- **WHEN** 当前路径以 `/code` 开头
- **THEN** 各节点 ContextMenu 中显示"添加到对话"选项
- **WHEN** 当前路径不以 `/code` 开头
- **THEN** 各节点 ContextMenu 中不显示"添加到对话"选项
